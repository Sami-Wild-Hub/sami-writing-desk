// Shared-sentence navigation, independent histories, filtering and CLI edits on both layouts.
import { expect, test } from '@playwright/test';
import { stubFirebase } from './stub.ts';
import { modelRecord, modelRecordId, modelPath, modelQuote, modelFix } from './proof-models-fixture.ts';

for (const width of [1280, 390]) test(`${width}px: three models share a quote and keep independent controls`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  const stub = await stubFirebase(page);
  stub.server(modelPath, modelRecord());
  await page.goto(`book/?book=maritime-story&view=proof&doc=${modelRecordId}`);
  const root = page.locator('[data-view=proof]');
  const cards = root.locator(width < 860 ? '.plist .pitem' : '.pv .pitem');
  const mark = root.locator('#pp-1 mark');
  await expect(cards).toHaveCount(3);
  await expect(mark).toHaveCount(1);
  await expect(mark).toHaveText(modelQuote);
  expect(JSON.parse((await mark.getAttribute('data-keys'))!)).toHaveLength(3);
  for (const check of ['open', 'opus', 'terra']) {
    await cards.filter({ hasText: `${check} 第2次` }).locator('.issue').click();
    await expect(mark).toHaveClass(/flash/);
    if (width < 860) {
      await expect(mark).toBeInViewport();
      await root.locator('[data-back-note]').click();
      await expect(cards.filter({ hasText: `${check} 第2次` })).toBeFocused();
    }
  }
  for (let i = 0; i < 2; i++) {
    await cards.nth(i).getByRole('button', { name: '下一条' }).click();
    await expect(cards.nth(i + 1)).toBeFocused();
    if (width >= 860) await expect(mark).toHaveClass(/flash/);
  }
  for (let i = 2; i > 0; i--) {
    await cards.nth(i).getByRole('button', { name: '上一条' }).click();
    await expect(cards.nth(i - 1)).toBeFocused();
    if (width >= 860) await expect(mark).toHaveClass(/flash/);
  }
  if (width >= 860) await expect(mark).toHaveClass(/flash/);
  await root.locator('[data-kind="文字"]').click();
  await expect(cards).toHaveCount(2);
  await root.locator('[data-filter=opus]').click();
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toHaveAttribute('data-check', 'opus');
  for (const check of ['opus', 'terra']) {
    await root.locator(`[data-filter=${check}]`).click();
    await cards.first().getByRole('button', { name: '接受', exact: true }).click();
    await expect(root.getByRole('textbox', { name: 'P1 正文', exact: true })).toHaveText(`前文。${modelFix}`);
    await cards.first().getByRole('button', { name: '撤销', exact: true }).click();
    await expect(mark).toHaveText(modelQuote);
  }
  await root.locator('[data-filter=all]').click();
  await root.locator('[data-kind=all]').click();
  for (const check of ['open', 'opus', 'terra']) {
    const tabs = root.getByRole('group', { name: new RegExp(`^${check === 'open' ? 'GPT chat' : check === 'opus' ? 'Opus' : 'Terra'}.*各次报告`) });
    await tabs.getByRole('button', { name: /第 1 次/ }).click();
    await expect(cards.filter({ hasText: `${check} 第1次` })).toHaveCount(1);
    for (const other of ['open', 'opus', 'terra'].filter(m => m !== check)) await expect(cards.filter({ hasText: `${other} 第2次` })).toHaveCount(1);
    await tabs.getByRole('button', { name: /第 2 次/ }).click();
  }
  await root.locator('[data-resend=terra]').click();
  expect(stub.at(`${modelPath}/checks/terra/status`)).toBe('queued');
  expect(stub.at(`${modelPath}/checks/opus/status`)).toBe('done');
  expect(stub.at(`${modelPath}/checks/open/status`)).toBe('done');
  expect(Object.keys(stub.at(`${modelPath}/reports`) as object)).toHaveLength(6);
});
