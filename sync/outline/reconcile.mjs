// Reconcile the book's versioned documents through Git, RTDB CAS and sync trailers.
// Reads: outline/<slug>, outlineSync/<slug> (Git/RTDB); Writes: outline/<slug>, outlineSync/<slug> (Git/RTDB)
import crypto from 'node:crypto';
import { createOutlineModel } from '../../src/lib/views/outline/model.js';
import { outlineConfig } from '../../src/lib/views/outline/config.js';
import { documentNames, sameDocuments, packedDocuments, decodedDocuments, validateOptionalForeshadow } from './files.mjs';

const newRev = () => crypto.randomBytes(8).toString('hex').slice(0, 12);
const configObject = text => text ? JSON.parse(text) : {};
const forcePublishMs = 2 * 60_000;

async function liveTexts(live) {
  return decodedDocuments(live);
}

function validateTexts(snapshot, texts) {
  const plot = JSON.parse(texts.plot), plan = JSON.parse(texts.plan);
  createOutlineModel(plot, plan);
  outlineConfig(plot, configObject(snapshot.config));
  validateOptionalForeshadow(texts.foreshadow);
  return { plot, plan };
}

const validRepo = snapshot => {
  try { validateTexts(snapshot, snapshot); return null; }
  catch (error) { return error instanceof Error ? error.message : String(error); }
};

async function write(rtdb, slug, expected, values) {
  if (rtdb.cas) {
    const ok = await rtdb.cas(slug, expected, values);
    if (!ok) {
      const error = new Error(`RTDB compare-and-set failed for ${slug}`);
      error.rtdbConflict = true;
      throw error;
    }
  } else await rtdb.update(slug, values);
  return true;
}

// A bad config.json is reported by itself; both directions keep using the last accepted one.
function withUsableConfig(snapshot, accepted) {
  if (!snapshot.config) return snapshot;
  let plot;
  try { plot = JSON.parse(snapshot.plot); } catch { return snapshot; }
  try { outlineConfig(plot, configObject(snapshot.config)); return snapshot; }
  catch (error) { return { ...snapshot, config: accepted ?? '', configError: error.message }; }
}

async function initialStarter(git, slug, current) {
  const commit = await git.introduced(current.commit, slug);
  const added = commit === current.commit ? current : await git.snapshot(commit, slug);
  return { commit, ...await packedDocuments(added) };
}

function repoInfo(snapshot, error) {
  const repo = { tree: snapshot.tree, commit: snapshot.commit, at: Date.now() };
  if (error) repo.error = error;
  if (snapshot.configError) repo.configError = snapshot.configError;
  return repo;
}

async function packedSnapshot(snapshot) {
  return { tree: snapshot.tree, commit: snapshot.commit, ...await packedDocuments(snapshot) };
}

export async function reconcileBook(options = {}) {
  const maxPush = Math.max(1, Number(options.maxPush ?? 4));
  for (let attempt = 0; attempt < maxPush; attempt += 1) {
    try {
      const result = await reconcileOnce({ ...options, state: attempt ? undefined : options.state, maxPush });
      if (result.status !== 'retry') return result;
      if (attempt === maxPush - 1) throw result.error;
    } catch (error) {
      if (!error.rtdbConflict || attempt === maxPush - 1) throw error;
      await options.git.fetch?.();
    }
  }
}

