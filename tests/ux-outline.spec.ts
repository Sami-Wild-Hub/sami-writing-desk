// Outline drafts, IME input, conflict recovery, local-save failure and interrupted dragging.
import { expect, test, type Page } from '@playwright/test';
import { stubFirebase } from './stub.ts';
import { hasOutline, outlineFixture } from './outline-fixture.mjs';
import { pack, unpack } from '../src/lib/views/outline/codec.js';
test.skip(!hasOutline, 'canonical outline is supplied at runtime');
test.use({ viewport: { width: 1440, height: 900 } });
const base = 'households/novel-stub-house/outlineSync/maritime-story';
async function open(page: Page) {
  const stub = await stubFirebase(page);
  await page.goto('book/?book=maritime-story&view=outline');
  const root = page.locator('[data-view="outline"]');
  await expect(root.locator('.self-head')).toBeVisible();
  return { stub, root };
}

test('Esc and redraws keep unsubmitted card and new-card drafts, while cancel discards', async ({ page }) => {
  const { root } = await open(page), card = root.locator('.self-pane [data-card]').first();
  const id = await card.getAttribute('data-card');
  const edit = () => root.locator(`.self-pane [data-card="${id}"] [data-act="edit-card"]`).click();
  await edit();
  const text = root.locator('[data-form="card"] [name="text"]');
  await text.fill('未提交的中文草稿'); await text.press('Escape');
  await expect(text).toHaveCount(0); await edit(); await expect(text).toHaveValue('未提交的中文草稿');
  await root.locator('.self-head [data-act="toggle-unplaced"]').click(); await expect(text).toHaveValue('未提交的中文草稿');
  await page.reload(); await expect(root.locator('.self-head')).toBeVisible(); await edit();
  await expect(text).toHaveValue('未提交的中文草稿');
  await root.locator('[data-act="cancel-edit"]').click(); await edit(); await expect(text).not.toHaveValue('未提交的中文草稿');
  await text.press('Escape'); await root.locator('[data-act="compose"][data-cat="combined"]').click();
  const draft = root.locator('[data-form="new"] [name="text"]');
  await draft.fill('新增还没写完'); await draft.press('Escape');
  await root.locator('[data-act="compose"][data-cat="combined"]').click(); await expect(draft).toHaveValue('新增还没写完');
  await root.locator('[data-act="cancel-compose"]').click();
  await root.locator('[data-act="compose"][data-cat="combined"]').click(); await expect(draft).toHaveValue('');
});

test('library input survives search and background redraws without interrupting composition', async ({ page }) => {
  const { root, stub } = await open(page);
  await root.locator('[data-tab="outline"]').click();
  const input = root.locator('[data-input="search"]');
  await input.evaluate(el => { (window as any).searchNode = el; });
  await input.dispatchEvent('compositionstart'); await input.fill('中文');
  await input.dispatchEvent('keydown', { key: 'Enter', isComposing: true });
  await root.locator('[data-filter-state="placed"]').click();
  stub.server(`${base}/_coordinator`, { at: Date.now() });
  await page.waitForTimeout(180);
  expect(await input.evaluate(el => el === (window as any).searchNode)).toBe(true);
  await input.dispatchEvent('compositionend'); await page.waitForTimeout(180);
  expect(await input.evaluate(el => el === (window as any).searchNode)).toBe(true);
  await input.fill('不存在的搜索词'); await expect(root.locator('.lib-body')).toContainText('没有匹配的卡');
  expect(await input.evaluate(el => el === (window as any).searchNode)).toBe(true);
});

