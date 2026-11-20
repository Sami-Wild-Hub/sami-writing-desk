// One reader page: crumb, title, 阅读设置 (Aa), meta pills, owner sub-tabs, the compiled
// prose (links relabelled, paragraph numbers, card and column lists) and the pager.
// Timeline-derived extras (event counts, 本章写到的事件) are added once the timeline is read.
import { cleanTitle, domainLabels, ownerName, ownerPages, pageLabel, parseLoc, pathInfo, pointLabel, type PathInfo } from '../../labels.ts';
import type { NovelTimelineData } from '../../novelTimelineModel.ts';
import { esc } from '../../archive/ui.ts';
import type { NovelViewHost } from '../types.ts';
import { remapLinks } from './links.ts';

export interface ReaderPage { inner: HTMLElement; title: string; info: PathInfo; }

const titleOf = (host: NovelViewHost, path: string) => {
  const key = host.pathToKey.get(path);
  return key ? pageLabel(path, host.entries[key].title) : path;
};
const pageLink = (host: NovelViewHost, path: string, inner: string, cls = '') =>
  `<a${cls ? ` class="${cls}"` : ''} href="${esc(host.readerHref(path)!)}" data-doc-path="${esc(path)}">${inner}</a>`;

function crumb(host: NovelViewHost, path: string, info: PathInfo) {
  const parts = host.pathToKey.has('INDEX.md') && path !== 'INDEX.md' ? [pageLink(host, 'INDEX.md', '总目录')] : [];
  if (info.kind === 'owner' || info.kind === 'owner-note' || info.kind === 'owner-event' || info.kind === 'record') {
    parts.push(esc(domainLabels[info.domain!] ?? info.domain));
    const start = `owners/${info.domain}/${info.owner}/START_HERE.md`;
    if (info.kind !== 'record') parts.push(path === start || !host.pathToKey.has(start) ? esc(ownerName(info.owner!)) : pageLink(host, start, esc(ownerName(info.owner!))));
  } else if (info.kind === 'event' || info.kind === 'world-event') {
    const index = info.kind === 'event' ? 'events/INDEX.md' : 'WORLD_EVENTS.md';
    parts.push(host.pathToKey.has(index) ? pageLink(host, index, info.kind === 'event' ? '事件' : '大事记') : '事件');
  } else if (info.kind === 'chapter') {
    parts.push('正文');
  } else if (path !== 'INDEX.md') {
    parts.push(esc(host.entries[host.pathToKey.get(path)!]?.section ?? ''));
  }
  return parts.length ? `<nav class="crumb" aria-label="位置">${parts.join('<span aria-hidden="true">›</span>')}</nav>` : '';
}

function subtabs(host: NovelViewHost, path: string, info: PathInfo) {
  if (info.kind !== 'owner' && info.kind !== 'owner-note' && info.kind !== 'owner-event') return '';
  const base = `owners/${info.domain}/${info.owner}/`;
  const tabs = ownerPages.filter(([file]) => host.pathToKey.has(base + file));
  if (tabs.length < 2) return '';
  return `<nav class="subtabs" aria-label="${esc(ownerName(info.owner!))}的页面">${tabs.map(([file, label]) =>
    `<a href="${esc(host.readerHref(base + file)!)}" data-doc-path="${esc(base + file)}"${base + file === path ? ' aria-current="page"' : ''}>${label}</a>`).join('')}</nav>`;
}

/** 正文: `<p><a id="p3"></a>[P3] …` → `<p id="p3"><a class="pn">3</a>…`. */
function numberParagraphs(prose: HTMLElement, path: string, host: NovelViewHost) {
  let count = 0;
  for (const p of prose.querySelectorAll('p')) {
    const mark = p.firstElementChild;
    if (!mark || mark.tagName !== 'A' || !/^p\d+$/.test(mark.id) || mark.textContent) continue;
    const n = mark.id.slice(1);
    p.id = mark.id;
    mark.remove();
    const first = p.firstChild;
    if (first?.nodeType === Node.TEXT_NODE) first.textContent = first.textContent!.replace(/^\s*\[P\d+\]\s*/, '');
    const pn = document.createElement('a');
    pn.className = 'pn';
    pn.href = host.readerHref(path, `#p${n}`)!;
    pn.dataset.docHash = `#p${n}`;
    pn.title = '本段链接';
    pn.textContent = n;
    p.prepend(pn);
    count += 1;
  }
  return count;
}

/** Lists of 「名字 + 一句说明」 become cards; long lists of short items flow in columns. */
function shapeLists(prose: HTMLElement) {
  for (const list of prose.querySelectorAll<HTMLUListElement>(':scope > ul')) {
    const items = [...list.children] as HTMLLIElement[];
    if (items.some((li) => li.querySelector('ul, ol, p'))) continue;
    const lead = items.every((li) => li.firstElementChild?.matches('a.ent') && li.firstChild === li.firstElementChild);
    if (lead && items.length >= 3) {
      list.className = 'cards';
      for (const li of items) {
        const a = li.firstElementChild as HTMLAnchorElement;
        a.remove();
        const rest = li.innerHTML.trim().replace(/^[—–:：-]\s*/, '');
        if (li.querySelector('a')) {
          li.className = 'plain';
          li.innerHTML = `<b></b><span>${rest}</span>`;
          li.querySelector('b')!.append(a);
        } else {
          a.innerHTML = `<b>${esc(a.textContent)}</b>${rest ? `<span>${rest}</span>` : ''}`;
          a.classList.remove('ent');
          li.replaceChildren(a);
        }
      }
    } else if (items.length >= 8 && items.every((li) => (li.textContent ?? '').length <= 28)) {
      list.classList.add('cols');
    }
  }
}

