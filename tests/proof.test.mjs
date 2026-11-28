import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { findQuote, paraNumber, splitParagraphs } from '../src/lib/views/proof/paragraphs.ts';
import { parseReport, placeItems } from '../src/lib/views/proof/report.ts';
import { newId, queuedRecord, reportsOf } from '../src/lib/views/proof/store.ts';
import { CHECKS, TASKS, manuscriptTask, openTask } from '../src/lib/views/proof/task.ts';

const cli = fileURLToPath(new URL('../src/lib/views/proof/cli.ts', import.meta.url));

const item = { para: 'P2', quote: '铜钥匙在她手里。', kind: '连续性', issue: '钥匙前文已交出。', evidence: ['事件编号'] };
const reply = (body) => `好的：\n\`\`\`json\n${JSON.stringify(body, null, 2)}\n\`\`\`\n还需要什么告诉我。`;

test('every non-empty line is a paragraph; blank lines and headings are not numbered', () => {
  const paras = splitParagraphs('# 第二十三章\r\n\r\n  清晨，Ann 到了码头。  \n\n\nCy 在等她。\r## 小节\n她想起父亲。\n#不是标题');
  assert.deepEqual(paras.map((p) => `${p.label} ${p.text}`), ['P1 清晨，Ann 到了码头。', 'P2 Cy 在等她。', 'P3 她想起父亲。', 'P4 #不是标题']);
  assert.deepEqual(paras.map((p) => p.n), [1, 2, 3, 4]);
  assert.deepEqual(splitParagraphs(' \n\n'), []);
});

