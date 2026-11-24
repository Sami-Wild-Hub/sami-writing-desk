// The reader's side column: 总览 pages, 人物与设定 grouped by domain with a name filter,
// and the 正文 chapter grid. Built once per book from the manifest.
import { domainLabels, domainOrder, overviewPages, ownerName, pathInfo } from '../../labels.ts';
import { esc } from '../../archive/ui.ts';
import { setDetailsOpen } from '../../archive/motion.ts';
import type { NovelViewHost } from '../types.ts';

export function buildToc(host: NovelViewHost) {
  const side = document.createElement('aside');
  side.className = 'side toc';
  side.setAttribute('aria-label', '目录');
  const paths = new Set(host.pathToKey.keys());
  const link = (path: string, label: string, extra = '') =>
    `<a class="navlink" href="${esc(host.readerHref(path)!)}" data-doc-path="${esc(path)}"${extra}>${label}</a>`;

  const overview = overviewPages.filter(([path]) => paths.has(path)).map(([path, label]) => link(path, esc(label))).join('');
  const timeline = `<a class="navlink" href="${esc(host.href({ view: 'timeline', doc: '' }))}" data-novel-view="timeline">故事时间线<span class="n">↗</span></a>`;

  const owners = new Map<string, { path: string; name: string }[]>();
  for (const path of paths) {
    const info = pathInfo(path);
    if (info.kind !== 'owner' || info.file !== 'START_HERE.md') continue;
    const list = owners.get(info.domain!) ?? [];
    list.push({ path, name: ownerName(info.owner!) });
    owners.set(info.domain!, list);
  }
  const domains = [...owners.keys()].sort((a, b) => (domainOrder.indexOf(a) + 1 || 99) - (domainOrder.indexOf(b) + 1 || 99) || a.localeCompare(b));
  const groups = domains.map((domain, i) => {
    const list = owners.get(domain)!.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
    return `<details${i === 0 ? ' open' : ''} data-domain="${esc(domain)}"><summary>${esc(domainLabels[domain] ?? domain)}<span class="n">${list.length}</span></summary>` +
      list.map(({ path, name }) => link(path, esc(name), ` data-name="${esc(name)}"`)).join('') + '</details>';
  }).join('');

  const chapters = [...paths].map((path) => ({ path, info: pathInfo(path) })).filter(({ info }) => info.kind === 'chapter')
    .sort((a, b) => a.info.chapter! - b.info.chapter!)
    .map(({ path, info }) => `<a href="${esc(host.readerHref(path)!)}" data-doc-path="${esc(path)}" title="第${info.chapter}章">${info.chapter}</a>`).join('');

  side.append(host.sideHead());
  side.insertAdjacentHTML('beforeend', `<h3>总览</h3>${overview}${timeline}` +
    (groups ? `<h3>人物与设定</h3><input class="filter" type="search" placeholder="筛选名字" aria-label="筛选人物与设定">${groups}` : '') +
    (chapters ? `<h3>正文</h3><nav class="chapters" aria-label="正文章节">${chapters}</nav>` : ''));

  side.querySelector<HTMLInputElement>('.filter')?.addEventListener('input', (event) => {
    const q = (event.target as HTMLInputElement).value.trim().toLocaleLowerCase();
    for (const group of side.querySelectorAll<HTMLDetailsElement>('details[data-domain]')) {
      let hits = 0;
      for (const a of group.querySelectorAll<HTMLElement>('[data-name]')) {
        a.hidden = Boolean(q) && !a.dataset.name!.toLocaleLowerCase().includes(q);
        if (!a.hidden) hits += 1;
      }
      group.hidden = !hits;
      if (q) setDetailsOpen(group, true);
    }
  });
  return side;
}

/** Marks the current page in the contents and opens its domain group. */
export function markToc(side: HTMLElement, path: string) {
  const ownerRoot = /^owners\/[^/]+\/[^/]+\//.exec(path)?.[0];
  for (const a of side.querySelectorAll<HTMLAnchorElement>('a[data-doc-path]')) {
    const own = a.dataset.docPath!;
    const on = own === path || Boolean(ownerRoot && own.startsWith(ownerRoot));
    if (on) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
    const group = a.closest('details');
    if (on && group) setDetailsOpen(group, true);
  }
}
