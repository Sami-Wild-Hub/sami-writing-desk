// Shapes read from households/<id>/novelArchive (read-only): catalog and the complete
// book payload. Validation is strict so malformed data never reaches the DOM as paths.
import type { PageEntry } from '../views/types.ts';
import type { NovelTimelineData } from '../novelTimelineModel.ts';
import type { OutlineSyncState } from '../views/outline/sync.ts';
import type { NovelPeopleData } from '../novelPeopleModel.ts';
import type { OwnerImages } from '../views/reader/image-schema.ts';

export interface BookInfo { title: string; scope?: string; pageCount?: number; version?: string; imageVersion?: string; }
export interface BookManifest { title: string; scope?: string; entries: Record<string, PageEntry>; }
export interface BookPayload {
  version?: string;
  imageVersion?: string;
  manifest: BookManifest;
  pages: Record<string, string>;
  timeline?: unknown;
  people?: unknown;
  images?: unknown;
}
export interface LoadedBook {
  version?: string;
  imageVersion?: string;
  complete: boolean;
  manifest: BookManifest;
  pathToKey: Map<string, string>;
  pages: Map<string, string>;
  /** Pending or finished parsing, shared by every view and the search overlay. */
  searchRead?: Promise<Record<string, string> | null | undefined>;
  timelineRead?: Promise<NovelTimelineData | null | undefined>;
  outlineHeadRead?: Promise<OutlineSyncState['head'] | null | undefined>;
  outlineSyncRead?: Promise<OutlineSyncState | null | undefined>;
  peopleRead?: Promise<NovelPeopleData | null | undefined>;
  imagesRead?: Promise<OwnerImages | null | undefined>;
  timelineValue?: unknown;
  peopleValue?: unknown;
  imagesRaw?: unknown;
  imagesValue?: OwnerImages | null;
  memo: Record<string, Record<string, unknown>>;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

const KEY = /^[a-zA-Z0-9_-]+$/;

export function parseCatalog(data: unknown) {
  const catalog: Record<string, BookInfo> = {};
  if (!isRecord(data)) return catalog;
  for (const [slug, book] of Object.entries(data)) {
    if (/^[a-z0-9-]+$/.test(slug) && isRecord(book) && typeof book.title === 'string') {
      catalog[slug] = { title: book.title, scope: typeof book.scope === 'string' ? book.scope : undefined,
        pageCount: typeof book.pageCount === 'number' ? book.pageCount : undefined,
        version: typeof book.version === 'string' ? book.version : undefined,
        imageVersion: typeof book.imageVersion === 'string' ? book.imageVersion : undefined };
    }
  }
  return catalog;
}

export function validateManifest(value: unknown): BookManifest | null {
  if (!isRecord(value) || typeof value.title !== 'string' || !isRecord(value.entries)) return null;
  const entries: Record<string, PageEntry> = {};
  for (const [key, entry] of Object.entries(value.entries)) {
    if (!KEY.test(key) || !isRecord(entry) || typeof entry.path !== 'string' ||
        typeof entry.title !== 'string' || typeof entry.section !== 'string') return null;
    entries[key] = { path: entry.path, title: entry.title, section: entry.section };
  }
  return { title: value.title, scope: typeof value.scope === 'string' ? value.scope : undefined, entries };
}

export function newBook(manifest: BookManifest): LoadedBook {
  const pathToKey = new Map(Object.entries(manifest.entries).map(([key, entry]) => [entry.path, key]));
  return { manifest, pathToKey, pages: new Map(), memo: {}, complete: false };
}

export function parseBook(value: unknown): BookPayload | null {
  if (!isRecord(value)) return null;
  const manifest = validateManifest(value.manifest);
  if (!manifest || !isRecord(value.pages)) return null;
  const pages: Record<string, string> = {};
  for (const [key, html] of Object.entries(value.pages)) {
    if (!KEY.test(key) || typeof html !== 'string') return null;
    pages[key] = html;
  }
  const keys = Object.keys(manifest.entries);
  if (!keys.length || keys.some(key => pages[key] === undefined)) return null;
  return { manifest, pages, timeline: value.timeline ?? null, people: value.people ?? null, images: value.images,
    version: typeof value.version === 'string' ? value.version : undefined,
    imageVersion: typeof value.imageVersion === 'string' ? value.imageVersion : undefined };
}
