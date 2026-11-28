import { expect, test, type Page } from '@playwright/test';
import { env, stubFirebase, watchErrors } from './stub.ts';

// 校稿台 against the stubbed Firebase: the page writes a queued request, then follows what
// the host watcher writes (simulated here with `server`) — statuses, links, both checks'
// reports — and shows the items beside the draft, tagged ① or ②.
const draft = `# 第二十三章

清晨，Ann 沿着码头走到灯塔下，手里攥着那枚铜钥匙。
Cy 已经在台阶上等她，说昨晚的船没有来。

她想起父亲临走前说过的话，决定先去港务所问一问。
港务所的老职员摇头：今年春天以来，没有一条船从南边进港。`;
const manuscript = `{"title": "C23 初稿", "items": [
  {"para": "P1", "quote": "清晨，Ann 沿着码头走到灯塔下，手里攥着那枚铜钥匙。", "kind": "连续性", "issue": "铜钥匙第 20 章已交给 Cy。", "evidence": ["C20#P5"], "suggestion": "改成 Cy 带着钥匙。"},
  {"para": "P2", "quote": "昨天的船", "kind": "人物", "level": "提示", "issue": "Cy 此时未必知道船期。", "evidence": []}
], "summary": "和已写正文有一处冲突。"}`;
const open = `{"title": "C23 初稿", "items": [
  {"para": "P4", "quote": "港务所的老职员摇头：今年春天以来，没有一条船从南边进港。", "kind": "世界设定", "issue": "前文春末还有船从南边来。", "evidence": ["事件 E-9002"]}
], "summary": "时间线上有一处存疑。"}`;

const book = '/households/novel-stub-house/proofdesk/maritime-story';
const view = (page: Page) => page.locator('[data-view="proof"]');
const items = (page: Page) => view(page).locator('.pv .pnotes .pitem');
const step = (page: Page, name: string) => view(page).locator('.pstep', { hasText: name });
type Stub = Awaited<ReturnType<typeof stubFirebase>>;

/** Existing pasted records with both checks are kept exactly as stored. */
async function legacy(page: Page, stub: Stub, skipProse = false) {
  const id = '20261121-153012-abcd';
  stub.server(`${book}/${id}`, { id, title: 'C23 初稿', source: 'paste', draft, skipProse,
    createdAt: Date.now(), updatedAt: Date.now(), status: 'queued',
    checks: { manuscript: { status: 'queued' }, open: { status: 'queued' } } });
  await page.goto(`book/?book=maritime-story&view=proof&doc=${id}`);
  await expect(view(page).locator('.phead h2')).toHaveText('C23 初稿');
  return id;
}

async function create(page: Page, title = 'C23 初稿', skipProse = false) {
  await page.goto('book/?book=maritime-story&view=proof');
  await expect(view(page).getByRole('heading', { name: '新校稿' })).toBeVisible();
  await expect(view(page).getByLabel('不验语病')).not.toBeChecked();
  if (skipProse) await view(page).getByLabel('不验语病').check();
  await view(page).getByLabel('标题').fill(title);
  await view(page).getByLabel('新稿').fill(draft);
  await expect(view(page).locator('[data-count]')).toHaveText('4 段');
  await view(page).getByRole('button', { name: '发送校稿' }).click();
  await expect(view(page).locator('.phead h2')).toHaveText(title);
  await expect.poll(() => new URL(page.url()).searchParams.get('doc') ?? '').toMatch(/^\d{8}-\d{6}-[0-9a-z]{4}$/);
  return new URL(page.url()).searchParams.get('doc')!;
}

