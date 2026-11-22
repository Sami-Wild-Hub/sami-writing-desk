// Verify the one-time conversion against the canonical source and approved private sample.
// Reads: sibling data origin/main and approved sample HTML; no private data is embedded here.
import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { migrateV6 } from '../sync/outline/migrate-v6.mjs';
import { createOutlineModel } from '../src/lib/views/outline/model.js';
import { pack, unpack, jsonText } from '../src/lib/views/outline/codec.js';
const repo = resolve('../sami-writing-desk-data-outline');
const sample = resolve('../CodexTasks/orchestrator/discussions/swd-storylines-v2/storylines-sample.html');
test('migration retains current placements, merged originals and categories, and initializes the approved XMind order', { skip: !existsSync(repo) || !existsSync(sample) }, async () => {
  const read = name => JSON.parse(execFileSync('git', ['-C', repo, 'show', `origin/main:outline/maritime-story/${name}`], { encoding: 'utf8', maxBuffer: 20e6 }));
  const source = read('plot-data.json'), plan = read('placements.json');
  if (source.schema_version === '6.0') return;
  const prefill = JSON.parse(readFileSync(sample, 'utf8').match(/<script type="application\/json" id="data">([\s\S]*?)<\/script>/)[1]);
  const result = migrateV6(source, plan, prefill), m = createOutlineModel(result.plot_data, result.plan);
  assert.equal(result.counts.units, source.plot_units.length);
  assert.equal(result.counts.visible, prefill.cards.length);
  assert.equal(result.counts.placed, plan.placements.length);
  assert.equal(result.counts.lines, 32); assert.equal(result.counts.marks, 0);
  assert.deepEqual(result.plot_data.source_nodes, source.source_nodes);
  assert.deepEqual(result.plot_data.branches, source.branches);
  for (const g of result.plot_data.storyline_groups) assert.deepEqual(g.time_order, prefill.time[g.id]);
  for (const u of source.plot_units) {
    const next = m.unitMap[u.unit_id];
    assert.equal(next.content, u.content); assert.deepEqual(next.source_unit_ids, u.source_unit_ids);
    assert.equal(next.category, { PAST: 'past', CURRENT: 'current', UNASSIGNED: 'undecided' }[u.era]);
  }
  const beats = source.beats.map(b => b.beat_id);
  assert.deepEqual(result.plan.placements, [...plan.placements].sort((a, b) => beats.indexOf(a.beat_id) - beats.indexOf(b.beat_id) || a.order - b.order).map(({ era, ...p }) => p));
  const packed = await pack(jsonText(result.plot_data));
  assert.deepEqual(JSON.parse(await unpack(packed)), m.exportData());
});
