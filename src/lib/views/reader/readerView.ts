// 阅读 view: contents | page | outline rail. Shows the compiled page the route names
// (INDEX.md when none), jumps to and flashes the route's fragment, and keeps each
// page's scroll position while switching views.
import type { CreateNovelView } from '../types.ts';
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
  const frame = document.createElement('div');
  frame.className = 'reader';
  frame.append(toc, doc, rail);
  host.root.append(frame);
  const reading = mountReadingMenu(doc);
  const peek = mountPeek(doc, host);
  const scrolls = (host.memo.scrolls ??= {}) as Record<string, number>;
  let path = '';
  let page: ReaderPage | null = null;

  rail.addEventListener('click', (event) => {
    const to = (event.target as Element).closest<HTMLElement>('[data-to]');
    if (!to) return;
    event.preventDefault();
    document.getElementById(to.dataset.to!)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  const outline = () => {
    const heads = [...doc.querySelectorAll<HTMLElement>('.prose h2[id], .prose h3[id]')];
    return heads.length < 2 ? '' : `<h4>本页</h4>${heads.map((h) =>
      `<a href="#${esc(h.id)}" data-to="${esc(h.id)}"${h.tagName === 'H3' ? ' class="sub"' : ''}>${esc(h.textContent)}</a>`).join('')}`;
  };

  const jump = (hash: string) => {
    let id = hash.slice(1);
    try { id = decodeURIComponent(id); } catch { /* keep as is */ }
    const target = id ? document.getElementById(id) : null;
    if (!target || !doc.contains(target)) return false;
    const block = page?.info.kind === 'chapter' ? 'center' : 'start';
    target.scrollIntoView({ block });
    const lit = target.tagName === 'A' && !target.textContent ? target.parentElement! : target;
    lit.classList.remove('flash');
    void lit.offsetWidth;
    lit.classList.add('flash');
    return true;
  };

  return {
    async show(route, ctx) {
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
        rail.innerHTML = outline();
        markToc(toc, next);
        const shownPage = page;
        void host.timeline().then((data) => {
          if (data && page === shownPage) addTimelineBits(shownPage, rail, data, host);
        }, () => {});
        document.title = `${page.title} · ${host.bookTitle} · 小离总周报`;
        if (route.hash && jump(route.hash)) return true;
        window.scrollTo(0, ctx.restore ?? (ctx.via === 'pop' ? scrolls[next] ?? 0 : 0));
        return true;
      }
      document.title = `${page.title} · ${host.bookTitle} · 小离总周报`;
      if (ctx.restore !== undefined) window.scrollTo(0, ctx.restore);
      else if (route.hash && jump(route.hash)) return true;
      else window.scrollTo(0, scrolls[path] ?? 0);
      return true;
    },
    hide() {
      if (path) scrolls[path] = window.scrollY;
      reading.close();
      peek.hide();
    },
    dispose() {
      reading.dispose();
      peek.dispose();
    },
    label: () => page?.title ?? '',
  };
};

export default createReader;
