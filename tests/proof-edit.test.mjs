// Suggested sentence validation, character diffs and exact reversible replacements.
import assert from 'node:assert/strict';
import test from 'node:test';
import { sentenceDiff, fixProblem } from '../src/lib/views/proof/diff.ts';
import { replacement } from '../src/lib/views/proof/edit.ts';
import { parseReport } from '../src/lib/views/proof/report.ts';
import { resultHtml } from '../src/lib/views/proof/render.ts';
import { splitParagraphs } from '../src/lib/views/proof/paragraphs.ts';

const quote = '他是高大结实的男人。', fix = '他是个高大、结实的男人。';
const item = { para: 'P1', quote, fix, kind: '人物', issue: '少字和标点', evidence: [], suggestion: '' };
const read = (fields) => parseReport(JSON.stringify({ items: [{ ...item, ...fields }] })).report.items[0];

test('Chinese diff marks only changed characters and preserves Unicode code points', () => {
  const diff = sentenceDiff(quote, fix);
  assert.deepEqual(diff.filter(c => c.kind === 'add').map(c => c.text), ['个', '、']);
  assert.equal(diff.filter(c => c.kind !== 'remove').map(c => c.text).join(''), fix);
  assert.equal(diff.filter(c => c.kind !== 'add').map(c => c.text).join(''), quote);
  assert.deepEqual(sentenceDiff('他又又来了😀。', '他又来了😀。').filter(c => c.kind === 'remove'), [{ kind: 'remove', text: '又' }]);
});

test('fix is optional for every Tag; invalid fixes remain visible with format problems', () => {
  for (const kind of ['文字', '人物', '连续性', '世界设定', '推演', '资料补充']) assert.deepEqual(read({ kind }).problems, []);
  assert.equal(read({ fix: undefined }).fix, undefined);
  for (const bad of [quote, '', '完全不同的一句话。', 42]) {
    assert.ok(read({ fix: bad }).problems.some(p => p.startsWith('fix ')));
    assert.ok(fixProblem(quote, bad));
  }
});

test('accept/undo replace only the exact sentence; edited, absent or ambiguous text is disabled', () => {
  assert.equal(replacement(`前文。${quote}后文。`, item, false).text, `前文。${fix}后文。`);
  assert.equal(replacement(`前文。${fix}后文。`, item, true).text, `前文。${quote}后文。`);
  assert.match(replacement('手改后的正文。', item, false).reason, /原句已被修改/);
  assert.match(replacement('手改后的正文。', item, true).reason, /建议句已被修改/);
  assert.match(replacement(undefined, item, false).reason, /没有这一段/);
  assert.match(replacement(quote + quote, item, false).reason, /出现多次/);
});

test('cards show safe diffs and accept by field presence, and retain malformed fixes without accept', () => {
  const record = (fields) => ({ checks: { open: { status: 'done' } }, reports: {
    'open-1': { id: 'open-1', check: 'open', attempt: 1, createdAt: 1, report: JSON.stringify({ items: [{ ...item, ...fields }] }) },
  } });
  const render = (fields) => resultHtml(splitParagraphs(quote), record(fields), {}, 'all');
  assert.match(render({}), /<ins>个<\/ins>/);
  assert.match(render({}), /data-accept=/);
  assert.doesNotMatch(render({ fix: undefined }), /pfix|data-accept=/);
  assert.match(render({ fix: quote }), /格式问题：fix 和 quote 相同/);
  assert.doesNotMatch(render({ fix: quote }), /data-accept=/);
  assert.match(render({ fix: '<script>不同的句子</script>' }), /&lt;script&gt;/);
  assert.doesNotMatch(render({ fix: '<script>不同的句子</script>' }), /<script>/);
  assert.doesNotMatch(render({}), /data-filter="manuscript"/);
});
