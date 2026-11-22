// Model verification follows the original editing and interchange contracts.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createOutlineModel, clone } from '../src/lib/views/outline/model.js';
import { outlineFixture } from './outline-fixture.mjs';
const setup = () => {
  const f = outlineFixture(), messages = [];
  const m = createOutlineModel(f.plot_data, f.plan, { report: (text, error) => messages.push({ text, error }) });
  return { m, f, messages };
};

test('F01–04, F42, F46: starter, ordering, counters and original source fields', () => {
  const { m, f } = setup();
  assert.equal(m.activeBeat, 'A1-B1');
  assert.equal(m.savedCount(), 6);
  assert.deepEqual(m.orderedSelected('A1-B1', 'RELATIONSHIP', 'CURRENT').map(p => p.unit_id), ['E001','E004']);
  const out = m.exportData();
  assert.deepEqual(out.source_nodes, f.plot_data.source_nodes);
  assert.deepEqual(out.branches, f.plot_data.branches);
  assert.deepEqual(out.plot_units.filter(u => !u.is_custom), f.plot_data.plot_units.filter(u => !u.is_custom));
  assert.equal(out.counts.original_plot_units, 2);
  assert.equal(out.counts.user_added_plot_units, 6);
  assert.equal(out.counts.relationship + out.counts.event, 8);
  assert.equal(out.schema_version, '5.0');
});

test('F20–23: unique placement, removal, whole moves and cross-Beat chronology', () => {
  const { m, messages } = setup();
  m.assign('E001', 'A3-B2');
  assert.equal(m.state.placements.E001.beat_id, 'A1-B1');
  m.moveUnit('E001', 'A2-B1');
  assert.equal(m.state.placements.E001.beat_id, 'A1-B1');
  assert.match(messages.at(-1).text, /顺序/);
  m.removeUnit('E006');
  assert.equal(m.used('E006'), false);
  m.assign('E006', 'A3-B2');
  assert.equal(m.state.placements.E006.beat_id, 'A3-B2');
  assert.deepEqual(m.unitMap.E006.details, ['First detail','Second detail']);
  m.removeUnit('U001');
  m.assign('U001', 'A3-B2');
  assert.equal(m.used('U001'), false);
});

test('F18, F24–25: explicit era, category override round-trip and time collisions', () => {
  const { m, messages } = setup();
  m.assign('U002','A1-B1');
  assert.equal(m.used('U002'), false);
  m.switchEra('E001','UNASSIGNED');
  assert.equal(m.unitMap.E001.era, 'CURRENT');
  assert.match(messages.at(-1).text, /不能改为/);
  m.switchKind('E001','EVENT');
  assert.equal(m.kindOf(m.unitMap.E001),'EVENT');
  m.switchKind('E001','RELATIONSHIP');
  assert.equal(Object.hasOwn(m.state.kind_overrides,'E001'), false);
  m.switchEra('E003','CURRENT');
  assert.equal(m.unitMap.E003.sequence, 1.5);
  assert.equal(m.unitMap.E003.original_era, 'PAST');
  m.undo();
  assert.equal(m.unitMap.E003.era, 'PAST');
});

test('F23, F25: changing an era that would reverse another Beat is atomic', () => {
  const { m, messages } = setup();
  m.removeUnit('E003'); m.moveUnit('E001','A1-B2');
  m.assign('E003','A2-B1');
  const before = m.exportWorkspace();
  m.switchEra('E003','CURRENT');
  assert.match(messages.at(-1).text, /不能改变时间层/);
  assert.deepEqual(m.exportWorkspace(), before);
});

test('F27–31: custom group/unit defaults, ID allocation, interpolation and source preservation', () => {
  const { m, f } = setup();
  assert.throws(() => m.createStoryline('EVENT','  ','x'), /不能为空/);
  const gid = m.createStoryline('EVENT',' New line ',' Summary ');
  const sid = m.storyMap[gid].source_storyline_ids[0];
  assert.equal(m.data.storylines.find(s => s.id === sid).title, 'New line');
  const id = m.createUnit({ groupId: 'G01', kind:'RELATIONSHIP', era:'CURRENT', content:' Follow ', afterId:'E001', beat:'A1-B1', details:['One'] });
  assert.equal(id,'UNEW001');
  assert.equal(m.unitMap[id].sequence, 1.5);
  assert.equal(m.unitMap[id].status, 'PLANNED');
  assert.equal(m.unitMap[id].source_id, null);
  assert.deepEqual(m.unitMap[id].source_unit_ids, []);
  const poolId = m.createUnit({ groupId:gid, kind:'EVENT', era:'PAST', content:'Pool' });
  assert.equal(poolId,'UNEW002');
  assert.equal(m.used(poolId), false);
  assert.throws(() => m.createUnit({ groupId:gid, kind:'EVENT', era:'PAST', content:' ' }), /不能为空/);
  assert.equal(m.unitMap.E002.sequence, 2);
  assert.deepEqual(m.exportData().source_nodes, f.plot_data.source_nodes);
});

test('F33–34: source deletion refusal and only empty custom groups can be deleted', () => {
  const { m, messages } = setup();
  m.deleteNewUnit('U001');
  assert.ok(m.unitMap.U001);
  assert.equal(messages.at(-1).error, true);
  const gid = m.createStoryline('EVENT','Custom','');
  const id = m.createUnit({ groupId:gid, kind:'EVENT', era:'CURRENT', content:'Turn' });
  m.deleteNewGroup(gid);
  assert.ok(m.storyMap[gid]);
  m.deleteNewUnit(id); m.deleteNewGroup(gid);
  assert.equal(m.storyMap[gid], undefined);
  assert.equal(m.data.storylines.some(s => s.storyline_group_id === gid), false);
  m.undo(); assert.ok(m.storyMap[gid]);
});

