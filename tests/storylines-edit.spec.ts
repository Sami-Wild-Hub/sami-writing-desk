// Card/storyline deletion with undo, both ways of moving a card to another line, wide drop areas and wrapped card text.
import { cardAction, cardMenu } from './outline-browser.ts';
import { expect, test, type Page, type Locator } from '@playwright/test';
import { stubFirebase, watchErrors } from './stub.ts';
import { hasOutline, outlineFixture, overallText } from './outline-fixture.mjs';
import { unpack } from '../src/lib/views/outline/codec.js';
test.skip(!hasOutline, 'private canonical data is not in public CI');
test.use({ viewport: { width: 1440, height: 900 } });
const live = 'households/novel-stub-house/outlineSync/maritime-story/live';
async function open(page: Page) {
  const reads = await stubFirebase(page, { canonical: true }), errors = watchErrors(page);
  await page.goto('book/?book=maritime-story&view=outline');
  const root = page.locator('[data-view="outline"]'); await expect(root.locator('#overall')).toHaveText(overallText());
  await root.locator('.self-head [data-act="toggle-unplaced"]').click(); // these specs work with every card shown
  return { root, reads, errors };
}
async function workspace(page: Page, root: Locator) {
  await root.locator('.file-recovery > summary').click();
  const event = page.waitForEvent('download'); await root.locator('#export-workspace').click();
  await root.locator('.file-recovery > summary').click();
  const chunks: Buffer[] = []; for await (const chunk of (await (await event).createReadStream())!) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString());
}
const savedPlot = async (reads: any) => JSON.parse(await unpack((reads.at(live) as { plot: string }).plot));
const card = (r: Locator, id: string) => r.locator(`.self-pane [data-card="${id}"]`);
const line = (w: any, id: string) => w.plot_data.storyline_groups.find((g: any) => g.id === id);
const unit = (w: any, id: string) => w.plot_data.plot_units.find((u: any) => u.unit_id === id);
async function grab(page: Page, source: Locator) {
  await source.scrollIntoViewIfNeeded(); const grip = source.locator('[data-drag-handle]'); const a = (await grip.boundingBox())!, x = a.x + a.width / 2, y = a.y + a.height / 2;
  await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + 7, y + 2, { steps: 3 });
}
async function dropAt(page: Page, target: Locator, dy: (b: { y: number; height: number }) => number) {
  const b = (await target.boundingBox())!; await page.mouse.move(b.x + b.width / 2, Math.max(170, Math.min(850, dy(b))), { steps: 20 }); await page.mouse.up();
}

test('delete a card and a storyline, undo both, and the deletions survive a refresh', async ({ page }) => {
  const { root, reads, errors } = await open(page), initial = await workspace(page, root);
  const id = line(initial, 'G01').time_order.current[0];
  await cardAction(card(root, id), 'delete-card'); await expect(card(root, id)).toHaveCount(0);
  await root.locator('#undo').click(); await expect(card(root, id)).toHaveCount(1);
  await cardAction(card(root, id), 'delete-card'); await expect(card(root, id)).toHaveCount(0);

  await root.locator('[data-act="toggle-picker"]').click(); await root.locator('.pick-line[data-id="G11"]').click();
  await root.locator('.self-line.current [data-act="edit-line"]').click();
  await root.getByRole('button', { name: '删除故事线', exact: true }).click(); await expect(page.locator('.toast')).toContainText('撤销');
  await root.locator('[data-act="toggle-picker"]').click(); await expect(root.locator('.pick-line')).toHaveCount(outlineFixture()!.plot_data.storyline_groups.length - 1);
  await root.locator('#undo').click(); await expect(root.locator('.pick-line')).toHaveCount(outlineFixture()!.plot_data.storyline_groups.length);
  await root.locator('.pick-line[data-id="G11"]').click(); await root.locator('.self-line.current [data-act="edit-line"]').click();
  await root.getByRole('button', { name: '删除故事线', exact: true }).click();
  await expect.poll(async () => { const p = await savedPlot(reads); return [Boolean(unit({ plot_data: p }, id)), Boolean(line({ plot_data: p }, 'G11'))]; }).toEqual([false, false]);
  await page.reload(); await expect(root.locator('.self-line.current h3')).toBeVisible();
  const after = await workspace(page, root); expect(unit(after, id)).toBeUndefined(); expect(line(after, 'G11')).toBeUndefined();
  expect(after.plot_data.storyline_groups).toHaveLength(outlineFixture()!.plot_data.storyline_groups.length - 1); expect(errors).toEqual([]);
});

