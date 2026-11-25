// Bind the approved sample's markup to one panel's shared model and transient UI state.
import * as shared from './templates.js';
import * as outline from './render-outline.js';
import * as story from './render-story.js';
import { CATEGORIES } from './validation.js';
import { cardText } from './model.js';
export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export function presentation(model, UI) {
  const DATA = { beats: model.data.beats.map(b => ({ ...b, id: b.beat_id, note: model.state.beat_notes[b.beat_id] || '' })), kb: model.data.participants };
  const S = { ranking: model.data.participant_order, lines: model.data.storyline_groups.map(g => ({ id: g.id, title: g.title, parts: g.participants, lead: g.lead_participant })), time: Object.fromEntries(model.data.storyline_groups.map(g => [g.id, g.time_order])), cards: {}, reveal: {} };
  const D = { placedIn: {}, marks: model.marks() };
  for (const b of model.beatIds) S.reveal[b] = model.placedList().filter(p => p.beat_id === b).map(p => p.unit_id);
  for (const p of model.placedList()) D.placedIn[p.unit_id] = { beat: p.beat_id };
  for (const u of model.visibleUnits()) S.cards[u.unit_id] = { id: u.unit_id, line: u.storyline_group_id, cat: u.category, text: cardText(u), details: u.details, refs: u.source_refs, origins: (u.source_unit_ids || []).map(id => cardText(model.unitMap[id])), status: u.status === 'WRITTEN' ? '已写' : D.placedIn[u.unit_id] ? '已排' : '未排' };
  const v = { DATA, UI, S, D, CATS: CATEGORIES, CAT_LABEL: { past: 'Past', current: 'Current', combined: 'Combined' }, BEAT_IDS: model.beatIds, BEAT: Object.fromEntries(DATA.beats.map(b => [b.id, b])), KB_TYPE: Object.fromEntries(DATA.kb.map(p => [p.name, p.type])), undoStack: model.undoHistory, esc: escapeHtml, statusClass: { 已写: 'written', 已排: 'placed', 未排: 'unplaced' } };
  v.actOnly = new Set(DATA.beats.map(b => b.act)).size === DATA.beats.length;
  v.beatShort = id => v.actOnly ? `Part ${v.BEAT[id].act}` : `A${v.BEAT[id].act}·B${v.BEAT[id].beat}`;
  v.beatLong = id => v.actOnly ? `Part ${v.BEAT[id].act}` : `Act ${v.BEAT[id].act} · Beat ${v.BEAT[id].beat}`;
  v.rankOf = name => S.ranking.indexOf(name);
  v.lineOf = id => S.lines.find(l => l.id === id);
  v.partsOf = line => [...line.parts].sort((a, b) => v.rankOf(a) - v.rankOf(b));
  v.nameOf = line => `${v.partsOf(line).join(' × ')}：${line.title}`;
  v.clip = (s, n) => s.length > n ? s.slice(0, n) + '…' : s;
  v.countOf = id => {
    const ids = CATEGORIES.flatMap(c => S.time[id][c]), placed = ids.filter(x => D.placedIn[x]).length;
    return `${ids.length - placed}|${placed}|${ids.length}`;
  };
  v.sections = (lines = S.lines) => S.ranking.map(name => ({ name, lines: lines.filter(l => l.lead === name) })).filter(s => s.lines.length);
  v.list = items => `<ul>${items.map(x => `<li>${escapeHtml(x)}</li>`).join('')}</ul>`;
  v.markText = m => {
    const q = ids => ids.map(id => `「${v.clip(S.cards[id].text, 20)}」`).join('、');
    return [m.after.length && `时间上在${q(m.after)}之后`, m.before.length && `时间上在${q(m.before)}之前`].filter(Boolean).join('；');
  };
  v.markBlock = c => D.marks[c.id] ? `<div class="mark" title="揭示顺序与时间顺序不一致">⚑ ${escapeHtml(v.markText(D.marks[c.id]))}</div>` : '';
  for (const [name, fn] of Object.entries({ ...shared, ...outline, ...story })) v[name] = (...args) => fn(v, ...args);
  return v;
}
