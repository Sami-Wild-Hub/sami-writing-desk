// Account/book-scoped v7 drafts retain the base revision for CAS saves.
// Reads/Writes: localStorage outline draft (JSON)
export function draftStore(key, revision, storage) {
  let baseRevision = revision;
  const target = () => storage ?? globalThis.localStorage;
  return {
    raw: () => target().getItem(key),
    load() {
      const raw = target().getItem(key); if (!raw) return null;
      const saved = JSON.parse(raw);
      if (!saved.workspace || typeof saved.base !== 'string') throw Error('本地草稿格式无效');
      baseRevision = saved.base; return saved;
    },
    save(workspace) { target().setItem(key, JSON.stringify({ base: baseRevision, workspace })); },
    clear() { target().removeItem(key); },
    base: () => baseRevision,
    acceptRevision(next = revision) { baseRevision = next; },
  };
}
