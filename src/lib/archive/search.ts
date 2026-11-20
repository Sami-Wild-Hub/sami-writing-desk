// Search overlay of the book page (/ or Ctrl/⌘K): full-text hits over the synced search
// texts, grouped by kind with filter chips; 正文 hits jump to their paragraph.
import { cleanTitle, ownerName, ownerPages, pageLabel, pathInfo } from '../labels.ts';
import type { PageEntry } from '../views/types.ts';
import { esc, icon } from './ui.ts';

export interface SearchSource {
  entries: Record<string, PageEntry>;
  /** Search texts by page key; undefined when superseded, null when not synced. */
  texts(): Promise<Record<string, string> | null | undefined>;
  readerHref(path: string, hash?: string): string | null;
}

const groups = ['人物与设定', '事件', '正文', '总览'] as const;
type Group = (typeof groups)[number];
const LIMIT = 60;

function groupOf(path: string): Group {
  if (path.startsWith('owners/') || path.startsWith('records/')) return '人物与设定';
  if (path.startsWith('events/') || path.startsWith('world-events/')) return path === 'events/INDEX.md' || path === 'events/NARRATIVE_INDEX.md' ? '总览' : '事件';
  return path.startsWith('source/') ? '正文' : '总览';
}

/** How a page is named in the hit list. */
export function hitTitle(entry: PageEntry) {
  const info = pathInfo(entry.path);
  const name = info.owner ? ownerName(info.owner) : '';
  if (info.kind === 'owner') return `${name} · ${ownerPages.find(([file]) => file === info.file)?.[1] ?? ''}`;
  if (info.kind === 'owner-note' || info.kind === 'owner-event') return `${cleanTitle(entry.title)} · ${name}`;
  if (info.kind === 'record') return `${name} · 简档`;
  return pageLabel(entry.path, entry.title);
}

interface Hit { group: Group; title: string; excerpt: string; href: string; titleMatch: boolean; position: number; }

function find(source: SearchSource, texts: Record<string, string>, query: string): Hit[] {
  const q = query.toLocaleLowerCase();
  const hits: Hit[] = [];
  for (const [key, entry] of Object.entries(source.entries)) {
    const text = texts[key] ?? '';
    const title = hitTitle(entry);
    const titleMatch = title.toLocaleLowerCase().includes(q) || entry.title.toLocaleLowerCase().includes(q);
    const position = text.toLocaleLowerCase().indexOf(q);
    if (!titleMatch && position < 0) continue;
    const group = groupOf(entry.path);
    let hash = '';
    let shown = title;
    if (group === '正文' && position >= 0) {
      const para = [...text.slice(0, position + q.length).matchAll(/\[P(\d+)\]/g)].pop()?.[1];
      if (para) { hash = `#p${para}`; shown = `${title} · ${para}段`; }
    }
    const href = source.readerHref(entry.path, hash);
    if (!href) continue;
    const excerpt = position < 0 ? text.slice(0, 80)
      : `${position > 38 ? '…' : ''}${text.slice(Math.max(0, position - 38), position + q.length + 80)}`;
    hits.push({ group, title: shown, excerpt, href, titleMatch, position });
  }
  return hits
    .sort((a, b) => Number(b.titleMatch) - Number(a.titleMatch) || (a.position < 0 ? 1e9 : a.position) - (b.position < 0 ? 1e9 : b.position))
    .slice(0, LIMIT)
    .sort((a, b) => groups.indexOf(a.group) - groups.indexOf(b.group));
}

const mark = (text: string, q: string) => {
  if (!q) return esc(text);
  const lower = text.toLocaleLowerCase();
  const needle = q.toLocaleLowerCase();
  let out = '';
  let at = 0;
  for (let i = lower.indexOf(needle); i >= 0; i = lower.indexOf(needle, at)) {
    out += `${esc(text.slice(at, i))}<mark>${esc(text.slice(i, i + q.length))}</mark>`;
    at = i + q.length;
  }
  return out + esc(text.slice(at));
};

