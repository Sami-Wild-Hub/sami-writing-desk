// Author preservation, filtering, identity and reader URLs for the foreshadow table.
import assert from 'node:assert/strict';
import test from 'node:test';
import { foreshadowFixture } from './foreshadow-fixture.mjs';
import { validateForeshadow, addRow, filterRows, plantingChapterText, plantingParts, recoveryChapters, setCell, visibleColumns, OPEN } from '../src/lib/views/foreshadow/model.js';
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
  assert.deepEqual(data.rows.map(r => r.source_row), [5, 6, 7]);
  assert.equal(data.sheets[0].data_rows, 3);
});

test('new rows go below a chosen row, continue numeric IDs and take preset cells; 实际回收章节 drives recovery links', () => {
  const data = foreshadowFixture();
  data.rows[0].author['伏笔ID'] = '7'; data.rows[1].author['伏笔ID'] = '12';
  const row = addRow(data, data.rows[0], { 埋设章节: 'C3', 是否已收: '部分回收', 实际回收章节: 'C4，C9' });
  assert.deepEqual(data.rows.map(r => r.author['伏笔ID']), ['7', '13', '12']);
  assert.equal(row.source_row, 7);
  assert.equal(row.author['埋设章节'], 'C3');
  assert.deepEqual(row.derived.recovery_chapters, ['C4', 'C9']);
  validateForeshadow(data);
  setCell(data.rows[0], '实际回收章节', 'C5，x');
  assert.deepEqual(data.rows[0].derived.recovery_chapters, ['C5']);
  assert.deepEqual(recoveryChapters('C2、C12P3、C2'), ['C2', 'C12']);
  assert.deepEqual(recoveryChapters('还没写'), []);
});

test('status filter hides 已收 and 不需要 by default; chapter filter reads the chapter of each 埋设章节 piece', () => {
  const data = foreshadowFixture();
  data.rows[1].author['是否已收'] = '已收';
  assert.deepEqual(filterRows(data, OPEN).map(r => r.author['伏笔ID']), ['one']);
  data.rows[0].author['是否已收'] = '不需要';
  assert.equal(filterRows(data, OPEN).length, 0);
  assert.equal(filterRows(data, '不需要')[0].author['伏笔ID'], 'one');
  data.rows[0].author['是否已收'] = '部分回收';
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
  assert.deepEqual(plantingParts('12'), [{ text: '12', chapter: 12, paragraph: 0 }]);
});

test('the table shows 埋设章节 as chapter numbers only; unrecognized text stays as written', () => {
  assert.equal(plantingChapterText('C1P10-11'), '1');
  assert.equal(plantingChapterText('C12P34-37，C15P1，C12P40'), '12，15');
  assert.equal(plantingChapterText('3'), '3');
  assert.equal(plantingChapterText('待定'), '待定');
  assert.equal(plantingChapterText(''), '');
});

test('the quote links to its planting paragraph, recovery chapters link in place, cells are inputs with author text escaped verbatim', () => {
  const data = foreshadowFixture();
  const host = { readerHref: (path, hash = '') => `/sami-writing-desk/book/?doc=${path}${hash}` };
  const html = rowHtml(data, data.rows[0], host);
  assert.ok(html.includes('data-kind="planting"') && html.includes('source/C1.md#p2') && html.includes('>A clue\nSecond line</a>'));
  assert.ok(html.includes('data-col="埋设章节" aria-label="埋设章节" spellcheck="false">\n1</textarea>'));
  assert.ok(html.includes('data-kind="recovery"') && html.includes('source/C2.md') && html.includes('>C2</a>'));
  assert.ok(html.includes('<select class="fsh-input" data-col="是否已收"') && html.includes('<option value="部分回收" selected>'));
  assert.ok(html.includes('<option value="不需要">'));
  assert.ok(!html.includes('回收方式／揭示内容') && !html.includes('重要程度') && !html.includes('<button'));
  assert.deepEqual(visibleColumns(data).map(c => c.header), ['伏笔ID', '埋设章节', '伏笔／线索内容', '是否已收', '实际回收章节', '回收场景／位置', '备注']);
  const literal = rowHtml(data, data.rows[1], host);
  assert.ok(literal.includes('&lt;script&gt;literal&lt;/script&gt;') && !literal.includes('<script>'));
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
