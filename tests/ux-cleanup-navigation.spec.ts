// Navigation controls stay usable on phones and return keyboard focus after dismissal.
import { expect, test } from '@playwright/test';
import { stubFirebase } from './stub.ts';

test('the phone only offers a drawer when the current view has one', async ({ page }) => {
  await stubFirebase(page);
  await page.goto('book/?book=maritime-story&view=foreshadow');
  await expect(page.locator('.fsh')).toBeVisible();
  const opener = page.locator('#novel-bar [data-drawer]');
  await expect(opener).toBeHidden();
  await page.locator('#novel-views [data-novel-view="reader"]').click();
  await expect(page.locator('.doc-head')).toBeVisible();
  await expect(opener).toBeVisible();
  await opener.click();
  await expect(page.locator('.side.show')).toBeVisible();
});

test('a phone deep link reveals its selected tab without scrolling the page', async ({ page }) => {
  await stubFirebase(page);
  await page.goto('book/?book=maritime-story&view=timeline');
  await expect(page.locator('.tlv .row').first()).toBeVisible();
  const selected = page.locator('#novel-views [aria-current="page"]');
  await expect(selected).toHaveText('时间线');
  const bounds = await selected.evaluate(el => {
    const tab = el.getBoundingClientRect(), strip = el.parentElement!.getBoundingClientRect();
    return { left: tab.left - strip.left, right: strip.right - tab.right, y: window.scrollY };
  });
  expect(bounds.left).toBeGreaterThanOrEqual(-1); // Browser scroll offsets round to whole pixels.
  expect(bounds.right).toBeGreaterThanOrEqual(-1);
  expect(bounds.y).toBe(0);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => selected.evaluate(el => {
    const tab = el.getBoundingClientRect(), strip = el.parentElement!.getBoundingClientRect();
    return Math.min(tab.left - strip.left, strip.right - tab.right);
  })).toBeGreaterThanOrEqual(-1);
});

for (const menu of ['account', 'book']) {
  test(`Escape returns focus from the ${menu} menu to its opener`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await stubFirebase(page);
    await page.goto('book/?book=maritime-story');
    await expect(page.locator('.doc-head')).toBeVisible();
    const opener = page.locator(menu === 'account' ? '#novel-account' : '#novel-bar .book');
    const panel = page.locator(`#novel-${menu}-menu`);
    await opener.click();
    await panel.locator('a').first().focus();
    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
    await expect(opener).toBeFocused();
    await expect(opener).toHaveAttribute('aria-expanded', 'false');
    await page.keyboard.press('Enter');
    await expect(panel).toBeVisible();
  });
}

test('the shelf account menu also closes on Escape and returns focus', async ({ page }) => {
  await stubFirebase(page);
  await page.goto('./');
  const opener = page.locator('#home-account'), panel = page.locator('#home-account-menu');
  await expect(opener).toBeVisible();
  await opener.click();
  await page.locator('#home-sign-out').focus();
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  await expect(opener).toBeFocused();
  await expect(opener).toHaveAttribute('aria-expanded', 'false');
});
