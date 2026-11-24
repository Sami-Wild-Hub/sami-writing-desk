// Exercise browser → real RTDB rules/CAS → local Git and back, in disposable services.
// Reads: sibling data JSON and published FamilyHub rules; Writes: OS temporary directory only
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import net from 'node:net';
import { GitRepo, runGit } from '../sync/outline/git.mjs';
import { createRtdb } from '../sync/outline/rtdb.mjs';
import { once } from '../sync/outline/sync.mjs';
import { pack, unpack } from '../src/lib/views/outline/codec.js';
import { foreshadowFixture } from './foreshadow-fixture.mjs';
import { harness, eventually } from '../scripts/outline-web-e2e-harness.mjs';

const exec = promisify(execFile), site = resolve('.');
const data = resolve('../swd-data-foreshadow');
const cli = resolve('../FamilyHub-outline-rules/node_modules/firebase-tools/lib/bin/firebase.js');
const astro = resolve('node_modules/astro/astro.js');
const slug = 'maritime-story';
async function freePort() {
  const server = net.createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve)); return port;
}
function service(args, cwd, env) {
  const child = spawn(process.execPath, args, { cwd, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  child.log = ''; child.stdout.on('data', s => { child.log += s; }); child.stderr.on('data', s => { child.log += s; });
  return child;
}
async function stop(child) {
  if (!child || child.exitCode !== null) return;
  if (process.platform === 'win32') await exec('taskkill', ['/PID', String(child.pid), '/T', '/F']).catch(() => child.kill());
  else child.kill();
  await Promise.race([new Promise(resolve => child.once('close', resolve)), new Promise(resolve => setTimeout(resolve, 2_000))]);
}
function patchedRules(original, patch) {
  const rules = structuredClone(original);
  for (const op of patch) {
    const keys = op.path.slice(1).split('/'), key = keys.pop();
    const parent = keys.reduce((node, name) => node[name], rules);
    assert.ok(parent && ['add', 'replace'].includes(op.op)); parent[key] = op.value;
  }
  return rules;
}

async function prepare(root, ports) {
  const writer = join(root, 'writer'), remote = join(root, 'remote.git'), bare = join(root, 'data.git');
  await runGit(root, ['init', '--bare', '-b', 'main', remote]); await runGit(root, ['clone', remote, writer]);
  await runGit(writer, ['config', 'user.name', 'Test']); await runGit(writer, ['config', 'user.email', 'test@example.invalid']);
  const folder = join(writer, 'outline', slug); await mkdir(folder, { recursive: true });
  for (const name of ['plot-data.json', 'placements.json']) await writeFile(join(folder, name), await readFile(join(data, 'outline', slug, name)));
  const foreshadow = foreshadowFixture(); foreshadow.rows[0].author['伏笔／线索内容'] = '\nFirst\r\nSecond\n  ';
  await writeFile(join(folder, 'foreshadow.json'), JSON.stringify(foreshadow, null, 2) + '\n');
  await runGit(writer, ['add', 'outline']); await runGit(writer, ['commit', '-qm', 'Synthetic foreshadow fixture']);
  await runGit(writer, ['push', 'origin', 'HEAD:main']); await runGit(root, ['clone', '--bare', remote, bare]);
  await runGit(bare, ['config', 'user.name', 'Test']); await runGit(bare, ['config', 'user.email', 'test@example.invalid']);
  const original = JSON.parse(await runGit(resolve('../FamilyHub'), ['show', 'origin/main:database.rules.json']));
  const patch = JSON.parse(await readFile('sync/outline/foreshadow-rules.patch.json', 'utf8'));
  await writeFile(join(root, 'rules.json'), JSON.stringify(original));
  await writeFile(join(root, 'firebase.json'), JSON.stringify({ database: { rules: 'rules.json' }, emulators: {
    database: { host: '127.0.0.1', port: ports.db }, hub: { host: '127.0.0.1', port: ports.hub }, logging: { host: '127.0.0.1', port: ports.log }, ui: { enabled: false } } }));
  return { original, patched: patchedRules(original, patch), git: new GitRepo(bare), writer };
}

async function scenario(h, db, git, patched, port) {
  const panel = await h.open(), page = panel.page;
  await page.goto(`${h.baseURL}/book/?book=${slug}&view=foreshadow`);
  const root = page.locator('[data-view="foreshadow"]');
  await root.locator('tbody tr').first().waitFor();
  await root.getByRole('button', { name: '编辑', exact: true }).first().click();
  await root.getByLabel('备注', { exact: true }).fill('Browser to Git');
  await root.getByRole('button', { name: '保存修改' }).click();
  await eventually('published rules reject the extra field visibly', async () => (await root.locator('.fsh-status').textContent()).includes('云端保存失败'));
  assert.equal(JSON.parse(await unpack((await db.read(slug)).live.foreshadow)).rows[0].author['备注'], '');
  assert.ok(await page.evaluate(() => Object.keys(localStorage).some(k => k.endsWith(':foreshadow') && localStorage.getItem(k).includes('Browser to Git'))));
  const response = await fetch(`http://127.0.0.1:${port}/.settings/rules.json?ns=demo-outline-default-rtdb`, {
    method: 'PUT', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }, body: JSON.stringify(patched) });
  assert.ok(response.ok, await response.text());
  const useLocal = root.getByRole('button', { name: '用本机版覆盖', exact: true });
  if (await useLocal.count()) await useLocal.click(); else await root.getByRole('button', { name: '重试保存', exact: true }).click();
  await eventually('real rules accept the third document', async () => JSON.parse(await unpack((await db.read(slug)).live.foreshadow)).rows[0].author['备注'] === 'Browser to Git');
  await eventually('browser edit publishes through existing lease/CAS', async () => {
    await once({}, { git, rtdb: db });
    const state = await db.read(slug); return state.live.rev === state.head.synced.rev;
  });
  assert.equal(h.mainFile('foreshadow.json').rows[0].author['备注'], 'Browser to Git');
  assert.equal(h.mainFile('foreshadow.json').rows[0].author['伏笔／线索内容'], '\nFirst\r\nSecond\n  ');
  assert.match(await runGit(h.remote, ['log', '-1', '--format=%B', 'main']), /Outline-Sync:/);
  await runGit(h.writer, ['pull', '--ff-only', 'origin', 'main']);
  const file = join(h.writer, 'outline', slug, 'foreshadow.json'), repo = h.mainFile('foreshadow.json');
  repo.rows[0].author['备注'] = 'Git to browser'; await writeFile(file, JSON.stringify(repo, null, 2) + '\n');
  await runGit(h.writer, ['add', file]); await runGit(h.writer, ['commit', '-qm', 'Repository table edit']);
  await runGit(h.writer, ['push', 'origin', 'HEAD:main']); await once({}, { git, rtdb: db });
  await eventually('repository edit reaches live browser', async () => (await root.locator('tbody tr').first().textContent()).includes('Git to browser'));
  // A real rules-checked replacement must keep all three previous documents.
  const state = await db.read(slug), replacement = foreshadowFixture(); replacement.rows[0].author['备注'] = 'Incoming';
  await db.update(slug, { incoming: { tree: 'incoming-tree', commit: 'incoming', plot: state.live.plot, plan: state.live.plan, foreshadow: await pack(replacement) } });
  await root.getByRole('button', { name: '用仓库版', exact: true }).click();
  await eventually('replacement and kept third document pass real rules', async () => {
    const current = await db.read(slug);
    return current.kept?.foreshadow === state.live.foreshadow && JSON.parse(await unpack(current.live.foreshadow)).rows[0].author['备注'] === 'Incoming';
  });
  assert.deepEqual(panel.errors, []);
  console.log('PASS: published-rule rejection retains draft; patched-rule browser → RTDB → Git → browser and kept replacement');
}

const root = await mkdtemp(join(tmpdir(), 'swd-foreshadow-emulator-'));
let emulator, preview, db, h;
try {
  const ports = { db: await freePort(), web: await freePort(), hub: await freePort(), log: await freePort() };
  const prepared = await prepare(root, ports);
  const env = { ...process.env, GITHUB_ACTIONS: 'true', GITHUB_REPOSITORY: 'Sami-Wild-Hub/sami-writing-desk',
    PUBLIC_FIREBASE_API_KEY: 'demo-outline-key', PUBLIC_FIREBASE_AUTH_DOMAIN: 'demo-outline.firebaseapp.com', PUBLIC_FIREBASE_PROJECT_ID: 'demo-outline',
    PUBLIC_FIREBASE_DATABASE_URL: `http://127.0.0.1:${ports.db}?ns=demo-outline-default-rtdb`, PUBLIC_FIREBASE_APP_ID: '1:1:web:demooutline', PUBLIC_FAMILY_HOUSEHOLD_ID: 'h' };
  await exec(process.execPath, [astro, 'build', '--outDir', join(root, 'dist')], { cwd: site, env, maxBuffer: 10e6 });
  emulator = service([cli, 'emulators:start', '--only', 'database', '--project', 'demo-outline', '--config', join(root, 'firebase.json')], root, env);
  await eventually('local emulator ready', async () => { try { return (await fetch(`http://127.0.0.1:${ports.db}/.json?ns=demo-outline-default-rtdb`)).status === 401; } catch { return false; } }, 60_000);
  preview = service([astro, 'preview', '--outDir', join(root, 'dist'), '--host', '127.0.0.1', '--port', String(ports.web)], site, env);
  const baseURL = `http://127.0.0.1:${ports.web}/sami-writing-desk`;
  await eventually('local page ready', async () => { try { return (await fetch(`${baseURL}/book/`)).ok; } catch { return false; } });
  process.env.FIREBASE_DATABASE_EMULATOR_HOST = `127.0.0.1:${ports.db}`;
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
  db = createRtdb({ credentials: { project_id: 'demo-outline', client_email: 'test@demo-outline.iam.gserviceaccount.com', private_key: privateKey }, databaseURL: `http://127.0.0.1:${ports.db}?ns=demo-outline-default-rtdb`, household: 'h' });
  await once({}, { git: prepared.git, rtdb: db });
  h = await harness({ root, dataRepo: data, siteRepo: site, baseURL, width: 1440, port: ports.db });
  await scenario(h, db, prepared.git, prepared.patched, ports.db);
} catch (error) {
  console.error(error.stack ?? error); console.error(emulator?.log.slice(-1500)); process.exitCode = 1;
} finally {
  await h?.close(); await db?.close(); await stop(preview); await stop(emulator);
  await rm(root, { recursive: true, force: true });
}
