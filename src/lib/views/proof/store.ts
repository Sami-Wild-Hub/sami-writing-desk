// 校稿 requests in the household's private database. The page writes a queued request and
// re-queues checks; the host watcher (Protocols proofdesk) does the rest — fetches a Drive
// draft, sends both checks, writes each report under reports/<check>-<attempt> — and the
// page follows the book's records live. The newest records come first.
// Reads: households/<id>/proofdesk/<slug> (RTDB, records by id, live)
// Writes: households/<id>/proofdesk/<slug>/<id> (RTDB, {id,title,createdAt,updatedAt,source,draft|driveName,status,checks})
import { child, onValue, remove, set, update, type DatabaseReference } from 'firebase/database';
import { CHECKS, type Check } from './task.ts';

export type Status = 'queued' | 'sending' | 'sent' | 'done' | 'failed';
export const ENDED: readonly Status[] = ['done', 'failed'];

/** One step the watcher runs: the Drive fetch or a check. Only `status: queued` is the page's. */
export interface Step {
  status: Status;
  /** Which send this is, from 1; each send writes its own report. */
  attempt?: number;
  /** ChatGPT conversation link (fetch, open). */
  chat?: string;
  /** Luna run id (manuscript). */
  job?: string;
  /** Why it failed. */
  error?: string;
  /** When the status last changed (ms). */
  at?: number;
}
export interface ProofReport {
  id: string;
  check: Check;
  attempt: number;
  createdAt: number;
  /** The reply file exactly as received. */
  report: string;
  /** JSON string of the ParsedReport; absent when the reply could not be read. */
  parsed?: string;
  /** Where the reply is in the data repo. */
  path?: string;
}
export interface ProofRecord {
  id: string; title: string; createdAt: number; updatedAt: number;
  source: 'paste' | 'drive';
  /** The draft: pasted, or fetched from Drive by the watcher. */
  draft?: string;
  /** Chapter or file name to fetch from Drive. */
  driveName?: string;
  status: Status;
  error?: string;
  fetch?: Step;
  checks: Record<Check, Step>;
  reports?: Record<string, ProofReport>;
}

/** A time-ordered, path-safe id: 20261121-153012-1a2b (UTC). */
export function newId(now: number) {
  const iso = new Date(now).toISOString();
  return `${iso.slice(0, 10).replaceAll('-', '')}-${iso.slice(11, 19).replaceAll(':', '')}-${crypto.randomUUID().slice(0, 4)}`;
}

/** Reports oldest first, optionally of one check. */
export const reportsOf = (record: ProofRecord, check?: Check) => Object.values(record.reports ?? {})
  .filter((r) => !check || r.check === check)
  .sort((a, b) => a.createdAt - b.createdAt);

/** A new request: both checks queued. */
export function queuedRecord(fields: Pick<ProofRecord, 'id' | 'title' | 'createdAt' | 'source' | 'draft' | 'driveName'>): ProofRecord {
  const record: ProofRecord = { ...fields, updatedAt: fields.createdAt, status: 'queued', checks: { manuscript: { status: 'queued' }, open: { status: 'queued' } } };
  if (record.source === 'paste') delete record.driveName; else delete record.draft;
  return record;
}

export function proofStore(householdRef: (path: string) => DatabaseReference, slug: string) {
  const book = householdRef(`proofdesk/${slug}`);
  return {
    /** Calls `next` with every version of the book's records; returns the unsubscribe. */
    watch(next: (records: ProofRecord[]) => void, fail: (error: Error) => void) {
      return onValue(book, (snap) => {
        const value = snap.val() as Record<string, ProofRecord> | null;
        next(Object.values(value ?? {}).sort((a, b) => b.createdAt - a.createdAt));
      }, fail);
    },
    create: (record: ProofRecord) => set(child(book, record.id), record),
    /** Sends the given checks again (all when none is given); the watcher picks them up. */
    resend: (id: string, now: number, checks: readonly Check[] = CHECKS) => update(child(book, id), {
      status: 'queued', updatedAt: now, ...Object.fromEntries(checks.map((c) => [`checks/${c}/status`, 'queued'])),
    }),
    remove: (id: string) => remove(child(book, id)),
  };
}
export type ProofStore = ReturnType<typeof proofStore>;
