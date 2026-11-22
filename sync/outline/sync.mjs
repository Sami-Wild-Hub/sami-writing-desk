import process from 'node:process';
import os from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { appendFile, readFile } from 'node:fs/promises';
import { GitRepo } from './git.mjs';
import { createRtdb, lease, release } from './rtdb.mjs';
import { reconcileBook } from './reconcile.mjs';
import { preview } from './preview.mjs';

const here = new URL('.', import.meta.url);
const defaultConfig = new URL('./config.json', here);
const actionAgeMs = 10 * 60_000;
const loggedStates = new Map();

async function loadConfig(path = defaultConfig) {
  return JSON.parse((await readFile(path, 'utf8')).replace(/^\uFEFF/, ''));
}

async function logLine(config, line) {
  const output = `${new Date().toISOString()} ${line}\n`;
  if (config.log) await appendFile(config.log, output, 'utf8');
  else process.stderr.write(output);
}

function logKey(config, key) {
  return `${config.log ?? '<stderr>'}|${config.dataRepo ?? ''}|${key}`;
}

async function logChanged(config, key, value) {
  const scope = logKey(config, key);
  if (loggedStates.get(scope) === value) return;
  loggedStates.set(scope, value);
  await logLine(config, value);
}

async function logResults(config, results) {
  const changed = [];
  for (const { slug, result } of results) {
    const scope = logKey(config, slug);
    if (loggedStates.get(scope) === result.status) continue;
    loggedStates.set(scope, result.status);
    changed.push(`${slug}: ${result.status}`);
  }
  if (changed.length) await logLine(config, changed.join('; '));
}

export async function once(config, options = {}) {
  const {
    action = false,
    holder = `${os.hostname()}:${process.pid}`,
    releaseLease = true,
    fetchRepo = true,
    rtdb: suppliedRtdb,
    git: suppliedGit,
    states,
  } = options;
  const rtdb = suppliedRtdb ?? createRtdb(config);
  const git = suppliedGit ?? new GitRepo(config.dataRepo);
  let ownsLease = false;
  try {
    ownsLease = await lease(rtdb, holder, os.hostname(), { duration: action ? 15 * 60_000 : 60_000 });
    if (action && !ownsLease) {
      if (fetchRepo) await git.fetch();
      const overdue = [];
      for (const slug of await git.books(await git.tip())) {
        const result = await reconcileBook({ git, rtdb, slug, dryRun: true });
        if (result.actionable && result.age >= actionAgeMs) overdue.push(`${slug} (${Math.round(result.age / 1000)}s)`);
      }
      if (overdue.length) {
        const message = `action: watcher lease is active; overdue outline publishes: ${overdue.join(', ')}`;
        await logLine(config, message);
        throw new Error(message);
      }
      await logLine(config, 'action: watcher lease held; no overdue outline publish');
      return { status: 'lease-busy', results: [] };
    }
    if (!ownsLease) {
      await logChanged(config, '_lease', 'lease busy');
      return { status: 'lease-busy', results: [] };
    }
    loggedStates.set(logKey(config, '_lease'), 'held');
    if (fetchRepo) await git.fetch();
    const tip = await git.tip();
    const results = [];
    for (const slug of await git.books(tip)) {
      const result = await reconcileBook({ git, rtdb, slug, state: states?.[slug] });
      results.push({ slug, result });
    }
    await logResults(config, results);
    return { status: 'ok', results, lease: true };
  } finally {
    if (releaseLease && ownsLease) await release(rtdb, holder);
    if (!suppliedRtdb) await rtdb.close?.();
  }
}

function wakeQueue() {
  const pending = new Set();
  let waiter = null;
  const take = () => { const reasons = new Set(pending); pending.clear(); return reasons; };
  return {
    push(reason) { pending.add(reason); waiter?.(); waiter = null; },
    async next() {
      if (pending.size) return take();
      await new Promise(resolve => { waiter = resolve; });
      return take();
    },
  };
}

function liveSignature(state) {
  return JSON.stringify(Object.keys(state ?? {}).filter(slug => slug !== '_coordinator').sort().map(slug => {
    const live = state[slug]?.live;
    return [slug, live?.rev ?? null, live?.at ?? null, live?.over ?? null];
  }));
}

