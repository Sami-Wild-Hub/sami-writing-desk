// Browser-local editing over real rendered reports, including phone input and clipboard.
import { expect, test, type Page } from '@playwright/test';
import { stubFirebase, watchErrors } from './stub.ts';

const book = '/households/novel-stub-house/proofdesk/maritime-story';
const quote = '他是高大结实的男人。', fix = '他是个高大、结实的男人。';
const draft = `${quote}\n她又又走到了码头。\n天色渐渐暗了下来。`;
const report = JSON.stringify({ summary: `受检版本 blob ${'a'.repeat(64)}`, items: [
  { para: 'P1', quote, fix, kind: '人物', issue: '补字和标点', evidence: [] },
  { para: 'P2', quote: '她又又走到了码头。', fix: '她又走到了码头。', kind: '文字', issue: '重复字', evidence: [] },
  { para: 'P3', quote: '天色渐渐暗了下来。', kind: '推演', issue: '需要作者决定', evidence: [], suggestion: '请核对时间。' },
] });

async function setup(page: Page, body = draft) {
  const stub = await stubFirebase(page);
  await page.goto('book/?book=maritime-story&view=proof');
  await page.getByLabel('标题', { exact: true }).fill('改稿测试');
  await page.getByLabel('新稿', { exact: true }).fill(body);
  await page.getByRole('button', { name: '发送校稿', exact: true }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get('doc')).toBeTruthy();
  const id = new URL(page.url()).searchParams.get('doc')!;
  expect(stub.at(`${book}/${id}/checks`)).toEqual({ open: { status: 'queued' } });
  stub.server(`${book}/${id}/reports/open-1`, { id: 'open-1', check: 'open', attempt: 1, createdAt: 1, report });
  stub.server(`${book}/${id}/checks/open/status`, 'done');
  stub.server(`${book}/${id}/status`, 'done');
  await expect(page.locator('.pcount')).toContainText('3 条反馈');
  return { stub, id };
}

for (const width of [1280, 390]) test(`${width}px: accept, undo, edit, persist, copy and restore without database writes`, async ({ page, context }) => {
  const errors = watchErrors(page);
  await page.setViewportSize({ width, height: 900 });
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const { stub, id } = await setup(page);
  const cards = page.locator(width < 860 ? '.plist .pitem' : '.pv .pitem');
  const field = page.getByRole('textbox', { name: 'P1 正文', exact: true });
  await expect(page.locator('.pstep')).toHaveCount(1);
  expect(await page.locator('.result').evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0);
  await expect(page.locator('[data-filter=manuscript]')).toHaveCount(0);
  await expect(cards.first().locator('ins')).toHaveText(['个', '、']);
  await expect(cards.nth(1).locator('del')).toHaveText('又');
  await expect(cards.nth(2).locator('[data-accept]')).toHaveCount(0);
  await cards.first().getByRole('button', { name: '接受', exact: true }).click();
  await expect(field).toHaveText(fix);
  await page.reload();
  await expect(field).toHaveText(fix);
  await cards.first().getByRole('button', { name: '撤销', exact: true }).click();
  await expect(field).toHaveText(quote);
  await cards.first().getByRole('button', { name: '接受', exact: true }).click();
  await page.getByRole('textbox', { name: 'P2 正文', exact: true }).fill('她走到了新码头。');
  await expect(cards.nth(1).getByRole('button', { name: '接受', exact: true })).toBeDisabled();
  await expect(cards.nth(1)).toContainText('原句已被修改或找不到');
  await page.getByRole('button', { name: '复制正文', exact: true }).click();
  expect((await page.evaluate(() => navigator.clipboard.readText())).replaceAll('\r\n', '\n')).toBe(`${fix}\n她走到了新码头。\n天色渐渐暗了下来。`);
  await page.reload();
  await expect(field).toHaveText(fix);
  await expect(page.getByRole('textbox', { name: 'P2 正文', exact: true })).toHaveText('她走到了新码头。');
  expect(stub.at(`${book}/${id}/draft`)).toBe(draft);
  expect(stub.at(`${book}/${id}/reports/open-1/report`)).toBe(report);
  await field.fill('他是手改后的男人。');
  await expect(cards.first().getByRole('button', { name: '撤销', exact: true })).toBeDisabled();
  await expect(cards.first()).toContainText('建议句已被修改，无法撤销');
  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('button', { name: '还原原稿', exact: true }).click();
  await expect(field).toHaveText('他是手改后的男人。');
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: '还原原稿', exact: true }).click();
  await expect(field).toHaveText(quote);
  await expect(cards.nth(1).getByRole('button', { name: '接受', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '全部重新发送', exact: true }).click();
  expect(stub.at(`${book}/${id}/checks/manuscript`)).toBeNull();
  expect(stub.at(`${book}/${id}/checks/open/status`)).toBe('queued');
  expect(errors).toEqual([]);
});

test('typing retains focus and caret, while the copy button stays visible on scroll', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await setup(page, `${draft}\n${Array.from({ length: 30 }, (_, i) => `后文第${i + 1}段，码头逐渐安静下来。`).join('\n')}`);
  const marked = page.getByRole('textbox', { name: 'P1 正文', exact: true });
  await marked.locator('mark').click();
  await expect(marked).toBeFocused();
  const field = page.getByRole('textbox', { name: 'P3 正文', exact: true });
  await field.click();
  await page.keyboard.press('End');
  await page.keyboard.type('abc');
  await expect(field).toBeFocused();
  await expect(field).toHaveText('天色渐渐暗了下来。abc');
  await page.evaluate(() => window.scrollBy(0, 650));
  await expect(page.getByRole('button', { name: '复制正文', exact: true })).toBeInViewport();
});

test('feedback arriving while editing retains the editor and displays unplaced items', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const { stub, id } = await setup(page);
  const field = page.getByRole('textbox', { name: 'P3 正文', exact: true });
  await field.fill('手改的段落。');
  const incoming = JSON.parse(report);
  incoming.items.push({ para: 'P99', quote: '没有这一段。', kind: '连续性', issue: '段号有误', evidence: [] });
  stub.server(`${book}/${id}/reports/open-1/report`, JSON.stringify(incoming));
  await expect(page.locator('.pv .orphan .pitem')).toContainText('段号有误');
  await expect(field).toBeFocused();
  await expect(field).toHaveText('手改的段落。');
});
