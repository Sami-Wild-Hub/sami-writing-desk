// Authenticated foreshadow table edited in place like a spreadsheet (cards on phones), remembered filters,
// keyboard shortcuts for status and new rows, saved through the shared outline channel.
// Reads/Writes: localStorage <outline draft key>:foreshadow:view (JSON filter choice)
import type { CreateNovelView, NovelViewHost } from '../types.ts';
import { esc } from '../../archive/ui.ts';
import { ForeshadowCloud } from './cloud.ts';
import { OPEN, addRow, filterRows, findRow, plantingChapters, rowKey, setCell, validateForeshadow, visibleColumns } from './model.js';
import { STATUS_LABEL, cellClass, cellValue, columnClass, rowHtml, statusOptions, viewHtml } from './render.ts';
import { keptWorkspace } from '../outline/sync.ts';
import './style.css';
import type { ForeshadowData, ForeshadowRow } from './schema.ts';

type Input = HTMLTextAreaElement | HTMLSelectElement;
const MAC = /Mac|iP(hone|ad|od)/.test(navigator.platform);
const ALT = MAC ? '⌥' : 'Alt+', MOD = MAC ? '⌘' : 'Ctrl+';
// Alt+digit status shortcuts, also plain digits while the status cell has focus.
const STATUS_KEYS = ['', '已收', '部分回收', '不需要'];
const SIZES_ITSELF = typeof CSS !== 'undefined' && CSS.supports?.('field-sizing', 'content');
const SAVE_AFTER_MS = 700;

class ForeshadowPanel {
  cloud: ForeshadowCloud;
  private status = OPEN;
  private chapter = '';
  private viewKey: string;
  private head = '';
  private rendering = false;
  private composing = false;
  private timers = new Map<Input, ReturnType<typeof setTimeout>>();
  constructor(private host: NovelViewHost, state: ConstructorParameters<typeof ForeshadowCloud>[1]) {
    this.viewKey = host.outlineDraftKey + ':foreshadow:view';
    try {
      const saved = JSON.parse(localStorage.getItem(this.viewKey) ?? 'null');
      if (typeof saved?.status === 'string') this.status = saved.status;
      if (typeof saved?.chapter === 'string') this.chapter = saved.chapter;
    } catch { /* unreadable choice: keep the default filters */ }
    this.cloud = new ForeshadowCloud(host, state, () => this.render());
    host.root.innerHTML = '<main class="fsh"><header><h2>伏笔表</h2><span class="fsh-status" role="status"></span><details class="fsh-keys"><summary class="btn small">快捷键</summary><ul></ul></details></header>' +
      '<div class="fsh-notice"></div><div class="fsh-tools"></div><p class="fsh-empty-state" role="status" hidden></p><div class="fsh-scroll" role="region" aria-label="伏笔表，可横向滚动"><table><thead></thead><tbody></tbody></table></div></main>';
    this.q('.fsh-keys ul').innerHTML = [['Enter', '下一行'], ['Shift+Enter', '上一行'], [`${ALT}Enter`, '换行'], ['Esc', '撤销本格'], [`${ALT}1 / 2 / 3 / 0`, '已收 / 部分回收 / 不需要 / 未收'], [`${ALT}S`, '选状态'], [`${MOD}Enter`, '在下面加行']]
      .map(([key, text]) => `<li><kbd>${key}</kbd> ${text}</li>`).join('');
    const root = host.root;
    root.addEventListener('click', this.click);
    root.addEventListener('change', this.change);
    root.addEventListener('input', this.input);
    root.addEventListener('keydown', this.keydown);
    root.addEventListener('mousedown', this.mousedown);
    root.addEventListener('focusin', this.focusin);
    root.addEventListener('focusout', this.focusout);
    root.addEventListener('compositionstart', this.compose);
    root.addEventListener('compositionend', this.compose);
  }
  private q<T extends HTMLElement = HTMLElement>(selector: string) { return this.host.root.querySelector<T>(selector)!; }
  private get tbody() { return this.q<HTMLTableSectionElement>('tbody'); }

