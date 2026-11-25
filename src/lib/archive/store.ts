// Reads of households/<id>/novelArchive for the signed-in reader, cached per book.
// clear() drops everything (sign-out, account change); reads started before it resolve undefined.
import { get, onValue, ref } from 'firebase/database';
import type { FirebaseHouseholdSession } from '../householdSession.ts';
import { parseTimelineData } from '../novelTimelineModel.ts';
import type { OutlineSyncState } from '../views/outline/sync.ts';
import { parsePeopleData } from '../novelPeopleModel.ts';
import { parseOwnerImages } from '../views/reader/image-schema.ts';
import { newBook, parseCatalog, parseSearch, validateManifest, type BookInfo, type LoadedBook } from './data.ts';

export function createStore(session: FirebaseHouseholdSession, householdId: string) {
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
      const data = await read(`books/${slug}/manifest`);
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
    images(slug: string, book: LoadedBook) {
      book.imagesRead ??= read(`books/${slug}/images`).then(raw => raw === undefined ? undefined : parseOwnerImages(raw));
      return book.imagesRead.then(
        data => { if (data === undefined) book.imagesRead = undefined; return data; },
        (error: unknown) => { book.imagesRead = undefined; throw error; });
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
