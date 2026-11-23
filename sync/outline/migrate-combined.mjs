// Rename the v7 category and time-order key once, preserving all other document fields.
// Reads: current RTDB plot/plan documents (v7 JSON)
// Writes: converted plot/plan documents (v7 JSON)
import assert from 'node:assert/strict';
import { createOutlineModel } from '../../src/lib/views/outline/model.js';
import { keptPositions } from '../../src/lib/views/outline/ordering.js';

export function outlineCounts(plot, plan) {
  const merged = new Set(plot.plot_units.flatMap(u => u.source_unit_ids || []));
  const visible = plot.plot_units.filter(u => !merged.has(u.unit_id));
  const categories = ['past', 'current', 'combined'];
  const legacy = plot.storyline_groups.some(g => Object.hasOwn(g.time_order, 'undecided'));
  const key = c => c === 'combined' && legacy ? 'undecided' : c;
  const units = Object.fromEntries(plot.plot_units.map(u => [u.unit_id, u]));
  const beats = plot.beats.map(b => b.beat_id);
  const reveal = [...plan.placements].sort((a, b) => beats.indexOf(a.beat_id) - beats.indexOf(b.beat_id) || a.order - b.order);
  let marks = 0;
  for (const line of plot.storyline_groups) for (const category of categories) {
    const ids = line.time_order[key(category)];
    const seq = reveal.filter(p => units[p.unit_id].storyline_group_id === line.id && units[p.unit_id].category === key(category));
    marks += seq.length - keptPositions(seq.map(p => ids.indexOf(p.unit_id))).size;
  }
  const counts = xs => Object.fromEntries(categories.map(c => [c, xs.filter(u => u.category === key(c)).length]));
  return { units: plot.plot_units.length, visible: visible.length, placed: plan.placements.length,
    lines: plot.storyline_groups.length, categories: counts(plot.plot_units), visibleCategories: counts(visible), marks };
}

export function migrateCombined(source, plan) {
  if (source.schema_version !== '7.0' || plan.schema_version !== '7.0') throw Error('Expected v7 documents');
  const plot = structuredClone(source);
  for (const unit of plot.plot_units) {
    if (!['past', 'current', 'undecided'].includes(unit.category)) throw Error('Expected the pre-cutover category format');
    if (unit.category === 'undecided') unit.category = 'combined';
  }
  for (const line of plot.storyline_groups) {
    if (!Array.isArray(line.time_order?.undecided) || Object.hasOwn(line.time_order, 'combined')) throw Error('Expected the pre-cutover time-order format');
    line.time_order = Object.fromEntries(Object.entries(line.time_order).map(([key, value]) => [key === 'undecided' ? 'combined' : key, value]));
  }
  const result = { plot_data: plot, plan: structuredClone(plan) };
  const model = createOutlineModel(result.plot_data, result.plan);
  const before = outlineCounts(source, plan), after = outlineCounts(result.plot_data, result.plan);
  assert.deepEqual(after, before, 'Migration changed outline counts');
  assert.equal(Object.keys(model.marks()).length, before.marks, 'Migration changed mismatch marks');
  return { ...result, counts: after };
}
