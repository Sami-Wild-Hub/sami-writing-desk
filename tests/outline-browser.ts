// Open card actions through their visible disclosure in browser tests.
import type { Locator } from '@playwright/test';

export async function cardMenu(card: Locator) {
  if (await card.locator('.card-menu').getAttribute('open') === null) await card.locator('.card-menu > summary').click();
}

export async function cardAction(card: Locator, action: string) {
  await cardMenu(card);
  await card.locator(`[data-act="${action}"]`).click();
}
