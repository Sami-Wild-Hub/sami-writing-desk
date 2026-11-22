import { readFile } from 'node:fs/promises';
import { execFile as run } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';
import type { Page } from '@playwright/test';
import { outlineFixture } from './outline-fixture.mjs';
import { pack } from '../src/lib/views/outline/codec.js';

// A stubbed Firebase for the browser tests: Google sign-in is a persisted Auth user and
// the Realtime Database is answered over its WebSocket protocol from the tree below.
// playwright.config.ts builds the site with the matching stub config.
export const env = (globalThis as typeof globalThis & { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
const stub = { apiKey: 'novel-stub-key', projectId: 'novel-stub', householdId: 'novel-stub-house' };
const reader = { uid: 'novel-stub-reader', email: 'reader@example.com' };
const execFile = promisify(run);

type Tree = { [key: string]: unknown };
interface Point { title: string; locs: string[] }
interface Timeline { owners: { id: string; domain: string }[]; points: Record<string, Point> }

// A small made-up timeline: two axis Owners, two selectable lines, two bands.
const fixture = (axisLabel: string) => ({
  bands: ['开端', '后来'], axis: ['CH-Ann', 'TP-Ann-Bo'], axisLabel, defaultOn: ['CH-Cy'],
  domains: [['CHARACTER', '人物'], ['LOCATION', '地点'], ['TOPIC', '主题']],
  owners: [
    { id: 'CH-Ann', domain: 'CHARACTER', name: 'Ann', desc: '主角', pts: [['E-9001', 'Ann 到码头', 1], ['E-9002@定约', 'Ann 定约', 0], ['E-9004', 'Ann 离开', 0]] },
    { id: 'CH-Cy', domain: 'CHARACTER', name: 'Cy', desc: '旁观者', pts: [['E-9002@定约', 'Cy 旁观', 0], ['E-9003', 'Cy 独行，后见 E-9004', 0], ['E-9004', 'Cy 告别', 0]] },
    { id: 'LOC-Dock', domain: 'LOCATION', name: '码头', desc: '', pts: [['E-9001', '相遇之处', 0]] },
    { id: 'TP-Ann-Bo', domain: 'TOPIC', name: 'Ann与Bo', desc: '', pts: [['E-9001', '两人相遇', 1]] },
  ],
  points: {
    'E-9001': { r: 0, b: 0, t: '在码头相遇', title: '相遇', time: '春', end: '', pt: '', story: '两人在码头相遇。', roles: { 'CH-Ann': '到达' }, locs: ['C1#P2'] },
    'E-9002@定约': { r: 10, b: 0, t: '定下约定', title: '约定', time: '春末', end: '', pt: '当面定约', story: '', roles: {}, locs: ['C2#P5-P6'] },
    'E-9003': { r: 20, b: 1, t: 'Cy 独行', title: '独行', time: '夏', end: '', pt: '', story: '', roles: { 'CH-Cy': '独自出发' }, locs: ['C2#P9'] },
    'E-9004': { r: 30, b: 1, t: '告别', title: '告别', time: '秋', end: '', pt: '', story: '', roles: {}, locs: ['C3#P1'] },
  },
});

// A small made-up people table: an owner with 称呼 and 外在与言行 entries, an owner
// without, and a record whose profile page was not synced (its link stays plain text).
const owner = (id: string) => `owners/CHARACTER/${id}/START_HERE.md`;
const people = JSON.stringify({
  scope: 'C1–C3', extracted: 'C1–C1',
  people: [
    { id: 'CH-Ann', name: 'Ann', kind: 'owner', basic: '主角，`CH-Cy` 的旧友', group: ['GR-Crew'], first: 'C1#P2',
      current: { as: '截至 C3', items: ['在码头等 `CH-Cy`', '还没定约'] },
      names: [{ name: '阿安', users: ['`CH-Cy`'], refs: ['C1#P2'] }],
      hooks: [{ cat: '体貌', text: '左眉有疤', mark: '一见', refs: ['C1#P2'] }, { cat: '声音说话', text: '说话慢', mark: '阶段：春', refs: ['C2#P5'] }],
      evidence: {
        names: [['阿安', '`CH-Cy`', '昵称', '`CH-Ann`', '私下', '春', '`C1#P2`', '阿安，来。']],
        looks: [['体貌', '左眉有疤', '叙述', '当场可辨', '春', '`C1#P2`', '眉上一道疤'], ['声音说话', '说话慢', '叙述', '明确阶段', '春', '`C2#P5`', '慢慢说']],
      } },
    { id: 'CH-Cy', name: 'Cy', kind: 'owner', basic: '旁观者', group: [], first: 'C2#P5',
      current: { as: '截至 C2', items: ['独自出发'] }, names: [], hooks: [], evidence: { names: [], looks: [] } },
    { id: 'CH-Dee', name: 'Dee', kind: 'record', basic: '码头的船夫', group: ['GR-Crew'], first: 'C3#P1',
      current: null, names: [], hooks: [], evidence: { names: [], looks: [] } },
  ],
  paths: { 'CH-Ann': owner('CH-Ann'), 'CH-Cy': owner('CH-Cy'), 'CH-Dee': 'records/CHARACTER/CH-Dee.md', 'C1#P2': 'source/C1.md#p2', 'C2#P5': 'source/C2.md#p5', 'C3#P1': 'source/C3.md#p1' },
});

const pageKey = (path: string) => Buffer.from(path).toString('base64url');
// Reading pages for every link the timeline can make, shaped like the compiled KB.
function stubBook(title: string, timeline: Timeline): Tree {
  const pages: Record<string, [string, string]> = {
    'INDEX.md': ['故事知识库', `<h1>故事知识库</h1><p>${title} 的总目录。<a href="CHRONOLOGY.md">CHRONOLOGY.md</a></p>` +
      '<ul><li><a href="owners/CHARACTER/CH-Ann/START_HERE.md">CH-Ann</a> 主角</li><li><a href="owners/CHARACTER/CH-Cy/START_HERE.md">CH-Cy</a> 旁观者</li>' +
      '<li><a href="owners/LOCATION/LOC-Dock/START_HERE.md">LOC-Dock</a> 相遇之处</li></ul>'],
    'CHRONOLOGY.md': ['文字时间线', '<h1>文字时间线</h1>'],
  };
  const chapters: Record<string, number> = {};
  for (const [pid, point] of Object.entries(timeline.points)) {
    const [eid, name] = pid.split('@');
    const page = pages[`events/${eid}.md`] ??= [`${eid} ${point.title}`, `<h1>${eid} ${point.title}</h1><p>参与：<a href="../owners/CHARACTER/CH-Ann/START_HERE.md">CH-Ann</a></p>`];
    if (name) page[1] += `<h2><a id="at-${name}"></a>${name}</h2>${'<p>经过。</p>'.repeat(30)}`;
    for (const loc of point.locs) {
      const [, chapter, paragraph] = /^C(\d+)#P(\d+)/.exec(loc)!;
      chapters[chapter] = Math.max(chapters[chapter] ?? 0, Number(paragraph));
    }
  }
  for (const [chapter, last] of Object.entries(chapters)) {
    const body = Array.from({ length: last + 30 }, (_, i) => `<p><a id="p${i + 1}"></a>[P${i + 1}] 第 ${chapter} 章正文。</p>`).join('');
    pages[`source/C${chapter}.md`] = [`C${chapter}`, `<h4>第${chapter}章</h4>${body}`];
  }
  for (const owner of timeline.owners) {
    for (const page of ['START_HERE.md', 'TIMELINE_INDEX.md']) {
      pages[`owners/${owner.domain}/${owner.id}/${page}`] = [owner.id, `<h1>${owner.id}</h1><p>Basic：${owner.id} 的简介。</p>`];
    }
  }
  const entries = Object.fromEntries(Object.entries(pages).map(([path, [pageTitle]]) => [pageKey(path), { path, title: pageTitle, section: '全局' }]));
  return {
    manifest: { title, scope: 'C1–C3', entries },
    pages: Object.fromEntries(Object.entries(pages).map(([path, [, html]]) => [pageKey(path), html])),
    search: Object.fromEntries(Object.entries(pages).map(([path, [pageTitle]]) => [pageKey(path), pageTitle])),
    timeline: JSON.stringify(timeline),
    ...(title === 'Maritime Story' ? { people } : {}),
  };
}

// NOVEL_STUB_DB may name a full private payload ({manifest,pages,search,timeline,people}) for
// the first book, e.g. for screenshots with the real data; it is never committed.
async function canonicalOutline() {
  const repo = resolve(process.cwd(), '..', 'sami-writing-desk-data-outline');
  const show = async (file: string) => (await execFile('git', ['-C', repo, 'show', `origin/main:outline/maritime-story/${file}`])).stdout;
  const [plot, plan, commit] = await Promise.all([
    show('plot-data.json'), show('placements.json'), execFile('git', ['-C', repo, 'rev-parse', 'origin/main']).then(result => result.stdout.trim()),
  ]);
  return { plot, plan, commit };
}

async function database({ canonical = false } = {}) {
  const first = env.NOVEL_STUB_DB ? JSON.parse(await readFile(env.NOVEL_STUB_DB, 'utf8')) as Tree : stubBook('Maritime Story', fixture('Ann·Bo'));
  let outlineSync: Tree = {};
  if (env.NOVEL_STUB_DB) {
    const raw = (typeof first.outline === 'string' ? JSON.parse(first.outline) : first.outline && typeof first.outline === 'object' ? first.outline : first) as Tree;
    if (raw.plot_data && raw.plan) {
      const plot = JSON.stringify(raw.plot_data, null, 2) + '\n', plan = JSON.stringify(raw.plan, null, 2) + '\n';
      const packed = { plot: await pack(plot), plan: await pack(plan) }, revision = typeof raw.revision === 'string' ? raw.revision : 'private0001';
      outlineSync = { 'maritime-story': {
        head: { synced: { rev: revision, tree: 'private-tree', commit: revision }, repo: { tree: 'private-tree', commit: revision, at: Date.now() }, config: raw.config ? JSON.stringify(raw.config) + '\n' : '' },
        live: { rev: revision, base: '', at: Date.now(), by: 'repo', ...packed }, starter: { commit: revision, ...packed },
      } };
    }
  } else {
    const f = outlineFixture();
    const source = canonical ? await canonicalOutline() : { plot: JSON.stringify(f.plot_data, null, 2) + '\n', plan: JSON.stringify(f.plan, null, 2) + '\n', commit: 'fiction-v1' };
    const { plot, plan } = source;
    const packed = { plot: await pack(plot), plan: await pack(plan) };
    outlineSync = { 'maritime-story': {
      head: { synced: { rev: canonical ? 'canonical001' : 'fiction-v1', tree: 'fiction-tree', commit: source.commit }, repo: { tree: 'fiction-tree', commit: source.commit, at: Date.now() }, config: canonical ? '' : JSON.stringify(f.config) + '\n' },
      live: { rev: canonical ? 'canonical001' : 'fiction-v1', base: '', at: Date.now(), by: 'repo', ...packed },
      starter: { commit: source.commit, ...packed },
    } };
  }
  const books: Record<string, Tree> = { 'maritime-story': first, 'second-book': stubBook('Second Book', fixture('第二本')) };
  const catalog = Object.fromEntries(Object.entries(books).map(([slug, book]) => [slug, { title: (book.manifest as Tree).title, scope: (book.manifest as Tree).scope }]));
  return { households: { [stub.householdId]: { members: { [reader.uid]: { email: reader.email } }, settings: { enrollmentOpen: false }, novelArchive: { catalog, books }, outlineSync } } } as Tree;
}

/** Stubs Firebase for `page`; returns the database paths the page reads, with `server(path,
 * value)` to change the tree as another writer would (the page's live listeners hear it). */
export async function stubFirebase(page: Page, { signedIn = true, canonical = false } = {}) {
  const db = await database({ canonical });
  const reads: string[] = [];
  const listens = new Map<{ send(data: unknown): void }, Set<string>>();
  const at = (path: string) => path.split('/').filter(Boolean).reduce<unknown>((node, key) => (node as Tree | null)?.[key] ?? null, db);
  const put = (path: string, value: unknown) => {
    const keys = path.split('/').filter(Boolean);
    const last = keys.pop()!;
    const node = keys.reduce<Tree>((parent, key) => {
      if (!parent[key] || typeof parent[key] !== 'object') parent[key] = {};
      return parent[key] as Tree;
    }, db);
    if (value === null) delete node[last]; else node[last] = value;
  };
  if (signedIn) {
    const user = {
      uid: reader.uid, email: reader.email, emailVerified: true, isAnonymous: false,
      providerData: [{ providerId: 'google.com', uid: 'google-reader', email: reader.email, displayName: null, phoneNumber: null, photoURL: null }],
      stsTokenManager: { refreshToken: 'stub-refresh', accessToken: 'stub-access', expirationTime: Date.now() + 3_600_000 },
      createdAt: '1', lastLoginAt: '1', apiKey: stub.apiKey, appName: `family-hub-${stub.projectId}`,
    };
    await page.addInitScript(([key, value]) => localStorage.setItem(key, value), [`firebase:authUser:${stub.apiKey}:family-hub-${stub.projectId}`, JSON.stringify(user)]);
  }
  await page.route(/identitytoolkit\.googleapis\.com/, (route) => route.fulfill({ json: { users: [{
    localId: reader.uid, email: reader.email, emailVerified: true, createdAt: '1', lastLoginAt: '1',
    providerUserInfo: [{ providerId: 'google.com', rawId: 'google-reader', email: reader.email }],
  }] } }));
  await page.routeWebSocket(/firebaseio\.com/, (ws) => {
    const send = (data: unknown) => ws.send(JSON.stringify({ t: 'd', d: data }));
    const paths = new Set<string>();
    const socket = { send };
    listens.set(socket, paths);
    ws.onClose(() => listens.delete(socket));
    ws.send(JSON.stringify({ t: 'c', d: { t: 'h', d: { ts: Date.now(), v: '5', h: new URL(ws.url()).host, s: 'stub-session' } } }));
    ws.onMessage((message) => {
      let frame: { t?: string; d?: { r: number; a: string; b: { p?: string; d?: unknown } } };
      try { frame = JSON.parse(String(message)); } catch { return; }
      if (frame?.t !== 'd' || !frame.d) return;
      const { r, a, b } = frame.d;
      if (b.p) reads.push(b.p);
      // Writes (set, update, remove) change the tree, so they survive a reload in the same test;
      // like the real server, listeners hear the new data before the write is acknowledged.
      if (a === 'p') server(b.p!, b.d);
      if (a === 'm') Object.entries(b.d as Tree).forEach(([key, value]) => server(`${b.p}/${key}`, value));
      if (a === 'q') { paths.add(b.p!); send({ a: 'd', b: { p: b.p, d: at(b.p!) } }); }
      if (a === 'n') paths.delete(b.p!);
      send({ r, b: { s: 'ok', d: a === 'g' ? at(b.p!) : {} } });
    });
  });
  const server = (path: string, value: unknown) => {
    put(path, value);
    const norm = (p: string) => `/${p.split('/').filter(Boolean).join('/')}/`;
    for (const [socket, paths] of listens) {
      for (const p of paths) if (norm(path).startsWith(norm(p)) || norm(p).startsWith(norm(path))) socket.send({ a: 'd', b: { p, d: at(p) } });
    }
  };
  return Object.assign(reads, { server, at });
}

/** Collects uncaught page errors and console errors. */
export function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  return errors;
}
