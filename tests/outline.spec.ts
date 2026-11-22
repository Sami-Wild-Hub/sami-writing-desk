// Authentication and book routing for the outline entry.
import { expect, test } from '@playwright/test';
import { stubFirebase } from './stub.ts';
test('outline entry is hidden without data and signed-out routes read nothing private', async ({ page }) => {
  const reads = await stubFirebase(page, { signedIn: false });
  await page.goto('book/?book=maritime-story&view=outline');
  await expect(page.locator('#novel-sign-in')).toBeVisible();
  expect(reads.filter(p => p.includes('novelArchive'))).toEqual([]);
});

test('book without an outline normalizes direct links to the reader', async ({ page }) => {
  const reads = await stubFirebase(page);
  await page.goto('book/?book=second-book&view=outline');
  await expect(page.locator('[data-view="reader"] .doc')).toBeVisible();
  await expect(page.locator('[data-novel-view="outline"]')).toBeHidden();
  expect(reads.some(p => p.endsWith('/outline'))).toBe(false);
  expect(new URL(page.url()).searchParams.has('view')).toBe(false);
});