  render() {
    const { data } = this.cloud;
    const status = this.q('.fsh-status');
    status.textContent = this.cloud.error ? '保存失败可重试' : this.cloud.conflict ? '云端已有新版本'
      : this.cloud.dirty || this.cloud.saving ? '正在保存' : data ? '已保存' : '尚未同步';
    status.title = this.cloud.status();
    const notice = this.q('.fsh-notice');
    notice.innerHTML = this.cloud.conflict ? '<p>云端已有新版本；本机改动仍保留。</p><button data-action="download-local">下载本机版</button><button data-action="load">载入云端版</button><button data-action="use-local">用本机版覆盖</button>'
      : this.cloud.remote.incoming && this.cloud.remote.live?.over !== this.cloud.remote.incoming.tree ? '<p>仓库有新版，请选择要保留的版本。</p><button data-action="keep-web">保留网页版</button><button data-action="use-repo">用仓库版</button>'
      : this.cloud.remote.head?.repo?.error ? `<p>仓库版本无效：${esc(this.cloud.remote.head.repo.error)}</p><button data-action="fix-repo">用网页版修复</button>`
      : this.cloud.error ? '<button data-action="retry">重试保存</button>' : '';
    if (this.cloud.remote.kept) notice.innerHTML += '<button data-action="download-kept">下载被替换的版本</button>';
    notice.querySelectorAll<HTMLButtonElement>('button').forEach(button => { button.className = 'btn small'; button.disabled = this.cloud.replacing; });
    const empty = this.q('.fsh-empty-state');
    empty.hidden = true;
    if (!data) {
      this.q('.fsh-tools').textContent = '这本书的伏笔表尚未同步。'; this.q('.fsh-keys').hidden = true;
      this.q('thead').replaceChildren(); this.tbody.replaceChildren(); this.head = ''; return;
    }
    this.q('.fsh-keys').hidden = false;
    const select = (header: string, value: string, values: string[], fixed: [string, string][], label = (v: string) => v) => {
      const options = [...new Set([...values, value].filter(v => v && !fixed.some(([f]) => f === v)))].sort((a, b) => a.localeCompare(b, 'zh', { numeric: true }));
      return `<label>${header}<select aria-label="按${header}筛选" data-filter="${header}">` + [...fixed, ...options.map(v => [v, v])]
        .map(([v, text]) => `<option${v === value ? ' selected' : ''} value="${esc(v)}">${esc(label(text))}</option>`).join('') + '</select></label>';
    };
    const rows = filterRows(data, this.status, this.chapter);
    empty.hidden = rows.length > 0;
    empty.textContent = data.rows.length ? '没有符合筛选的伏笔，试试其他筛选。' : '还没有伏笔，点「加行」开始记录。';
    this.q('.fsh-tools').innerHTML = select('是否已收', this.status, data.rows.map(r => r.author['是否已收'] || '未标注'), [[OPEN, '未收和部分回收'], ['', '全部']]) +
      select('埋设章节', this.chapter, data.rows.flatMap(plantingChapters), [['', '全部']], v => v.replace(/^C(\d+)$/, '$1')) +
      `<span>${rows.length} / ${data.rows.length} 条</span><button class="btn small" data-add title="${MOD}Enter">加行 <kbd>${MOD}Enter</kbd></button>`;
    this.q<HTMLButtonElement>('[data-add]').disabled = this.cloud.replacing;
    const columns = visibleColumns(data), head = JSON.stringify(columns.map(c => c.header));
    if (head !== this.head) {
      this.head = head; this.tbody.replaceChildren();
      this.q('thead').innerHTML = `<tr>${columns.map(c => `<th scope="col" class="${columnClass(c.header)}">${esc(c.header)}</th>`).join('')}</tr>`;
    }
    this.rendering = true;
    try { this.reconcile(data, rows); } finally { this.rendering = false; }
  }

