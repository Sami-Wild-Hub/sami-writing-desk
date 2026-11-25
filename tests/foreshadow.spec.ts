// Browser edits, shared-revision conflicts and optional private design screenshots.
import { expect, test } from '@playwright/test';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { env, stubFirebase, watchErrors } from './stub.ts';
import { foreshadowFixture } from './foreshadow-fixture.mjs';
import { cell, path, savedRows, setup, typeCell } from './foreshadow-browser.ts';
import { pack } from '../src/lib/views/outline/codec.js';
import { OPEN } from '../src/lib/views/foreshadow/model.js';
import type { ForeshadowData } from '../src/lib/views/foreshadow/schema.ts';

test('signed-out access reads no private data, and an absent table shows its empty state', async ({ page }) => {
  const db = await stubFirebase(page, { signedIn: false });
  await page.goto('book/?book=maritime-story&view=foreshadow');
  await expect(page.locator('#novel-sign-in')).toBeVisible();
  expect(db.filter(p => p.includes('outlineSync') || p.includes('novelArchive'))).toEqual([]);
});

test('optional absence, column order, line breaks, filters and links on the quote and recovery text', async ({ page }) => {
  const { root, db } = await setup(page);
  expect(await root.locator('th').allTextContents()).toEqual(['伏笔ID', '埋设章节', '伏笔／线索内容', '是否已收', '实际回收章节', '回收场景／位置', '备注']);
  await expect(cell(root, 1, '埋设章节')).toHaveValue('2');
  await expect(root.getByRole('button', { name: '编辑', exact: true })).toHaveCount(0);
  await expect(root.getByRole('button', { name: '删除', exact: true })).toHaveCount(0);
  await expect(root.locator('tbody tr').first().locator('td.fsh-content .fsh-view')).toHaveText('A clue\nSecond line');
  await expect(root.locator('tbody tr').nth(1).locator('script')).toHaveCount(0);
  await root.getByLabel('按是否已收筛选').selectOption('部分回收');
  await expect(root.locator('tbody tr')).toHaveCount(1);
  await expect(root.getByLabel('按埋设章节筛选').locator('option')).toHaveText(['全部', '1', '2']);
  await root.getByLabel('按埋设章节筛选').selectOption('C2');
  await expect(root.locator('tbody tr')).toHaveCount(0);
  await root.getByLabel('按是否已收筛选').selectOption('');
  await expect(root.locator('tbody tr')).toHaveCount(1);
  // The quote itself is the link to where it was planted.
  await root.locator('td.fsh-content a.fsh-quote').click();
  await expect(page.locator('[data-view="reader"] #p5')).toHaveClass(/flash/);
  await page.goBack();
  await root.getByLabel('按埋设章节筛选').selectOption('');
  await root.locator('[data-kind="recovery"]').click();
  await expect(page.locator('[data-view="reader"] .doc-head h1')).toContainText('第2章');
  await page.goBack();
  db.server(`${path}/live/foreshadow`, null);
  await expect(root).toContainText('伏笔表尚未同步');
});