test('loading a cloud conflict retains the local workspace in undo', async ({ page }) => {
  const { root, stub } = await open(page), card = root.locator('.self-pane [data-card]').first(), id = await card.getAttribute('data-card');
  await card.locator('[data-act="edit-card"]').click();
  await root.locator('[data-form="card"] [name="text"]').fill('本机已提交版本');
  await root.locator('[data-form="card"] [type="submit"]').click();
  const remote = structuredClone(outlineFixture()!.plot_data);
  remote.plot_units.find((u: any) => u.unit_id === id).content = '云端替换版本';
  const live = stub.at(`${base}/live`) as any;
  stub.server(`${base}/live`, { ...live, rev: 'remote-ux-version', plot: await pack(JSON.stringify(remote)) });
  await expect(root.locator('.draft-notice button')).toHaveCount(1);
  await root.getByRole('button', { name: '载入云端版', exact: true }).click();
  await expect(root.locator(`.self-pane [data-card="${id}"] .c-text`)).toHaveText('云端替换版本');
  await root.locator('#undo').click();
  await expect(root.locator(`.self-pane [data-card="${id}"] .c-text`)).toHaveText('本机已提交版本');
});

test('written filtering can be undone and local-save failure replaces the old saved status', async ({ page }) => {
  const { root, stub } = await open(page), card = root.locator('.self-pane [data-card]').first(), id = await card.getAttribute('data-card');
  await page.evaluate(() => {
    const original = Storage.prototype.setItem; (window as any).setItem = original;
    Storage.prototype.setItem = function(key, value) { if (key.startsWith('outline:') && !key.endsWith(':view') && !key.endsWith(':editors')) throw new Error('quota'); original.call(this, key, value); };
  });
  await card.locator('.badge').click(); await expect(root.locator(`.self-pane [data-card="${id}"]`)).toHaveCount(0);
  await expect(root.locator('#sync-state')).toHaveText('保存失败可重试');
  await expect(root.locator('#status')).toContainText('当前改动尚未保存');
  await root.locator('#undo').click(); await expect(card).toHaveCount(1);
  await page.evaluate(() => { Storage.prototype.setItem = (window as any).setItem; });
  await root.locator('#sync-state').click(); await expect(root.locator('#sync-state')).toHaveText('已保存', { timeout: 10000 });
  const plot = JSON.parse(await unpack((stub.at(`${base}/live`) as any).plot));
  expect(plot.plot_units.find((u: any) => u.unit_id === id).status).not.toBe('WRITTEN');
});

test('pointer cancel and lost capture clean up a drag without committing', async ({ page }) => {
  const { root, stub } = await open(page), before = JSON.stringify(stub.at(`${base}/live`));
  const grip = root.locator('.self-pane [data-drag-handle]').first();
  for (const kind of ['pointercancel', 'lostpointercapture']) {
    await grip.scrollIntoViewIfNeeded(); const r = (await grip.boundingBox())!;
    await grip.evaluate(el => el.addEventListener('pointerdown', e => { (window as any).dragPointer = (e as PointerEvent).pointerId; }, { once: true }));
    await page.mouse.move(r.x + 3, r.y + 3); await page.mouse.down(); await page.mouse.move(r.x + 30, r.y + 30);
    await expect(root.locator('.drag-ghost')).toHaveCount(1);
    await page.evaluate(kind => {
      const event = new PointerEvent(kind, { bubbles: true, pointerId: (window as any).dragPointer });
      (kind === 'pointercancel' ? window : document.querySelector('.outline-view')!).dispatchEvent(event);
    }, kind);
    await expect(root.locator('.drag-ghost, .drop-mark, .drop-on')).toHaveCount(0); await page.mouse.up();
  }
  expect(JSON.stringify(stub.at(`${base}/live`))).toBe(before);
});

test('phone outline has no horizontal overflow, a Beat selector and a working move menu', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { root } = await open(page);
  await expect(page.locator('#novel-bar [data-drawer]')).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await root.locator('[data-tab="outline"]').click();
  await expect(root.locator('.mobile-beat select')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await root.locator('[data-tab="story"]').click();
  const card = root.locator('.self-pane [data-card]').first(), id = await card.getAttribute('data-card');
  const beat = outlineFixture()!.plot_data.beats.at(-1).beat_id;
  await card.locator('[data-change="move-beat"]').selectOption(beat);
  await expect(root.locator(`.self-pane [data-card="${id}"]`)).toHaveCount(0);
  await root.locator('#undo').click(); await expect(root.locator(`.self-pane [data-card="${id}"]`)).toHaveCount(1);
});
