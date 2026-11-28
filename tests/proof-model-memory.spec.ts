// Mode memory, unsent recheck selections and in-flight model edits survive real view lifecycles.
import { expect, test } from '@playwright/test';
import { stubFirebase } from './stub.ts';
import { modelRecord, modelRecordId, modelPath } from './proof-models-fixture.ts';

test('refresh and consecutive sends select the memory for the restored/reset mode', async ({ page }) => {
  const stub = await stubFirebase(page);
  await page.goto('book/?book=maritime-story&view=proof');
  const model = (id: string) => page.locator(`[name=model][value=${id}]`);
  await model('open').uncheck(); await model('opus').check();
  await page.locator('[name=skipProse]').check();
  await model('open').uncheck(); await model('terra').check();
  await page.getByLabel('标题', { exact: true }).fill('模式记忆');
  await page.getByLabel('新稿', { exact: true }).fill('稿子。');
  await page.reload();
  await expect(page.locator('[name=skipProse]')).toBeChecked();
  await expect(model('terra')).toBeChecked(); await expect(model('opus')).not.toBeChecked();
  await page.locator('[data-send]').click();
  await expect.poll(() => new URL(page.url()).searchParams.get('doc')).toBeTruthy();
  await page.getByRole('button', { name: '历史', exact: true }).click();
  await page.locator('[data-view=proof] .new').click();
  await expect(page.locator('[name=skipProse]')).not.toBeChecked();
  await expect(model('opus')).toBeChecked(); await expect(model('terra')).not.toBeChecked();
  await page.getByLabel('标题', { exact: true }).fill('第二次');
  await page.getByLabel('新稿', { exact: true }).fill('第二稿。');
  await page.locator('[data-send]').click();
  await expect.poll(() => new URL(page.url()).searchParams.get('doc')).toBeTruthy();
  const rows = Object.values(stub.at('/households/novel-stub-house/proofdesk/maritime-story') as Record<string, any>);
  expect(rows.map(r => Object.keys(r.checks))).toEqual([['terra'], ['opus']]);
  await page.getByRole('button', { name: '历史', exact: true }).click();
  await page.locator('[data-view=proof] .new').click();
  await page.locator('[name=skipProse]').check();
  await expect(model('terra')).toBeChecked(); await expect(model('opus')).not.toBeChecked();
});

test('recheck saves its own model selection without replacing normal mode memory', async ({ page }) => {
  const stub = await stubFirebase(page);
  stub.server(modelPath, modelRecord());
  await page.goto(`book/?book=maritime-story&view=proof&doc=${modelRecordId}`);
  await page.locator('[data-recheck]').click();
  await expect(page.locator('[name=model]:checked')).toHaveCount(3);
  await page.locator('[name=model][value=open]').uncheck();
  await page.locator('[name=model][value=opus]').uncheck();
  await page.reload();
  await expect(page.locator('[data-send]')).toHaveText('发送复校');
  await expect(page.locator('[name=model]:checked')).toHaveCount(1);
  await expect(page.locator('[name=model][value=terra]')).toBeChecked();
  await page.locator('[data-cancel-recheck]').click();
  await expect(page.locator('[name=model][value=open]')).toBeChecked();
  await expect(page.locator('[name=model][value=terra]')).not.toBeChecked();
});

test('changing only models while sending preserves the unsent form', async ({ page }) => {
  const stub = await stubFirebase(page);
  await page.goto('book/?book=maritime-story&view=proof');
  await page.getByLabel('标题', { exact: true }).fill('发送期间');
  await page.getByLabel('新稿', { exact: true }).fill('保留。');
  stub.holdWrites(); await page.locator('[data-send]').click();
  await page.locator('[name=model][value=terra]').check();
  stub.releaseWrites();
  await expect(page.locator('.toast')).toContainText('校稿已发送');
  await expect(page.locator('[name=draft]')).toHaveValue('保留。');
  await page.reload();
  await expect(page.locator('[name=draft]')).toHaveValue('保留。');
  await expect(page.locator('[name=model][value=terra]')).toBeChecked();
});
