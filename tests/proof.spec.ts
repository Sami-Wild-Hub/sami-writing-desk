import { expect, test, type Page } from '@playwright/test';
import { env, stubFirebase, watchErrors } from './stub.ts';

// 校稿台 against the stubbed Firebase: the draft becomes a task, the pasted reply becomes
// items beside the draft, and both are saved so a reload or the history brings them back.
const draft = `# 第二十三章

清晨，Ann 沿着码头走到灯塔下，手里攥着那枚铜钥匙。
Cy 已经在台阶上等她，说昨晚的船没有来。

她想起父亲临走前说过的话，决定先去港务所问一问。
港务所的老职员摇头：今年春天以来，没有一条船从南边进港。`;
const report = `好的，以下是校稿结果：
\`\`\`json
{"title": "C23 初稿", "items": [
  {"para": "P4", "quote": "没有一条船从南边进港", "kind": "时间线", "level": "存疑", "issue": "前文春末还有船从南边来。", "evidence": ["事件 E-9002"]},
  {"para": "P1", "quote": "那枚铜钥匙", "kind": "物品", "level": "冲突", "issue": "铜钥匙前文已交给 Cy。", "evidence": ["事件 E-9001", "C2#P5"], "suggestion": "改成 Cy 带着钥匙。"},
  {"para": "P2", "quote": "昨天的船", "kind": "知情", "level": "提示", "issue": "Cy 此时未必知道船期。", "evidence": []}
], "summary": "两处和前文对不上。"}
\`\`\`
有问题再叫我。`;

const view = (page: Page) => page.locator('[data-view="proof"]');
const items = (page: Page) => view(page).locator('.pv .pnotes .pitem');

async function create(page: Page) {
  await page.goto('book/?book=maritime-story&view=proof');
  await expect(view(page).getByRole('heading', { name: '新校稿' })).toBeVisible();
  await view(page).getByLabel('标题').fill('C23 初稿');
  await view(page).getByLabel('新稿').fill(draft);
  await expect(view(page).locator('[data-count]')).toHaveText('4 段');
  await view(page).getByRole('button', { name: '生成校稿任务' }).click();
  await expect(view(page).locator('.phead h2')).toHaveText('C23 初稿');
  await expect.poll(() => new URL(page.url()).searchParams.get('doc') ?? '').toMatch(/^\d{8}-\d{6}-[0-9a-z]{4}$/);
  return new URL(page.url()).searchParams.get('doc')!;
}

async function paste(page: Page, text: string) {
  const step = view(page).locator('details.paste');
  if (!await step.evaluate((d: HTMLDetailsElement) => d.open)) await step.locator('summary').click();
  await step.locator('textarea').fill(text);
  await step.getByRole('button', { name: '读取报告' }).click();
}

