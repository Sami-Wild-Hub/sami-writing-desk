// The phone outline exposes its content early and keeps navigation and card actions usable.
import { expect, test } from '@playwright/test';
import { hasOutline, outlineFixture } from './outline-fixture.mjs';
import { stubFirebase, watchErrors } from './stub.ts';

test.skip(!hasOutline, 'canonical outline is supplied at runtime');

for (const width of [390, 1440]) {
  test(`outline navigation, card menu and responsive controls at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await stubFirebase(page, { canonical: true }); const errors = watchErrors(page);
    await page.goto('book/?book=maritime-story&view=outline');
    const root = page.locator('[data-view="outline"]'), first = root.locator('.self-pane .card').first();
    await expect(first).toBeVisible();
    await expect(root.locator('#undo')).toHaveCount(0);
    await expect(root.locator('#sync-state')).toHaveText('✓ 已保存');
    if (width === 390) {
      expect((await first.boundingBox())!.y).toBeLessThanOrEqual(205);
      await expect(page.locator('#novel-bar [data-drawer]')).toBeVisible();
      const person = root.locator('.ol-person');
      await person.click(); await expect(root.locator('.side.show')).toBeVisible();
      await expect(root.locator('.side .pick-line')).toHaveCount(outlineFixture()!.plot_data.storyline_groups.length);
      await page.keyboard.press('Escape'); await expect(person).toBeFocused();
      await person.click(); await page.locator('.scrim').click({ position: { x: 380, y: 400 } });
      await expect(person).toBeFocused();
      await person.click(); await root.locator('.file-recovery > summary').click();
      await expect(root.locator('#export-data')).toBeInViewport();
      const download = page.waitForEvent('download'); await root.locator('#export-data').click(); await download;
      await root.locator('.file-recovery > summary').click();
      await root.locator('.pick-line[data-id="G03"]').click();
      await expect(root.locator('.side.show')).toHaveCount(0);
      await expect(root.locator('.self-line.current')).toHaveAttribute('data-line-block', 'G03');
      await expect(root.locator('.self-line.current h3')).toBeInViewport();
    } else {
      const toolbar = root.locator('[data-toolbar]');
      expect((await toolbar.boundingBox())!.height).toBe(52);
      await expect(toolbar.locator('.tabs')).toHaveCount(0);
    }
    const card = root.locator('.self-pane .card').first(), summary = card.locator('.card-menu > summary');
    await summary.click(); await expect(card.getByRole('button', { name: '编辑', exact: true })).toBeVisible();
    await expect(card.locator('select')).toHaveCount(2);
    await page.keyboard.press('Escape'); await expect(card.locator('.card-menu')).not.toHaveAttribute('open', '');
    await expect(summary).toBeFocused();
    await summary.click(); await root.locator('.self-line.current h3').click();
    await expect(card.locator('.card-menu')).not.toHaveAttribute('open', '');
    const id = await card.getAttribute('data-card');
    await card.locator('.badge').click(); await expect(root.locator('#undo')).toBeVisible();
    await root.locator('#undo').click();
    await expect(root.locator(`.self-pane [data-card="${id}"]`)).toHaveCount(1);
    await expect(root.locator('#undo')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.setViewportSize({ width: width === 390 ? 1440 : 390, height: 844 });
    await expect(root.locator('#sync-state')).toBeVisible();
    await expect(root.locator('.file-recovery')).toHaveCount(1);
    expect(errors).toEqual([]);
  });
}
