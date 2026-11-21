// 校稿 history in the household's private database: one record per draft (draft, task),
// every pasted report kept under reports/<reportId>; the newest records come first.
// Reads: households/<id>/proofdesk/<slug> (RTDB, records by id)
// Writes: households/<id>/proofdesk/<slug>/<id> (RTDB, {id,title,createdAt,updatedAt,draft,task,reports?})
import { child, get, remove, set, update, type DatabaseReference } from 'firebase/database';

export interface ProofReport {
  id: string;
  createdAt: number;
  /** The reply exactly as pasted. */
  report: string;
  /** JSON string of the ParsedReport; absent when the reply could not be read. */
  parsed?: string;
}
export interface ProofRecord {
  id: string; title: string; createdAt: number; updatedAt: number;
  draft: string; task: string;
  reports?: Record<string, ProofReport>;
}

/** A time-ordered, path-safe id: 20261121-153012-1a2b (UTC). */
export function newId(now: number) {
  const iso = new Date(now).toISOString();
  return `${iso.slice(0, 10).replaceAll('-', '')}-${iso.slice(11, 19).replaceAll(':', '')}-${crypto.randomUUID().slice(0, 4)}`;
}

/** Reports oldest first. */
export const reportsOf = (record: ProofRecord) => Object.values(record.reports ?? {}).sort((a, b) => a.createdAt - b.createdAt);

export function proofStore(householdRef: (path: string) => DatabaseReference, slug: string) {
  const book = householdRef(`proofdesk/${slug}`);
  return {
    async list(): Promise<ProofRecord[]> {
      const value = (await get(book)).val() as Record<string, ProofRecord> | null;
      return Object.values(value ?? {}).sort((a, b) => b.createdAt - a.createdAt);
    },
    create: (record: ProofRecord) => set(child(book, record.id), record),
    addReport: (record: ProofRecord, report: ProofReport) =>
      update(child(book, record.id), { [`reports/${report.id}`]: report, updatedAt: report.createdAt }),
    remove: (id: string) => remove(child(book, id)),
  };
}
export type ProofStore = ReturnType<typeof proofStore>;