test('cells edit in place, keyboard moves like a spreadsheet, rows and statuses come from shortcuts', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const { root, db } = await setup(page);
  const original = db.at(`${path}/live`) as { plot: string; plan: string };
  // Clicking a linked cell beside its link edits it; Alt+Enter is a line break, Enter saves and goes down.
  const quote = root.locator('tbody tr').first().locator('td.fsh-content');
  await quote.click({ position: { x: 4, y: 4 } });
  await expect(cell(root, 0, '伏笔／线索内容')).toBeFocused();
  await page.keyboard.press('ControlOrMeta+a'); await page.keyboard.type('Changed');
  await page.keyboard.press('Alt+Enter'); await page.keyboard.type('Second line');
  await page.keyboard.press('Enter');
  await expect(cell(root, 1, '伏笔／线索内容')).toBeFocused();
  await expect.poll(async () => (await savedRows(db))[0].author['伏笔／线索内容']).toBe('Changed\nSecond line');
  await typeCell(root, 0, '埋设章节', 'C2');
  await typeCell(root, 0, '实际回收章节', 'C3，C4');
  await expect.poll(async () => (await savedRows(db))[0].derived).toEqual({ recovery_chapters: ['C3', 'C4'] });
  expect((await savedRows(db))[0].author['埋设章节']).toBe('C2');
  await expect(root.locator('tbody tr').first().locator('a.fsh-quote')).toHaveAttribute('data-doc-path', 'source/C2.md');
  expect(db.at(`${path}/live/plot`)).toBe(original.plot); expect(db.at(`${path}/live/plan`)).toBe(original.plan);
  await page.reload(); await expect(root.locator('tbody tr').first()).toContainText('Changed\nSecond line');
  // Ctrl/⌘+Enter adds a row right below the current one and starts in its 埋设章节.
  await cell(root, 0, '备注').focus();
  await page.keyboard.press('ControlOrMeta+Enter');
  await expect(root.locator('tbody tr')).toHaveCount(3);
  await expect(cell(root, 1, '埋设章节')).toBeFocused();
  await page.keyboard.type('C2P5-6'); await page.keyboard.press('Tab');
  await expect.poll(async () => (await savedRows(db)).map(r => r.author['埋设章节'])).toEqual(['C2', 'C2P5-6', 'C2P5-6']);
  // Arrow keys leave a cell at its edges; Alt+digit sets the row's status; 不需要 archives it out of the default view.
  await cell(root, 1, '备注').focus();
  await page.keyboard.press('ArrowUp');
  await expect(cell(root, 0, '备注')).toBeFocused();
  await page.keyboard.press('Alt+0');
  await expect(cell(root, 0, '是否已收')).toHaveValue('');
  await page.keyboard.press('ArrowDown');
  await expect(cell(root, 1, '备注')).toBeFocused();
  await page.keyboard.press('Alt+3');
  await expect(root.locator('tbody tr')).toHaveCount(2);
  await expect(cell(root, 1, '备注')).toBeFocused();
  await expect.poll(async () => (await savedRows(db)).map(r => r.author['是否已收'])).toEqual(['', '不需要', '']);
  expect((await savedRows(db)).length).toBe(3);
  // The status cell takes plain digits too.
  await cell(root, 1, '是否已收').focus();
  await page.keyboard.press('1');
  await expect(root.locator('tbody tr')).toHaveCount(1);
  await root.getByLabel('按是否已收筛选').selectOption('不需要');
  await expect(root.locator('tbody tr')).toHaveCount(1);
  await root.getByLabel('按是否已收筛选').selectOption(OPEN);
  // Esc puts back the cell's saved text.
  await cell(root, 0, '备注').fill('typo');
  await page.keyboard.press('Escape');
  await expect(cell(root, 0, '备注')).toHaveValue('');
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
});

test('cloud conflict keeps local draft until an explicit choice; repository resolution includes foreshadow', async ({ page }) => {
  const { root, db } = await setup(page);
  await typeCell(root, 0, '备注', 'Local');
  const remote = foreshadowFixture(); remote.rows[0].author['备注'] = 'Remote';
  db.server(`${path}/live`, { ...(db.at(`${path}/live`) as object), rev: 'other0000001', foreshadow: await pack(remote) });
  await expect(root.locator('.fsh-notice')).toContainText('云端已有新版本');
  await page.reload(); await expect(root.locator('.fsh-notice')).toContainText('云端已有新版本');
  await root.getByRole('button', { name: '用本机版覆盖' }).click();
  await expect.poll(async () => (await savedRows(db))[0].author['备注']).toBe('Local');
  const live = db.at(`${path}/live`) as { plot: string; plan: string };
  db.server(`${path}/incoming`, { tree: 'incoming-tree', commit: 'incoming-commit', ...live, foreshadow: await pack(remote) });
  await root.getByRole('button', { name: '用仓库版', exact: true }).click();
  await expect.poll(async () => (await savedRows(db))[0].author['备注']).toBe('Remote');
  expect(db.at(`${path}/live/over`)).toBe('incoming-tree');
  expect(db.at(`${path}/kept/foreshadow`)).toBeTruthy();
});

test('a remote change while typing keeps the focus and unsaved text, and saves to the right row', async ({ page }) => {
  const { root, db } = await setup(page);
  const note = cell(root, 1, '备注');
  await note.focus(); await page.keyboard.type('Editing row two');
  const remote = foreshadowFixture(); remote.rows.shift();
  db.server(`${path}/live`, { ...(db.at(`${path}/live`) as object), rev: 'other0000001', foreshadow: await pack(remote) });
  await expect(root.locator('tbody tr')).toHaveCount(1);
  await expect(cell(root, 0, '备注')).toBeFocused();
  await expect(cell(root, 0, '备注')).toHaveValue('Editing row two');
  await page.keyboard.press('Tab');
  await expect.poll(async () => (await savedRows(db))[0].author['备注']).toBe('Editing row two');
});

