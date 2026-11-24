// Timeline search/scroll must preserve chart nodes and anchors; bulk filters can be undone.
import { expect, test, type Page } from '@playwright/test';
import { stubFirebase } from './stub.ts';
test.use({ viewport: { width: 1440, height: 900 } });
async function open(page: Page) {
  const stub = await stubFirebase(page), path = 'households/novel-stub-house/novelArchive/books/maritime-story/timeline';
  const data = JSON.parse(stub.at(path) as string);
  for (let i = 0; i < 80; i++) {
    const id = `E-${10000 + i}`, text = i === 35 ? '定位词事件' : `测试事件 ${i}`;
    data.points[id] = { r: 100 + i, b: i < 40 ? 0 : 1, t: text, title: text, time: '', story: i === 35 ? '很长的经过。'.repeat(2000) : '', roles: {}, locs: [] };
    data.owners[0].pts.push([id, text, 0]);
  }
  stub.server(path, JSON.stringify(data)); await page.goto('book/?book=maritime-story&view=timeline');
  const root = page.locator('[data-view="timeline"]'); await expect(root.locator('.row')).toHaveCount(84);
  return root;
}

test('composition does not search or jump; overview search becomes readable and restores density', async ({ page }) => {
  const root = await open(page), input = root.locator('.find input');
  await root.locator('[data-z="0.4"]').click(); await expect(root.locator('.tl')).toHaveClass(/overview/);
  const before = await page.evaluate(() => scrollY);
  await input.dispatchEvent('compositionstart'); await input.fill('定位词');
  await input.dispatchEvent('keydown', { key: 'Enter', isComposing: true }); await page.waitForTimeout(180);
  expect(await page.evaluate(() => scrollY)).toBe(before); await expect(root.locator('.tl')).toHaveClass(/overview/);
  await input.dispatchEvent('compositionend');
  await expect(root.locator('.tl')).not.toHaveClass(/overview/);
  await expect(root.locator('.row[data-p="E-10035"] .tx')).toBeVisible();
  await expect(root.locator('.row[data-p="E-10035"]')).toBeInViewport();
  await expect(root.locator('[data-z="0.4"]')).toHaveAttribute('aria-pressed', 'true');
  await input.press('Escape'); await expect(root.locator('.tl')).toHaveClass(/overview/);
});

test('search and scrolling in one band leave the chart and strip nodes in place', async ({ page }) => {
  const root = await open(page), input = root.locator('.find input');
  await root.locator('.row[data-p="E-10010"]').scrollIntoViewIfNeeded(); await page.waitForTimeout(100);
  await root.locator('.strip').evaluate(el => { (window as any).stripNode = el.firstElementChild; });
  await root.locator('.tl svg').evaluate(el => { (window as any).svgNode = el.firstElementChild; });
  await page.evaluate(() => scrollBy(0, 5)); await page.waitForTimeout(100);
  expect(await root.locator('.strip').evaluate(el => el.firstElementChild === (window as any).stripNode)).toBe(true);
  await input.fill('定位词'); await expect(root.locator('.cnt')).toHaveText('1/1');
  expect(await root.locator('.tl svg').evaluate(el => el.firstElementChild === (window as any).svgNode)).toBe(true);
});

test('filtering retains the visible event, clear has undo, and closing a long card reveals its row', async ({ page }) => {
  const root = await open(page), row = root.locator('.row[data-p="E-10035"]');
  await row.scrollIntoViewIfNeeded(); const before = await row.evaluate(el => el.getBoundingClientRect().top);
  await root.locator('.side [data-o="CH-Cy"]').evaluate((el: HTMLInputElement) => el.click());
  expect(Math.abs(await row.evaluate(el => el.getBoundingClientRect().top) - before)).toBeLessThan(3);
  const other = root.locator('.side input[data-o]:not(:disabled):not([data-o="CH-Cy"])').first();
  const otherId = await other.getAttribute('data-o');
  await other.evaluate((el: HTMLInputElement) => el.click());
  await root.locator('.side [data-all="0"]').evaluate((el: HTMLElement) => el.click());
  await page.locator('.toast').getByRole('button', { name: '撤销' }).click();
  await expect(root.locator('.side [data-o="CH-Cy"]')).not.toBeChecked();
  await expect(root.locator(`.side [data-o="${otherId}"]`)).toBeChecked();
  await row.click(); const card = root.locator('[data-card="E-10035"]');
  await card.locator('[data-close]').click(); await expect(card).toHaveCount(0); await expect(row).toBeInViewport();
});

test('a later individual checkbox invalidates bulk undo; unchanged bulk actions offer no undo', async ({ page }) => {
  const root = await open(page);
  await root.locator('.side [data-all="0"]').click();
  await expect(page.locator('.toast button')).toBeVisible();
  await root.locator('.side [data-o="CH-Cy"]').check();
  await expect(page.locator('.toast button')).toHaveCount(0);
  await expect(root.locator('.side [data-o="CH-Cy"]')).toBeChecked();
  await root.locator('.side [data-all="1"]').click();
  await page.locator('.toast button').click();
  await expect(root.locator('.side [data-o="CH-Cy"]')).toBeChecked();
  await expect(page.locator('.toast')).toHaveCount(0);
  await root.locator('.side [data-all="0"]').click();
  await page.locator('.toast button').focus();
  await page.locator('.toast').evaluate(el => { (window as any).bulkToast = el; });
  await root.locator('.side [data-all="0"]').click();
  expect(await page.locator('.toast').evaluate(el => el === (window as any).bulkToast)).toBe(true);
});