test('new requests choose models, reject an empty selection, and remember each prose mode separately', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const stub = await stubFirebase(page);
  await page.goto('book/?book=maritime-story&view=proof');
  const form = view(page);
  await form.getByLabel('GPT chat').uncheck();
  await form.getByLabel('标题').fill('多模型测试');
  await form.getByLabel('新稿').fill('甲。');
  await form.getByRole('button', { name: '发送校稿' }).click();
  await expect(form.locator('[data-err]')).toHaveText('至少勾选一个校稿模型。');
  await form.getByLabel('Opus 5.5 high').check();
  await form.getByLabel('GPT chat').check();
  await form.getByLabel('Terra 6.1 max').check();
  await form.getByRole('button', { name: '发送校稿' }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get('doc') ?? '').toMatch(/^[0-9]{8}-[0-9]{6}-[0-9a-z]{4}$/);
  const recordId = new URL(page.url()).searchParams.get('doc')!;
  expect(stub.at(`${book}/${recordId}/checks`)).toEqual({ open: { status: 'queued' }, opus: { status: 'queued' }, terra: { status: 'queued' } });
  await page.goto('book/?book=maritime-story&view=proof');
  await form.getByLabel('不验语病').check();
  await expect(form.getByLabel('GPT chat')).toBeChecked();
  await expect(form.getByLabel('Opus 5.5 high')).not.toBeChecked();
  await expect(form.getByLabel('Terra 6.1 max')).not.toBeChecked();
  await form.getByLabel('Terra 6.1 max').check();
  await form.getByLabel('不验语病').uncheck();
  await expect(form.getByLabel('Opus 5.5 high')).toBeChecked();
  await expect(form.getByLabel('Terra 6.1 max')).toBeChecked();
});

test('revision recheck defaults to the current models used by its source record', async ({ page }) => {
  const stub = await stubFirebase(page);
  const id = '20261128-120000-rech';
  const report = (check: string) => ({ id: `${check}-1`, check, attempt: 1, createdAt: 1, report: open });
  stub.server(`${book}/${id}`, { id, title: 'C23 初稿', source: 'paste', draft, createdAt: 1, updatedAt: 1, status: 'done',
    checks: { open: { status: 'done', attempt: 1 }, opus: { status: 'done', attempt: 1 } },
    reports: { 'open-1': report('open'), 'opus-1': report('opus') } });
  await page.goto(`book/?book=maritime-story&view=proof&doc=${id}`);
  await page.getByRole('button', { name: '修改稿复校' }).click();
  const form = view(page);
  await expect(form.getByRole('heading', { name: '修改稿复校' })).toBeVisible();
  await expect(form.getByLabel('GPT chat')).toBeChecked();
  await expect(form.getByLabel('Opus 5.5 high')).toBeChecked();
  await expect(form.getByLabel('Terra 6.1 max')).not.toBeChecked();
});

/** What the watcher writes as it works: both checks sent, then both reports and done. */
function sent(stub: Stub, id: string) {
  const at = Date.now();
  stub.server(`${book}/${id}/status`, 'sent');
  stub.server(`${book}/${id}/checks`, {
    manuscript: { status: 'sent', attempt: 1, job: `proofdesk-${id}-manuscript-1`, at },
    open: { status: 'sent', attempt: 1, chat: 'https://chatgpt.com/g/g-p-x/c/abc', at },
  });
}
function report(stub: Stub, id: string, check: 'manuscript' | 'open', attempt: number, text: string) {
  stub.server(`${book}/${id}/reports/${check}-${attempt}`, {
    id: `${check}-${attempt}`, check, attempt, createdAt: Date.now() + attempt, report: text,
    path: `proofdesk/maritime-story/${id}/report-${check}-${attempt}.json`,
  });
  stub.server(`${book}/${id}/checks/${check}/status`, 'done');
}
function done(stub: Stub, id: string) {
  report(stub, id, 'manuscript', 1, manuscript);
  report(stub, id, 'open', 1, open);
  stub.server(`${book}/${id}/status`, 'done');
}

