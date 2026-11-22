// Local browser, RTDB and git helpers for the real outline acceptance scenarios.
// Reads: sibling data repo outline/maritime-story (JSON)
// Writes: temporary RTDB, git repositories and browser storage (JSON/git)
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { unpack } from '../src/lib/views/outline/codec.js';

export const slug = 'maritime-story';
export const files = { plot: 'plot-data.json', plan: 'placements.json' };
export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
export const git = (cwd, ...args) => execFileSync('git', ['-C', cwd, '-c', 'core.autocrlf=false', ...args], { encoding: 'utf8', maxBuffer: 20e6, stdio: ['ignore', 'pipe', 'pipe'] });
export async function eventually(name, check, timeout = 90_000) {
  const end = Date.now() + timeout; let lastError;
  while (Date.now() < end) {
    try { if (await check()) return; } catch (error) { lastError = error; }
    await sleep(250);
  }
  throw new Error(`${name} timed out${lastError ? `: ${lastError.message}` : ''}`);
}

function identity() {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const token = `${encode({ alg: 'none', type: 'JWT' })}.${encode({ iss: 'https://securetoken.google.com/demo-outline', aud: 'demo-outline', iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600, auth_time: Math.floor(Date.now() / 1000), sub: 'web-user', user_id: 'web-user', email: 'reader@example.com', email_verified: true, firebase: { sign_in_provider: 'google.com', identities: { 'google.com': ['test'] } } })}.`;
  const user = { uid: 'web-user', email: 'reader@example.com', emailVerified: true, isAnonymous: false,
    providerData: [{ providerId: 'google.com', uid: 'google-reader', email: 'reader@example.com', displayName: null, phoneNumber: null, photoURL: null }],
    stsTokenManager: { refreshToken: 'test-refresh', accessToken: token, expirationTime: Date.now() + 3_600_000 },
    createdAt: '1', lastLoginAt: '1', apiKey: 'demo-outline-key', appName: 'family-hub-demo-outline' };
  return { token, user };
}

// Firebase splits large JSON requests into a frame count followed by chunks.
function packets(emit) {
  let remaining = 0, frames = [];
  return message => {
    if (remaining) {
      frames.push(message);
      if (--remaining === 0) { emit(frames, frames.slice(1).map(String).join('')); frames = []; }
    } else if (/^[1-9]\d*$/.test(String(message))) {
      remaining = Number(message); frames = [message];
    } else emit([message], String(message));
  };
}

// Delay actual SDK packets; the emulator still decides CAS and emits all snapshots.
function connectWire(page, port) {
  const control = { offline: false, holdWrites: false, holdReplies: false, writes: [], responses: [], outgoing: [], replies: [], sockets: [] };
  control.releaseWrites = () => { control.holdWrites = false; control.outgoing.splice(0).forEach(send => send()); };
  control.releaseReplies = () => { control.holdReplies = false; control.replies.splice(0).forEach(send => send()); };
  page.routeWebSocket(new RegExp(`ws://127\\.0\\.0\\.1:${port}/`), socket => {
    if (control.offline) return;
    const server = socket.connectToServer(), requests = new Set(); control.sockets.push(socket);
    socket.onMessage(packets((frames, text) => {
      let request; try { request = JSON.parse(text)?.d; } catch { /* keepalive */ }
      const write = ['m', 'p'].includes(request?.a) && request?.b?.p?.includes('outlineSync');
      if (write) { requests.add(request.r); control.writes.push({ ...request, sentAt: Date.now() }); }
      const send = () => frames.forEach(frame => server.send(frame));
      if (write && control.holdWrites) control.outgoing.push(send); else send();
    }));
    server.onMessage(packets((frames, text) => {
      let response; try { response = JSON.parse(text)?.d; } catch { /* keepalive */ }
      if (requests.has(response?.r)) control.responses.push(response);
      const send = () => frames.forEach(frame => socket.send(frame));
      if (requests.has(response?.r) && control.holdReplies) control.replies.push(send); else send();
    }));
  });
  return control;
}

