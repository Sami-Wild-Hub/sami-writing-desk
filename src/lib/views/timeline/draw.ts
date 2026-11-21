// Timeline rows and lanes for one density: geometry, the row list (bands, rows, open
// cards) and the SVG of the axis, excursions and nodes, measured from the laid-out rows.
import { eventNo, pointLabel } from '../../labels.ts';
import { smooth, type TimelineLayout, type TimelineModel } from '../../novelTimelineModel.ts';
import { esc } from '../../archive/ui.ts';

export interface TimelineState { sel: Set<string>; open: Set<string>; z: number; q: string; hit: number; y?: number; }
export interface Geometry { axisX: number; laneW: number; rh: number; fs: number; lh: number; overview: boolean; X(l: number): number; pad(l: number): number; }

/** Density z (总览 .4, 紧凑 .7, 标准 1) on a phone or not; `rem` follows the root font size on wide screens. */
export function geometry(z: number, narrow: boolean, rem: number): Geometry {
  const overview = z < .55;
  const axisX = (narrow ? 14 : 22) * rem;
  const laneW = (narrow ? 13 : 18) * Math.min(1.4, Math.max(.75, z)) * rem;
  const rh = Math.max(7, 30 * z) * rem;
  // one pixel above the sample's rows: 12–17px, 16px at 标准 on a desktop
  const fs = Math.round(Math.min(17, Math.max(12, (narrow ? 15 : 16) * Math.sqrt(z))) * rem);
  const X = (l: number) => (l < 0 ? axisX : axisX + (l + 1) * laneW);
  return { axisX, laneW, rh, fs, lh: fs * 1.5, overview, X, pad: (l) => X(l) + (overview ? 8 : 12) };
}

/** Event IDs inside row text read as their numbers (#0047). */
const relabel = (text: string) => text.replace(/[A-Z]-\d{4}/g, (eid) => eventNo(eid));

export function rowsHtml(model: TimelineModel, lay: TimelineLayout, st: TimelineState, g: Geometry, card: (pid: string, padLeft: number) => string) {
  const { data, lines: OWN, ownersOf, keyPoints } = model;
  const q = st.q;
  const hl = (s: string) => (q ? esc(s).split(esc(q)).join(`<mark>${esc(q)}</mark>`) : esc(s));
  let html = '', lastBand = -1;
  const hits: string[] = [];
  lay.pts.forEach((pid, i) => {
    const P = data.points[pid];
    if (P.b !== lastBand) {
      lastBand = P.b;
      html += `<div class="band" id="band-${P.b}" style="padding-left:${g.pad(lay.textMax[i])}px"><b>${esc(data.bands[P.b] ?? '')}</b></div>`;
    }
    const onAxis = lay.axisPts.has(pid);
    const ls = (ownersOf[pid] ?? []).filter((id) => st.sel.has(id) && !OWN[id].axis);
    const owner = onAxis ? null : OWN[lay.primary[pid]];
    const text = relabel(owner ? (owner.text[pid] || P.t) : P.t);
    const open = st.open.has(pid);
    if (q && [text, P.title, P.story ?? ''].some((s) => s.includes(q))) hits.push(pid);
    html += `<div class="row${open ? ' open' : ''}" data-p="${esc(pid)}" role="button" tabindex="0" aria-expanded="${open}" style="padding-left:${g.pad(lay.textMax[i])}px">` +
      (keyPoints.has(pid) ? '<span class="key" title="主轴关键点">★</span>' : '') +
      (ls.length ? `<span class="who">${ls.map((id) => `<i style="background:${OWN[id].color}">${esc(OWN[id].name)}</i>`).join('')}</span>` : '') +
      `<span class="tx">${hl(text)}</span><span class="id">${esc(pointLabel(pid))}</span></div>`;
    if (open) html += card(pid, g.pad(lay.gapMax[i]));
  });
  return { html, hits };
}