  // Update rows in place so a cell being typed in keeps its focus, caret and unsaved text through saves and remote updates.
  private reconcile(data: ForeshadowData, rows: ForeshadowRow[]) {
    const tbody = this.tbody, active = this.activeCell();
    const keep = new Map([...tbody.querySelectorAll<HTMLTableRowElement>(':scope > tr')].map(tr => [tr.dataset.key!, tr]));
    const wanted = new Set(rows.map(rowKey));
    for (const [key, tr] of keep) if (!wanted.has(key)) { tr.remove(); keep.delete(key); }
    const fresh: HTMLTextAreaElement[] = [];
    let prev: Element | null = null;
    for (const row of rows) {
      let tr = keep.get(rowKey(row));
      if (tr) this.updateRow(tr, row);
      else {
        const holder = document.createElement('tbody'); holder.innerHTML = rowHtml(data, row, this.host);
        tr = holder.firstElementChild as HTMLTableRowElement;
        tr.querySelectorAll<Input>('.fsh-input').forEach(input => { input.dataset.saved = input.value; input.dataset.src = row.author[input.dataset.col!]; });
        fresh.push(...tr.querySelectorAll('textarea'));
      }
      const next: Element | null = prev ? prev.nextElementSibling : tbody.firstElementChild;
      if (next !== tr) tbody.insertBefore(tr, next);
      prev = tr;
    }
    tbody.querySelectorAll<Input>('.fsh-input').forEach(input => {
      if (input instanceof HTMLSelectElement) input.disabled = this.cloud.replacing; else input.readOnly = this.cloud.replacing;
    });
    this.fit(fresh);
    if (active && !tbody.contains(document.activeElement)) {
      const trs = [...tbody.children] as HTMLTableRowElement[];
      const tr = trs.find(t => t.dataset.key === active.key) ?? trs[Math.min(active.index, trs.length - 1)];
      const input = tr?.querySelector<Input>(`[data-col="${CSS.escape(active.col)}"]`);
      if (input) {
        input.focus({ preventScroll: true });
        if (input instanceof HTMLTextAreaElement && tr.dataset.key === active.key) input.setSelectionRange(active.start, active.end);
      }
    }
  }

  private updateRow(tr: HTMLTableRowElement, row: ForeshadowRow) {
    tr.dataset.state = row.author['是否已收'] ?? '';
    for (const td of tr.children as HTMLCollectionOf<HTMLTableCellElement>) {
      const input = td.querySelector<Input>('.fsh-input')!, header = input.dataset.col!, value = row.author[header];
      td.className = cellClass(header, row);
      const view = td.querySelector<HTMLElement>('.fsh-view');
      if (view) { const html = viewHtml(header, row, this.host); if (view.dataset.html !== html) { view.innerHTML = html; view.dataset.html = html; } }
      if (input.dataset.src === value) continue;
      input.dataset.src = value;
      // Someone else changed this cell: take their text unless this cell holds unsaved typing.
      if (document.activeElement === input && input.value !== input.dataset.saved) continue;
      if (input instanceof HTMLSelectElement) input.innerHTML = statusOptions(value); else input.value = cellValue(header, value);
      input.dataset.saved = input.value;
      if (input instanceof HTMLTextAreaElement) this.fit([input]);
    }
  }

  private activeCell() {
    const el = document.activeElement as Input | null, tr = el?.closest?.<HTMLTableRowElement>('tbody > tr');
    if (!el?.matches?.('.fsh-input') || !tr || !this.tbody.contains(tr)) return null;
    const text = el instanceof HTMLTextAreaElement;
    return { key: tr.dataset.key!, col: el.dataset.col!, index: [...this.tbody.children].indexOf(tr),
      start: text ? el.selectionStart : 0, end: text ? el.selectionEnd : 0 };
  }

