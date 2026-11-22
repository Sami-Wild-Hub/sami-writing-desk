// Exercises the real outline page against the emulator and a live outline watcher.
// Reads: sibling data repo and temporary RTDB/git environment.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { pack, unpack } from '../src/lib/views/outline/codec.js';

const slug = 'maritime-story';
const files = { plot: 'plot-data.json', plan: 'placements.json' };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const clone = value => structuredClone(value);
const git = (cwd, ...args) => execFileSync('git', ['-C', cwd, '-c', 'core.autocrlf=false', ...args], { encoding: 'utf8', maxBuffer: 20e6 });

function jwt(sub, email) {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'none', type: 'JWT' })}.${encode({ iss: 'https://securetoken.google.com/demo-outline', aud: 'demo-outline', iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600, auth_time: Math.floor(Date.now() / 1000), sub, user_id: sub, email, email_verified: true, firebase: { sign_in_provider: 'google.com', identities: { 'google.com': ['test'] } } })}.`;
}

const revision = seed => `${seed}${Math.random().toString(36).slice(2)}`.replace(/[^0-9a-z]/g, '').slice(0, 12).padEnd(12, '0');

export async function runScenario({ root, siteRepo, dataRepo, baseURL, width, port }) {
  const browser = await chromium.launch({ headless: true });
  const dbBase = `http://127.0.0.1:${port}/households/h/`;
  const admin = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
  const db = async (path, options = {}) => {
    const response = await fetch(`${dbBase}${path.replace(/^\//, '')}.json?ns=demo-outline`, { headers: admin, ...options });
    if (!response.ok) throw new Error(`RTDB ${options.method ?? 'GET'} ${path}: ${response.status} ${await response.text()}`);
    return response.status === 204 ? null : response.json();
  };
  const put = (path, value) => db(path, { method: 'PUT', body: JSON.stringify(value) });
  const bookPath = `outlineSync/${slug}`;
  const remote = `${root}/remote.git`;
  const writer = `${root}/writer`;
  const authKey = 'firebase:authUser:demo-outline-key:family-hub-demo-outline';
  const token = jwt('web-user', 'reader@example.com');
  const user = {
    uid: 'web-user', email: 'reader@example.com', emailVerified: true, isAnonymous: false,
    providerData: [{ providerId: 'google.com', uid: 'google-reader', email: 'reader@example.com', displayName: null, phoneNumber: null, photoURL: null }],
    stsTokenManager: { refreshToken: 'test-refresh', accessToken: token, expirationTime: Date.now() + 3_600_000 },
    createdAt: '1', lastLoginAt: '1', apiKey: 'demo-outline-key', appName: 'family-hub-demo-outline',
  };
  const configureAuth = async page => {
    await page.route(/identitytoolkit\.googleapis\.com/, route => route.fulfill({ json: { users: [{ localId: 'web-user', email: 'reader@example.com', emailVerified: true, providerUserInfo: [{ providerId: 'google.com', rawId: 'google-reader', email: 'reader@example.com' }] }] } }));
    await page.route(/securetoken\.googleapis\.com/, route => route.fulfill({ json: { id_token: token, refresh_token: 'test-refresh', expires_in: '3600' } }));
  };

  const canonical = JSON.parse(git(dataRepo, 'show', 'origin/main:outline/maritime-story/plot-data.json'));
  const canonicalPlan = JSON.parse(git(dataRepo, 'show', 'origin/main:outline/maritime-story/placements.json'));
  await put('novelArchive', { catalog: { [slug]: { title: 'Maritime Story', scope: 'canonical' } }, books: { [slug]: { manifest: { title: 'Maritime Story', scope: 'canonical', entries: { index: { path: 'INDEX.md', title: 'Maritime Story', section: 'canonical' } } } } } });
  await put('settings', { enrollmentOpen: false });
  await put('members/web-user', { email: 'reader@example.com' });
  await assertEventually('watcher initializes the canonical outline', async () => Boolean(await db(bookPath)), 60_000);
  const initial = await db(bookPath);
  assert.ok(initial?.starter?.plot && initial?.starter?.plan, 'watcher did not initialize the canonical outline');
  const starter = { plot: initial.starter.plot, plan: initial.starter.plan };
  const starterData = JSON.parse(await unpack(starter.plot));
  const starterPlan = JSON.parse(await unpack(starter.plan));
  const initialWorkspace = { schema_version: '5.0', format: 'maritime-outline-workspace', plot_data: canonical, plan: canonicalPlan, active_beat: canonical.beats?.[0]?.beat_id };

  const contexts = [];
  const openPage = async () => {
    const context = await browser.newContext({ viewport: { width, height: 844 } });
    contexts.push(context);
    await context.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), { key: authKey, value: user });
    const page = await context.newPage();
    await configureAuth(page);
    const errors = [];
    page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
    page.on('console', message => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
    await page.goto(`${baseURL}/book/?book=${slug}&view=outline`);
    const rootNode = page.locator('[data-view="outline"]');
    try { await rootNode.waitFor({ state: 'attached', timeout: 30_000 }); }
    catch (error) { throw new Error(`outline root missing: ${error.message}; url=${page.url()} body=${(await page.locator('body').innerText()).slice(0, 1200)} errors=${errors.join(' | ')}`); }
    await assertEventually('page loaded', async () => /\d+ \/ \d+/.test(await rootNode.locator('#overall').textContent()));
    return { context, page, root: rootNode };
  };
  const page1 = await openPage();
  const page2 = await openPage();
  const liveFiles = async () => {
    const state = await db(bookPath);
    return { state, plot: state?.live?.plot ? JSON.parse(await unpack(state.live.plot)) : null, plan: state?.live?.plan ? JSON.parse(await unpack(state.live.plan)) : null };
  };
  const mainFile = name => JSON.parse(git(remote, 'show', `main:outline/${slug}/${name}`));
  const workspace = async page => {
    const ready = page.waitForEvent('download');
    await page.locator('#export-workspace').click();
    const download = await ready;
    const stream = await download.createReadStream();
    const chunks = []; for await (const chunk of stream) chunks.push(chunk);
    return JSON.parse(Buffer.concat(chunks).toString());
  };
  const editUnit = async (page, id, value) => {
    const rootNode = page.locator('[data-view="outline"]');
    await rootNode.locator(`[data-edit-field="unit"][data-id="${id}"]`).first().click();
    await rootNode.locator('.inline-editor textarea').fill(value);
    await page.keyboard.press('Control+Enter');
    await rootNode.locator('.inline-editor').waitFor({ state: 'detached' });
  };
  const editNote = (page, value) => page.locator('#beat-note').fill(value);
  const waitLive = async (name, check, timeout = 90_000) => assertEventually(name, async () => check(await liveFiles()), timeout);
  const waitNotice = (page, text) => page.locator('.draft-notice').filter({ hasText: text }).waitFor({ timeout: 90_000 });
  const clickRestore = async page => {
    page.once('dialog', dialog => dialog.accept());
    await page.locator('#restore-starter').click();
  };
  const readDownload = async (page, label) => {
    const ready = page.waitForEvent('download');
    await page.getByRole('button', { name: label }).click();
    const download = await ready, stream = await download.createReadStream();
    const chunks = []; for await (const chunk of stream) chunks.push(chunk);
    return JSON.parse(Buffer.concat(chunks).toString());
  };
  const repoEdit = async (kind, marker, unit = 'E001') => {
    git(writer, 'pull', '--quiet', '--ff-only', 'origin', 'main');
    const name = files[kind], path = `${writer}/outline/${slug}/${name}`;
    const value = JSON.parse(await readFile(path, 'utf8'));
    if (kind === 'plot') value.plot_units.find(row => row.unit_id === unit).content = marker;
    else value.beat_notes = { ...(value.beat_notes ?? {}), 'A1-B1': marker };
    await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
    git(writer, '-c', 'user.name=e2e', '-c', 'user.email=e2e@example.test', 'add', path);
    git(writer, '-c', 'user.name=e2e', '-c', 'user.email=e2e@example.test', 'commit', '-m', String(marker));
    git(writer, 'push', '--quiet', 'origin', 'HEAD:main');
  };
  const reports = [];
  const pass = name => { reports.push(`PASS ${name}`); console.log(`PASS ${name}`); };
  try {
    await editUnit(page1.page, 'E001', `web-${width}-1`);
    await waitLive('web edit reaches RTDB', x => x.plot?.plot_units.some(row => row.content === `web-${width}-1`));
    await page2.root.locator(`[data-edit-field="unit"][data-id="E001"]`).filter({ hasText: `web-${width}-1` }).waitFor({ timeout: 90_000 });
    await assertEventually('web edit reaches main', () => mainFile(files.plot).plot_units.some(row => row.content === `web-${width}-1`), 90_000);
    assert.match(git(remote, 'show', '-s', '--format=%B', 'main'), /Outline-Sync:/);
    pass(`1 web -> browser -> main @ ${width}`);

    await repoEdit('plot', `repo-${width}-2`, 'E002');
    await waitLive('repo edit reaches RTDB', x => x.plot?.plot_units.some(row => row.content === `repo-${width}-2`));
    await assertEventually('repo edit reaches both pages', async () => {
      const [one, two] = await Promise.all([workspace(page1.page), workspace(page2.page)]);
      return one.plot_data.plot_units.some(row => row.content === `repo-${width}-2`) && two.plot_data.plot_units.some(row => row.content === `repo-${width}-2`);
    }, 90_000);
    pass(`2 main -> both browsers @ ${width}`);

    await editUnit(page1.page, 'E001', `web-keep-${width}`);
    await repoEdit('plot', `repo-keep-${width}`);
    await waitNotice(page1.page, '仓库有新版');
    await page1.page.getByRole('button', { name: '保留网页版' }).click();
    await assertEventually('keep web clears incoming and publishes', async () => !(await db(`${bookPath}/incoming`)) && mainFile(files.plot).plot_units.some(row => row.content === `web-keep-${width}`), 90_000);

    await editUnit(page1.page, 'E001', `web-repo-${width}`);
    await repoEdit('plot', `repo-repo-${width}`);
    await waitNotice(page1.page, '仓库有新版');
    await page1.page.getByRole('button', { name: '用仓库版' }).click();
    await assertEventually('use repo keeps replaced web version', async () => mainFile(files.plot).plot_units.some(row => row.content === `repo-repo-${width}`) && Boolean((await db(bookPath)).kept), 90_000);
    const kept = await readDownload(page1.page, '下载被替换的版本');
    assert.equal(kept.plot_data.plot_units.find(row => row.unit_id === 'E001').content, `web-repo-${width}`);
    pass(`3 conflict keep-web/use-repo/kept @ ${width}`);

    await Promise.all([editNote(page1.page, `writer-one-${width}`), editNote(page2.page, `writer-two-${width}`)]);
    await waitNotice(page2.page, '云端已有新版本');
    await page2.page.getByRole('button', { name: '用本机版覆盖' }).click();
    await waitLive('use-local writes and keeps first writer', x => x.plan?.beat_notes?.['A1-B1'] === `writer-two-${width}` && Boolean(x.state.kept));
    const keptWriter = await readDownload(page2.page, '下载被替换的版本');
    assert.equal(keptWriter.plan.beat_notes['A1-B1'], `writer-one-${width}`);
    await Promise.all([editNote(page1.page, `load-one-${width}`), editNote(page2.page, `load-two-${width}`)]);
    await waitNotice(page2.page, '云端已有新版本');
    await page2.page.getByRole('button', { name: '载入云端版' }).click();
    await page2.page.locator('.draft-notice').filter({ hasText: '云端已有新版本' }).waitFor({ state: 'detached' });
    pass(`4 CAS rejection and both browser choices @ ${width}`);

    const beforeRestore = await workspace(page1.page);
    await clickRestore(page1.page);
    try {
      await waitLive('restore starter reaches cloud', x => JSON.stringify(x.plot?.plot_units) === JSON.stringify(starterData.plot_units) && JSON.stringify(x.plan?.placements) === JSON.stringify(starterPlan.placements), 90_000);
    } catch (error) {
      const current = await liveFiles();
      throw new Error(`${error.message}; live=${JSON.stringify({ rev: current.state?.live?.rev, by: current.state?.live?.by, base: current.state?.live?.base, e001: current.plot?.plot_units?.find(row => row.unit_id === 'E001')?.content })}; status=${await page1.root.locator('#status').textContent()}`);
    }
    await page1.page.locator('#undo').click();
    const afterUndo = await workspace(page1.page);
    assert.equal(afterUndo.plot_data.plot_units.find(row => row.unit_id === 'E001').content, beforeRestore.plot_data.plot_units.find(row => row.unit_id === 'E001').content);
    pass(`5 restore starter and undo @ ${width}`);
    await sleep(3_000);

    const oldSource = git(siteRepo, 'show', '5b65c3e:src/lib/views/outline/draft.js');
    const oldDraft = await import(`data:text/javascript;base64,${Buffer.from(oldSource).toString('base64')}`);
    const makeOldRaw = (base, marker) => {
      const storage = { raw: null, getItem() { return this.raw; }, setItem(_key, value) { this.raw = value; } };
      const draft = oldDraft.draftStore('legacy', base, storage);
      const next = clone(initialWorkspace); next.plot_data.plot_units.find(row => row.unit_id === 'E001').content = marker;
      draft.save(next);
      return { raw: storage.raw, workspace: next };
    };
    const prepareLegacyPage = async raw => {
      const context = await browser.newContext({ viewport: { width, height: 844 } }); contexts.push(context);
      await context.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), { key: authKey, value: user });
      await context.addInitScript(({ key, value }) => localStorage.setItem(key, value), { key: `outline:demo-outline:h:web-user:${slug}`, value: raw });
      const page = await context.newPage(); await configureAuth(page);
      const errors = [];
      page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
      page.on('console', message => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
      await page.goto(`${baseURL}/book/?book=${slug}&view=outline`);
      const rootNode = page.locator('[data-view="outline"]');
      try { await rootNode.waitFor({ state: 'attached', timeout: 30_000 }); }
      catch (error) { throw new Error(`legacy outline root missing: ${error.message}; url=${page.url()} body=${(await page.locator('body').innerText()).slice(0, 1200)} errors=${errors.join(' | ')}`); }
      return { context, page, root: rootNode };
    };
    const baselineState = await db(bookPath);
    const preparedRevision = revision('legacy');
    await put(`${bookPath}/live`, { ...baselineState.live, rev: preparedRevision, by: 'repo', base: '', plot: starter.plot, plan: starter.plan });
    await put(`${bookPath}/head/synced`, { ...baselineState.head.synced, rev: preparedRevision });
    const legacyBase = preparedRevision;
    const migratedRevision = revision('legacy');
    await put(`${bookPath}/live`, { ...baselineState.live, rev: migratedRevision, by: 'repo', base: '' , plot: starter.plot, plan: starter.plan });
    await put(`${bookPath}/head/synced`, { ...baselineState.head.synced, rev: migratedRevision });
    const migrated = await prepareLegacyPage(makeOldRaw(legacyBase, `legacy-migrated-${width}`).raw);
    try {
      await waitLive('legacy draft auto migrates', x => x.plot?.plot_units.some(row => row.content === `legacy-migrated-${width}`));
    } catch (error) {
      const current = await liveFiles();
      const localRaw = await migrated.page.evaluate(key => localStorage.getItem(key), `outline:demo-outline:h:web-user:${slug}`);
      throw new Error(`${error.message}; live=${JSON.stringify({ rev: current.state?.live?.rev, by: current.state?.live?.by, base: current.state?.live?.base, e001: current.plot?.plot_units?.find(row => row.unit_id === 'E001')?.content })}; status=${await migrated.root.locator('#status').textContent()}; notice=${await migrated.root.locator('.draft-notice').textContent().catch(() => '')}; draft=${localRaw?.slice(0, 300)}`);
    }
    const migrationButtons = await migrated.root.locator('.draft-notice button').allTextContents();
    if (migrationButtons.length >= 3) {
      const current = await liveFiles();
      throw new Error(`legacy migration unexpectedly opened a cloud conflict; buttons=${JSON.stringify(migrationButtons)}; live=${JSON.stringify({ rev: current.state?.live?.rev, by: current.state?.live?.by, base: current.state?.live?.base, e001: current.plot?.plot_units?.find(row => row.unit_id === 'E001')?.content })}; local=${(await migrated.page.evaluate(key => localStorage.getItem(key), `outline:demo-outline:h:web-user:${slug}`))?.slice(0, 300)}`);
    }
    const conflictRevision = revision('legacy');
    const conflictPlot = clone(canonical); conflictPlot.plot_units.find(row => row.unit_id === 'E001').content = `cloud-conflict-${width}`;
    await put(`${bookPath}/live`, { ...(await db(`${bookPath}/live`)), rev: conflictRevision, by: 'repo', base: '', plot: await pack(`${JSON.stringify(conflictPlot, null, 2)}\n`), plan: starter.plan });
    await put(`${bookPath}/head/synced`, { ...(await db(`${bookPath}/head/synced`)), rev: conflictRevision });
    const conflictLegacy = await prepareLegacyPage(makeOldRaw(migratedRevision, `legacy-conflict-${width}`).raw);
    await waitNotice(conflictLegacy.page, '云端已有新版本');
    const downloadedLocal = await readDownload(conflictLegacy.page, '下载本机版');
    assert.equal(downloadedLocal.plot_data.plot_units.find(row => row.unit_id === 'E001').content, `legacy-conflict-${width}`);
    await conflictLegacy.page.getByRole('button', { name: '载入云端版' }).click();
    await conflictLegacy.root.locator(`[data-edit-field="unit"][data-id="E001"]`).filter({ hasText: `cloud-conflict-${width}` }).waitFor();
    pass(`7 legacy 5b65c3e draft migrate/conflict/download @ ${width}`);

    await clickRestore(page1.page);
    await waitLive('restore baseline before offline', async x => (await unpack(x.state.live.plot)) === (await unpack(starter.plot)), 90_000);
    const databaseRoute = new RegExp(`^http://127\\.0\\.0\\.1:${port}`);
    await page1.page.route(databaseRoute, route => route.abort('failed'));
    await editUnit(page1.page, 'E001', `offline-${width}`);
    await page1.page.reload({ waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page1.root.waitFor();
    await page1.root.locator(`[data-edit-field="unit"][data-id="E001"]`).filter({ hasText: `offline-${width}` }).waitFor({ timeout: 30_000 });
    await page1.page.unroute(databaseRoute);
    await page1.page.evaluate(() => window.dispatchEvent(new Event('online')));
    await waitLive('offline draft reconnects and reaches RTDB', x => x.plot?.plot_units.some(row => row.content === `offline-${width}`), 90_000);
    await assertEventually('offline draft reaches main', () => mainFile(files.plot).plot_units.some(row => row.content === `offline-${width}`), 90_000);
    pass(`6 offline edit/refresh/reconnect @ ${width}`);

    await repoEdit('plot', 42, 'E001');
    await waitNotice(page1.page, '仓库版本无效');
    await page1.page.getByRole('button', { name: '用网页版修复' }).click();
    await assertEventually('invalid repo repaired from web', async () => !(await db(`${bookPath}/head/repo/error`)) && mainFile(files.plot).plot_units.some(row => row.content === `offline-${width}`), 90_000);
    pass(`8 invalid repo reason and web repair @ ${width}`);
    return reports;
  } finally {
    for (const context of contexts) await context.close().catch(() => {});
    await browser.close();
  }
}

async function assertEventually(name, check, timeout = 60_000) {
  const end = Date.now() + timeout;
  let lastError;
  while (Date.now() < end) {
    try { if (await check()) return true; } catch (error) { lastError = error; }
    await sleep(500);
  }
  throw new Error(`${name} timed out${lastError ? `: ${lastError.message}` : ''}`);
}

