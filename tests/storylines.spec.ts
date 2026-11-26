import { OUTLINE_ARCHIVED } from '../src/lib/views/outline/view-state.js';
// Canonical v7 outline controls exercised with actual mouse drags at the approved desktop size.
import { expect, test, type Page, type Locator } from '@playwright/test';
import { stubFirebase, watchErrors } from './stub.ts';
import { hasOutline, overallText } from './outline-fixture.mjs';
import { unpack } from '../src/lib/views/outline/codec.js';
test.skip(!hasOutline, 'private canonical data is not in public CI');
test.use({ viewport: { width: 1440, height: 900 } });
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
 const stream = await (await event).createReadStream(), chunks: Buffer[] = [];
 for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
 return JSON.parse(Buffer.concat(chunks).toString());
}
async function select(root: Locator, id: string) {
 await root.locator('[data-act="toggle-picker"]').click(); await root.locator(`[data-act="select-line"][data-id="${id}"]`).click();
}
async function drag(page: Page, source: Locator, target: Locator, before = false) {
 await source.scrollIntoViewIfNeeded();
 const grip = source.locator('[data-drag-handle]');
 const anchor = await grip.count() ? grip : source; // rank rows still drag from the whole row
 const a = (await anchor.boundingBox())!, x = a.x + a.width / 2, y = a.y + a.height / 2;
 await page.mouse.move(x,y); await page.mouse.down(); await page.mouse.move(x+7,y+2,{steps:3});
 await target.scrollIntoViewIfNeeded(); const b = (await target.boundingBox())!;
 const tx=b.x+b.width/2, ty=Math.max(160,Math.min(860,before ? b.y+3 : b.y+Math.min(b.height-4,60)));
 await page.mouse.move(tx,ty,{steps:25}); await page.mouse.up();
}
const card = (r: Locator, id: string) => r.locator(`.self-pane [data-card="${id}"]`);
// One reveal list per Beat across all storylines; the category argument is kept for readability only.
const cell = (r: Locator, beat: string, _cat?: string) => r.locator(`[data-zone="beat"][data-beat="${beat}"]`);
test('picker, aligned reference, three categories and both tabs', async ({ page }) => {
 const { root, errors } = await open(page);
 await expect(root.locator('.self-line.current .self-col')).toHaveCount(3); await expect(root.locator('.mark')).toHaveCount(0);
 await root.locator('[data-act="toggle-picker"]').click(); await expect(root.locator('.pick-line')).toHaveCount(26);
 await root.locator('[data-act="select-line"][data-id="G11"]').click(); await expect(root.locator('.picker-panel')).toBeHidden(); await select(root, 'G01');
 await expect(root.locator('.bgrid .badge.unplaced')).toHaveCount(0);
 const own = await root.locator('.ri.mine .ri-line').allTextContents(), title = await root.locator('.self-line.current h3').textContent();
 expect(own.every(t => t === title)).toBe(true); expect(await root.locator('.ri:not(.mine) .ri-line').allTextContents()).not.toContain(title);
 if (OUTLINE_ARCHIVED) {
   await expect(root.locator('[data-tab="outline"]')).toHaveCount(0);
   await expect(root.locator('.self-pane')).toBeVisible();
 } else {
 await root.locator('[data-act="tab"][data-tab="outline"]').click(); await expect(root.locator('.lane')).toHaveCount(3); await expect(root.locator('[data-filter-state]')).toHaveCount(3);
 }
 expect(errors).toEqual([]);
});
test('real drags: independent orders, inversions, category change, cross Beat and combined', async ({ page }) => {
 const { root, errors } = await open(page), initial = await workspace(page, root);
 const group = initial.plot_data.storyline_groups.find((g: any) => g.id === 'G01'), order = group.time_order.current;
 const beatOf = (id: string) => initial.plan.placements.find((p: any) => p.unit_id === id)?.beat_id;
 const i = order.findIndex((id: string, k: number) => k > 0 && beatOf(id) && beatOf(id) === beatOf(order[k-1])), [a,b] = [order[i-1], order[i]], beat = beatOf(a);
 await drag(page, card(root,b), card(root,a), true);
 let current = await workspace(page, root); expect(current.plot_data.storyline_groups.find((g: any) => g.id === 'G01').time_order.current[i-1]).toBe(b);
 expect(current.plan).toEqual(initial.plan); await root.locator('#undo').click();
 await drag(page, cell(root,beat,'current').locator(`[data-card="${b}"]`), cell(root,beat,'current').locator(`[data-card="${a}"]`), true);
 current = await workspace(page,root); const at = (w: any, id: string) => w.plan.placements.find((p: any) => p.unit_id === id).order;
 expect(at(current,b)).toBeLessThan(at(current,a)); expect(current.plot_data).toEqual(initial.plot_data);
 await drag(page, cell(root,beat,'current').locator(`[data-card="${a}"]`), cell(root,beat,'current').locator(`[data-card="${b}"]`), true); await expect(root.locator('.mark')).toHaveCount(0);
 await drag(page, card(root,a), cell(root,beat));
 current = await workspace(page,root); expect(current.plot_data.plot_units.find((u: any) => u.unit_id === a).category).toBe('current');
 const id = group.time_order.current.find((id: string) => !initial.plan.placements.some((p: any) => p.unit_id === id));
 await drag(page,card(root,id),cell(root,'A1-B1','current')); await expect(cell(root,'A1-B1','current').locator(`[data-card="${id}"]`)).toHaveCount(1); await expect(card(root,id)).toHaveCount(1);
 await drag(page,cell(root,'A1-B1','current').locator(`[data-card="${id}"]`),cell(root,'A2-B1','current')); await expect(cell(root,'A2-B1','current').locator(`[data-card="${id}"]`)).toHaveCount(1);
 await select(root,'G11'); const combined = initial.plot_data.storyline_groups.find((g: any) => g.id === 'G11').time_order.combined[0];
 await drag(page,card(root,combined),cell(root,'A1-B1','combined')); await expect(cell(root,'A1-B1','combined').locator(`[data-card="${combined}"]`)).toHaveCount(1);
 const beforeCancel = await workspace(page,root), source = card(root,combined); await source.scrollIntoViewIfNeeded(); const grip = (await source.locator('[data-drag-handle]').boundingBox())!;
 await page.mouse.move(grip.x + grip.width / 2,grip.y + grip.height / 2); await page.mouse.down(); await page.mouse.move(grip.x+50,grip.y+50); await page.keyboard.press('Escape'); await page.mouse.up();
 await expect(root.locator('.drag-ghost')).toHaveCount(0); expect(await workspace(page,root)).toEqual(beforeCancel); expect(errors).toEqual([]);
});
test('new card, edit, participants, real ranking drag, cloud refresh and undo', async ({ page }) => {
 const { root, reads, errors } = await open(page);
 await root.locator('[data-act="compose"][data-cat="combined"]').click();
 let form = root.locator('[data-form="new"]'); await expect(form.locator('[name="title"]')).toHaveCount(0); await form.locator('[name="text"]').fill('验证新增 保存往返'); await form.getByRole('button',{name:'添加',exact:true}).click();
 const added = (await workspace(page,root)).plot_data.plot_units.find((u:any)=>u.content==='验证新增 保存往返').unit_id;
 await card(root,added).getByRole('button',{name:'编辑',exact:true}).click(); form=root.locator('[data-form="card"]'); await form.locator('[name="text"]').fill('修改后的内容'); await form.getByRole('button',{name:'保存',exact:true}).click();
 await root.locator('.self-line.current [data-act="edit-line"]').click(); form=root.locator('[data-form="line"]'); await form.locator('[name="title"]').fill('更改标题'); await form.locator('[name="part"]').fill('手填参与者'); await form.getByRole('button',{name:'添加',exact:true}).click(); await root.locator('[data-form="line"]').getByRole('button',{name:'保存',exact:true}).click();
 await root.locator('[data-act="toggle-rank"]').click(); const ranking=root.locator('.rank-item'), second=await ranking.nth(1).getAttribute('data-id'); await drag(page,ranking.nth(1),ranking.nth(0),true); await root.locator('.rank-pop [data-act="toggle-rank"]').click(); await expect(root.locator('.self-line.current h3')).toContainText(`${second} ×`);
 await expect.poll(async()=>JSON.parse(await unpack((reads.at('households/novel-stub-house/outlineSync/maritime-story/live') as {plot:string}).plot)).participant_order[0]).toBe(second);
 await page.reload(); await expect(root.locator('.self-line.current h3')).toContainText('更改标题'); const saved=await workspace(page,root); expect(saved.plot_data.plot_units.find((u:any)=>u.unit_id===added).content).toBe('修改后的内容'); expect(saved.plot_data.participant_order[0]).toBe(second);
 await root.locator('[data-act="toggle-rank"]').click(); await drag(page,root.locator('.rank-item').nth(1),root.locator('.rank-item').nth(0),true); await root.locator('.rank-pop [data-act="toggle-rank"]').click(); await root.locator('#undo').click(); expect((await workspace(page,root)).plot_data.participant_order[0]).toBe(second); expect(errors).toEqual([]);
});

