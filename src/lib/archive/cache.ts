// Small IndexedDB cache for complete private books and their independently versioned images.

interface CacheRow { version: string; value: unknown; }

const DATABASE = 'sami-writing-desk';
const STORE = 'archive';

function openDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
}

export async function readArchiveCache(key: string, version: string): Promise<unknown | undefined> {
  const database = await openDatabase();
  if (!database) return undefined;
  return new Promise((resolve) => {
    const request = database.transaction(STORE, 'readonly').objectStore(STORE).get(key);
    request.onsuccess = () => {
      const row = request.result as CacheRow | undefined;
      resolve(row?.version === version ? row.value : undefined);
    };
    request.onerror = () => resolve(undefined);
  });
}

export async function writeArchiveCache(key: string, version: string, value: unknown): Promise<void> {
  const database = await openDatabase();
  if (!database) return;
  await new Promise<void>((resolve) => {
    const request = database.transaction(STORE, 'readwrite').objectStore(STORE).put({ version, value }, key);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
  });
}
