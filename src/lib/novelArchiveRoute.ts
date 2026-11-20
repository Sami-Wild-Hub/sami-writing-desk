// The book page keeps all of its state in the URL:
// /book/?book=<slug>&view=<view>&doc=<path>#<fragment>.
// `view` is omitted for the reader; the views themselves are listed in views/registry.ts.
import { routableViews, type NovelView } from './views/registry.ts';

export type { NovelView };

export interface NovelRoute { book: string; view: NovelView; doc: string; hash: string; }

export function parseNovelRoute(url: URL): NovelRoute {
  const book = url.searchParams.get('book') ?? '';
  const view = url.searchParams.get('view');
  return {
    book: /^[a-z0-9-]+$/.test(book) ? book : '',
    view: routableViews.find((item) => item.id === view)?.id ?? 'reader',
    doc: url.searchParams.get('doc') ?? '',
    hash: url.hash,
  };
}

export function novelRouteHref(current: URL, route: NovelRoute): string {
  const target = new URL(current.href);
  target.search = '';
  if (route.book) target.searchParams.set('book', route.book);
  if (route.view !== 'reader') target.searchParams.set('view', route.view);
  if (route.doc) target.searchParams.set('doc', route.doc);
  target.hash = route.hash;
  return `${target.pathname}${target.search}${target.hash}`;
}
