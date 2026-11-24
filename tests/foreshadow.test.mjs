// Author preservation, filtering, identity and reader URLs for the foreshadow table.
import assert from 'node:assert/strict';
import test from 'node:test';
import { foreshadowFixture } from './foreshadow-fixture.mjs';
import { validateForeshadow, addRow, deleteRow, filterRows } from '../src/lib/views/foreshadow/model.js';
import { rowHtml, plantingLink } from '../src/lib/views/foreshadow/render.ts';

test('editing author cells leaves derived links and unrelated metadata untouched', () => {
  const data = validateForeshadow(foreshadowFixture()), before = structuredClone(data);
  data.rows[0].author['伏笔／线索内容'] = 'New text\nwith a line break';
  data.rows[0].author['埋设章节'] = 'C3';
  validateForeshadow(data);
  assert.deepEqual(data.rows[0].derived, before.rows[0].derived);
  assert.deepEqual(data.source, before.source);
  const row = addRow(data);
  row.author['伏笔ID'] = 'one'; // The author ID is a cell, not the internal row identity.
  validateForeshadow(data);
  deleteRow(data, data.rows[0]);
  assert.equal(data.rows[1].source_row, 7);
  assert.equal(data.sheets[0].data_rows, 2);
  assert.deepEqual(data.rows[0], before.rows[1]);
});

test('filters distinguish unmarked status and retain author chapter values', () => {
  const data = foreshadowFixture();
  assert.equal(filterRows(data, '已收', 'C1').length, 1);
  assert.equal(filterRows(data, '未标注', 'C2')[0].author['伏笔ID'], 'two');
  assert.equal(filterRows(data, '已收', 'C2').length, 0);
});

test('links follow readerHref with lowercase paragraph anchors; author text is escaped verbatim', () => {
  const data = foreshadowFixture();
  const host = { readerHref: (path, hash = '') => `/sami-writing-desk/book/?doc=${path}${hash}` };
  const html = rowHtml(data, data.rows[0], host);
  assert.ok(html.includes('A clue\nSecond line'));
  assert.ok(html.includes('source/C1.md#p2'));
  assert.ok(html.includes('source/C2.md'));
  assert.ok(rowHtml(data, data.rows[1], host).includes('&lt;script&gt;literal&lt;/script&gt;'));
  assert.ok(plantingLink(data.rows[1], host).includes('source/C2.md#p5'));
  assert.ok(plantingLink(data.rows[0], { readerHref: () => null }).includes('尚未同步'));
});

test('invalid links, missing author cells and duplicate identities fail validation', () => {
  for (const corrupt of [d => { d.rows[0].derived.planting_location.link = 'javascript:bad'; },
    d => { delete d.rows[0].author['备注']; }, d => { d.rows[1].source_row = 5; }]) {
    const data = foreshadowFixture(); corrupt(data); assert.throws(() => validateForeshadow(data));
  }
});
