// 时间线 view: 时段/线路 side column, sticky tools (find, three densities, current band,
// line strip) and the lanes. Lines, open cards and density are kept per book; reader
// links arrive as #p-<point> (locate) and #line-<owner> (show that line).
import { buildModel, layoutTimeline, type NovelTimelineData, type TimelineLayout, type TimelineModel } from '../../novelTimelineModel.ts';
import { esc, icon } from '../../archive/ui.ts';
import { enter, flash, scrollToY } from '../../archive/motion.ts';
import type { NovelRoute } from '../../novelArchiveRoute.ts';
import type { CreateNovelView, NovelViewHost, ShowContext } from '../types.ts';
import { cardHtml, cardLinks, swatch, type CardLinks } from './card.ts';
import { drawLanes, geometry, measure, rowsHtml, type Geometry, type TimelineState } from './draw.ts';
import { sideHtml, wireSide } from './side.ts';
import { searchInput } from '../../archive/input.ts';
import { TimelineStrip } from './strip.ts';

const DENSITIES: [number, string][] = [[.4, '总览'], [.7, '紧凑'], [1, '标准']];
const narrow = () => window.innerWidth <= 860;

class TimelinePanel {
  private model: TimelineModel;
  private links: CardLinks;
  private st: TimelineState;
  private el: Record<'side' | 'body' | 'tools' | 'strip' | 'now' | 'tl' | 'rows' | 'find' | 'cnt' | 'dens', HTMLElement>;
  private svg: SVGSVGElement;
  private L: { lay: TimelineLayout; g: Geometry; y: Record<string, number>; hits: string[] } | null = null;
  private visible = false;
  private raf = 0;
  private resizeTimer = 0;
  private search: ReturnType<typeof searchInput> | null = null;
  private strip: TimelineStrip;
  private currentBand = -1;
  private renderPending = false;
  private onScroll = () => { if (this.visible && !this.raf) this.raf = requestAnimationFrame(() => { this.raf = 0; this.updateStrip(); }); };
  private onResize = () => { clearTimeout(this.resizeTimer); this.resizeTimer = window.setTimeout(() => { if (this.visible) this.render(); }, 120); };

  constructor(private host: NovelViewHost, data: NovelTimelineData) {
    this.model = buildModel(data);
    this.links = cardLinks(this.model, host);
    this.st = (host.memo.state as TimelineState | undefined) ?? { sel: new Set(data.defaultOn), open: new Set(), z: 1, q: '', hit: -1 };
    host.memo.state = this.st;
    const frame = document.createElement('div');
    frame.className = 'tlv frame';
    frame.innerHTML = '<aside class="side" aria-label="时段与线路"><div class="side-body"></div></aside><main class="tlmain"><div class="tools"><div class="t1">' +
      '<button type="button" class="btn primary lines-btn" data-drawer>线路 <b data-nsel></b></button><h2>故事时间线</h2>' +
      `<label class="find">${icon('search')}<input type="text" enterkeyhint="search" placeholder="在时间线里找…" aria-label="在时间线里找"><span class="cnt"></span>` +
      '<button type="button" data-find="-1" aria-label="上一处">↑</button><button type="button" data-find="1" aria-label="下一处">↓</button></label><span class="sp"></span>' +
      `<span class="seg dens" role="group" aria-label="疏密">${DENSITIES.map(([z, label]) => `<button type="button" data-z="${z}">${label}</button>`).join('')}</span></div>` +
      '<div class="now" aria-live="polite"></div><div class="strip" aria-hidden="true"></div></div>' +
      '<div class="tl"><svg aria-hidden="true"></svg><div class="rows"></div></div></main>';
    host.root.append(frame);
    const q = <T extends HTMLElement>(s: string) => frame.querySelector<T>(s)!;
    this.el = { side: q('.side'), body: q('.side-body'), tools: q('.tools'), strip: q('.strip'), now: q('.now'), tl: q('.tl'), rows: q('.rows'), find: q('.find'), cnt: q('.cnt'), dens: q('.dens') };
    this.svg = frame.querySelector('.tl svg')!;
    this.strip = new TimelineStrip(this.el.strip);
    this.el.side.prepend(host.sideHead());
    q<HTMLInputElement>('.find input').value = this.st.q;
    this.el.find.classList.toggle('has-q', Boolean(this.st.q));
    this.wire();
    window.addEventListener('scroll', this.onScroll, { passive: true });
    window.addEventListener('resize', this.onResize);
  }

