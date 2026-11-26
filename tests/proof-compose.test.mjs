// Drive chapter aliases and title numbering from this book's history.
import assert from 'node:assert/strict';
import test from 'node:test';
import { chapterName, nextTitle, submittedChapter, revisionTitle } from '../src/lib/views/proof/compose.ts';

test('chapter aliases become one stored name; unknown names remain usable', () => {
  for (const input of ['22', 'c22', 'C022', '第22章', '22章', '第二十二章', ' 二十二章 ']) {
    assert.equal(chapterName(input), 'C22');
  }
  for (const input of ['番外：海边', '  番外：海边  ', '0', 'C0', '第零章', '某文件.md', '']) assert.equal(chapterName(input), input);
});

test('the next title uses the largest same-chapter draft, ignoring fetch failures', () => {
  const history = [
    { title: 'C22 初稿' }, { title: '第22章 第3稿' }, { title: 'C22 第2稿' },
    { title: 'C22 第99稿', fetch: { status: 'failed' } },
    { title: 'C220 第88稿' }, { title: 'C23 第77稿' },
    { title: '第二十二章 第四稿', status: 'failed', fetch: { status: 'done' } },
  ];
  assert.equal(nextTitle('22', history), 'C22 第5稿');
  assert.equal(nextTitle('c22', [{ title: 'C22 初稿' }]), 'C22 第2稿');
  assert.equal(nextTitle('第22章', []), 'C22 第1稿');
  assert.equal(nextTitle('番外', []), '番外 第1稿');
  assert.equal(nextTitle('', history), '');
});

test('chapter version navigation includes Drive aliases and keeps distinct chapters apart', () => {
  assert.equal(submittedChapter('C22 第2稿'), 'C22');
  assert.equal(submittedChapter('第二十二章 初稿'), 'C22');
  assert.equal(submittedChapter('未命名', '第23章'), 'C23');
  assert.equal(submittedChapter('自由稿'), '');
  const original = { title: 'C22 初稿', draft: '旧文' };
  const history = [original, { title: 'C22 第3稿' }, { title: 'C220 第9稿' }];
  assert.equal(revisionTitle(original, history), 'C22 第4稿');
  assert.equal(original.title, 'C22 初稿');
  assert.equal(revisionTitle({ title: '自由稿' }, []), '自由稿 复校');
});
