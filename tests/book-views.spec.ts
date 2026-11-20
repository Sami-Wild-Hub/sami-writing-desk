import { expect, test, type Page } from '@playwright/test';
import { stubFirebase, watchErrors } from './stub.ts';

// Signed-in book page behaviour against the stubbed Firebase in tests/stub.ts.
const doc = (page: Page) => page.locator('[data-view="reader"] .doc');
const title = (page: Page) => doc(page).locator('.doc-head h1');
const tab = (page: Page, name: '阅读' | '时间线') => page.locator('#novel-views').getByRole('link', { name });
const expectUrl = (page: Page, params: Record<string, string>, hash = '') => expect.poll(() => {
  const url = new URL(page.url());
  return { ...Object.fromEntries(url.searchParams), hash: decodeURIComponent(url.hash) };
}).toEqual({ ...params, hash });

test('signed out, a configured book page reads nothing from the novel archive', async ({ page }) => {
  const reads = await stubFirebase(page, { signedIn: false });
  await page.goto('book/?book=maritime-story&view=timeline');
  await expect(page.locator('#novel-sign-in')).toBeVisible();
  await expect(page.locator('#novel-book-title')).toHaveText('Maritime Story');
  await expect(page.locator('#novel-app')).toBeHidden();
  await expect(page.locator('#novel-app')).toBeEmpty();
  await expect(page.locator('#novel-views')).toBeHidden();
  expect(reads.filter((path) => path.includes('novelArchive'))).toEqual([]);
});

test('direct links and refresh open the named book, page and paragraph', async ({ page }) => {
  const errors = watchErrors(page);
  await stubFirebase(page);
  await page.goto('book/?book=second-book&doc=source%2FC2.md#p9');
  await expect(title(page)).toHaveText('第2章');
  await expect(page.locator('#novel-book-title')).toHaveText('Second Book');
  await expect(doc(page).locator('[id="p9"]')).toBeInViewport();
  await expect(tab(page, '阅读')).toHaveAttribute('aria-current', 'page');
  await page.reload();
  await expect(title(page)).toHaveText('第2章');
  await expect(doc(page).locator('[id="p9"]')).toBeInViewport();
  await expect(doc(page).locator('[id="p9"] .pn')).toHaveText('9');
  await expect(page.locator('[data-view="timeline"]')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('reader links read as names, show a preview and offer the way back', async ({ page }) => {
  await stubFirebase(page);
  await page.goto('book/?book=maritime-story');
  await expectUrl(page, { book: 'maritime-story', doc: 'INDEX.md' });
  await expect(title(page)).toHaveText('故事知识库');
  const card = doc(page).locator('.cards a').filter({ hasText: 'Ann' });
  await expect(card).toContainText('主角');
  await card.click();
  await expectUrl(page, { book: 'maritime-story', doc: 'owners/CHARACTER/CH-Ann/START_HERE.md' });
  await expect(title(page)).toHaveText('Ann');
  await expect(doc(page).locator('.subtabs [aria-current="page"]')).toHaveText('起点');
  await expect(page.locator('#novel-back')).toHaveText('返回 故事知识库');
  await page.locator('#novel-back').click();
  await expectUrl(page, { book: 'maritime-story', doc: 'INDEX.md' });
  await expect(page.locator('#novel-back')).toBeHidden();

  await page.goto('book/?book=maritime-story&doc=events%2FE-9002.md');
  await expect(title(page)).toHaveText('约定');
  const person = doc(page).locator('.prose a.ent').first();
  await expect(person).toHaveText('Ann');
  await person.hover();
  await expect(page.locator('.peek')).toContainText('Ann');
  await expect(page.locator('.peek')).toContainText('的简介');
  await expect(doc(page).locator('.pager .prev')).toContainText('相遇');
  await expect(doc(page).locator('.doc-meta a.pill.accent')).toHaveText('在时间线中定位 →');
});

test('paragraph links, search and reading settings', async ({ page }) => {
  await stubFirebase(page);
  await page.goto('book/?book=maritime-story&doc=source%2FC2.md');
  await expect(title(page)).toHaveText('第2章');
  await doc(page).locator('[id="p5"] .pn').click();
  await expectUrl(page, { book: 'maritime-story', doc: 'source/C2.md' }, '#p5');
  await expect(doc(page).locator('[id="p5"]')).toHaveClass(/flash/);
  await expect(page.locator('.rail .box')).toContainText('约定');

  await page.keyboard.press('/');
  await page.locator('#novel-search').fill('约定');
  await page.locator('#novel-results .hit').first().click();
  await expectUrl(page, { book: 'maritime-story', doc: 'events/E-9002.md' });
  await expect(title(page)).toHaveText('约定');
  await expect(page.locator('#novel-back')).toHaveText('返回 第2章');

  const font = () => page.evaluate(() => document.documentElement.style.getPropertyValue('--read-font'));
  expect(await font()).toBe('var(--sans)');
  await doc(page).locator('[data-aa]').click();
  await page.locator('.aa-pop').getByRole('button', { name: '宋体' }).click();
  expect(await font()).toBe('var(--serif)');
  await page.reload();
  await expect(title(page)).toHaveText('约定');
  expect(await font()).toBe('var(--serif)');
});