  private wire() {
    wireSide(this.el.body, this.model, this.st, (focus, previous) => {
      this.renderAnchored();
      if (previous) this.host.toast('已更新线路选择', { label: '撤销', action: () => { this.st.sel = previous; this.renderAnchored(); } });
      if (focus) this.el.body.querySelector<HTMLElement>(`[data-o="${CSS.escape(focus)}"]`)?.focus();
    }, (b) => {
      this.host.setDrawer(false);
      const band = this.el.rows.querySelector<HTMLElement>(`#band-${b}`);
      if (band) window.scrollTo({ top: band.getBoundingClientRect().top + window.scrollY - this.stickyH() + 2 });
    });
    this.el.tools.querySelector('[data-drawer]')!.addEventListener('click', () => this.host.setDrawer(true));
    this.el.dens.addEventListener('click', (event) => {
      const b = (event.target as Element).closest<HTMLElement>('[data-z]');
      if (b) this.setDensity(Number(b.dataset.z));
    });
    this.el.tl.addEventListener('click', (event) => {
      const target = event.target as Element;
      const go = target.closest<HTMLElement>('[data-go]');
      if (go) { if (go.dataset.go) this.jump(go.dataset.go, { from: go.closest<HTMLElement>('.card')!.dataset.card }); return; }
      const close = target.closest<HTMLElement>('[data-close]');
      if (close) { this.toggle(close.dataset.close!); return; }
      if (target.closest('.card')) return;
      const row = target.closest<HTMLElement>('[data-p]');
      if (row) this.toggle(row.dataset.p!);
    });
    this.el.tl.addEventListener('keydown', (event) => {
      const row = (event.target as Element).closest<HTMLElement>('.row');
      if (!row || (event.key !== 'Enter' && event.key !== ' ')) return;
      event.preventDefault();
      this.toggle(row.dataset.p!);
      this.rowEl(row.dataset.p!)?.focus({ preventScroll: true });
    });
    this.wireFind();
  }

  private wireFind() {
    const input = this.el.find.querySelector('input')!;
    const set = (value: string) => {
      if (this.st.q === value.trim() && !this.renderPending) return;
      const wasOverview = this.L?.g.overview;
      this.st.q = value.trim();
      this.st.hit = -1;
      this.el.find.classList.toggle('has-q', Boolean(this.st.q));
      if (this.renderPending || wasOverview !== (!this.st.q && this.st.z < .55)) this.renderAnchored();
      else this.searchRows();
      if (this.L?.hits.length) this.step(1);
    };
    this.search = searchInput(input, () => set(input.value));
    input.addEventListener('keydown', (event) => {
      if (event.isComposing || this.search?.composing()) return;
      if (event.key === 'Enter') { event.preventDefault(); const changed = input.value.trim() !== this.st.q; this.search?.flush(); if (!changed) this.step(event.shiftKey ? -1 : 1); }
      if (event.key === 'Escape') { input.value = ''; this.search?.flush(); }
    });
    this.el.find.querySelectorAll<HTMLElement>('[data-find]').forEach((b) => b.addEventListener('click', () => this.step(Number(b.dataset.find))));
  }

  private stickyH() { return (document.querySelector<HTMLElement>('.bar')?.offsetHeight ?? 0) + this.el.tools.offsetHeight; }
  private rowEl(pid: string) { return [...this.el.rows.children as HTMLCollectionOf<HTMLElement>].find((r) => r.dataset.p === pid); }

  private renderAnchored(pid?: string, closing = false) {
    const old = this.L?.lay.pts ?? [], top = this.stickyH() + 8;
    const visible = [...this.el.rows.children as HTMLCollectionOf<HTMLElement>].find(r => r.getBoundingClientRect().bottom >= top);
    const id = pid ?? visible?.dataset.p ?? visible?.dataset.card;
    const anchor = id ? this.rowEl(id) : null;
    const offset = closing ? Math.max(top, anchor?.getBoundingClientRect().top ?? top) : anchor?.getBoundingClientRect().top ?? top;
    this.render();
    const nearest = id && (this.L?.lay.pts.includes(id) ? id : [...old].sort((a, b) => Math.abs(old.indexOf(a) - old.indexOf(id)) - Math.abs(old.indexOf(b) - old.indexOf(id))).find(p => this.L?.lay.pts.includes(p)));
    const next = nearest && this.rowEl(nearest);
    if (next) window.scrollBy({ top: next.getBoundingClientRect().top - offset, behavior: 'instant' });
  }

