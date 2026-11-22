import process from 'node:process';
import os from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { appendFile, readFile } from 'node:fs/promises';
import { GitRepo } from './git.mjs';
import { createRtdb, lease, release } from './rtdb.mjs';
import { reconcileBook } from './reconcile.mjs';

const here = new URL('.', import.meta.url);
const defaultConfig = new URL('./config.json', here);

async function loadConfig(path = defaultConfig) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function logLine(config, line) {
  if (config.log) await appendFile(config.log, `${new Date().toISOString()} ${line}\n`, 'utf8');
}

export async function once(config, { action = false, holder = `${os.hostname()}:${process.pid}` } = {}) {
  const rtdb = createRtdb(config);
  const git = new GitRepo(config.dataRepo);
  await git.fetch();
  const ownsLease = await lease(rtdb, holder, os.hostname(), { duration: action ? 15 * 60_000 : 60_000 });
  if (action && !ownsLease) {
    for (const slug of await git.books(await git.tip())) await reconcileBook({ git, rtdb, slug, dryRun: true });
    await logLine(config, 'action: lease held by another watcher; reconciled without claiming it');
    return;
  }
  if (!ownsLease) { await logLine(config, 'lease busy'); return; }
  try {
    const tip = await git.tip();
    for (const slug of await git.books(tip)) {
      const result = await reconcileBook({ git, rtdb, slug });
      await logLine(config, `${slug}: ${result.status}`);
    }
  } finally { await release(rtdb, holder); }
}

export async function watch(config) {
  const holder = `${os.hostname()}:${process.pid}`;
  for (;;) {
    try { await once(config, { holder }); }
    catch (error) { await logLine(config, `error: ${error.stack ?? error}`); }
    await new Promise(resolve => setTimeout(resolve, Math.max(5, Number(config.pollSeconds ?? 10)) * 1000));
  }
}

export async function main(args = process.argv.slice(2)) {
  const mode = args[0] ?? 'watch';
  const configPath = args.includes('--config') ? args[args.indexOf('--config') + 1] : defaultConfig;
  const config = await loadConfig(configPath);
  if (mode === 'once') return once(config, { action: args.includes('--action') });
  if (mode === 'watch') return watch(config);
  throw new Error('usage: node sync/outline/sync.mjs watch|once [--action] [--config path]');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) await main();

