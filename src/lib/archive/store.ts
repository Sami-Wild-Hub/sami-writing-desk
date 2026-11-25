// Reads of households/<id>/novelArchive for the signed-in reader, cached per book.
// clear() drops everything (sign-out, account change); reads started before it resolve undefined.
import { get, onValue, ref } from 'firebase/database';
import type { FirebaseHouseholdSession } from '../householdSession.ts';
import { parseTimelineData } from '../novelTimelineModel.ts';
import type { OutlineSyncState } from '../views/outline/sync.ts';
import { parsePeopleData } from '../novelPeopleModel.ts';
import { parseOwnerImages } from '../views/reader/image-schema.ts';
import { parseCatalog, type BookInfo, type LoadedBook } from './data.ts';
import { readArchiveCache, writeArchiveCache } from './cache.ts';
import { ArchiveBooks, cacheKey } from './books.ts';

export function createStore(session: FirebaseHouseholdSession, householdId: string, projectId = '',
  updated: (slug: string) => void = () => {}, failed: (slug: string, error: unknown) => void = () => {}) {
  const root = `households/${householdId}/novelArchive`;
  const syncRoot = `households/${householdId}/outlineSync`;
  let generation = 0;
  let catalog: Record<string, BookInfo> = {};

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
  const books = new ArchiveBooks(read, `${projectId}:${householdId}`, () => catalog, updated, failed);

  return {
    clear() { generation += 1; catalog = {}; books.clear(); },
    catalog: () => catalog,
    peek: (slug: string) => books.peek(slug),
    refresh: (slug: string) => books.refresh(slug),
    async restore(slug: string) {
      const book = await books.restore(slug);
      if (book) catalog[slug] = { title: book.manifest.title, scope: book.manifest.scope, version: book.version,
        imageVersion: book.imageVersion };
      return book;
    },
    async loadCatalog() {
      const data = await read('catalog');
      if (data === undefined) return undefined;
      catalog = parseCatalog(data);
      Object.entries(catalog).forEach(([slug, info]) => {
        const book = books.peek(slug);
        if (book?.complete && book.version === info.version && book.imageVersion !== info.imageVersion) {
          book.imagesRead = undefined; book.imagesValue = undefined; book.imagesRaw = undefined;
          updated(slug);
        }
        books.refresh(slug);
      });
      return catalog;
    },
    book: (slug: string) => books.book(slug),
    page: (slug: string, book: LoadedBook, path: string) => books.page(slug, book, path),
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
    timeline(slug: string, book: LoadedBook) {
      book.timelineRead ??= (book.complete ? Promise.resolve(book.timelineValue) : read(`books/${slug}/timeline`))
        .then(raw => raw === undefined ? undefined : parseTimelineData(raw));
      return book.timelineRead.then(
        (data) => { if (data === undefined) book.timelineRead = undefined; return data; },
        (error: unknown) => { book.timelineRead = undefined; throw error; });
    },
    people(slug: string, book: LoadedBook) {
      book.peopleRead ??= (book.complete ? Promise.resolve(book.peopleValue) : read(`books/${slug}/people`))
        .then(raw => raw === undefined ? undefined : parsePeopleData(raw));
      return book.peopleRead.then(
        (data) => { if (data === undefined) book.peopleRead = undefined; return data; },
        (error: unknown) => { book.peopleRead = undefined; throw error; });
    },
    images(slug: string, book: LoadedBook) {
      const at = generation;
      book.imagesRead ??= (async () => {
        if (book.imagesValue !== undefined) return book.imagesValue;
        const version = catalog[slug]?.imageVersion;
        const key = cacheKey('images', `${projectId}:${householdId}`, slug);
        if (version) {
          const local = await readArchiveCache(key);
          if (at !== generation) return undefined;
          if (local?.version === version) {
            try { return book.imagesValue = parseOwnerImages(local.value); }
            catch { /* A damaged local copy is replaced from the server below. */ }
          }
        }
        if (book.imagesRaw !== undefined && book.imageVersion === version) {
          try {
            const images = parseOwnerImages(book.imagesRaw);
            if (version) void writeArchiveCache(key, version, book.imagesRaw);
            return book.imagesValue = images;
          } catch { /* Invalid cached images must not prevent reading the page. */ }
        }
        const raw = await read(`books/${slug}/images`);
        if (raw === undefined) return undefined;
        const images = parseOwnerImages(raw);
        const actualVersion = await read(`books/${slug}/imageVersion`);
        if (actualVersion === undefined) return undefined;
        if (version && (actualVersion === null || actualVersion === version)) void writeArchiveCache(key, version, images);
        book.imageVersion = typeof actualVersion === 'string' ? actualVersion : version;
        return book.imagesValue = images;
      })();
      return book.imagesRead.then(
        data => { if (data === undefined) book.imagesRead = undefined; return data; },
        (error: unknown) => { book.imagesRead = undefined; throw error; });
    },
    search(slug: string, book: LoadedBook) {
      book.searchRead ??= books.search(slug, book);
      return book.searchRead.then(
        (data) => data,
        (error: unknown) => { book.searchRead = undefined; throw error; });
    },
  };
}
export type ArchiveStore = ReturnType<typeof createStore>;
