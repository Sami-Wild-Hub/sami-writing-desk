// One-time v6 -> v7 conversion from the editor's approved merge/lead table.
// Reads: live v6 documents and approved specification (JSON/Markdown)
// Writes: converted v7 documents in memory (JSON)
import { createOutlineModel } from '../../src/lib/views/outline/model.js';
import { CATEGORIES } from '../../src/lib/views/outline/validation.js';

export function readLeadSpec(text) {
  const groups = [];
  for (const row of text.split(/\r?\n/).filter(row => row.startsWith('| G'))) {
    const cells = row.split('|').slice(1, -1).map(s => s.trim()), ids = cells[0].match(/G\d+/g);
    const merged = ids.length > 1, lead = cells[merged ? 3 : 1].replace(/（[^）]*）/g, '').trim();
    groups.push({ ids, title: merged ? cells[1] : null, lead });
  }
  if (!groups.length || new Set(groups.flatMap(g => g.ids)).size !== groups.flatMap(g => g.ids).length) throw Error('Invalid approved merge/lead table');
  const move = text.match(/卡片移动[^\n]*?(U\d+)[^\n]*?从\s*(G\d+)[^\n]*?改归\s*(G\d+)/);
  return { groups, moves: move ? [{ id: move[1], from: move[2], to: move[3] }] : [] };
}

function timeOrder(cards, nodes, units, prior) {
  const position = u => {
    if (!u.is_editorial_element) return nodes.get(u.source_id);
    const refs = (u.source_unit_ids || []).map(id => nodes.get(units[id].source_id)).filter(Number.isFinite);
    return refs.length ? Math.min(...refs) : undefined;
  };
  const sequence = u => u.provenance?.v5?.sequence ?? prior.get(u.unit_id);
  const bySequence = [...cards].sort((a, b) => sequence(a) - sequence(b));
  const out = bySequence.filter(u => position(u) !== undefined).sort((a, b) => position(a) - position(b) || sequence(a) - sequence(b));
  let front = 0;
  for (const u of bySequence.filter(u => position(u) === undefined)) {
    const anchor = bySequence.filter(a => sequence(a) < sequence(u) && a.is_editorial_element && position(a) !== undefined).at(-1);
    if (!anchor) { out.splice(front++, 0, u); continue; }
    let index = out.indexOf(anchor) + 1;
    while (index < out.length && position(out[index]) === undefined) index++;
    out.splice(index, 0, u);
  }
  return out.map(u => u.unit_id);
}

export function migrateV7(source, plan, spec) {
  if (source.schema_version !== '6.0' || plan.schema_version !== '6.0') throw Error('Migration requires v6 live documents');
  const data = structuredClone(source), next = structuredClone(plan);
  const original = Object.fromEntries(source.storyline_groups.map(g => [g.id, g]));
  const rules = Object.fromEntries(spec.groups.flatMap(g => g.ids.map(id => [id, g])));
  for (const rule of spec.groups) for (const id of rule.ids) if (!original[id]) throw Error('Approved storyline missing from live: ' + id);
  const destination = id => rules[id]?.ids[0] || id, rebuilt = new Set(), lines = [];
  for (const line of data.storyline_groups) {
    const rule = rules[line.id];
    if (destination(line.id) !== line.id) continue;
    if (rule?.ids.length > 1) {
      line.title = rule.title;
      line.participants = [...new Set(rule.ids.flatMap(id => original[id].participants))];
      rebuilt.add(line.id);
    }
    line.lead_participant = rule?.lead || line.participants[0]; lines.push(line);
  }
  data.storyline_groups = lines;
  for (const u of data.plot_units) u.storyline_group_id = destination(u.storyline_group_id);
  for (const move of spec.moves) {
    const card = data.plot_units.find(u => u.unit_id === move.id);
    if (!card || original[move.from].time_order[card.category].includes(move.id) === false) throw Error('Approved moved card is missing from its source line');
    card.storyline_group_id = destination(move.to); rebuilt.add(destination(move.from)); rebuilt.add(destination(move.to));
  }
  const units = Object.fromEntries(data.plot_units.map(u => [u.unit_id, u]));
  const merged = new Set(data.plot_units.flatMap(u => u.source_unit_ids || []));
  const visible = data.plot_units.filter(u => !merged.has(u.unit_id));
  const nodes = new Map(data.source_nodes.map((n, i) => [n.node_id, i]));
  const prior = new Map(source.storyline_groups.flatMap(g => CATEGORIES.flatMap(c => g.time_order[c])).map((id, i) => [id, i]));
  for (const line of lines) if (rebuilt.has(line.id)) for (const category of CATEGORIES) {
    line.time_order[category] = timeOrder(visible.filter(u => u.storyline_group_id === line.id && u.category === category), nodes, units, prior);
  }
  data.schema_version = next.schema_version = '7.0';
  const model = createOutlineModel(data, next);
  return { plot_data: data, plan: next, counts: { units: data.plot_units.length, visible: model.visibleUnits().length, placed: model.savedCount(), lines: lines.length, marks: Object.keys(model.marks()).length } };
}