test('an existing paste record retains both checks beside the draft', async ({ page }) => {
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  const stub = await stubFirebase(page);
  const id = await legacy(page, stub);
  expect(stub.at(`${book}/${id}`)).toMatchObject({ id, title: 'C23 初稿', source: 'paste', skipProse: false, status: 'queued', draft, checks: { manuscript: { status: 'queued' }, open: { status: 'queued' } } });
  expect(stub.at(`${book}/${id}/driveName`)).toBeNull();
  await expect(view(page).locator('.pstatus-head .pst')).toHaveText('排队');
  await expect(view(page).locator('.pnote')).toContainText('结果回来后会自动显示');
  await expect(view(page).locator('#pp-4 .ptext')).toContainText('港务所的老职员摇头');
  // The reader tab does not carry the record id over as a page.
  await expect(page.locator('#novel-views').getByRole('link', { name: '阅读' })).toHaveAttribute('href', /\/book\/\?book=maritime-story$/);

  sent(stub, id);
  await expect(view(page).locator('.pstatus-head .pst')).toHaveText('已发送');
  await expect(step(page, 'GPT chat').getByRole('link', { name: '打开对话 ↗' })).toHaveAttribute('href', 'https://chatgpt.com/g/g-p-x/c/abc');
  await expect(step(page, '① 对照正文').locator('code')).toHaveText(`proofdesk-${id}-manuscript-1`);
  await expect(view(page).getByRole('button', { name: '重新发送' })).toHaveCount(0);

  report(stub, id, 'open', 1, open);
  await expect(items(page)).toHaveCount(1);
  await expect(step(page, 'GPT chat').locator('.pst')).toHaveText('完成');
  done(stub, id);
  await expect(view(page).locator('.pstatus-head .pst')).toHaveText('完成');
  await expect(view(page).locator('.pcount')).toContainText('3 条反馈');
  await expect(items(page).locator('blockquote')).toHaveText([JSON.parse(manuscript).items[0].quote, '昨天的船', JSON.parse(open).items[0].quote]);
  await expect(items(page).locator('.src')).toHaveText(['① 对照正文', '① 对照正文', 'GPT chat']);
  await expect(view(page).locator('.psum')).toHaveText(['GPT chat 时间线上有一处存疑。', '① 对照正文 和已写正文有一处冲突。']);
  await expect(view(page).locator('#pp-1 mark')).toHaveText(JSON.parse(manuscript).items[0].quote);
  await expect(items(page).first().locator('.lv')).toHaveCount(0);
  await expect(view(page).locator('.prob')).toHaveCount(0);
  await expect(view(page).locator('#pp-2 .pitem')).toContainText('未对上原文');
  // Each item sits level with its paragraph.
  const top = async (selector: string) => (await view(page).locator(selector).boundingBox())!.y;
  expect(Math.abs(await top('#pp-4 .ptext') - await top('#pp-4 .pitem'))).toBeLessThan(16);

  await view(page).getByRole('button', { name: 'GPT chat 1' }).click();
  await expect(items(page).locator('blockquote')).toHaveText([JSON.parse(open).items[0].quote]);
  await expect(view(page).locator('.psum')).toHaveText(['GPT chat 时间线上有一处存疑。']);
  await view(page).getByRole('group', { name: '按 Tag 筛选' }).getByRole('button', { name: '连续性 0', exact: true }).click();
  await expect(items(page)).toHaveCount(0);
  await view(page).getByRole('group', { name: '按模型筛选' }).getByRole('button', { name: '全部 3', exact: true }).click();
  await expect(items(page)).toHaveCount(1);
  await expect(items(page).first()).toContainText('连续性');
  await page.reload();
  await expect(view(page).getByRole('button', { name: '全部 3' })).toHaveAttribute('aria-pressed', 'true');
  await expect(items(page)).toHaveCount(3);
  await view(page).locator('.side').getByRole('link', { name: '＋ 新校稿' }).click();
  const history = view(page).locator('.hist-list a');
  await expect(history).toHaveCount(1);
  await expect(history).toContainText('完成');
  await expect(history).not.toContainText('不验语病');
  await history.click();
  await expect(items(page)).toHaveCount(3);
  expect(errors).toEqual([]);
});

