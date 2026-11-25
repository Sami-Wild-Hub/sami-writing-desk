// Small IndexedDB cache for complete private books and their independently versioned images.

export interface CacheRow { version: string; value: unknown; }

const DATABASE = 'sami-writing-desk';
const STORE = 'archive';

function openDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    let request: IDBOpenDBRequest;
    try { request = indexedDB.open(DATABASE, 1); }
    catch { resolve(null); return; }
    let blocked = false;
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => {
      if (blocked) request.result.close();
      else resolve(request.result);
    };
    request.onerror = () => resolve(null);
    request.onblocked = () => { blocked = true; resolve(null); };
  });
}

export async function readArchiveCache(key: string): Promise<CacheRow | undefined> {
  const database = await openDatabase();
  if (!database) return undefined;
  return new Promise((resolve) => {
    let transaction: IDBTransaction;
    try { transaction = database.transaction(STORE, 'readonly'); }
    catch { database.close(); resolve(undefined); return; }
    const request = transaction.objectStore(STORE).get(key);
    request.onsuccess = () => {
      const row = request.result as CacheRow | undefined;
      resolve(typeof row?.version === 'string' ? row : undefined);
    };
    request.onerror = () => resolve(undefined);
    transaction.oncomplete = () => database.close();
    transaction.onabort = () => { database.close(); resolve(undefined); };
  });
}

export async function writeArchiveCache(key: string, version: string, value: unknown): Promise<void> {
  const database = await openDatabase();
  if (!database) return;
  await new Promise<void>((resolve) => {
    try {
      const transaction = database.transaction(STORE, 'readwrite');
      transaction.oncomplete = transaction.onabort = transaction.onerror = () => { database.close(); resolve(); };
      transaction.objectStore(STORE).put({ version, value }, key);
    } catch { database.close(); resolve(); }
  });
}
