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

test('reduced motion turns every duration token to 0', async ({ page }) => {
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
});