  // Grow each textarea to its text (browsers without CSS field-sizing); reads first, then writes, to lay out once.
  fit(list: Iterable<HTMLTextAreaElement> = this.tbody.querySelectorAll('textarea')) {
    if (SIZES_ITSELF) return;
    const all = [...list];
    all.forEach(t => { t.style.height = 'auto'; });
    const heights = all.map(t => t.scrollHeight);
    all.forEach((t, i) => { if (heights[i]) t.style.height = `${heights[i] + 2}px`; });
  }

  // Save one cell when its text differs from what was last saved or loaded.
  private commit(input: Input) {
    const timer = this.timers.get(input);
    if (timer) { clearTimeout(timer); this.timers.delete(input); }
    const data = this.cloud.data, key = input.closest('tr')?.dataset.key, col = input.dataset.col;
    if (this.rendering || !data || !key || !col || this.cloud.replacing || input.value === input.dataset.saved) return;
    const next = structuredClone(data), row = findRow(next, key);
    if (!row) { this.host.toast('这条伏笔已被云端删除，这格的输入没有保存。'); return; }
    setCell(row, col, input.value);
    try {
      validateForeshadow(next);
      input.dataset.saved = input.value; input.dataset.src = input.value;
      this.cloud.edit(next);
    } catch (error) { this.host.toast(`没有保存：${String(error)}`); return; }
    if (input instanceof HTMLSelectElement && !input.isConnected) this.host.toast(`已标为「${STATUS_LABEL[input.value] ?? input.value}」，按当前筛选已隐藏。`);
  }

  private schedule(input: Input) {
    const timer = this.timers.get(input);
    if (timer) clearTimeout(timer);
    this.timers.set(input, setTimeout(() => {
      this.timers.delete(input);
      if (this.composing && document.activeElement === input) this.schedule(input); else this.commit(input);
    }, SAVE_AFTER_MS));
  }

  private filter(select: HTMLSelectElement) {
    if (select.dataset.filter === '是否已收') this.status = select.value;
    else if (select.dataset.filter === '埋设章节') this.chapter = select.value;
    else return;
    try { localStorage.setItem(this.viewKey, JSON.stringify({ status: this.status, chapter: this.chapter })); } catch { /* private mode or full storage: just don't remember */ }
    this.render();
  }

  private change = (event: Event) => {
    const target = event.target as HTMLElement;
    if (target.matches('[data-filter]')) this.filter(target as HTMLSelectElement);
    else if (target.matches('select.fsh-input')) this.commit(target as HTMLSelectElement);
  };
  private input = (event: Event) => {
    const target = event.target as HTMLElement;
    if (!(target instanceof HTMLTextAreaElement) || !target.matches('.fsh-input')) return;
    this.fit([target]); this.schedule(target);
  };
  private compose = (event: Event) => {
    this.composing = event.type === 'compositionstart';
    if (!this.composing && event.target instanceof HTMLTextAreaElement && event.target.matches('.fsh-input')) this.schedule(event.target);
  };
  private focusin = (event: Event) => {
    const target = event.target as HTMLElement;
    if (target instanceof HTMLTextAreaElement && target.matches('.fsh-linked .fsh-input')) this.fit([target]);
  };
  private focusout = (event: Event) => {
    const target = event.target as HTMLElement;
    if (target instanceof HTMLTextAreaElement && target.matches('.fsh-input')) this.commit(target);
  };
  // Clicking a linked cell outside its link edits it; clicking the link itself goes to the text.
  private mousedown = (event: MouseEvent) => {
    const target = event.target as HTMLElement, td = target.closest<HTMLElement>('td.fsh-linked');
    if (!td || target.closest('a') || target.matches('textarea')) return;
    const input = td.querySelector<HTMLTextAreaElement>('textarea')!;
    if (document.activeElement === input) return;
    event.preventDefault(); input.focus(); input.setSelectionRange(input.value.length, input.value.length);
  };

