// Read versioned outline documents and publish them through the existing Git tree path.
// Reads: outline/<slug> (Git blobs); Writes: outline/<slug> (Git trees and sync commits)
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const exec = promisify(execFile);
const pathFor = (slug, name) => `outline/${slug}/${name}`;

function withInput(command, args, options, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: options.cwd, env: options.env, windowsHide: true });
    const stdout = [], stderr = [];
    child.stdout.on('data', chunk => stdout.push(chunk));
    child.stderr.on('data', chunk => stderr.push(chunk));
    child.on('error', reject);
    child.on('close', code => {
      const out = Buffer.concat(stdout).toString(options.encoding ?? 'utf8');
      if (code) reject(new Error(`${command} ${args.join(' ')} exit ${code}: ${Buffer.concat(stderr).toString('utf8').trim()}`));
      else resolve(out);
    });
    child.stdin.end(input);
  });
}

export async function runGit(root, args, options = {}) {
  const { input, ...execOptions } = options;
  const fullArgs = ['-c', 'core.autocrlf=false', ...args];
  if (input !== undefined) return withInput('git', fullArgs, { cwd: root, encoding: 'utf8', ...execOptions }, input);
  const { stdout } = await exec('git', fullArgs, { cwd: root, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024, ...execOptions });
  return stdout;
}

export class GitRepo {
  constructor(root, { remote = 'origin', branch = 'main' } = {}) {
    this.root = root;
    this.remote = remote;
    this.branch = branch;
  }

  async fetch() {
    const ref = `+refs/heads/${this.branch}:refs/remotes/${this.remote}/${this.branch}`;
    await runGit(this.root, ['fetch', '--quiet', this.remote, ref]);
  }
  async remoteTip() {
    const output = (await runGit(this.root, ['ls-remote', this.remote, `refs/heads/${this.branch}`])).trim();
    return output ? output.split(/\s+/)[0] : null;
  }
  async tip() { return (await runGit(this.root, ['rev-parse', `${this.remote}/${this.branch}`])).trim(); }
  async isAncestor(older, newer) {
    if (!older || !newer) return false;
    try { await runGit(this.root, ['merge-base', '--is-ancestor', older, newer]); return true; }
    catch { return false; }
  }
  async file(commit, slug, name) {
    try { return await runGit(this.root, ['show', `${commit}:${pathFor(slug, name)}`]); }
    catch { return null; }
  }
  async tree(commit, slug) {
    try { return (await runGit(this.root, ['rev-parse', `${commit}:outline/${slug}`])).trim(); }
    catch { return null; }
  }
  async snapshot(commit, slug) {
    const [plot, plan, config, tree, foreshadow] = await Promise.all([
      this.file(commit, slug, 'plot-data.json'), this.file(commit, slug, 'placements.json'),
      this.file(commit, slug, 'config.json'), this.tree(commit, slug), this.file(commit, slug, 'foreshadow.json'),
    ]);
    return { commit, tree, plot, plan, config, foreshadow };
  }
  async introduced(tip, slug) {
    const paths = ['plot-data.json', 'placements.json'].map(name => pathFor(slug, name));
    return (await runGit(this.root, ['log', '-1', '--first-parent', '--diff-filter=A', '--format=%H', tip, '--', ...paths])).trim();
  }
  async trailers(base, tip, slug) {
    const range = base ? `${base}..${tip}` : tip;
    const output = await runGit(this.root, ['log', '--format=%H%x1f%T%x1f%B%x1e', range, '--', `outline/${slug}`]);
    return output.split('\x1e').flatMap(record => {
      const [commit, tree, ...body] = record.split('\x1f');
      const match = body.join('\x1f').match(/^Outline-Sync:\s*([0-9a-z]{12})\s*$/im);
      return commit && match ? [{ commit, tree, rev: match[1] }] : [];
    });
  }
  async commitFiles(parent, slug, files, message) {
    const folder = await mkdtemp(join(tmpdir(), 'swd-outline-index-'));
    const index = join(folder, 'index');
    const env = { ...process.env, GIT_INDEX_FILE: index };
    try {
      await runGit(this.root, ['read-tree', parent], { env });
      for (const [name, text] of Object.entries(files)) {
        if (text == null) {
          await runGit(this.root, ['update-index', '--index-info'], { env, input: `0 ${'0'.repeat(40)}\t${pathFor(slug, name)}\n` });
          continue;
        }
        const blob = (await runGit(this.root, ['hash-object', '-w', '--stdin'], { input: text })).trim();
        await runGit(this.root, ['update-index', '--add', '--cacheinfo', `100644,${blob},${pathFor(slug, name)}`], { env });
      }
      const tree = (await runGit(this.root, ['write-tree'], { env })).trim();
      return (await runGit(this.root, ['commit-tree', tree, '-p', parent], { env, input: message })).trim();
    } finally { await rm(folder, { recursive: true, force: true }); }
  }
  async push(commit) {
    try { await runGit(this.root, ['push', '--quiet', this.remote, `${commit}:refs/heads/${this.branch}`]); }
    catch (error) { error.pushRejected = true; throw error; }
  }
  async books(commit) {
    const output = await runGit(this.root, ['ls-tree', '-d', '--name-only', `${commit}:outline`]);
    return output.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  }
}

