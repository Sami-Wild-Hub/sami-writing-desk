// Visible-control parity against the signed-in private archive, using fictional material.
import { expect, test } from '@playwright/test';
import { stubFirebase, watchErrors } from './stub.ts';
import { exerciseOutline } from './outline-scenario.mjs';

for (const width of [390, 1280]) {
  test(`outline original control replay at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    const errors = watchErrors(page);
    const reads = await stubFirebase(page);
    page.on('dialog', d => d.accept());
    await page.goto('book/?book=maritime-story&view=outline');
    const root = page.locator('[data-view="outline"]');
    await exerciseOutline(page, root);
    expect(errors).toEqual([]);
    expect(reads.filter(p => p.includes('/outlineSync/maritime-story'))).not.toHaveLength(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
    await page.getByRole('link', { name: '时间线', exact: true }).click();
    await page.getByRole('link', { name: '大纲', exact: true }).click();
    await expect(root.locator('#overall')).toHaveText('6 / 6');
    expect(reads.filter(p => p.includes('/outlineSync/maritime-story'))).not.toHaveLength(0);
  });
}

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
