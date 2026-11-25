import { expect, test } from '@playwright/test';
import { env, stubFirebase, watchErrors } from './stub.ts';

// Design screenshots at phone, laptop and Studio Display widths. Runs only when
// NOVEL_SHOTS_DIR names a folder; with NOVEL_STUB_DB the shots carry real (private) content.
const dir = env.NOVEL_SHOTS_DIR;
const sizes = [[390, 844], [1280, 800], [2560, 1440]] as const;

test.describe('screens', () => {
  test.skip(!dir, 'set NOVEL_SHOTS_DIR to take the design screenshots');

  for (const [width, height] of sizes) {
    test(`${width}px`, async ({ page }) => {
      test.setTimeout(120_000);
      const errors = watchErrors(page);
      await page.setViewportSize({ width, height });
      await stubFirebase(page);
      const shot = async (name: string, fullPage = false) => {
        await page.waitForTimeout(400);
        expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), `${name} overflows`).toBeLessThanOrEqual(0);
        await page.screenshot({ path: `${dir}/${width}-${name}.png`, fullPage });
      };
      const doc = page.locator('[data-view="reader"] .doc');
      const tl = page.locator('[data-view="timeline"] .tlv');

      await page.goto('./');
      await expect(page.locator('article[data-book] [data-scope]').first()).not.toBeEmpty();
      await shot('home', true);

      await page.goto('book/?book=maritime-story');
      await expect(doc.locator('.doc-head h1')).not.toBeEmpty();
      await shot('reader-index');
      await doc.locator('.cards a').first().click();
      await expect(doc.locator('.doc-meta a.pill.accent')).toBeVisible();
      const person = await doc.locator('.doc-head h1').innerText();
      await shot('reader-person');

      await page.goto('book/?book=maritime-story&view=timeline');
      await expect(tl.locator('.row').first()).toBeVisible();
      await shot('timeline-standard');
      await tl.locator('.row').nth(4).click();
      await expect(tl.locator('.card')).toBeVisible();
      await shot('timeline-card');
      const event = await tl.locator('.card .acts a.btn.primary').getAttribute('href');
      const source = await tl.locator('.card a.loc').first().getAttribute('href');
      await tl.locator('[data-z="0.4"]').click();
      await expect(tl.locator('.tl')).toHaveClass(/overview/);
      await shot('timeline-overview');

      const pv = page.locator('[data-view="people"] .ppl');
      await page.goto('book/?book=maritime-story&view=people');
      await expect(pv.locator('tr.person').first()).toBeVisible();
      await shot('people');
      await shot('people-full', true);
      const known = pv.locator('tr.person').filter({ has: page.locator('.hk') }).first();
      await known.locator('.who-btn').click();
      await expect(pv.locator('tr.detail')).toBeVisible();
      await pv.locator('tr.detail').evaluate((row) => window.scrollTo(0, row.getBoundingClientRect().top + window.scrollY -
        document.querySelector<HTMLElement>('.bar')!.offsetHeight - document.querySelector<HTMLElement>('.ppl .tools')!.offsetHeight - document.querySelector<HTMLElement>('.ppl thead')!.offsetHeight - 8));
      await shot('people-detail');

      await page.goto(event!);
      await expect(doc.locator('.doc-head h1')).not.toBeEmpty();
      await shot('reader-event');
      await page.goto(source!);
      await expect(doc.locator('.flash')).toBeVisible();
      await shot('reader-jump');

      await page.keyboard.press('/');
      await page.locator('#novel-search').fill(person);
      await expect(page.locator('#novel-results .hit').first()).toBeVisible();
      await shot('search');
      expect(errors).toEqual([]);
    });
  }
});
