// Regression coverage for repository replacement, recovery downloads and literal form values.
import { expect, test, type Locator, type Page } from '@playwright/test';
import { cell, path, setup, typeCell } from './foreshadow-browser.ts';
import { foreshadowFixture } from './foreshadow-fixture.mjs';
import { pack, unpack } from '../src/lib/views/outline/codec.js';

const editNote = (root: Locator, note: string) => typeCell(root, 0, '备注', note);
async function downloadJson(page: Page, button: Locator) {
  const waiting = page.waitForEvent('download');
  await button.click();
  const stream = await (await waiting).createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

test('repository replacement locks mutations until confirmation and retains the old draft base', async ({ page }) => {
  const { db, root } = await setup(page);
  const oldBase = db.at(`${path}/live/rev`);
  const repo = foreshadowFixture(); repo.rows[1].author['备注'] = 'Repository row two';
  db.server(`${path}/incoming`, { ...(db.at(`${path}/live`) as object), tree: 'repo-tree', commit: 'repo-commit', foreshadow: await pack(repo) });
  await editNote(root, 'Unsaved local note');
  db.holdNextWrite();
  await root.getByRole('button', { name: '用仓库版', exact: true }).click();
  await expect.poll(() => db.at(`${path}/live/over`)).toBe('repo-tree');
  await expect(root.getByRole('button', { name: /加行/ })).toBeDisabled();
  await expect(cell(root, 0, '备注')).not.toBeEditable();
  await expect(cell(root, 0, '是否已收')).toBeDisabled();
  await expect(root.locator('.fsh-notice button').first()).toBeDisabled();
  db.releaseWrite();
  await expect(root.locator('.fsh-notice')).toContainText('云端已有新版本');
  const local = await downloadJson(page, root.getByRole('button', { name: '下载本机版', exact: true }));
  expect(local.rows[0].author['备注']).toBe('Unsaved local note');
  const saved = await page.evaluate(() => Object.keys(localStorage).filter(k => k.endsWith(':foreshadow')).map(k => JSON.parse(localStorage.getItem(k)!)));
  expect(saved[0].base).toBe(oldBase);
  await page.reload();
  await expect(root.locator('.fsh-notice')).toContainText('云端已有新版本');
  await root.getByRole('button', { name: '载入云端版', exact: true }).click();
  await expect(cell(root, 1, '备注')).toHaveValue('Repository row two');
  await editNote(root, 'New repository-based note');
  await expect.poll(async () => JSON.parse(await unpack(db.at(`${path}/live/foreshadow`) as string)).rows[0].author['备注']).toBe('New repository-based note');
  expect(JSON.parse(await unpack(db.at(`${path}/live/foreshadow`) as string)).rows[1].author['备注']).toBe('Repository row two');
});

test('both views download the complete replaced version after repository adoption', async ({ page }) => {
  const { db, root } = await setup(page);
  await editNote(root, 'Saved web version');
  await expect.poll(async () => JSON.parse(await unpack(db.at(`${path}/live/foreshadow`) as string)).rows[0].author['备注']).toBe('Saved web version');
  const previous = db.at(`${path}/live`) as { plot: string; plan: string };
  const repo = foreshadowFixture(); repo.rows[0].author['备注'] = 'Repository';
  db.server(`${path}/incoming`, { ...previous, tree: 'repo-tree', commit: 'repo-commit', foreshadow: await pack(repo) });
  await root.getByRole('button', { name: '用仓库版', exact: true }).click();
  await expect(cell(root, 0, '备注')).toHaveValue('Repository');
  const kept = await downloadJson(page, root.getByRole('button', { name: '下载被替换的版本', exact: true }));
  expect(kept.foreshadow.rows[0].author['备注']).toBe('Saved web version');
  expect(kept.plot_data).toEqual(JSON.parse(await unpack(previous.plot)));
  expect(kept.plan).toEqual(JSON.parse(await unpack(previous.plan)));
  await page.goto('book/?book=maritime-story&view=outline');
  const outline = page.locator('[data-view="outline"]');
  await outline.getByText('文件与恢复', { exact: true }).click();
  expect(await downloadJson(page, outline.getByRole('button', { name: '下载被替换的版本', exact: true }))).toEqual(kept);
});

test('editing another cell preserves leading newlines, CRLF and trailing spaces verbatim', async ({ page }) => {
  const data = foreshadowFixture(), original = '\nFirst\r\nSecond\n  ';
  data.rows[0].author['伏笔／线索内容'] = original;
  const { db, root } = await setup(page, data);
  await expect(cell(root, 0, '伏笔／线索内容')).toHaveValue(original.replaceAll('\r\n', '\n'));
  await typeCell(root, 0, '备注', 'Only the note changed');
  await expect.poll(async () => JSON.parse(await unpack(db.at(`${path}/live/foreshadow`) as string)).rows[0].author['备注']).toBe('Only the note changed');
  expect(JSON.parse(await unpack(db.at(`${path}/live/foreshadow`) as string)).rows[0].author['伏笔／线索内容']).toBe(original);
});
