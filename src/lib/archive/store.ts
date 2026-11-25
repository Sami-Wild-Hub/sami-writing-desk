// Reads of households/<id>/novelArchive for the signed-in reader, cached per book.
// clear() drops everything (sign-out, account change); reads started before it resolve undefined.
import { get, onValue, ref } from 'firebase/database';
import type { FirebaseHouseholdSession } from '../householdSession.ts';
import { parseTimelineData } from '../novelTimelineModel.ts';
import type { OutlineSyncState } from '../views/outline/sync.ts';
import { parsePeopleData } from '../novelPeopleModel.ts';
import { parseOwnerImages } from '../views/reader/image-schema.ts';
import { parseBook, parseCatalog, newBook, type BookInfo, type BookPayload, type LoadedBook } from './data.ts';
import { readArchiveCache, writeArchiveCache } from './cache.ts';

const cacheKey = (kind: 'book' | 'images', householdId: string, slug: string) => `${kind}:${householdId}:${slug}`;

function bookFromPayload(payload: BookPayload, useImages: boolean): LoadedBook {
  const book = newBook(payload.manifest);
  Object.entries(payload.pages).forEach(([key, html]) => book.pages.set(key, html));
  book.timelineValue = payload.timeline;
  book.peopleValue = payload.people;
  if (useImages) book.imagesRaw = payload.images;
  return book;
}

export function createStore(session: FirebaseHouseholdSession, householdId: string, projectId = '') {
  const root = `households/${householdId}/novelArchive`;
  const syncRoot = `households/${householdId}/outlineSync`;
  let generation = 0;
  let catalog: Record<string, BookInfo> = {};
  let books = new Map<string, LoadedBook>();

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

  return {
    clear() { generation += 1; catalog = {}; books = new Map(); },
    catalog: () => catalog,
    async loadCatalog() {
      const data = await read('catalog');
      if (data === undefined) return undefined;
      catalog = parseCatalog(data);
      return catalog;
    },
    async book(slug: string) {
      const cached = books.get(slug);
      if (cached) return cached;
      const version = catalog[slug]?.version;
      const key = cacheKey('book', `${projectId}:${householdId}`, slug);
      let payload: BookPayload | null = null;
      let fromCache = false;
      if (version) {
        const local = parseBook(await readArchiveCache(key, version));
        if (local) { payload = local; fromCache = true; }
      }
      if (!payload) {
        const data = await read(`books/${slug}`);
        if (data === undefined) return undefined;
        payload = parseBook(data);
        if (!payload) throw new Error('小说数据缺失或格式无效');
        if (version) await writeArchiveCache(key, version, payload);
      }
      const book = books.get(slug) ?? bookFromPayload(payload, !fromCache);
      if (!fromCache && version && catalog[slug]?.imageVersion && payload.images !== undefined) {
        await writeArchiveCache(cacheKey('images', `${projectId}:${householdId}`, slug), catalog[slug].imageVersion!, payload.images);
      }
      books.set(slug, book);
      return book;
    },
    async page(_slug: string, book: LoadedBook, path: string) {
      const key = book.pathToKey.get(path);
      if (!key) return undefined;
      const cached = book.pages.get(key);
      if (cached !== undefined) return cached;
      return book.pages.get(key);
    },
    // Outline presence and content come from outlineSync, never novelArchive.
    outlineHead(slug: string, book: LoadedBook) {
      book.outlineHeadRead ??= readSync(`${slug}/head`).then(raw => raw === undefined ? undefined : raw as OutlineSyncState['head']);
      return book.outlineHeadRead.then(
        data => { if (data == null) book.outlineHeadRead = undefined; return data; },
        (error: unknown) => { book.outlineHeadRead = undefined; throw error; });
    },
    watchOutline(slug: string, next: (exists: boolean) => void) {
      return onValue(ref(session.database, `${syncRoot}/${slug}/head`), snapshot => next(snapshot.exists()), () => next(false));
    },
    outline(slug: string, book: LoadedBook) {
      book.outlineSyncRead ??= readSync(slug).then(raw => raw === undefined ? undefined : raw as OutlineSyncState);
      return book.outlineSyncRead.then(
        data => { if (data === undefined) book.outlineSyncRead = undefined; return data; },
        (error: unknown) => { book.outlineSyncRead = undefined; throw error; });
    },
    timeline(_slug: string, book: LoadedBook) {
      book.timelineRead ??= Promise.resolve(book.timelineValue === undefined ? undefined : parseTimelineData(book.timelineValue));
      return book.timelineRead.then(
        (data) => { if (data === undefined) book.timelineRead = undefined; return data; },
        (error: unknown) => { book.timelineRead = undefined; throw error; });
    },
    people(_slug: string, book: LoadedBook) {
      book.peopleRead ??= Promise.resolve(book.peopleValue === undefined ? undefined : parsePeopleData(book.peopleValue));
      return book.peopleRead.then(
        (data) => { if (data === undefined) book.peopleRead = undefined; return data; },
        (error: unknown) => { book.peopleRead = undefined; throw error; });
    },
    images(slug: string, book: LoadedBook) {
      book.imagesRead ??= (async () => {
        if (book.imagesValue !== undefined) return book.imagesValue;
        const version = catalog[slug]?.imageVersion;
        const key = cacheKey('images', `${projectId}:${householdId}`, slug);
        if (version) {
          const local = await readArchiveCache(key, version);
          if (local !== undefined) return book.imagesValue = parseOwnerImages(local);
        }
        if (book.imagesRaw !== undefined) {
          const images = parseOwnerImages(book.imagesRaw);
          if (version) await writeArchiveCache(key, version, book.imagesRaw);
          return book.imagesValue = images;
        }
        const raw = await read(`books/${slug}/images`);
        if (raw === undefined) return undefined;
        const images = parseOwnerImages(raw);
        if (version) await writeArchiveCache(key, version, images);
        return book.imagesValue = images;
      })();
      return book.imagesRead.then(
        data => { if (data === undefined) book.imagesRead = undefined; return data; },
        (error: unknown) => { book.imagesRead = undefined; throw error; });
    },
    search(_slug: string, book: LoadedBook) {
      book.searchRead ??= Promise.resolve(Object.fromEntries([...book.pages].map(([key, html]) => {
        const root = document.createElement('div');
        root.innerHTML = html;
        return [key, (root.textContent ?? '').replace(/\s+/g, ' ').trim()];
      })));
      return book.searchRead.then(
        (data) => data,
        (error: unknown) => { book.searchRead = undefined; throw error; });
    },
  };
}
export type ArchiveStore = ReturnType<typeof createStore>;
