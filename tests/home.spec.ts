import { expect, test } from '@playwright/test';
import { novelBooks } from '../src/config/books';
import { stubFirebase } from './stub.ts';

test('home lists one card per book that opens its book page', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('小离总周报');
  await expect(page.locator('article[data-book]')).toHaveCount(novelBooks.length);
  for (const [index, book] of novelBooks.entries()) {
    const card = page.locator('article[data-book]').nth(index);
    await expect(card.locator('a.cover')).toHaveAttribute('href', new RegExp(`/book/\\?book=${book.slug}$`));
    await expect(card.locator('h3')).toHaveText(book.title);
    await expect(card.locator('.acts a')).toHaveText(['阅读', '时间线', '人物']);
  }
  await expect(page.getByText('本周')).toHaveCount(0);
  await expect(page.getByText('继续阅读')).toHaveCount(0);
  await page.locator('article[data-book] a.cover').first().click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(novelBooks[0].title);
  await expect(page).toHaveTitle(new RegExp(`${novelBooks[0].title} · 小离总周报 · Sami Writing Desk`));
  await expect(page.locator('#novel-app')).toBeHidden();
  await expect(page.locator('#novel-app')).toBeEmpty();
});

test('signed in, book cards show the synced scope and counts', async ({ page }) => {
  await stubFirebase(page);
  await page.goto('./');
  const card = page.locator(`article[data-book="${novelBooks[0].slug}"]`);
  await expect(card.locator('[data-scope]')).toHaveText('已处理正文：C1–C3');
  await expect(card.locator('[data-stats]')).toContainText('4 人物与设定');
  await expect(page.locator('#home-account')).toBeVisible();
});
