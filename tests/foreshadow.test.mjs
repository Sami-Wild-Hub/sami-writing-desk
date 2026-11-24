// Author preservation, filtering, identity and reader URLs for the foreshadow table.
import assert from 'node:assert/strict';
import test from 'node:test';
import { foreshadowFixture } from './foreshadow-fixture.mjs';
import { validateForeshadow, addRow, deleteRow, filterRows, plantingParts, OPEN } from '../src/lib/views/foreshadow/model.js';
import { rowHtml, plantingHtml } from '../src/lib/views/foreshadow/render.ts';

test('editing author cells leaves derived links and unrelated metadata untouched', () => {
  const data = validateForeshadow(foreshadowFixture()), before = structuredClone(data);
  data.rows[0].author['伏笔／线索内容'] = 'New text\nwith a line break';
  data.rows[0].author['埋设章节'] = 'C3';
  validateForeshadow(data);
  assert.deepEqual(data.rows[0].derived, before.rows[0].derived);
  assert.deepEqual(data.source, before.source);
  const row = addRow(data);
  row.author['伏笔ID'] = 'one'; // The author ID is a cell, not the internal row identity.
  assert.deepEqual(row.derived, { recovery_chapters: [] });
  validateForeshadow(data);
  deleteRow(data, data.rows[0]);
  assert.equal(data.rows[1].source_row, 7);
  assert.equal(data.sheets[0].data_rows, 2);
  assert.deepEqual(data.rows[0], before.rows[1]);
});

test('status filter hides only 已收 by default; chapter filter reads the chapter of each 埋设章节 piece', () => {
  const data = foreshadowFixture();
  data.rows[1].author['是否已收'] = '已收';
  assert.deepEqual(filterRows(data, OPEN).map(r => r.author['伏笔ID']), ['one']);
  assert.equal(filterRows(data, '').length, 2);
  assert.equal(filterRows(data, '已收', 'C2')[0].author['伏笔ID'], 'two');
  assert.equal(filterRows(data, '部分回收', 'C2').length, 0);
  data.rows[0].author['埋设章节'] = 'C12P34-37，C15P1'; data.rows[1].author['埋设章节'] = '';
  assert.equal(filterRows(data, '', 'C15').length, 1);
  assert.equal(filterRows(data, '', '未标注')[0].author['伏笔ID'], 'two');
});

test('埋设章节 pieces keep the author text and separators; only CxPy, CxPy-z and Cx are locations', () => {
  assert.deepEqual(plantingParts('C12P34-37，C15P1'), [{ text: 'C12P34-37', chapter: 12, paragraph: 34 }, { text: '，' }, { text: 'C15P1', chapter: 15, paragraph: 1 }]);
  assert.deepEqual(plantingParts('C3'), [{ text: 'C3', chapter: 3, paragraph: 0 }]);
  assert.deepEqual(plantingParts('C1#P8 或 C0P1'), [{ text: 'C1#P8' }, { text: ' ' }, { text: '或' }, { text: ' ' }, { text: 'C0P1' }]);
  assert.equal(plantingParts('').length, 0);
});

test('links follow readerHref with lowercase paragraph anchors; author text is escaped verbatim', () => {
  const data = foreshadowFixture();
  const host = { readerHref: (path, hash = '') => `/sami-writing-desk/book/?doc=${path}${hash}` };
  const html = rowHtml(data, data.rows[0], host);
  assert.ok(html.includes('A clue\nSecond line'));
  assert.ok(html.includes('source/C1.md#p2') && html.includes('>C1P2</a>'));
  assert.ok(html.includes('source/C2.md'));
  assert.ok(rowHtml(data, data.rows[1], host).includes('&lt;script&gt;literal&lt;/script&gt;'));
  assert.ok(plantingHtml('C2P5-6', host).includes('source/C2.md#p5'));
  const several = plantingHtml('C12P34-37，C15P1', host);
  assert.ok(several.includes('source/C12.md#p34') && several.includes('</a>，<a') && several.includes('source/C15.md#p1"'));
  assert.ok(plantingHtml('C3', host).includes('href="/sami-writing-desk/book/?doc=source/C3.md"'));
  assert.ok(plantingHtml('C1P2', { readerHref: () => null }).includes('尚未同步'));
});

test('invalid recovery links, missing author cells and duplicate identities fail validation', () => {
  for (const corrupt of [d => { d.rows[0].derived.recovery_chapters = ['javascript:bad']; },
    d => { delete d.rows[0].author['备注']; }, d => { d.rows[1].source_row = 5; }]) {
    const data = foreshadowFixture(); corrupt(data); assert.throws(() => validateForeshadow(data));
  }
});