test('已收 is hidden until the remembered filter changes; phone cards edit, add and archive', async ({ page }) => {
  const data = foreshadowFixture(); data.rows[1].author['是否已收'] = '已收';
  await page.setViewportSize({ width: 390, height: 844 });
  const { db, root } = await setup(page, data);
  const status = root.getByLabel('按是否已收筛选');
  await expect(root.locator('tbody tr')).toHaveCount(1);
  await expect(status).toHaveValue('!已收');
  const card = root.locator('tbody tr').first();
  await expect(root.locator('thead')).toBeHidden();
  await expect(card.locator('td.fsh-id')).toHaveCSS('font-size', '12px');
  await expect(card.locator('td.fsh-empty [data-col]').first()).toBeVisible();
  await card.locator('a.fsh-quote').click();
  await expect(page.locator('[data-view="reader"] #p2')).toHaveClass(/flash/);
  await page.goBack();
  await status.selectOption('');
  await page.reload();
  await expect(root.locator('tbody tr')).toHaveCount(2);
  await expect(status).toHaveValue('');
  await typeCell(root, 1, '埋设章节', 'C2P5-6，C3');
  await expect(root.locator('tbody tr').last().locator('a.fsh-quote')).toHaveAttribute('data-doc-hash', '#p5');
  await root.getByRole('button', { name: /加行/ }).click();
  await expect(root.locator('tbody tr')).toHaveCount(3);
  await cell(root, 2, '是否已收').selectOption('不需要');
  await expect.poll(async () => (await savedRows(db)).map(r => [r.author['埋设章节'], r.author['是否已收']]))
    .toEqual([['C1P2', '部分回收'], ['C2P5-6，C3', '已收'], ['', '不需要']]);
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
    const root = page.locator('[data-view="foreshadow"]'), visible = data.rows.filter(r => !['已收', '不需要'].includes(r.author['是否已收']));
    await expect(root.locator('tbody tr')).toHaveCount(visible.length);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
    const shot = (name: string) => page.screenshot({ path: resolve(env.FORESHADOW_SHOTS_DIR!, `${name}.png`) });
    await mkdir(env.FORESHADOW_SHOTS_DIR!, { recursive: true });
    await shot(width === 390 ? 'phone' : 'desktop');
    if (width !== 390) {
      await root.locator('tbody tr').nth(1).locator('[data-col="备注"]').focus();
      await shot('desktop-editing');
      await root.locator('tbody tr').nth(1).locator('[data-col="备注"]').blur();
    }
    for (const i of [0, 1]) {
      const match = /^C(\d+)P(\d+)/.exec(visible[i].author['埋设章节'])!;
      await root.locator('tbody tr').nth(i).locator('[data-kind="planting"]').first().click();
      await expect(page.locator(`[data-view="reader"] #p${match[2]}`)).toHaveClass(/flash/);
      expect(new URL(page.url()).searchParams.get('doc')).toBe(`source/C${match[1]}.md`);
      const quote = visible[i].author['伏笔／线索内容'].split('\n')[0];
      await expect(page.locator(`[data-view="reader"] #p${match[2]}`)).toContainText(quote);
      await page.goBack();
    }
    if (width === 390) {
      const card = root.locator('tbody tr').nth(1);
      await card.scrollIntoViewIfNeeded();
      const y = await page.evaluate(() => scrollY);
      await card.locator('[data-col="备注"]').focus();
      await shot('phone-edit');
      await card.locator('[data-col="备注"]').blur();
      expect(await page.evaluate(() => scrollY)).toBe(y);
    }
    await root.getByLabel('按是否已收筛选').selectOption('');
    const i = data.rows.findIndex(r => r.derived.recovery_chapters.length);
    const chapter = data.rows[i].derived.recovery_chapters[0];
    await root.locator('tbody tr').nth(i).locator('[data-kind="recovery"]').first().click();
    expect(new URL(page.url()).searchParams.get('doc')).toBe(`source/${chapter}.md`);
    await expect(page.locator('[data-view="reader"] .doc-head h1')).toContainText(`第${chapter.slice(1)}章`);
    expect(errors).toEqual([]);
  });
});
