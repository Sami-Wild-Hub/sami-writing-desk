// Resolve the outline spine from book data and optional outline configuration.
// Reads: plot-data.json (JSON); configured outline fields (JSON)
// Writes: derived outline display configuration (JSON)
export function outlineConfig(data, configured = {}) {
  const groups = Object.fromEntries((data?.storyline_groups ?? []).map(group => [group.id, group]));
  const main = new Set((data?.storylines ?? [])
    .filter(story => story?.legacy_role === 'MAIN_ROMANCE')
    .map(story => story.storyline_group_id));
  const spine = configured.spineGroupId ?? (main.size === 1
    ? [...main][0]
    : (() => { throw new Error('Set outline.spineGroupId for this book'); })());
  if (!groups[spine]) throw new Error('Outline spine group does not exist');
  const title = configured.spineTitle ?? groups[spine].title;
  if (typeof title !== 'string') throw new Error('Outline spineTitle must be text');
  return { spineGroupId: spine, spineTitle: title };
}

