// Shapes read from households/<id>/novelArchive (read-only): catalog, book manifest,
// search texts. Validation is strict so malformed data never reaches the DOM as paths.
import type { PageEntry } from '../views/types.ts';
import type { NovelTimelineData } from '../novelTimelineModel.ts';
import type { OutlinePayload } from '../views/outline/schema.ts';

export interface BookInfo { title: string; scope?: string; pageCount?: number; hasOutline?: boolean; }
export interface BookManifest { title: string; scope?: string; entries: Record<string, PageEntry>; hasOutline?: boolean; }
export interface LoadedBook {
  manifest: BookManifest;
  pathToKey: Map<string, string>;
  pages: Map<string, string>;
  /** Pending or finished reads, shared by every view and the search overlay. */
  searchRead?: Promise<Record<string, string> | null | undefined>;
  timelineRead?: Promise<NovelTimelineData | null | undefined>;
  outlineRead?: Promise<OutlinePayload | null | undefined>;
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
        pageCount: typeof book.pageCount === 'number' ? book.pageCount : undefined, hasOutline: book.hasOutline === true };
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
  return { title: value.title, scope: typeof value.scope === 'string' ? value.scope : undefined, entries, hasOutline: value.hasOutline === true };
}

export function newBook(manifest: BookManifest): LoadedBook {
  const pathToKey = new Map(Object.entries(manifest.entries).map(([key, entry]) => [entry.path, key]));
  return { manifest, pathToKey, pages: new Map(), memo: {} };
}

export function parseSearch(raw: unknown) {
  if (!isRecord(raw)) return null;
  return Object.fromEntries(Object.entries(raw).filter(([key, value]) => KEY.test(key) && typeof value === 'string')) as Record<string, string>;
}
