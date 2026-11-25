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
  { id: 'proof', label: '校稿台', load: () => import('./proof/proofView.ts') },
  { id: 'outline', label: '大纲', load: () => import('./outline/outlineView.ts') },
  { id: 'people', label: '人物', load: () => import('./people/peopleView.ts') },
  { id: 'foreshadow', label: '伏笔表', load: () => import('./foreshadow/foreshadowView.ts') },
  { id: 'reader', label: '阅读', load: () => import('./reader/readerView.ts') },
  { id: 'timeline', label: '时间线', load: () => import('./timeline/timelineView.ts') },
] as const satisfies readonly NovelViewEntry[];

type Routable<T> = T extends { load: unknown } ? T : never;
export type NovelView = Routable<(typeof novelViews)[number]>['id'];

export const routableViews = novelViews.filter((view): view is Routable<typeof view> => 'load' in view);
