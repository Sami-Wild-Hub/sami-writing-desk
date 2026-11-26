import { OUTLINE_ARCHIVED } from '../src/lib/views/outline/view-state.js';
// Reopening the outline returns to the storyline, tab, Beat, library groups and scroll left last time.
import { expect, test } from '@playwright/test';
import { stubFirebase, watchErrors } from './stub.ts';
import { hasOutline, outlineFixture } from './outline-fixture.mjs';
test.skip(!hasOutline, 'private canonical data is not in public CI');
test.use({ viewport: { width: 1440, height: 900 } });
test('the workbench resumes where it was left after a reload', async ({ page }) => {
  const { plot_data } = outlineFixture()!, line = plot_data.storyline_groups.at(-1).id, beat = plot_data.beats.at(-1).beat_id;
  await stubFirebase(page); const errors = watchErrors(page);
  await page.goto('book/?book=maritime-story&view=outline');
  const root = page.locator('[data-view="outline"]');
  await root.locator('[data-act="toggle-picker"]').click(); await root.locator(`[data-act="select-line"][data-id="${line}"]`).click();
  await root.locator('.self-head [data-act="toggle-unplaced"]').click();
  if (OUTLINE_ARCHIVED) {
    await expect(root.locator('[data-tab="outline"]')).toHaveCount(0);
    await page.waitForTimeout(500);
    // Simulate a browser that last used the now-archived tab.
    await page.evaluate(() => {
      for (const key of Object.keys(localStorage).filter(k => k.endsWith(':view'))) {
        const value = JSON.parse(localStorage.getItem(key) || '{}');
        localStorage.setItem(key, JSON.stringify({ ...value, tab: 'outline' }));
      }
    });
    await page.reload();
    await expect(root.locator('.self-line.current h3')).toContainText(plot_data.storyline_groups.at(-1).title);
    await expect(root.locator('.self-head [data-act="toggle-unplaced"]')).toHaveAttribute('aria-pressed', 'false');
    await expect(root.locator('[data-tab="outline"]')).toHaveCount(0);
    expect(errors).toEqual([]);
    return;
  }
  await root.locator('[data-act="tab"][data-tab="outline"]').click();
  await root.locator(`[data-act="choose-beat"][data-id="${beat}"]`).click();
  await root.locator(`[data-filter-state="placed"]`).click();
  await root.locator(`.lib-line[data-key="lib:${line}"] summary .line-name`).click();
  const library = root.locator('[data-keep="library"]');
  await library.evaluate(el => el.scrollTo(0, 400)); const top = await library.evaluate(el => el.scrollTop); expect(top).toBeGreaterThan(0);
  await page.waitForTimeout(500);
  await page.reload();
  await expect(root.locator(`[data-act="choose-beat"][data-id="${beat}"]`)).toHaveAttribute('aria-current', 'step');
  await expect(root.locator(`.lib-line[data-key="lib:${line}"]`)).toHaveAttribute('open', '');
  await expect(root.locator('[data-filter-state="placed"]')).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => library.evaluate(el => el.scrollTop)).toBe(top);
  await root.locator('[data-act="tab"][data-tab="story"]').click();
  await expect(root.locator('.self-line.current h3')).toContainText(plot_data.storyline_groups.at(-1).title);
  await expect(root.locator('.self-head [data-act="toggle-unplaced"]')).toHaveAttribute('aria-pressed', 'false');
  expect(errors).toEqual([]);
});
