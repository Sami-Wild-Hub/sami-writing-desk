// Prepare a local migration from current live data, or install published v6 files with CAS.
// Reads: config and credential paths supplied by the operator; RTDB and data repo (JSON/git)
// Writes: selected data checkout (prepare) or outlineSync/<slug> (install)
import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { createRtdb } from './rtdb.mjs';
import { migrateV6 } from './migrate-v6.mjs';
import { jsonText, pack, unpack } from '../../src/lib/views/outline/codec.js';
import { createOutlineModel } from '../../src/lib/views/outline/model.js';

const args = process.argv.slice(2), mode = args.shift();
const option = key => args[args.indexOf('--' + key) + 1];
if (!['prepare', 'install'].includes(mode) || !args.includes('--config') || !args.includes('--sample') || !args.includes('--data')) throw Error('Usage: migrate-v6-cli.mjs prepare|install --config <watcher config> --sample <approved HTML> --data <data checkout> [--slug maritime-story]');
const config = JSON.parse((await readFile(option('config'), 'utf8')).replace(/^\uFEFF/, ''));
const slug = args.includes('--slug') ? option('slug') : 'maritime-story';
if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) throw Error('Invalid slug');
const repo = resolve(option('data')), dir = resolve(repo, 'outline', slug);
const git = (...values) => execFileSync('git', ['-C', repo, ...values], { encoding: 'utf8', maxBuffer: 30e6 }).trim();
const html = await readFile(option('sample'), 'utf8');
const prefill = JSON.parse(html.match(/<script type="application\/json" id="data">([\s\S]*?)<\/script>/)[1]);
const db = createRtdb(config);
async function convert(value) {
  if (!value) return null;
  const plot = JSON.parse(await unpack(value.plot)), plan = JSON.parse(await unpack(value.plan));
  const migrated = plot.schema_version === '6.0' ? { plot_data: plot, plan } : migrateV6(plot, plan, prefill);
  return { ...value, plot: await pack(jsonText(migrated.plot_data)), plan: await pack(jsonText(migrated.plan)) };
}
try {
  const state = await db.read(slug);
  if (!state?.live) throw Error('Live outline missing');
  if (state.incoming || state.head?.repo?.error) throw Error('Resolve the existing repository conflict before migration');
  const source = JSON.parse(await unpack(state.live.plot)), plan = JSON.parse(await unpack(state.live.plan));
  if (source.schema_version === '6.0') throw Error('Live is already v6');
  const migrated = migrateV6(source, plan, prefill);
  if (mode === 'prepare') {
    await writeFile(resolve(dir, 'plot-data.json'), jsonText(migrated.plot_data));
    await writeFile(resolve(dir, 'placements.json'), jsonText(migrated.plan));
    console.log(JSON.stringify({ mode, liveRev: state.live.rev, synced: state.live.rev === state.head.synced.rev, counts: migrated.counts, notes: migrated.notes }));
  } else {
    if (git('status', '--porcelain', '--', `outline/${slug}`)) throw Error('Commit and publish the prepared data files before install');
    git('fetch', 'origin', 'main');
    const commit = git('rev-parse', 'origin/main'), tree = git('rev-parse', `${commit}:outline/${slug}`);
    for (const [name, value] of [['plot-data.json', migrated.plot_data], ['placements.json', migrated.plan]]) {
      if (JSON.stringify(JSON.parse(git('show', `${commit}:outline/${slug}/${name}`))) !== JSON.stringify(value)) throw Error('Live changed since preparation, or v6 data is not published; prepare again before installing');
    }
    const coordinator = (await db.coordinator.once('value')).val();
    if (coordinator?.until > Date.now()) throw Error('Stop the watcher and wait for its lease to expire before install');
    const rev = randomBytes(6).toString('hex'), live = { ...await convert(state.live), rev, base: state.live.rev, at: Date.now(), by: 'repo', over: '' };
    const head = { ...state.head, config: '', repo: { commit, tree, at: Date.now() }, synced: { rev, commit, tree } };
    await db.cas(slug, { liveRev: state.live.rev, headRepoCommit: state.head.repo.commit }, { live, head, starter: await convert(state.starter), kept: await convert(state.kept), incoming: null });
    const readback = await db.read(slug);
    const model = createOutlineModel(JSON.parse(await unpack(readback.live.plot)), JSON.parse(await unpack(readback.live.plan)));
    console.log(JSON.stringify({ mode, commit, counts: { visible: model.visibleUnits().length, placed: model.savedCount(), lines: model.data.storyline_groups.length, marks: Object.keys(model.marks()).length } }));
  }
} finally { await db.close(); }