  private keydown = (event: KeyboardEvent) => {
    if (event.isComposing || event.keyCode === 229) return;
    const target = event.target as HTMLElement, input = target.matches?.('tbody .fsh-input') ? target as Input : null;
    const tr = input?.closest<HTMLTableRowElement>('tr') ?? null, mod = event.metaKey || event.ctrlKey;
    if (mod && !event.altKey && event.key === 'Enter') { event.preventDefault(); this.insertRow(tr); return; }
    if (!input || !tr) return;
    if (event.altKey && !mod && !event.shiftKey) {
      const digit = /^Digit([0-3])$/.exec(event.code);
      if (digit) { event.preventDefault(); this.setStatus(tr, STATUS_KEYS[Number(digit[1])]); return; }
      if (event.code === 'KeyS') { event.preventDefault(); this.pickStatus(tr); return; }
      if (event.key === 'Enter' && input instanceof HTMLTextAreaElement) {
        event.preventDefault(); input.setRangeText('\n', input.selectionStart, input.selectionEnd, 'end');
        input.dispatchEvent(new Event('input', { bubbles: true })); return;
      }
    }
    if (event.altKey || mod) return;
    if (input instanceof HTMLSelectElement) {
      if (/^[0-3]$/.test(event.key)) { event.preventDefault(); this.setStatus(tr, STATUS_KEYS[Number(event.key)]); }
      else if (event.key === 'Enter') { event.preventDefault(); this.move(tr, input, event.shiftKey ? -1 : 1, 0); }
      else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') { event.preventDefault(); this.move(tr, input, event.key === 'ArrowUp' ? -1 : 1, 0); }
      else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); this.move(tr, input, 0, event.key === 'ArrowLeft' ? -1 : 1); }
      return;
    }
    const caret = input.selectionStart, collapsed = caret === input.selectionEnd, end = input.value.length;
    if (event.key === 'Enter') { event.preventDefault(); this.move(tr, input, event.shiftKey ? -1 : 1, 0); }
    else if (event.key === 'Escape') {
      event.preventDefault(); input.value = input.dataset.saved ?? input.value; this.fit([input]);
      const timer = this.timers.get(input); if (timer) { clearTimeout(timer); this.timers.delete(input); }
    } else if (event.shiftKey || !collapsed) return;
    else if (event.key === 'ArrowUp' && caret === 0) { event.preventDefault(); this.move(tr, input, -1, 0); }
    else if (event.key === 'ArrowDown' && caret === end) { event.preventDefault(); this.move(tr, input, 1, 0); }
    else if (event.key === 'ArrowLeft' && caret === 0) { event.preventDefault(); this.move(tr, input, 0, -1); }
    else if (event.key === 'ArrowRight' && caret === end) { event.preventDefault(); this.move(tr, input, 0, 1); }
  };

  // Go to the cell dRow rows down / dCol columns right; the caret lands where repeated presses keep moving.
  private move(tr: HTMLTableRowElement, from: Input, dRow: number, dCol: number) {
    const trs = [...this.tbody.children] as HTMLTableRowElement[], cells = [...tr.querySelectorAll<Input>('.fsh-input')];
    const target = trs[trs.indexOf(tr) + dRow]?.querySelectorAll<Input>('.fsh-input')[cells.indexOf(from) + dCol];
    if (!target) return;
    target.focus();
    target.closest('td')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    if (target instanceof HTMLTextAreaElement) {
      const at = dRow < 0 || dCol > 0 ? 0 : target.value.length;
      target.setSelectionRange(at, at);
    }
  }

  private setStatus(tr: HTMLTableRowElement, value: string) {
    const select = tr.querySelector<HTMLSelectElement>('select.fsh-input');
    if (!select || this.cloud.replacing) return;
    if (![...select.options].some(o => o.value === value)) select.innerHTML = statusOptions(value);
    select.value = value;
    this.commit(select);
  }

  private pickStatus(tr: HTMLTableRowElement) {
    const select = tr.querySelector<HTMLSelectElement>('select.fsh-input');
    if (!select) return;
    select.focus();
    try { select.showPicker(); } catch { /* older browsers: the focused select opens with Space or Alt+↓ */ }
  }

  // New row below `tr` (or at the end); it keeps the current filters' chapter/status so it stays in view.
  private insertRow(tr: HTMLTableRowElement | null) {
    const data = this.cloud.data;
    if (!data || this.cloud.replacing) return;
    this.host.root.querySelectorAll<Input>('tbody .fsh-input').forEach(input => { if (this.timers.has(input)) this.commit(input); });
    const next = structuredClone(this.cloud.data!), after = tr ? findRow(next, tr.dataset.key!) ?? null : null;
    const preset: Record<string, string> = {};
    if (this.chapter && this.chapter !== '未标注') preset['埋设章节'] = this.chapter.replace(/^C/, '');
    if (this.status && this.status !== OPEN && this.status !== '未标注') preset['是否已收'] = this.status;
    const row = addRow(next, after, preset);
    this.cloud.edit(validateForeshadow(next));
    const added = [...this.tbody.children].find(t => (t as HTMLElement).dataset.key === rowKey(row));
    const first = added?.querySelector<HTMLTextAreaElement>('[data-col="埋设章节"]') ?? added?.querySelector<HTMLTextAreaElement>('textarea');
    if (first) {
      first.focus(); first.closest('td')?.scrollIntoView({ block: 'nearest' });
      first.setSelectionRange(first.value.length, first.value.length);
    }
  }

  private click = (event: Event) => {
    const button = (event.target as Element).closest<HTMLButtonElement>('button');
    if (!button || this.cloud.replacing) return;
    if (button.hasAttribute('data-add')) { this.insertRow(null); return; }
    const action = button.dataset.action;
    if (!action) return;
    if (action === 'download-local') this.download('foreshadow-local-draft.json', this.cloud.data);
    else if (action === 'download-kept') void this.downloadKept();
    else if (action === 'load') void this.cloud.loadCloud();
    else if (action === 'retry') void this.cloud.flush();
    else void this.cloud.flush(action as 'keep-web' | 'use-repo' | 'use-local' | 'fix-repo');
  };
  private download(name: string, value: unknown) {
    const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2) + '\n'], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = name; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1_000);
  }
  private async downloadKept() {
    try {
      const workspace = await keptWorkspace(this.cloud.remote);
      if (workspace) this.download('outline-kept.json', workspace);
    } catch (error) { this.host.toast(`下载被替换的版本失败：${String(error)}`); }
  }
  // Save whatever is still being typed (leaving the tab, signing out).
  finish() {
    this.host.root.querySelectorAll<Input>('tbody .fsh-input').forEach(input => this.commit(input));
  }
  dispose() {
    this.timers.forEach(timer => clearTimeout(timer)); this.timers.clear();
    this.cloud.dispose();
    const root = this.host.root;
    root.removeEventListener('click', this.click); root.removeEventListener('change', this.change);
    root.removeEventListener('input', this.input); root.removeEventListener('keydown', this.keydown);
    root.removeEventListener('mousedown', this.mousedown); root.removeEventListener('focusin', this.focusin);
    root.removeEventListener('focusout', this.focusout);
    root.removeEventListener('compositionstart', this.compose); root.removeEventListener('compositionend', this.compose);
  }
}

const createForeshadow: CreateNovelView = host => {
  let panel: ForeshadowPanel | null = null, y = 0;
  return {
    async show(_route, context) {
      if (!panel) {
        const state = await host.outline();
        if (state === undefined || !context.latest()) return false;
        panel = new ForeshadowPanel(host, state ?? {}); await panel.cloud.start();
      }
      if (!context.latest()) return false;
      document.title = `伏笔表 · ${host.bookTitle} · Sami Writing Desk`;
      window.scrollTo(0, context.restore ?? y);
      requestAnimationFrame(() => panel?.fit());
      return true;
    },
    hide() { panel?.finish(); y = window.scrollY; void panel?.cloud.flush(); },
    dispose() { panel?.dispose(); panel = null; },
    label: () => '伏笔表',
  };
};
export default createForeshadow;
