import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';

export function createRtdb({ credentials, databaseURL, household }) {
  const serviceAccount = typeof credentials === 'string' ? JSON.parse(readFileSync(credentials, 'utf8')) : credentials;
  const app = getApps()[0] ?? initializeApp({ credential: cert(serviceAccount), databaseURL });
  const root = getDatabase(app).ref(`households/${household}/outlineSync`);
  const book = slug => root.child(slug);
  return {
    async read(slug) { const snap = await book(slug).once('value'); return snap.val(); },
    async update(slug, values) { await book(slug).update(values); },
    async cas(slug, expected, values) {
      const result = await book(slug).transaction(current => {
        if ((current?.head?.repo?.commit ?? null) !== (expected.headRepoCommit ?? null)) return;
        if ((current?.live?.rev ?? null) !== (expected.liveRev ?? null)) return;
        return { ...(current ?? {}), ...values };
      });
      return result.committed;
    },
    coordinator: root.parent().child('_coordinator'),
  };
}

export async function loadCredentials(path) { return JSON.parse(await readFile(path, 'utf8')); }

export async function lease(rtdb, holder, host, { now = Date.now(), duration = 60_000 } = {}) {
  const ref = rtdb.coordinator;
  if (!ref) return true;
  const result = await ref.transaction(current => {
    if (current && current.holder !== holder && Number(current.until) > now) return;
    return { holder, host, until: now + duration, at: now };
  });
  return result.committed;
}

export async function release(rtdb, holder) {
  if (!rtdb.coordinator) return;
  await rtdb.coordinator.transaction(current => current?.holder === holder ? null : undefined);
}

