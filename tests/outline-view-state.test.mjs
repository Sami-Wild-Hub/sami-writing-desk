// The workbench reopens where it was left, and stale or damaged saved state falls back quietly.
import assert from 'node:assert/strict';
import test from 'node:test';
import { viewStore } from '../src/lib/views/outline/view-state.js';

const memory = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), raw: m }; };
const model = { storyMap: { G01: {}, G07: {} }, beatIds: ['b1', 'b2', 'b3'] };
const view = { tab: 'outline', line: 'G07', beat: 'b3', open: new Set(['lib:G07']), filters: new Set(['placed', 'written']), onlyUnplaced: false, scroll: { library: 420, 'col-past': 80 }, y: 300 };

test('round-trips tab, storyline, Beat, open groups, filters and scroll', () => {
  const storage = memory(), store = viewStore('k:view', storage);
  store.save(view);
  assert.deepEqual(store.load(model), view);
});

test('storylines or Beats that no longer exist are dropped, the rest is kept', () => {
  const storage = memory(), store = viewStore('k:view', storage);
  store.save({ ...view, line: 'G99', beat: 'gone' });
  const loaded = store.load(model);
  assert.equal(loaded.line, undefined); assert.equal(loaded.beat, undefined);
  assert.equal(loaded.tab, 'outline'); assert.deepEqual([...loaded.open], ['lib:G07']);
});

test('damaged or foreign values never throw', () => {
  const storage = memory(), store = viewStore('k:view', storage);
  assert.deepEqual(store.load(model), {});
  storage.setItem('k:view', '{not json'); assert.deepEqual(store.load(model), {});
  storage.setItem('k:view', JSON.stringify({ tab: 'x', filters: ['bogus', 'placed'], open: 'nope', onlyUnplaced: 'yes', scroll: { a: -1, b: 'x', c: 5 }, y: NaN }));
  assert.deepEqual(store.load(model), { filters: new Set(['placed']), scroll: { c: 5 } });
});

test('a full or blocked storage does not break saving', () => {
  const store = viewStore('k:view', { getItem: () => null, setItem: () => { throw Error('QuotaExceeded'); } });
  assert.doesNotThrow(() => store.save(view));
});
