// Replace changed proof results while retaining the visible paragraph and open raw output.
export function updateResult(root: HTMLElement, html: string) {
  if (root.dataset.html === html) return;
  const top = (document.querySelector<HTMLElement>('#novel-bar')?.offsetHeight ?? 0) + 8;
  const anchor = [...root.querySelectorAll<HTMLElement>('.prow[data-at], .plist .pitem[data-i]')]
    .find(el => el.getClientRects().length && el.getBoundingClientRect().bottom >= top);
  const selector = anchor?.matches('.prow') ? `.prow[data-at="${anchor.dataset.at}"]` : anchor ? `.plist .pitem[data-i="${anchor.dataset.i}"]` : '';
  const offset = anchor?.getBoundingClientRect().top ?? 0;
  const open = [...root.querySelectorAll<HTMLDetailsElement>('details')].map(d => d.open);
  const focus = [...root.querySelectorAll<HTMLElement>('button, .pitem')].indexOf(document.activeElement as HTMLElement);
  root.innerHTML = html; root.dataset.html = html;
  root.querySelectorAll<HTMLDetailsElement>('details').forEach((d, i) => { d.open = open[i] ?? false; });
  if (focus >= 0) root.querySelectorAll<HTMLElement>('button, .pitem')[focus]?.focus({ preventScroll: true });
  const next = selector && root.querySelector<HTMLElement>(selector);
  if (next) window.scrollBy({ top: next.getBoundingClientRect().top - offset, behavior: 'instant' });
}
