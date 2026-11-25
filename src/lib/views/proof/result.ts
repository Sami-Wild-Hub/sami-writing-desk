// Replace changed proof results while retaining the visible paragraph and open raw output.
import { enter } from '../../archive/motion.ts';

export function updateResult(root: HTMLElement, html: string) {
  if (root.dataset.html === html) return;
  const top = (document.querySelector<HTMLElement>('#novel-bar')?.offsetHeight ?? 0) + 8;
  const anchor = [...root.querySelectorAll<HTMLElement>('.prow[data-at], .plist .pitem[data-key]')]
    .find(el => el.getClientRects().length && el.getBoundingClientRect().bottom >= top);
  const selector = anchor?.matches('.prow') ? `.prow[data-at="${anchor.dataset.at}"]` : anchor ? `.plist .pitem[data-key="${CSS.escape(anchor.dataset.key!)}"]` : '';
  const offset = anchor?.getBoundingClientRect().top ?? 0;
  const open = new Set([...root.querySelectorAll<HTMLDetailsElement>('details[data-report][open]')].map(d => d.dataset.report));
  const focused = document.activeElement as HTMLElement | null;
  const control = ['data-filter', 'data-kind', 'data-report', 'data-accept'].find(attr => focused?.matches(`button[${attr}]`));
  const focus = focused?.matches('.pitem') ? `.pitem[data-key="${CSS.escape(focused.dataset.key!)}"]`
    : control ? `button[${control}="${CSS.escape(focused!.getAttribute(control)!)}"]` : '';
  const first = !root.dataset.html && html;
  const editing = focused?.matches('.pedit') && root.contains(focused);
  if (editing) updateWhileEditing(root, html, focused!); else root.innerHTML = html;
  root.dataset.html = html;
  if (first) enter(root, 'late'); // the report arriving fades in; later updates replace it quietly
  root.querySelectorAll<HTMLDetailsElement>('details[data-report]').forEach(d => { d.open = open.has(d.dataset.report); });
  if (focus) [...root.querySelectorAll<HTMLElement>(focus)].find(el => el.getClientRects().length)?.focus({ preventScroll: true });
  const next = selector && root.querySelector<HTMLElement>(selector);
  if (next) window.scrollBy({ top: next.getBoundingClientRect().top - offset, behavior: 'instant' });
}

/** Keep the focused editor mounted so typing, selection and the phone keyboard survive. */
function updateWhileEditing(root: HTMLElement, html: string, focused: HTMLElement) {
  const next = document.createElement('div'); next.innerHTML = html;
  const pv = root.querySelector<HTMLElement>('.pv')!;
  root.querySelectorAll(':scope > :not(.pv)').forEach(el => el.remove());
  for (const el of [...next.children]) if (!el.matches('.pv')) root.insertBefore(el, pv);
  const rows = [...next.querySelectorAll<HTMLElement>('.pv .prow')];
  const previous = [...pv.children];
  previous.forEach((row, i) => {
    const fresh = rows[i];
    if (!fresh) { row.remove(); return; }
    row.className = fresh.className;
    const notes = row.querySelector('.pnotes');
    if (notes) notes.innerHTML = fresh.querySelector('.pnotes')!.innerHTML;
    const editor = row.querySelector('.pedit');
    if (editor && editor !== focused) editor.innerHTML = fresh.querySelector('.pedit')!.innerHTML;
  });
  for (const row of rows.slice(previous.length)) pv.append(row);
}
