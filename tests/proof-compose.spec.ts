// Chapter-first Drive form, live title suggestions and editor ownership of the title.
import { expect, test } from '@playwright/test';
import { stubFirebase, watchErrors } from './stub.ts';

const book = '/households/novel-stub-house/proofdesk/maritime-story';
const history = (title: string, fetchStatus = 'done') => ({
  id: '20261120-120000-abcd', title, createdAt: 1, updatedAt: 1, source: 'drive',
  driveName: 'C22', status: 'failed', fetch: { status: fetchStatus },
  checks: { manuscript: { status: 'failed' }, open: { status: 'failed' } },
});

test('Drive starts with chapter; aliases, late history, manual titles and clearing work', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const errors = watchErrors(page);
  const stub = await stubFirebase(page);
  await page.goto('book/?book=maritime-story&view=proof');
  const form = page.locator('[data-view="proof"]');
  await form.getByRole('button', { name: '从 Drive 取' }).click();
  await expect(form.locator('input[type=text]').first()).toHaveAttribute('name', 'driveName');
  const chapter = form.getByLabel('章节', { exact: true });
  const title = form.getByLabel('标题', { exact: true });
  for (const alias of ['22', 'c22', '第22章', '22章', '第二十二章']) {
    await chapter.fill(alias);
    await expect(title).toHaveValue('C22 第1稿');
  }
  stub.server(`${book}/20261120-120000-abcd`, history('C22 初稿'));
  await expect(title).toHaveValue('C22 第2稿');
  await title.fill('编辑自定标题');
  await chapter.fill('23');
  stub.server(`${book}/20261120-120000-abcd`, history('C23 第7稿'));
  await expect(title).toHaveValue('编辑自定标题');
  await title.fill('');
  await expect(title).toHaveValue('C23 第8稿');
  await chapter.fill('22');
  stub.server(`${book}/20261120-120000-abcd`, history('C22 第4稿'));
  await expect(title).toHaveValue('C22 第5稿');
  stub.server(`${book}/20261119-120000-abcd`, { ...history('C22 第99稿', 'failed'), id: '20261119-120000-abcd' });
  await expect(title).toHaveValue('C22 第5稿');
  await form.getByRole('button', { name: '发送校稿' }).click();
  await expect(form.locator('.phead h2')).toHaveText('C22 第5稿');
  const id = new URL(page.url()).searchParams.get('doc')!;
  expect(stub.at(`${book}/${id}`)).toMatchObject({ title: 'C22 第5稿', driveName: 'C22', source: 'drive' });
  await form.getByRole('link', { name: '＋ 新校稿' }).click();
  await form.getByLabel('章节', { exact: true }).fill('22');
  await expect(form.getByLabel('标题', { exact: true })).toHaveValue('C22 第6稿');
  await form.getByLabel('章节', { exact: true }).fill('番外：海边');
  await expect(form.getByLabel('标题', { exact: true })).toHaveValue('番外：海边 第1稿');
  await form.getByRole('button', { name: '发送校稿' }).click();
  await expect(form.locator('.phead h2')).toHaveText('番外：海边 第1稿');
  const extra = new URL(page.url()).searchParams.get('doc')!;
  expect(stub.at(`${book}/${extra}/driveName`)).toBe('番外：海边');
  expect(errors).toEqual([]);
});
