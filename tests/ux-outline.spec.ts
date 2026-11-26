// Outline drafts, IME input, conflict recovery, local-save failure and interrupted dragging.
import { cardAction } from './outline-browser.ts';
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
  const edit = () => cardAction(root.locator(`.self-pane [data-card="${id}"]`), 'edit-card');
  await edit();
  const text = root.locator('[data-form="card"] [name="text"]');
  await text.fill('未提交的中文草稿'); await text.press('Escape');
  await expect(text).toHaveCount(0); await edit(); await expect(text).toHaveValue('未提交的中文草稿');
  await root.locator('.self-head [data-act="toggle-unplaced"]').click(); await expect(text).toHaveValue('未提交的中文草稿');
  await page.reload(); await expect(root.locator('.self-head')).toBeVisible(); await edit();
  await expect(text).toHaveValue('未提交的中文草稿');
  await root.locator('[data-act="cancel-edit"]').click(); await edit(); await expect(text).not.toHaveValue('未提交的中文草稿');
  await text.press('Escape'); await root.locator('.self-line.current .col-head [data-act="compose"][data-cat="combined"]').click();
  const draft = root.locator('[data-form="new"] [name="text"]');
  await draft.fill('新增还没写完'); await draft.press('Escape');
  await root.locator('.self-line.current .col-head [data-act="compose"][data-cat="combined"]').click(); await expect(draft).toHaveValue('新增还没写完');
  await root.locator('[data-act="cancel-compose"]').click();
  await root.locator('.self-line.current .col-head [data-act="compose"][data-cat="combined"]').click(); await expect(draft).toHaveValue('');
});


test('loading a cloud conflict retains the local workspace in undo', async ({ page }) => {
  const { root, stub } = await open(page), card = root.locator('.self-pane [data-card]').first(), id = await card.getAttribute('data-card');
  await cardAction(card, 'edit-card');
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
  await expect(root.locator('#sync-state')).toHaveText('保存失败 · 重试');
  await expect(root.locator('#status')).toContainText('当前改动尚未保存');
  await root.locator('#undo').click(); await expect(card).toHaveCount(1);
  await page.evaluate(() => { Storage.prototype.setItem = (window as any).setItem; });
  await root.locator('#sync-state').click(); await expect(root.locator('#sync-state')).toHaveText('✓ 已保存', { timeout: 10000 });
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


test('later saved edits invalidate old undo without losing history', async ({ page }) => {
  const { root, stub } = await open(page);
  const cards = root.locator('.self-pane [data-card]');
  const a = await cards.first().getAttribute('data-card'), b = await cards.nth(1).getAttribute('data-card');
  await root.locator(`[data-card="${a}"] .badge`).click();
  await expect(page.locator('.toast button')).toBeVisible();
  await cardAction(root.locator(`.self-pane [data-card=\"${b}\"]`), 'edit-card');
  await root.locator('[data-form="card"] [name="text"]').fill('后来保存的内容');
  await root.locator('[data-form="card"] [type="submit"]').click();
  await expect(page.locator('.toast button')).toHaveCount(0);
  await expect(root.locator('#sync-state')).toHaveText('✓ 已保存', { timeout: 10000 });
  const plot = JSON.parse(await unpack((stub.at(`${base}/live`) as any).plot));
  expect(plot.plot_units.find((u: any) => u.unit_id === b).content).toBe('后来保存的内容');
  expect(plot.plot_units.find((u: any) => u.unit_id === a).status).toBe('WRITTEN');
  await root.locator('#undo').click();
  await expect(root.locator(`[data-card="${b}"] .c-text`)).not.toHaveText('后来保存的内容');
  await root.locator('#undo').click();
  await expect(root.locator(`[data-card="${a}"]`)).toHaveCount(1);
  await root.locator(`[data-card="${a}"] .badge`).click();
});


test('deleting a card discards its draft before its ID is reused', async ({ page }) => {
  const { root, stub } = await open(page);
  const add = async (text: string) => {
    await root.locator('.self-line.current .col-head [data-act="compose"][data-cat="combined"]').click();
    await root.locator('[data-form="new"] [name="text"]').fill(text);
    await root.locator('[data-form="new"] [type="submit"]').click();
  };
  await add('旧卡');
  const card = root.locator('.self-pane [data-card]').filter({ hasText: '旧卡' });
  const id = await card.getAttribute('data-card');
  await cardAction(card, 'edit-card');
  await root.locator('[data-form="card"] [name="text"]').fill('旧卡未提交草稿');
  await root.locator('[data-form="card"] [name="details"]').fill('旧卡细节');
  await root.locator('[data-form="card"] [name="text"]').press('Escape');
  await card.locator('.card-menu summary').click();
  await card.locator('[data-act="delete-card"]').click();
  await add('新卡');
  await page.reload(); await expect(root.locator('.self-head')).toBeVisible();
  await cardAction(root.locator(`.self-pane [data-card=\"${id}\"]`), 'edit-card');
  await expect(root.locator('[data-form="card"] [name="text"]')).toHaveValue('新卡');
  await expect(root.locator('[data-form="card"] [name="details"]')).toHaveValue('');
  await root.locator('[data-form="card"] [type="submit"]').click();
  await expect(root.locator('#sync-state')).toHaveText('✓ 已保存', { timeout: 10000 });
  const plot = JSON.parse(await unpack((stub.at(`${base}/live`) as any).plot));
  expect(plot.plot_units.find((u: any) => u.unit_id === id)).toMatchObject({ content: '新卡', details: [] });
});
