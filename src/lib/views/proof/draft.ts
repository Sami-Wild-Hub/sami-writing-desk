// Unsent proof forms are scoped to the signed-in account and book.
// Reads: localStorage <outline key>:proof (JSON)
// Writes: localStorage <outline key>:proof (JSON)
export interface DraftFields { source: 'paste' | 'drive'; title: string; draft: string; driveName: string; skipProse: boolean; titleEdited?: boolean; recheckOf?: string[]; }
export const fields = (s: DraftFields): DraftFields => ({ source: s.source, title: s.title, draft: s.draft, driveName: s.driveName, skipProse: s.skipProse, titleEdited: s.titleEdited, recheckOf: s.recheckOf });
export const signature = (s: DraftFields) => JSON.stringify(fields(s));
export function proofDraft(key: string, warn: (text: string) => void) {
  return {
    load(): Partial<DraftFields> {
      try { return JSON.parse(localStorage.getItem(key) ?? '{}'); }
      catch { warn('未能读取本机校稿草稿'); return {}; }
    },
    save(s: DraftFields) {
      try {
        if (s.title || s.draft || s.driveName || s.skipProse) localStorage.setItem(key, signature(s));
        else localStorage.removeItem(key);
      } catch { warn('校稿草稿未能保存在此浏览器，请保留一份副本'); }
    },
  };
}
