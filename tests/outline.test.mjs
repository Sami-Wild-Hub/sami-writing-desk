// Behavioral v7 model checks use the current maritime-story documents without embedding private data.
import assert from 'node:assert/strict';
import rawTest from 'node:test';
import { createOutlineModel, cardText } from '../src/lib/views/outline/model.js';
import { presentation } from '../src/lib/views/outline/presentation.js';
import { fullTimeIndex } from '../src/lib/views/outline/ordering.js';
import { outlineFixture, hasOutline } from './outline-fixture.mjs';
const test = (name, fn) => rawTest(name, { skip: !hasOutline }, fn);
const setup = () => { const f = outlineFixture(); return createOutlineModel(f.plot_data, f.plan); };

test('time reordering does not change reveal order, and reveal reordering does not change time', () => {
  const m = setup(), ids = m.storyMap.G01.time_order.current, id = ids[0];
  const plan = m.exportPlan(); m.moveInTime(id, 'current', ids.length);
  assert.deepEqual(m.exportPlan(), plan); m.undo();
  const time = m.exportData(); m.placeInCell(id, m.beatIds.at(-1), 'current');
  assert.deepEqual(m.exportData(), time);
});
test('all three categories accept drops; a changed category appends in time but uses explicit reveal position', () => {
  const m = setup(), id = m.storyMap.G01.time_order.current[0];
  const old = [...m.storyMap.G01.time_order.combined];
  m.placeInCell(id, m.beatIds[0], 'combined', 0);
  assert.equal(m.unitMap[id].category, 'combined');
  assert.deepEqual(m.storyMap.G01.time_order.combined, [...old, id]);
  const combined = m.visibleUnits().find(u => u.category === 'combined');
  m.placeInCell(combined.unit_id, m.beatIds[2], 'combined');
  assert.equal(m.unitMap[combined.unit_id].category, 'combined');
});
test('minimal mismatch marks prefer marking later cards and disappear when restored', () => {
  const m = setup(), ids = m.storyMap.G01.time_order.current.slice(0, 3);
  assert.equal(ids.length, 3);
  m.clear(true);
  ids.forEach(id => m.placeInCell(id, m.beatIds[0], 'current'));
  assert.deepEqual(m.marks(), {});
  m.placeInCell(ids[2], m.beatIds[0], 'current', 0);
  assert.deepEqual(Object.keys(m.marks()), [ids[2]]);
  assert.deepEqual(m.marks()[ids[2]].after, ids.slice(0, 2));
  m.placeInCell(ids[2], m.beatIds[0], 'current'); assert.deepEqual(m.marks(), {});
  m.placeInCell(ids[1], m.beatIds[0], 'current', 0);
  assert.deepEqual(Object.keys(m.marks()), [ids[1]]);
  assert.deepEqual(m.marks()[ids[1]].after, [ids[0]]);
});
test('lead determines sections while ranking determines section and name order; edits and removal retain one lead', () => {
  const m = setup(), line = m.storyMap.G01, first = line.participants[0], second = line.participants[1];
  const before = m.exportWorkspace(); m.moveRank(second, 0);
  let v = presentation(m, {});
  assert.equal(v.sections().find(s => s.lines.some(l => l.id === line.id)).name, line.lead_participant);
  assert.ok(v.nameOf(v.lineOf(line.id)).startsWith(second));
  m.saveLine(line.id, 'Changed title', [first, second, 'New participant']);
  assert.equal(m.data.participant_order.at(-1), 'New participant');
  assert.throws(() => m.saveLine(line.id, 'Invalid', []));
  m.saveLine(line.id, line.title, [first, second], second);
  v = presentation(m, {}); assert.equal(v.sections().find(s => s.lines.some(l => l.id === line.id)).name, second);
  m.saveLine(line.id, line.title, [first]); assert.equal(m.storyMap[line.id].lead_participant, first);
  const stable = m.exportWorkspace(); assert.throws(() => m.saveLine(line.id, line.title, [first], second)); assert.deepEqual(m.exportWorkspace(), stable);
  const added = m.saveLine(null, 'New line', ['New participant', first]); assert.equal(m.storyMap[added].lead_participant, 'New participant');
  for (let i = 0; i < 5; i++) m.undo(); assert.deepEqual(m.exportWorkspace(), before);
});
test('v7 imports and codec round trips retain ordering, participants, category and source/extension fields', () => {
  const m = setup(), id = m.visibleUnits()[0].unit_id;
  m.editCard(id, { extra_provenance: { path: ['source'], empty: [], absent: null } });
  m.state.notes = { extension: ['kept'] };
  const before = m.exportWorkspace();
  const next = createOutlineModel(before.plot_data, before.plan);
  assert.deepEqual(next.exportWorkspace(), before);
  const bad = structuredClone(before); bad.plan.placements[0].unit_id = 'missing';
  assert.throws(() => m.importWorkspace(bad)); assert.deepEqual(m.exportWorkspace(), before);
  assert.throws(() => createOutlineModel({ ...before.plot_data, schema_version: '5.0' }, before.plan));
  const oldCategory = structuredClone(before.plot_data); oldCategory.plot_units[0].category = 'undecided';
  assert.throws(() => createOutlineModel(oldCategory, before.plan), /卡片字段无效/);
  const oldKey = structuredClone(before.plot_data); oldKey.storyline_groups[0].time_order.undecided = [];
  assert.throws(() => createOutlineModel(oldKey, before.plan), /时间顺序栏无效/);
  m.clear(true); assert.deepEqual(m.exportPlan().notes, before.plan.notes);
});
test('deleting a card removes it with its merged originals and placement; undo restores it', () => {
  const m = setup(), before = m.exportWorkspace();
  const card = m.visibleUnits().find(u => u.source_unit_ids?.length && m.used(u.unit_id)), gone = [card.unit_id, ...card.source_unit_ids];
  m.deleteCard(card.unit_id);
  assert.ok(gone.every(id => !m.unitMap[id])); assert.equal(m.used(card.unit_id), false);
  assert.ok(!m.lineCards(card.storyline_group_id).includes(card.unit_id));
  const saved = m.exportWorkspace(); assert.deepEqual(createOutlineModel(saved.plot_data, saved.plan).exportWorkspace(), saved);
  m.undo(); assert.deepEqual(m.exportWorkspace(), before);
});
test('deleting a line removes its cards, keeps originals merged into other lines, and keeps one line', () => {
  const m = setup(), before = m.exportWorkspace(), units = Object.fromEntries(before.plot_data.plot_units.map(u => [u.unit_id, u]));
  const owner = before.plot_data.plot_units.find(u => (u.source_unit_ids || []).some(s => units[s].storyline_group_id !== u.storyline_group_id));
  const src = owner.source_unit_ids.find(s => units[s].storyline_group_id !== owner.storyline_group_id), line = units[src].storyline_group_id, cards = m.lineCards(line);
  m.deleteLine(line);
  assert.equal(m.storyMap[line], undefined); assert.ok(cards.every(id => !m.unitMap[id] && !m.used(id)));
  assert.equal(m.unitMap[src].storyline_group_id, owner.storyline_group_id);
  m.undo(); assert.deepEqual(m.exportWorkspace(), before);
  const one = setup(); for (const g of one.data.storyline_groups.slice(1)) one.deleteLine(g.id);
  assert.throws(() => one.deleteLine(one.data.storyline_groups[0].id), /至少保留/);
});
test('moving a card to another line appends it to the same category and keeps its Beat placement', () => {
  const m = setup(), before = m.exportWorkspace(), p = before.plan.placements[0], unit = m.unitMap[p.unit_id];
  const from = unit.storyline_group_id, target = m.data.storyline_groups.find(g => g.id !== from).id;
  m.moveToLine(unit.unit_id, target);
  assert.equal(m.unitMap[unit.unit_id].storyline_group_id, target);
  assert.equal(m.storyMap[target].time_order[unit.category].at(-1), unit.unit_id); assert.ok(!m.lineCards(from).includes(unit.unit_id));
  assert.deepEqual(m.exportPlan(), before.plan);
  m.undo(); assert.deepEqual(m.exportWorkspace(), before);
});
test('cards show one text with only 已写/已排/未排 tags; counts read 未排|已排|total; combined reads Combined', () => {
  const m = setup(), [written, placed, unplaced] = m.visibleUnits();
  m.editCard(written.unit_id, { status: 'WRITTEN' });
  m.editCard(placed.unit_id, { status: 'PLANNED' }); m.placeInCell(placed.unit_id, m.beatIds[0], placed.category);
  m.editCard(unplaced.unit_id, { status: 'PLANNED' }); m.removeUnit(unplaced.unit_id);
  const v = presentation(m, {}), line = m.data.storyline_groups[0], ids = m.lineCards(line.id);
  const placedCount = ids.filter(m.used).length; assert.equal(v.countOf(line.id), `${ids.length - placedCount}|${placedCount}|${ids.length}`);
  assert.deepEqual(new Set(Object.values(v.S.cards).map(c => c.status)), new Set(['已写', '已排', '未排']));
  assert.equal(v.CAT_LABEL.combined, 'Combined');
  assert.equal(cardText({ element_title: '标题', content: '内容' }), '内容'); assert.equal(cardText({ element_title: '标题', content: '' }), '标题');
  const titled = m.visibleUnits()[0]; m.editCard(titled.unit_id, { element_title: '标题' }); const text = cardText(titled);
  m.editText(titled.unit_id, text, titled.details || []);
  assert.equal(m.unitMap[titled.unit_id].content, text); assert.equal(m.unitMap[titled.unit_id].element_title, ''); assert.equal(cardText(m.unitMap[titled.unit_id]), text);
});
test('manual 已写 toggle overrides placement status, clears back to 已排/未排, and undoes', () => {
  const m = setup(), [a, b] = m.visibleUnits().filter(u => u.status !== 'WRITTEN');
  const originalStatus = a.status;
  m.placeInCell(a.unit_id, m.beatIds[0], a.category); m.removeUnit(b.unit_id);
  const status = id => presentation(m, {}).S.cards[id].status;
  assert.equal(status(a.unit_id), '已排'); assert.equal(status(b.unit_id), '未排');
  m.setWritten(a.unit_id, true); m.setWritten(b.unit_id, true);
  assert.equal(status(a.unit_id), '已写'); assert.equal(status(b.unit_id), '已写'); assert.ok(m.used(a.unit_id));
  m.setWritten(a.unit_id, false); assert.equal(m.unitMap[a.unit_id].status, 'PLANNED'); assert.equal(status(a.unit_id), '已排');
  m.undo(); assert.equal(status(a.unit_id), '已写');
  m.undo(); m.undo(); assert.equal(status(a.unit_id), '已排'); assert.equal(m.unitMap[a.unit_id].status, originalStatus);
});
rawTest('a drop among shown time cards maps to the full column around hidden cards', () => {
  const ids = ['a', 'B', 'c', 'D', 'e'], shown = x => x === x.toLowerCase();   // B and D hidden
  assert.equal(fullTimeIndex(ids, 'z', shown, 0), 0);                        // before a
  assert.equal(fullTimeIndex(ids, 'z', shown, 1), 2);                        // before c, after hidden B
  assert.equal(fullTimeIndex(ids, 'z', shown, 3), 5);                        // after e
  assert.equal(fullTimeIndex(ids, 'c', shown, 0), 0);                        // dragged card itself is not counted
  assert.equal(fullTimeIndex(ids, 'c', shown, 1), 3);                        // c after e: rest is a,B,D,e
  assert.equal(fullTimeIndex(['B', 'D'], 'z', shown, 0), 2);                 // nothing shown: end
  const out = ids.filter(x => x !== 'a'); out.splice(fullTimeIndex(ids, 'a', shown, 1), 0, 'a');
  assert.deepEqual(out, ['B', 'c', 'D', 'a', 'e']);                          // a dropped between c and e keeps D before it
});
