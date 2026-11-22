// Keyboard, validation, classification, disclosure and deletion behavior through visible controls.
import { expect, test, type Locator, type Page } from '@playwright/test';
import { stubFirebase, watchErrors } from './stub.ts';
import { chooseBeat, showOriginal, exportJSON } from './outline-scenario.mjs';

async function open(page: Page) {
  await stubFirebase(page);
  await page.goto('book/?book=maritime-story&view=outline');
  const root = page.locator('[data-view="outline"]');
  await expect(root.locator('#overall')).toHaveText('6 / 6');
  return root;
}
async function controls(root: Locator, id: string) {
  const card = root.locator(`.card:has([data-remove="${id}"])`);
  await card.locator('.editorial-controls > summary').click();
  return card;
}

test('F06,09,11–13,32: keyboard editors, blank validation, cancellation and custom title synchronization', async ({ page }) => {
  const errors = watchErrors(page), root = await open(page);
  const field = root.locator('[data-edit-field="unit"][data-id="E001"]');
  await field.focus(); await page.keyboard.press('Enter');
  await root.locator('.inline-editor textarea').fill(' ');
  await root.locator('[data-inline-save]').click();
  await expect(root.locator('#status')).toContainText('不能为空');
  await page.keyboard.press('Escape');
  await expect(field).toHaveText('E001 fictional turn');
  await field.focus(); await page.keyboard.press('Space');
  await root.locator('.inline-editor textarea').fill('First new turn');
  await page.keyboard.press('Meta+Enter');
  await field.click(); await root.locator('.inline-editor textarea').fill('Second new turn');
  await root.locator('.beatbar h2').click();
  await expect(field).toHaveText('Second new turn');
  const out = await exportJSON(page, root, 'export-workspace');
  expect(out.plot_data.plot_units[0].original_content).toBeUndefined();
  await showOriginal(page, root);
  await root.locator('#rel-search').fill('U001');
  const original = root.locator('[data-edit-field="unit"][data-id="U001"]');
  await original.click(); await root.locator('.inline-editor textarea').fill('Changed original node');
  await page.keyboard.press('Control+Enter');
  const originalExport = await exportJSON(page, root, 'export-workspace');
  expect(originalExport.plot_data.plot_units.find((u: {unit_id:string}) => u.unit_id === 'U001').original_content).toBe('U001 fictional turn');
  await root.locator('#rel-search').fill('');
  await root.locator('[data-edit-field="beat-title"]').click();
  await root.locator('.inline-editor input').fill(''); await page.keyboard.press('Enter');
  await expect(root.locator('#beat-title')).toContainText('点击填写');
  await root.locator('[data-create-storyline="EVENT"]').click();
  await root.locator('.composer [name="title"]').fill('Cancelled line');
  await page.keyboard.press('Escape');
  await expect(root.locator('.composer')).toHaveCount(0);
  await root.locator('[data-create-storyline="EVENT"]').click();
  await root.locator('.composer [name="title"]').fill('New lantern');
  await page.keyboard.press('Control+Enter');
  await root.locator('[data-edit-field="group-title"][data-id="GNEW001"]').click();
  await root.locator('.inline-editor input').fill('Renamed lantern'); await page.keyboard.press('Enter');
  const after = await exportJSON(page, root, 'export-workspace');
  expect(after.plot_data.storylines.find((s: {id:string}) => s.id === 'SNEW001').title).toBe('Renamed lantern');
  expect(errors).toEqual([]);
});

test('F14–19: independent searches, disclosure persistence, pending and source statistics', async ({ page }) => {
  const root = await open(page);
  await root.locator('#rel-groups [data-group="G02"] > summary').click();
  await chooseBeat(page, root, 'A3-B1');
  await expect(root.locator('#rel-groups [data-group="G02"]')).toHaveAttribute('open','');
  for (const query of ['e004','CY × DEE','storyline','fictional turn','E004 stage','First detail']) {
    await root.locator('#rel-search').fill(query);
    await expect(root.locator('#rel-groups [data-group="G02"]')).toBeVisible();
  }
  await root.locator('#event-search').fill('No such story');
  await expect(root.locator('#event-groups')).toContainText('暂无匹配');
  await root.locator('#rel-search').fill('e004');
  await expect(root.locator('#rel-left')).toHaveText('1 个可选');
  await showOriginal(page, root);
  await root.locator('#rel-search').fill('U001');
  const source = root.locator('#rel-groups .card:has([data-add="U001"])');
  await source.locator('.origin summary').click();
  await expect(source.locator('.origin')).toContainText('source-one');
  await root.locator('#pending-box > summary').click();
  await expect(root.locator('#pending-list')).toContainText('U002');
  await root.locator('#pending-box + details > summary').click();
  await expect(root.locator('#original-counts tr')).toHaveCount(3);
  await expect(root.locator('#original-counts')).toContainText('The Lantern');
});