test('paste a draft, copy the task, paste the reply, read the items, reopen from history', async ({ page, context }) => {
  const errors = watchErrors(page);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.setViewportSize({ width: 1280, height: 900 });
  const reads = await stubFirebase(page);
  const id = await create(page);
  expect(reads).toContain(`/households/novel-stub-house/proofdesk/maritime-story/${id}`);
  await expect(page.locator('#novel-views').getByRole('link', { name: '校稿台' })).toHaveAttribute('aria-current', 'page');
  // The reader tab does not carry the record id over as a page.
  await expect(page.locator('#novel-views').getByRole('link', { name: '阅读' })).toHaveAttribute('href', '/book/?book=maritime-story');

  await view(page).getByRole('button', { name: '复制任务' }).click();
  await expect(page.locator('.toast')).toContainText('已复制');
  const task = await page.evaluate(() => navigator.clipboard.readText());
  expect(task).toContain('novels/maritime-story/');
  expect(task).toContain('[P1] 清晨，Ann 沿着码头走到灯塔下，手里攥着那枚铜钥匙。');
  expect(task).toContain('[P4] 港务所的老职员摇头');
  expect(task).not.toContain('第二十三章');

  await paste(page, report);
  await expect(view(page).locator('.pcount')).toContainText('3 条反馈');
  await expect(view(page).locator('.psum')).toHaveText('两处和前文对不上。');
  await expect(items(page).locator('blockquote')).toHaveText(['那枚铜钥匙', '昨天的船', '没有一条船从南边进港']);
  await expect(view(page).locator('#pp-1 mark')).toHaveText('那枚铜钥匙');
  await expect(view(page).locator('#pp-4 mark')).toHaveText('没有一条船从南边进港');
  await expect(view(page).locator('#pp-2 mark')).toHaveCount(0);
  await expect(view(page).locator('#pp-2 .pitem')).toContainText('未对上原文');
  await expect(view(page).locator('#pp-1 .pitem')).toContainText('改成 Cy 带着钥匙。');
  // Each item sits level with its paragraph.
  const top = async (selector: string) => (await view(page).locator(selector).boundingBox())!.y;
  expect(Math.abs(await top('#pp-4 .ptext') - await top('#pp-4 .pitem'))).toBeLessThan(16);

  await page.reload();
  await expect(view(page).locator('.phead h2')).toHaveText('C23 初稿');
  await expect(items(page)).toHaveCount(3);
  await view(page).locator('.side').getByRole('link', { name: '＋ 新校稿' }).click();
  await expect(view(page).getByRole('heading', { name: '新校稿' })).toBeVisible();
  const history = view(page).locator('.hist-list a');
  await expect(history).toHaveCount(1);
  await expect(history).toContainText('1 次报告');
  await history.click();
  await expect(items(page)).toHaveCount(3);

  // A reply that cannot be read is kept too, beside the earlier one.
  await paste(page, '抱歉，我暂时无法访问这个仓库。');
  await expect(view(page).locator('.perr')).toContainText('没找到 JSON');
  await expect(view(page).locator('.raw pre')).toHaveText('抱歉，我暂时无法访问这个仓库。');
  await expect(view(page).locator('.rtabs button')).toHaveCount(2);
  await view(page).locator('.rtabs button').first().click();
  await expect(items(page)).toHaveCount(3);
  await page.reload();
  await expect(view(page).locator('.rtabs button')).toHaveCount(2);
  expect(errors).toEqual([]);
});

test('on a phone the items come first and tapping one jumps to its quote', async ({ page }) => {
  await stubFirebase(page);
  await create(page);
  await paste(page, report);
  const list = view(page).locator('.plist .pitem');
  await expect(list).toHaveCount(3);
  await expect(items(page).first()).toBeHidden();
  await list.nth(2).click();
  const mark = view(page).locator('#pp-4 mark');
  await expect(mark).toHaveClass(/flash/);
  await expect(mark).toBeInViewport();
  await view(page).getByRole('button', { name: '历史' }).click();
  await expect(view(page).locator('.side')).toHaveClass(/show/);
  await expect(view(page).locator('.hist-list a')).toContainText('C23 初稿');
});

test('a bad draft is not sent, and deleting asks first', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await stubFirebase(page);
  await page.goto('book/?book=maritime-story&view=proof');
  await view(page).getByRole('button', { name: '生成校稿任务' }).click();
  await expect(view(page).locator('[data-err]')).toHaveText('先写个标题，如「C23 初稿」。');
  const id = await create(page);
  page.once('dialog', (dialog) => dialog.dismiss());
  await view(page).getByRole('button', { name: '删除' }).click();
  await expect(view(page).locator('.phead h2')).toHaveText('C23 初稿');
  page.once('dialog', (dialog) => dialog.accept());
  await view(page).getByRole('button', { name: '删除' }).click();
  await expect(view(page).getByRole('heading', { name: '新校稿' })).toBeVisible();
  await expect(view(page).locator('.hist-empty')).toBeVisible();
  await page.goto(`book/?book=maritime-story&view=proof&doc=${id}`);
  await expect(page.locator('.toast')).toContainText('找不到这条校稿记录');
  await expect.poll(() => new URL(page.url()).searchParams.get('doc')).toBeNull();
});

test.describe('proof screens', () => {
  test.skip(!env.NOVEL_SHOTS_DIR, 'set NOVEL_SHOTS_DIR to take the design screenshots');
  for (const [width, height] of [[390, 844], [2560, 1440]] as const) {
    test(`${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await stubFirebase(page);
      await create(page);
      await paste(page, report);
      await expect(view(page).locator('.pcount')).toBeVisible();
      await page.locator('.toast').evaluate((toast) => toast.remove());
      const shot = async (name: string) => {
        await page.waitForTimeout(400);
        expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
        await page.screenshot({ path: `${env.NOVEL_SHOTS_DIR}/${width}-proof-${name}.png` });
      };
      await shot('items');
      await page.evaluate(() => window.scrollTo(0, 0));
      await shot('record');
      if (width < 860) {
        await view(page).locator('.plist .pitem').nth(2).click();
        await shot('jump');
      }
    });
  }
});