export function mountSearch() {
  const box = document.createElement('div');
  box.className = 'search';
  box.hidden = true;
  box.innerHTML = `<div class="search-box" role="dialog" aria-modal="true" aria-label="搜索">
    <div class="search-top">${icon('search')}<input id="novel-search" type="search" enterkeyhint="search" placeholder="人物、事件、伏笔、原文…" aria-label="搜索小说知识库" autocomplete="off">
    <button type="button" class="iconbtn" data-close aria-label="关闭">${icon('close')}</button></div>
    <div class="search-chips" role="group" aria-label="范围"></div><div class="search-list" id="novel-results" aria-live="polite"></div>
    <div class="search-foot">↑↓ 选择 · Enter 打开 · Esc 关闭 · 正文结果直接跳到段落</div></div>`;
  document.body.append(box);
  const input = box.querySelector('input')!;
  const chips = box.querySelector<HTMLElement>('.search-chips')!;
  const list = box.querySelector<HTMLElement>('.search-list')!;
  let source: SearchSource | null = null;
  let recent: { title: string; group: Group; href: string }[] = [];
  let filter: Group | '全部' = '全部';
  let sel = 0;
  let serial = 0;
  let opener: Element | null = null;

  const links = () => [...list.querySelectorAll<HTMLAnchorElement>('.hit')];
  const select = (index: number) => {
    const all = links();
    sel = all.length ? (index + all.length) % all.length : 0;
    all.forEach((link, i) => link.classList.toggle('sel', i === sel));
    all[sel]?.scrollIntoView({ block: 'nearest' });
  };
  const hitHtml = (title: string, small: string, href: string, q: string) =>
    `<a class="hit" href="${esc(href)}"><b>${mark(title, q)}</b>${small ? `<small>${mark(small, q)}</small>` : ''}</a>`;

  const run = async () => {
    const q = input.value.trim();
    const run = ++serial;
    if (!q || !source) {
      chips.innerHTML = '';
      list.innerHTML = recent.length ? `<h5>最近查看</h5>${recent.map((item) => hitHtml(item.title, item.group, item.href, '')).join('')}`
        : '<div class="search-empty">输入人物、事件或原文里的字词</div>';
      return select(0);
    }
    const texts = await source.texts();
    if (run !== serial || !source) return;
    if (!texts) { list.innerHTML = `<div class="search-empty">${texts === null ? '全文检索尚未同步' : ''}</div>`; return; }
    const all = find(source, texts, q);
    const count = (group: string) => (group === '全部' ? all.length : all.filter((hit) => hit.group === group).length);
    chips.innerHTML = ['全部', ...groups].map((group) =>
      `<button type="button" class="chip" aria-pressed="${group === filter}" data-s="${group}">${group}<span class="n">${count(group)}</span></button>`).join('');
    const shown = all.filter((hit) => filter === '全部' || hit.group === filter);
    if (!shown.length) { list.innerHTML = `<div class="search-empty">没有找到“${esc(q)}”</div>`; return; }
    let html = '';
    let last = '';
    for (const hit of shown) {
      if (hit.group !== last) html += `<h5>${(last = hit.group)}</h5>`;
      html += hitHtml(hit.title, hit.excerpt, hit.href, q);
    }
    if (all.length === LIMIT) html += `<div class="search-empty">最多显示 ${LIMIT} 条，请换个更具体的词</div>`;
    list.innerHTML = html;
    select(0);
  };

  const close = () => {
    if (box.hidden) return;
    box.hidden = true;
    (opener as HTMLElement | null)?.focus?.();
  };
  input.addEventListener('input', () => void run());
  chips.addEventListener('click', (event) => {
    const chip = (event.target as Element).closest<HTMLElement>('[data-s]');
    if (!chip) return;
    filter = chip.dataset.s as Group;
    void run();
    input.focus();
  });
  // Hits are ordinary book links: the shell's click handler navigates, the overlay closes.
  box.addEventListener('click', (event) => {
    const target = event.target as Element;
    if (target === box || target.closest('[data-close]') || target.closest('.hit')) close();
  });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); select(sel + (event.key === 'ArrowDown' ? 1 : -1)); }
    else if (event.key === 'Enter') { event.preventDefault(); links()[sel]?.click(); }
  });
  box.addEventListener('keydown', (event) => { if (event.key === 'Escape') { event.preventDefault(); close(); } });

  return {
    open(query = '') {
      if (!source) return;
      opener = document.activeElement;
      box.hidden = false;
      if (query) input.value = query;
      void run();
      input.focus();
      input.select();
    },
    close,
    /** Points the overlay at a book (null when signed out); clears its state on change. */
    use(next: SearchSource | null) {
      if (next === source) return;
      source = next;
      recent = [];
      input.value = '';
      filter = '全部';
      close();
    },
    remember(entry: PageEntry, href: string) {
      recent = [{ title: hitTitle(entry), group: groupOf(entry.path), href }, ...recent.filter((item) => item.href !== href)].slice(0, 6);
    },
  };
}
export type SearchOverlay = ReturnType<typeof mountSearch>;
