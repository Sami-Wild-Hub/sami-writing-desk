// 阅读 view: contents | page | outline rail. Shows the compiled page the route names
// (INDEX.md when none), jumps to and flashes the route's fragment, and keeps each
// page's scroll position while switching views.
import type { CreateNovelView } from '../types.ts';
import { flash, jumpTo } from '../../archive/motion.ts';
import { esc } from '../../archive/ui.ts';
import { addTimelineBits, buildPage, type ReaderPage } from './page.ts';
import { mountPeek } from './peek.ts';
import { mountReadingMenu } from './settings.ts';
import { buildToc, markToc } from './toc.ts';

const createReader: CreateNovelView = (host) => {
  const toc = buildToc(host);
  const doc = document.createElement('main');
  doc.className = 'doc';
  const rail = document.createElement('aside');
  rail.className = 'rail';
  rail.setAttribute('aria-label', '本页');
  rail.innerHTML = '<details class="rail-fold"><summary>本页目录与相关事件</summary><div data-rail-body></div></details>';
  const railBody = rail.querySelector<HTMLElement>('[data-rail-body]')!, railFold = rail.querySelector('details')!;
  const compact = window.matchMedia('(max-width: 1180px)');
  const frame = document.createElement('div');
  frame.className = 'reader';
  frame.append(toc, doc, rail);
  host.root.append(frame);
  const reading = mountReadingMenu(doc);
  const peek = mountPeek(doc, host);
  const scrolls = (host.memo.scrolls ??= {}) as Record<string, number>;
  let path = '';
  let page: ReaderPage | null = null;
  let visible = false;
  let observer: IntersectionObserver | null = null;
  const placeRail = () => {
    railFold.open = !compact.matches;
    if (compact.matches && page) page.inner.querySelector('.prose')!.before(rail);
    else frame.append(rail);
  };
  compact.addEventListener('change', placeRail);
  const observeHeads = () => {
    observer?.disconnect();
    const heads = [...doc.querySelectorAll<HTMLElement>('.prose h2[id], .prose h3[id]')];
    const mark = () => {
      const top = (document.querySelector<HTMLElement>('#novel-bar')?.offsetHeight ?? 0) + 20;
      const id = [...heads].reverse().find(h => h.getBoundingClientRect().top <= top)?.id ?? heads[0]?.id;
      railBody.querySelectorAll<HTMLElement>('[data-to]').forEach(a => {
        const on = a.dataset.to === id; a.classList.toggle('on', on);
        if (on) a.setAttribute('aria-current', 'location'); else a.removeAttribute('aria-current');
      });
    };
    observer = new IntersectionObserver(mark, { rootMargin: '-60px 0px -65% 0px' });
    heads.forEach(h => observer!.observe(h)); mark();
  };

  rail.addEventListener('click', (event) => {
    const to = (event.target as Element).closest<HTMLElement>('[data-to]');
    if (!to) return;
    event.preventDefault();
    const head = document.getElementById(to.dataset.to!);
    if (head && jumpTo(head)) flash(head);
  });

  const outline = () => {
    const heads = [...doc.querySelectorAll<HTMLElement>('.prose h2[id], .prose h3[id]')];
    return heads.length < 2 ? '' : `<h4>本页</h4>${heads.map((h) =>
      `<a href="#${esc(h.id)}" data-to="${esc(h.id)}"${h.tagName === 'H3' ? ' class="sub"' : ''}>${esc(h.textContent)}</a>`).join('')}`;
  };

  // A freshly opened page lands on its fragment at once; within the page it uses jumpTo.
  const jump = (hash: string, fresh: boolean) => {
    let id = hash.slice(1);
    try { id = decodeURIComponent(id); } catch { /* keep as is */ }
    const target = id ? document.getElementById(id) : null;
    if (!target || !doc.contains(target)) return false;
    const block = page?.info.kind === 'chapter' ? 'center' : 'start';
    if (fresh) target.scrollIntoView({ block }); else jumpTo(target, block);
    flash(target.tagName === 'A' && !target.textContent ? target.parentElement! : target);
    return true;
  };

  return {
    async show(route, ctx) {
      const wasVisible = visible;
      visible = true;
      const wanted = route.doc && host.pathToKey.has(route.doc) ? route.doc : '';
      if (route.doc && !wanted) host.toast('这一页没有同步，先打开总目录');
      const next = wanted || (host.pathToKey.has('INDEX.md') ? 'INDEX.md' : host.entries[Object.keys(host.entries)[0]].path);
      route.doc = next;
      if (next !== path || !page) {
        if (path) scrolls[path] = window.scrollY;
        const html = await host.read(next);
        if (html === undefined || !ctx.latest()) return false;
        reading.close();
        peek.hide();
        path = next;
        page = buildPage(host, next, html);
        doc.replaceChildren(page.inner);
        railBody.innerHTML = outline(); placeRail(); observeHeads();
        markToc(toc, next);
        const shownPage = page;
        void host.timeline().then((data) => {
          if (data && page === shownPage) addTimelineBits(shownPage, railBody, data, host);
        }, () => {});
        document.title = `${page.title} · ${host.bookTitle} · 小离总周报`;
        if (route.hash && jump(route.hash, true)) return true;
        window.scrollTo(0, ctx.restore ?? (ctx.via === 'pop' ? scrolls[next] ?? 0 : 0));
        return true;
      }
      document.title = `${page.title} · ${host.bookTitle} · 小离总周报`;
      observeHeads();
      if (ctx.restore !== undefined) window.scrollTo(0, ctx.restore);
      else if (route.hash && jump(route.hash, !wasVisible)) return true;
      else window.scrollTo(0, scrolls[path] ?? 0);
      return true;
    },
    hide() {
      visible = false;
      if (path) scrolls[path] = window.scrollY;
      reading.close();
      peek.hide();
    },
    dispose() {
      observer?.disconnect(); compact.removeEventListener('change', placeRail);
      reading.dispose();
      peek.dispose();
    },
    label: () => page?.title ?? '',
  };
};

export default createReader;
