// Browser edits, shared-revision conflicts and optional private design screenshots.
import { expect, test, type Page } from '@playwright/test';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { env, stubFirebase, watchErrors } from './stub.ts';
import { foreshadowFixture } from './foreshadow-fixture.mjs';
import { pack, unpack } from '../src/lib/views/outline/codec.js';
import type { ForeshadowData } from '../src/lib/views/foreshadow/schema.ts';

const path = 'households/novel-stub-house/outlineSync/maritime-story';
async function setup(page: Page, data = foreshadowFixture()) {
  const db = await stubFirebase(page);
  db.server(`${path}/live/foreshadow`, await pack(data));
  await page.goto('book/?book=maritime-story&view=foreshadow');
  const root = page.locator('[data-view="foreshadow"]');
  await expect(root.locator('tbody tr')).toHaveCount(data.rows.length);
  return { db, root };
}

test('signed-out access reads no private data, and an absent table shows its empty state', async ({ page }) => {
  const db = await stubFirebase(page, { signedIn: false });
  await page.goto('book/?book=maritime-story&view=foreshadow');
  await expect(page.locator('#novel-sign-in')).toBeVisible();
  expect(db.filter(p => p.includes('outlineSync') || p.includes('novelArchive'))).toEqual([]);
});

test('optional absence, column order, line breaks, filters and reader links', async ({ page }) => {
  const { root, db } = await setup(page);
  expect(await root.locator('th').allTextContents()).toEqual([...foreshadowFixture().columns.map(c => c.header), '操作']);
  await expect(root.locator('tbody tr').first().locator('td').nth(2)).toHaveText('A clue\nSecond line');
  await expect(root.locator('tbody tr').nth(1).locator('script')).toHaveCount(0);
  await root.getByLabel('是否已收', { exact: true }).selectOption('已收');
  await expect(root.locator('tbody tr')).toHaveCount(1);
  await root.getByLabel('埋设章节', { exact: true }).selectOption('C2');
  await expect(root.locator('tbody tr')).toHaveCount(0);
  await root.getByLabel('是否已收', { exact: true }).selectOption('');
  await expect(root.locator('tbody tr')).toHaveCount(1);
  await root.locator('[data-kind="planting"]').click();
  await expect(page.locator('[data-view="reader"] #p5')).toHaveClass(/flash/);
  await page.goBack();
  await root.getByLabel('埋设章节', { exact: true }).selectOption('');
  await root.locator('[data-kind="recovery"]').click();
  await expect(page.locator('[data-view="reader"] .doc-head h1')).toContainText('第2章');
  await page.goBack();
  db.server(`${path}/live/foreshadow`, null);
  await expect(root).toContainText('伏笔表尚未同步');
});

test('edit, reload, add/delete and outline saves preserve the third document', async ({ page }) => {
  const { root, db } = await setup(page);
  const original = db.at(`${path}/live`) as { plot: string; plan: string };
  await root.getByRole('button', { name: '编辑', exact: true }).first().click();
  await root.getByLabel('伏笔／线索内容', { exact: true }).fill('Changed\nSecond line');
  await root.getByLabel('埋设章节', { exact: true }).last().fill('C2');
  await root.getByRole('button', { name: '保存修改' }).click();
  await expect.poll(async () => JSON.parse(await unpack(db.at(`${path}/live/foreshadow`) as string)).rows[0].author['埋设章节']).toBe('C2');
  let saved = JSON.parse(await unpack(db.at(`${path}/live/foreshadow`) as string));
  expect(saved.rows[0].derived.planting_location.link).toBe('C1#P2');
  expect(db.at(`${path}/live/plot`)).toBe(original.plot); expect(db.at(`${path}/live/plan`)).toBe(original.plan);
  await page.reload(); await expect(root.locator('tbody tr').first()).toContainText('Changed\nSecond line');
  await root.getByRole('button', { name: '加行', exact: true }).click();
  await root.getByLabel('伏笔ID', { exact: true }).fill('three');
  await root.getByLabel('埋设链接', { exact: true }).fill('C2#P5-P6');
  await root.getByLabel('回收章节链接', { exact: true }).fill('C1, C2');
  await root.getByRole('button', { name: '保存修改' }).click();
  await expect.poll(async () => JSON.parse(await unpack(db.at(`${path}/live/foreshadow`) as string)).rows.length).toBe(3);
  page.once('dialog', dialog => dialog.accept());
  await root.getByRole('button', { name: '删除', exact: true }).last().click();
  await expect.poll(async () => JSON.parse(await unpack(db.at(`${path}/live/foreshadow`) as string)).rows.length).toBe(2);
  const beforeOutline = db.at(`${path}/live/foreshadow`);
  await page.goto('book/?book=maritime-story&view=outline');
  const outline = page.locator('[data-view="outline"]');
  await expect(outline.locator('#overall')).toBeVisible();
  const live = db.at(`${path}/live`) as { rev: string };
  // Use the outline's actual edit form, then wait for its existing autosave.
  await outline.locator('[data-act="edit-card"]').first().click();
  const form = outline.locator('[data-form="card"]');
  await form.locator('[name="text"]').fill('Outline changed');
  await form.locator('button[type="submit"]').click();
  await expect.poll(() => (db.at(`${path}/live`) as { rev: string }).rev).not.toBe(live.rev);
  expect(db.at(`${path}/live/foreshadow`)).toBe(beforeOutline);
  saved = JSON.parse(await unpack(beforeOutline as string)); expect(saved.rows[0].author['伏笔／线索内容']).toBe('Changed\nSecond line');
});

