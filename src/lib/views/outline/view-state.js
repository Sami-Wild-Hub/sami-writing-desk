// Where the workbench was left: tab, storyline, Beat, open library groups, filters and scroll.
// Scoped like the draft (account + book); anything that no longer exists falls back to the default.
// Reads/Writes: localStorage <outline draft key>:view (JSON)
// Temporarily archive the legacy board; flip this flag to restore its tab.
export const OUTLINE_ARCHIVED = true;
const TABS = new Set(OUTLINE_ARCHIVED ? ['story'] : ['story', 'outline']);
const FILTERS = new Set(['unplaced', 'placed', 'written']);
const strings = x => Array.isArray(x) ? x.filter(s => typeof s === 'string') : null;
const finite = x => typeof x === 'number' && Number.isFinite(x) && x >= 0;

export function viewStore(key, storage) {
  const target = () => storage ?? globalThis.localStorage;
  return {
    // Returns only the fields that are still valid for this model; never throws.
    load(model) {
      let saved;
      try { saved = JSON.parse(target().getItem(key) ?? 'null'); } catch { return {}; }
      if (!saved || typeof saved !== 'object') return {};
      const view = {};
      if (TABS.has(saved.tab)) view.tab = saved.tab;
      if (typeof saved.line === 'string' && model.storyMap[saved.line]) view.line = saved.line;
      if (model.beatIds.includes(saved.beat)) view.beat = saved.beat;
      const open = strings(saved.open); if (open) view.open = new Set(open);
      const filters = strings(saved.filters); if (filters) view.filters = new Set(filters.filter(f => FILTERS.has(f)));
      if (typeof saved.onlyUnplaced === 'boolean') view.onlyUnplaced = saved.onlyUnplaced;
      if (saved.scroll && typeof saved.scroll === 'object') view.scroll = Object.fromEntries(Object.entries(saved.scroll).filter(([, top]) => finite(top)));
      if (finite(saved.y)) view.y = saved.y;
      return view;
    },
    save(view) {
      try { target().setItem(key, JSON.stringify({ ...view, open: [...view.open], filters: [...view.filters] })); } catch { /* private mode or full storage: just don't remember */ }
    },
  };
}
