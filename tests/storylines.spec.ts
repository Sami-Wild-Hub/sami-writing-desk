// Canonical v6 outline controls exercised with actual mouse drags at the approved desktop size.
import { expect, test, type Page, type Locator } from '@playwright/test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stubFirebase, watchErrors } from './stub.ts';
import { hasOutline } from './outline-fixture.mjs';
import { unpack } from '../src/lib/views/outline/codec.js';
test.skip(!hasOutline, 'private canonical data is not in public CI');
test.use({ viewport: { width: 1440, height: 900 } });
async function open(page: Page) {
 const reads = await stubFirebase(page, { canonical: true }), errors = watchErrors(page);
 await page.goto('book/?book=maritime-story&view=outline');
 const root = page.locator('[data-view="outline"]'); await expect(root.locator('#overall')).toHaveText('108 张 · 36 已排');
 return { root, reads, errors };
}
async function workspace(page: Page, root: Locator) {
 const event = page.waitForEvent('download'); await root.locator('#export-workspace').click();
 const stream = await (await event).createReadStream(), chunks: Buffer[] = [];
 for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
 return JSON.parse(Buffer.concat(chunks).toString());
}
async function select(root: Locator, id: string) {
 await root.locator('[data-act="toggle-picker"]').click(); await root.locator(`[data-act="select-line"][data-id="${id}"]`).click();
}
async function drag(page: Page, source: Locator, target: Locator, before = false) {
 await source.scrollIntoViewIfNeeded();
 const a = (await source.boundingBox())!, x = a.x + a.width / 2, y = a.y + Math.min(30, a.height / 2);
 await page.mouse.move(x,y); await page.mouse.down(); await page.mouse.move(x+7,y+2,{steps:3});
 await target.scrollIntoViewIfNeeded(); const b = (await target.boundingBox())!;
 const tx=b.x+b.width/2, ty=Math.max(160,Math.min(860,before ? b.y+3 : b.y+Math.min(b.height-4,60)));
 await page.mouse.move(tx,ty,{steps:25}); await page.mouse.up();
}
const card = (r: Locator, id: string) => r.locator(`.self-pane [data-card="${id}"]`);
const cell = (r: Locator, beat: string, cat: string) => r.locator(`[data-zone="beat"][data-beat="${beat}"][data-cat="${cat}"]`);
test('picker, aligned reference, three categories and both tabs', async ({ page }) => {
 const { root, errors } = await open(page);
 await expect(root.locator('.self-col')).toHaveCount(3); await expect(root.locator('.mark')).toHaveCount(0);
 await root.locator('[data-act="toggle-picker"]').click(); await expect(root.locator('.pick-line')).toHaveCount(32);
 await root.locator('[data-act="select-line"][data-id="G21"]').click(); await expect(root.locator('.picker-panel')).toHaveCount(0); await select(root, 'G01');
 const rows = await root.locator('.bg-mine').evaluateAll(xs => xs.map(x => [x.getBoundingClientRect().top, x.previousElementSibling!.getBoundingClientRect().top]));
 expect(rows).toHaveLength(30); expect(rows.every(([a,b]) => Math.abs(a-b) < 1)).toBe(true);
 expect(await root.locator('.bg-other .ref-line').allTextContents()).not.toContain(await root.locator('.self-head h2').textContent());
 await page.screenshot({ path: join(tmpdir(), 'swd-storylines-v6-story.png') });
 await root.locator('[data-act="tab"][data-tab="outline"]').click(); await expect(root.locator('.lane')).toHaveCount(3); await expect(root.locator('[data-filter-state]')).toHaveCount(3);
 await page.screenshot({ path: join(tmpdir(), 'swd-storylines-v6-outline.png') }); expect(errors).toEqual([]);
});
test('real drags: independent orders, inversions, category change, cross Beat and undecided', async ({ page }) => {
 const { root, errors } = await open(page), initial = await workspace(page, root);
 const group = initial.plot_data.storyline_groups.find((g: any) => g.id === 'G01'), [a,b] = group.time_order.current;
 await drag(page, card(root,b), card(root,a), true);
 let current = await workspace(page, root); expect(current.plot_data.storyline_groups.find((g: any) => g.id === 'G01').time_order.current[0]).toBe(b);
 expect(current.plan).toEqual(initial.plan); await root.locator('#undo').click();
 await drag(page, cell(root,'A1-B1','current').locator(`[data-card="${b}"]`), cell(root,'A1-B1','current').locator(`[data-card="${a}"]`), true);
 await expect(root.locator('.bg-mine .marked')).toHaveCount(1); await expect(cell(root,'A1-B1','current').locator(`[data-card="${b}"] .mark`)).toContainText('之后');
 expect((await workspace(page,root)).plot_data).toEqual(initial.plot_data);
 await drag(page, cell(root,'A1-B1','current').locator(`[data-card="${a}"]`), cell(root,'A1-B1','current').locator(`[data-card="${b}"]`), true); await expect(root.locator('.mark')).toHaveCount(0);
 await drag(page, card(root,a), cell(root,'A1-B1','past'));
 current = await workspace(page,root); expect(current.plot_data.plot_units.find((u: any) => u.unit_id === a).category).toBe('past');
 expect(current.plot_data.storyline_groups.find((g: any) => g.id === 'G01').time_order.past.at(-1)).toBe(a); await root.locator('#undo').click();
 const id = group.time_order.current.find((id: string) => !initial.plan.placements.some((p: any) => p.unit_id === id));
 await drag(page,card(root,id),cell(root,'A1-B1','current')); await expect(cell(root,'A1-B1','current').locator(`[data-card="${id}"]`)).toHaveCount(1); await expect(card(root,id)).toHaveCount(1);
 await drag(page,cell(root,'A1-B1','current').locator(`[data-card="${id}"]`),cell(root,'A2-B1','current')); await expect(cell(root,'A2-B1','current').locator(`[data-card="${id}"]`)).toHaveCount(1);
 await select(root,'G21'); const undecided = initial.plot_data.storyline_groups.find((g: any) => g.id === 'G21').time_order.undecided[0];
 await drag(page,card(root,undecided),cell(root,'A1-B1','undecided')); await expect(cell(root,'A1-B1','undecided').locator(`[data-card="${undecided}"]`)).toHaveCount(1);
 const beforeCancel = await workspace(page,root), source = card(root,undecided); await source.scrollIntoViewIfNeeded(); const rect = (await source.boundingBox())!;
 await page.mouse.move(rect.x+30,rect.y+30); await page.mouse.down(); await page.mouse.move(rect.x+50,rect.y+50); await page.keyboard.press('Escape'); await page.mouse.up();
 await expect(root.locator('.drag-ghost')).toHaveCount(0); expect(await workspace(page,root)).toEqual(beforeCancel); expect(errors).toEqual([]);
});
test('new card, edit, participants, real ranking drag, cloud refresh and undo', async ({ page }) => {
 const { root, reads, errors } = await open(page);
 await root.locator('[data-act="compose"][data-cat="undecided"]').click();
 let form = root.locator('[data-form="new"]'); await form.locator('[name="title"]').fill('验证新增'); await form.locator('[name="text"]').fill('保存往返'); await form.getByRole('button',{name:'添加',exact:true}).click();
 const added = (await workspace(page,root)).plot_data.plot_units.find((u:any)=>u.element_title==='验证新增').unit_id;
 await card(root,added).getByRole('button',{name:'编辑',exact:true}).click(); form=root.locator('[data-form="card"]'); await form.locator('[name="text"]').fill('修改后的内容'); await form.getByRole('button',{name:'保存',exact:true}).click();
 await root.locator('.self-head [data-act="edit-line"]').click(); form=root.locator('[data-form="line"]'); await form.locator('[name="title"]').fill('更改标题'); await form.locator('[name="part"]').fill('手填参与者'); await form.getByRole('button',{name:'添加',exact:true}).click(); await root.locator('[data-form="line"]').getByRole('button',{name:'保存',exact:true}).click();
 await root.locator('[data-act="toggle-rank"]').click(); const ranking=root.locator('.rank-item'), second=await ranking.nth(1).getAttribute('data-id'); await drag(page,ranking.nth(1),ranking.nth(0),true); await root.locator('.rank-pop [data-act="toggle-rank"]').click(); await expect(root.locator('.self-head h2')).toContainText(`${second} ×`);
 await expect.poll(async()=>JSON.parse(await unpack((reads.at('households/novel-stub-house/outlineSync/maritime-story/live') as {plot:string}).plot)).participant_order[0]).toBe(second);
 await page.reload(); await expect(root.locator('.self-head h2')).toContainText('更改标题'); const saved=await workspace(page,root); expect(saved.plot_data.plot_units.find((u:any)=>u.unit_id===added).content).toBe('修改后的内容'); expect(saved.plot_data.participant_order[0]).toBe(second);
 await root.locator('[data-act="toggle-rank"]').click(); await drag(page,root.locator('.rank-item').nth(1),root.locator('.rank-item').nth(0),true); await root.locator('.rank-pop [data-act="toggle-rank"]').click(); await root.locator('#undo').click(); expect((await workspace(page,root)).plot_data.participant_order[0]).toBe(second); expect(errors).toEqual([]);
});
