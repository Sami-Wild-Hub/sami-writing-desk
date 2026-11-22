import crypto from 'node:crypto';
import { createOutlineModel } from '../../src/lib/views/outline/model.js';
import { outlineConfig } from '../../src/lib/views/outline/config.js';
import { pack, unpack } from '../../src/lib/views/outline/codec.js';

const newRev = () => crypto.randomBytes(8).toString('hex').slice(0, 12);
const same = (a, b) => a === b;
const configObject = text => text ? JSON.parse(text) : {};

async function liveTexts(live) {
  if (!live?.plot || !live?.plan) return null;
  return { plot: await unpack(live.plot), plan: await unpack(live.plan) };
}

function validateTexts(snapshot, texts) {
  const plot = JSON.parse(texts.plot), plan = JSON.parse(texts.plan);
  createOutlineModel(plot, plan);
  outlineConfig(plot, configObject(snapshot.config));
  return { plot, plan };
}

const validRepo = snapshot => {
  try { validateTexts(snapshot, { plot: snapshot.plot, plan: snapshot.plan }); return null; }
  catch (error) { return error instanceof Error ? error.message : String(error); }
};

async function write(rtdb, slug, expected, values) {
  if (rtdb.cas) {
    const ok = await rtdb.cas(slug, expected, values);
    if (!ok) return false;
  } else await rtdb.update(slug, values);
  return true;
}

function repoInfo(snapshot, error) {
  const repo = { tree: snapshot.tree, commit: snapshot.commit, at: Date.now() };
  if (error) repo.error = error;
  return repo;
}

async function packedSnapshot(snapshot) {
  return { tree: snapshot.tree, commit: snapshot.commit, plot: await pack(snapshot.plot), plan: await pack(snapshot.plan) };
}

