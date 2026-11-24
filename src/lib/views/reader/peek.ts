// Hover or touch-hold preview for person/setting links: name, domain and the page's
// 「Basic」 line, read from the linked page itself.
import { domainLabels, ownerName, pathInfo } from '../../labels.ts';
import { hide as hidePop, show as showPop } from '../../archive/motion.ts';
import { esc } from '../../archive/ui.ts';
import type { NovelViewHost } from '../types.ts';
import { touchPeek } from './touch-peek.ts';

export function mountPeek(scope: HTMLElement, host: NovelViewHost) {
  const peek = Object.assign(document.createElement('div'), { className: 'peek', hidden: true });
  peek.setAttribute('role', 'tooltip');
  document.body.append(peek);
  const cache = new Map<string, string>();
  let over: HTMLAnchorElement | null = null;
  let timer = 0;
  let cancelHold = () => {};

  const summary = async (path: string) => {
    if (cache.has(path)) return cache.get(path)!;
    const html = await host.read(path).catch(() => undefined);
    if (html === undefined) return '';
    const page = new DOMParser().parseFromString(html, 'text/html');
    const basic = [...page.querySelectorAll('p')].map((p) => p.textContent ?? '').find((text) => /^Basic[：:]/.test(text));
    const text = basic?.replace(/^Basic[：:]\s*/, '') ?? '';
    cache.set(path, text);
    return text;
  };
  const place = (anchor: HTMLElement) => {
    const r = anchor.getBoundingClientRect();
    peek.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - peek.offsetWidth - 8))}px`;
    peek.style.top = `${r.bottom + 8 + peek.offsetHeight > window.innerHeight ? r.top - peek.offsetHeight - 8 : r.bottom + 8}px`;
  };
  const show = async (anchor: HTMLAnchorElement) => {
    const path = anchor.dataset.docPath!;
    const info = pathInfo(path);
    const text = await summary(path);
    if (over !== anchor) return;
    peek.innerHTML = `<b>${esc(ownerName(info.owner ?? ''))}</b><span class="k">${esc(domainLabels[info.domain ?? ''] ?? info.domain ?? '')}</span>` +
      (text ? `<p>${esc(text)}</p>` : '');
    showPop(peek);
    place(anchor);
  };
  const hide = () => {
    cancelHold();
    over = null;
    clearTimeout(timer);
    hidePop(peek);
  };
  const hover = (event: MouseEvent) => {
    if (!window.matchMedia('(hover: hover)').matches) return;
    const anchor = (event.target as Element).closest<HTMLAnchorElement>('a.ent[data-doc-path]');
    if (anchor === over) return;
    hide();
    if (!anchor) return;
    over = anchor;
    timer = window.setTimeout(() => void show(anchor), 180);
  };
  scope.addEventListener('mouseover', hover);
  scope.addEventListener('mouseleave', hide);
  scope.addEventListener('click', hide);
  const touch = touchPeek(scope, anchor => { over = anchor; void show(anchor); }, hide);
  cancelHold = touch.dismiss;
  const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') hide(); };
  document.addEventListener('keydown', escape);
  return { hide, dispose: () => {
    hide(); touch.dispose(); peek.remove(); document.removeEventListener('keydown', escape);
    scope.removeEventListener('mouseover', hover); scope.removeEventListener('mouseleave', hide); scope.removeEventListener('click', hide);
  } };
}
