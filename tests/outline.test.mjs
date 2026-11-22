// Behavioral v6 model checks use the current maritime-story documents without embedding private data.
import assert from 'node:assert/strict';
import rawTest from 'node:test';
import { createOutlineModel } from '../src/lib/views/outline/model.js';
import { presentation } from '../src/lib/views/outline/presentation.js';
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
  const old = [...m.storyMap.G01.time_order.undecided];
  m.placeInCell(id, m.beatIds[0], 'undecided', 0);
  assert.equal(m.unitMap[id].category, 'undecided');
  assert.deepEqual(m.storyMap.G01.time_order.undecided, [...old, id]);
  const undecided = m.visibleUnits().find(u => u.category === 'undecided');
  m.placeInCell(undecided.unit_id, m.beatIds[2], 'undecided');
  assert.equal(m.unitMap[undecided.unit_id].category, 'undecided');
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
test('participant ranking determines section, generated names, picker order; typed names append', () => {
  const m = setup(), line = m.storyMap.G01, first = line.participants[0], second = line.participants[1];
  const before = m.exportWorkspace(); m.moveRank(second, 0);
  let v = presentation(m, {});
  assert.equal(v.sections()[0].name, second);
  assert.ok(v.nameOf(v.lineOf(line.id)).startsWith(second));
  m.saveLine(line.id, 'Changed title', [first, second, 'New participant']);
  assert.equal(m.data.participant_order.at(-1), 'New participant');
  assert.throws(() => m.saveLine(line.id, 'Invalid', []));
  m.undo(); m.undo(); assert.deepEqual(m.exportWorkspace(), before);
});
test('v6 imports and codec round trips retain ordering, participants, category and source/extension fields', () => {
  const m = setup(), id = m.visibleUnits()[0].unit_id;
  m.editCard(id, { extra_provenance: { path: ['source'], empty: [], absent: null } });
  m.state.notes = { extension: ['kept'] };
  const before = m.exportWorkspace();
  const next = createOutlineModel(before.plot_data, before.plan);
  assert.deepEqual(next.exportWorkspace(), before);
  const bad = structuredClone(before); bad.plan.placements[0].unit_id = 'missing';
  assert.throws(() => m.importWorkspace(bad)); assert.deepEqual(m.exportWorkspace(), before);
  assert.throws(() => createOutlineModel({ ...before.plot_data, schema_version: '5.0' }, before.plan));
  m.clear(true); assert.deepEqual(m.exportPlan().notes, before.plan.notes);
});
