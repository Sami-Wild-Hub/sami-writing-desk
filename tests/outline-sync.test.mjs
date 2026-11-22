import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pack, unpack } from '../src/lib/views/outline/codec.js';
import { outlineConfig } from '../src/lib/views/outline/config.js';
import { classify } from '../src/lib/views/outline/sync-state.js';
import { createOutlineModel } from '../src/lib/views/outline/model.js';
import { outlineFixture } from './outline-fixture.mjs';
import { reconcileBook } from '../sync/outline/reconcile.mjs';
import { preview } from '../sync/outline/preview.mjs';

const text = value => `${JSON.stringify(value, null, 2)}\n`;
const snapshot = (commit, tree, plot, plan, config = '{"spineGroupId":"G01"}\n') => ({ commit, tree, plot: text(plot), plan: text(plan), config });

class FakeGit {
  constructor(snapshots, tip, ancestors = {}, trailers = [], { rejectPushes = 0, remoteTip = null } = {}) {
    this.snapshots = snapshots; this.current = tip; this.ancestors = ancestors; this.trailerList = trailers; this.pushed = [];
    this.rejectPushes = rejectPushes; this.remoteTip = remoteTip; this.commits = [];
  }
  async tip() { return this.current; }
  async snapshot(commit) { return this.snapshots[commit]; }
  async isAncestor(a, b) { return a === b || this.ancestors[`${a}>${b}`] === true; }
  async trailers() { return this.trailerList; }
  async commitFiles(parent, slug, files) { this.committed = { parent, slug, files }; this.commits.push(parent); return 'C-PUBLISHED'; }
  async push(commit) {
    if (this.rejectPushes) {
      this.rejectPushes -= 1;
      this.current = this.remoteTip;
      const error = new Error('non-fast-forward'); error.pushRejected = true; throw error;
    }
    this.pushed.push(commit); this.current = commit;
  }
  async fetch() {}
}
class FakeRtdb {
  constructor(value = null) { this.value = value; }
  async read() { return structuredClone(this.value); }
  async update(slug, values) { this.apply(values); }
  async cas(slug, expected, values) {
    if ((this.value?.head?.repo?.commit ?? null) !== (expected.headRepoCommit ?? null)) return false;
    if ((this.value?.live?.rev ?? null) !== (expected.liveRev ?? null)) return false;
    this.apply(values); return true;
  }
  apply(values) {
    this.value ??= {};
    for (const [key, value] of Object.entries(values)) { if (value === null) delete this.value[key]; else this.value[key] = structuredClone(value); }
  }
}
const rev = () => 'aaaaaaaaaaaa';

test('codec preserves exact file text and config resolves the configured spine', async () => {
  const source = '{"notes":["keep"]}\n';
  assert.equal(await unpack(await pack(source)), source);
  const f = outlineFixture();
  assert.deepEqual(outlineConfig(f.plot_data, f.config), f.config);
  assert.equal(classify({ head: { synced: { rev: 'r', commit: 'c' } } }).kind, 'synced');
});

test('plan unknown top-level fields survive export, plan import, and workspace import', () => {
  const f = outlineFixture(); f.plan.notes = { source: 'GPT', keep: true };
  const m = createOutlineModel(f.plot_data, f.plan);
  assert.deepEqual(m.exportPlan().notes, f.plan.notes);
  const next = { ...f.plan, notes: { source: 'web', extra: ['new'] } };
  m.importPlan(next); assert.deepEqual(m.exportPlan().notes, next.notes);
  m.importWorkspace({ ...m.exportWorkspace(), plan: next });
  assert.deepEqual(m.exportPlan().notes, next.notes);
});

test('first reconciliation creates live, head, and immutable starter', async () => {
  const f = outlineFixture();
  const git = new FakeGit({ C1: snapshot('C1', 'T1', f.plot_data, f.plan) }, 'C1');
  const rtdb = new FakeRtdb();
  const result = await reconcileBook({ git, rtdb, slug: 'book', now: 20_000, newRevision: rev });
  assert.equal(result.status, 'initialized');
  assert.equal(rtdb.value.starter.commit, 'C1');
  assert.equal(rtdb.value.head.synced.rev, rev());
});

test('stale snapshots are skipped, invalid repo content is reported, and same-file edits conflict', async () => {
  const f = outlineFixture();
  const badPlot = { ...f.plot_data, plot_units: [{ ...f.plot_data.plot_units[0], content: 42 }] };
  const git = new FakeGit({ C1: snapshot('C1', 'T1', badPlot, f.plan), C2: snapshot('C2', 'T2', f.plot_data, f.plan) }, 'C1', { 'C1>C2': true, 'OLD>C1': true });
  const staleDb = new FakeRtdb({ head: { repo: { commit: 'C2' } } });
  assert.equal((await reconcileBook({ git, rtdb: staleDb, slug: 'book' })).status, 'stale');
  const invalidDb = new FakeRtdb({ head: { repo: { commit: 'OLD' }, synced: { rev: 'base', tree: 'T0', commit: 'OLD' } }, live: { rev: 'web', at: 0, plot: await pack(text(f.plot_data)), plan: await pack(text(f.plan)) } });
  assert.equal((await reconcileBook({ git, rtdb: invalidDb, slug: 'book', now: 20_000 })).status, 'invalid');
  const currentPlan = { ...f.plan, notes: 'repo' };
  const base = snapshot('B', 'TB', f.plot_data, f.plan);
  const current = snapshot('C', 'TC', f.plot_data, currentPlan);
  const conflictGit = new FakeGit({ B: base, C: current }, 'C', { 'B>C': true });
  const conflictDb = new FakeRtdb({ head: { repo: { commit: 'B' }, synced: { rev: 'base', tree: 'TB', commit: 'B' } }, live: { rev: 'web', at: 0, plot: await pack(base.plot), plan: await pack(text({ ...f.plan, notes: 'web' })) } });
  assert.equal((await reconcileBook({ git: conflictGit, rtdb: conflictDb, slug: 'book', now: 20_000 })).status, 'conflict');
  assert.ok(conflictDb.value.incoming);
});

