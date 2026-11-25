// Opt-in screenshots read the existing private report without changing its source files.
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { env, stubFirebase } from './stub.ts';

test.describe('real proof edit screenshots', () => {
  test.skip(!env.PROOF_EDIT_SHOTS_DIR, 'set PROOF_EDIT_SHOTS_DIR for the handoff screenshots');
  for (const width of [1440, 390]) test(`${width}px`, async ({ page }) => {
    const folder = resolve('..', 'sami-writing-desk-data-proofdesk/proofdesk/maritime-story/20261124-225600-983a');
    const [draft, raw] = await Promise.all(['draft.md', 'report-open-1.json'].map(name => readFile(resolve(folder, name), 'utf8')));
    const report = JSON.parse(raw);
    // Add deterministic wording fixes only in this in-memory copy of the real report.
    report.items[1].fix = report.items[1].quote.replace('有在', '有个在').replace('香烟的出生', '香烟的、出身');
    report.items[2].fix = report.items[2].quote.replace('没有都门路', '都没有门路');
    const id = '20261124-225600-983a';
    const stub = await stubFirebase(page);
    stub.server(`/households/novel-stub-house/proofdesk/maritime-story/${id}`, {
      id, title: report.title, source: 'paste', draft, status: 'done', createdAt: Date.UTC(2026, 10, 24, 22, 56), updatedAt: 1,
      checks: { open: { status: 'done', attempt: 1 } }, reports: {
        'open-1': { id: 'open-1', check: 'open', attempt: 1, createdAt: 1, report: JSON.stringify(report) },
      },
    });
    await page.setViewportSize({ width, height: width === 390 ? 1100 : 1000 });
    await page.goto(`book/?book=maritime-story&view=proof&doc=${id}`);
    const card = page.locator(width < 860 ? '.plist .pitem' : '#pp-21 .pitem').filter({ has: page.locator('.pfix') }).first();
    await expect(card.locator('ins')).toContainText(['个', '、', '身']);
    await card.scrollIntoViewIfNeeded();
    await expect(page.getByRole('button', { name: '复制正文', exact: true })).toBeInViewport();
    await page.screenshot({ path: resolve(env.PROOF_EDIT_SHOTS_DIR!, `proof-edit-${width}.png`) });
    expect(await page.locator('.result').evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0);
  });
});
