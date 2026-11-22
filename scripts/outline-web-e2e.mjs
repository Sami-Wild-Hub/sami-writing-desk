// Runs the real outline browser acceptance path in disposable local services.
// Writes: only a temporary directory under the OS temp folder.
import { generateKeyPairSync } from 'node:crypto';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import net from 'node:net';
import { runScenario } from './outline-web-e2e-scenario.mjs';

const exec = promisify(execFile);
const siteRepo = resolve(process.cwd());
const dataRepo = resolve(siteRepo, '..', 'sami-writing-desk-data-outline');
const familyHub = resolve(siteRepo, '..', 'FamilyHub-outline-rules');
const firebaseCli = join(familyHub, 'node_modules', 'firebase-tools', 'lib', 'bin', 'firebase.js');
const astroCli = join(siteRepo, 'node_modules', 'astro', 'astro.js');
async function freePort() {
  const server = net.createServer();
  await new Promise((resolvePromise, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolvePromise); });
  const number = server.address().port;
  await new Promise(resolvePromise => server.close(resolvePromise));
  return number;
}
const port = await freePort(), previewPort = await freePort(), hubPort = await freePort(), loggingPort = await freePort();

async function command(cwd, args, options = {}) {
  const result = await exec('git', ['-C', cwd, '-c', 'core.autocrlf=false', ...args], { encoding: 'utf8', maxBuffer: 50e6, ...options });
  return result.stdout;
}

function service(commandName, args, options) {
  const child = spawn(commandName, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], ...options });
  const output = [];
  child.stdout.on('data', chunk => output.push(String(chunk)));
  child.stderr.on('data', chunk => output.push(String(chunk)));
  child.output = output;
  return child;
}

async function waitPort(host, number, timeout = 60_000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    try {
      await new Promise((resolvePromise, reject) => {
        const socket = net.createConnection({ host, port: number });
        socket.once('connect', () => { socket.destroy(); resolvePromise(); });
        socket.once('error', error => { socket.destroy(); reject(error); });
      });
      return;
    } catch { await new Promise(resolvePromise => setTimeout(resolvePromise, 250)); }
  }
  throw new Error(`port ${number} did not open`);
}

async function waitHttp(url, timeout = 60_000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    try { if ((await fetch(url)).ok) return; } catch { /* service still starting */ }
    await new Promise(resolvePromise => setTimeout(resolvePromise, 250));
  }
  throw new Error(`HTTP service did not open: ${url}`);
}

async function stop(child) {
  if (!child || child.exitCode !== null) return;
  if (process.platform === 'win32') await exec('taskkill', ['/PID', String(child.pid), '/T', '/F']).catch(() => child.kill('SIGTERM'));
  else child.kill('SIGTERM');
  await Promise.race([new Promise(resolvePromise => child.once('close', resolvePromise)), new Promise(resolvePromise => setTimeout(resolvePromise, 5_000))]);
  if (child.exitCode === null && process.platform === 'win32') {
    await exec('taskkill', ['/PID', String(child.pid), '/T', '/F']).catch(() => {});
  } else if (child.exitCode === null) child.kill('SIGKILL');
}

async function prepare(root) {
  const remote = join(root, 'remote.git'), dataClone = join(root, 'data.git'), writer = join(root, 'writer');
  await command(root, ['init', '--bare', remote]);
  await command(remote, ['symbolic-ref', 'HEAD', 'refs/heads/main']);
  const base = (await command(dataRepo, ['rev-parse', 'origin/main'])).trim();
  await command(dataRepo, ['push', '--quiet', remote, `${base}:refs/heads/main`]);
  await command(root, ['clone', '--bare', remote, dataClone]);
  await command(root, ['clone', '--quiet', remote, writer]);
  await command(writer, ['config', 'user.name', 'outline-e2e']);
  await command(writer, ['config', 'user.email', 'outline-e2e@example.test']);

  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
  await writeFile(join(root, 'key.json'), JSON.stringify({ type: 'service_account', project_id: 'demo-outline', private_key: privateKey, client_email: 'test@demo-outline.iam.gserviceaccount.com' }));
  await writeFile(join(root, 'rules.json'), await command(resolve(siteRepo, '..', 'FamilyHub'), ['show', 'origin/main:database.rules.json']));
  await writeFile(join(root, 'firebase.json'), JSON.stringify({ database: { rules: 'rules.json' }, emulators: { database: { host: '127.0.0.1', port }, hub: { host: '127.0.0.1', port: hubPort }, logging: { host: '127.0.0.1', port: loggingPort }, ui: { enabled: false } } }));
  await writeFile(join(root, 'config.json'), JSON.stringify({ credentials: join(root, 'key.json'), databaseURL: `http://127.0.0.1:${port}?ns=demo-outline-default-rtdb`, household: 'h', dataRepo: dataClone, pollSeconds: 5, log: join(root, 'sync.log') }));
  return { remote, dataClone, writer };
}

