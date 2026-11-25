// Access changes, complete search counts, reader anchors and compact rail navigation.
import { expect, test } from '@playwright/test';
import { stubFirebase } from './stub.ts';
const member = 'households/novel-stub-house/members/novel-stub-reader';
const book = 'households/novel-stub-house/novelArchive/books/maritime-story';

test('signed-out phone keeps the shelf and hides unavailable search and contents', async ({ page }) => {
  await stubFirebase(page, { signedIn: false }); await page.goto('book/?book=maritime-story');
  await expect(page.locator('#novel-sign-in')).toBeVisible();
  await expect(page.locator('#novel-bar [data-drawer]')).toBeHidden();
  await expect(page.locator('#novel-bar [data-search]:visible')).toHaveCount(0);
  await expect(page.locator('#novel-bar .shelf-link')).toBeVisible();
  await page.locator('#novel-bar .shelf-link').click(); await expect(page.locator('#home-shelf')).toBeVisible();
  await expect(page.locator('#home-filter, .ghost')).toHaveCount(0);
});

test('pending access enters automatically, revocation hides content, reapproval enters again', async ({ page }) => {
  const stub = await stubFirebase(page); stub.server(member, null);
  await page.goto('book/?book=maritime-story');
  await expect(page.locator('#novel-auth h2')).toHaveText('等待批准');
  await expect(page.locator('#novel-auth')).toContainText('自动进入');
  stub.server(member, { email: 'reader@example.com' });
  await expect(page.locator('#novel-app')).toBeVisible(); await expect(page.locator('.toast')).toContainText('权限已开通');
  stub.server(member, null); await expect(page.locator('#novel-app')).toBeHidden();
  await expect(page.locator('#novel-auth h2')).toHaveText('权限已撤销');
  stub.server(member, { email: 'reader@example.com' }); await expect(page.locator('#novel-app')).toBeVisible();
});

test('shelf shows the same pending state and approval feedback', async ({ page }) => {
  const stub = await stubFirebase(page); stub.server(member, null); await page.goto('./');
  await expect(page.locator('#home-who')).toHaveText('等待批准');
  await expect(page.locator('#home-sign-in')).toHaveText('重新检查');
  stub.server(member, { email: 'reader@example.com' });
  await expect(page.locator('#home-who')).toContainText('家庭成员');
  await expect(page.locator('.toast')).toContainText('权限已开通');
});

test('navigation selects its target and shows a placeholder while data is pending', async ({ page }) => {
  const stub = await stubFirebase(page); stub.holdReads('/books/maritime-story');
  await page.goto('book/?book=maritime-story&view=timeline');
  await expect(page.locator('#novel-views [data-novel-view="timeline"]')).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('#novel-live')).toContainText('时间线'); await expect(page.locator('.skeleton')).toBeVisible();
  stub.releaseReads(); await expect(page.locator('[data-view="timeline"] .row').first()).toBeVisible();
  await expect(page.locator('#novel-live')).toBeHidden();
});

test('search counts all matches before limiting a category, and composing Enter cannot open stale hits', async ({ page }) => {
  const stub = await stubFirebase(page), original = structuredClone(stub.at(book)) as any;
  const entries: Record<string, any> = {}, pages: Record<string, string> = {};
  for (let i = 0; i < 71; i++) {
    const path = i < 70 ? `owners/CHARACTER/CH-Find${i}/START_HERE.md` : 'events/E-9999.md', key = Buffer.from(path).toString('base64url');
    entries[key] = { path, title: `共同词 ${i}`, section: '全局' }; pages[key] = `<h1>共同词 ${i}</h1>`;
  }
  stub.server(book, { ...original, manifest: { ...original.manifest, entries }, pages });
  await page.goto('book/?book=maritime-story'); await expect(page.locator('.doc-head')).toBeVisible();
  await page.keyboard.press('/'); const input = page.locator('#novel-search');
  await input.fill('共同词'); await expect(page.locator('[data-s="全部"] .n')).toHaveText('71');
  await expect(page.locator('[data-s="事件"] .n')).toHaveText('1');
  await page.locator('[data-s="事件"]').click(); await expect(page.locator('.search-list .hit')).toHaveCount(1);
  const url = page.url(); await input.dispatchEvent('compositionstart'); await input.fill('组字');
  await input.dispatchEvent('keydown', { key: 'Enter', isComposing: true });
  await page.waitForTimeout(180); expect(page.url()).toBe(url);
  await input.dispatchEvent('compositionend'); await input.press('Enter'); expect(page.url()).toBe(url);
  await expect(page.locator('.search-list')).toContainText('没有找到');
  expect(stub.some((path) => path.endsWith('/search'))).toBe(false);
});

