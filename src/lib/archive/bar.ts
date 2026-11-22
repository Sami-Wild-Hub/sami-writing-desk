// Top bar of the book page (markup in pages/book.astro): book switcher, view tabs, search
// buttons and the account menu. The shell says what is shown; choices go back via handlers.
import type { HouseholdSessionStatus } from '../householdSession.ts';
import type { BookInfo } from './data.ts';
import { esc, plainClick, toast } from './ui.ts';

interface BarHandlers { book(slug: string): void; signOut(): void; search(): void; drawer(): void; }

export function mountBar(bar: HTMLElement, handlers: BarHandlers) {
  const $ = <T extends HTMLElement>(selector: string) => bar.querySelector<T>(selector)!;
  const title = $('#novel-book-title');
  const scope = $('#novel-scope');
  const bookMenu = $('#novel-book-menu');
  const account = $<HTMLButtonElement>('#novel-account');
  const accountMenu = $('#novel-account-menu');
  const menus = [bookMenu, accountMenu];

  const closeMenus = (except?: HTMLElement) => {
    for (const menu of menus) if (menu !== except) {
      menu.hidden = true;
      menu.previousElementSibling?.setAttribute('aria-expanded', 'false');
    }
  };
  bar.addEventListener('click', (event) => {
    const target = event.target as Element;
    const opener = target.closest<HTMLElement>('[data-menu]');
    if (opener) {
      const menu = opener.nextElementSibling as HTMLElement;
      closeMenus(menu);
      menu.hidden = !menu.hidden;
      opener.setAttribute('aria-expanded', String(!menu.hidden));
      return;
    }
    const soon = target.closest<HTMLElement>('[data-soon]');
    if (soon) toast(soon.dataset.soon!);
    if (target.closest('[data-search]')) handlers.search();
    if (target.closest('[data-drawer]')) handlers.drawer();
    if (target.closest('#novel-sign-out')) { closeMenus(); handlers.signOut(); }
    const book = target.closest<HTMLAnchorElement>('a[data-book-slug]');
    if (book && event instanceof MouseEvent && plainClick(event)) {
      event.preventDefault();
      closeMenus();
      handlers.book(book.dataset.bookSlug!);
    }
  });
  document.addEventListener('click', (event) => { if (!(event.target as Element).closest('.menu-wrap')) closeMenus(); });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeMenus(); });

  return {
    /** Book name and scope; the name is public, the scope only shows when signed in. */
    setBook(name: string, scopeText = '') {
      title.textContent = name;
      scope.textContent = scopeText;
    },
    setBooks(catalog: Record<string, BookInfo>, current: string, hrefFor: (slug: string) => string) {
      bookMenu.innerHTML = '<div class="menu-title">书架</div>' + Object.keys(catalog).sort().map((slug) =>
        `<a href="${esc(hrefFor(slug))}" data-book-slug="${esc(slug)}"${slug === current ? ' aria-current="page"' : ''}>${esc(catalog[slug].title)}</a>`).join('') +
        `<a href="${esc(import.meta.env.BASE_URL)}">← 回到书架</a>`;
    },
    setTabs(current: string, hrefFor: (view: string) => string, hasOutline = false) {
      for (const tab of bar.querySelectorAll<HTMLAnchorElement>('a[data-novel-view]')) {
        tab.hidden = tab.dataset.novelView === 'outline' && !hasOutline;
        tab.href = hrefFor(tab.dataset.novelView!);
        if (tab.dataset.novelView === current) tab.setAttribute('aria-current', 'page');
        else tab.removeAttribute('aria-current');
      }
    },
    /** Shows the parts that need an open book (tabs, search, drawer) only when ready. */
    setReady(ready: boolean) {
      bar.classList.toggle('ready', ready);
      for (const node of bar.querySelectorAll<HTMLElement>('[data-needs-book]')) node.hidden = !ready;
      if (!ready) closeMenus();
    },
    setAccount(status: HouseholdSessionStatus) {
      const email = status.email ?? '';
      account.hidden = !email;
      const name = status.displayName || email;
      account.textContent = name.slice(0, 1).toUpperCase();
      account.setAttribute('aria-label', `账号：${name}`);
      accountMenu.querySelector('.who')!.innerHTML = `${esc(status.displayName ?? '')}<small>${esc(email)}</small>`;
      if (!email) closeMenus();
    },
  };
}
export type NovelBar = ReturnType<typeof mountBar>;