export async function harness(options) {
  const { root, dataRepo, baseURL, width, port } = options;
  const browser = await chromium.launch({ headless: true }), contexts = [], panels = [];
  const db = async (path, request = {}) => {
    const response = await fetch(`http://127.0.0.1:${port}/households/h/${path}.json?ns=demo-outline-default-rtdb`, { headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }, ...request });
    if (!response.ok) throw Error(`RTDB ${path}: ${response.status} ${await response.text()}`);
    return response.status === 204 ? null : response.json();
  };
  const put = (path, value) => db(path, { method: 'PUT', body: JSON.stringify(value) });
  const bookPath = `outlineSync/${slug}`, remote = `${root}/remote.git`, writer = `${root}/writer`;
  const draftKey = `outline:demo-outline:h:web-user:${slug}`;
  const canonical = JSON.parse(git(dataRepo, 'show', '79700e3:outline/maritime-story/plot-data.json'));
  const canonicalPlan = JSON.parse(git(dataRepo, 'show', '79700e3:outline/maritime-story/placements.json'));
  await put('novelArchive', { catalog: { [slug]: { title: 'Maritime Story', scope: 'canonical' } }, books: { [slug]: { manifest: { title: 'Maritime Story', scope: 'canonical', entries: { index: { path: 'INDEX.md', title: 'Maritime Story', section: 'canonical' } } } } } });
  await put('settings', { enrollmentOpen: false }); await put('members/web-user', { email: 'reader@example.com' });
  const unauthorized = await fetch(`http://127.0.0.1:${port}/households/h/outlineSync.json?ns=demo-outline-default-rtdb`);
  assert.ok([401, 403].includes(unauthorized.status), 'emulator namespace must have the real rules loaded');
  await eventually('watcher initializes canonical outline', async () => Boolean((await db(bookPath))?.starter));
  const initial = await db(bookPath);
  const { token, user } = identity();
  const configureAuth = async page => {
    await page.route(/identitytoolkit\.googleapis\.com/, route => route.fulfill({ json: { users: [{ localId: 'web-user', email: 'reader@example.com', emailVerified: true, providerUserInfo: [{ providerId: 'google.com', rawId: 'google-reader', email: 'reader@example.com' }] }] } }));
    await page.route(/securetoken\.googleapis\.com/, route => route.fulfill({ json: { id_token: token, refresh_token: 'test-refresh', expires_in: '3600' } }));
  };
  const open = async raw => {
    const context = await browser.newContext({ viewport: { width, height: 844 } }); contexts.push(context);
    await context.addInitScript(value => localStorage.setItem('firebase:authUser:demo-outline-key:family-hub-demo-outline', JSON.stringify(value)), user);
    if (raw) await context.addInitScript(({ key, value }) => localStorage.setItem(key, value), { key: draftKey, value: raw });
    const page = await context.newPage(); await configureAuth(page);
    const wire = connectWire(page, port), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${baseURL}/book/?book=${slug}&view=outline`);
    const panel = { context, page, wire, root: page.locator('[data-view="outline"]'), errors };
    panels.push(panel);
    await ready(panel); return panel;
  };
  const ready = async panel => eventually('outline page loaded', async () => /\d+ \/ \d+/.test(await panel.root.locator('#overall').textContent({ timeout: 1000 })));
  const live = async () => { const state = await db(bookPath); return { state, plot: JSON.parse(await unpack(state.live.plot)), plan: JSON.parse(await unpack(state.live.plan)) }; };
  const mainFile = name => JSON.parse(git(remote, 'show', `main:outline/${slug}/${name}`));
  const main = () => git(remote, 'rev-parse', 'main').trim();
  const draft = panel => panel.page.evaluate(key => localStorage.getItem(key), draftKey);
  const synced = () => eventually('cloud and repo caught up', async () => { const s = await db(bookPath); return s.live.rev === s.head.synced.rev && !s.incoming; });
  const repoEdit = async (kind, marker, unit = 'E001') => {
    git(writer, 'pull', '--quiet', '--ff-only', 'origin', 'main');
    const path = `${writer}/outline/${slug}/${files[kind]}`, value = JSON.parse(await readFile(path, 'utf8'));
    if (kind === 'plot') value.plot_units.find(row => row.unit_id === unit).content = marker;
    else value.beat_notes = { ...value.beat_notes, 'A1-B1': marker };
    await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
    git(writer, 'add', path); git(writer, 'commit', '-m', String(marker)); git(writer, 'push', '--quiet', 'origin', 'HEAD:main');
  };
  const close = async () => { for (const context of contexts) await context.close(); await browser.close(); };
  return { ...options, db, put, bookPath, remote, writer, canonical, canonicalPlan, initial, open, ready, live, mainFile, main, draft, synced, repoEdit, close, panels };
}

export const notice = (panel, text) => panel.root.locator('.draft-notice').filter({ hasText: text }).waitFor({ timeout: 90_000 });
export const button = (panel, name) => panel.page.getByRole('button', { name, exact: true }).click();
export async function editUnit(panel, id, text) {
  await panel.root.locator(`[data-edit-field="unit"][data-id="${id}"]`).first().click();
  await panel.root.locator('.inline-editor textarea').fill(text); await panel.page.keyboard.press('Control+Enter');
}
export async function download(panel, action) {
  const event = panel.page.waitForEvent('download'); await action();
  const stream = await (await event).createReadStream(), chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString());
}
export const workspace = panel => download(panel, () => panel.page.locator('#export-workspace').click());
export const downloadButton = (panel, name) => download(panel, () => button(panel, name));
export async function importWorkspace(panel, value) {
  await panel.root.locator('#import-workspace').setInputFiles({ name: 'roundtrip.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(value)) });
  await eventually('workspace import accepted', async () => (await panel.root.locator('#status').textContent()).includes('已导入'));
  assert.deepEqual((await workspace(panel)).plot_data, value.plot_data);
}
export async function restore(panel) {
  panel.page.once('dialog', dialog => dialog.accept()); await panel.page.locator('#restore-starter').click();
}