test('a failed check says why; resending it queues it again and keeps the old report', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const stub = await stubFirebase(page);
  const id = await legacy(page, stub, true);
  expect(stub.at(`${book}/${id}/skipProse`)).toBe(true);
  await expect(view(page).locator('.phead .meta')).toContainText('不验语病');
  sent(stub, id);
  report(stub, id, 'manuscript', 1, manuscript);
  stub.server(`${book}/${id}/checks/open`, { status: 'failed', attempt: 1, chat: 'https://chatgpt.com/c/abc', error: '60 分钟内没收到报告', at: Date.now() });
  stub.server(`${book}/${id}/error`, 'GPT chat：60 分钟内没收到报告');
  stub.server(`${book}/${id}/status`, 'failed');
  await expect(view(page).locator('.pstatus-head .pst')).toHaveText('失败');
  await expect(view(page).locator('.pstatus > .perr')).toHaveText('GPT chat：60 分钟内没收到报告');
  await expect(step(page, 'GPT chat').locator('.perr')).toHaveText('60 分钟内没收到报告');
  await expect(items(page)).toHaveCount(2);

  await step(page, 'GPT chat').getByRole('button', { name: '重新发送' }).click();
  await expect(page.locator('.toast')).toContainText('已重新排队');
  await expect.poll(() => stub.at(`${book}/${id}/status`)).toBe('queued');
  expect(stub.at(`${book}/${id}/checks/open/status`)).toBe('queued');
  expect(stub.at(`${book}/${id}/checks/manuscript/status`)).toBe('done');
  expect(stub.at(`${book}/${id}/checks/open/attempt`)).toBe(1);
  expect(stub.at(`${book}/${id}/skipProse`)).toBe(true);
  await expect(step(page, 'GPT chat').locator('.pst')).toHaveText('排队');

  // The second send's report arrives next to the first check's; a bad reply is shown as is.
  stub.server(`${book}/${id}/checks/open`, { status: 'done', attempt: 2, chat: 'https://chatgpt.com/c/def', at: Date.now() });
  report(stub, id, 'open', 2, '抱歉，我暂时无法访问这个仓库。');
  stub.server(`${book}/${id}/error`, null);
  stub.server(`${book}/${id}/status`, 'done');
  await expect(view(page).locator('.perr')).toContainText('GPT chat 第 2 次的回复读不出来');
  await expect(view(page).locator('.raw pre')).toHaveText('抱歉，我暂时无法访问这个仓库。');
  report(stub, id, 'open', 3, open);
  await expect(view(page).locator('.rtabs button')).toHaveCount(2);
  await expect(items(page)).toHaveCount(3);
  await expect(view(page).locator('.raw')).toHaveCount(0);
  await view(page).locator('.rtabs button').first().click();
  await expect(view(page).locator('.raw pre')).toHaveText('抱歉，我暂时无法访问这个仓库。');

  await view(page).getByRole('button', { name: '全部重新发送' }).click();
  await expect.poll(() => stub.at(`${book}/${id}/checks/manuscript/status`)).toBe('queued');
  expect(stub.at(`${book}/${id}/checks/open/status`)).toBe('queued');
  expect(Object.keys(stub.at(`${book}/${id}/reports`) as object)).toHaveLength(3);
  expect(stub.at(`${book}/${id}/skipProse`)).toBe(true);
  await page.reload();
  await expect(view(page).locator('.hist-list a')).toContainText('不验语病');
  await view(page).locator('.side').getByRole('link', { name: '＋ 新校稿' }).click();
  await expect(view(page).getByLabel('不验语病')).not.toBeChecked();
});

