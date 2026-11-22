// Resolve the initially selected storyline; all storylines have equal display status.
export function outlineConfig(data, configured = {}) {
  const id = configured.defaultStorylineId ?? data?.storyline_groups?.[0]?.id;
  if (!data?.storyline_groups?.some(g => g.id === id)) throw Error('Default storyline does not exist');
  return { defaultStorylineId: id };
}

