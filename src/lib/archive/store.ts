// Reads of households/<id>/novelArchive for the signed-in reader, cached per book.
// clear() drops everything (sign-out, account change); reads started before it resolve undefined.
import { get, ref } from 'firebase/database';
import type { FirebaseHouseholdSession } from '../householdSession.ts';
import { parseTimelineData } from '../novelTimelineModel.ts';
import type { OutlineSyncState } from '../views/outline/sync.ts';
import { parsePeopleData } from '../novelPeopleModel.ts';
import { newBook, parseCatalog, parseSearch, validateManifest, type BookInfo, type LoadedBook } from './data.ts';

export function createStore(session: FirebaseHouseholdSession, householdId: string) {
  const root = `households/${householdId}/novelArchive`;
  const syncRoot = `households/${householdId}/outlineSync`;
  const cachePrefix = `swd:archive:${householdId}:`;
  let generation = 0;
  let catalog: Record<string, BookInfo> = {};
  let books = new Map<string, LoadedBook>();

  const cacheKey = (path: string) => `${cachePrefix}${path}`;
  const readCache = (path: string) => {
    try {
      const raw = globalThis.localStorage.getItem(cacheKey(path));
      return raw === null ? undefined : JSON.parse(raw) as unknown;
    } catch { return undefined; }
  };
  const writeCache = (path: string, value: unknown) => {
    try { globalThis.localStorage.setItem(cacheKey(path), JSON.stringify(value)); } catch { /* best effort */ }
  };
  const clearCache = () => {
    try {
      for (let index = globalThis.localStorage.length - 1; index >= 0; index -= 1) {
        const key = globalThis.localStorage.key(index);
        if (key?.startsWith(cachePrefix)) globalThis.localStorage.removeItem(key);
      }
    } catch { /* best effort */ }
  };

  /** The value at a path below novelArchive; undefined when cleared or signed out meanwhile. */
  const read = async (path: string) => {
    const at = generation;
    const snapshot = await get(ref(session.database, `${root}/${path}`));
    return at === generation && session.getStatus().connection === 'connected' ? snapshot.val() as unknown : undefined;
  };
  const readSync = async (path: string) => {
    const at = generation;
    const snapshot = await get(ref(session.database, `${syncRoot}/${path}`));
    return at === generation && session.getStatus().connection === 'connected' ? snapshot.val() as unknown : undefined;
  };
  const cachedRead = async (path: string) => {
    try {
      const value = await read(path);
      if (value !== undefined) writeCache(path, value);
      return value;
    } catch (error) {
      const value = readCache(path);
      if (value !== undefined) return value;
      throw error;
    }
  };
  const cachedSyncRead = async (path: string) => {
    try {
      const value = await readSync(path);
      if (value !== undefined) writeCache(`sync/${path}`, value);
      return value;
    } catch (error) {
      const value = readCache(`sync/${path}`);
      if (value !== undefined) return value;
      throw error;
    }
  };

  return {
    clear() { generation += 1; catalog = {}; books = new Map(); clearCache(); },
    catalog: () => catalog,
    async loadCatalog() {
      const data = await cachedRead('catalog');
      if (data === undefined) return undefined;
      catalog = parseCatalog(data);
      return catalog;
    },
    async book(slug: string) {
      const cached = books.get(slug);
      if (cached) return cached;
      const data = await cachedRead(`books/${slug}/manifest`);
      if (data === undefined) return undefined;
      const manifest = validateManifest(data);
      if (!manifest) throw new Error('小说索引缺失或格式无效');
      const book = books.get(slug) ?? newBook(manifest);
      books.set(slug, book);
      return book;
    },
    async page(slug: string, book: LoadedBook, path: string) {
      const key = book.pathToKey.get(path);
      if (!key) return undefined;
      const cached = book.pages.get(key);
      if (cached !== undefined) return cached;
      const html = await read(`books/${slug}/pages/${key}`);
      if (html === undefined) return undefined;
      if (typeof html !== 'string') throw new Error('页面未同步');
      book.pages.set(key, html);
      return html;
    },
    // Outline presence and content come from outlineSync, never novelArchive.
    outlineHead(slug: string, book: LoadedBook) {
      book.outlineHeadRead ??= cachedSyncRead(`${slug}/head`).then(raw => raw === undefined ? undefined : raw as OutlineSyncState['head']);
      return book.outlineHeadRead.then(
        data => { if (data === undefined) book.outlineHeadRead = undefined; return data; },
        (error: unknown) => { book.outlineHeadRead = undefined; throw error; });
    },
    outline(slug: string, book: LoadedBook) {
      book.outlineSyncRead ??= cachedSyncRead(slug).then(raw => raw === undefined ? undefined : raw as OutlineSyncState);
      return book.outlineSyncRead.then(
        data => { if (data === undefined) book.outlineSyncRead = undefined; return data; },
        (error: unknown) => { book.outlineSyncRead = undefined; throw error; });
    },
    timeline(slug: string, book: LoadedBook) {
      book.timelineRead ??= read(`books/${slug}/timeline`).then((raw) => (raw === undefined ? undefined : parseTimelineData(raw)));
      return book.timelineRead.then(
        (data) => { if (data === undefined) book.timelineRead = undefined; return data; },
        (error: unknown) => { book.timelineRead = undefined; throw error; });
    },
    people(slug: string, book: LoadedBook) {
      book.peopleRead ??= read(`books/${slug}/people`).then((raw) => (raw === undefined ? undefined : parsePeopleData(raw)));
      return book.peopleRead.then(
        (data) => { if (data === undefined) book.peopleRead = undefined; return data; },
        (error: unknown) => { book.peopleRead = undefined; throw error; });
    },
    search(slug: string, book: LoadedBook) {
      book.searchRead ??= read(`books/${slug}/search`).then((raw) => (raw === undefined ? undefined : parseSearch(raw)));
      return book.searchRead.then(
        (data) => { if (data === undefined) book.searchRead = undefined; return data; },
        (error: unknown) => { book.searchRead = undefined; throw error; });
    },
  };
}
export type ArchiveStore = ReturnType<typeof createStore>;
