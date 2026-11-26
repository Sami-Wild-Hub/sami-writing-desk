// Reopening keeps the current storyline and filter while ignoring the archived tab.
import { expect, test } from '@playwright/test';
import { stubFirebase, watchErrors } from './stub.ts';
import { hasOutline, outlineFixture } from './outline-fixture.mjs';
test.skip(!hasOutline, 'private canonical data is not in public CI');
test.use({ viewport: { width: 1440, height: 900 } });
test('the workbench resumes where it was left after a reload', async ({ page }) => {
  const { plot_data } = outlineFixture()!, line = plot_data.storyline_groups.at(-1).id;
  await stubFirebase(page); const errors = watchErrors(page);
  await page.goto('book/?book=maritime-story&view=outline');
  const root = page.locator('[data-view="outline"]');
  await root.locator('[data-act="toggle-picker"]').click(); await root.locator(`[data-act="select-line"][data-id="${line}"]`).click();
  await root.locator('.self-head [data-act="toggle-unplaced"]').click();
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
});
