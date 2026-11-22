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

async function loadConfig(path = defaultConfig) {
  return JSON.parse((await readFile(path, 'utf8')).replace(/^\uFEFF/, ''));
}

async function logLine(config, line) {
  const output = `${new Date().toISOString()} ${line}\n`;
  if (config.log) await appendFile(config.log, output, 'utf8');
  else process.stderr.write(output);
}

export async function once(config, { action = false, holder = `${os.hostname()}:${process.pid}`, releaseLease = true } = {}) {
  const rtdb = createRtdb(config);
  const git = new GitRepo(config.dataRepo);
  const ownsLease = await lease(rtdb, holder, os.hostname(), { duration: action ? 15 * 60_000 : 60_000 });
  if (action && !ownsLease) {
    await git.fetch();
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
    await logLine(config, 'action: lease held by another watcher; reconciled without claiming it');
    return;
  }
  if (!ownsLease) { await logLine(config, 'lease busy'); return; }
  try {
    await git.fetch();
    const tip = await git.tip();
    for (const slug of await git.books(tip)) {
      const result = await reconcileBook({ git, rtdb, slug });
      await logLine(config, `${slug}: ${result.status}`);
    }
  } finally { if (releaseLease) await release(rtdb, holder); }
}

export async function watch(config) {
  const holder = `${os.hostname()}:${process.pid}`;
  for (;;) {
    try { await once(config, { holder, releaseLease: false }); }
    catch (error) { await logLine(config, `error: ${error.stack ?? error}`); }
    await new Promise(resolve => setTimeout(resolve, Math.max(5, Number(config.pollSeconds ?? 10)) * 1000));
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

