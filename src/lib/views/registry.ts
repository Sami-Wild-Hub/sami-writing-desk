// The book page's views (tabs), in tab order. Adding a view = one module under
// src/lib/views/<id>/ whose default export is a CreateNovelView, plus one line here.
// Entries with `soon` instead of `load` are placeholders shown as 「即将」.
import type { CreateNovelView } from './types.ts';

interface NovelViewEntry {
  id: string;
  label: string;
  load?: () => Promise<{ default: CreateNovelView }>;
  soon?: string;
}

export const novelViews = [
  { id: 'reader', label: '阅读', load: () => import('./reader/readerView.ts') },
  { id: 'timeline', label: '时间线', load: () => import('./timeline/timelineView.ts') },
  { id: 'people', label: '人物', load: () => import('./people/peopleView.ts') },
  { id: 'proof', label: '校稿台', soon: '校稿台：之后上线，这里先留位置' },
] as const satisfies readonly NovelViewEntry[];

type Routable<T> = T extends { load: unknown } ? T : never;
export type NovelView = Routable<(typeof novelViews)[number]>['id'];

export const routableViews = novelViews.filter((view): view is Routable<typeof view> => 'load' in view);
