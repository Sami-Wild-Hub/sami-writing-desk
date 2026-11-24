// Timeline side column (the phone drawer): 时段 with point counts, and 线路 per domain
// with 全选/清空; the axis Owners are always on.
import type { TimelineLayout, TimelineModel } from '../../novelTimelineModel.ts';
import { esc } from '../../archive/ui.ts';
import { swatch } from './card.ts';
import type { TimelineState } from './draw.ts';

export function sideHtml(model: TimelineModel, lay: TimelineLayout, st: TimelineState) {
  const { data, ordered } = model;
  const perBand = data.bands.map((_, b) => lay.pts.filter((p) => data.points[p].b === b).length);
  let h = `<h3>时段</h3>${data.bands.map((b, i) =>
    `<a class="navlink" href="#band-${i}" data-band="${i}"><span class="bn">${i + 1}</span>${esc(b)}<span class="n">${perBand[i]}</span></a>`).join('')}`;
  h += `<div class="ln-head"><h3>线路 · 已选 ${st.sel.size}</h3><button type="button" class="btn" data-all="1">全选</button><button type="button" class="btn" data-all="0">清空</button></div>`;
  for (const [dom, label] of data.domains) {
    const list = ordered.filter((o) => o.domain === dom);
    if (!list.length) continue;
    const buttons = list.some((o) => !o.axis) ? `<button type="button" data-dom="${esc(dom)}" data-v="1">全选</button><button type="button" data-dom="${esc(dom)}" data-v="0">清空</button>` : '';
    h += `<div class="dom">${esc(label)} <span class="n">${list.length}</span>${buttons}</div>`;
    h += list.map((o) => `<label class="own" title="${esc(o.desc)}"><input type="checkbox" data-o="${esc(o.id)}"${o.axis || st.sel.has(o.id) ? ' checked' : ''}${o.axis ? ' disabled' : ''}>` +
      `${swatch(o)}<span class="nm">${esc(o.name)}</span>${o.axis ? '<span class="tag">主轴</span>' : `<span class="ct">${o.pts.length}</span>`}</label>`).join('');
  }
  return h;
}

/** Wires the side column; `changed` re-renders, `band` scrolls to a 时段. */
export function wireSide(side: HTMLElement, model: TimelineModel, st: TimelineState, changed: (focus?: string, previous?: Set<string>) => void, band: (b: string) => void) {
  side.addEventListener('change', (event) => {
    const input = event.target as HTMLInputElement;
    const id = input.dataset.o;
    if (!id) return;
    if (input.checked) st.sel.add(id); else st.sel.delete(id);
    changed(id);
  });
  side.addEventListener('click', (event) => {
    const target = event.target as Element;
    const link = target.closest<HTMLElement>('[data-band]');
    if (link) {
      event.preventDefault();
      band(link.dataset.band!);
      return;
    }
    const b = target.closest<HTMLButtonElement>('button[data-all], button[data-dom]');
    if (!b) return;
    const previous = new Set(st.sel);
    const on = (b.dataset.all ?? b.dataset.v) === '1';
    model.ordered.filter((o) => !o.axis && (b.dataset.all !== undefined || o.domain === b.dataset.dom))
      .forEach((o) => { if (on) st.sel.add(o.id); else st.sel.delete(o.id); });
    if (previous.size !== st.sel.size || [...previous].some(id => !st.sel.has(id))) changed(undefined, previous);
  });
}
