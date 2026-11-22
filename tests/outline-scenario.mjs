// Shared visible-control replay for the original HTML and the signed-in outline.
import { expect } from '@playwright/test';
export async function chooseBeat(page, root, beat) {
  const button = root.locator(`[data-choose-beat="${beat}"]`);
  const sidebar = root.locator('.outline-sidebar');
  if (await sidebar.count() && page.viewportSize().width <= 860 && !(await sidebar.getAttribute('class')).includes('show')) {
    await page.locator('#novel-bar [data-drawer]').click();
  }
  await button.click();
}
export async function showOriginal(page, root) {
  if (await root.locator('.outline-sidebar').count() && page.viewportSize().width <= 860) {
    await page.locator('#novel-bar [data-drawer]').click();
    await root.locator('#show-original').check();
    await page.locator('#novel-scrim').click({ position:{ x:385, y:400 } });
  } else await root.locator('#show-original').check();
}
// The library starts with 待排 only; the original workbench has no such filter.
export async function showPlaced(root) {
  for (const chip of await root.locator('[data-filter-state="placed"]').all()) {
    if (await chip.getAttribute('aria-pressed') === 'false') await chip.click();
  }
}
export async function editField(page, root, selector, value, key = 'Control+Enter') {
  await root.locator(selector).first().click();
  await root.locator('.inline-editor input,.inline-editor textarea').fill(value);
  await page.keyboard.press(key);
  await expect(root.locator('.inline-editor')).toHaveCount(0);
}
export async function exportJSON(page, root, id) {
  const ready = page.waitForEvent('download');
  await root.locator(`#${id}`).click();
  const dl = await ready;
  const stream = await dl.createReadStream();
  const chunks = []; for await (const c of stream) chunks.push(c);
  return JSON.parse(Buffer.concat(chunks).toString());
}
export async function importJSON(root, id, raw) {
  await root.locator(`#${id}`).setInputFiles({ name: 'fiction.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(raw)) });
}
async function compose(root, title, content) {
  await root.locator('.composer [name="element_title"]').fill(title);
  await root.locator('.composer [name="content"]').fill(content);
  await root.locator('.composer [name="details"]').fill(' One\n\n Two ');
  await root.locator('.composer [name="source_refs"]').fill('Fictional source');
  await root.locator('.composer button[type="submit"]').click();
}
export async function exerciseOutline(page, root) {
  await expect(root.locator('#overall')).toHaveText('6 / 6');
  await chooseBeat(page, root, 'A3-B2');
  await expect(root.locator('#spine-selected .empty')).toHaveCount(2);
  await chooseBeat(page, root, 'A1-B1');
  await editField(page, root, '[data-edit-field="beat-title"]', 'A fictional opening', 'Enter');
  await root.locator('#beat-note').fill('A new note');
  await editField(page, root, '[data-edit-field="element-title"][data-id="E001"]', 'New stage', 'Enter');
  await editField(page, root, '[data-edit-field="unit"][data-id="E001"]', 'A changed turn');
  await root.locator('#spine-selected .editorial-details summary').first().click();
  await editField(page, root, '[data-edit-field="element-details"][data-id="E001"]', ' One\n\n Two ');
  await root.locator('#spine-selected .editorial-controls summary').first().click();
  await root.locator('[data-editorial-status="E001"]').first().selectOption('PLANNED');
  await showPlaced(root);
  await root.locator('[data-remove="E006"]').click();
  await root.locator('#event-search').fill('E006');
  await root.locator('[data-add="E006"]').click();
  await root.locator('#event-search').fill('');
  await root.locator('[data-move="E006"]').selectOption('A1-B2');
  await root.locator('#event-search').fill('E006');
  await root.locator('[data-move-here="E006"]').click();
  await root.locator('#event-search').fill('');
  await root.locator('#rel-search').fill('Cy');
  await editField(page, root, '[data-edit-field="group-title"][data-id="G02"]', 'Cy and Dee', 'Enter');
  await editField(page, root, '[data-edit-field="group-summary"][data-id="G02"]', 'A changed summary');
  await root.locator('#rel-search').fill('');
  await showOriginal(page, root);
  await root.locator('#rel-search').fill('U001');
  await root.locator('[data-add="U001"]').click();
  await root.locator('#rel-search').fill('');
  await root.locator('[data-create-after="E001"]').click();
  await compose(root, 'Follow-up', 'A later fictional turn');
  await root.locator('[data-create-storyline="EVENT"]').click();
  await root.locator('.composer [name="title"]').fill('A custom lantern');
  await root.locator('.composer [name="summary"]').fill('A custom summary');
  await root.locator('.composer button[type="submit"]').click();
  await root.locator('[data-create-group-unit="GNEW001"][data-era="PAST"]').click();
  await compose(root, 'A pool stage', 'A fictional pool turn');
  await root.locator('[data-create-beat-unit="EVENT"][data-era="CURRENT"]').click();
  await compose(root, 'A selected stage', 'A fictional selected turn');
  const workspace = await exportJSON(page, root, 'export-workspace');
  expect(workspace.format).toBe('maritime-outline-workspace');
  expect(workspace.plot_data.source_nodes).toEqual([{ id: 'source-one', title: 'Original lantern' }]);
  const plan = await exportJSON(page, root, 'export');
  const data = await exportJSON(page, root, 'export-data');
  await importJSON(root, 'import-workspace', workspace);
  await importJSON(root, 'import-data', data);
  await importJSON(root, 'import-plan', plan);
  await root.locator('#clear-beat').click();
  await root.locator('#undo').click();
  await root.locator('#reset-all').click();
  await root.locator('#undo').click();
  await root.locator('#restore-starter').click();
  await expect(root.locator('#overall')).toHaveText('6 / 6');
  return workspace;
}