async function reconcileOnce({ git, rtdb, slug, state: suppliedState, now = Date.now(), stableMs = 10_000, newRevision = newRev, dryRun = false } = {}) {
  const store = dryRun ? Object.assign(Object.create(rtdb), { update: async () => {}, cas: async () => true }) : rtdb;
  const state = suppliedState ?? await store.read(slug) ?? {};
  const head = state.head ?? {};
  const live = state.live ?? null;
  const tip = await git.tip();
  const current = withUsableConfig(await git.snapshot(tip, slug), head.config);
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
  const changed = !baseline || !sameDocuments(current, baseline);
  const repoError = validRepo(current);
  const liveDecoded = await liveTexts(live);
  const liveValid = liveDecoded ? (() => { try { validateTexts(current, liveDecoded); return true; } catch { return false; } })() : false;
  const liveChanged = Boolean(live && synced && live.rev !== synced.rev);
  const baseLive = baseline;

  if (!changed) {
    const nextSynced = synced ? { ...synced, tree: current.tree, commit: tip } : null;
    if (liveChanged && liveDecoded && liveValid && (current.tree === nextSynced?.tree || live.over === current.tree)) {
      return enter({ git, rtdb: store, slug, head, live, current, now, stableMs, expected: { headRepoCommit: oldCommit, liveRev: live.rev }, dryRun });
    }
    const nextHead = { ...head, synced: nextSynced ?? (live ? { rev: live.rev, tree: current.tree, commit: tip } : null), repo: repoInfo(current), config: current.config ?? '' };
    if (nextHead.synced && !live) {
      nextHead.synced = { rev: newRevision(), tree: current.tree, commit: tip };
      const first = { rev: nextHead.synced.rev, base: '', at: now, by: 'repo', ...await packedDocuments(current) };
      await write(store, slug, { headRepoCommit: oldCommit, liveRev: null }, { head: nextHead, live: first, starter: await initialStarter(git, slug, current), incoming: null });
      return { status: 'initialized', rev: first.rev };
    }
    await write(store, slug, { headRepoCommit: oldCommit, liveRev: live?.rev ?? null }, { head: nextHead, incoming: null });
    return { status: 'unchanged' };
  }

  const repoVersion = await packedSnapshot(current);
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
    const first = { rev, base: '', at: now, by: 'repo', ...await packedDocuments(current) };
    const nextHead = { ...head, synced: { rev, tree: current.tree, commit: tip }, repo: repoInfo(current), config: current.config ?? '' };
    await write(store, slug, { headRepoCommit: oldCommit, liveRev: null }, { head: nextHead, live: first, starter: await initialStarter(git, slug, current), incoming: null });
    return { status: 'initialized', rev };
  }

  if (!live || !synced || !liveChanged) {
    const rev = newRevision();
    const nextLive = { rev, base: live?.rev ?? '', at: now, by: 'repo', ...await packedDocuments(current) };
    const nextHead = { ...head, synced: { rev, tree: current.tree, commit: tip }, repo: repoInfo(current), config: current.config ?? '' };
    await write(store, slug, { headRepoCommit: oldCommit, liveRev: live?.rev ?? null }, { head: nextHead, live: nextLive, incoming: null });
    return { status: 'repo-to-live', rev };
  }

  if (liveDecoded && liveValid && live.over === current.tree) {
    return enter({ git, rtdb: store, slug, head, live, current, now, stableMs, expected: { headRepoCommit: oldCommit, liveRev: live.rev }, dryRun });
  }

  if (liveDecoded && liveValid && sameDocuments(liveDecoded, current)) {
    const nextHead = { ...head, synced: { rev: live.rev, tree: current.tree, commit: tip }, repo: repoInfo(current), config: current.config ?? '' };
    await write(store, slug, { headRepoCommit: oldCommit, liveRev: live.rev }, { head: nextHead, incoming: null });
    return { status: 'same-content' };
  }

  if (liveDecoded && baseLive) {
    const files = documentNames;
    const repoChanged = files.map(name => (current[name] ?? null) !== (baseline[name] ?? null));
    const liveChangedFiles = files.map(name => (liveDecoded[name] ?? null) !== (baseLive[name] ?? null));
    if (repoChanged.every((changedFile, i) => !(changedFile && liveChangedFiles[i]))) {
      const merged = Object.fromEntries(files.map((name, i) => [name, repoChanged[i] ? current[name] : liveDecoded[name]]));
      try { validateTexts(current, merged); } catch { /* falls through to conflict */ }
      if (!validRepo({ ...current, ...merged })) {
        const nextLive = { ...live, rev: newRevision(), base: live.rev, at: now, by: 'repo', ...await packedDocuments(merged) };
        const nextHead = { ...head, synced: { rev: live.rev, tree: current.tree, commit: tip }, repo: repoInfo(current), config: current.config ?? '' };
        await write(store, slug, { headRepoCommit: oldCommit, liveRev: live.rev }, { head: nextHead, live: nextLive, incoming: null });
        return { status: 'merged', rev: nextLive.rev };
      }
    }
  }

  await write(store, slug, { headRepoCommit: oldCommit, liveRev: live.rev }, { head: { ...head, repo: repoInfo(current), config: current.config ?? '' }, incoming: repoVersion });
  return { status: 'conflict' };
}

async function enter({ git, rtdb, slug, head, live, current, now, stableMs, expected, dryRun = false }) {
  if (!liveDecodedEnough(live)) return { status: 'waiting' };
  const ageSince = at => Number.isFinite(Number(at)) ? Math.max(0, now - Number(at)) : 0;
  const liveAge = ageSince(live.at);
  const publishAge = ageSince(head.repo?.at);
  const age = Math.max(liveAge, publishAge);
  if (liveAge < stableMs && publishAge < forcePublishMs) {
    return { status: 'waiting', actionable: true, age, retryAfter: Math.min(stableMs - liveAge, forcePublishMs - publishAge) };
  }
  const texts = await liveTexts(live);
  try { validateTexts(current, texts); } catch (error) { return { status: 'invalid-live', error: error.message }; }
  if (dryRun) return { status: 'would-publish', actionable: true, age };
  const parent = current.commit;
  if (sameDocuments(current, texts)) {
    await write(rtdb, slug, expected, { head: { ...head, synced: { rev: live.rev, tree: current.tree, commit: parent }, repo: repoInfo(current), config: current.config ?? '' }, incoming: null });
    return { status: 'already-current' };
  }
  try {
    const commit = await git.commitFiles(parent, slug, { 'plot-data.json': texts.plot, 'placements.json': texts.plan, 'foreshadow.json': texts.foreshadow }, `Sync outline ${slug}\n\nOutline-Sync: ${live.rev}\n`);
    await git.push(commit);
    const pushed = withUsableConfig(await git.snapshot(commit, slug), head.config);
    await write(rtdb, slug, expected, { head: { ...head, synced: { rev: live.rev, tree: pushed.tree, commit }, repo: repoInfo(pushed), config: pushed.config ?? '' }, incoming: null });
    return { status: 'published', commit };
  } catch (error) {
    if (!error.pushRejected) throw error;
    return { status: 'retry', error };
  }
}

const liveDecodedEnough = live => typeof live.plot === 'string' && typeof live.plan === 'string';

