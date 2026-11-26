import assert from 'node:assert/strict';
import test from 'node:test';
import { revisionDraft } from '../src/lib/views/proof/paragraphs.ts';

test('revision preserves headings, blank lines, newlines and unchanged source', () => {
  const original = '#### 章名\r\n\r\n  甲。  \r\n乙。\r\n';
  assert.equal(revisionDraft(original, ['甲。', '乙。']), original);
  assert.equal(revisionDraft(original, ['甲。', '丙。']), '#### 章名\r\n\r\n  甲。  \r\n丙。\r\n');
  assert.throws(() => revisionDraft(original, ['甲。']), /段落数/);
});