test('imported task exports number only the matching marked manuscript', () => {
  const id = 'f6c9aaf0-ff47-40ee-b714-e94debc0c93b';
  const draft = ['# 校稿任务', '只审校以下指定新稿。', 'JSON 格式示例', '{"findings":[]}',
    '<<< ' + id + ' 受检正文 开始 >>>', '甲。', '', '乙。', '<<< ' + id + ' 受检正文 结束 >>>',
    '作者确认补录，不属于新稿。'].join('\r\n');
  assert.deepEqual(splitParagraphs(draft), splitParagraphs('甲。\n乙。'));
  for (const check of CHECKS) {
    const output = spawnSync(process.execPath, [cli, 'task'], {
      input: JSON.stringify({ check, slug: 'maritime-story', title: 'T', draft }), encoding: 'utf8'
    });
    assert.equal(output.status, 0);
    assert.ok(output.stdout.endsWith('新稿：\n[P1] 甲。\n[P2] 乙。\n'));
    assert.doesNotMatch(output.stdout, /只审校以下指定新稿|作者确认补录/);
  }
  const mismatched = draft.replace(id + ' 受检正文 结束', '00000000-0000-0000-0000-000000000000 受检正文 结束');
  assert.equal(splitParagraphs(mismatched)[0].text, '只审校以下指定新稿。');
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

test('both tasks name the book, the rules and the reply format, then the numbered draft', () => {
  const input = { slug: 'maritime-story', title: 'C23 "初稿"', paras: splitParagraphs('甲。\n\n乙。') };
  const open = openTask(input);
  assert.match(open, /leahthemule\/novel-knowledge-base（main 分支）的 novels\/maritime-story\//);
  assert.match(open, /历史 KB：novels\/maritime-story\/kb\//);
  const manuscript = manuscriptTask(input);
  assert.match(manuscript, /novels\/maritime-story\/manuscript\//);
  assert.match(manuscript, /历史 KB：不使用，以已写正文为历史/);
  assert.match(manuscript, /先按新稿的章名找这一章的旧版本；有的话逐段对照/);
  for (const task of [open, manuscript]) {
    assert.match(task, /contracts\/shared\/kb-use\/manuscript-check\.md/);
    assert.match(task, /contracts\/manuscript-check\/semantic\.md/);
    assert.match(task, /受检范围仅为本份新稿/);
    assert.match(task, /完整原句，逐字照抄/);
    for (const kind of ['文字', '连续性', '人物', '世界设定', '推演', '资料补充']) assert.ok(task.includes(kind), kind);
    assert.doesNotMatch(task, /只查这几类|读法|不查语病|本次跳过/);
    assert.ok(task.includes('{"title": "C23 \\"初稿\\"", "items": ['), 'the title is JSON-quoted in the format line');
    assert.ok(task.endsWith('新稿：\n[P1] 甲。\n[P2] 乙。\n'));
  }
  for (const check of CHECKS) {
    assert.equal(TASKS[check]({ ...input, skipProse: false }), TASKS[check](input));
    assert.equal(TASKS[check]({ ...input, skipProse: true }), TASKS[check](input) + '\n本次跳过 Tag `文字`（字词、语法、标点校勘），其他按合同执行。\n');
  }
});

test('docs/proofdesk.md shows both task texts verbatim', async () => {
  const docs = (await readFile(new URL('../docs/proofdesk.md', import.meta.url), 'utf8')).replaceAll('\r\n', '\n');
  const input = { slug: 'maritime-story', title: 'C23 初稿', paras: splitParagraphs('（新稿第一段）\n（新稿第二段）') };
  for (const check of CHECKS) assert.ok(docs.includes(`\`\`\`text\n${TASKS[check](input)}\`\`\``), `docs/proofdesk.md is out of date with task.ts (${check})`);
});

test('the watcher CLI prints a task, reads a reply, and refuses an empty draft', () => {
  const run = (args, input) => spawnSync(process.execPath, [cli, ...args], { input, encoding: 'utf8' });
  for (const check of CHECKS) for (const skipProse of [false, true]) {
    const input = { check, slug: 'maritime-story', title: 'T', draft: '# 第1章\n甲。', skipProse };
    const output = run(['task'], JSON.stringify(input));
    assert.equal(output.status, 0);
    assert.equal(output.stdout, TASKS[check]({ ...input, paras: splitParagraphs(input.draft) }));
  }
  const task = run(['task'], JSON.stringify({ check: 'manuscript', slug: 'maritime-story', title: 'T', draft: '# 第1章\n甲。' }));
  assert.equal(task.status, 0);
  assert.equal(task.stdout, manuscriptTask({ slug: 'maritime-story', title: 'T', paras: splitParagraphs('甲。') }));
  assert.deepEqual(JSON.parse(run(['report'], reply({ items: [item] })).stdout), parseReport(reply({ items: [item] })));
  const empty = run(['task'], JSON.stringify({ check: 'open', slug: 's', title: 'T', draft: '# 只有标题' }));
  assert.equal(empty.status, 2);
  assert.match(empty.stderr, /没有可编号的段落/);
  assert.equal(run(['task'], JSON.stringify({ check: 'nope', slug: 's', title: 'T', draft: '甲' })).status, 2);
  assert.equal(run([], '').status, 2);
});

test('paste queues only open; Drive queues both checks and keeps only its own source', () => {
  const base = { id: 'x', title: 'T', createdAt: 5, draft: '甲', driveName: '第22章' };
  assert.deepEqual(queuedRecord({ ...base, source: 'paste' }), {
    id: 'x', title: 'T', createdAt: 5, updatedAt: 5, source: 'paste', draft: '甲', status: 'queued',
    checks: { open: { status: 'queued' } },
  });
  const drive = queuedRecord({ ...base, source: 'drive' });
  assert.equal(drive.driveName, '第22章');
  assert.deepEqual(drive.checks, { manuscript: { status: 'queued' }, open: { status: 'queued' } });
  assert.equal('draft' in drive, false);
  for (const source of ['paste', 'drive']) for (const skipProse of [false, true]) {
    assert.equal(queuedRecord({ ...base, source, skipProse }).skipProse, skipProse);
  }
  assert.match(newId(Date.UTC(2026, 10, 21, 15, 30, 12)), /^20261121-153012-[0-9a-f]{4}$/);
});

test('reports are listed oldest first, per check', () => {
  const r = (id, check, createdAt) => ({ id, check, attempt: 1, createdAt, report: '' });
  const record = { reports: { b: r('b', 'open', 3), a: r('a', 'manuscript', 2), c: r('c', 'open', 1) } };
  assert.deepEqual(reportsOf(record).map((x) => x.id), ['c', 'a', 'b']);
  assert.deepEqual(reportsOf(record, 'open').map((x) => x.id), ['c', 'b']);
  assert.deepEqual(reportsOf({}), []);
});

test('a reply is read from a code fence with chatter around it', () => {
  const result = parseReport(reply({ title: 'C23', items: [item], summary: '一处。' }));
  assert.equal(result.ok, true);
  assert.equal(result.report.summary, '一处。');
  assert.deepEqual(result.report.items[0], { ...item, suggestion: '', problems: [] });
});

test('MC Tags are accepted without level; old kinds and invalid optional levels are flagged', () => {
  for (const kind of ['文字', '连续性', '人物', '世界设定', '推演', '资料补充']) {
    const parsed = parseReport(JSON.stringify({ items: [{ ...item, kind }] }));
    assert.deepEqual(parsed.report.items[0].problems, []);
    assert.equal(parsed.report.items[0].level, undefined);
  }
  for (const kind of ['时间线', '知情', '地点', '物品', '时代', '情节', '其他']) {
    assert.match(parseReport(JSON.stringify({ items: [{ ...item, kind }] })).report.items[0].problems[0], /^kind /);
  }
  assert.deepEqual(parseReport(JSON.stringify({ items: [{ ...item, level: '提示' }] })).report.items[0].problems, []);
  assert.match(parseReport(JSON.stringify({ items: [{ ...item, level: 3 }] })).report.items[0].problems[0], /^level /);
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
