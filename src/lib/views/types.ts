// Contract between the book-page shell and its views (tabs). A view module's default
// export is a CreateNovelView; the shell gives it a host and a container of its own.
import type { NovelPeopleData } from '../novelPeopleModel.ts';
import type { DatabaseReference } from 'firebase/database';
import type { NovelTimelineData } from '../novelTimelineModel.ts';
import type { NovelRoute } from '../novelArchiveRoute.ts';
import type { OutlinePayload } from './outline/schema.ts';

export interface PageEntry { path: string; title: string; section: string; }

export interface NovelViewHost {
  /** The view's own container; a `.side` inside it is the phone drawer. */
  root: HTMLElement;
  slug: string;
  bookTitle: string;
  scope: string;
  entries: Record<string, PageEntry>;
  pathToKey: Map<string, string>;
  /** Compiled page HTML; undefined when the reader signed out or moved on meanwhile. */
  read(path: string): Promise<string | undefined>;
  /** The book's timeline, read once and shared by all views; null when not synced. */
  timeline(): Promise<NovelTimelineData | null | undefined>;
  outline(): Promise<OutlinePayload | null | undefined>;
  /** Local drafts are isolated by Firebase project, household, signed-in account and book. */
  outlineDraftKey: string;
  /** The book's people table, read once; null when not synced. */
  people(): Promise<NovelPeopleData | null | undefined>;
  /** Kept per book and view while signed in, across view switches and book switches. */
  memo: Record<string, unknown>;
  /** A place below households/<id>/ in the household's private database (e.g. proofdesk/<slug>). */
  householdRef(path: string): DatabaseReference;
  href(route: Partial<NovelRoute>): string;
  /** Reader URL for a compiled page, or null when the page was not synced. */
  readerHref(path: string, hash?: string): string | null;
  /** Navigates within this book; the rest of the route stays as it is. */
  go(route: Partial<NovelRoute>, via?: 'nav' | 'link'): void;
  message(text: string): void;
  toast(text: string): void;
  /** Phone drawer (the view's `.side`). */
  setDrawer(open: boolean): void;
  /** A side-column header for phones: book name, scope and the way back to the shelf. */
  sideHead(): HTMLElement;
}

export interface ShowContext {
  /** False once a newer navigation started or the reader signed out. */
  latest(): boolean;
  /** load: first render; nav: tabs, contents, pagers; link: a link in the content, search or a card; pop: history. */
  via: 'load' | 'nav' | 'link' | 'pop';
  /** The scroll position to restore when going back in history. */
  restore?: number;
}

export interface NovelViewInstance {
  /** Shows what the route names; resolves false when superseded. */
  show(route: NovelRoute, ctx: ShowContext): Promise<boolean>;
  /** Called before the container is hidden (e.g. to remember the scroll position). */
  hide(): void;
  dispose(): void;
  /** What 「← 返回」 calls this place, e.g. the page title. */
  label(): string;
}

export type CreateNovelView = (host: NovelViewHost) => NovelViewInstance;
