import { OUTLINE_ARCHIVED } from '../src/lib/views/outline/view-state.js';
// Exercise interrupted outline layers and view changes on both supported layout widths.
import { expect, test } from '@playwright/test';
import { hasOutline } from './outline-fixture.mjs';
import { stubFirebase, watchErrors } from './stub.ts';

test.skip(!hasOutline, 'canonical outline is supplied at runtime');
for (const width of [390, 1440]) {
  test(`view changes and interrupted outline layers keep state at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await stubFirebase(page); const errors = watchErrors(page);
    await page.goto('book/?book=maritime-story');
    await expect(page.locator('.doc-head')).toBeVisible();
    if (width === 390) {
      await page.locator('#novel-bar [data-drawer]').click();
      await expect(page.locator('.side.show')).toBeVisible(); await page.keyboard.press('Escape');
    }
    await page.locator('[data-aa]').click();
    await expect(page.locator('.aa-pop')).toBeVisible(); await page.keyboard.press('Escape');
    await expect(page.locator('.aa-pop')).toHaveCount(0);
    await page.locator('#novel-views [data-novel-view="people"]').click();
    await expect(page.locator('.who-btn').first()).toBeVisible();
    await page.locator('.who-btn').first().click();
    await expect(page.locator('.who-btn').first()).toHaveAttribute('aria-expanded', 'true');
    await page.locator('#novel-views [data-novel-view="outline"]').click();
    const root = page.locator('[data-view="outline"]'); await expect(root.locator('.self-head')).toBeVisible();
    const rank = root.locator('[data-bar] [data-act="toggle-rank"]');
    for (let i = 0; i < 3; i++) {
      await rank.evaluate((el: HTMLElement) => el.click());
      await root.locator('.rank-pop [data-act="toggle-rank"]').evaluate((el: HTMLElement) => el.click());
    }
    await rank.evaluate((el: HTMLElement) => el.click());
    await expect(root.locator('.rank-pop')).toHaveCount(1);
    expect(await root.locator('.rank-pop').evaluate((el: HTMLElement) => el.inert)).toBe(false);
    await page.keyboard.press('Escape'); await expect(root.locator('.rank-pop')).toHaveCount(0);
    await expect(rank).toBeFocused();
    await root.locator('.self-line.current [data-act="edit-line"]').click();
    await expect(root.locator('.modal [name="title"]')).toBeFocused();
    await page.keyboard.press('Escape'); await expect(root.locator('.modal-back')).toHaveCount(0);
    if (OUTLINE_ARCHIVED) await expect(root.locator('[data-tab="outline"]')).toHaveCount(0);
    else await root.locator('[data-tab="outline"]').click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await root.locator('.file-recovery summary').click();
    await expect(root.locator('#export-data')).toBeVisible();
    await root.locator('.file-recovery summary').click();
    await expect(root.locator('#export-data')).toBeHidden();
    expect(errors).toEqual([]);
  });
}