function pager(host: NovelViewHost, path: string, info: PathInfo) {
  let kind: string, prevLabel: string, nextLabel: string;
  if (info.kind === 'chapter') [kind, prevLabel, nextLabel] = ['chapter', '← 上一章', '下一章 →'];
  else if (info.kind === 'event' || info.kind === 'world-event') [kind, prevLabel, nextLabel] = [info.kind, '← 上一件', '下一件 →'];
  else return '';
  const list = [...host.pathToKey.keys()].map((p) => ({ p, i: pathInfo(p) })).filter(({ i }) => i.kind === kind)
    .sort((a, b) => (a.i.chapter ?? 0) - (b.i.chapter ?? 0) || a.p.localeCompare(b.p)).map(({ p }) => p);
  const at = list.indexOf(path);
  const side = (target: string | undefined, label: string, cls: string) => {
    if (!target) return '<span></span>';
    const t = pathInfo(target);
    const name = t.kind === 'chapter' ? titleOf(host, target) : `${pointLabel(t.event!)} ${titleOf(host, target)}`;
    return pageLink(host, target, `<small>${label}</small>${esc(name)}`, cls);
  };
  return `<nav class="pager" aria-label="翻页">${side(list[at - 1], prevLabel, 'prev')}${side(list[at + 1], nextLabel, 'next')}</nav>`;
}

export function buildPage(host: NovelViewHost, path: string, html: string): ReaderPage {
  const info = pathInfo(path);
  const title = info.kind === 'event' || info.kind === 'world-event' ? cleanTitle(host.entries[host.pathToKey.get(path)!].title) : titleOf(host, path);
  const prose = document.createElement('div');
  prose.className = info.kind === 'chapter' ? 'prose source' : 'prose';
  prose.innerHTML = html;
  const lead = prose.firstElementChild;
  if (lead && /^H[14]$/.test(lead.tagName)) lead.remove();
  // Hand-written 「- 条目」 lines inside a paragraph read as lines.
  for (const p of prose.querySelectorAll('p')) if (p.innerHTML.includes('\n- ')) p.innerHTML = p.innerHTML.replace(/\n- /g, '<br>· ');
  remapLinks(prose, path, host);
  const paragraphs = info.kind === 'chapter' ? numberParagraphs(prose, path, host) : 0;
  shapeLists(prose);

  const meta: string[] = [];
  if (info.domain) meta.push(`<span class="pill">${esc(domainLabels[info.domain] ?? info.domain)}</span>`);
  if (info.event) meta.push(`<span class="pill">${esc(pointLabel(info.event))}</span>`);
  if (paragraphs) meta.push(`<span class="pill">${paragraphs} 段</span>`);
  const inner = document.createElement('div');
  inner.className = 'doc-inner';
  inner.innerHTML = crumb(host, path, info) +
    `<div class="doc-head"><h1>${esc(title)}</h1><div class="aa"><button class="iconbtn" type="button" data-aa aria-label="阅读设置" aria-expanded="false"><b>Aa</b></button></div></div>` +
    `<div class="doc-meta">${meta.join('')}</div>${subtabs(host, path, info)}`;
  inner.append(prose);
  inner.insertAdjacentHTML('beforeend', pager(host, path, info));
  return { inner, title, info };
}

/** Adds what the story timeline knows about this page: its line or point, and a chapter's events. */
export function addTimelineBits(page: ReaderPage, rail: HTMLElement, data: NovelTimelineData, host: NovelViewHost) {
  const meta = page.inner.querySelector('.doc-meta')!;
  const { info } = page;
  if (info.kind === 'owner' || info.kind === 'record') {
    const line = data.owners.find((owner) => owner.id === info.owner);
    if (line) {
      meta.insertAdjacentHTML('beforeend', `<span class="pill">${line.pts.length} 个事件</span>` +
        `<a class="pill accent" href="${esc(host.href({ view: 'timeline', doc: '', hash: `#line-${line.id}` }))}" data-novel-view="timeline">在时间线中看这条线 →</a>`);
    }
  } else if (info.event) {
    const pid = Object.keys(data.points).find((id) => id.split('@')[0] === info.event);
    if (pid) {
      meta.insertAdjacentHTML('beforeend', `<span class="pill">${esc(data.bands[data.points[pid].b] ?? '')}</span>` +
        `<a class="pill accent" href="${esc(host.href({ view: 'timeline', doc: '', hash: `#p-${pid}` }))}" data-novel-view="timeline">在时间线中定位 →</a>`);
    }
  } else if (info.kind === 'chapter') {
    const prefix = `C${info.chapter}#`;
    const hits = Object.entries(data.points).filter(([, p]) => p.locs.some((loc) => loc.startsWith(prefix))).sort(([, a], [, b]) => a.r - b.r);
    const links = hits.map(([pid, p]) => {
      const [eid, at] = pid.split('@');
      const target = host.readerHref(`events/${eid}.md`, at ? `#at-${at}` : '');
      const where = p.locs.filter((loc) => loc.startsWith(prefix)).map((loc) => parseLoc(loc)?.label.split('·')[1]).filter(Boolean).join('、');
      return target ? `<a href="${esc(target)}" data-doc-path="events/${esc(eid)}.md" data-doc-hash="${at ? `#at-${esc(at)}` : ''}">${esc(pointLabel(pid))} ${esc(p.title)}<small>${esc(where)}</small></a>` : '';
    }).join('');
    if (links) rail.insertAdjacentHTML('beforeend', `<div class="box"><h4>本章写到的事件</h4>${links}</div>`);
  }
}
