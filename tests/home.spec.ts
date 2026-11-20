import { expect, test } from '@playwright/test';
import { novelBooks } from '../src/config/books';

test('home lists one card per book that opens its book page', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('小离总周报');
  await expect(page.locator('[data-book]')).toHaveCount(novelBooks.length);
  for (const [index, book] of novelBooks.entries()) {
    const card = page.locator('[data-book]').nth(index);
    await expect(card).toHaveAttribute('href', new RegExp(`/book/\\?book=${book.slug}$`));
    await expect(card.locator('strong')).toHaveText(book.title);
  }
  await page.locator('[data-book]').first().click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(novelBooks[0].title);
  await expect(page).toHaveTitle(new RegExp(`${novelBooks[0].title} · 小离总周报 · Sami Writing Desk`));
  await expect(page.locator('#novel-app')).toBeHidden();
  await expect(page.locator('#novel-content')).toBeEmpty();
});
