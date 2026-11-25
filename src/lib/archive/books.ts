// Reuse matching cached books, read fresh pages on demand, and download complete books in the background.
// Reads: novelArchive/books and IndexedDB/archive (Firebase JSON / structured clone).
// Writes: IndexedDB/archive (complete, versioned book snapshots).
import { readArchiveCache, writeArchiveCache } from './cache.ts';
import { newBook, parseBook, validateManifest, type BookInfo, type BookPayload, type LoadedBook } from './data.ts';

export const cacheKey = (kind: 'book' | 'images', identity: string, slug: string) => `${kind}:${identity}:${slug}`;

function fromPayload(payload: BookPayload, version?: string): LoadedBook {
  const book = newBook(payload.manifest);
  Object.entries(payload.pages).forEach(([key, html]) => book.pages.set(key, html));
  return Object.assign(book, { complete: true, version: payload.version ?? version,
    imageVersion: payload.imageVersion, timelineValue: payload.timeline, peopleValue: payload.people,
    imagesRaw: payload.images });
}

export class ArchiveBooks {
  private generation = 0;
  private books = new Map<string, LoadedBook>();
  private downloads = new Map<string, Promise<LoadedBook | undefined>>();

  constructor(private read: (path: string) => Promise<unknown>, private identity: string,
    private info: () => Record<string, BookInfo>,
    private failed: (slug: string, error: unknown) => void) {}

  clear() { this.generation++; this.books.clear(); this.downloads.clear(); }
  peek(slug: string) { return this.books.get(slug); }

  private async restore(slug: string) {
    const at = this.generation;
    const row = await readArchiveCache(cacheKey('book', this.identity, slug));
    if (at !== this.generation || !row) return undefined;
    const payload = parseBook(row.value);
    if (!payload) return undefined;
    const book = this.books.get(slug) ?? fromPayload(payload, row.version);
    const images = await readArchiveCache(cacheKey('images', this.identity, slug));
    if (at !== this.generation) return undefined;
    if (images) { book.imagesRaw = images.value; book.imageVersion = images.version; }
    this.books.set(slug, book);
    return book;
  }

  refresh(slug: string) {
    const book = this.books.get(slug), version = this.info()[slug]?.version;
    if (!book || (book.complete && version && book.version === version)) return;
    void this.download(slug).catch(error => this.failed(slug, error));
  }

  async book(slug: string) {
    const at = this.generation;
    const cached = this.books.get(slug) ?? await this.restore(slug);
    if (at !== this.generation) return undefined;
    if (cached && cached.version === this.info()[slug]?.version) { this.refresh(slug); return cached; }
    const raw = await this.read(`books/${slug}/manifest`);
    if (at !== this.generation || raw === undefined) return undefined;
    const manifest = validateManifest(raw);
    if (!manifest) throw new Error('小说目录缺失或格式无效');
    const book = newBook(manifest);
    book.version = this.info()[slug]?.version;
    this.books.set(slug, book);
    this.refresh(slug);
    return book;
  }

  download(slug: string) {
    const existing = this.downloads.get(slug);
    if (existing) return existing;
    const at = this.generation;
    const pending = this.fetch(slug, at).finally(() => {
      if (at === this.generation) this.downloads.delete(slug);
    });
    this.downloads.set(slug, pending);
    return pending;
  }

  private async fetch(slug: string, at: number) {
    const version = this.info()[slug]?.version;
    const raw = await this.read(`books/${slug}`);
    if (at !== this.generation || raw === undefined) return undefined;
    const payload = parseBook(raw);
    if (!payload) throw new Error('小说数据缺失或格式无效');
    let book = fromPayload(payload, version);
    const previous = this.books.get(slug);
    // The manifest and full snapshot describe the same publication: keep mounted views.
    if (previous && !previous.complete && previous.version === book.version) {
      previous.pages = book.pages;
      previous.timelineValue = book.timelineValue;
      previous.peopleValue = book.peopleValue;
      previous.imagesRaw = book.imagesRaw;
      previous.imageVersion = book.imageVersion;
      previous.complete = true;
      book = previous;
    }
    this.books.set(slug, book);
    if (book.version) void writeArchiveCache(cacheKey('book', this.identity, slug), book.version, payload);
    if (payload.version && this.info()[slug]?.version === version) this.info()[slug].version = payload.version;
    if (payload.imageVersion && payload.images !== undefined) {
      void writeArchiveCache(cacheKey('images', this.identity, slug), payload.imageVersion, payload.images);
    }
    return book;
  }

  async page(slug: string, book: LoadedBook, path: string) {
    const key = book.pathToKey.get(path);
    if (!key) return undefined;
    const cached = book.pages.get(key);
    if (cached !== undefined || book.complete) return cached;
    const raw = await this.read(`books/${slug}/pages/${key}`);
    if (typeof raw !== 'string') return undefined;
    book.pages.set(key, raw);
    return raw;
  }

  async search(slug: string, book: LoadedBook) {
    const complete = book.complete ? book : await this.download(slug);
    if (!complete) return undefined;
    return Object.fromEntries([...complete.pages].map(([key, html]) => {
      const root = document.createElement('div');
      root.innerHTML = html;
      return [key, (root.textContent ?? '').replace(/\s+/g, ' ').trim()];
    }));
  }
}
