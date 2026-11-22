// Book/account-scoped local workspace persistence, retaining the draft's base revision.
// Reads/Writes: localStorage outline draft (JSON); never writes the private database.
export function draftStore(key, revision, storage) {
  let baseRevision = revision;
  const target = () => storage ?? globalThis.localStorage;
  return {
    raw: () => target().getItem(key),
    load() {
      const raw = target().getItem(key);
      if (!raw) return null;
      const saved = JSON.parse(raw);
      const savedBase = typeof saved.base === 'string' ? saved.base : saved.revision;
      if (!saved.workspace || typeof savedBase !== 'string') throw Error('本地草稿格式无效');
      baseRevision = savedBase;
      return { workspace: saved.workspace, base: savedBase, legacy: typeof saved.base !== 'string', changed: savedBase !== revision };
    },
    save(workspace) { target().setItem(key, JSON.stringify({ base: baseRevision, revision: baseRevision, workspace })); },
    clear() { target().removeItem(key); },
    base: () => baseRevision,
    acceptRevision(next = revision) { baseRevision = next; },
  };
}
