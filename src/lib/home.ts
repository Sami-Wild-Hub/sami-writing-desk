// Home page (书架): the public book cards, enriched after sign-in with each book's scope
// and counts from its catalog entry and manifest; the account menu; the title filter.
import { FirebaseHouseholdSession, hasCompleteFirebaseConfig, type FirebaseConfig, type HouseholdSessionStatus } from './householdSession.ts';
import { pathInfo } from './labels.ts';
import { esc, toast } from './archive/ui.ts';
import { createStore } from './archive/store.ts';
import type { LoadedBook } from './archive/data.ts';

const greeting = () => {
  const hour = new Date().getHours();
  return hour < 5 ? '夜深了' : hour < 11 ? '早上好' : hour < 13 ? '中午好' : hour < 18 ? '下午好' : '晚上好';
};

function stats(book: LoadedBook) {
  let owners = 0, events = 0, chapters = 0;
  for (const { path } of Object.values(book.manifest.entries)) {
    const info = pathInfo(path);
    if (info.kind === 'owner' && info.file === 'START_HERE.md') owners += 1;
    else if (info.kind === 'event') events += 1;
    else if (info.kind === 'chapter') chapters += 1;
  }
  return `<span><b>${owners}</b> 人物与设定</span><span><b>${events}</b> 事件</span><span><b>${chapters}</b> 章正文</span>`;
}

export function mountHome(config: Partial<FirebaseConfig>) {
  const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const cards = [...document.querySelectorAll<HTMLElement>('.bookcard[data-book]')];
  $<HTMLInputElement>('home-filter').addEventListener('input', (event) => {
    const q = (event.target as HTMLInputElement).value.trim().toLocaleLowerCase();
    for (const card of cards) card.hidden = Boolean(q) && !card.dataset.title!.toLocaleLowerCase().includes(q);
  });
  document.addEventListener('click', (event) => {
    const soon = (event.target as Element).closest<HTMLElement>('[data-soon]');
    if (soon) toast(soon.dataset.soon!);
  });
  if (!hasCompleteFirebaseConfig(config)) return;

  const session = new FirebaseHouseholdSession(config);
  const store = createStore(session, config.householdId);
  const account = $<HTMLButtonElement>('home-account');
  const menu = $('home-account-menu');
  const signIn = $<HTMLButtonElement>('home-sign-in');
  const toggle = (open: boolean) => { menu.hidden = !open; account.setAttribute('aria-expanded', String(open)); };
  account.addEventListener('click', () => toggle(menu.hidden));
  document.addEventListener('click', (event) => { if (!(event.target as Element).closest('.menu-wrap')) toggle(false); });
  $('home-sign-out').addEventListener('click', () => { toggle(false); void session.signOut(); });
  signIn.addEventListener('click', () => void session.signInWithGoogle().catch((error) => toast(String(error))));

  const reset = () => {
    for (const card of cards) {
      card.querySelector('[data-scope]')!.textContent = '私人资料 · 登录后可读';
      card.querySelector('[data-stats]')!.innerHTML = '';
      card.querySelector('[data-outline-link]')?.remove();
    }
  };
  let uid = '';
  let stops: (() => void)[] = [];
  const unwatch = () => { stops.forEach(stop => stop()); stops = []; };
  const showOutline = (card: HTMLElement, shown: boolean) => {
    const old = card.querySelector('[data-outline-link]');
    if (!shown) { old?.remove(); return; }
    if (old) return;
    const link = document.createElement('a');
    const url = new URL(card.querySelector<HTMLAnchorElement>('a.cover')!.href);
    url.searchParams.set('view', 'outline');
    link.href = url.href;
    link.textContent = '大纲';
    link.dataset.outlineLink = '';
    const actions = card.querySelector('.acts')!;
    actions.insertBefore(link, actions.lastElementChild);
  };
  const enrich = async () => {
    const catalog = await store.loadCatalog();
    if (!catalog) return;
    for (const card of cards) {
      const slug = card.dataset.book!;
      const info = catalog[slug];
      card.querySelector('[data-scope]')!.textContent = info ? `已处理正文：${info.scope ?? '—'}` : '尚未同步';
      const book = info ? await store.book(slug).catch(() => undefined) : undefined;
      if (book) card.querySelector('[data-stats]')!.innerHTML = stats(book);
      if (book) stops.push(store.watchOutline(slug, shown => showOutline(card, shown)));
    }
  };
  session.subscribe((status: HouseholdSessionStatus) => {
    const email = status.email ?? '';
    const name = status.displayName || email;
    account.hidden = !email;
    account.textContent = name.slice(0, 1).toUpperCase();
    account.setAttribute('aria-label', `账号：${name}`);
    menu.querySelector('.who')!.innerHTML = `${esc(status.displayName ?? '')}<small>${esc(email)}</small>`;
    signIn.hidden = status.connection !== 'signed-out';
    $('home-who').textContent = status.connection === 'connected' ? `${status.displayName ?? ''} · 家庭成员` : '';
    $('home-greet').textContent = status.connection === 'connected' ? `${greeting()}${status.displayName ? `，${status.displayName}` : ''}` : '小离总周报';
    $('home-lead').hidden = status.connection === 'connected';
    if (status.connection !== 'connected') {
      if (uid) { uid = ''; unwatch(); store.clear(); reset(); }
      return;
    }
    if (uid !== status.uid) {
      uid = status.uid ?? '';
      unwatch();
      store.clear();
      void enrich().catch(() => {});
    }
  });
}
