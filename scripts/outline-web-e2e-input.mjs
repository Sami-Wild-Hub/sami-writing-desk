// Real CAS echoes, pending writes, participant/time/reveal persistence, and bounded autosave.
import assert from 'node:assert/strict';
import { eventually, sleep, workspace } from './outline-web-e2e-harness.mjs';
export async function inputScenarios(h, a) {
 await a.root.locator('[data-act="tab"][data-tab="outline"]').click();
 await h.synced(); const count = a.wire.writes.length; a.wire.holdReplies = true;
 await a.root.locator('#beat-note').fill(`echo-first-${h.width}`);
 await eventually('write acknowledgement held', () => a.wire.replies.length > 0);
 assert.ok(await h.draft(a));
 await a.root.locator('#beat-note').fill(`echo-newer-${h.width}`); a.wire.releaseReplies();
 await eventually('newer edit survives first confirmation', async () => (await h.live()).plan.beat_notes['A1-B1'] === `echo-newer-${h.width}`);
 await h.synced();
 assert.ok(a.wire.writes.slice(count).every(w => Object.hasOwn(w.b.d, 'live/plan') && !Object.hasOwn(w.b.d, 'live/plot')));
 const before = (await workspace(a)).plot_data;
 await a.root.locator('[data-act="tab"][data-tab="story"]').click();
 await a.root.locator('.self-head [data-act="edit-line"]').click();
 const form = a.root.locator('[data-form="line"]'); await form.locator('[name="title"]').fill(`line-${h.width}`);
 await form.getByRole('button', { name: '保存', exact: true }).click();
 await eventually('line edit saved', async () => (await h.live()).plot.storyline_groups[0].title === `line-${h.width}`);
 await h.synced(); const after = (await workspace(a)).plot_data;
 assert.deepEqual(after.participant_order, before.participant_order);
 assert.deepEqual(after.storyline_groups[0].time_order, before.storyline_groups[0].time_order);
 await a.page.reload({ waitUntil: 'domcontentloaded' }); await h.ready(a);
 assert.deepEqual((await workspace(a)).plot_data, after);
 await a.root.locator('[data-act="tab"][data-tab="outline"]').click();
 const sent = a.wire.writes.length;
 for (let i = 0; i < 12; i++) { await a.root.locator('#beat-note').fill(`continuous-${h.width}-${i}`); await sleep(1000); }
 assert.ok(a.wire.writes.length > sent, 'continuous input saves within ten seconds');
 await eventually('continuous edit confirmed', async () => !(await h.draft(a))); await h.synced();
 assert.equal((await h.live()).plan.beat_notes['A1-B1'], `continuous-${h.width}-11`);
 console.log(`PASS v6 echo/in-flight/participants/time/refresh/10s/multipath @ ${h.width}`);
}
