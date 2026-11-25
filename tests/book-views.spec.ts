import { expect, test, type Page } from '@playwright/test';
import { stubFirebase, watchErrors } from './stub.ts';

// Signed-in book page behaviour against the stubbed Firebase in tests/stub.ts.
const doc = (page: Page) => page.locator('[data-view="reader"] .doc');
const title = (page: Page) => doc(page).locator('.doc-head h1');
const tab = (page: Page, name: '阅读' | '时间线' | '人物') => page.locator('#novel-views').getByRole('link', { name });
const expectUrl = (page: Page, params: Record<string, string>, hash = '') => expect.poll(() => {
  const url = new URL(page.url());
  return { ...Object.fromEntries(url.searchParams), hash: decodeURIComponent(url.hash) };
}).toEqual({ ...params, hash });

test('signed out, a configured book page reads nothing from the novel archive', async ({ page }) => {
  const reads = await stubFirebase(page, { signedIn: false });
  await page.goto('book/?book=maritime-story&view=timeline');
  await expect(page.locator('#novel-sign-in')).toBeVisible();
  await expect(page.locator('#novel-book-title')).toHaveText('Maritime Story');
  await expect(page.locator('#novel-app')).toBeHidden();
  await expect(page.locator('#novel-app')).toBeEmpty();
  await expect(page.locator('#novel-views')).toBeHidden();
  expect(reads.filter((path) => path.includes('novelArchive'))).toEqual([]);
});

