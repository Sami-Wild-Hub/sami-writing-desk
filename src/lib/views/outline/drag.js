// Pointer dragging, insertion targets and edge scrolling, scoped to one mounted workbench.
const FIXED = 'button, input, textarea, select, summary, a, label, details';
export const mountDrag = root => new OutlineDrag(root);
class OutlineDrag {
  constructor(root) {
    this.root = root; this.state = null; this.onDrop = () => {};
    root.addEventListener('pointerdown', this.down);
    window.addEventListener('pointermove', this.move, { passive: false });
    window.addEventListener('pointerup', this.up); window.addEventListener('keydown', this.key);
  }
  down = (e) => {
    const src = e.target.closest('[data-drag]');
    if (!src || e.button !== 0 || src.hasAttribute('data-locked') || e.target.closest(FIXED)) return;
    this.state = { src, kind: src.dataset.drag, id: src.dataset.id, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, on: false };
  };
  begin = () => {
    const r = this.state.src.getBoundingClientRect();
    this.state.dx = this.state.x0 - r.left;
    this.state.dy = this.state.y0 - r.top;
    this.state.ghost = this.state.src.cloneNode(true);
    this.state.ghost.classList.add('drag-ghost');
    this.state.ghost.style.width = r.width + 'px';
    this.root.append(this.state.ghost);
    this.state.src.classList.add('dragging');
    this.state.mark = document.createElement('div');
    this.state.mark.className = 'drop-mark';
    this.root.classList.add('is-dragging');
    this.state.on = true;
    this.state.raf = requestAnimationFrame(this.scrollLoop);
  };
  move = (e) => {
    if (!this.state) return;
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
  // Count items above the pointer, excluding the dragged card.
  locate = () => {
    const el = document.elementFromPoint(this.state.x, this.state.y);
    const zone = el && el.closest(`[data-zone][data-accept~="${this.state.kind}"]`);
    this.root.querySelectorAll('.drop-on').forEach(z => z !== zone && z.classList.remove('drop-on'));
    this.state.zone = zone;
    if (!zone) return this.state.mark.remove();
    zone.classList.add('drop-on');
    const items = [...zone.querySelectorAll(':scope > [data-drag]')].filter(x => x !== this.state.src);
    this.state.index = items.filter(x => { const r = x.getBoundingClientRect(); return r.top + r.height / 2 < this.state.y; }).length;
    const next = items[this.state.index];
    if (next) zone.insertBefore(this.state.mark, next);
    else zone.append(this.state.mark);
  };
  up = () => {
    if (!this.state) return;
    const st = this.state;
    this.state = null;
    if (!st.on) return;
    this.finish(st);
    this.swallowClick();
    if (st.zone) this.onDrop({ kind: st.kind, id: st.id, zone: { ...st.zone.dataset }, index: st.index });
  };
  finish = (st) => {
    cancelAnimationFrame(st.raf);
    st.ghost.remove();
    st.mark.remove();
    st.src.classList.remove('dragging');
    this.root.querySelectorAll('.drop-on').forEach(z => z.classList.remove('drop-on'));
    this.root.classList.remove('is-dragging');
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
    if (this.state.on) this.finish(this.state);
    this.state = null;
  };

  active = () => Boolean(this.state?.on);
  dispose = () => {
    if (this.state?.on) this.finish(this.state); this.state = null;
    this.root.removeEventListener('pointerdown', this.down); window.removeEventListener('pointermove', this.move);
    window.removeEventListener('pointerup', this.up); window.removeEventListener('keydown', this.key);
  };
}
