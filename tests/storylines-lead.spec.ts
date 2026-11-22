// Exercise canonical lead sections/persistence and mocked GitHub workflow dispatch.
import { expect, test, type Locator, type Page } from '@playwright/test';
import { stubFirebase, watchErrors } from './stub.ts';
import { hasOutline, outlineFixture } from './outline-fixture.mjs';
import { unpack } from '../src/lib/views/outline/codec.js';
test.skip(!hasOutline, 'private canonical data is not in public CI');
test.use({ viewport: { width: 1440, height: 900 } });
const endpoint = 'https://api.github.com/repos/Sami-Wild-Hub/sami-writing-desk-data/actions/workflows/outline-sync.yml/dispatches';
const tokenKey = 'sami-outline-sync-token:Sami-Wild-Hub/sami-writing-desk-data';
async function open(page: Page) {
  const reads = await stubFirebase(page, { canonical: true }), errors = watchErrors(page);
  await page.goto('book/?book=maritime-story&view=outline');
  const root = page.locator('[data-view="outline"]');
  await expect(root.locator('#overall')).toHaveText('108 张 · 36 已排');
  return { root, reads, errors };
}
const section = (item: Locator) => item.evaluate(el => {
  let node = el.previousElementSibling;
  while (node && !node.classList.contains('sec-name')) node = node.previousElementSibling;
  return node?.textContent;
});
async function pickerLead(root: Locator, id: string, name: string) {
  await root.locator('[data-act="toggle-picker"]').click();
  expect(await section(root.locator(`.pick-line[data-id="${id}"]`))).toBe(name);
  await root.locator('[data-act="toggle-picker"]').click();
}
test('lead sections in both tabs update immediately, survive refresh, and follow removal', async ({ page }) => {
  const { root, reads, errors } = await open(page), fixture = outlineFixture()!;
  for (const [id, name] of [['G03', '赵祈宁'], ['G22', '梁让'], ['G01', '张予安']]) await pickerLead(root, id, name);
  await root.locator('[data-act="tab"][data-tab="outline"]').click();
  for (const [id, name] of [['G03', '赵祈宁'], ['G22', '梁让'], ['G01', '张予安']]) {
    expect(await section(root.locator(`[data-key="lib:${id}"]`))).toBe(name);
    const ids = fixture.plot_data.plot_units.filter((u: any) => u.storyline_group_id === id).map((u: any) => u.unit_id);
    const placement = fixture.plan.placements.find((p: any) => ids.includes(p.unit_id));
    if (placement) {
      await root.locator(`[data-act="choose-beat"][data-id="${placement.beat_id}"]`).click();
      expect(await section(root.locator('.ol-line').filter({ has: page.locator(`[data-act="edit-line"][data-id="${id}"]`) }).first())).toBe(name);
    }
  }
  await root.locator('[data-key="lib:G03"] [data-act="edit-line"]').click();
  await root.getByRole('combobox', { name: '标志性参与者', exact: true }).selectOption('周念儿');
  await root.locator('[data-form="line"]').getByRole('button', { name: '保存', exact: true }).click();
  expect(await section(root.locator('[data-key="lib:G03"]'))).toBe('周念儿');
  await root.locator('[data-act="tab"][data-tab="story"]').click(); await pickerLead(root, 'G03', '周念儿');
  await expect.poll(async () => JSON.parse(await unpack((reads.at('households/novel-stub-house/outlineSync/maritime-story/live') as { plot: string }).plot)).storyline_groups.find((g: any) => g.id === 'G03').lead_participant).toBe('周念儿');
  await page.reload(); await expect(root.locator('#overall')).toBeVisible(); await pickerLead(root, 'G03', '周念儿');
  await root.locator('[data-act="toggle-picker"]').click(); await root.locator('.pick-line[data-id="G03"]').click();
  await root.locator('.self-head [data-act="edit-line"]').click();
  await root.locator('[data-act="drop-part"][data-name="周念儿"]').click();
  await expect(root.getByRole('combobox', { name: '标志性参与者', exact: true })).toHaveValue('赵祈宁');
  await root.locator('[data-form="line"]').getByRole('button', { name: '保存', exact: true }).click();
  await pickerLead(root, 'G03', '赵祈宁'); expect(errors).toEqual([]);
});
test('sync asks once and dispatches main with the stored token after refresh', async ({ page }) => {
  const requests: any[] = [];
  await page.route(endpoint, async route => { requests.push(route.request()); await route.fulfill({ status: 204 }); });
  const { root, errors } = await open(page);
  await expect(root.getByRole('link', { name: '查看同步结果' })).toHaveAttribute('href', endpoint.replace('api.github.com/repos/', 'github.com/').replace('/dispatches', ''));
  await root.locator('#manual-sync').click(); const form = root.getByRole('form', { name: '同步授权' });
  await expect(form.locator('input')).toHaveAttribute('type', 'password');
  await form.getByLabel('GitHub token').fill('test-valid-token'); await form.getByRole('button', { name: '保存并同步' }).click();
  await expect(root.locator('#manual-sync-status')).toContainText('已触发同步');
  expect(requests[0].method()).toBe('POST'); expect(requests[0].postDataJSON()).toEqual({ ref: 'main' });
  expect(requests[0].headers().authorization).toBe('Bearer test-valid-token');
  await page.reload(); await expect(root.locator('#overall')).toBeVisible(); await root.locator('#manual-sync').click();
  await expect(root.locator('#manual-sync-status')).toContainText('已触发同步'); expect(requests).toHaveLength(2);
  await expect(root.getByRole('form', { name: '同步授权' })).toHaveCount(0); expect(errors).toEqual([]);
});
test('invalid token shows failure, removes stored token and asks for a replacement', async ({ page }) => {
  const tokens: string[] = [];
  await page.route(endpoint, async route => {
    const token = route.request().headers().authorization; tokens.push(token);
    await route.fulfill({ status: token === 'Bearer test-invalid-token' ? 401 : 204 });
  });
  const { root } = await open(page);
  await page.evaluate(({ key }) => localStorage.setItem(key, 'test-invalid-token'), { key: tokenKey });
  await root.locator('#manual-sync').click(); await expect(root.locator('#manual-sync-status')).toContainText('token 无效');
  const form = root.getByRole('form', { name: '同步授权' }); await expect(form).toBeVisible();
  expect(await page.evaluate(key => localStorage.getItem(key), tokenKey)).toBeNull();
  await expect(form.getByLabel('GitHub token')).toHaveValue('');
  await form.getByLabel('GitHub token').fill('test-replacement-token'); await form.getByRole('button', { name: '保存并同步' }).click();
  await expect(root.locator('#manual-sync-status')).toContainText('已触发同步');
  expect(tokens).toEqual(['Bearer test-invalid-token', 'Bearer test-replacement-token']);
});