test('F35–38: bounded undo, clear semantics and reversible starter restore', () => {
  const { m } = setup();
  const before = m.exportWorkspace();
  m.switchKind('E001','EVENT'); m.clear(true);
  assert.deepEqual(m.exportPlan().placements, []);
  assert.deepEqual(m.state.beat_notes, {});
  assert.deepEqual(m.state.kind_overrides, {});
  assert.equal(m.data.plot_units.length,8);
  m.undo(); assert.equal(m.kindOf(m.unitMap.E001),'EVENT');
  m.restore(); assert.deepEqual(m.exportWorkspace(), before);
  m.undo(); assert.equal(m.kindOf(m.unitMap.E001),'EVENT');
  for (let i=0;i<55;i++) m.snapshot();
  assert.equal(m.undoHistory.length,50);
});

test('F41–45: workspace/plan/data imports are atomic and round-trip all unknown fields', () => {
  const { m } = setup();
  m.data.plot_units[0].extra_provenance = { path:['original'], empty:[], absent:null };
  const original = m.exportWorkspace();
  const bad = clone(original); bad.plan.placements[0].unit_id = 'missing';
  const undoCount = m.undoHistory.length;
  assert.throws(() => m.importWorkspace(bad), /未知/);
  assert.deepEqual(m.exportWorkspace(), original);
  assert.equal(m.undoHistory.length, undoCount);
  const badData = clone(original.plot_data); badData.plot_units = [];
  assert.throws(() => m.importData(badData), /无效|未知/);
  assert.deepEqual(m.exportWorkspace(), original);
  m.importPlan(original.plan); m.importData(original.plot_data); m.importWorkspace(original);
  assert.deepEqual(m.exportWorkspace(), original);
  const empty = { ...original, plan: { placements:[] }, active_beat:'unknown' };
  m.importWorkspace(empty);
  assert.equal(m.activeBeat,'A1-B1');
  assert.equal(m.savedCount(),0);
});

test('F44: data import rejects missing arrays, duplicate IDs, bad fields and references', () => {
  const { m, f } = setup();
  const invalid = [
    d => { delete d.storylines; },
    d => d.storyline_groups.push(d.storyline_groups[0]),
    d => d.beats.push(d.beats[0]),
    d => d.plot_units.push(d.plot_units[0]),
    d => { d.plot_units[0].era='INVALID'; },
    d => { d.plot_units[0].kind='INVALID'; },
    d => { d.plot_units[0].sequence='one'; },
    d => { d.plot_units[0].content=null; },
    d => { d.plot_units[0].storyline_group_id='missing'; },
    d => { d.storyline_groups[0].title=null; },
    d => { d.plot_units[0].details='bad'; },
    d => { d.plot_units[0].source_unit_ids='bad'; },
    d => { d.storyline_groups[0].kinds='bad'; },
    d => { d.storyline_groups[0].summary=42; },
    d => { d.beats=[]; },
  ];
  for (const mutate of invalid) {
    const d = clone(f.plot_data); mutate(d);
    assert.throws(() => m.importData(d));
  }
});

test('F45: plan import rejects duplicates, unknowns, conflicting eras and inversions', () => {
  const { m, f } = setup();
  const invalid = [
    p => { delete p.placements; },
    p => p.placements.push(p.placements[0]),
    p => { p.placements[0].unit_id='missing'; },
    p => { p.placements[0].beat_id='missing'; },
    p => { p.placements[0].era='PAST'; },
    p => { p.placements[0].era='UNASSIGNED'; },
    p => { p.placements[0].beat_id='A3-B2'; },
    p => { p.kind_overrides={ missing:'EVENT' }; },
    p => { p.kind_overrides={ E001:'INVALID' }; },
    p => { p.beat_notes={ missing:'note' }; },
  ];
  for (const mutate of invalid) {
    const p = clone(f.plan); mutate(p);
    assert.throws(() => m.importPlan(p));
  }
  const p = clone(f.plan); p.placements[0].order='bad'; p.beat_notes['A1-B1']=42;
  m.importPlan(p);
  assert.equal(m.state.placements.E001.order,10);
  assert.equal(m.state.beat_notes['A1-B1'],'42');
});

test('pending nodes go to a chosen library storyline and take their rank from the Beat they are placed in', () => {
  const { m, f } = setup();
  m.moveUnit('E002', 'A3-B2');
  m.toLibrary('U002', 'G01', 'RELATIONSHIP', 'CURRENT');
  const added = m.data.plot_units.at(-1);
  assert.deepEqual([added.storyline_group_id, added.era, added.status, added.source_unit_ids], ['G01', 'CURRENT', 'PLANNED', ['U002']]);
  assert.equal(m.used(added.unit_id), false);
  assert.deepEqual(m.unitMap.U002, f.plot_data.plot_units.find(u => u.unit_id === 'U002'));
  m.assign(added.unit_id, 'A2-B1');
  assert.equal(m.state.placements[added.unit_id].beat_id, 'A2-B1');
  assert.ok(added.sequence > 1 && added.sequence < 2);
  const workspace = m.exportWorkspace();
  m.importWorkspace(workspace);
  assert.deepEqual(m.exportWorkspace(), workspace);

  m.removeUnit('E006');
  m.switchEra('E006', 'UNASSIGNED');
  m.toLibrary('E006', 'G02', 'RELATIONSHIP', 'PAST');
  const moved = m.unitMap.E006;
  assert.deepEqual([moved.storyline_group_id, moved.kind, moved.era], ['G02', 'RELATIONSHIP', 'PAST']);
  assert.equal(m.used('E006'), false);
});
