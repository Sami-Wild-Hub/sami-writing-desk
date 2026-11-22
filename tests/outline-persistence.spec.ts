// Local drafts must survive navigation, updated private snapshots and storage failures.
import { expect, test, type Page } from '@playwright/test';
import { stubFirebase, watchErrors } from './stub.ts';
import { chooseBeat, editField, exportJSON, importJSON } from './outline-scenario.mjs';
import { outlineFixture } from './outline-fixture.mjs';

const draft = (page: Page) => page.evaluate(() => {
  const key = Object.keys(localStorage).find(k => k.startsWith('outline:'))!;
  return { key, raw: localStorage.getItem(key)! };
});

test('F39,48,49: reload preserves drafts and warns about repository updates without replacing them', async ({ page }) => {
  const errors = watchErrors(page), reads = await stubFirebase(page);
  await page.goto('book/?book=maritime-story&view=outline');
  const root = page.locator('[data-view="outline"]');
  await editField(page, root, '[data-edit-field="unit"][data-id="E001"]', 'My local fictional turn');
  await chooseBeat(page, root, 'A1-B2');
  await root.locator('#beat-note').fill('Local note');
  const saved = await draft(page);
  const changed = { ...outlineFixture(), revision: 'fiction-v2' };
  changed.plot_data.plot_units[0].content = 'A revised repository turn';
  reads.server('households/novel-stub-house/novelArchive/books/maritime-story/outline', JSON.stringify(changed));
  await page.reload();
  await expect(root.locator('.draft-notice')).toContainText('仓库预排已更新');
  await expect(root.locator('#active-beat')).toHaveText('ACT 1 / BEAT 2');
  await expect(root.locator('#beat-note')).toHaveValue('Local note');
  expect((await draft(page)).raw).toEqual(saved.raw);
  await chooseBeat(page, root, 'A1-B1');
  await expect(root.locator('[data-edit-field="unit"][data-id="E001"]')).toHaveText('My local fictional turn');
  await root.locator('#beat-note').fill('More local work');
  expect(JSON.parse((await draft(page)).raw).revision).toBe('fiction-v1');
  page.once('dialog', d => d.dismiss());
  await root.locator('#restore-starter').click();
  await expect(root.locator('.draft-notice')).toBeVisible();
  page.once('dialog', d => d.accept());
  await root.locator('#restore-starter').click();
  await expect(root.locator('.draft-notice')).toHaveCount(0);
  await expect(root.locator('[data-edit-field="unit"][data-id="E001"]')).toHaveText('A revised repository turn');
  await root.locator('#undo').click();
  await expect(root.locator('[data-edit-field="unit"][data-id="E001"]')).toHaveText('My local fictional turn');
  expect(errors).toEqual([]);
});

test('F40: failed autosave warns while complete export remains available', async ({ page }) => {
  await stubFirebase(page);
  await page.addInitScript(() => {
    const save = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (key.startsWith('outline:')) throw new DOMException('Storage full','QuotaExceededError');
      save.call(this, key, value);
    };
  });
  await page.goto('book/?book=maritime-story&view=outline');
  const root = page.locator('[data-view="outline"]');
  await root.locator('#beat-note').fill('Unsaved but exportable');
  await expect(root.locator('#autosave-warning')).toBeVisible();
  const out = await exportJSON(page, root, 'export-workspace');
  expect(out.plan.beat_notes['A1-B1']).toBe('Unsaved but exportable');
});

test('F43: failed imports preserve current content and undo history; same file can be selected again', async ({ page }) => {
  await stubFirebase(page);
  await page.goto('book/?book=maritime-story&view=outline');
  const root = page.locator('[data-view="outline"]');
  const before = await exportJSON(page, root, 'export-workspace');
  const bad = structuredClone(before); bad.plan.placements[0].unit_id = 'missing';
  for (const id of ['import-plan','import-data','import-workspace']) {
    await importJSON(root, id, id === 'import-plan' ? bad.plan : id === 'import-data' ? { plot_units:[] } : bad);
    await expect(root.locator('#status')).toHaveClass(/error/);
    expect(await exportJSON(page, root, 'export-workspace')).toEqual(before);
    await expect(root.locator('#undo')).toBeDisabled();
    await expect(root.locator(`#${id}`)).toHaveValue('');
  }
  await importJSON(root, 'import-workspace', before);
  await importJSON(root, 'import-workspace', before);
  await expect(root.locator('#status')).toContainText('已导入');
});

test('F48: unreadable draft remains downloadable and is not replaced during load', async ({ page }) => {
  await stubFirebase(page);
  await page.goto('book/?book=maritime-story&view=outline');
  await page.locator('#beat-note').fill('A note');
  const { key } = await draft(page);
  await page.evaluate(k => localStorage.setItem(k, '{invalid'), key);
  await page.reload();
  const root = page.locator('[data-view="outline"]');
  await expect(root.locator('.draft-notice')).toContainText('本地草稿未能读取');
  expect((await draft(page)).raw).toBe('{invalid');
  const ready = page.waitForEvent('download');
  await root.getByRole('button', { name:'导出原始草稿' }).click();
  const dl = await ready, stream = await dl.createReadStream();
  const chunks: Buffer[] = []; for await (const part of stream!) chunks.push(part);
  expect(JSON.parse(Buffer.concat(chunks).toString())).toBe('{invalid');
});

test('F49: sign-out removes private view DOM and another book cannot see its draft', async ({ page }) => {
  await page.setViewportSize({ width:1280, height:800 });
  await stubFirebase(page);
  await page.goto('book/?book=maritime-story&view=outline');
  await page.locator('#beat-note').fill('Only this book');
  await page.locator('.book[data-menu]').click();
  await page.locator('[data-book-slug="second-book"]').click();
  await expect(page.locator('[data-novel-view="outline"]')).toBeHidden();
  await page.locator('.book[data-menu]').click();
  await page.locator('[data-book-slug="maritime-story"]').click();
  await page.locator('[data-novel-view="outline"]').click();
  await expect(page.locator('#beat-note')).toHaveValue('Only this book');
  await page.locator('#novel-account').click();
  await page.locator('#novel-sign-out').click();
  await expect(page.locator('#novel-app')).toBeEmpty();
  await expect(page.locator('#novel-sign-in')).toBeVisible();
});