  private searchRows() {
    if (!this.L) return;
    const q = this.st.q, hits: string[] = [];
    this.el.rows.querySelectorAll<HTMLElement>('.row[data-p]').forEach(row => {
      const tx = row.querySelector<HTMLElement>('.tx')!, text = tx.dataset.text ?? tx.textContent ?? '';
      tx.dataset.text = text;
      tx.innerHTML = q ? esc(text).split(esc(q)).join(`<mark>${esc(q)}</mark>`) : esc(text);
      const p = this.model.data.points[row.dataset.p!];
      if (q && [text, p.title, p.story ?? ''].some(s => s.includes(q))) hits.push(row.dataset.p!);
      row.classList.remove('cur');
    });
    this.L.hits = hits;
    this.el.cnt.textContent = q ? hits.length ? `${Math.max(0, this.st.hit) + 1}/${hits.length}` : '0 处' : '';
  }

  render() {
    if (this.search?.composing()) { this.renderPending = true; return; }
    this.renderPending = false;
    const { st, model, el } = this;
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) / 16 || 1;
    const lay = layoutTimeline(model, st.sel), g = geometry(st.q && st.z < .55 ? .7 : st.z, narrow(), rem);
    el.tl.classList.toggle('overview', g.overview);
    el.tl.style.setProperty('--fs', `${g.fs}px`);
    el.tl.style.setProperty('--lh', `${g.lh}px`);
    el.tl.style.setProperty('--rh', `${g.rh}px`);
    el.tl.style.setProperty('--rp', g.overview ? '0px' : `${Math.max(2, (g.rh - g.lh) / 2)}px`);
    const { html, hits } = rowsHtml(model, lay, st, g, (pid, pad) => cardHtml(pid, pad, lay, model, this.links));
    el.rows.innerHTML = html;
    const y = measure(el.rows, g.overview);
    this.svg.setAttribute('width', String(el.tl.offsetWidth));
    this.svg.setAttribute('height', String(el.rows.offsetHeight));
    drawLanes(this.svg, model, lay, st, g, y);
    this.L = { lay, g, y, hits };
    el.cnt.textContent = st.q ? (hits.length ? `${Math.max(0, st.hit) + 1}/${hits.length}` : '0 处') : '';
    el.dens.querySelectorAll<HTMLElement>('[data-z]').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.z) === st.z)));
    el.body.innerHTML = sideHtml(model, lay, st);
    el.tools.querySelectorAll('[data-nsel]').forEach((b) => { b.textContent = String(st.sel.size); });
    this.strip.reset(); this.currentBand = -1; this.updateStrip();
  }

  private toggle(pid: string) {
    const closing = this.st.open.has(pid);
    if (closing) this.st.open.delete(pid); else this.st.open.add(pid);
    this.renderAnchored(pid, closing);
    // only the card this toggle opened is revealed; other re-renders stay still
    const card = closing ? null : this.el.rows.querySelector<HTMLElement>(`.card[data-card="${CSS.escape(pid)}"]`);
    if (card) enter(card, 'reveal');
  }

  /** Shows a point, adding a line that has it when it is off the current selection. `land`
   *  (arriving from another view) places it at once; moves within the view use scrollToY. */
  private jump(pid: string, { open = true, from, land = false }: { open?: boolean; from?: string; land?: boolean } = {}) {
    const { model, st } = this;
    let changed = false;
    if (!model.data.points[pid]) return;
    if (!this.L?.lay.pts.includes(pid)) {
      const id = (model.ownersOf[pid] ?? []).find((o) => !model.lines[o].axis);
      if (id) { st.sel.add(id); changed = true; this.host.toast(`已加入线路：${model.lines[id].name}`); }
    }
    if (from && st.open.delete(from)) changed = true;
    if (open && !st.open.has(pid)) { st.open.add(pid); changed = true; }
    if (changed) this.render();
    const r = this.rowEl(pid);
    if (!r) return;
    const top = r.getBoundingClientRect().top + window.scrollY - this.stickyH() - 24;
    if (land) window.scrollTo({ top, behavior: 'instant' }); else scrollToY(top);
    r.classList.add('cur');
    flash(r);
  }

  private step(d: number) {
    const hits = this.L?.hits ?? [];
    if (!hits.length) return;
    this.st.hit = (this.st.hit + d + hits.length) % hits.length;
    this.el.rows.querySelectorAll('.cur').forEach(el => el.classList.remove('cur'));
    this.el.cnt.textContent = `${this.st.hit + 1}/${hits.length}`;
    this.jump(hits[this.st.hit], { open: false });
  }

  /** Keeps the first visible row in place; 总览 shows structure only, so it closes the cards. */
  private setDensity(z: number) {
    const top = this.stickyH();
    const anchor = [...this.el.rows.children as HTMLCollectionOf<HTMLElement>].find((r) => r.dataset.p && r.getBoundingClientRect().bottom >= top);
    const off = anchor?.getBoundingClientRect().top ?? 0;
    this.st.z = z;
    if (z < .55) this.st.open.clear();
    this.render();
    const r = anchor && this.rowEl(anchor.dataset.p!);
    if (r) window.scrollBy({ top: r.getBoundingClientRect().top - off, behavior: 'instant' });
  }

  /** The lines at the current scroll position, and the current 时段. */
  private updateStrip() {
    if (!this.L) return;
    const { lay, g, y } = this.L, { data, lines } = this.model;
    const yy = window.scrollY + this.stickyH() - (this.el.tl.getBoundingClientRect().top + window.scrollY) + 8;
    const yi = (i: number) => y[lay.pts[i]];
    let row = 0;
    while (row + 1 < lay.pts.length && yi(row + 1) <= yy) row++;
    const active = lay.exc.filter((x) => yi(x.s) <= yy && yy <= yi(x.e) && x.slot[row] !== undefined).sort((a, b) => a.slot[row] - b.slot[row]);
    const off = new Set(active.map((x) => x.o));
    const merged = lay.sel.filter((o) => { const s = lay.seqs[o.id]; return !off.has(o.id) && y[s[0]] <= yy && yy <= y[s.at(-1)!]; });
    let html = `<div class="tick" style="left:${g.axisX - 1}px;border-color:var(--axis)"></div>`;
    const chips = [{ x: g.axisX, html: `<span class="chip2 axis">${esc(`主轴 ${data.axisLabel}${merged.length ? ` ＋ ${merged.map((o) => o.name).join('、')}` : ''}`)}</span>` }];
    active.forEach((x) => {
      const o = lines[x.o];
      html += `<div class="tick" style="left:${g.X(x.slot[row]) - 1}px;border-color:${o.color}"></div>`;
      chips.push({ x: g.X(x.slot[row]), html: `<span class="chip2">${swatch(o, 16)}${esc(o.name)}</span>` });
    });
    this.strip.update(html, chips);
    const b = data.points[lay.pts[row]]?.b ?? 0;
    if (b === this.currentBand) return;
    this.currentBand = b;
    this.el.now.innerHTML = `时段 ${b + 1}/${data.bands.length} · <b>${esc(data.bands[b] ?? '')}</b>`;
    this.el.body.querySelectorAll<HTMLElement>('[data-band]').forEach((a) => {
      if (Number(a.dataset.band) === b) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
  }

  /** Links from the reader: #p-<point> locates it, #line-<owner> shows that line. */
  private fromHash(hash: string) {
    let h = hash.slice(1);
    try { h = decodeURIComponent(h); } catch { /* keep as is */ }
    const point = /^p-(.+)$/.exec(h)?.[1];
    if (point) return void this.jump(point, { land: true });
    const o = this.model.lines[/^line-(.+)$/.exec(h)?.[1] ?? ''];
    if (!o) return;
    if (!o.axis) { this.st.sel.add(o.id); this.render(); }
    const first = [...o.pts].sort((a, b) => this.model.data.points[a[0]].r - this.model.data.points[b[0]].r)[0]?.[0];
    if (first) this.jump(first, { open: false, land: true });
    this.host.toast(o.axis ? `${o.name}在主轴上` : `已显示线路：${o.name}`);
  }

  show(route: NovelRoute, ctx: ShowContext) {
    this.visible = true;
    this.render();
    if (ctx.restore !== undefined) window.scrollTo(0, ctx.restore);
    else if (route.hash) this.fromHash(route.hash);
    else window.scrollTo(0, ctx.via === 'pop' || ctx.via === 'nav' ? this.st.y ?? 0 : 0);
    this.updateStrip();
  }

  hide() {
    this.st.y = window.scrollY;
    this.visible = false;
  }

  dispose() {
    this.search?.dispose();
    window.removeEventListener('scroll', this.onScroll);
    window.removeEventListener('resize', this.onResize);
    cancelAnimationFrame(this.raf);
    clearTimeout(this.resizeTimer);
  }
}

const createTimeline: CreateNovelView = (host) => {
  let panel: TimelinePanel | null = null;
  let empty = false;
  return {
    async show(route, ctx) {
      document.title = `时间线 · ${host.bookTitle} · 小离总周报`;
      if (empty) return true;
      if (!panel) {
        const data = await host.timeline();
        if (data === undefined || !ctx.latest()) return false;
        if (!data) {
          empty = true;
          host.root.innerHTML = '<div class="tlv"><p class="tl-empty">这本书的时间线尚未同步。</p></div>';
          return true;
        }
        panel = new TimelinePanel(host, data);
      }
      panel.show(route, ctx);
      return true;
    },
    hide: () => panel?.hide(),
    dispose: () => panel?.dispose(),
    label: () => '时间线',
  };
};

export default createTimeline;