export async function watch(config) {
  const holder = `${os.hostname()}:${process.pid}`;
  const rtdb = createRtdb(config);
  const git = new GitRepo(config.dataRepo);
  const queue = wakeQueue();
  let states = {};
  let signature = null;
  let seenRemote = null;
  let retryTimer = null;
  let leaseHeld = false;
  let remoteTimer = null;
  let leaseTimer = null;
  let parentTimer = null;
  let stopWatch;
  const stopped = new Promise(resolve => { stopWatch = resolve; });
  const onStop = () => stopWatch();
  const onState = next => {
    states = next ?? {};
    const nextSignature = liveSignature(states);
    if (nextSignature !== signature) { signature = nextSignature; queue.push('state'); }
  };
  let unsubscribe = () => {};
  try {
    process.once('SIGTERM', onStop);
    process.once('SIGINT', onStop);
    // Stop-ScheduledTask ends only the hidden PowerShell parent, without signalling node.
    const parent = process.ppid;
    parentTimer = setInterval(() => { try { process.kill(parent, 0); } catch { onStop(); } }, 2_000);
    unsubscribe = rtdb.subscribe(onState);
    const pollMs = Math.max(5, Number(config.pollSeconds ?? 10)) * 1000;
    remoteTimer = setInterval(() => queue.push('remote'), pollMs);
    leaseTimer = setInterval(() => queue.push('lease'), 20_000);
    queue.push('remote');
    for (;;) {
      const reasons = await Promise.race([queue.next(), stopped.then(() => null)]);
      if (!reasons) break;
      if (reasons.has('lease')) {
        try {
          const wasHeld = leaseHeld;
          leaseHeld = await lease(rtdb, holder, os.hostname());
          if (leaseHeld) loggedStates.set(logKey(config, '_lease'), 'held');
          else await logChanged(config, '_lease', 'lease busy');
          if (leaseHeld && !wasHeld) queue.push('state');
        } catch (error) { await logLine(config, `error: ${error.stack ?? error}`); }
      }
      let repoChanged = false;
      if (reasons.has('remote')) {
        try {
          const remote = await git.remoteTip();
          if (remote !== seenRemote) { await git.fetch(); seenRemote = remote; repoChanged = true; }
        } catch (error) { await logLine(config, `error: ${error.stack ?? error}`); }
      }
      if (reasons.has('state') || reasons.has('retry') || repoChanged) {
        try {
          const round = await once(config, { holder, releaseLease: false, fetchRepo: false, rtdb, git, states });
          leaseHeld = round.lease === true;
          const retryAfter = (round.results ?? []).map(({ result }) => result.retryAfter).filter(Number.isFinite).sort((a, b) => a - b)[0];
          if (retryTimer) clearTimeout(retryTimer);
          retryTimer = Number.isFinite(retryAfter) ? setTimeout(() => { retryTimer = null; queue.push('retry'); }, retryAfter) : null;
        } catch (error) { await logLine(config, `error: ${error.stack ?? error}`); }
      }
    }
  } finally {
    if (retryTimer) clearTimeout(retryTimer);
    if (remoteTimer) clearInterval(remoteTimer);
    if (leaseTimer) clearInterval(leaseTimer);
    if (parentTimer) clearInterval(parentTimer);
    unsubscribe();
    if (leaseHeld) await release(rtdb, holder);
    await rtdb.close?.();
    process.off('SIGTERM', onStop);
    process.off('SIGINT', onStop);
  }
}

function argValue(args, name) {
  const index = args.indexOf(name);
  if (index < 0 || !args[index + 1]) throw new Error(`usage: node sync/outline/sync.mjs preview --novel <slug> --out <path> [--config path]`);
  return args[index + 1];
}

export async function main(args = process.argv.slice(2)) {
  const mode = args[0] ?? 'watch';
  const configPath = args.includes('--config') ? args[args.indexOf('--config') + 1] : defaultConfig;
  const config = await loadConfig(configPath);
  if (mode === 'once') return once(config, { action: args.includes('--action') });
  if (mode === 'watch') return watch(config);
  if (mode === 'preview') {
    const result = await preview(config, { slug: argValue(args, '--novel'), out: argValue(args, '--out') });
    process.stdout.write(`Private outline preview written to ${result.out}\n`);
    return result;
  }
  throw new Error('usage: node sync/outline/sync.mjs watch|once|preview [options]');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) await main();