test('F24–26: categories, eras, status and rejected placed-unassigned changes', async ({ page }) => {
  const root = await open(page);
  await controls(root, 'E001');
  await root.locator('[data-switch-kind="E001"]').selectOption('EVENT');
  await controls(root, 'E001');
  await root.locator('[data-switch-era="E001"]').selectOption('PAST');
  await controls(root, 'E001');
  await root.locator('[data-switch-era="E001"]').selectOption('UNASSIGNED');
  await expect(root.locator('#status')).toContainText('不能改为时间待定');
  await controls(root, 'E001');
  await root.locator('[data-editorial-status="E001"]').selectOption('PLANNED');
  const out = await exportJSON(page, root, 'export-workspace');
  const u = out.plot_data.plot_units.find((u: {unit_id:string}) => u.unit_id === 'E001');
  expect(u.era).toBe('PAST'); expect(u.status).toBe('PLANNED');
  expect(out.plan.kind_overrides.E001).toBe('EVENT');
  expect(out.plan.placements.find((p: {unit_id:string}) => p.unit_id === 'E001').era).toBe('PAST');
});

test('F29,33–38: optional placement, deletion guards, confirmation cancellation and clear-empty feedback', async ({ page }) => {
  const root = await open(page);
  await root.locator('[data-create-storyline="EVENT"]').click();
  await root.locator('.composer [name="title"]').fill('Custom line');
  await root.locator('.composer button[type=submit]').click();
  await root.locator('[data-create-group-unit="GNEW001"][data-era="CURRENT"]').click();
  await root.locator('.composer [name="element_title"]').fill('A new stage');
  await root.locator('.composer [name="content"]').fill('A fictional new turn');
  await root.locator('.composer [name="also_place"]').check();
  await root.locator('.composer button[type=submit]').click();
  await root.locator('[data-delete-group="GNEW001"]').click();
  await expect(root.locator('#status')).toContainText('请先移除');
  await controls(root, 'UNEW001');
  page.once('dialog', d => d.dismiss());
  await root.locator('[data-delete-unit="UNEW001"]').click();
  await expect(root.locator('[data-remove="UNEW001"]')).toBeVisible();
  page.once('dialog', d => d.accept());
  await root.locator('[data-delete-unit="UNEW001"]').click();
  await expect(root.locator('[data-remove="UNEW001"]')).toHaveCount(0);
  page.once('dialog', d => d.accept());
  await root.locator('[data-delete-group="GNEW001"]').click();
  await expect(root.locator('[data-group="GNEW001"]')).toHaveCount(0);
  await root.locator('#undo').click();
  await chooseBeat(page, root, 'A3-B2');
  await root.locator('#clear-beat').click();
  await expect(root.locator('#status')).toContainText('没有已选节点');
});

test('the library filters by three states and receives pending nodes before any Beat does', async ({ page }) => {
  const root = await open(page);
  await chooseBeat(page, root, 'A3-B1');
  await expect(root.locator('#rel-left')).toHaveText('4 个可选');
  const chip = (state: string) => root.locator(`.state-filter[data-kind="RELATIONSHIP"] [data-filter-state="${state}"]`);
  await expect(chip('written')).toHaveAttribute('aria-pressed', 'false');
  await chip('written').click();
  await expect(root.locator('#rel-left')).toHaveText('5 个可选');
  await chip('placed').click();
  await expect(root.locator('#rel-left')).toHaveText('1 个可选');
  await chip('written').click();
  await chip('placed').click();
  await chip('unplaced').click();

  await root.locator('#pending-box > summary').click();
  const pending = root.locator('[data-pending-id="U002"]');
  await expect(pending.locator('[data-add]')).toHaveCount(0);
  await pending.locator('[name="destination"]').selectOption('RELATIONSHIP:G02');
  await pending.getByRole('button', { name: '放入 Past' }).click();
  await expect(root.locator('#pending-count')).toHaveText('0');
  await expect(root.locator('.board .card')).toHaveCount(0);
  const card = root.locator('#rel-groups [data-group="G02"] .card', { hasText: 'U002 fictional turn' });
  await expect(card).toBeVisible();
  await expect(chip('unplaced')).toHaveAttribute('aria-pressed', 'true');
  await expect(card.locator('.editorial-badge')).toHaveText('待排');
  await card.locator('[data-add]').click();
  await expect(root.locator('#rel-selected [data-selected-era="PAST"] .card')).toContainText('U002 fictional turn');
  await expect(root.locator('#rel-selected [data-selected-era="PAST"] .editorial-badge')).toHaveText('已排');
});
