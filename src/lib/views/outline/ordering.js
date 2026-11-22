// Minimal mismatch marks: keep the longest shared order, preferring earlier cards on ties.
import { CATEGORIES } from './validation.js';
export function keptPositions(t) {
  const len = Array(t.length).fill(1);
  for (let i = t.length - 1; i >= 0; i--) for (let j = i + 1; j < t.length; j++) if (t[j] > t[i]) len[i] = Math.max(len[i], len[j] + 1);
  const keep = new Set(); let need = Math.max(0, ...len), from = 0, floor = -1;
  while (need > 0) {
    let pick = -1;
    for (let j = from; j < t.length; j++) if (t[j] > floor && len[j] >= need && (pick < 0 || t[j] < t[pick])) pick = j;
    keep.add(pick); floor = t[pick]; from = pick + 1; need--;
  } return keep;
}
export function mismatchMarks(data, plan) {
  const beats = data.beats.map(b => b.beat_id), units = Object.fromEntries(data.plot_units.map(u => [u.unit_id, u]));
  const reveal = [...plan.placements].sort((a, b) => beats.indexOf(a.beat_id) - beats.indexOf(b.beat_id) || a.order - b.order);
  const marks = {};
  for (const line of data.storyline_groups) for (const category of CATEGORIES) {
    const pos = new Map(line.time_order[category].map((id, i) => [id, i]));
    const seq = reveal.filter(p => units[p.unit_id].storyline_group_id === line.id && units[p.unit_id].category === category).map(p => p.unit_id);
    const t = seq.map(id => pos.get(id)), keep = keptPositions(t);
    seq.forEach((id, i) => { if (!keep.has(i)) marks[id] = { after: seq.filter((_, j) => j > i && t[j] < t[i]), before: seq.filter((_, j) => j < i && t[j] > t[i]) }; });
  } return marks;
}
