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
// The top bar's card and placement counts for the current canonical documents.
export function overallText() {
  const { plot_data, plan } = outlineFixture(), merged = new Set(plot_data.plot_units.flatMap(u => u.source_unit_ids || []));
  return `${plot_data.plot_units.filter(u => !merged.has(u.unit_id)).length} 张 · ${plan.placements.length} 已排`;
}