test('a matching catalog version reuses the complete book from IndexedDB after reload', async ({ page }) => {
  const reads = await stubFirebase(page);
  await page.goto('book/?book=maritime-story');
  await expect(page.locator('.doc-head')).toBeVisible();
  reads.splice(0);
  await page.reload();
  await expect(page.locator('.doc-head')).toBeVisible();
  expect(reads.filter((path) => path.includes('/novelArchive/books/'))).toEqual([]);
});

test('reader settings preserve the visible paragraph, active headings update, and rail links remain on narrow screens', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const stub = await stubFirebase(page), key = Buffer.from('source/C2.md').toString('base64url');
  stub.server(`${book}/pages/${key}`, '<h1>章节</h1><h2 id="first">第一节</h2>' + '<p>段落文字。'.repeat(1) + '</p>' +
    Array.from({ length: 40 }, (_, i) => `<p>${i} ${'长段文字。'.repeat(40)}</p>`).join('') + '<h2 id="second">第二节</h2>' + '<p>后半段。</p>'.repeat(40));
  await page.goto('book/?book=maritime-story&doc=source%2FC2.md');
  const paragraph = page.locator('.prose p').nth(20); await paragraph.scrollIntoViewIfNeeded();
  const anchor = await page.locator('.prose p').evaluateAll(nodes => nodes.findIndex(el => el.getBoundingClientRect().bottom >= document.querySelector('#novel-bar')!.getBoundingClientRect().height));
  const visible = page.locator('.prose p').nth(anchor), offset = await visible.evaluate(el => el.getBoundingClientRect().top);
  await page.locator('[data-aa]').evaluate((el: HTMLElement) => el.click());
  await page.locator('[data-set="size"] [data-v="l"]').evaluate((el: HTMLElement) => el.click());
  expect(Math.abs(await visible.evaluate(el => el.getBoundingClientRect().top) - offset)).toBeLessThan(3);
  await page.locator('#second').evaluate(el => el.scrollIntoView({ block: 'start' }));
  await expect(page.locator('.rail [data-to="second"]')).toHaveClass(/on/);
  await page.setViewportSize({ width: 900, height: 900 });
  await expect(page.locator('.doc .rail summary')).toBeVisible();
  await page.locator('.rail summary').click(); await expect(page.locator('.rail .box')).toBeVisible();
  await page.locator('.rail .box a').first().click(); await expect(page.locator('#novel-back')).toBeVisible();
});

test.describe('touch preview', () => {
  test.use({ hasTouch: true });
  test('a hold previews a person, movement cancels, and a normal tap still opens it', async ({ page }) => {
    await stubFirebase(page); await page.goto('book/?book=maritime-story&doc=events%2FE-9001.md');
    const person = page.locator('.prose a.ent').first(); await expect(person).toBeVisible(); const url = page.url();
    await person.dispatchEvent('pointerdown', { pointerType: 'touch', pointerId: 9, clientX: 100, clientY: 200, button: 0 });
    await expect(page.locator('.peek')).toBeVisible(); await expect(page.locator('.peek')).toContainText('Ann');
    await person.dispatchEvent('pointerup', { pointerType: 'touch', pointerId: 9 }); await person.click(); expect(page.url()).toBe(url);
    await person.dispatchEvent('pointerdown', { pointerType: 'touch', pointerId: 10, clientX: 100, clientY: 200, button: 0 });
    await person.dispatchEvent('pointermove', { pointerType: 'touch', pointerId: 10, clientX: 140, clientY: 200 });
    await page.waitForTimeout(500); await expect(page.locator('.peek')).toBeHidden();
    await person.tap(); await expect(page.locator('.doc-head h1')).toHaveText('Ann');
  });
});
