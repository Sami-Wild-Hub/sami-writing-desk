// TEMPORARY visual check (deleted after use): screenshots to a temp dir outside the repo.
import { expect, test } from '@playwright/test';
import { stubFirebase } from './stub.ts';
const out = process.env.SHOT_DIR ?? 'C:/Users/Chi/Documents/CodexProjects/.tmp-swd-motion-shots';
for (const width of [390, 1440]) {
  test(`visual ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await stubFirebase(page); await page.goto('book/?book=maritime-story');
    await expect(page.locator('.doc-head')).toBeVisible();
    await page.screenshot({ path: `${out}/${width}-reader.png` });
    if (width < 861) {
      await page.locator('#novel-bar [data-drawer]').click(); await page.waitForTimeout(80);
      await page.screenshot({ path: `${out}/${width}-drawer-mid.png` }); await page.waitForTimeout(400);
      await page.screenshot({ path: `${out}/${width}-drawer.png` }); await page.keyboard.press('Escape'); await page.waitForTimeout(400);
    }
    await page.locator('[data-aa]').first().click(); await page.waitForTimeout(60);
    await page.screenshot({ path: `${out}/${width}-aa-mid.png` }); await page.waitForTimeout(300);
    await page.screenshot({ path: `${out}/${width}-aa.png` }); await page.keyboard.press('Escape'); await page.mouse.click(5, 400);
    await page.goto('book/?book=maritime-story&view=people'); await page.waitForTimeout(500);
    await page.locator('.who-btn').first().click(); await page.waitForTimeout(400);
    await page.screenshot({ path: `${out}/${width}-people.png` });
    await page.goto('book/?book=maritime-story&view=outline'); await page.waitForTimeout(1200);
    await page.screenshot({ path: `${out}/${width}-outline.png`, fullPage: false });
    const rank = page.locator('[data-act="toggle-rank"]').first();
    if (await rank.isVisible()) { await rank.click(); await page.waitForTimeout(400); await page.screenshot({ path: `${out}/${width}-outline-rank.png` }); await rank.click(); }
    const tab = page.locator('.outline-view .tabs [data-tab="outline"]');
    if (await tab.isVisible()) { await tab.click(); await page.waitForTimeout(400); await page.screenshot({ path: `${out}/${width}-outline-tab.png` }); }
    const files = page.locator('.file-recovery > summary');
    await files.click(); await page.waitForTimeout(400); await page.screenshot({ path: `${out}/${width}-files.png` });
  });
}
