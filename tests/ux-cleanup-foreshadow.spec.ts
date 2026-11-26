// Empty filtered results explain what happened without changing any foreshadow data.
// Reads: canonical outline fixture foreshadow.json (JSON).
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { stubFirebase } from './stub.ts';
import { outlinePath } from './outline-fixture.mjs';
import { pack } from '../src/lib/views/outline/codec.js';
import { filterRows, plantingChapters } from '../src/lib/views/foreshadow/model.js';

const file = resolve(outlinePath, 'foreshadow.json');
test.skip(!existsSync(file), 'canonical foreshadow data is supplied at runtime');

test('an empty filter explains the result and clears the message when rows return', async ({ page }) => {
  const data = JSON.parse(readFileSync(file, 'utf8'));
  const db = await stubFirebase(page), base = 'households/novel-stub-house/outlineSync/maritime-story';
  const packed = await pack(data);
  db.server(`${base}/live/foreshadow`, packed);
  db.server(`${base}/starter/foreshadow`, packed);
  const chapters = [...new Set<string>(data.rows.flatMap(plantingChapters))];
  const chapter = chapters.find(value => !filterRows(data, '已收', value).length)!;
  expect(chapter, 'canonical data contains a filter with no matches').toBeTruthy();
  await page.goto('book/?book=maritime-story&view=foreshadow');
  await expect(page.locator('.fsh tbody tr').first()).toBeVisible();
  await page.getByLabel('按是否已收筛选').selectOption('已收');
  await page.getByLabel('按埋设章节筛选').selectOption(chapter);
  await expect(page.locator('.fsh tbody tr')).toHaveCount(0);
  await expect(page.getByText('没有符合筛选的伏笔，试试其他筛选。', { exact: true })).toBeVisible();
  await page.getByLabel('按是否已收筛选').selectOption('');
  await page.getByLabel('按埋设章节筛选').selectOption('');
  await expect(page.locator('.fsh tbody tr')).toHaveCount(data.rows.length);
  await expect(page.locator('.fsh-empty-state')).toBeHidden();
});

test('the save summary uses the same wording as the outline and retains diagnostic detail', async ({ page }) => {
  const data = JSON.parse(readFileSync(file, 'utf8'));
  const db = await stubFirebase(page), base = 'households/novel-stub-house/outlineSync/maritime-story';
  db.server(`${base}/live/foreshadow`, await pack(data));
  await page.goto('book/?book=maritime-story&view=foreshadow');
  const status = page.locator('.fsh-status');
  await expect(page.locator('.fsh tbody tr').first()).toBeVisible();
  await expect(status).toHaveText('已保存');
  await expect(status).toHaveAttribute('title', /已入库/);
  db.server(`${base}/head/synced/rev`, 'older-version');
  await expect(status).toHaveText('已保存');
  await expect(status).toHaveAttribute('title', /待入库/);
});
