// Exercise authentic old drafts against real rules and the real watcher.
// Reads: site 5b65c3e and data 79700e3 (JS/JSON)
// Writes: temporary browser, RTDB and git state (JSON/git)
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { button, downloadButton, eventually, files, git, importWorkspace, notice, sleep, workspace } from './outline-web-e2e-harness.mjs';
async function oldFactory(h) {
  const load = async path => import(`data:text/javascript;base64,${Buffer.from(git(h.siteRepo, 'show', `5b65c3e:src/lib/views/outline/${path}.js`)).toString('base64')}`);
  const { createOutlineModel } = await load('model'), { draftStore } = await load('draft');
  return marker => {
    const model = createOutlineModel(h.canonical, h.canonicalPlan);
    if (marker) model.state.beat_notes['A1-B1'] = marker;
    const value = model.exportWorkspace(); assert.equal(Object.hasOwn(value.plan, 'notes'), false);
    const storage = { raw: null, getItem() { return this.raw; }, setItem(_key, raw) { this.raw = raw; } };
    draftStore('legacy', 'e7591b2cdec331f0b2244b5542a99b8cbe926a6acd3987ed3a62d7e692966b0b', storage).save(value);
    return { raw: storage.raw, workspace: value };
  };
}
export async function canonicalRepo(h) {
  await h.synced(); git(h.writer, 'pull', '--quiet', '--ff-only', 'origin', 'main');
  for (const name of Object.values(files)) await writeFile(`${h.writer}/outline/maritime-story/${name}`, git(h.dataRepo, 'show', `79700e3:outline/maritime-story/${name}`));
  git(h.writer, 'add', '.');
  if (git(h.writer, 'diff', '--cached', '--name-only').trim()) {
    git(h.writer, 'commit', '-m', 'Restore canonical acceptance baseline'); git(h.writer, 'push', '--quiet', 'origin', 'HEAD:main');
  }
  await eventually('canonical baseline live', async () => {
    const current = await h.live(); return JSON.stringify(current.plot) === JSON.stringify(h.canonical) && JSON.stringify(current.plan) === JSON.stringify(h.canonicalPlan);
  }); await h.synced();
}
async function legacyConflict(h, make) {
  const conflict = await h.open(make(`legacy-conflict-${h.width}`).raw);
  await notice(conflict, '云端已有新版本');
  const downloaded = await downloadButton(conflict, '下载本机版');
  assert.equal(downloaded.plan.beat_notes['A1-B1'], `legacy-conflict-${h.width}`);
  assert.deepEqual(downloaded.plan.notes, h.canonicalPlan.notes);
  await h.repoEdit('plot', `newest-cloud-${h.width}`, 'E002');
  await eventually('new remote revision arrives', async () => (await h.live()).plot.plot_units.some(row => row.content === `newest-cloud-${h.width}`));
  await sleep(1000); await button(conflict, '载入云端版');
  assert.ok((await workspace(conflict)).plot_data.plot_units.some(row => row.content === `newest-cloud-${h.width}`));
  await importWorkspace(conflict, downloaded); assert.deepEqual((await workspace(conflict)).plan, downloaded.plan);
  await eventually('downloaded legacy import saves', async () => (await h.live()).plan.beat_notes['A1-B1'] === `legacy-conflict-${h.width}`);
  await h.synced();
  const old = make(`import-old-${h.width}`).workspace;
  await importWorkspace(conflict, old); assert.deepEqual((await workspace(conflict)).plan.notes, h.canonicalPlan.notes);
  await conflict.root.locator('#import-plan').setInputFiles({ name: 'old-plan.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(old.plan)) });
  await eventually('old plan imported', async () => (await conflict.root.locator('#status').textContent()).includes('old-plan.json'));
  assert.deepEqual((await workspace(conflict)).plan.notes, h.canonicalPlan.notes);
  await eventually('old imported draft confirmed', async () => !(await h.draft(conflict))); await h.synced();
  await conflict.context.close();
}
export async function legacyScenarios(h) {
  await canonicalRepo(h);
  const make = await oldFactory(h), before = await h.live(), commit = h.main();
  const unchanged = await h.open(make().raw);
  await eventually('unchanged old draft removed', async () => !(await h.draft(unchanged))); await sleep(12_000);
  assert.equal((await h.live()).state.live.rev, before.state.live.rev);
  assert.equal(h.main(), commit); assert.equal(unchanged.wire.writes.length, 0); await unchanged.context.close();
  const marker = `legacy-edited-${h.width}`, changed = await h.open(make(marker).raw);
  await eventually('changed legacy draft reaches cloud', async () => (await h.live()).plan.beat_notes['A1-B1'] === marker); await h.synced();
  assert.deepEqual(h.mainFile(files.plot), h.canonical);
  assert.deepEqual(h.mainFile(files.plan), { ...h.canonicalPlan, beat_notes: { ...h.canonicalPlan.beat_notes, 'A1-B1': marker } });
  assert.deepEqual((await workspace(changed)).plan.notes, h.canonicalPlan.notes);
  assert.equal(await changed.root.locator('.draft-notice').filter({ hasText: '云端已有新版本' }).count(), 0); await changed.context.close();
  await legacyConflict(h, make);
  const raw = await h.open(JSON.stringify({ revision: 123, workspace: make().workspace }));
  await notice(raw, '本地草稿未能读取'); const exported = await downloadButton(raw, '导出原始草稿');
  await importWorkspace(raw, exported); assert.deepEqual((await workspace(raw)).plan.notes, h.canonicalPlan.notes);
  await eventually('raw export import confirmed', async () => !(await h.draft(raw))); await h.synced(); await raw.context.close();
}
