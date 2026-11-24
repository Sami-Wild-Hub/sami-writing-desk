// Round-trip optional foreshadow documents through real local Git and RTDB CAS doubles.
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GitRepo, runGit } from '../sync/outline/git.mjs';
import { reconcileBook } from '../sync/outline/reconcile.mjs';
import { pack, unpack } from '../src/lib/views/outline/codec.js';
import { outlineFixture, hasOutline } from './outline-fixture.mjs';
import { foreshadowFixture } from './foreshadow-fixture.mjs';

const json = value => JSON.stringify(value, null, 2) + '\n';
async function repository(run) {
  const root = await mkdtemp(join(tmpdir(), 'swd-foreshadow-'));
  try {
    const f = outlineFixture();
    await runGit(root, ['init', '-b', 'main']);
    await runGit(root, ['config', 'user.name', 'Test']); await runGit(root, ['config', 'user.email', 'test@example.invalid']);
    for (const slug of ['book', 'without']) {
      const dir = join(root, 'outline', slug); await mkdir(dir, { recursive: true });
      await writeFile(join(dir, 'plot-data.json'), json(f.plot_data)); await writeFile(join(dir, 'placements.json'), json(f.plan));
    }
    await writeFile(join(root, 'outline/book/foreshadow.json'), json(foreshadowFixture()));
    await runGit(root, ['add', 'outline']); await runGit(root, ['commit', '-qm', 'initial']);
    // Local refs emulate data main; no network or real data repository is written.
    const bare = join(root, 'data.git');
    await runGit(root, ['clone', '--quiet', '--bare', '.', bare]);
    await runGit(bare, ['config', 'user.name', 'Test']); await runGit(bare, ['config', 'user.email', 'test@example.invalid']);
    const git = new GitRepo(bare);
    git.tip = async () => (await runGit(bare, ['rev-parse', 'main'])).trim();
    git.push = async commit => { await runGit(bare, ['update-ref', 'refs/heads/main', commit]); };
    const db = { value: null, async read() { return structuredClone(this.value); }, async cas(_slug, expected, values) {
      assert.equal(this.value?.live?.rev ?? null, expected.liveRev);
      assert.equal(this.value?.head?.repo?.commit ?? null, expected.headRepoCommit);
      this.value = { ...this.value, ...values }; return true;
    } };
    await run({ root, git, db });
  } finally { await rm(root, { recursive: true, force: true }); }
}

test('repo → live → web → Git retains exact cells and optional absence', { skip: !hasOutline }, async () => {
  await repository(async ({ git, db }) => {
    assert.equal((await reconcileBook({ git, rtdb: db, slug: 'book' })).status, 'initialized');
    const original = await git.snapshot(await git.tip(), 'book');
    assert.equal(await unpack(db.value.live.foreshadow), original.foreshadow);
    assert.equal(await unpack(db.value.starter.foreshadow), original.foreshadow);
    const edited = foreshadowFixture(); edited.rows[0].author['备注'] = 'Web note\nunchanged whitespace  ';
    db.value.live = { ...db.value.live, rev: 'web000000001', at: 0, foreshadow: await pack(json(edited)) };
    assert.equal((await reconcileBook({ git, rtdb: db, slug: 'book', now: Date.now() })).status, 'published');
    const after = await git.snapshot(await git.tip(), 'book');
    assert.equal(after.foreshadow, json(edited)); assert.equal(after.plot, original.plot); assert.equal(after.plan, original.plan);
    assert.match(await runGit(git.root, ['log', '-1', '--format=%B', 'main']), /Outline-Sync: web000000001/);
    db.value = null;
    assert.equal((await reconcileBook({ git, rtdb: db, slug: 'without' })).status, 'initialized');
    assert.equal(db.value.live.foreshadow, null);
  });
});

test('different-file edits merge; same-file conflicts and invalid data remain explicit', { skip: !hasOutline }, async () => {
  await repository(async ({ git, db }) => {
    await reconcileBook({ git, rtdb: db, slug: 'book' });
    const before = await git.snapshot(await git.tip(), 'book');
    const repo = foreshadowFixture(); repo.rows[0].author['备注'] = 'Repo';
    const commit = await git.commitFiles(before.commit, 'book', { 'foreshadow.json': json(repo) }, 'Edit repo'); await git.push(commit);
    db.value.live = { ...db.value.live, rev: 'web000000001', at: 0, plan: await pack(json({ ...JSON.parse(before.plan), notes: 'web' })) };
    assert.equal((await reconcileBook({ git, rtdb: db, slug: 'book' })).status, 'merged');
    assert.equal(await unpack(db.value.live.foreshadow), json(repo));
    assert.equal((await reconcileBook({ git, rtdb: db, slug: 'book', now: Date.now() + 20_000 })).status, 'published');
    const base = await git.snapshot(await git.tip(), 'book');
    repo.rows[0].author['备注'] = 'Repo again';
    await git.push(await git.commitFiles(base.commit, 'book', { 'foreshadow.json': json(repo) }, 'Repo again'));
    db.value.live = { ...db.value.live, rev: 'web000000002', at: 0, foreshadow: await pack(json(foreshadowFixture())) };
    assert.equal((await reconcileBook({ git, rtdb: db, slug: 'book' })).status, 'conflict');
    assert.equal(await unpack(db.value.incoming.foreshadow), json(repo));
    await git.push(await git.commitFiles(await git.tip(), 'book', { 'foreshadow.json': '{' }, 'Invalid'));
    assert.equal((await reconcileBook({ git, rtdb: db, slug: 'book' })).status, 'invalid');
  });
});

test('a new optional file initializes via normal reconciliation and repository deletion clears it', { skip: !hasOutline }, async () => {
  await repository(async ({ git, db }) => {
    await reconcileBook({ git, rtdb: db, slug: 'without' });
    const first = await git.snapshot(await git.tip(), 'without');
    db.value.live = { ...db.value.live, rev: 'web000000001', at: 0, plan: await pack(json({ ...JSON.parse(first.plan), notes: 'web' })) };
    await git.push(await git.commitFiles(first.commit, 'without', { 'foreshadow.json': json(foreshadowFixture()) }, 'Add optional table'));
    assert.equal((await reconcileBook({ git, rtdb: db, slug: 'without' })).status, 'merged');
    assert.equal(await unpack(db.value.live.foreshadow), json(foreshadowFixture()));
    await reconcileBook({ git, rtdb: db, slug: 'without', now: Date.now() + 20_000 });
    await git.push(await git.commitFiles(await git.tip(), 'without', { 'foreshadow.json': null }, 'Remove optional table'));
    assert.equal((await reconcileBook({ git, rtdb: db, slug: 'without' })).status, 'repo-to-live');
    assert.equal(db.value.live.foreshadow, null);
    const base = await git.snapshot(await git.tip(), 'without');
    db.value.live = { ...db.value.live, rev: 'web000000002', at: 0, plan: await pack(json({ ...JSON.parse(base.plan), notes: 'web again' })) };
    assert.equal((await reconcileBook({ git, rtdb: db, slug: 'without', now: Date.now() + 20_000 })).status, 'published');
    assert.equal((await git.snapshot(await git.tip(), 'without')).foreshadow, null);
  });
});
