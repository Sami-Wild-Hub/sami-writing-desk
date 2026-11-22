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
      if (!saved.workspace || typeof saved.revision !== 'string') throw Error('本地草稿格式无效');
      baseRevision = saved.revision;
      return { workspace: saved.workspace, changed: saved.revision !== revision };
    },
    save(workspace) { target().setItem(key, JSON.stringify({ revision: baseRevision, workspace })); },
    acceptRevision() { baseRevision = revision; },
  };
}