test('a Drive request names the chapter; the fetched draft shows when it arrives', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const stub = await stubFirebase(page);
  await page.goto('book/?book=maritime-story&view=proof');
  await view(page).getByLabel('不验语病').check();
  await view(page).getByRole('button', { name: '从 Drive 取' }).click();
  await expect(view(page).getByLabel('不验语病')).toBeChecked();
  await expect(view(page).getByLabel('新稿')).toHaveCount(0);
  await view(page).getByLabel('标题').fill('C22 原稿');
  await view(page).getByRole('button', { name: '发送校稿' }).click();
  await expect(view(page).locator('[data-err]')).toHaveText('写上要取的章节名，如「第22章」。');
  await view(page).getByLabel('章节', { exact: true }).fill('第22章');
  await view(page).getByRole('button', { name: '发送校稿' }).click();
  await expect(view(page).locator('.phead .meta')).toContainText('Drive：C22 · 待取稿');
  const id = new URL(page.url()).searchParams.get('doc')!;
  expect(stub.at(`${book}/${id}`)).toMatchObject({ source: 'drive', driveName: 'C22', skipProse: true, status: 'queued' });
  expect(stub.at(`${book}/${id}/draft`)).toBeNull();
  await expect(view(page).locator('.pnote')).toContainText('新稿还没取到');

  stub.server(`${book}/${id}/status`, 'sending');
  stub.server(`${book}/${id}/fetch`, { status: 'sent', attempt: 1, job: `proofdesk-${id}-fetch-1`, at: Date.now() });
  await expect(step(page, '取稿：C22').locator('code')).toHaveText(`proofdesk-${id}-fetch-1`);
  await expect(step(page, '取稿：C22').getByRole('link')).toHaveCount(0);
  stub.server(`${book}/${id}/draft`, draft);
  stub.server(`${book}/${id}/fetch/status`, 'done');
  await expect(view(page).locator('.phead .meta')).toContainText('4 段');
  await expect(view(page).locator('#pp-1 .ptext')).toContainText('那枚铜钥匙');
  await expect(view(page).getByRole('button', { name: '删除' })).toHaveCount(0);
});

test('on a phone the items come first and tapping one jumps to its quote', async ({ page }) => {
  const stub = await stubFirebase(page);
  const id = await legacy(page, stub);
  done(stub, id);
  const list = view(page).locator('.plist .pitem');
  await expect(list).toHaveCount(3);
  await expect(items(page).first()).toBeHidden();
  await list.nth(2).click();
  const mark = view(page).locator('#pp-4 mark');
  await expect(mark).toHaveClass(/flash/);
  await expect(mark).toBeInViewport();
  await view(page).locator('[data-back-note]').click(); await expect(list.nth(2)).toBeInViewport();
  await list.nth(2).click(); await mark.click();
  await expect(page.getByRole('textbox', { name: 'P4 正文', exact: true })).toBeFocused();
  await view(page).locator('[data-back-note]').click(); await expect(list.nth(2)).toBeInViewport();
  await view(page).getByRole('button', { name: '历史' }).click();
  await expect(view(page).locator('.side')).toHaveClass(/show/);
  await expect(view(page).locator('.hist-list a')).toContainText('C23 初稿');
});

test('a bad draft is not sent, and deleting asks first', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await stubFirebase(page);
  await page.goto('book/?book=maritime-story&view=proof');
  await view(page).getByRole('button', { name: '发送校稿' }).click();
  await expect(view(page).locator('[data-err]')).toHaveText('先写个标题，如「C23 初稿」。');
  await view(page).getByLabel('标题').fill('C23 初稿');
  await view(page).getByRole('button', { name: '发送校稿' }).click();
  await expect(view(page).locator('[data-err]')).toHaveText('新稿是空的。');
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
      const stub = await stubFirebase(page);
      const shot = async (name: string) => {
        await page.waitForTimeout(400);
        expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
        await page.screenshot({ path: `${env.NOVEL_SHOTS_DIR}/${width}-proof-${name}.png` });
      };
      await page.goto('book/?book=maritime-story&view=proof');
      await view(page).getByLabel('标题').fill('C23 初稿');
      await view(page).getByLabel('新稿').fill(draft);
      await shot('compose');
      const id = await legacy(page, stub);
      sent(stub, id);
      await expect(view(page).locator('.pstatus-head .pst')).toHaveText('已发送');
      await shot('sent');
      done(stub, id);
      await expect(view(page).locator('.pcount')).toBeVisible();
      await shot('record');
      await view(page).locator('.pv').scrollIntoViewIfNeeded();
      await shot('items');
      if (width < 860) {
        await view(page).locator('.plist .pitem').nth(2).click();
        await shot('jump');
      }
    });
  }
});
