import { writeFile } from 'node:fs/promises';
import { outlineConfig } from '../../src/lib/views/outline/config.js';
import { GitRepo } from './git.mjs';

export async function preview(config, { slug, out, git = new GitRepo(config.dataRepo) } = {}) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug ?? '')) throw new Error('preview novel must be a lowercase slug');
  if (!out) throw new Error('preview requires --out');
  await git.fetch();
  const commit = await git.tip();
  const snapshot = await git.snapshot(commit, slug);
  if (!snapshot.plot || !snapshot.plan) throw new Error(`outline files not found for ${slug} at ${commit}`);
  const plotData = JSON.parse(snapshot.plot);
  const plan = JSON.parse(snapshot.plan);
  const configured = snapshot.config ? JSON.parse(snapshot.config) : {};
  const payload = { revision: commit, config: outlineConfig(plotData, configured), plot_data: plotData, plan };
  await writeFile(out, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return { status: 'preview', commit, out };
}
