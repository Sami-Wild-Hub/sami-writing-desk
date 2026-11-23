// Prepare the category cutover from live RTDB, then CAS-install only matching published data.
// Reads: operator config, RTDB outlineSync, selected data checkout and origin/main (JSON/git)
// Writes: selected data files (prepare) or outlineSync/<slug> under a lease (install)
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { hostname } from 'node:os';
import { randomBytes } from 'node:crypto';
import { createRtdb, lease, release } from './rtdb.mjs';
import { migrateCombined, outlineCounts } from './migrate-combined.mjs';
import { jsonText, pack, unpack } from '../../src/lib/views/outline/codec.js';
import { createOutlineModel } from '../../src/lib/views/outline/model.js';

const args = process.argv.slice(2), mode = args.shift();
const option = key => args[args.indexOf('--' + key) + 1];
if (!['prepare', 'install'].includes(mode) || !args.includes('--config') || !args.includes('--data')) throw Error('Usage: migrate-combined-cli.mjs prepare|install --config <watcher config> --data <data checkout> [--slug maritime-story]');
const config = JSON.parse((await readFile(option('config'), 'utf8')).replace(/^\uFEFF/, ''));
const slug = args.includes('--slug') ? option('slug') : 'maritime-story';
if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) throw Error('Invalid slug');
const repo = resolve(option('data')), dir = resolve(repo, 'outline', slug);
const git = (...values) => execFileSync('git', ['-C', repo, ...values], { encoding: 'utf8', maxBuffer: 30e6 }).trim();
const db = createRtdb(config), holder = `combined-migration-${randomBytes(6).toString('hex')}`;
let held = false;

async function convert(value) {
  if (!value) return null;
  const result = migrateCombined(JSON.parse(await unpack(value.plot)), JSON.parse(await unpack(value.plan)));
  return { ...value, plot: await pack(jsonText(result.plot_data)), plan: await pack(jsonText(result.plan)) };
}

async function readback(plot, plan, expected) {
  createOutlineModel(plot, plan);
  const counts = outlineCounts(plot, plan);
  assert.deepEqual(counts, expected, 'Readback changed outline counts');
  return counts;
}

try {
  if (mode === 'install') {
    if (git('status', '--porcelain', '--', `outline/${slug}`)) throw Error('Commit and publish the prepared data files before install');
    git('fetch', 'origin', 'main');
    held = await lease(db, holder, hostname());
    if (!held) throw Error('Stop the watcher and wait for its lease to expire before install');
  }
  const state = await db.read(slug);
  if (!state?.live) throw Error('Live outline missing');
  if (state.incoming || state.head?.repo?.error) throw Error('Resolve the existing repository conflict before migration');
  const source = JSON.parse(await unpack(state.live.plot)), plan = JSON.parse(await unpack(state.live.plan));
  const migrated = migrateCombined(source, plan), before = outlineCounts(source, plan);
  if (mode === 'prepare') {
    await writeFile(resolve(dir, 'plot-data.json'), jsonText(migrated.plot_data));
    await writeFile(resolve(dir, 'placements.json'), jsonText(migrated.plan));
    const plot = JSON.parse(await readFile(resolve(dir, 'plot-data.json'), 'utf8')), savedPlan = JSON.parse(await readFile(resolve(dir, 'placements.json'), 'utf8'));
    assert.deepEqual(plot, migrated.plot_data); assert.deepEqual(savedPlan, migrated.plan);
    console.log(JSON.stringify({ mode, liveRev: state.live.rev, synced: state.live.rev === state.head.synced.rev, before, readback: await readback(plot, savedPlan, before) }));
  } else {
    const commit = git('rev-parse', 'origin/main'), tree = git('rev-parse', `${commit}:outline/${slug}`);
    const published = name => JSON.parse(git('show', `${commit}:outline/${slug}/${name}`));
    const plot = published('plot-data.json'), savedPlan = published('placements.json');
    if (JSON.stringify(plot) !== JSON.stringify(migrated.plot_data) || JSON.stringify(savedPlan) !== JSON.stringify(migrated.plan)) throw Error('Live changed since preparation, or combined data is not published; prepare again before installing');
    const dataReadback = await readback(plot, savedPlan, before);
    const rev = randomBytes(6).toString('hex'), live = { ...await convert(state.live), rev, base: state.live.rev, at: Date.now(), by: 'repo', over: '' };
    const head = { ...state.head, repo: { commit, tree, at: Date.now() }, synced: { rev, commit, tree } };
    await db.cas(slug, { liveRev: state.live.rev, headRepoCommit: state.head.repo.commit }, { live, head, starter: await convert(state.starter), kept: await convert(state.kept), incoming: null });
    const saved = await db.read(slug);
    assert.equal(saved.live.rev, rev); assert.equal(saved.head.synced.rev, rev);
    const rtdbReadback = await readback(JSON.parse(await unpack(saved.live.plot)), JSON.parse(await unpack(saved.live.plan)), before);
    for (const key of ['live', 'starter', 'kept']) if (saved[key]) createOutlineModel(JSON.parse(await unpack(saved[key].plot)), JSON.parse(await unpack(saved[key].plan)));
    console.log(JSON.stringify({ mode, commit, before, dataReadback, rtdbReadback }));
  }
} finally {
  try { if (held) await release(db, holder); } finally { await db.close(); }
}
