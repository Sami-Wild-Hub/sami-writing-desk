// Catalog versions gate cached reading; fresh pages do not wait for whole-book downloads.
import { expect, test, type Page } from '@playwright/test';
import { stubFirebase } from './stub.ts';

const root = 'households/novel-stub-house/novelArchive';
const book = `${root}/books/maritime-story`;
const cacheKey = 'book:novel-stub:novel-stub-house:maritime-story';
const indexKey = Buffer.from('INDEX.md').toString('base64url');

async function cachedVersion(page: Page) {
  return page.evaluate(key => new Promise<string | undefined>((resolve, reject) => {
    const request = indexedDB.open('sami-writing-desk', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const database = request.result;
      const read = database.transaction('archive').objectStore('archive').get(key);
      read.onsuccess = () => { database.close(); resolve(read.result?.version); };
      read.onerror = () => { database.close(); reject(read.error); };
    };
  }), cacheKey);
}

test('matching cached reading waits for the catalog but needs no book download', async ({ page }) => {
  const reads = await stubFirebase(page);
  await page.goto('book/?book=maritime-story');
  await expect(page.locator('.doc-head')).toBeVisible();
  await expect.poll(() => cachedVersion(page)).toBe('maritime-story-book-v1');
  reads.splice(0);
  reads.holdReads(`/${root}/catalog`, true);
  await page.reload();
  await expect.poll(() => reads.includes(`/${root}/catalog`)).toBe(true);
  await expect(page.locator('.doc-head')).toHaveCount(0);
  reads.releaseReads();
  await expect(page.locator('.doc-head')).toBeVisible();
  expect(reads.filter(path => path.includes('/novelArchive/books/'))).toEqual([]);
});

test('a changed version shows fresh pages and automatically replaces the cached book', async ({ page }) => {
  const reads = await stubFirebase(page);
  await page.goto('book/?book=maritime-story');
  await expect(page.locator('.doc-head')).toBeVisible();
  await expect.poll(() => cachedVersion(page)).toBe('maritime-story-book-v1');
  reads.server(`${book}/pages/${indexKey}`, '<h1>故事知识库</h1><p>更新后的正文。</p><a href="CHRONOLOGY.md">时间线</a>');
  const chronologyKey = Buffer.from('CHRONOLOGY.md').toString('base64url');
  reads.server(`${book}/pages/${chronologyKey}`, '<h1>文字时间线</h1><p>更新后的时间线。</p>');
  reads.server(`${book}/version`, 'maritime-story-book-v2');
  reads.server(`${root}/catalog/maritime-story/version`, 'maritime-story-book-v2');
  reads.holdReads(`/${book}`, true);
  await page.reload();
  await expect(page.locator('.prose')).toContainText('更新后的正文');
  await expect(page.locator('.prose')).not.toContainText('的总目录');
  await expect.poll(() => reads.filter(path => path === `/${book}`).length).toBeGreaterThan(0);
  await page.locator('.prose a[data-doc-path="CHRONOLOGY.md"]').click();
  await expect(page.locator('.prose')).toContainText('更新后的时间线');
  await page.keyboard.press('/');
  await page.locator('#novel-search').fill('更新后');
  await expect(page.locator('.search-list')).toContainText('搜索准备中');
  reads.releaseReads();
  await expect.poll(() => cachedVersion(page)).toBe('maritime-story-book-v2');
  await expect(page.locator('.search-list .hit').first()).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.prose')).toContainText('更新后的时间线');
  await expect(page.getByText('更新阅读', { exact: true })).toHaveCount(0);
  reads.splice(0);
  await page.reload();
  await expect(page.locator('.prose')).toContainText('更新后的时间线');
  expect(reads.filter(path => path.includes('/novelArchive/books/'))).toEqual([]);
});

test('without a cache the entry and a clicked page load before the whole book', async ({ page }) => {
  const reads = await stubFirebase(page);
  reads.holdReads(`/${book}`, true);
  await page.goto('book/?book=maritime-story');
  await expect(page.locator('.prose')).toContainText('的总目录');
  await page.locator('.prose a[data-doc-path="CHRONOLOGY.md"]').click();
  await expect(page.locator('.doc-head h1')).toHaveText('文字时间线');
  expect(reads.some(path => path === `/${book}/manifest`)).toBe(true);
  expect(reads.filter(path => path.startsWith(`/${book}/pages/`)).length).toBeGreaterThanOrEqual(2);
  reads.releaseReads();
});

test('search explains the pending download and becomes usable when it completes', async ({ page }) => {
  const reads = await stubFirebase(page);
  const payload = structuredClone(reads.at(book));
  reads.holdReads(`/${book}`, true);
  await page.goto('book/?book=maritime-story');
  await expect(page.locator('.doc-head')).toBeVisible();
  await page.keyboard.press('/');
  await page.locator('#novel-search').fill('约定');
  await expect(page.locator('.search-list')).toContainText('搜索准备中');
  // A failed snapshot leaves reading available, and the search retry starts a fresh read.
  reads.server(book, null);
  reads.releaseReads();
  await expect(page.locator('.search-list [data-retry]')).toBeVisible();
  await expect(page.locator('.doc-head')).toBeVisible();
  reads.server(book, payload);
  await page.locator('.search-list [data-retry]').click();
  await expect(page.locator('.search-list .hit').first()).toBeVisible();
  expect(reads.some(path => path.endsWith('/search'))).toBe(false);
});
