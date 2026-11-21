import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { findQuote, paraNumber, splitParagraphs } from '../src/lib/views/proof/paragraphs.ts';
import { parseReport, placeItems } from '../src/lib/views/proof/report.ts';
import { proofTask } from '../src/lib/views/proof/task.ts';

const item = { para: 'P2', quote: '铜钥匙', kind: '物品', level: '冲突', issue: '钥匙前文已交出。', evidence: ['事件编号'] };
const reply = (body) => `好的：\n\`\`\`json\n${JSON.stringify(body, null, 2)}\n\`\`\`\n还需要什么告诉我。`;

test('every non-empty line is a paragraph; blank lines and headings are not numbered', () => {
  const paras = splitParagraphs('# 第二十三章\r\n\r\n  清晨，Ann 到了码头。  \n\n\nCy 在等她。\r## 小节\n她想起父亲。\n#不是标题');
  assert.deepEqual(paras.map((p) => `${p.label} ${p.text}`), ['P1 清晨，Ann 到了码头。', 'P2 Cy 在等她。', 'P3 她想起父亲。', 'P4 #不是标题']);
  assert.deepEqual(paras.map((p) => p.n), [1, 2, 3, 4]);
  assert.deepEqual(splitParagraphs(' \n\n'), []);
});

test('paragraph labels and quotes are matched loosely across whitespace', () => {
  assert.equal(paraNumber('P12'), 12);
  assert.equal(paraNumber(' p 3 '), 3);
  assert.equal(paraNumber('第3段'), 0);
  const text = '手里攥着 那枚铜钥匙，走到灯塔下。';
  assert.deepEqual(findQuote(text, '那枚铜钥匙'), [5, 10]);
  assert.deepEqual(findQuote(text, '攥着那枚'), [2, 7]);
  assert.equal(findQuote(text, '银钥匙'), null);
  assert.equal(findQuote(text, ' '), null);
});

test('the task names the book, the rules and the reply format, then the numbered draft', () => {
  const task = proofTask({ slug: 'maritime-story', title: 'C23 "初稿"', paras: splitParagraphs('甲。\n\n乙。') });
  assert.match(task, /leahthemule\/novel-knowledge-base（main 分支）的 novels\/maritime-story\//);
  assert.match(task, /contracts\/shared\/kb-use\/overview\.md/);
  assert.match(task, /不要通读整个仓库/);
  assert.match(task, /不查语病、文风、修辞/);
  for (const kind of ['时间线', '人物', '知情', '地点', '物品', '时代', '情节']) assert.ok(task.includes(kind), kind);
  assert.ok(task.includes('{"title": "C23 \\"初稿\\"", "items": ['), 'the title is JSON-quoted in the format line');
  assert.ok(task.endsWith('新稿：\n[P1] 甲。\n[P2] 乙。\n'));
});

test('docs/proofdesk.md shows the task text verbatim', async () => {
  const docs = await readFile(new URL('../docs/proofdesk.md', import.meta.url), 'utf8');
  const sample = proofTask({ slug: 'maritime-story', title: 'C23 初稿', paras: splitParagraphs('（新稿第一段）\n（新稿第二段）') });
  assert.ok(docs.replaceAll('\r\n', '\n').includes(`\`\`\`text\n${sample}\`\`\``), 'docs/proofdesk.md is out of date with task.ts');
});

test('a reply is read from a code fence with chatter around it', () => {
  const result = parseReport(reply({ title: 'C23', items: [item], summary: '一处。' }));
  assert.equal(result.ok, true);
  assert.equal(result.report.summary, '一处。');
  assert.deepEqual(result.report.items[0], { ...item, suggestion: '', problems: [] });
});

test('braces in chatter or in strings do not confuse the reader', () => {
  const body = { title: 'x', items: [{ ...item, issue: '写成了 {钥匙} 和 "引号"' }] };
  const result = parseReport(`先说明 {这不是 JSON}，结果如下：${JSON.stringify(body)} 完。`);
  assert.equal(result.ok, true);
  assert.equal(result.report.items[0].issue, '写成了 {钥匙} 和 "引号"');
  assert.deepEqual(parseReport('{"items": []}'), { ok: true, report: { title: '', summary: '', items: [] } });
});

test('bad replies say what is wrong', () => {
  const cases = [
    ['抱歉，我无法访问这个仓库。', /没找到 JSON/],
    ['```json\n{"title": "x", "items": [{"para": "P1",}]}\n```', /JSON 格式有误/],
    ['{"title": "x", "items": [{"para": "P1"', /截断/],
    ['{"title": "x"}', /缺少 "items" 列表/],
    ['{"title": "x", "items": {"para": "P1"}}', /缺少 "items" 列表（实际是 \{"para":"P1"\}）/],
  ];
  for (const [text, error] of cases) {
    const result = parseReport(text);
    assert.equal(result.ok, false, text);
    assert.match(result.error, error);
  }
});

test('malformed items are kept, with their problems noted', () => {
  const result = parseReport(JSON.stringify({ items: [{ para: '第2段', quote: '', kind: '语病', level: '严重', issue: 'x', evidence: '事件编号' }, '一句话']}));
  assert.equal(result.ok, true);
  const [first, second] = result.report.items;
  assert.deepEqual(first.evidence, ['事件编号']);
  assert.deepEqual(first.problems.map((p) => p.split(' ')[0]), ['para', 'quote', 'kind', 'level', 'evidence']);
  assert.equal(second.issue, '一句话');
  assert.deepEqual(second.problems, ['这一条不是 {…} 对象']);
});

test('items are placed in text order; a quote not in its paragraph is kept unplaced', () => {
  const paras = splitParagraphs('甲在码头。\n乙拿着铜钥匙，又拿着铜钥匙。\n丙走了。');
  const placed = placeItems(paras, [
    { ...item, para: 'P3', quote: '丙走了' },
    { ...item, para: 'P9', quote: '甲' },
    { ...item, para: 'P2', quote: '又拿着' },
    { ...item, para: 'P2', quote: '银钥匙' },
    { ...item, para: 'P2', quote: '铜钥匙' },
    { ...item, para: 'P1', quote: '码头' },
  ]);
  assert.deepEqual(placed.map((p) => [p.item.para, p.item.quote, p.at, p.range]), [
    ['P1', '码头', 0, [2, 4]],
    ['P2', '银钥匙', 1, null],
    ['P2', '铜钥匙', 1, [3, 6]],
    ['P2', '又拿着', 1, [7, 10]],
    ['P3', '丙走了', 2, [0, 3]],
    ['P9', '甲', -1, null],
  ]);
});