test('direct links and refresh open the named book, page and paragraph', async ({ page }) => {
  const errors = watchErrors(page);
  await stubFirebase(page);
  await page.goto('book/?book=second-book&doc=source%2FC2.md#p9');
  await expect(title(page)).toHaveText('第2章');
  await expect(page.locator('#novel-book-title')).toHaveText('Second Book');
  await expect(doc(page).locator('[id="p9"]')).toBeInViewport();
  await expect(tab(page, '阅读')).toHaveAttribute('aria-current', 'page');
  await page.reload();
  await expect(title(page)).toHaveText('第2章');
  await expect(doc(page).locator('[id="p9"]')).toBeInViewport();
  await expect(doc(page).locator('[id="p9"] .pn')).toHaveText('9');
  await expect(page.locator('[data-view="timeline"]')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('reader links read as names, show a preview and offer the way back', async ({ page }) => {
  await stubFirebase(page);
  await page.goto('book/?book=maritime-story');
  await expectUrl(page, { book: 'maritime-story', doc: 'INDEX.md' });
  await expect(title(page)).toHaveText('故事知识库');
  const card = doc(page).locator('.cards a').filter({ hasText: 'Ann' });
  await expect(card).toContainText('主角');
  await card.click();
  await expectUrl(page, { book: 'maritime-story', doc: 'owners/CHARACTER/CH-Ann/START_HERE.md' });
  await expect(title(page)).toHaveText('Ann');
  await expect(doc(page).locator('.subtabs [aria-current="page"]')).toHaveText('起点');
  await expect(page.locator('#novel-back')).toHaveText('返回 故事知识库');
  await page.locator('#novel-back').click();
  await expectUrl(page, { book: 'maritime-story', doc: 'INDEX.md' });
  await expect(page.locator('#novel-back')).toBeHidden();

  await page.goto('book/?book=maritime-story&doc=events%2FE-9002.md');
  await expect(title(page)).toHaveText('约定');
  const person = doc(page).locator('.prose a.ent').first();
  await expect(person).toHaveText('Ann');
  await person.hover();
  await expect(page.locator('.peek')).toContainText('Ann');
  await expect(page.locator('.peek')).toContainText('的简介');
  await expect(doc(page).locator('.pager .prev')).toContainText('相遇');
  await expect(doc(page).locator('.doc-meta a.pill.accent')).toHaveText('在时间线中定位 →');
});

test('paragraph links, search and reading settings', async ({ page }) => {
  await stubFirebase(page);
  await page.goto('book/?book=maritime-story&doc=source%2FC2.md');
  await expect(title(page)).toHaveText('第2章');
  await doc(page).locator('[id="p5"] .pn').click();
  await expectUrl(page, { book: 'maritime-story', doc: 'source/C2.md' }, '#p5');
  await expect(doc(page).locator('[id="p5"]')).toHaveClass(/flash/);
  await expect(page.locator('.rail .box')).toContainText('约定');

  await page.keyboard.press('/');
  await page.locator('#novel-search').fill('约定');
  await page.locator('#novel-results .hit').first().click();
  await expectUrl(page, { book: 'maritime-story', doc: 'events/E-9002.md' });
  await expect(title(page)).toHaveText('约定');
  await expect(page.locator('#novel-back')).toHaveText('返回 第2章');

  const font = () => page.evaluate(() => document.documentElement.style.getPropertyValue('--read-font'));
  expect(await font()).toBe('var(--sans)');
  await doc(page).locator('[data-aa]').click();
  await page.locator('.aa-pop').getByRole('button', { name: '宋体' }).click();
  expect(await font()).toBe('var(--serif)');
  await page.reload();
  await expect(title(page)).toHaveText('约定');
  expect(await font()).toBe('var(--serif)');
});

const tl = (page: Page) => page.locator('[data-view="timeline"] .tlv');
const row = (page: Page, text: string) => tl(page).locator('.row').filter({ hasText: text });

test('timeline cards lead to the source and back, densities keep the place', async ({ page }) => {
  const errors = watchErrors(page);
  await stubFirebase(page);
  await page.goto('book/?book=maritime-story&view=timeline');
  await expect(tab(page, '时间线')).toHaveAttribute('aria-current', 'page');
  await expect(tl(page).locator('.row')).toHaveCount(4);
  await expect(tl(page).locator('.strip .chip2.axis')).toContainText('Ann·Bo');
  await expect(row(page, '后见')).toContainText('#9004');
  await expect(tl(page).locator('[data-z]')).toHaveText(['总览', '紧凑', '标准']);
  await expect(tl(page).locator('[data-z="1"]')).toHaveAttribute('aria-pressed', 'true');

  await row(page, '后见').click();
  const card = tl(page).locator('.card');
  await expect(card.locator('h4')).toHaveText('独行');
  await expect(card.locator('.acts a.btn.primary')).toHaveText('打开事件页');
  await card.locator('a.loc').click();
  await expectUrl(page, { book: 'maritime-story', doc: 'source/C2.md' }, '#p9');
  await expect(doc(page).locator('[id="p9"]')).toBeInViewport();
  await expect(page.locator('#novel-back')).toHaveText('返回 时间线');
  await page.locator('#novel-back').click();
  await expectUrl(page, { book: 'maritime-story', view: 'timeline' });
  await expect(tl(page).locator('.card h4')).toHaveText('独行');

  await tl(page).locator('[data-z="0.4"]').click();
  await expect(tl(page).locator('.tl')).toHaveClass(/overview/);
  await expect(tl(page).locator('.card')).toHaveCount(0);
  await tl(page).locator('[data-z="1"]').click();
  await expect(tl(page).locator('.tl')).not.toHaveClass(/overview/);

  await tl(page).locator('.find input').fill('告别');
  await expect(tl(page).locator('.find .cnt')).toHaveText('1/1');
  await expect(row(page, '告别')).toHaveClass(/cur/);
  expect(errors).toEqual([]);
});

const ppl = (page: Page) => page.locator('[data-view="people"] .ppl');
const person = (page: Page, name: string) => ppl(page).locator('tr.person').filter({ has: page.getByRole('button', { name }) });

test('the people table searches, filters, expands and leads to the source and back', async ({ page }) => {
  const errors = watchErrors(page);
  await stubFirebase(page);
  await page.goto('book/?book=maritime-story');
  await tab(page, '人物').click();
  await expectUrl(page, { book: 'maritime-story', view: 'people', doc: 'INDEX.md' });
  await expect(tab(page, '人物')).toHaveAttribute('aria-current', 'page');
  await expect(ppl(page).locator('tr.person')).toHaveCount(3);
  await expect(ppl(page).locator('.cnt')).toHaveText('3 人');
  const ann = person(page, 'Ann');
  await expect(ann.locator('[data-label="称呼/别名"]')).toContainText('阿安（Cy）');
  await expect(ann.locator('[data-label="所属"]')).toHaveText('Crew');
  await expect(ann.locator('[data-label="首次出现"] a.loc')).toHaveText('1·2');
  await expect(ann.locator('[data-label="首次出现"] a.loc')).toHaveAttribute('title', '第1章·2段');
  await expect(ann.locator('[data-label="当前状态"]')).toHaveText('在码头等 Cy');
  await expect(ann.locator('.hk')).toHaveText(['体貌左眉有疤一见1·2', '声音说话说话慢阶段：春2·5']);
  await expect(person(page, 'Dee').locator('.kind')).toHaveText('简档');
  await expect(person(page, 'Dee').locator('[data-label="主要关系"] a')).toHaveCount(0);

  await ppl(page).locator('.find input').fill('阿安');
  await expect(ppl(page).locator('tr.person')).toHaveCount(1);
  await expect(ppl(page).locator('.cnt')).toHaveText('1 / 3 人');
  await expect(ann.locator('mark')).toHaveText('阿安');
  await ppl(page).locator('.find input').fill('');
  await ppl(page).locator('.chips [data-filter="GR-Crew"]').click();
  await expect(ppl(page).locator('tr.person')).toHaveCount(2);
  await ppl(page).locator('.chips [data-filter="*entries"]').click();
  await expect(ppl(page).locator('tr.person')).toHaveCount(1);

  await ann.getByRole('button', { name: 'Ann' }).click();
  const detail = ppl(page).locator('tr.detail');
  await expect(detail.locator('h3')).toHaveText('Ann');
  await expect(detail.locator('h4')).toHaveText(['称呼 1 条', '外在与言行 2 条']);
  await expect(detail.locator('dd ul li')).toHaveText(['在码头等 Cy', '还没定约']);
  await detail.locator('table.evt [data-label="出处"] a.loc').last().click();
  await expectUrl(page, { book: 'maritime-story', doc: 'source/C2.md' }, '#p5');
  await expect(doc(page).locator('[id="p5"]')).toBeInViewport();
  await expect(page.locator('#novel-back')).toHaveText('返回 人物');
  await page.locator('#novel-back').click();
  await expectUrl(page, { book: 'maritime-story', view: 'people', doc: 'INDEX.md' });
  await expect(ppl(page).locator('tr.detail h3')).toHaveText('Ann');
  await expect(ppl(page).locator('.chips [aria-pressed="true"]')).toContainText('有称呼外貌');

  await ppl(page).locator('tr.detail').getByRole('link', { name: '打开 KB 档案' }).click();
  await expectUrl(page, { book: 'maritime-story', doc: 'owners/CHARACTER/CH-Ann/START_HERE.md' });
  await expect(title(page)).toHaveText('Ann');
  await page.goBack();
  await ppl(page).locator('tr.detail').getByRole('button', { name: '收起' }).click();
  await expect(ppl(page).locator('tr.detail')).toHaveCount(0);

  await page.goto('book/?book=second-book&view=people');
  await expect(page.locator('[data-view="people"] .ppl-empty')).toHaveText('这本书的人物表尚未同步。');
  expect(errors).toEqual([]);
});

test('on a phone the people rows are cards and 所属 is in the drawer', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await stubFirebase(page);
  await page.goto('book/?book=maritime-story&view=people');
  await expect(ppl(page).locator('tr.person')).toHaveCount(3);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  await expect(ppl(page).locator('thead')).toBeHidden();
  await page.locator('.bar [data-drawer]').click();
  await ppl(page).locator('.side a.navlink[data-filter="*none"]').click();
  await expect(ppl(page).locator('.side')).not.toHaveClass(/show/);
  await expect(ppl(page).locator('tr.person')).toHaveCount(1);
  await expect(person(page, 'Cy')).toBeVisible();
});

test('reader links locate a point or a line, and each book keeps its own timeline', async ({ page }) => {
  await stubFirebase(page);
  await page.goto('book/?book=maritime-story&doc=events%2FE-9002.md');
  await doc(page).locator('.doc-meta a.pill.accent').click();
  await expectUrl(page, { book: 'maritime-story', view: 'timeline', doc: 'events/E-9002.md' }, '#p-E-9002@定约');
  await expect(tl(page).locator('.row.cur')).toContainText('定下约定');
  await expect(tl(page).locator('.card h4')).toHaveText('约定 · 定约');
  await expect(page.locator('#novel-back')).toHaveText('返回 约定');

  await tab(page, '阅读').click();
  await expect(title(page)).toHaveText('约定');
  await page.locator('.bar [data-drawer]').click();
  await page.locator('.toc details[data-domain="LOCATION"] summary').click();
  await page.locator('.toc a.navlink[href*="LOC-Dock"]').click();
  await expect(title(page)).toHaveText('Dock');
  await doc(page).getByRole('link', { name: '在时间线中看这条线 →' }).click();
  await expect(page.locator('.toast')).toHaveText('已显示线路：码头');
  await expect(tl(page).locator('[data-o="LOC-Dock"]')).toBeChecked();
  await expect(tl(page).locator('.card h4')).toHaveText('约定 · 定约');

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.locator('.bar .book').click();
  await page.locator('#novel-book-menu a[data-book-slug="second-book"]').click();
  await expectUrl(page, { book: 'second-book', view: 'timeline' });
  await expect(tl(page).locator('.strip .chip2.axis')).toContainText('第二本');
  await expect(tl(page).locator('.card')).toHaveCount(0);
  await page.goBack();
  await expectUrl(page, { book: 'maritime-story', view: 'timeline', doc: 'owners/LOCATION/LOC-Dock/START_HERE.md' }, '#line-LOC-Dock');
  await expect(tl(page).locator('.strip .chip2.axis')).toContainText('Ann·Bo');
  await expect(tl(page).locator('.card h4')).toHaveText('约定 · 定约');
  await tab(page, '阅读').click();
  await expect(title(page)).toHaveText('Dock');
});
