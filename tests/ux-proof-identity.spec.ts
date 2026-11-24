// Live proof updates retain report expansion and the phone's original feedback target.
import { expect, test } from '@playwright/test';
import { stubFirebase } from './stub.ts';

const book = 'households/novel-stub-house/proofdesk/maritime-story';
const id = '20260101-010101-abcd';
const record = { id, title: '报告身份', createdAt: 1, source: 'paste', draft: '第一段原文。\n第二段原文。', skipProse: false, status: 'sent' };
const report = (check: string, text: string) => ({ id: `${check}-1`, check, attempt: 1, createdAt: 1, report: text });
const good = (issue: string, para: string, quote: string) => JSON.stringify({ title: '报告身份', items: [{ para, quote, issue, kind: '人物', evidence: [] }] });

for (const first of ['open', 'manuscript']) {
  test(`raw expansion follows report ID when ${first} arrives first`, async ({ page }) => {
    const stub = await stubFirebase(page), second = first === 'open' ? 'manuscript' : 'open';
    stub.server(`${book}/${id}`, { ...record, reports: { [first]: report(first, '第一份无法解析') } });
    await page.goto(`book/?book=maritime-story&view=proof&doc=${id}`);
    const raw = page.locator('[data-view="proof"] .raw');
    await raw.locator('summary').click();
    stub.server(`${book}/${id}/reports/${second}`, report(second, '第二份无法解析'));
    await expect(raw).toHaveCount(2);
    await expect(raw.filter({ hasText: '第一份无法解析' })).toHaveAttribute('open', '');
    await expect(raw.filter({ hasText: '第二份无法解析' })).not.toHaveAttribute('open');
  });
}

test('phone return follows the original report item through arrivals and filters, then disappears with its target', async ({ page }) => {
  const stub = await stubFirebase(page);
  stub.server(`${book}/${id}`, { ...record, reports: { open: report('open', good('原来的意见', 'P2', '第二段原文。')) } });
  await page.goto(`book/?book=maritime-story&view=proof&doc=${id}`);
  const root = page.locator('[data-view="proof"]'), list = root.locator('.plist .pitem');
  await list.click();
  stub.server(`${book}/${id}/reports/manuscript`, report('manuscript', good('后来插入的意见', 'P1', '第一段原文。')));
  await expect(list).toHaveCount(2);
  await root.locator('[data-back-note]').click();
  await expect(list.filter({ hasText: '原来的意见' })).toBeFocused();
  await list.filter({ hasText: '原来的意见' }).click();
  await root.locator('[data-filter="open"]').click();
  await root.locator('[data-back-note]').click();
  await expect(list.filter({ hasText: '原来的意见' })).toBeFocused();
  await root.locator('[data-filter="manuscript"]').click();
  await expect(root.locator('[data-back-note]')).toHaveCount(0);
  await root.locator('[data-filter="all"]').click();
  await list.filter({ hasText: '原来的意见' }).click();
  stub.server(`${book}/${id}/reports/open`, null);
  await expect(list).toHaveCount(1);
  await expect(root.locator('[data-back-note]')).toHaveCount(0);
});