test('card text can be selected and copied without dragging; paste remains available in the editor', async ({ page }) => {
 const { root, errors } = await open(page);
 const item = root.locator('.self-pane .card[data-drag="card"]').first(), text = item.locator('.c-text');
 await expect(item.locator('[data-drag-handle]')).toBeVisible();
 await expect(text).toBeVisible();
 expect(await text.evaluate(el => getComputedStyle(el).userSelect)).toBe('text');
 await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
 const box = (await text.boundingBox())!;
 await page.mouse.move(box.x + 3, box.y + 10); await page.mouse.down();
 await page.mouse.move(box.x + Math.min(140, box.width - 3), box.y + 10, { steps: 12 }); await page.mouse.up();
 const selected = await page.evaluate(() => window.getSelection()?.toString() ?? '');
 expect(selected.length).toBeGreaterThan(0);
 await expect(root.locator('.drag-ghost')).toHaveCount(0);
 await page.keyboard.press('ControlOrMeta+c');
 expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(selected);
 await item.getByRole('button', { name: '编辑', exact: true }).click();
 const editor = root.locator('[data-form="card"] [name="text"]');
 await editor.fill(''); await editor.focus(); await page.keyboard.press('ControlOrMeta+v');
 await expect(editor).toHaveValue(selected);
 await root.locator('[data-form="card"] [data-act="cancel-edit"]').click();
 expect(errors).toEqual([]);
});
