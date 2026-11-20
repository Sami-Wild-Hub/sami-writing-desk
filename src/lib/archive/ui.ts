// Small DOM helpers shared by the book page: HTML escaping, inline icons, the toast.

export const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

const paths: Record<string, string> = {
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  down: '<path d="m7 10 5 5 5-5"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
};
export const icon = (name: keyof typeof paths & string) => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${paths[name]}</svg>`;

let toastTimer = 0;
export function toast(text: string) {
  document.querySelector('.toast')?.remove();
  clearTimeout(toastTimer);
  const node = Object.assign(document.createElement('div'), { className: 'toast', textContent: text });
  node.setAttribute('role', 'status');
  document.body.append(node);
  toastTimer = window.setTimeout(() => node.remove(), 2600);
}

/** True for a plain left click that the page may handle itself. */
export const plainClick = (event: MouseEvent) => event.button === 0 && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey;
