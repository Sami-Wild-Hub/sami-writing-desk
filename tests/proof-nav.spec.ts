// 校稿台 上一条 / 下一条 at each card's foot: they step through the cards the filters leave,
// beside the draft (the quote flashes) and in the phone list (the card itself).
import { expect, test, type Page } from '@playwright/test';
import { env, stubFirebase } from './stub.ts';

const lines = Array.from({ length: 12 }, (_, i) => `第 ${i + 1} 段：${'海风从港口吹进来，灯塔的影子落在石阶上，'.repeat(6)}码头上的人各自忙着。`);
const item = (n: number, kind: string, issue: string) => ({ para: `P${n}`, quote: lines[n - 1], kind, issue, evidence: [] });
const manuscript = { title: 'C23 初稿', summary: '', items: [item(1, '连续性', '钥匙已交出。'), item(2, '人物', '语气不符。')] };
const open = { title: 'C23 初稿', summary: '', items: [item(10, '连续性', '船期对不上。'), item(12, '世界设定', '春末还有船。')] };
const id = '20261126-120000-nav1';
const view = (page: Page) => page.locator('[data-view="proof"]');

async function record(page: Page) {
  const stub = await stubFirebase(page);
  const report = (check: string, body: object) => ({ id: `${check}-1`, check, attempt: 1, createdAt: 1, report: JSON.stringify(body) });
  stub.server(`/households/novel-stub-house/proofdesk/maritime-story/${id}`, {
    id, title: 'C23 初稿', source: 'paste', draft: lines.join('\n'), status: 'done', createdAt: Date.now(), updatedAt: 1,
    checks: { manuscript: { status: 'done', attempt: 1 }, open: { status: 'done', attempt: 1 } },
    reports: { 'manuscript-1': report('manuscript', manuscript), 'open-1': report('open', open) },
  });
  await page.goto(`book/?book=maritime-story&view=proof&doc=${id}`);
  await expect(view(page).locator('.pcount')).toContainText('4 条反馈');
}

test('beside the draft, 下一条 and 上一条 step through the filtered cards', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await record(page);
  const cards = view(page).locator('.pv .pitem');
  await expect(cards).toHaveCount(4);
  await expect(cards.first().getByRole('button', { name: '上一条' })).toHaveCount(0);
  await expect(cards.last().getByRole('button', { name: '下一条' })).toHaveCount(0);

  await cards.nth(1).getByRole('button', { name: '下一条' }).click();
  await expect(cards.nth(2)).toBeInViewport();
  await expect(cards.nth(2)).toBeFocused();
  await expect(view(page).locator('#pp-10 mark')).toHaveClass(/flash/);
  await expect(view(page).locator('#pp-10 mark')).toBeInViewport();
  await cards.nth(2).getByRole('button', { name: '上一条' }).click();
  await expect(cards.nth(1)).toBeFocused();
  await expect(view(page).locator('#pp-2 mark')).toHaveClass(/flash/);

  // Only the cards the filters leave count: P2 (人物) is skipped.
  await view(page).getByRole('group', { name: '按 Tag 筛选' }).getByRole('button', { name: '连续性 2', exact: true }).click();
  await expect(cards).toHaveCount(2);
  await expect(cards.first().getByRole('button')).toHaveText(['下一条']);
  await expect(cards.last().getByRole('button')).toHaveText(['上一条']);
  await cards.first().getByRole('button', { name: '下一条' }).click();
  await expect(view(page).locator('#pp-10 .pitem')).toBeFocused();
  await expect(view(page).locator('#pp-10 mark')).toHaveClass(/flash/);
  await view(page).getByRole('group', { name: '按来源筛选' }).getByRole('button', { name: '② 开放式 2', exact: true }).click();
  await expect(cards).toHaveCount(1);
  await expect(cards.locator('.pnav')).toHaveCount(0);
});

test('on a phone, 下一条 jumps to the next card in the list', async ({ page }) => {
  await record(page);
  const list = view(page).locator('.plist .pitem');
  await expect(list).toHaveCount(4);
  await list.nth(1).getByRole('button', { name: '下一条' }).click();
  await expect(list.nth(2)).toBeFocused();
  await expect(list.nth(2)).toHaveClass(/flash/);
  await expect(list.nth(2)).toBeInViewport();
  await expect(view(page).locator('#pp-10 mark')).not.toHaveClass(/flash/);
  await expect(view(page).locator('[data-back-note]')).toHaveCount(0);
  await list.nth(2).getByRole('button', { name: '上一条' }).click();
  await expect(list.nth(1)).toBeFocused();
});

test.describe('proof nav screenshots', () => {
  test.skip(!env.PROOF_NAV_SHOTS_DIR, 'set PROOF_NAV_SHOTS_DIR for the handoff screenshots');
  test.use({ deviceScaleFactor: 2 });
  for (const [width, height] of [[1440, 900], [390, 844]] as const) test(`${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await record(page);
    const cards = view(page).locator(width < 860 ? '.plist .pitem' : '.pv .pitem');
    await cards.nth(1).getByRole('button', { name: '下一条' }).click();
    await expect(cards.nth(2)).toBeFocused();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${env.PROOF_NAV_SHOTS_DIR}/proof-nav-${width}.png` });
  });
});
