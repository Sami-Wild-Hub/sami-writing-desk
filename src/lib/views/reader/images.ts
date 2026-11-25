// Add the Owner's image tab and an accessible full-size image dialog.
// Reads: the book's exported Owner image attachments (JSON).
import { esc } from '../../archive/ui.ts';
import type { PathInfo } from '../../labels.ts';
import type { OwnerImages } from './image-schema.ts';

export function addOwnerImages(inner: HTMLElement, info: PathInfo, images: OwnerImages) {
  if (!['owner', 'owner-note', 'owner-event'].includes(info.kind) || !['CHARACTER', 'LOCATION'].includes(info.domain ?? '')) return;
  let nav = inner.querySelector<HTMLElement>('.subtabs');
  if (!nav) {
    nav = document.createElement('nav');
    nav.className = 'subtabs';
    nav.setAttribute('aria-label', '页面');
    inner.querySelector('.doc-meta')!.after(nav);
  }
  const attached = images[`owners/${info.domain}/${info.owner}`] ?? [];
  const tab = document.createElement('button');
  tab.type = 'button';
  tab.textContent = '图片';
  tab.disabled = !attached.length;
  nav.append(tab);
  if (!attached.length) return;
  const gallery = document.createElement('section');
  gallery.className = 'owner-gallery';
  gallery.setAttribute('aria-label', '图片');
  gallery.hidden = true;
  gallery.innerHTML = attached.map((image, i) => `<figure><button type="button" data-image="${i}" aria-label="放大 ${esc(image.caption)}">` +
    `<img src="${esc(image.src)}" alt="${esc(image.caption)}" loading="lazy"></button><figcaption>${esc(image.caption)}</figcaption></figure>`).join('');
  inner.querySelector('.prose')!.after(gallery);
  const prose = inner.querySelector<HTMLElement>('.prose')!;
  const pager = inner.querySelector<HTMLElement>('.pager');
  const current = nav.querySelector('[aria-current="page"]');
  const select = (on: boolean) => {
    gallery.hidden = !on; prose.hidden = on;
    if (pager) pager.hidden = on;
    const rail = inner.closest('.reader')?.querySelector<HTMLElement>('.rail');
    if (rail) rail.hidden = on;
    if (on) { tab.setAttribute('aria-current', 'page'); current?.removeAttribute('aria-current'); }
    else { tab.removeAttribute('aria-current'); current?.setAttribute('aria-current', 'page'); }
  };
  tab.addEventListener('click', () => select(true));
  nav.querySelectorAll('a').forEach(link => link.addEventListener('click', () => select(false)));
  gallery.addEventListener('click', (event) => {
    const button = (event.target as Element).closest<HTMLButtonElement>('[data-image]');
    if (!button) return;
    const image = attached[Number(button.dataset.image)];
    const dialog = document.createElement('dialog');
    dialog.className = 'owner-image-dialog';
    dialog.setAttribute('aria-label', image.caption);
    dialog.innerHTML = `<div><button type="button" autofocus aria-label="关闭大图">关闭</button><p>${esc(image.caption)}</p></div>` +
      `<img src="${esc(image.src)}" alt="${esc(image.caption)}">`;
    inner.append(dialog);
    dialog.querySelector('button')!.addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
    dialog.addEventListener('close', () => { dialog.remove(); button.focus(); }, { once: true });
    dialog.showModal();
  });
}
