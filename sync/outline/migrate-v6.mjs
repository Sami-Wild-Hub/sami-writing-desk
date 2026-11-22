// One-time v5 -> v6 conversion; never imported by the running browser or worker.
// Reads: v5 source documents and approved private storyline/KB prefill (JSON)
// Writes: converted v6 documents in memory (JSON)
import { createOutlineModel } from '../../src/lib/views/outline/model.js';
const categories = { PAST: 'past', CURRENT: 'current', UNASSIGNED: 'undecided' };
const cols = () => ({ past: [], current: [], undecided: [] });

function timeOrder(cards, nodes, units) {
  const position = u => {
    if (!u.is_editorial_element) return nodes.get(u.source_id);
    const refs = (u.source_unit_ids || []).map(id => nodes.get(units[id].source_id)).filter(Number.isFinite);
    return refs.length ? Math.min(...refs) : undefined;
  };
  const bySequence = [...cards].sort((a, b) => a.sequence - b.sequence);
  const out = bySequence.filter(u => position(u) !== undefined).sort((a, b) => position(a) - position(b) || a.sequence - b.sequence);
  let front = 0;
  for (const u of bySequence.filter(u => position(u) === undefined)) {
    const anchor = bySequence.filter(a => a.sequence < u.sequence && a.is_editorial_element && position(a) !== undefined).at(-1);
    if (!anchor) { out.splice(front++, 0, u); continue; }
    let index = out.indexOf(anchor) + 1;
    while (index < out.length && position(out[index]) === undefined) index++;
    out.splice(index, 0, u);
  }
  return out.map(u => u.unit_id);
}

export function migrateV6(source, plan, prefill) {
  if (source.schema_version === '6.0') throw Error('Already v6; do not repeat migration');
  const data = structuredClone(source), next = structuredClone(plan), notes = [];
  const units = Object.fromEntries(source.plot_units.map(u => [u.unit_id, u]));
  const merged = new Set(source.plot_units.flatMap(u => u.source_unit_ids || []));
  const visible = source.plot_units.filter(u => !merged.has(u.unit_id));
  const lines = prefill.lines.map(l => ({ id: l.id, title: l.title, participants: [...l.parts], time_order: cols() }));
  const lineMap = Object.fromEntries(lines.map(l => [l.id, l]));
  for (const u of source.plot_units) if (!lineMap[u.storyline_group_id]) {
    const parent = source.plot_units.find(p => p.source_unit_ids?.includes(u.unit_id));
    if (!parent || !lineMap[parent.storyline_group_id]) throw Error('No prefill for occupied storyline ' + u.storyline_group_id);
    notes.push(`${u.unit_id}: ${u.storyline_group_id} -> ${parent.storyline_group_id} (merged source)`);
  }
  const nodes = new Map(source.source_nodes.map((n, i) => [n.node_id, i]));
  for (const l of lines) for (const [era, category] of Object.entries(categories)) {
    l.time_order[category] = timeOrder(visible.filter(u => u.storyline_group_id === l.id && u.era === era), nodes, units);
  }
  data.source_archive = { storylines: data.storylines, storyline_groups: data.storyline_groups, model: data.model, counts: data.counts };
  for (const key of ['storylines', 'model', 'counts']) delete data[key];
  data.schema_version = '6.0'; data.storyline_groups = lines;
  data.participants = structuredClone(prefill.kb);
  const seen = [...new Set(lines.flatMap(l => l.participants))];
  const score = name => visible.filter(u => lineMap[u.storyline_group_id]?.participants.includes(name)).length;
  const kind = Object.fromEntries(prefill.kb.map(p => [p.name, p.type]));
  const priority = prefill.ranking.slice(0, 2);
  data.participant_order = [...priority, ...seen.filter(n => !priority.includes(n)).sort((a, b) => score(b) - score(a) || Number(kind[a] !== '人物') - Number(kind[b] !== '人物') || seen.indexOf(a) - seen.indexOf(b))];
  data.plot_units = data.plot_units.map(u => {
    const retired = ['era', 'kind', 'sequence', 'storyline_id', 'original_era', 'editorial_beat', 'unplaced'];
    const old = Object.fromEntries(retired.filter(key => Object.hasOwn(u, key)).map(key => [key, structuredClone(u[key])]));
    if (!lineMap[u.storyline_group_id]) u.storyline_group_id = source.plot_units.find(p => p.source_unit_ids?.includes(u.unit_id)).storyline_group_id;
    u.category = categories[u.era];
    u.provenance = { ...(u.provenance || {}), v5: old };
    for (const key of retired) delete u[key];
    return u;
  });
  next.schema_version = '6.0'; delete next.kind_overrides;
  const beats = data.beats.map(b => b.beat_id);
  next.placements = next.placements.sort((a, b) => beats.indexOf(a.beat_id) - beats.indexOf(b.beat_id) || a.order - b.order).map(p => { const row = { ...p }; delete row.era; return row; });
  const model = createOutlineModel(data, next);
  return { plot_data: data, plan: next, notes, counts: { units: data.plot_units.length, visible: model.visibleUnits().length, placed: model.savedCount(), lines: lines.length, marks: Object.keys(model.marks()).length } };
}
