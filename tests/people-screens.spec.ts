// Capture the people table and evidence with an optional private local payload.
import { expect, test } from '@playwright/test';
import { env, stubFirebase, watchErrors } from './stub.ts';

const dir = env.NOVEL_SHOTS_DIR;
test.describe('people screens', () => {
  test.skip(!dir, 'set NOVEL_SHOTS_DIR to take the people screenshots');
  for (const [width, height] of [[390, 844], [1280, 800], [2560, 1440]]) {
    test(`${width}px`, async ({ page }) => {
      const errors = watchErrors(page);
      await page.setViewportSize({ width, height });
      await stubFirebase(page);
      await page.goto('book/?book=maritime-story&view=people');
      const pv = page.locator('[data-view="people"] .ppl');
      await expect(pv.locator('tr.person').first()).toBeVisible();
      // Affiliations must never include character references, on either surface.
      await expect(pv.locator('[data-filter^="CH-"]')).toHaveCount(0);
      const shot = async (name: string, fullPage = false) => {
        await page.evaluate(() => document.fonts.ready);
        expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
        await page.screenshot({ path: `${dir}/${width}-people${name}.png`, fullPage });
      };
      await shot('');
      await shot('-full', true);
      await pv.locator('tr.person').filter({ has: page.locator('.hk') }).first().locator('.who-btn').click();
      const detail = pv.locator('tr.detail');
      await expect(detail).toBeVisible();
      // Keep the full evidence panel below the sticky bars in one capture.
      const detailHeight = await detail.evaluate((row) => row.getBoundingClientRect().height +
        document.querySelector<HTMLElement>('.bar')!.offsetHeight + document.querySelector<HTMLElement>('.ppl .tools')!.offsetHeight +
        document.querySelector<HTMLElement>('.ppl thead')!.offsetHeight + 32);
      await page.setViewportSize({ width, height: Math.max(height, Math.ceil(detailHeight)) });
      await detail.evaluate((row) => window.scrollTo(0, row.getBoundingClientRect().top + window.scrollY -
        document.querySelector<HTMLElement>('.bar')!.offsetHeight - document.querySelector<HTMLElement>('.ppl .tools')!.offsetHeight -
        document.querySelector<HTMLElement>('.ppl thead')!.offsetHeight - 8));
      await shot('-detail');
      expect(errors).toEqual([]);
    });
  }
});
