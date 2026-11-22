// Verify optimistic SDK echoes, in-flight edits, active inputs and bounded autosave.
import assert from 'node:assert/strict';
import { button, downloadButton, editUnit, eventually, files, notice, sleep, workspace } from './outline-web-e2e-harness.mjs';

async function echoes(h, a) {
  await h.synced(); const count = a.wire.writes.length; a.wire.holdReplies = true;
  await a.root.locator('#beat-note').fill(`echo-first-${h.width}`);
  await eventually('write acknowledgement held', () => a.wire.replies.length > 0);
  assert.ok(await h.draft(a)); assert.equal(await a.root.locator('#sync-state').textContent(), '未保存到云端');
  await a.root.locator('#beat-note').fill(`echo-newer-${h.width}`);
  await a.root.locator('[data-edit-field="unit"][data-id="E001"]').first().click();
  await a.root.locator('.inline-editor textarea').fill(`unfinished-${h.width}`);
  a.wire.releaseReplies();
  await eventually('newer edit saved after first confirmation', async () => (await h.live()).plan.beat_notes['A1-B1'] === `echo-newer-${h.width}`);
  assert.equal(await a.root.locator('.inline-editor textarea').inputValue(), `unfinished-${h.width}`);
  await a.root.locator('.inline-editor textarea').press('Escape');
  const writes = a.wire.writes.slice(count);
  assert.ok(writes.length >= 2); assert.ok(writes.every(request => Object.hasOwn(request.b.d, 'live/plan') && !Object.hasOwn(request.b.d, 'live/plot')));
  await h.synced();
}
async function activeInput(h, a) {
  await a.root.locator('[data-edit-field="unit"][data-id="E001"]').first().click();
  await a.root.locator('.inline-editor textarea').fill(`preserved-inline-${h.width}`);
  const state = await h.db(h.bookPath);
  await h.put(`${h.bookPath}/head`, { ...state.head, repo: { ...state.head.repo, at: Date.now() } });
  await sleep(700); assert.equal(await a.root.locator('.inline-editor textarea').inputValue(), `preserved-inline-${h.width}`);
  await h.repoEdit('plan', `remote-input-${h.width}`);
  await notice(a, '云端已有新版本');
  assert.ok(JSON.parse(await h.draft(a)).workspace.plot_data.plot_units.some(row => row.content === `preserved-inline-${h.width}`));
  await button(a, '用本机版覆盖'); await eventually('inline conflict confirmed', async () => !(await h.draft(a))); await h.synced();
}
async function repositoryChoiceDuringEdit(h, a) {
  await editUnit(a, 'E001', `local-before-choice-${h.width}`);
  await eventually('local side of conflict saved', async () => (await h.live()).plot.plot_units.some(row => row.content === `local-before-choice-${h.width}`));
  await h.repoEdit('plot', `repo-during-choice-${h.width}`); await notice(a, '仓库有新版');
  a.wire.holdReplies = true; await button(a, '用仓库版');
  await eventually('repository choice awaits acknowledgement', () => a.wire.replies.length > 0);
  await a.root.locator('#beat-note').fill(`newer-during-choice-${h.width}`);
  a.wire.releaseReplies();
  // The chosen repository version stays until the editor decides about the newer edit, also across a reload.
  const chosen = value => value.plot_units.some(row => row.content === `repo-during-choice-${h.width}`);
  for (const reload of [false, true]) {
    if (reload) { await a.page.reload({ waitUntil: 'domcontentloaded' }); await h.ready(a); }
    await notice(a, '云端已有新版本'); await sleep(13_000);
    assert.ok(chosen((await h.live()).plot)); assert.ok(chosen(h.mainFile(files.plot)));
    assert.notEqual((await h.live()).plan.beat_notes?.['A1-B1'], `newer-during-choice-${h.width}`);
  }
  assert.equal((await downloadButton(a, '下载本机版')).plan.beat_notes['A1-B1'], `newer-during-choice-${h.width}`);
  await button(a, '载入云端版');
  await eventually('chosen repository version in editor', async () => chosen((await workspace(a)).plot_data));
  assert.ok(!(await h.draft(a))); await h.synced();
}
async function continuousInput(h, a) {
  const start = Date.now(), count = a.wire.writes.length;
  for (let i = 0; i < 12; i++) { await a.root.locator('#beat-note').fill(`continuous-${h.width}-${i}`); await sleep(900); }
  assert.ok(a.wire.writes.length > count, 'continuous edits must write within ten seconds');
  assert.ok(a.wire.writes[count].sentAt - start <= 10_750, 'first pending edit starts the ten-second deadline');
  assert.ok(Date.now() - start < 13_000);
  await eventually('last continuous edit confirmed', async () => !(await h.draft(a)));
  assert.equal((await h.live()).plan.beat_notes['A1-B1'], `continuous-${h.width}-11`);
  await h.synced();
  await eventually('coordinator status is online', async () => (await a.root.locator('#sync-state').textContent()).includes('已入库'));
  // Verify the online coordinator is displayed while the confirmed edit awaits publication.
  await a.root.locator('#beat-note').fill(`online-${h.width}`);
  await eventually('pending repo displays coordinator', async () => (await a.root.locator('#sync-state').textContent()).includes('同步程序在线'));
  await h.synced();
  assert.equal(h.mainFile(files.plan).beat_notes['A1-B1'], `online-${h.width}`);
}
export async function inputScenarios(h, a) {
  await echoes(h, a); await repositoryChoiceDuringEdit(h, a); await activeInput(h, a); await continuousInput(h, a);
  console.log(`PASS echo/in-flight/inline/head-only/10s/multipath/status @ ${h.width}`);
}
