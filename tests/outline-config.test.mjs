// Verify starter provenance and config fallback with the canonical outline in a temporary git repo.
// Reads: sibling data repo origin/main (JSON); Writes: temporary git repos only
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { pack, unpack } from '../src/lib/views/outline/codec.js';
import { GitRepo } from '../sync/outline/git.mjs';
import { reconcileBook } from '../sync/outline/reconcile.mjs';

const source = resolve(process.env.OUTLINE_DATA_REPO || '../sami-writing-desk-data-outline'), slug = 'maritime-story';
const options = { skip: !existsSync(source) && 'public CI has no sibling data repository' };
const run = (cwd, ...args) => execFileSync('git', ['-C', cwd, '-c', 'core.autocrlf=false', '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { encoding: 'utf8', maxBuffer: 20e6, stdio: ['ignore', 'pipe', 'pipe'] });
const canonical = name => readFileSync(join(source, 'outline', slug, name), 'utf8');

test('starter records the introducing commit and a bad config neither spreads nor blocks either direction', options, async () => {
  const root = mkdtempSync(join(tmpdir(), 'swd-config-'));
  try {
    const remote = join(root, 'remote.git'), work = join(root, 'work'), bare = join(root, 'data.git');
    run(root, 'init', '-q', '--bare', '-b', 'main', remote);
    run(root, 'clone', '-q', remote, work);
    run(work, 'symbolic-ref', 'HEAD', 'refs/heads/main');
    const commit = (name, text) => { writeFileSync(join(work, name), text); run(work, 'add', '.'); run(work, 'commit', '-q', '-m', name); };
    commit('README.md', 'data\n');
    const dir = join(work, 'outline', slug); mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'plot-data.json'), canonical('plot-data.json'));
    commit(`outline/${slug}/placements.json`, canonical('placements.json'));
    const introduced = run(work, 'rev-parse', 'HEAD').trim();
    commit('README.md', 'data, later\n');
    run(work, 'push', '-q', 'origin', 'main');
    run(root, 'clone', '-q', '--bare', remote, bare);

    const git = new GitRepo(bare);
    let book = null;
    const rtdb = { read: async () => structuredClone(book), update: async (_slug, values) => {
      book ??= {};
      for (const [key, value] of Object.entries(values)) if (value === null) delete book[key]; else book[key] = structuredClone(value);
    } };
    const round = async () => { await git.fetch(); return reconcileBook({ git, rtdb, slug }); };
    assert.equal((await round()).status, 'initialized');
    assert.equal(book.starter.commit, introduced);
    assert.equal(await unpack(book.starter.plot), canonical('plot-data.json'));

    const push = text => { run(work, 'pull', '-q', '--ff-only', 'origin', 'main'); commit(`outline/${slug}/config.json`, text); run(work, 'push', '-q', 'origin', 'main'); };
    const good = `${JSON.stringify({ defaultStorylineId: JSON.parse(canonical('plot-data.json')).storyline_groups[1].id })}\n`;
    push(good); await round();
    assert.equal(book.head.config, good);
    for (const bad of ['{', '{"defaultStorylineId":"missing"}\n']) {
      push(bad); await round();
      assert.equal(book.head.config, good);
      assert.ok(book.head.repo.configError); assert.equal(book.head.repo.error, undefined);
    }
    const plan = JSON.parse(await unpack(book.live.plan)); plan.beat_notes = { ...plan.beat_notes, 'A1-B1': 'web edit' };
    book.live = { ...book.live, base: book.live.rev, rev: 'webedit00001', at: Date.now() - 60_000, by: 'web', plan: await pack(`${JSON.stringify(plan, null, 2)}\n`) };
    assert.equal((await round()).status, 'published');
    assert.equal(book.head.config, good); assert.ok(book.head.repo.configError);
    assert.match(run(remote, 'show', `main:outline/${slug}/placements.json`), /web edit/);

    push('{}\n'); await round();
    assert.equal(book.head.config, '{}\n'); assert.equal(book.head.repo.configError, undefined);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
