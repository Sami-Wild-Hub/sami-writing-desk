// Canonical private outline at runtime; no substitute book is embedded in the public repo.
// Reads: sibling data checkout outline/maritime-story (v7 JSON)
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
export const outlinePath = resolve(process.env.OUTLINE_DATA_REPO || '../sami-writing-desk-data-outline', 'outline/maritime-story');
export const hasOutline = existsSync(outlinePath);
export function outlineFixture() {
  if (!hasOutline) return null;
  const read = name => JSON.parse(readFileSync(resolve(outlinePath, name), 'utf8'));
  return { plot_data: read('plot-data.json'), plan: read('placements.json'), config: { defaultStorylineId: 'G01' } };
}