export async function reconcileBook({ git, rtdb, slug, now = Date.now(), stableMs = 10_000, newRevision = newRev, maxPush = 4, dryRun = false } = {}) {
  const store = dryRun ? { ...rtdb, update: async () => {}, cas: async () => true } : rtdb;
  const state = await store.read(slug) ?? {};
  const head = state.head ?? {};
  const live = state.live ?? null;
  const tip = await git.tip();
  const current = await git.snapshot(tip, slug);
  const oldCommit = head.repo?.commit ?? null;
  if (oldCommit && !(await git.isAncestor(oldCommit, tip))) {
    if (await git.isAncestor(tip, oldCommit)) return { status: 'stale', commit: tip };
    await write(store, slug, { headRepoCommit: oldCommit, liveRev: live?.rev ?? null }, { head: { ...head, repo: { ...repoInfo(current), error: 'data main history was rewritten' } } });
    return { status: 'history-rewritten' };
  }

  let synced = head.synced ?? null;
  if (synced?.commit && (await git.isAncestor(synced.commit, tip))) {
    const trailers = await git.trailers(synced.commit, tip, slug);
    if (trailers.length) {
      const trailer = trailers[0];
      const trailerSnapshot = await git.snapshot(trailer.commit, slug);
      const nextSynced = { rev: trailer.rev, tree: trailerSnapshot.tree, commit: trailer.commit };
      if (live?.rev === trailer.rev) {
        const nextHead = { ...head, synced: nextSynced, repo: repoInfo(current), config: current.config ?? '' };
        await write(store, slug, { headRepoCommit: oldCommit, liveRev: live.rev }, { head: nextHead, incoming: null });
        return { status: 'confirmed', commit: trailer.commit };
      }
      head.synced = nextSynced;
      synced = nextSynced;
    }
  }

  const baseline = synced?.commit ? await git.snapshot(synced.commit, slug) : null;
  const changed = !baseline || !same(current.plot, baseline.plot) || !same(current.plan, baseline.plan);
  const repoError = validRepo(current);
  const liveDecoded = await liveTexts(live);
  const liveValid = liveDecoded ? (() => { try { validateTexts(current, liveDecoded); return true; } catch { return false; } })() : false;
  const liveChanged = Boolean(live && synced && live.rev !== synced.rev);
  const baseLive = baseline ? { plot: baseline.plot, plan: baseline.plan } : null;

  if (!changed) {
    if (liveChanged && liveDecoded && liveValid && live.over !== current.tree) {
      return enter({ git, rtdb: store, slug, state, head, live, current, synced, now, stableMs, maxPush, expected: { headRepoCommit: oldCommit, liveRev: live.rev }, dryRun });
    }
    const nextHead = { ...head, synced: synced ?? (live ? { rev: live.rev, tree: current.tree, commit: tip } : null), repo: repoInfo(current), config: current.config ?? '' };
    if (nextHead.synced && !live) {
      nextHead.synced = { rev: newRevision(), tree: current.tree, commit: tip };
      const first = { rev: nextHead.synced.rev, base: '', at: now, by: 'repo', plot: await pack(current.plot), plan: await pack(current.plan) };
      await write(store, slug, { headRepoCommit: oldCommit, liveRev: null }, { head: nextHead, live: first, starter: { commit: tip, plot: first.plot, plan: first.plan }, incoming: null });
      return { status: 'initialized', rev: first.rev };
    }
    await write(store, slug, { headRepoCommit: oldCommit, liveRev: live?.rev ?? null }, { head: nextHead, incoming: null });
    return { status: 'unchanged' };
  }

  const repoVersion = { tree: current.tree, commit: tip, plot: await pack(current.plot), plan: await pack(current.plan) };
  if (repoError) {
    const repo = repoInfo(current, repoError);
    const nextHead = { ...head, repo, config: current.config ?? '' };
    if (!live?.over || live.over !== current.tree || !liveDecoded || !liveValid) {
      await write(store, slug, { headRepoCommit: oldCommit, liveRev: live?.rev ?? null }, { head: nextHead });
      return { status: 'invalid', error: repoError };
    }
  }

  if (!live && !synced) {
    const rev = newRevision();
    const first = { rev, base: '', at: now, by: 'repo', plot: repoVersion.plot, plan: repoVersion.plan };
    const nextHead = { ...head, synced: { rev, tree: current.tree, commit: tip }, repo: repoInfo(current), config: current.config ?? '' };
    await write(store, slug, { headRepoCommit: oldCommit, liveRev: null }, { head: nextHead, live: first, starter: { commit: tip, plot: first.plot, plan: first.plan }, incoming: null });
    return { status: 'initialized', rev };
  }

  if (!live || !synced || !liveChanged) {
    const rev = newRevision();
    const nextLive = { rev, base: live?.rev ?? '', at: now, by: 'repo', plot: repoVersion.plot, plan: repoVersion.plan };
    const nextHead = { ...head, synced: { rev, tree: current.tree, commit: tip }, repo: repoInfo(current), config: current.config ?? '' };
    await write(store, slug, { headRepoCommit: oldCommit, liveRev: live?.rev ?? null }, { head: nextHead, live: nextLive, incoming: null });
    return { status: 'repo-to-live', rev };
  }

  if (liveDecoded && liveValid && live.over === current.tree) {
    return enter({ git, rtdb: store, slug, state, head, live, current, synced, now, stableMs, maxPush, expected: { headRepoCommit: oldCommit, liveRev: live.rev }, dryRun });
  }

  if (liveDecoded && liveValid && liveDecoded.plot === current.plot && liveDecoded.plan === current.plan) {
    const nextHead = { ...head, synced: { rev: live.rev, tree: current.tree, commit: tip }, repo: repoInfo(current), config: current.config ?? '' };
    await write(store, slug, { headRepoCommit: oldCommit, liveRev: live.rev }, { head: nextHead, incoming: null });
    return { status: 'same-content' };
  }

  if (liveDecoded && baseLive) {
    const files = ['plot', 'plan'];
    const repoChanged = files.map(name => current[name] !== baseline[name]);
    const liveChangedFiles = files.map(name => liveDecoded[name] !== baseLive[name]);
    if (repoChanged.every((changedFile, i) => !(changedFile && liveChangedFiles[i]))) {
      const merged = Object.fromEntries(files.map((name, i) => [name, repoChanged[i] ? current[name] : liveDecoded[name]]));
      try { validateTexts(current, merged); } catch { /* falls through to conflict */ }
      if (!validRepo({ ...current, plot: merged.plot, plan: merged.plan })) {
        const nextLive = { ...live, rev: newRevision(), base: live.rev, at: now, by: 'repo', plot: await pack(merged.plot), plan: await pack(merged.plan) };
        const nextHead = { ...head, synced: { rev: live.rev, tree: current.tree, commit: tip }, repo: repoInfo(current), config: current.config ?? '' };
        await write(store, slug, { headRepoCommit: oldCommit, liveRev: live.rev }, { head: nextHead, live: nextLive, incoming: null });
        return { status: 'merged', rev: nextLive.rev };
      }
    }
  }

  await write(store, slug, { headRepoCommit: oldCommit, liveRev: live.rev }, { head: { ...head, repo: repoInfo(current), config: current.config ?? '' }, incoming: repoVersion });
  return { status: 'conflict' };
}

async function enter({ git, rtdb, slug, state, head, live, current, synced, now, stableMs, maxPush, expected, dryRun = false }) {
  if (now - Number(live.at ?? 0) < stableMs || !liveDecodedEnough(live)) return { status: 'waiting' };
  const texts = await liveTexts(live);
  try { validateTexts(current, texts); } catch (error) { return { status: 'invalid-live', error: error.message }; }
  if (dryRun) return { status: 'would-publish' };
  const parent = current.commit;
  if (current.plot === texts.plot && current.plan === texts.plan) {
    await write(rtdb, slug, expected, { head: { ...head, synced: { rev: live.rev, tree: current.tree, commit: parent }, repo: repoInfo(current), config: current.config ?? '' }, incoming: null });
    return { status: 'already-current' };
  }
  for (let attempt = 0; attempt < maxPush; attempt++) {
    try {
      const commit = await git.commitFiles(parent, slug, { 'plot-data.json': texts.plot, 'placements.json': texts.plan }, `Sync outline ${slug}\n\nOutline-Sync: ${live.rev}\n`);
      await git.push(commit);
      const pushed = await git.snapshot(commit, slug);
      await write(rtdb, slug, expected, { head: { ...head, synced: { rev: live.rev, tree: pushed.tree, commit }, repo: repoInfo(pushed), config: pushed.config ?? '' }, incoming: null });
      return { status: 'published', commit };
    } catch (error) {
      if (!error.pushRejected || attempt === maxPush - 1) throw error;
      await git.fetch();
      const tip = await git.tip();
      current = await git.snapshot(tip, slug);
    }
  }
}

const liveDecodedEnough = live => typeof live.plot === 'string' && typeof live.plan === 'string';

