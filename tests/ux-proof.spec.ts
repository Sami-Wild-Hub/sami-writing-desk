// Durable proof drafts and asynchronous uploads/submissions must preserve newer work.
import { expect, test, type Page } from '@playwright/test';
import { stubFirebase } from './stub.ts';
const book = 'households/novel-stub-house/proofdesk/maritime-story';
const id = '20260101-010101-abcd';
async function open(page: Page) {
  const stub = await stubFirebase(page);
  await page.goto('book/?book=maritime-story&view=proof');
  const root = page.locator('[data-view="proof"]');
  await expect(root.locator('[name="draft"]')).toBeVisible();
  return { stub, root };
}

test('draft survives refresh; file replacement offers undo and read failure keeps the draft', async ({ page }) => {
  const { root } = await open(page);
  await root.getByLabel('标题', { exact: true }).fill('保留标题');
  await root.getByLabel('新稿', { exact: true }).fill('保留原稿');
  await page.reload(); await expect(root.getByLabel('新稿', { exact: true })).toHaveValue('保留原稿');
  await expect(root.getByLabel('标题', { exact: true })).toHaveValue('保留标题');
  await root.locator('[type="file"]').setInputFiles({ name: 'draft.txt', mimeType: 'text/plain', buffer: Buffer.from('文件里的新稿') });
  await expect(root.getByLabel('新稿', { exact: true })).toHaveValue('文件里的新稿');
  await page.locator('.toast').getByRole('button', { name: '撤销' }).click();
  await expect(root.getByLabel('新稿', { exact: true })).toHaveValue('保留原稿');
  await page.evaluate(() => { File.prototype.text = async () => { throw new Error('read error'); }; });
  await root.locator('[type="file"]').setInputFiles({ name: 'broken.txt', mimeType: 'text/plain', buffer: Buffer.from('broken') });
  await expect(root.locator('[data-err]')).toContainText('读取文件失败');
  await expect(root.getByLabel('新稿', { exact: true })).toHaveValue('保留原稿');
});

test('late file reads do not overwrite continued typing or a different record', async ({ page }) => {
  const { root } = await open(page);
  await page.evaluate(() => { File.prototype.text = () => new Promise(resolve => { (window as any).finishFile = resolve; }); });
  await root.locator('[type="file"]').setInputFiles({ name: 'slow.txt', mimeType: 'text/plain', buffer: Buffer.from('file') });
  await root.getByLabel('新稿', { exact: true }).fill('读取期间继续写的内容');
  await page.evaluate(() => (window as any).finishFile('迟到的文件内容'));
  await expect(root.getByLabel('新稿', { exact: true })).toHaveValue('读取期间继续写的内容');
  await expect(page.locator('.toast')).toContainText('保留了原来的稿子');
});

test('sending is single-flight across source switches and preserves newer input and route', async ({ page }) => {
  const { root, stub } = await open(page);
  await root.getByLabel('标题', { exact: true }).fill('发送的标题');
  await root.getByLabel('新稿', { exact: true }).fill('发送的内容');
  stub.holdWrites(); await root.locator('[data-send]').click();
  await expect(root.locator('[data-send]')).toBeDisabled();
  await root.locator('[data-source="drive"]').click(); await expect(root.locator('[data-send]')).toBeDisabled();
  await root.locator('[data-source="paste"]').click();
  await root.getByLabel('新稿', { exact: true }).fill('等待期间的新内容');
  await page.locator('#novel-views [data-novel-view="reader"]').click();
  stub.releaseWrites(); await expect(page.locator('.toast')).toContainText('校稿已发送');
  await expect(page.locator('[data-view="reader"]')).toBeVisible();
  await page.locator('#novel-views [data-novel-view="proof"]').click();
  await expect(root.getByLabel('新稿', { exact: true })).toHaveValue('等待期间的新内容');
  expect(Object.keys(stub.at(book) as object)).toHaveLength(1);
  await page.reload(); await expect(root.getByLabel('新稿', { exact: true })).toHaveValue('等待期间的新内容');
});

test('status pushes retain result nodes, selection, expanded raw output and scroll', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const stub = await stubFirebase(page);
  stub.server(`${book}/${id}`, {
    id, title: '长稿', createdAt: 1, source: 'paste', draft: Array.from({ length: 90 }, (_, i) => `第${i + 1}段。`.repeat(20)).join('\n'),
    skipProse: false, status: 'sent', checks: { manuscript: { status: 'done' }, open: { status: 'sent' } },
    reports: { bad: { id: 'bad', check: 'manuscript', attempt: 1, createdAt: 1, report: '这是一份原始输出' } },
  });
  await page.goto(`book/?book=maritime-story&view=proof&doc=${id}`);
  const root = page.locator('[data-view="proof"]'), raw = root.locator('.raw');
  await raw.locator('summary').click();
  const para = root.locator('#pp-30'); await para.scrollIntoViewIfNeeded();
  const y = await page.evaluate(() => scrollY);
  await para.evaluate(el => {
    (window as any).proofNode = el; const range = document.createRange(); range.selectNodeContents(el.querySelector('.ptext')!);
    getSelection()!.removeAllRanges(); getSelection()!.addRange(range);
  });
  const selection = await page.evaluate(() => getSelection()!.toString());
  stub.server(`${book}/${id}/checks/open/status`, 'sending');
  await expect(root.locator('.pstep').last().locator('.pst')).toHaveText('发送中');
  expect(await para.evaluate(el => el === (window as any).proofNode)).toBe(true);
  expect(await page.evaluate(() => getSelection()!.toString())).toBe(selection);
  await expect(raw).toHaveAttribute('open', ''); expect(Math.abs(await page.evaluate(() => scrollY) - y)).toBeLessThan(3);
  const statusOffset = await para.evaluate(el => el.getBoundingClientRect().top);
  stub.server(`${book}/${id}/error`, '状态错误说明。'.repeat(40));
  await expect(root.locator('.pstatus > .perr')).toContainText('状态错误说明');
  expect(Math.abs(await para.evaluate(el => el.getBoundingClientRect().top) - statusOffset)).toBeLessThan(3);
  const offset = await para.evaluate(el => el.getBoundingClientRect().top);
  stub.server(`${book}/${id}/reports/good`, { id: 'good', check: 'open', attempt: 1, createdAt: 2, report: '{"title":"长稿","items":[]}' });
  await expect(root.locator('.pcount')).toBeVisible();
  expect(Math.abs(await para.evaluate(el => el.getBoundingClientRect().top) - offset)).toBeLessThan(3);
  await expect(raw).toHaveAttribute('open', '');
});

test('a completed send after changing books offers its record without stealing the route', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const { root, stub } = await open(page);
  await root.getByLabel('标题', { exact: true }).fill('即将发送'); await root.getByLabel('新稿', { exact: true }).fill('已发送的稿子');
  stub.holdWrites(); await root.locator('[data-send]').click();
  await page.locator('#novel-bar .book').click(); await page.locator('#novel-book-menu a[data-book-slug="second-book"]').click();
  await expect(page.locator('#novel-book-title')).toHaveText('Second Book');
  await expect(page.locator('#novel-live')).toBeHidden();
  stub.releaseWrites(); await expect(page.locator('.toast')).toContainText('校稿已发送');
  expect(new URL(page.url()).searchParams.get('book')).toBe('second-book');
  await page.locator('.toast button').click(); await expect(page.locator('#novel-book-title')).toHaveText('Maritime Story');
  await page.locator('[data-view="proof"] .new').click();
  await expect(page.locator('[name="draft"]')).toHaveValue('');
});