test('move cards by dropdown and by dragging onto the picker; drop into blank column and Beat space; text wraps', async ({ page }) => {
  const { root, reads, errors } = await open(page), initial = await workspace(page, root), g01 = line(initial, 'G01');
  const [x, y] = g01.time_order.current.filter((id: string) => !initial.plan.placements.some((p: any) => p.unit_id === id));
  await cardMenu(card(root, x)); await card(root, x).locator('[data-change="move-line"]').selectOption('G03'); await expect(card(root, x)).toHaveCount(0);
  let w = await workspace(page, root); expect(unit(w, x).storyline_group_id).toBe('G03'); expect(line(w, 'G03').time_order.current.at(-1)).toBe(x);

  await grab(page, card(root, y)); const strip = (await root.locator('.picker-strip').boundingBox())!;
  await page.mouse.move(strip.x + strip.width / 2, strip.y + 200, { steps: 15 }); await expect(root.locator('.picker-panel')).toBeVisible();
  await dropAt(page, root.locator('.pick-line[data-id="G03"]'), b => b.y + b.height / 2);
  await expect(root.locator('.picker-panel')).toBeHidden(); await expect(card(root, y)).toHaveCount(0);
  w = await workspace(page, root); expect(unit(w, y).storyline_group_id).toBe('G03'); expect(line(w, 'G03').time_order.current.at(-1)).toBe(y);

  const past = g01.time_order.past[0];
  await grab(page, card(root, past)); await dropAt(page, root.locator('.self-line.current .self-col.combined .col-body'), b => b.y + b.height - 30);
  w = await workspace(page, root); expect(unit(w, past).category).toBe('combined'); expect(line(w, 'G01').time_order.combined.at(-1)).toBe(past);
  await root.locator('#undo').click();

  const free = g01.time_order.current.find((id: string) => id !== x && id !== y && !initial.plan.placements.some((p: any) => p.unit_id === id));
  const other = root.locator('[data-zone="beat"][data-beat="A2-B1"]');
  await grab(page, card(root, free)); await other.scrollIntoViewIfNeeded(); await dropAt(page, other, b => b.y + b.height / 2);
  await expect(root.locator(`[data-beat="A2-B1"] [data-card="${free}"]`)).toHaveCount(1);

  const long = '长内容换行验证，'.repeat(40) + '结尾不被截断';
  await cardAction(card(root, free), 'edit-card'); const form = root.locator('[data-form="card"]');
  await expect(form.locator('[name="title"]')).toHaveCount(0); await form.locator('[name="text"]').fill(long); await form.getByRole('button', { name: '保存', exact: true }).click();
  for (const text of [card(root, free).locator('.c-text'), root.locator(`.bg-list [data-card="${free}"] .mini-text`)]) {
    await expect(text).toHaveText(long);
    expect(await text.evaluate(el => el.scrollWidth <= el.clientWidth && el.scrollHeight <= el.clientHeight + 1 && el.clientHeight > 60)).toBe(true);
  }
  const badges = root.locator('[data-workbench] .badge');
  await expect(badges).toHaveText(Array(await badges.count()).fill(/^(已写|已排|未排)$/));
  await expect(root.locator('.self-line.current .self-col.combined .era')).toHaveText('Combined');
  await expect(root.locator(`.bg-list [data-card="${free}"]`)).toBeVisible();
  await root.locator('[data-act="toggle-picker"]').click();
  await expect(root.locator('.pick-line[data-id="G03"] small')).toHaveText(/^\d+\|\d+\|\d+$/);
  const panel = (await root.locator('.picker-panel').boundingBox())!, self = (await root.locator('.self-pane').boundingBox())!;
  expect(panel.x + panel.width).toBeLessThanOrEqual(self.x + 1);
  await root.locator('[data-act="toggle-picker"]').click();

  await expect.poll(async () => (await savedPlot(reads)).plot_units.find((u: any) => u.unit_id === free).content).toBe(long);
  await page.reload(); await expect(root.locator('.self-line.current h3')).toBeVisible(); w = await workspace(page, root);
  expect([unit(w, x).storyline_group_id, unit(w, y).storyline_group_id, unit(w, free).content, unit(w, free).element_title || '']).toEqual(['G03', 'G03', long, '']);
  expect(w.plan.placements.find((p: any) => p.unit_id === free).beat_id).toBe('A2-B1'); expect(errors).toEqual([]);
});


