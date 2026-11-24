// Pointer dragging, insertion targets and edge scrolling, scoped to one mounted workbench.
// The ghost follows the pointer with no easing; only the drop settles (ghost glides in, moved cards slide).
import { ms, reduced } from '../../archive/motion.ts';
import { toast } from '../../archive/ui.ts';
const FIXED = 'button, input, textarea, select, summary, a, label, details';
export const mountDrag = root => new OutlineDrag(root);
class OutlineDrag {
  constructor(root) {
    this.root = root; this.state = null; this.onDrop = () => {};
    root.addEventListener('pointerdown', this.down);
    window.addEventListener('pointermove', this.move, { passive: false });
    window.addEventListener('pointerup', this.up); window.addEventListener('keydown', this.key);
    window.addEventListener('pointercancel', this.cancel);
    root.addEventListener('lostpointercapture', this.cancel);
  }
  down = (e) => {
    const src = e.target.closest('[data-drag]');
    if (this.state || !src || e.button !== 0 || src.hasAttribute('data-locked') || e.target.closest(FIXED)) return;
    // Card text remains native selectable/copyable; only its grip starts a drag.
    if (src.dataset.drag === 'card' && !e.target.closest('[data-drag-handle]')) return;
    this.state = { src, pointer: e.pointerId, kind: src.dataset.drag, id: src.dataset.id, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, on: false };
    src.setPointerCapture(e.pointerId);
  };
  begin = () => {
    const r = this.state.src.getBoundingClientRect();
    this.state.dx = this.state.x0 - r.left;
    this.state.dy = this.state.y0 - r.top;
    this.state.ghost = this.state.src.cloneNode(true);
    this.state.ghost.classList.add('drag-ghost');
    this.state.ghost.setAttribute('aria-hidden', 'true');
    this.state.ghost.inert = true;
    this.state.ghost.style.width = r.width + 'px';
    this.root.append(this.state.ghost);
    this.state.src.classList.add('dragging');
    this.state.mark = document.createElement('div');
    this.state.mark.className = 'drop-mark';
    this.state.mark.hidden = true;
    this.root.append(this.state.mark);
    this.root.classList.add('is-dragging');
    this.state.on = true;
    this.state.raf = requestAnimationFrame(this.scrollLoop);
  };
  move = (e) => {
    if (!this.state || e.pointerId !== this.state.pointer) return;
    this.state.x = e.clientX;
    this.state.y = e.clientY;
    if (!this.state.on) {
      if (Math.hypot(this.state.x - this.state.x0, this.state.y - this.state.y0) < 5) return;
      this.begin();
    }
    e.preventDefault();
    this.state.ghost.style.transform = `translate(${this.state.x - this.state.dx}px, ${this.state.y - this.state.dy}px)`;
    this.locate();
  };
  // Count items above the pointer, excluding the dragged card. Blank space in a zone's area drops into that zone.
  locate = () => {
    const el = document.elementFromPoint(this.state.x, this.state.y), accept = `[data-zone][data-accept~="${this.state.kind}"]`;
    this.hover(el);
    const zone = el && (el.closest(accept) || el.closest('[data-zone-area]')?.querySelector(accept));
    this.root.querySelectorAll('.drop-on').forEach(z => z !== zone && z.classList.remove('drop-on'));
    this.state.zone = zone;
    if (!zone) return this.placeMark(null);
    zone.classList.add('drop-on');
    if (zone.hasAttribute('data-nomark')) return this.placeMark(null);
    const items = [...zone.querySelectorAll(':scope > [data-drag]')].filter(x => x !== this.state.src);
    this.state.index = items.filter(x => { const r = x.getBoundingClientRect(); return r.top + r.height / 2 < this.state.y; }).length;
    const next = items[this.state.index], prev = items[this.state.index - 1], z = zone.getBoundingClientRect();
    const y = next ? next.getBoundingClientRect().top - 4 : prev ? prev.getBoundingClientRect().bottom + 2 : z.top + 4;
    this.placeMark(`${z.left + 2},${y},${z.width - 4}`);
  };
  // The insertion line floats over the zone instead of entering it, so nothing below it reflows.
  placeMark = (at) => {
    const mark = this.state.mark;
    if (at === (mark.dataset.at || null)) return;
    mark.dataset.at = at ?? '';
    mark.hidden = !at;
    if (!at) return;
    const [x, y, w] = at.split(',');
    mark.style.transform = `translate(${x}px, ${y}px)`;
    mark.style.width = `${w}px`;
  };
  // Resting a dragged card on a [data-drag-open] element for a moment opens it; leaving closes it again.
  hover = (el) => {
    const opener = (this.state.kind === 'card' && el?.closest('[data-drag-open]')) || null;
    if (opener === this.state.opener) return;
    this.closeOpener(this.state);
    this.state.opener = opener;
    if (opener) this.state.openTimer = setTimeout(() => { opener.classList.add('drag-open'); if (this.state?.on) this.locate(); }, 300);
  };
  closeOpener = (st) => {
    clearTimeout(st.openTimer);
    this.root.querySelectorAll('.drag-open').forEach(x => x.classList.remove('drag-open'));
  };
  up = e => {
    if (!this.state || e.pointerId !== this.state.pointer) return;
    const st = this.state;
    this.state = null;
    if (st.src.hasPointerCapture(st.pointer)) st.src.releasePointerCapture(st.pointer);
    if (!st.on) return;
    const before = st.zone && !reduced() ? this.positions() : null;
    this.finish(st, true);
    this.swallowClick();
    if (st.zone) this.onDrop({ kind: st.kind, id: st.id, zone: { ...st.zone.dataset }, index: st.index });
    this.settle(st, before);
  };
  cancel = e => {
    if (!this.state || (e.pointerId !== undefined && e.pointerId !== this.state.pointer)) return;
    const st = this.state; this.state = null;
    if (st.on) this.finish(st);
    if (st.src.hasPointerCapture(st.pointer)) st.src.releasePointerCapture(st.pointer);
  };
  finish = (st, keepGhost = false) => {
    cancelAnimationFrame(st.raf);
    if (!keepGhost) st.ghost.remove();
    st.mark.remove();
    st.src.classList.remove('dragging');
    this.closeOpener(st);
    this.root.querySelectorAll('.drop-on').forEach(z => z.classList.remove('drop-on'));
    this.root.classList.remove('is-dragging');
  };
  positions = () => {
    const seen = new Map(), out = new Map(), h = innerHeight;
    for (const el of this.root.querySelectorAll('[data-drag][data-id]:not(.drag-ghost)')) {
      const key = `${el.dataset.drag}:${el.dataset.id}`, n = seen.get(key) ?? 0, r = el.getBoundingClientRect();
      seen.set(key, n + 1);
      if (r.bottom > 0 && r.top < h && r.width) out.set(`${key}:${n}`, r);
    }
    return out;
  };
  // The ghost glides into the dropped card's new place (or fades if it left this view); cards that moved slide from where they were.
  settle = (st, before) => {
    const { ghost } = st, d = ms('--dur-2');
    const z = st.zone?.dataset ?? {}, sel = ['zone', 'cat', 'beat', 'line'].filter(k => z[k] != null).map(k => `[data-${k}="${CSS.escape(z[k])}"]`).join('');
    const zone = before && sel ? this.root.querySelector(sel) : null;
    const candidate = zone?.querySelector(`[data-drag="${st.kind}"][data-id="${CSS.escape(st.id)}"]`);
    const rect = candidate?.getBoundingClientRect();
    const target = rect && rect.bottom > 0 && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth ? candidate : null;
    if (st.zone && !target && st.kind === 'card' && z.zone !== 'line') toast('卡片已移动');
    if (!before || !d) return ghost.remove();
    this.slide(before, `${st.kind}:${st.id}`);
    ghost.style.transition = 'transform var(--dur-2) var(--ease-out), opacity var(--dur-2) var(--ease-out)';
    if (target) {
      const r = target.getBoundingClientRect();
      target.style.opacity = '0';
      ghost.style.transform = `translate(${r.left}px, ${r.top}px)`;
    } else ghost.style.opacity = '0';
    setTimeout(() => { ghost.remove(); if (target) target.style.opacity = ''; }, d + 20);
  };
  slide = (before, dropped) => {
    const seen = new Map(), moved = [];
    for (const el of this.root.querySelectorAll('[data-drag][data-id]:not(.drag-ghost)')) {
      const key = `${el.dataset.drag}:${el.dataset.id}`, n = seen.get(key) ?? 0, was = before.get(`${key}:${n}`);
      seen.set(key, n + 1);
      if (!was || key === dropped) continue;
      const r = el.getBoundingClientRect(), dx = was.left - r.left, dy = was.top - r.top;
      if (Math.abs(dx) + Math.abs(dy) < 1 || Math.abs(dy) > innerHeight) continue;
      el.style.transition = 'none';
      el.style.transform = `translate(${dx}px, ${dy}px)`;
      moved.push(el);
    }
    if (!moved.length) return;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      for (const el of moved) { el.style.transition = 'transform var(--dur-2) var(--ease-out)'; el.style.transform = ''; }
      setTimeout(() => moved.forEach(el => { el.style.transition = ''; }), ms('--dur-2') + 20);
    }));
  };
  swallowClick = () => {
    const stop = ev => { ev.stopPropagation(); ev.preventDefault(); };
    window.addEventListener('click', stop, { capture: true, once: true });
    setTimeout(() => window.removeEventListener('click', stop, { capture: true }), 0);
  };
  // Near the top or bottom edge of a scrolling column, the column scrolls.
  scrollLoop = () => {
    if (!this.state || !this.state.on) return;
    const el = document.elementFromPoint(this.state.x, this.state.y);
    for (let box = el; box && box !== document.body; box = box.parentElement) {
      if (!/(auto|scroll)/.test(getComputedStyle(box).overflowY) || box.scrollHeight <= box.clientHeight) continue;
      const r = box.getBoundingClientRect(), edge = 56;
      const v = this.state.y < r.top + edge ? this.state.y - (r.top + edge) : this.state.y > r.bottom - edge ? this.state.y - (r.bottom - edge) : 0;
      if (v) {
        box.scrollTop += v / 4;
        this.locate();
      }
      break;
    }
    this.state.raf = requestAnimationFrame(this.scrollLoop);
  };
  key = (e) => {
    if (e.key !== 'Escape' || !this.state) return;
    this.cancel(e);
  };

  active = () => Boolean(this.state?.on);
  dispose = () => {
    if (this.state?.on) this.finish(this.state); this.state = null;
    this.root.removeEventListener('pointerdown', this.down); window.removeEventListener('pointermove', this.move);
    window.removeEventListener('pointerup', this.up); window.removeEventListener('keydown', this.key);
    window.removeEventListener('pointercancel', this.cancel); this.root.removeEventListener('lostpointercapture', this.cancel);
  };
}
