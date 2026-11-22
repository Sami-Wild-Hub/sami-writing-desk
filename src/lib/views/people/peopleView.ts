// 人物 view: one row per character for looking things up while writing. Sticky tools
// (search on 姓名 and 称呼, 所属 filter), the table, and a detail row per person with the
// full evidence. Search, filter, open rows and scroll are kept per book.
import { esc, icon } from '../../archive/ui.ts';
import { filterPeople, groupsOf, hasEntries, parsePeopleData, type NovelPeopleData, type PeopleFilter } from '../../novelPeopleModel.ts';
import type { CreateNovelView, NovelViewHost, ShowContext } from '../types.ts';
import { detailHtml, peopleLinks, rowHtml, type PeopleLinks } from './cells.ts';

export { parsePeopleData };

interface PeopleState { q: string; filter: PeopleFilter; open: Set<string>; y?: number; }
const COLUMNS = ['姓名', '称呼/别名', '所属', '一句话身份', '首次出现', '当前状态', '记忆钩子', '主要关系'];

class PeoplePanel {
  private st: PeopleState;
  private links: PeopleLinks;
  private asOf: string;
  private el: Record<'tools' | 'chips' | 'side' | 'rows' | 'cnt', HTMLElement>;
  private input: HTMLInputElement;

  constructor(private host: NovelViewHost, private data: NovelPeopleData) {
    this.st = (host.memo.state as PeopleState | undefined) ?? { q: '', filter: '', open: new Set() };
    host.memo.state = this.st;
    this.links = peopleLinks(data, host);
    this.asOf = `截至 ${data.scope.split(/[–-]/).pop() ?? ''}`;
    const frame = document.createElement('div');
    frame.className = 'ppl';
    const notes = [data.scope && `KB ${data.scope}`, `称呼、外在与言行已抽 ${data.extracted || '—'}`, '主要关系暂未生成'].filter(Boolean).join(' · ');
    frame.innerHTML = '<aside class="side" aria-label="所属"><div class="side-body"></div></aside><main class="pmain"><div class="tools"><div class="t1">' +
      `<h2>人物</h2><label class="find">${icon('search')}<input type="search" enterkeyhint="search" placeholder="找姓名或称呼…" aria-label="找姓名或称呼"></label>` +
      `<span class="cnt" aria-live="polite"></span><span class="sp"></span><span class="note">${esc(notes)}</span></div>` +
      '<div class="chips" role="group" aria-label="按所属筛选"></div></div>' +
      `<div class="tbl"><table class="people"><thead><tr>${COLUMNS.map((c) => `<th scope="col">${c}</th>`).join('')}</tr></thead><tbody></tbody></table>` +
      '<p class="none" hidden>没有符合的人物。</p></div></main>';
    host.root.append(frame);
    const q = <T extends HTMLElement>(s: string) => frame.querySelector<T>(s)!;
    this.el = { tools: q('.tools'), chips: q('.chips'), side: q('.side-body'), rows: q('tbody'), cnt: q('.cnt') };
    q('.side').prepend(host.sideHead());
    this.input = q<HTMLInputElement>('.find input');
    this.input.value = this.st.q;
    // The table header sticks below the tools, whose height changes with the chips' wrapping.
    new ResizeObserver(() => frame.style.setProperty('--tools-h', `${this.el.tools.offsetHeight}px`)).observe(this.el.tools);
    this.renderChips();
    this.wire();
  }

  private filters() {
    const { people } = this.data;
    const none = people.filter((p) => !p.group.length).length;
    return [
      { id: '', name: '全部', n: people.length },
      { id: '*entries', name: '有称呼、外在与言行', n: people.filter(hasEntries).length },
      ...groupsOf(people),
      ...(none ? [{ id: '*none', name: '未标所属', n: none }] : []),
    ];
  }

