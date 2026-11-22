// Web sync acceptance against the real maritime-story files in the sibling data repo.
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { stubFirebase } from './stub.ts';

const dataRepo = resolve(process.cwd(), '..', 'sami-writing-desk-data-outline');

test('outline web reads canonical maritime-story data and exposes repository conflict choices', async ({ page }) => {
  test.skip(!existsSync(dataRepo), 'public CI has no sibling data repository');
  const reads = await stubFirebase(page, { canonical: true });
  await page.goto('book/?book=maritime-story&view=outline');
  const root = page.locator('[data-view="outline"]');
  await expect(root.locator('#overall')).toHaveText(/\d+ 张 · \d+ 已排/);
  await expect(root.locator('#sync-state')).toContainText('已入库');
  expect(reads.some(path => path.includes('/novelArchive/books/maritime-story/outline'))).toBe(false);
  expect(reads.some(path => path.includes('/outlineSync/maritime-story/head'))).toBe(true);

  const base = 'households/novel-stub-house/outlineSync/maritime-story';
  const live = reads.at(`${base}/live`) as { plot: string; plan: string };
  reads.server(`${base}/incoming`, { tree: 'remote-tree', commit: 'remote-commit', plot: live.plot, plan: live.plan });
  await expect(root.locator('.draft-notice')).toContainText('仓库有新版');
  await expect(root.getByRole('button', { name: '保留网页版' })).toBeVisible();
});

test('an unusable default-storyline config does not block cloud data', async ({ page }) => {
  test.skip(!existsSync(dataRepo), 'public CI has no sibling data repository');
  const reads = await stubFirebase(page, { canonical: true });
  await page.goto('book/?book=maritime-story&view=outline');
  const root = page.locator('[data-view="outline"]');
  await expect(root.locator('#overall')).toContainText('108 张');
  const path = 'households/novel-stub-house/outlineSync/maritime-story';
  const head = reads.at(`${path}/head`) as { repo: object };
  reads.server(`${path}/head`, { ...head, config: '{', repo: { ...head.repo, configError: 'bad JSON' } });
  await expect(root.locator('#sync-state')).toContainText('config.json 无效');
  await page.reload(); await expect(root.locator('#overall')).toContainText('108 张');
});

test('the bookshelf follows the outline head without a reload', async ({ page }) => {
  test.skip(!existsSync(dataRepo), 'public CI has no sibling data repository');
  const reads = await stubFirebase(page, { canonical: true });
  const path = 'households/novel-stub-house/outlineSync/maritime-story/head', head = reads.at(path);
  reads.server(path, null);
  await page.goto('./');
  const card = page.locator('article[data-book="maritime-story"]'), link = card.locator('[data-outline-link]');
  await expect(card.locator('[data-stats] span')).not.toHaveCount(0);
  await expect(link).toHaveCount(0);
  reads.server(path, head);
  await expect(link).toHaveText('大纲');
  reads.server(path, null);
  await expect(link).toHaveCount(0);
});

test('outline entry is rechecked after a missing head becomes available', async ({ page }) => {
  test.skip(!existsSync(dataRepo), 'public CI has no sibling data repository');
  await page.setViewportSize({ width: 1280, height: 800 });
  const reads = await stubFirebase(page, { canonical: true });
  const path = 'households/novel-stub-house/outlineSync/maritime-story/head';
  const head = reads.at(path); reads.server(path, null);
  await page.goto('book/?book=maritime-story');
  await expect(page.locator('[data-novel-view="outline"]')).toBeHidden();
  reads.server(path, head);
  await page.locator('.book[data-menu]').click();
  await page.locator('[data-book-slug="second-book"]').click();
  await page.locator('.book[data-menu]').click();
  await page.locator('[data-book-slug="maritime-story"]').click();
  await expect(page.locator('[data-novel-view="outline"]')).toBeVisible();
});