/** Node height of each row: the first text line, or the middle of an overview row. */
export function measure(rows: HTMLElement, overview: boolean) {
  const y: Record<string, number> = {};
  for (const r of rows.children as HTMLCollectionOf<HTMLElement>) {
    if (!r.dataset.p) continue;
    const cs = getComputedStyle(r);
    y[r.dataset.p] = r.offsetTop + (overview ? r.offsetHeight / 2 : parseFloat(cs.paddingTop) + parseFloat(cs.lineHeight) / 2);
  }
  return y;
}

export function drawLanes(svg: SVGSVGElement, model: TimelineModel, lay: TimelineLayout, st: TimelineState, g: Geometry, y: Record<string, number>) {
  const { lines: OWN, ownersOf, keyPoints } = model;
  const xOf = (p: string) => (lay.axisPts.has(p) ? g.axisX : g.X(lay.exc[lay.excOf[p]].slot[lay.idx[p]]));
  let under = '', lines = '', nodes = '';
  const axisList = lay.pts.filter((p) => lay.axisPts.has(p));
  if (axisList.length) lines += `<line x1="${g.axisX}" y1="${y[axisList[0]]}" x2="${g.axisX}" y2="${y[axisList.at(-1)!]}" stroke="var(--axis)" stroke-width="4" stroke-linecap="round"/>`;
  for (const x of lay.exc) {
    const o = OWN[x.o], own = new Set(x.pts), s: [number, number][] = [];
    for (let i = x.s; i <= x.e; i++) {
      const p = lay.pts[i];
      const sx = (i === x.s && !x.open0) || (i === x.e && !x.open1) ? g.axisX : own.has(p) && lay.primary[p] !== x.o ? xOf(p) : g.X(x.slot[i]);
      s.push([sx, y[p]]);
    }
    if (s.length > 1) {
      const d = smooth(s);
      under += `<path d="${d}" fill="none" stroke="var(--surface)" stroke-width="6"/>`;
      lines += `<path d="${d}" fill="none" stroke="${o.color}" stroke-width="2.5" stroke-dasharray="${o.dash}" stroke-linecap="round"/>`;
    }
    if (x.open0) nodes += `<circle cx="${s[0][0]}" cy="${s[0][1] - 9}" r="2.5" fill="${o.color}"/>`;
    if (x.open1) { const [ex, ey] = s.at(-1)!; nodes += `<line x1="${ex - 4}" y1="${ey + 9}" x2="${ex + 4}" y2="${ey + 9}" stroke="${o.color}" stroke-width="2.5"/>`; }
  }
  for (const p of lay.pts) {
    const cx = xOf(p), cy = y[p], ax = lay.axisPts.has(p);
    const shared = (ownersOf[p] ?? []).filter((id) => st.sel.has(id) && !OWN[id].axis);
    const r = (g.overview ? .6 : 1) * (ax && keyPoints.has(p) ? 6.5 : 5), meet = !ax && shared.length > 1;
    nodes += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${ax ? 'var(--axis)' : OWN[lay.primary[p]].color}" stroke="${meet ? 'var(--axis)' : 'var(--surface)'}" stroke-width="${meet ? 2.5 : 2}"/>`;
    if (ax && shared.length && !g.overview) nodes += `<circle cx="${cx}" cy="${cy}" r="${r + 3.5}" fill="none" stroke="${OWN[shared[0]].color}" stroke-width="1.5" stroke-dasharray="${OWN[shared[0]].dash}"/>`;
    if (st.open.has(p)) nodes += `<circle cx="${cx}" cy="${cy}" r="${r + 6}" fill="none" stroke="var(--accent)" stroke-width="2"/>`;
    nodes += `<circle class="hit" data-p="${esc(p)}" cx="${cx}" cy="${cy}" r="12" fill="transparent"/>`;
  }
  svg.innerHTML = under + lines + nodes;
}