  private renderChips() {
    const items = this.filters();
    this.el.chips.innerHTML = items.map((f) =>
      `<button type="button" class="chip" data-filter="${esc(f.id)}" aria-pressed="${f.id === this.st.filter}">${esc(f.name)}<span class="n">${f.n}</span></button>`).join('');
    this.el.side.innerHTML = '<h3>所属</h3>' + items.map((f) =>
      `<a class="navlink" href="#" data-filter="${esc(f.id)}"${f.id === this.st.filter ? ' aria-current="page"' : ''}>${esc(f.name)}<span class="n">${f.n}</span></a>`).join('');
  }

  private wire() {
    const pick = (event: Event) => {
      const b = (event.target as Element).closest<HTMLElement>('[data-filter]');
      if (!b) return;
      event.preventDefault();
      this.st.filter = b.dataset.filter ?? '';
      this.host.setDrawer(false);
      this.renderChips();
      this.render();
    };
    this.el.chips.addEventListener('click', pick);
    this.el.side.addEventListener('click', pick);
    this.input.addEventListener('input', () => { this.st.q = this.input.value; this.render(); });
    this.input.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') { this.input.value = ''; this.st.q = ''; this.render(); }
    });
    this.el.rows.addEventListener('click', (event) => {
      const b = (event.target as Element).closest<HTMLElement>('[data-toggle]');
      if (b) this.toggle(b.dataset.toggle!, b.classList.contains('btn'));
    });
  }

  render() {
    const { st, data } = this;
    const q = st.q.trim();
    const shown = filterPeople(data.people, q, st.filter);
    this.el.rows.innerHTML = shown.map((p) => rowHtml(p, st.open.has(p.id), q, this.links, this.asOf) +
      (st.open.has(p.id) ? detailHtml(p, data, this.links) : '')).join('');
    this.el.cnt.textContent = shown.length === data.people.length ? `${shown.length} 人` : `${shown.length} / ${data.people.length} 人`;
    this.host.root.querySelector<HTMLElement>('.none')!.hidden = shown.length > 0;
  }

  private rowEl(id: string) { return this.el.rows.querySelector<HTMLElement>(`tr.person[data-id="${CSS.escape(id)}"]`); }
  private stickyH() { return (document.querySelector<HTMLElement>('.bar')?.offsetHeight ?? 0) + this.el.tools.offsetHeight; }

  /** Opens or closes a person's detail; closing from the detail's own button brings the row back into view. */
  private toggle(id: string, fromDetail: boolean) {
    if (this.st.open.has(id)) this.st.open.delete(id); else this.st.open.add(id);
    const before = this.rowEl(id)?.getBoundingClientRect().top;
    this.render();
    const row = this.rowEl(id);
    if (!row) return;
    const top = row.getBoundingClientRect().top;
    if (fromDetail && top < this.stickyH()) window.scrollTo({ top: top + window.scrollY - this.stickyH() - 8, behavior: 'instant' });
    else if (before !== undefined) window.scrollBy({ top: top - before, behavior: 'instant' });
    row.querySelector<HTMLElement>('.who-btn')?.focus({ preventScroll: true });
  }

  show(ctx: ShowContext) {
    this.render();
    if (ctx.restore !== undefined) window.scrollTo(0, ctx.restore);
    else window.scrollTo(0, ctx.via === 'pop' || ctx.via === 'nav' ? this.st.y ?? 0 : 0);
  }

  hide() { this.st.y = window.scrollY; }
}

const createPeople: CreateNovelView = (host) => {
  let panel: PeoplePanel | null = null;
  let empty = false;
  return {
    async show(_route, ctx) {
      document.title = `人物 · ${host.bookTitle} · 小离总周报`;
      if (empty) return true;
      if (!panel) {
        const data = await host.people();
        if (data === undefined || !ctx.latest()) return false;
        if (!data) {
          empty = true;
          host.root.innerHTML = '<div class="ppl"><p class="ppl-empty">这本书的人物表尚未同步。</p></div>';
          return true;
        }
        panel = new PeoplePanel(host, data);
      }
      panel.show(ctx);
      return true;
    },
    hide: () => panel?.hide(),
    dispose: () => undefined,
    label: () => '人物',
  };
};

export default createPeople;
