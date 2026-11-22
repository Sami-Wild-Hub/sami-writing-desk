// Real browser acceptance orchestration; core SDK/RTDB behavior is never stubbed.
import assert from 'node:assert/strict';
import { button, downloadButton, editUnit, eventually, files, git, harness, importWorkspace, notice, restore, sleep, workspace } from './outline-web-e2e-harness.mjs';
import { legacyScenarios } from './outline-web-e2e-legacy.mjs';
import { inputScenarios } from './outline-web-e2e-input.mjs';

async function webToRepo(h, a, b) {
  await editUnit(a, 'E001', `web-${h.width}-1`);
  await eventually('web edit reaches second page', async () => (await b.root.locator('[data-edit-field="unit"][data-id="E001"]').first().textContent()).includes(`web-${h.width}-1`));
  await h.synced();
  assert.ok(h.mainFile(files.plot).plot_units.some(row => row.content === `web-${h.width}-1`));
  assert.match(git(h.remote, 'show', '-s', '--format=%B', 'main'), /Outline-Sync:/);
}
async function repoToWeb(h, a, b) {
  await h.repoEdit('plot', `repo-${h.width}-2`, 'E002');
  await eventually('repo edit reaches both pages', async () => {
    const outputs = await Promise.all([workspace(a), workspace(b)]);
    return outputs.every(value => value.plot_data.plot_units.some(row => row.content === `repo-${h.width}-2`));
  });
}
async function repoConflicts(h, a) {
  for (const useRepo of [false, true]) {
    const marker = `web-conflict-${useRepo}-${h.width}`;
    await editUnit(a, 'E001', marker);
    await eventually('web conflict side saved', async () => (await h.live()).plot.plot_units.some(row => row.content === marker));
    await h.repoEdit('plot', `repo-conflict-${useRepo}-${h.width}`); await notice(a, '仓库有新版');
    const tip = h.main(); await button(a, useRepo ? '用仓库版' : '保留网页版'); await h.synced();
    const expected = useRepo ? `repo-conflict-true-${h.width}` : marker;
    await eventually('resolved content in editor', async () => (await workspace(a)).plot_data.plot_units.some(row => row.content === expected));
    if (useRepo) {
      assert.equal(h.main(), tip); assert.equal(await a.root.locator('#undo').isDisabled(), true);
      const kept = await downloadButton(a, '下载被替换的版本');
      assert.equal(kept.plot_data.plot_units.find(row => row.unit_id === 'E001').content, marker);
      await importWorkspace(a, kept); await eventually('kept import confirmed', async () => !(await h.draft(a))); await h.synced();
    } else assert.notEqual(h.main(), tip);
  }
}
async function browserConflicts(h, a, b) {
  for (const overwrite of [true, false]) {
    await h.synced(); await sleep(1000);
    const one = `writer-one-${overwrite}-${h.width}`, two = `writer-two-${overwrite}-${h.width}`;
    const count = b.wire.writes.length; b.wire.holdWrites = true;
    await b.root.locator('#beat-note').fill(two);
    await eventually('second browser sends actual SDK CAS', () => b.wire.writes.length > count); assert.ok(await h.draft(b));
    await a.root.locator('#beat-note').fill(one);
    await eventually('first writer confirmed', async () => (await h.live()).plan.beat_notes['A1-B1'] === one);
    b.wire.releaseWrites(); await notice(b, '云端已有新版本');
    assert.equal(b.wire.responses.at(-1).b.s, 'permission_denied');
    assert.equal(JSON.parse(await h.draft(b)).workspace.plan.beat_notes['A1-B1'], two);
    await button(b, overwrite ? '用本机版覆盖' : '载入云端版');
    await eventually('browser choice applied', async () => (await workspace(b)).plan.beat_notes['A1-B1'] === (overwrite ? two : one));
    if (overwrite) {
      await eventually('local overwrite confirmed', async () => (await h.live()).plan.beat_notes['A1-B1'] === two);
      const kept = await downloadButton(b, '下载被替换的版本'); assert.equal(kept.plan.beat_notes['A1-B1'], one);
    }
    await h.synced();
  }
}
async function restoreUndo(h, a) {
  const before = await workspace(a); await restore(a);
  await eventually('starter restored', async () => (await h.live()).plot.plot_units.find(row => row.unit_id === 'E001').content === h.canonical.plot_units.find(row => row.unit_id === 'E001').content);
  await a.root.locator('#undo').click(); assert.deepEqual((await workspace(a)).plot_data, before.plot_data);
  await eventually('undo confirmed', async () => !(await h.draft(a))); await h.synced();
}
async function offline(h, a) {
  await h.synced(); a.wire.holdWrites = true; await editUnit(a, 'E001', `offline-${h.width}`);
  await eventually('offline draft stored', async () => (await h.draft(a))?.includes(`offline-${h.width}`)); const persisted = await h.draft(a);
  a.wire.offline = true;
  await a.page.reload({ waitUntil: 'domcontentloaded' }); assert.equal(await h.draft(a), persisted);
  a.wire.offline = false; a.wire.holdWrites = false;
  await a.page.reload({ waitUntil: 'domcontentloaded' }); await h.ready(a);
  await eventually('offline edit recovered in editor', async () => (await workspace(a)).plot_data.plot_units.some(row => row.content === `offline-${h.width}`));
  await eventually('offline draft confirmed', async () => !(await h.draft(a))); await h.synced();
  assert.ok(h.mainFile(files.plot).plot_units.some(row => row.content === `offline-${h.width}`));
}
async function invalidRepo(h, a) {
  await h.repoEdit('plot', 42); await notice(a, '仓库版本无效');
  assert.ok((await h.live()).plot.plot_units.some(row => row.content === `offline-${h.width}`));
  await button(a, '用网页版修复'); await h.synced();
  await eventually('invalid repository repaired', async () => !(await h.db(`${h.bookPath}/head/repo/error`)));
  assert.ok(h.mainFile(files.plot).plot_units.some(row => row.content === `offline-${h.width}`));
}
export async function runScenario(options) {
  const h = await harness(options), reports = [];
  const selected = process.env.OUTLINE_E2E_CASES?.split(',');
  const run = async (number, name, action) => {
    if (selected && !selected.includes(String(number))) return;
    try { await action(); const line = `PASS ${number} ${name} @ ${h.width}`; reports.push(line); console.log(line); }
    catch (error) {
      console.log(`FAIL ${number} ${name} @ ${h.width}`);
      for (const p of h.panels.filter(p => !p.page.isClosed())) console.error(JSON.stringify({ status: await p.root.locator('#status').textContent(), sync: await p.root.locator('#sync-state').textContent(), notice: await p.root.locator('.draft-notice').allTextContents(), errors: p.errors, writes: p.wire.writes.map(w => ({ base: w.b.d['live/base'], rev: w.b.d['live/rev'] })), responses: p.wire.responses }));
      throw error;
    }
  };
  try {
    const a = await h.open(), b = await h.open();
    await run(1, 'web -> browser -> main', () => webToRepo(h, a, b));
    await run(2, 'main -> both browsers', () => repoToWeb(h, a, b));
    await run(3, 'conflict keep-web/use-repo/kept', () => repoConflicts(h, a));
    await run(4, 'CAS rejection and both browser choices', () => browserConflicts(h, a, b));
    await run(5, 'restore starter and undo', () => restoreUndo(h, a));
    if (!selected || selected.includes('input')) await inputScenarios(h, a);
    await run(6, 'offline edit/refresh/reconnect', () => offline(h, a));
    await run(8, 'invalid repo reason and web repair', () => invalidRepo(h, a));
    await a.context.close(); await b.context.close();
    await run(7, 'legacy 5b65c3e unchanged/edited/conflict/download/import', () => legacyScenarios(h));
    return reports;
  } finally { await h.close(); }
}
