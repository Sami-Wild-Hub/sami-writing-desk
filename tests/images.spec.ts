// Owner images: enabled galleries open full-size media; empty tabs stay disabled.
import { expect, test } from '@playwright/test';
import { stubFirebase, watchErrors, env } from './stub.ts';

const book = 'households/novel-stub-house/novelArchive/books/maritime-story';
const src = 'data:image/webp;base64,UklGRjwAAABXRUJQVlA4IDAAAADQAQCdASoDAAIAAUAmJaACdLoB+AADsAD+8ut//NgVzXPv9//S4P0uD9Lg/9KQAAA=';
const privatePayload = Boolean(env.NOVEL_STUB_DB);
const location = privatePayload ? 'LOC-白榆路宅' : 'LOC-Dock';
const emptyLocation = privatePayload ? 'LOC-西津' : 'LOC-Dock';
const character = privatePayload ? 'CH-张予安' : 'CH-Ann';
const open = (domain: string, id: string) => `book/?book=maritime-story&doc=${encodeURIComponent(`owners/${domain}/${id}/START_HERE.md`)}`;

test('Owner images display and open at full size', async ({ page }) => {
  const errors = watchErrors(page);
  if (privatePayload) await page.setViewportSize({ width: 1280, height: 1000 });
  const db = await stubFirebase(page);
  if (!privatePayload) db.server(`${book}/images`, JSON.stringify({
    'owners/LOCATION/LOC-Dock': [{ caption: 'Harbor plan-old.png', src }],
  }));
  await page.goto(open('LOCATION', location));
  const tab = page.locator('.subtabs').getByRole('button', { name: '图片', exact: true });
  await expect(tab).toBeEnabled();
  await tab.click();
  const gallery = page.getByRole('region', { name: '图片', exact: true });
  await expect(gallery).toBeVisible();
  await expect(gallery.locator('img')).toHaveCount(privatePayload ? 10 : 1);
  const first = gallery.locator('img').first();
  await expect.poll(() => first.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  await expect(gallery.locator('figcaption').first()).toHaveText(privatePayload ? '示意平面图（试点）' : 'Harbor plan-old.png');
  if (env.NOVEL_SHOTS_DIR) await page.screenshot({ path: `${env.NOVEL_SHOTS_DIR}/location-images.png`, fullPage: false });
  await gallery.locator('button').first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('img')).toHaveAttribute('src', (await first.getAttribute('src'))!);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await page.locator('.subtabs').getByRole('link', { name: '起点', exact: true }).click();
  await expect(gallery).toBeHidden();
  await expect(page.locator('.doc .prose')).toBeVisible();
  expect(errors).toEqual([]);
});

test('locations and characters without images have a grey disabled tab', async ({ page }) => {
  const errors = watchErrors(page);
  if (privatePayload) await page.setViewportSize({ width: 1280, height: 1000 });
  await stubFirebase(page);
  for (const [domain, id] of [['LOCATION', emptyLocation], ['CHARACTER', character]]) {
    await page.goto(open(domain, id));
    const tab = page.locator('.subtabs').getByRole('button', { name: '图片', exact: true });
    await expect(tab).toBeVisible();
    await expect(tab).toBeDisabled();
    expect(await tab.evaluate(el => getComputedStyle(el).opacity)).toBe('0.5');
    await tab.dispatchEvent('click');
    await expect(page.locator('.owner-gallery')).toHaveCount(0);
    await expect(page.locator('.doc .prose')).toBeVisible();
    if (env.NOVEL_SHOTS_DIR) await page.screenshot({ path: `${env.NOVEL_SHOTS_DIR}/${domain.toLowerCase()}-images-disabled.png` });
  }
  expect(errors).toEqual([]);
});
