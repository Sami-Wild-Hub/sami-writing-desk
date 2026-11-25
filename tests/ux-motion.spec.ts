// Motion language: reduced motion zeroes the tokens, the jump highlight clears itself,
// and the phone drawer closes on Esc with focus back on its button.
import { expect, test } from '@playwright/test';
import { stubFirebase } from './stub.ts';
const book = 'households/novel-stub-house/novelArchive/books/maritime-story';
// The build minifies 200ms to .2s, so tokens are compared in milliseconds.
const token = (page: import('@playwright/test').Page, name: string) => page.evaluate(n => {
  const v = getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  return parseFloat(v) * (v.endsWith('ms') ? 1 : 1000);
}, name);

test('reduced motion zeroes transition duration tokens', async ({ page }) => {
  await stubFirebase(page); await page.goto('book/?book=maritime-story');
  await expect(page.locator('.doc-head')).toBeVisible();
  expect(await token(page, '--dur-2')).toBe(200);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const name of ['--dur-press', '--dur-1', '--dur-2', '--dur-3', '--dur-exit']) expect(await token(page, name)).toBe(0);
});

test('a rail jump highlights its heading, then the highlight clears by itself', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 }); await page.emulateMedia({ reducedMotion: 'reduce' });
  const stub = await stubFirebase(page), key = Buffer.from('source/C2.md').toString('base64url');
  stub.server(`${book}/pages/${key}`, '<h1>章节</h1><h2 id="first">第一节</h2>' +
    Array.from({ length: 40 }, (_, i) => `<p>${i} ${'长段文字。'.repeat(40)}</p>`).join('') + '<h2 id="second">第二节</h2><p>后半段。</p>');
  await page.goto('book/?book=maritime-story&doc=source%2FC2.md');
  await page.locator('.rail [data-to="second"]').click();
  const head = page.locator('#second');
  await expect(head).toHaveClass(/flash/); await expect(head).toBeInViewport();
  await expect(head).not.toHaveClass(/flash/, { timeout: 3000 });
});

test('the phone drawer closes on Esc and gives focus back to its button', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await stubFirebase(page); await page.goto('book/?book=maritime-story');
  await expect(page.locator('.doc-head')).toBeVisible();
  const opener = page.locator('#novel-bar [data-drawer]'), side = page.locator('#novel-app .side.show');
  await opener.click(); await expect(side).toBeVisible(); await expect(opener).toHaveAttribute('aria-expanded', 'true');
  expect(await side.evaluate(el => el.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(side).toHaveCount(0); await expect(opener).toBeFocused(); await expect(opener).toHaveAttribute('aria-expanded', 'false');
  expect(await page.locator('#novel-app .side').evaluate((el: HTMLElement) => el.inert)).toBe(true);
  await opener.evaluate((el: HTMLElement) => el.click());
  await opener.evaluate((el: HTMLElement) => el.click());
  await expect(opener).toHaveAttribute('aria-expanded', 'false');
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect.poll(() => page.locator('#novel-app .side').evaluate((el: HTMLElement) => el.inert)).toBe(false);
});

test('search can reopen during its exit, and revocation removes it immediately', async ({ page }) => {
  const stub = await stubFirebase(page);
  await page.goto('book/?book=maritime-story'); await expect(page.locator('.doc-head')).toBeVisible();
  await page.keyboard.press('/');
  const input = page.locator('#novel-search'), box = page.locator('.search');
  await input.fill('Ann'); await expect(box.locator('.hit').first()).toBeVisible();
  await input.press('Escape');
  expect(await box.evaluate((el: HTMLElement) => el.inert)).toBe(true);
  await page.keyboard.press('/'); await expect(input).toBeFocused();
  await expect(box).toBeVisible(); await expect(box).not.toHaveClass(/leaving/);
  stub.server('households/novel-stub-house/members/novel-stub-reader', null);
  await expect(page.locator('#novel-app')).toBeEmpty();
  expect(await box.evaluate((el: HTMLElement) => el.hidden)).toBe(true);
});

test('late reader metadata is ready before the page becomes readable', async ({ page }) => {
  const stub = await stubFirebase(page); stub.holdReads('/books/maritime-story');
  await page.goto('book/?book=maritime-story&doc=source%2FC2.md');
  await expect(page.locator('#novel-live')).toBeVisible();
  await expect(page.locator('.doc-head')).toHaveCount(0);
  stub.releaseReads();
  await expect(page.locator('.doc-head')).toBeVisible();
  await page.locator('.rail summary').click();
  await expect(page.locator('.rail')).toContainText('本章写到的事件');
});

test('small disclosures retain their trigger and accept a reversal while closing', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await stubFirebase(page); await page.goto('book/?book=maritime-story');
  const group = page.locator('.toc details').first(), summary = group.locator('summary');
  await expect(group).toHaveAttribute('open', '');
  await summary.evaluate((el: HTMLElement) => el.click());
  await summary.evaluate((el: HTMLElement) => el.click());
  await expect(group).toHaveAttribute('open', '');
  await summary.click(); await expect(group).not.toHaveAttribute('open');
  await summary.click(); await expect(group).toHaveAttribute('open', '');
  await expect(group.locator('.navlink').first()).toBeVisible();
  await summary.click();
  await page.locator('.doc .cards a').filter({ hasText: 'Ann' }).click();
  await expect(page.locator('.doc-head h1')).toHaveText('Ann');
  expect(await group.locator('.disclosure').evaluate((el: HTMLElement) => el.inert)).toBe(false);
  await group.locator('[data-name="Cy"]').click();
  await expect(page.locator('.doc-head h1')).toHaveText('Cy');
});

test('late shelf counts and the outline action keep the existing actions in place', async ({ page }) => {
  const stub = await stubFirebase(page); stub.holdReads('/manifest');
  await page.goto('./'); await expect(page.locator('#home-who')).toContainText('家庭成员');
  await page.evaluate(() => document.fonts.ready);
  const actions = page.locator('.bookcard').first().locator('.acts > a:not([data-outline-link])');
  const positions = () => actions.evaluateAll(nodes => nodes.map(el => {
    const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height };
  }));
  const before = await positions(); stub.releaseReads();
  await expect(page.locator('[data-outline-link]').first()).toBeVisible();
  expect(await positions()).toEqual(before);
});

test('a view entry keeps the first person hover preview available', async ({ page }) => {
  await stubFirebase(page); await page.goto('book/?book=maritime-story&doc=events%2FE-9002.md');
  await expect(page.locator('.doc-head')).toBeVisible();
  await page.locator('#novel-views [data-novel-view="people"]').click();
  await expect(page.locator('.who-btn').first()).toBeVisible();
  await page.locator('#novel-views [data-novel-view="reader"]').click();
  await page.locator('.prose a.ent').first().hover();
  await expect(page.locator('.peek')).toContainText('Ann');
});