test('placed cards edit in the left pane and return to the original storyline without deletion', async ({ page }) => {
  const { root, errors } = await open(page), initial = await workspace(page, root);
  const p = initial.plan.placements.find((p: any) => unit(initial, p.unit_id).status !== 'WRITTEN' && unit(initial, p.unit_id).storyline_group_id !== 'G01');
  const id = p.unit_id, original = unit(initial, id), left = root.locator(`.beats-pane [data-card="${id}"]`);
  await left.getByRole('button', { name: '编辑卡片' }).click();
  const editor = root.locator('.beats-pane [data-form="card"]');
  await expect(editor).toHaveCount(1);
  await expect(root.locator('.self-pane [data-form="card"]')).toHaveCount(0);
  await editor.locator('[name="text"]').fill('左侧修改后的卡片');
  await editor.locator('[name="details"]').fill('保留细节');
  await editor.getByRole('button', { name: '保存', exact: true }).click();
  await expect(left.locator('.mini-text')).toHaveText('左侧修改后的卡片');
  await left.getByRole('button', { name: '移出大纲，退回故事线' }).click();
  await expect(left).toHaveCount(0);
  await expect(card(root, id).locator('.c-text')).toHaveText('左侧修改后的卡片');
  let w = await workspace(page, root);
  expect(w.plan.placements.some((q: any) => q.unit_id === id)).toBe(false);
  expect(unit(w, id).storyline_group_id).toBe(original.storyline_group_id);
  expect(line(w, original.storyline_group_id).time_order[original.category]).toEqual(line(initial, original.storyline_group_id).time_order[original.category]);
  expect(unit(w, id).details).toEqual(['保留细节']);
  await root.locator('#undo').click();
  await expect(left).toHaveCount(1);
  await expect(root.locator('[data-tab="outline"]')).toHaveCount(0);
  expect(errors).toEqual([]);
});


test('group planned cards by main character, start expanded, and preserve reveal order', async ({ page }) => {
  const { root, errors } = await open(page), initial = await workspace(page, root);
  const toggle = root.locator('[data-act="toggle-planned-group"]').first();
  const part = await toggle.getAttribute('data-act-no');
  const button = root.locator(`[data-act="toggle-planned-group"][data-act-no="${part}"]`);
  const beats = initial.plot_data.beats.filter((b: any) => String(b.act) === part);
  await button.click();
  await expect(button).toHaveAttribute('aria-pressed', 'true');
  for (const beat of beats) {
    const ids = initial.plan.placements.filter((p: any) => p.beat_id === beat.beat_id && unit(initial, p.unit_id).status !== 'WRITTEN').map((p: any) => p.unit_id);
    if (!ids.length) continue;
    const group = root.locator(`.bg-planned[data-beat="${beat.beat_id}"]`);
    const names = [...new Set(ids.map((id: string) => {
      const participants = line(initial, unit(initial, id).storyline_group_id).participants;
      return initial.plot_data.participant_order.find((name: string) => participants.includes(name));
    }))];
    await expect(group.locator('.planned-pillar')).toHaveCount(names.length);
    for (const name of names) {
      const expected = ids.filter((id: string) => {
        const participants = line(initial, unit(initial, id).storyline_group_id).participants;
        return initial.plot_data.participant_order.find((n: string) => participants.includes(n)) === name;
      });
      const matching = group.locator(`[data-pillar="${name}"]`);
      await expect(matching).toBeVisible();
      expect(await matching.locator('[data-card]').evaluateAll(els => els.map(el => el.getAttribute('data-card')))).toEqual(expected);
    }
  }
  const head = root.locator('.planned-pillar-head').first();
  await expect(head).toHaveAttribute('aria-expanded', 'true');
  await head.click(); await expect(head).toHaveAttribute('aria-expanded', 'false');
  await head.click(); await expect(head).toHaveAttribute('aria-expanded', 'true');
  expect(await workspace(page, root)).toEqual(initial);
  await button.click();
  await expect(root.locator('.bg-planned')).toHaveCount(0);
  expect(await workspace(page, root)).toEqual(initial);
  expect(errors).toEqual([]);
});