async function runWidth(root, width) {
  const layout = join(root, String(width));
  await mkdir(layout, { recursive: true });
  await prepare(layout);
  const env = { ...process.env, GITHUB_ACTIONS: 'false', GITHUB_REPOSITORY: '', PUBLIC_FIREBASE_API_KEY: 'demo-outline-key', PUBLIC_FIREBASE_AUTH_DOMAIN: 'demo-outline.firebaseapp.com', PUBLIC_FIREBASE_PROJECT_ID: 'demo-outline', PUBLIC_FIREBASE_DATABASE_URL: `http://127.0.0.1:${port}?ns=demo-outline-default-rtdb`, PUBLIC_FIREBASE_APP_ID: '1:1:web:demooutline', PUBLIC_FAMILY_HOUSEHOLD_ID: 'h' };
  await exec(process.execPath, [astroCli, 'build', '--outDir', join(layout, 'dist')], { cwd: siteRepo, env, encoding: 'utf8', maxBuffer: 50e6 });
  let emulator, preview, watcher;
  try {
    emulator = service(process.execPath, [firebaseCli, 'emulators:start', '--only', 'database', '--project', 'demo-outline', '--config', join(layout, 'firebase.json')], { cwd: layout, env });
    await waitPort('127.0.0.1', port);
    preview = service(process.execPath, [astroCli, 'preview', '--outDir', join(layout, 'dist'), '--host', '127.0.0.1', '--port', String(previewPort)], { cwd: siteRepo, env });
    await waitHttp(`http://127.0.0.1:${previewPort}/book/`);
    watcher = service(process.execPath, [join(siteRepo, 'sync', 'outline', 'sync.mjs'), 'watch', '--config', join(layout, 'config.json')], { cwd: siteRepo, env: { ...env, FIREBASE_DATABASE_EMULATOR_HOST: `127.0.0.1:${port}` } });
    const reports = await runScenario({ root: layout, siteRepo, dataRepo, baseURL: `http://127.0.0.1:${previewPort}`, width, port });
    return reports;
  } catch (error) {
    console.error('Watcher output:', watcher?.output?.join('').slice(-3000));
    throw error;
  } finally {
    await stop(watcher); await stop(preview); await stop(emulator);
    if (emulator?.output?.length) await writeFile(join(layout, 'emulator.log'), emulator.output.join(''));
    if (watcher?.output?.length) await writeFile(join(layout, 'watcher.log'), watcher.output.join(''));
  }
}

const root = await mkdtemp(join(tmpdir(), 'swd-outline-web-e2e-'));
try {
  const widths = (process.env.OUTLINE_E2E_WIDTHS ?? '390,1280').split(',').map(value => Number(value.trim())).filter(Number.isFinite);
  for (const width of widths) {
    const reports = await runWidth(root, width);
    console.log(`WIDTH ${width}: ${reports.length} acceptance checks passed`);
  }
  console.log('REAL OUTLINE WEB E2E PASS');
} catch (error) {
  console.error(error.stack ?? error);
  console.error(`Artifacts were in ${root} until cleanup.`);
  process.exitCode = 1;
} finally {
  await rm(root, { recursive: true, force: true });
}
