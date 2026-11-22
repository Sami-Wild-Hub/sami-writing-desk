import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { cert, deleteApp, getApps, initializeApp } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';

async function transaction(ref, update) {
  const listener = () => {};
  ref.on('value', listener);
  try {
    await ref.once('value');
    return await ref.transaction(update);
  } finally { ref.off('value', listener); }
}

export function createRtdb({ credentials, databaseURL, household }) {
  const serviceAccount = typeof credentials === 'string' ? JSON.parse(readFileSync(credentials, 'utf8')) : credentials;
  const existing = getApps()[0];
  const app = existing ?? initializeApp({ credential: cert(serviceAccount), databaseURL });
  const root = getDatabase(app).ref(`households/${household}/outlineSync`);
  const book = slug => root.child(slug);
  let closed = false;
  return {
    async read(slug) { const snap = await book(slug).once('value'); return snap.val(); },
    async update(slug, values) { await book(slug).update(values); },
    async cas(slug, expected, values) {
      const ref = book(slug);
      const result = await transaction(ref, current => {
        if ((current?.head?.repo?.commit ?? null) !== (expected.headRepoCommit ?? null)) return;
        if ((current?.live?.rev ?? null) !== (expected.liveRev ?? null)) return;
        return { ...(current ?? {}), ...values };
      });
      if (!result.committed) {
        const actual = (await ref.once('value')).val();
        const current = {
          headRepoCommit: actual?.head?.repo?.commit ?? null,
          liveRev: actual?.live?.rev ?? null,
        };
        const error = new Error(`RTDB compare-and-set failed for ${slug}: expected ${JSON.stringify(expected)} actual ${JSON.stringify(current)}`);
        error.rtdbConflict = true;
        throw error;
      }
      return result.committed;
    },
    subscribe(listener) {
      const onValue = snapshot => listener(snapshot.val());
      root.on('value', onValue);
      return () => root.off('value', onValue);
    },
    coordinator: root.child('_coordinator'),
    async close() {
      if (!existing && !closed) { closed = true; await deleteApp(app); }
    },
  };
}

export async function loadCredentials(path) { return JSON.parse(await readFile(path, 'utf8')); }

export async function lease(rtdb, holder, host, { now = Date.now(), duration = 60_000 } = {}) {
  const ref = rtdb.coordinator;
  if (!ref) return true;
  const result = await transaction(ref, current => {
    if (current && current.holder !== holder && Number(current.until) > now) return;
    return { holder, host, until: now + duration, at: now };
  });
  return result.committed;
}

export async function release(rtdb, holder) {
  if (!rtdb.coordinator) return;
  await transaction(rtdb.coordinator, current => current?.holder === holder ? null : undefined);
}

