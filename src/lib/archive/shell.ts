// The book page shell: sign-in gate, top bar, the views registered in views/registry.ts,
// search overlay, 「← 返回」 and the status line. The URL is the only view state: user
// navigation pushes it (go), history only re-renders it.
import { ref } from 'firebase/database';
import { novelBooks } from '../../config/books.ts';
import { FirebaseHouseholdSession, hasCompleteFirebaseConfig, type FirebaseConfig, type HouseholdSessionStatus } from '../householdSession.ts';
import { novelRouteHref, parseNovelRoute, type NovelRoute, type NovelView } from '../novelArchiveRoute.ts';
import { routableViews } from '../views/registry.ts';
import type { NovelViewHost, NovelViewInstance, ShowContext } from '../views/types.ts';
import { mountBar } from './bar.ts';
import type { LoadedBook } from './data.ts';
import { mountGate } from './gate.ts';
import { enter } from './motion.ts';
import { mountSearch } from './search.ts';
import { createStore } from './store.ts';
import { esc, icon, plainClick, toast } from './ui.ts';

const el = (id: string) => {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing Novel Archive element: ${id}`);
  return node;
};
const url = () => new URL(window.location.href);
const here = () => `${window.location.pathname}${window.location.search}${window.location.hash}`;
type Via = ShowContext['via'];
interface MountedView { view: NovelViewInstance; root: HTMLElement; }
interface OpenBook { slug: string; book: LoadedBook; views: Map<NovelView, MountedView>; }

export function mountNovelArchive(config: Partial<FirebaseConfig>) {
  const gate = el('novel-auth');
  const app = el('novel-app');
  const live = el('novel-live');
  const back = el('novel-back') as HTMLButtonElement;
  const scrim = el('novel-scrim');
  live.className = 'view-progress'; live.hidden = true; app.before(live);
  const message = (text: string) => {
    live.hidden = !text; live.setAttribute('role', 'status');
    live.innerHTML = text ? `<p>${esc(text)}</p><div class="skeleton" aria-hidden="true"><i></i><i></i><i></i></div>` : '';
    if (text) app.setAttribute('aria-busy', 'true'); else app.removeAttribute('aria-busy');
  };
  const failure = (text: string, retry: () => void) => {
    live.hidden = false; live.setAttribute('role', 'alert'); live.innerHTML = `<p>${esc(text)}</p>`;
    const button = Object.assign(document.createElement('button'), { type: 'button', className: 'btn', textContent: '重试' });
    button.onclick = retry; live.append(button); app.removeAttribute('aria-busy');
  };
  const bar = mountBar(el('novel-bar'), {
    book: (slug) => go({ book: slug, view: parseNovelRoute(url()).view, doc: '', hash: '' }, 'nav'),
    signOut: () => void session?.signOut(),
    search: () => search.open(),
    drawer: () => setDrawer(!shown?.root.querySelector('.side.show')),
  });

  // The book name is public, so it is shown before sign-in too.
  const showBookName = (slug: string, privateTitle?: string, scope?: string) => {
    const name = novelBooks.find((book) => book.slug === slug)?.title ?? privateTitle ?? '小离总周报';
    bar.setBook(name, scope);
    document.title = name === '小离总周报' ? '小离总周报 · Sami Writing Desk' : `${name} · 小离总周报 · Sami Writing Desk`;
    return name;
  };
  showBookName(parseNovelRoute(url()).book);

  const session = hasCompleteFirebaseConfig(config) ? new FirebaseHouseholdSession(config) : null;
  const updateGate = mountGate(gate, session);
  bar.setReady(false);
  if (!session || !config.householdId) return;
  const store = createStore(session, config.householdId, config.projectId);
  const search = mountSearch();

  let activeUid = '';
  let serial = 0;
  let current: OpenBook | null = null;
  let shown: MountedView | null = null;
  const connected = () => session.getStatus().connection === 'connected';

  // One drawer state drives the panel, scrim, openers' aria-expanded and focus: opening on a
  // phone moves focus in, closing brings it back to the opener; Esc closes.
  const phone = window.matchMedia('(max-width: 860px)');
  let drawerOpener: HTMLElement | null = null;
  function setDrawer(open: boolean) {
    const side = shown?.root.querySelector<HTMLElement>('.side');
    const was = Boolean(side?.classList.contains('show'));
    const now = open && phone.matches && Boolean(side);
    const focusInside = Boolean(side?.contains(document.activeElement)) || document.activeElement === document.body;
    side?.classList.toggle('show', now);
    if (side) side.inert = phone.matches && !now;
    scrim.classList.toggle('show', now);
    for (const opener of document.querySelectorAll('[data-drawer]')) opener.setAttribute('aria-expanded', String(now));
    if (now && !was && phone.matches) {
      drawerOpener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      side!.querySelector<HTMLElement>('[aria-current="page"], a[href], button, summary, input')?.focus();
    } else if (!now && was) {
      if (focusInside && drawerOpener?.isConnected) drawerOpener.focus();
      drawerOpener = null;
    }
  }
  scrim.addEventListener('click', () => setDrawer(false));
  phone.addEventListener('change', () => setDrawer(false));
  document.addEventListener('keydown', (event) => {
    const side = shown?.root.querySelector<HTMLElement>('.side.show');
    if (!side || event.defaultPrevented) return;
    if (event.key === 'Escape') { event.preventDefault(); setDrawer(false); }
    if (event.key === 'Tab') {
      const items = [...side.querySelectorAll<HTMLElement>('a[href], button, summary, input')].filter(el => el.getClientRects().length && !el.closest('[inert]'));
      const first = items[0], last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  });

  const dropBook = () => {
    setDrawer(false);
    for (const mounted of current?.views.values() ?? []) mounted.view.dispose();
    current = null;
    shown = null;
    app.replaceChildren();
    back.hidden = true;
  };
  const clearPrivate = () => {
    serial += 1;
    activeUid = '';
    dropBook();
    store.clear();
    search.use(null);
    showBookName(parseNovelRoute(url()).book);
    bar.setReady(false);
    message('');
  };

  let previousAccess = session.getStatus().connection;
  const showStatus = (status: HouseholdSessionStatus) => {
    const ok = status.connection === 'connected';
    if (ok && previousAccess === 'pending') toast('权限已开通');
    previousAccess = status.connection;
    gate.hidden = ok;
    app.hidden = !ok;
    bar.setAccount(status);
    if (!ok) {
      updateGate(status);
      if (activeUid) clearPrivate();
      return;
    }
    if (activeUid !== status.uid) {
      clearPrivate();
      activeUid = status.uid ?? '';
      void loadCatalog();
    }
  };

  const loadCatalog = async () => {
    message('正在加载小说目录…');
    try {
      const catalog = await store.loadCatalog();
      if (!catalog) return;
      if (!Object.keys(catalog).length) {
        app.innerHTML = '<div class="gate"><section class="gate-panel"><span class="logo-mark" aria-hidden="true">离</span><h2>尚未同步小说</h2>' +
          '<p>登录已成功。小说 KB 需要从私有 Novel 仓库同步到家庭私有数据库后才能阅读。</p></section></div>';
        message('');
        return;
      }
      await render('load');
    } catch (error) {
      failure(error instanceof Error ? `读取小说目录失败：${error.message}` : '读取小说目录失败', () => void loadCatalog());
    }
  };

  const hostFor = (slug: string, book: LoadedBook, root: HTMLElement, view: NovelView): NovelViewHost => {
    const catalog = store.catalog();
    const href = (route: Partial<NovelRoute>) => novelRouteHref(url(), { ...parseNovelRoute(url()), hash: '', ...route, book: slug });
    return {
      root, slug, bookTitle: book.manifest.title, scope: catalog[slug]?.scope ?? '',
      entries: book.manifest.entries, pathToKey: book.pathToKey,
      read: (path) => store.page(slug, book, path),
      timeline: () => store.timeline(slug, book),
      outline: () => store.outline(slug, book),
      outlineDraftKey: `outline:${config.projectId}:${config.householdId}:${activeUid}:${slug}`,
      uid: activeUid,
      people: () => store.people(slug, book),
      images: () => store.images(slug, book),
      memo: (book.memo[view] ??= {}),
      href,
      readerHref: (path, hash = '') => (book.pathToKey.has(path) ? href({ view: 'reader', doc: path, hash }) : null),
      go: (route, via = 'nav') => go({ ...parseNovelRoute(url()), hash: '', ...route, book: slug }, via),
      householdRef: (path) => ref(session.database, `households/${config.householdId}/${path}`),
      message, toast, setDrawer,
      sideHead: () => {
        const head = document.createElement('div');
        head.className = 'side-head';
        head.innerHTML = `<a href="${esc(import.meta.env.BASE_URL)}">${icon('back')}书架</a><b>${esc(book.manifest.title)}</b>` +
          `<small>${esc(catalog[slug]?.scope ?? '')}</small>`;
        return head;
      },
    };
  };

  const openBook = async (slug: string) => {
    if (current?.slug === slug) return current;
    const book = await store.book(slug);
    if (!book) return null;
    dropBook();
    current = { slug, book, views: new Map() };
    search.use({
      entries: book.manifest.entries,
      texts: () => store.search(slug, book),
      readerHref: (path, hash = '') => (book.pathToKey.has(path) ? novelRouteHref(url(), { book: slug, view: 'reader', doc: path, hash }) : null),
    });
    return current;
  };

  const viewFor = async (opened: OpenBook, id: NovelView) => {
    const existing = opened.views.get(id);
    if (existing) return existing;
    const create = (await routableViews.find((view) => view.id === id)!.load()).default;
    if (current !== opened) return null;
    const root = document.createElement('section');
    root.className = 'view';
    root.dataset.view = id;
    root.hidden = true;
    app.append(root);
    const mounted = { view: create(hostFor(opened.slug, opened.book, root, id)), root };
    opened.views.set(id, mounted);
    return mounted;
  };

  // Shows whatever the URL names; only normalises the URL, never adds history.
  const render = async (via: Via) => {
    const catalog = store.catalog();
    if (!connected() || !Object.keys(catalog).length) return;
    const mine = ++serial;
    const latest = () => mine === serial && connected();
    const route = parseNovelRoute(url());
    route.book = catalog[route.book] ? route.book : Object.keys(catalog).sort()[0];
    showBookName(route.book, catalog[route.book].title, catalog[route.book].scope);
    bar.select(route.view);
    const targetName = routableViews.find(view => view.id === route.view)?.label ?? '页面';
    message(`正在打开${targetName}…`);
    try {
      const opened = await openBook(route.book);
      if (!opened || !latest()) return;
      const outlineHead = await store.outlineHead(route.book, opened.book);
      if (!latest()) return;
      const hasOutline = Boolean(outlineHead);
      if (route.view === 'outline' && !hasOutline) { route.view = 'reader'; route.doc = ''; route.hash = ''; }
      const view = await viewFor(opened, route.view);
      if (!view || !latest()) return;
      const backLabel = shown?.view.label() ?? '';
      const switched = shown !== null && shown !== view;
      if (shown && shown !== view) {
        shown.view.hide();
        shown.root.hidden = true;
      }
      setDrawer(false);
      view.root.hidden = false;
      shown = view;
      const restore = via === 'pop' && typeof history.state?.y === 'number' ? history.state.y as number : undefined;
      if (!await view.view.show(route, { latest, via, restore }) || !latest()) return;
      setDrawer(false);
      bar.setReady(true);
      bar.setDrawerAvailable(route.view !== 'outline');
      bar.setBooks(catalog, route.book, (slug) => novelRouteHref(url(), { book: slug, view: route.view, doc: '', hash: '' }));
      // Other tabs keep the page that is open, but not a view's own doc (a 校稿 record).
      const keep = (id: string) => id === route.view || opened.book.pathToKey.has(route.doc);
      bar.setTabs(route.view, (id) => novelRouteHref(url(), { ...route, view: id as NovelView, doc: keep(id) ? route.doc : '', hash: '' }), hasOutline);
      const normal = novelRouteHref(url(), route);
      if (normal !== here()) history.replaceState(history.state, '', normal);
      // 「← 返回」 offers the way back after following a link; any other move retires it.
      back.hidden = !(via === 'link' && backLabel);
      if (!back.hidden) back.innerHTML = `${icon('back')}<span>返回 ${esc(backLabel)}</span>`;
      const key = route.view === 'reader' ? opened.book.pathToKey.get(route.doc) : undefined;
      if (key) search.remember(opened.book.manifest.entries[key], normal);
      if (switched) enter(view.root, 'view-enter');
      message('');
    } catch (error) {
      if (mine === serial) failure(error instanceof Error ? error.message : '知识库加载失败', () => void render(via));
    }
  };

  const go = (route: NovelRoute, via: 'nav' | 'link') => {
    const href = novelRouteHref(url(), route);
    if (href === here()) return void render(via);
    history.replaceState({ ...history.state, y: window.scrollY }, '');
    history.pushState(null, '', href);
    void render(via);
  };

  // Links into the book (contents, prose, cards, search hits) navigate without a reload.
  document.addEventListener('click', (event) => {
    if (!plainClick(event) || !current) return;
    const anchor = (event.target as Element).closest<HTMLAnchorElement>('a[data-doc-path], a[data-doc-hash], a[data-novel-view], .search .hit');
    if (!anchor || anchor.target === '_blank') return;
    const target = new URL(anchor.href);
    if (target.pathname !== window.location.pathname) return;
    event.preventDefault();
    const nav = anchor.closest('.side, .tabs, .pager, .subtabs, .crumb, .chapters');
    go(parseNovelRoute(target), nav ? 'nav' : 'link');
  });
  back.addEventListener('click', () => history.back());
  window.addEventListener('popstate', () => void render('pop'));
  document.addEventListener('keydown', (event) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((document.activeElement as HTMLElement | null)?.tagName ?? '');
    if (!current || (event.key === '/' && typing)) return;
    if (event.key === '/' || (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey))) {
      event.preventDefault();
      search.open();
    }
  });
  session.subscribe(showStatus);
}
