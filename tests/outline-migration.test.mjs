// Verify approved merges against canonical v6 documents and the private editorial table.
// Reads: sibling data origin/main and approved merge/lead Markdown
import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { migrateV7, readLeadSpec } from '../sync/outline/migrate-v7.mjs';
import { createOutlineModel } from '../src/lib/views/outline/model.js';
import { pack, unpack, jsonText } from '../src/lib/views/outline/codec.js';
const repo = resolve('../sami-writing-desk-data-outline');
const path = resolve('../CodexTasks/orchestrator/discussions/swd-storyline-merge/04-final.md');

test('approved merges retain cards, reveal order, latest edits and XMind category order', { skip: !existsSync(repo) || !existsSync(path) }, async () => {
  const read = name => JSON.parse(execFileSync('git', ['-C', repo, 'show', `origin/main:outline/maritime-story/${name}`], { encoding: 'utf8', maxBuffer: 20e6 }));
  const source = read('plot-data.json'), plan = read('placements.json');
  const spec = readLeadSpec(readFileSync(path, 'utf8'));
  source.plot_units[0].content += ' retained live edit'; source.latest_extension = { keep: true };
  const result = migrateV7(source, plan, spec), m = createOutlineModel(result.plot_data, result.plan);
  assert.equal(result.counts.units, source.plot_units.length); assert.equal(result.counts.visible, 108);
  assert.equal(result.counts.placed, plan.placements.length); assert.equal(result.counts.lines, 26);
  assert.deepEqual(result.plan, { ...plan, schema_version: '7.0' });
  assert.deepEqual(result.plot_data.source_nodes, source.source_nodes); assert.deepEqual(result.plot_data.branches, source.branches);
  assert.deepEqual(result.plot_data.participant_order, source.participant_order); assert.deepEqual(result.plot_data.latest_extension, source.latest_extension);
  for (const u of source.plot_units) {
    const { storyline_group_id, ...before } = u, { storyline_group_id: moved, ...after } = m.unitMap[u.unit_id];
    assert.deepEqual(after, before);
  }
  assert.equal(m.unitMap.U058.storyline_group_id, 'G08');
  for (const rule of spec.groups) {
    const line = m.storyMap[rule.ids[0]];
    assert.equal(line.lead_participant, rule.lead);
    const originals = source.storyline_groups.filter(g => rule.ids.includes(g.id));
    assert.deepEqual(new Set(line.participants), new Set(originals.flatMap(g => g.participants)));
    if (rule.ids.length < 2) continue;
    assert.equal(line.title, rule.title);
    const expected = originals.flatMap(g => Object.values(g.time_order).flat()).filter(id => id !== 'U058');
    assert.deepEqual(new Set(Object.values(line.time_order).flat()), new Set(expected));
    const nodeIndex = new Map(source.source_nodes.map((n, i) => [n.node_id, i]));
    for (const ids of Object.values(line.time_order)) {
      const sourced = ids.map(id => m.unitMap[id]).map(u => u.is_editorial_element
        ? Math.min(...(u.source_unit_ids || []).map(id => nodeIndex.get(m.unitMap[id].source_id)).filter(Number.isFinite))
        : nodeIndex.get(u.source_id)).filter(Number.isFinite);
      assert.deepEqual(sourced, [...sourced].sort((a, b) => a - b));
    }
  }
  assert.deepEqual(m.storyMap.G16.time_order.current, ['E024', 'E057', 'U068']);
  assert.deepEqual(m.storyMap.G19.time_order.current, ['U077', 'U080', 'U084', 'U085']);
  assert.deepEqual(m.storyMap.G22.time_order.current, ['E004', 'E020']);
  assert.deepEqual(m.storyMap.G12.time_order.past, ['E036', 'E013', 'E041', 'U065']);
  assert.deepEqual(m.storyMap.G08.time_order.past, ['E032', 'E033', 'E049', 'E059', 'U057', 'U058']);
  assert.deepEqual(JSON.parse(await unpack(await pack(jsonText(result.plot_data)))), m.exportData());
});
