// Update outline layers without replaying entry animations on ordinary model redraws.
import { enter, isShown, leave, show } from '../../archive/motion.ts';

export function updateLayers(layer: HTMLElement, html: string) {
  const next = document.createElement('template'); next.innerHTML = html;
  for (const selector of ['.pop', '.modal-back']) {
    const old = layer.querySelector<HTMLElement>(selector);
    const incoming = next.content.querySelector<HTMLElement>(selector);
    if (old && incoming) {
      const reopening = !isShown(old);
      const focused = old.contains(document.activeElement) ? document.activeElement as HTMLInputElement : null;
      const name = focused?.name;
      show(old);
      old.replaceChildren(...incoming.childNodes);
      if (name) old.querySelector<HTMLElement>(`[name="${CSS.escape(name)}"]`)?.focus({ preventScroll: true });
      else if (reopening) old.querySelector<HTMLElement>('input, button')?.focus({ preventScroll: true });
    } else if (incoming) {
      layer.append(incoming); enter(incoming);
      incoming.querySelector<HTMLElement>('input, button')?.focus({ preventScroll: true });
    } else if (old) {
      if (old.contains(document.activeElement)) {
        const phone = matchMedia('(max-width: 860px)').matches;
        const opener = phone && selector === '.pop' ? '.ol-person' : selector === '.pop' ? '[data-bar] [data-act="toggle-rank"]' : '.self-line.current [data-act="edit-line"]';
        layer.parentElement?.querySelector<HTMLElement>(opener)?.focus({ preventScroll: true });
      }
      leave(old, () => old.remove());
    }
  }
}