test('different-file edits merge, trailer confirmation avoids a duplicate publish, and stable live publishes', async () => {
  const f = outlineFixture();
  const base = snapshot('B', 'TB', f.plot_data, f.plan);
  const repoPlot = { ...f.plot_data, data_policy: 'repo' };
  const current = snapshot('C', 'TC', repoPlot, f.plan);
  const livePlan = { ...f.plan, notes: 'web' };
  const mergeGit = new FakeGit({ B: base, C: current }, 'C', { 'B>C': true });
  const mergeDb = new FakeRtdb({ head: { repo: { commit: 'B' }, synced: { rev: 'base', tree: 'TB', commit: 'B' } }, live: { rev: 'web', at: 0, plot: await pack(base.plot), plan: await pack(text(livePlan)) } });
  assert.equal((await reconcileBook({ git: mergeGit, rtdb: mergeDb, slug: 'book', now: 20_000, newRevision: rev })).status, 'merged');
  const trailerDb = new FakeRtdb({ head: { repo: { commit: 'B' }, synced: { rev: 'base', tree: 'TB', commit: 'B' } }, live: { rev: rev(), at: 0, plot: await pack(current.plot), plan: await pack(current.plan) } });
  const trailerGit = new FakeGit({ B: base, C: current }, 'C', { 'B>C': true }, [{ commit: 'C', tree: 'TC', rev: rev() }]);
  assert.equal((await reconcileBook({ git: trailerGit, rtdb: trailerDb, slug: 'book', now: 20_000 })).status, 'confirmed');
  const publishBase = snapshot('P', 'TP', f.plot_data, f.plan);
  const publishPlot = { ...f.plot_data };
  const publishGit = new FakeGit({ P: publishBase, C: snapshot('C', 'TP2', publishPlot, f.plan), 'C-PUBLISHED': snapshot('C-PUBLISHED', 'TP2', publishPlot, f.plan) }, 'C', { 'P>C': true, 'C>C-PUBLISHED': true });
  const publishDb = new FakeRtdb({ head: { repo: { commit: 'P' }, synced: { rev: 'base', tree: 'TP', commit: 'P' } }, live: { rev: rev(), at: 0, plot: await pack(publishBase.plot), plan: await pack(text({ ...f.plan, notes: 'web' })) } });
  assert.equal((await reconcileBook({ git: publishGit, rtdb: publishDb, slug: 'book', now: 20_000 })).status, 'published');
  assert.deepEqual(publishGit.pushed, ['C-PUBLISHED']);
});

test('a rejected push restarts from the newly fetched tip', async () => {
  const f = outlineFixture();
  const base = snapshot('B', 'TB', f.plot_data, f.plan);
  const remote = snapshot('R', 'TR', f.plot_data, f.plan);
  const published = snapshot('C-PUBLISHED', 'TP', f.plot_data, { ...f.plan, notes: 'web' });
  const git = new FakeGit({ B: base, R: remote, 'C-PUBLISHED': published }, 'B', { 'B>R': true, 'R>C-PUBLISHED': true }, [], { rejectPushes: 1, remoteTip: 'R' });
  const rtdb = new FakeRtdb({ head: { repo: { commit: 'B' }, synced: { rev: 'base', tree: 'TB', commit: 'B' } }, live: { rev: rev(), at: 0, plot: await pack(base.plot), plan: await pack(text({ ...f.plan, notes: 'web' })) } });
  assert.equal((await reconcileBook({ git, rtdb, slug: 'book', now: 20_000 })).status, 'published');
  assert.equal(git.commits.at(-1), 'R');
  assert.deepEqual(git.pushed, ['C-PUBLISHED']);
});

test('continuous edits become publishable after two minutes even while live keeps changing', async () => {
  const f = outlineFixture();
  const base = snapshot('B', 'TB', f.plot_data, f.plan);
  const git = new FakeGit({ B: base }, 'B');
  const rtdb = new FakeRtdb({ head: { repo: { commit: 'B', at: 0 }, synced: { rev: 'base', tree: 'TB', commit: 'B' } }, live: { rev: 'web', at: 119_000, plot: await pack(base.plot), plan: await pack(text({ ...f.plan, notes: 'web' })) } });
  const result = await reconcileBook({ git, rtdb, slug: 'book', now: 120_000, dryRun: true });
  assert.equal(result.status, 'would-publish');
  assert.equal(result.actionable, true);
});

test('preview emits a private outline payload from a repository snapshot', async () => {
  const f = outlineFixture();
  const git = new FakeGit({ C1: snapshot('C1', 'T1', f.plot_data, f.plan) }, 'C1');
  const folder = await mkdtemp(join(tmpdir(), 'swd-outline-preview-'));
  const out = join(folder, 'outline-preview.json');
  try {
    const result = await preview({ dataRepo: 'unused' }, { slug: 'maritime-story', out, git });
    const payload = JSON.parse(await readFile(out, 'utf8'));
    assert.equal(result.status, 'preview');
    assert.equal(payload.revision, 'C1');
    assert.deepEqual(payload.config, { spineGroupId: 'G01', spineTitle: 'Ann × Bo' });
    assert.deepEqual(payload.plan, f.plan);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