test('cloud conflict keeps local draft until an explicit choice; repository resolution includes foreshadow', async ({ page }) => {
  const { root, db } = await setup(page);
  await root.getByRole('button', { name: '编辑', exact: true }).first().click();
  await root.getByLabel('备注', { exact: true }).fill('Local');
  await root.getByRole('button', { name: '保存修改' }).click();
  const remote = foreshadowFixture(); remote.rows[0].author['备注'] = 'Remote';
  db.server(`${path}/live`, { ...(db.at(`${path}/live`) as object), rev: 'other0000001', foreshadow: await pack(remote) });
  await expect(root.locator('.fsh-notice')).toContainText('云端已有新版本');
  await page.reload(); await expect(root.locator('.fsh-notice')).toContainText('云端已有新版本');
  await root.getByRole('button', { name: '用本机版覆盖' }).click();
  await expect.poll(async () => JSON.parse(await unpack(db.at(`${path}/live/foreshadow`) as string)).rows[0].author['备注']).toBe('Local');
  const live = db.at(`${path}/live`) as { plot: string; plan: string };
  db.server(`${path}/incoming`, { tree: 'incoming-tree', commit: 'incoming-commit', ...live, foreshadow: await pack(remote) });
  await root.getByRole('button', { name: '用仓库版', exact: true }).click();
  await expect.poll(async () => JSON.parse(await unpack(db.at(`${path}/live/foreshadow`) as string)).rows[0].author['备注']).toBe('Remote');
  expect(db.at(`${path}/live/over`)).toBe('incoming-tree');
  expect(db.at(`${path}/kept/foreshadow`)).toBeTruthy();
});

test('remote changes to another row cannot redirect an open editor to the wrong row', async ({ page }) => {
  const { root, db } = await setup(page);
  await root.getByRole('button', { name: '编辑', exact: true }).last().click();
  await root.getByLabel('备注', { exact: true }).fill('Editing row two');
  const remote = foreshadowFixture(); remote.rows.shift();
  db.server(`${path}/live`, { ...(db.at(`${path}/live`) as object), rev: 'other0000001', foreshadow: await pack(remote) });
  await expect(root.locator('tbody tr')).toHaveCount(1);
  await root.getByRole('button', { name: '保存修改' }).click();
  await expect.poll(async () => JSON.parse(await unpack(db.at(`${path}/live/foreshadow`) as string)).rows[0].author['备注']).toBe('Editing row two');
});

test.describe('private foreshadow screenshots and real reader destinations', () => {
  test.skip(!env.FORESHADOW_SHOTS_DIR, 'set private foreshadow paths to capture screenshots');
  test.use({ deviceScaleFactor: 2 });
  for (const width of [1440, 390]) test(`${width}px`, async ({ page }) => {
    const data = JSON.parse(await readFile(resolve(env.FORESHADOW_DATA_REPO!, 'outline/maritime-story/foreshadow.json'), 'utf8')) as ForeshadowData;
    const errors = watchErrors(page), db = await stubFirebase(page);
    const book = 'households/novel-stub-house/novelArchive/books/maritime-story';
    const manifest = db.at(`${book}/manifest`) as { entries: Record<string, object> };
    for (let c = 1; c <= 22; c++) {
      const path = `source/C${c}.md`, key = Buffer.from(path).toString('base64url');
      const md = await readFile(resolve(env.FORESHADOW_SOURCE_ROOT!, 'compiled', path), 'utf8');
      const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const html = `<h4>第${c}章</h4>` + [...md.matchAll(/<a id="p(\d+)"><\/a>\[P\d+\]\s*([^\n]+)/g)].map(m => `<p><a id="p${m[1]}"></a>[P${m[1]}] ${escape(m[2])}</p>`).join('');
      manifest.entries[key] = { path, title: `C${c}`, section: '正文' }; db.server(`${book}/pages/${key}`, html);
    }
    db.server(`${book}/manifest`, manifest); db.server(`${path}/live/foreshadow`, await pack(data));
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await page.goto('book/?book=maritime-story&view=foreshadow');
    const root = page.locator('[data-view="foreshadow"]');
    await expect(root.locator('tbody tr')).toHaveCount(data.rows.length);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
    await mkdir(env.FORESHADOW_SHOTS_DIR!, { recursive: true });
    await page.screenshot({ path: resolve(env.FORESHADOW_SHOTS_DIR!, `${width === 390 ? 'phone' : 'desktop'}.png`) });
    for (const i of [0, 1, 2]) {
      const loc = data.rows[i].derived.planting_location.link, match = /^C(\d+)#P(\d+)/.exec(loc)!;
      await root.locator('tbody tr').nth(i).locator('[data-kind="planting"]').click();
      await expect(page.locator(`[data-view="reader"] #p${match[2]}`)).toHaveClass(/flash/);
      expect(new URL(page.url()).searchParams.get('doc')).toBe(`source/C${match[1]}.md`);
      const quote = data.rows[i].author['伏笔／线索内容'].split('\n')[0];
      await expect(page.locator(`[data-view="reader"] #p${match[2]}`)).toContainText(quote);
      await page.goBack();
    }
    const i = data.rows.findIndex(r => r.derived.recovery_chapters.length);
    const chapter = data.rows[i].derived.recovery_chapters[0];
    await root.locator('tbody tr').nth(i).locator('[data-kind="recovery"]').first().click();
    expect(new URL(page.url()).searchParams.get('doc')).toBe(`source/${chapter}.md`);
    await expect(page.locator('[data-view="reader"] .doc-head h1')).toContainText(`第${chapter.slice(1)}章`);
    expect(errors).toEqual([]);
  });
});
