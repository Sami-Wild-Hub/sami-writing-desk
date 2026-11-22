// Additional offline checks of the original's keyboard, deletion and rejection controls.
import { expect } from '@playwright/test';
import { editField, exportJSON, importJSON } from './outline-scenario.mjs';

export async function exerciseOriginalEdges(page, root) {
  const editor = root.locator('[data-edit-field="unit"][data-id="E001"]');
  await editor.focus(); await page.keyboard.press('Space');
  await root.locator('.inline-editor textarea').fill(' ');
  await root.locator('[data-inline-save]').click();
  await expect(root.locator('#status')).toContainText('不能为空');
  await page.keyboard.press('Escape');
  await editor.click(); await root.locator('.inline-editor textarea').fill('Cancelled');
  await root.locator('[data-inline-cancel]').click();
  await expect(editor).toHaveText('E001 fictional turn');
  await editField(page,root,'[data-edit-field="unit"][data-id="E001"]','A changed stage','Meta+Enter');
  const controls = async () => root.locator('.card:has([data-remove="E001"]) .editorial-controls > summary').click();
  await controls(); await root.locator('[data-switch-kind="E001"]').selectOption('EVENT');
  await controls(); await root.locator('[data-switch-era="E001"]').selectOption('PAST');
  await controls(); await root.locator('[data-switch-era="E001"]').selectOption('UNASSIGNED');
  await expect(root.locator('#status')).toContainText('不能改为时间待定');
  const workspace = await exportJSON(page,root,'export-workspace');
  const invalid = structuredClone(workspace.plan); invalid.placements.push(invalid.placements[0]);
  await importJSON(root,'import-plan',invalid);
  await expect(root.locator('#status')).toHaveClass(/error/);
  expect(await exportJSON(page,root,'export-workspace')).toEqual(workspace);
  await root.locator('[data-create-storyline="EVENT"]').click();
  await root.locator('.composer [name="title"]').fill('Cancelled'); await page.keyboard.press('Escape');
  await expect(root.locator('.composer')).toHaveCount(0);
  await root.locator('[data-create-storyline="EVENT"]').click();
  await root.locator('.composer [name="title"]').fill('A removable line'); await page.keyboard.press('Control+Enter');
  await root.locator('[data-create-group-unit="GNEW001"][data-era="CURRENT"]').click();
  await root.locator('.composer [name="element_title"]').fill('A removable stage');
  await root.locator('.composer [name="content"]').fill('A fictional turn');
  await root.locator('.composer [name="also_place"]').check(); await page.keyboard.press('Control+Enter');
  await root.locator('[data-delete-group="GNEW001"]').click();
  await expect(root.locator('#status')).toContainText('请先移除');
  await root.locator('.card:has([data-remove="UNEW001"]) .editorial-controls > summary').click();
  await root.locator('[data-delete-unit="UNEW001"]').click();
  await root.locator('[data-delete-group="GNEW001"]').click();
  await expect(root.locator('[data-group="GNEW001"]')).toHaveCount(0);
  await root.locator('#rel-search').fill('U001');
  await root.locator('.card:has([data-add="U001"]) .origin summary').click();
  await editField(page,root,'[data-edit-field="unit"][data-id="U001"]','Edited original');
  expect((await exportJSON(page,root,'export-data')).plot_units.find(u=>u.unit_id==='U001').original_content).toBe('U001 fictional turn');
  await root.locator('#rel-search').fill('No matches');
  await expect(root.locator('#rel-groups')).toContainText('暂无匹配');
  await root.locator('.secondary .detailbox').nth(1).locator('summary').click();
  await expect(root.locator('#original-counts tr')).toHaveCount(3);
}
