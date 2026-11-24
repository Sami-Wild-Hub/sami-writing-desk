// Authenticated foreshadow table (cards on phones), remembered filters and row editor using the shared outline saves.
// Reads/Writes: localStorage <outline draft key>:foreshadow:view (JSON filter choice)
import type { CreateNovelView, NovelViewHost } from '../types.ts';
import { esc } from '../../archive/ui.ts';
import { ForeshadowCloud } from './cloud.ts';
import { OPEN, addRow, deleteRow, filterRows, plantingChapters, validateForeshadow } from './model.js';
import { columnClass, editorHtml, fillEditor, rowHtml } from './render.ts';
import { keptWorkspace } from '../outline/sync.ts';
import './style.css';
import type { ForeshadowRow } from './schema.ts';

class ForeshadowPanel {
  cloud: ForeshadowCloud;
  private status = OPEN;
  private chapter = '';
  private editing = false;
  private editBase: ForeshadowRow | null = null;
  private returnY = 0;
  private viewKey: string;
  constructor(private host: NovelViewHost, state: ConstructorParameters<typeof ForeshadowCloud>[1]) {
    this.viewKey = host.outlineDraftKey + ':foreshadow:view';
    try {
      const saved = JSON.parse(localStorage.getItem(this.viewKey) ?? 'null');
      if (typeof saved?.status === 'string') this.status = saved.status;
      if (typeof saved?.chapter === 'string') this.chapter = saved.chapter;
    } catch { /* unreadable choice: keep the default filters */ }
    this.cloud = new ForeshadowCloud(host, state, () => this.render());
    host.root.innerHTML = '<main class="fsh"><header><h2>伏笔表</h2><span class="fsh-status" role="status"></span></header>' +
      '<div class="fsh-notice"></div><div class="fsh-tools"></div><div class="fsh-editor-slot"></div><div class="fsh-scroll" tabindex="0" role="region" aria-label="伏笔表，可横向滚动"><table><thead></thead><tbody></tbody></table></div></main>';
    host.root.addEventListener('click', this.click);
    host.root.addEventListener('change', this.filter);
    host.root.addEventListener('submit', this.submit);
  }
  private q(selector: string) { return this.host.root.querySelector<HTMLElement>(selector)!; }
  render() {
    const { data } = this.cloud;
    this.q('.fsh-status').textContent = this.cloud.status();
    const notice = this.q('.fsh-notice');
    notice.innerHTML = this.cloud.conflict ? '<p>云端已有新版本；本机改动仍保留。</p><button data-action="download-local">下载本机版</button><button data-action="load">载入云端版</button><button data-action="use-local">用本机版覆盖</button>'
      : this.cloud.remote.incoming && this.cloud.remote.live?.over !== this.cloud.remote.incoming.tree ? '<p>仓库有新版，请选择要保留的版本。</p><button data-action="keep-web">保留网页版</button><button data-action="use-repo">用仓库版</button>'
      : this.cloud.remote.head?.repo?.error ? `<p>仓库版本无效：${esc(this.cloud.remote.head.repo.error)}</p><button data-action="fix-repo">用网页版修复</button>`
      : this.cloud.error ? '<button data-action="retry">重试保存</button>' : '';
    if (this.cloud.remote.kept) notice.innerHTML += '<button data-action="download-kept">下载被替换的版本</button>';
    notice.querySelectorAll<HTMLButtonElement>('button').forEach(button => { button.disabled = this.cloud.replacing; });
    if (!data) { this.q('.fsh-tools').textContent = '这本书的伏笔表尚未同步。'; this.q('thead').replaceChildren(); this.q('tbody').replaceChildren(); return; }
    const select = (header: string, value: string, values: string[], fixed: [string, string][]) => {
      const options = [...new Set([...values, value].filter(v => v && !fixed.some(([f]) => f === v)))].sort((a, b) => a.localeCompare(b, 'zh', { numeric: true }));
      return `<label>${header}<select aria-label="${header}" data-filter="${header}">` + [...fixed, ...options.map(v => [v, v])]
        .map(([v, text]) => `<option${v === value ? ' selected' : ''} value="${esc(v)}">${esc(text)}</option>`).join('') + '</select></label>';
    };
    const rows = filterRows(data, this.status, this.chapter);
    this.q('.fsh-tools').innerHTML = select('是否已收', this.status, data.rows.map(r => r.author['是否已收'] || '未标注'), [[OPEN, '隐藏已收'], ['', '全部']]) +
      select('埋设章节', this.chapter, data.rows.flatMap(plantingChapters), [['', '全部']]) + `<span>${rows.length} / ${data.rows.length} 条</span><button data-add>加行</button>`;
    this.q('thead').innerHTML = `<tr>${data.columns.map(c => `<th scope="col" class="${columnClass(c.header)}">${esc(c.header)}</th>`).join('')}<th scope="col">操作</th></tr>`;
    this.q('tbody').innerHTML = rows.map((row: ForeshadowRow) => rowHtml(data, row, this.host)).join('');
    this.host.root.querySelectorAll<HTMLButtonElement>('[data-edit], [data-delete], [data-add]').forEach(button => { button.disabled = this.cloud.replacing; });
  }
  private filter = (event: Event) => {
    const select = event.target as HTMLSelectElement;
    if (select.dataset.filter === '是否已收') this.status = select.value;
    else if (select.dataset.filter === '埋设章节') this.chapter = select.value;
    else return;
    try { localStorage.setItem(this.viewKey, JSON.stringify({ status: this.status, chapter: this.chapter })); } catch { /* private mode or full storage: just don't remember */ }
    this.render();
  };
  private click = (event: Event) => {
    const button = (event.target as Element).closest<HTMLButtonElement>('button');
    if (!button || this.cloud.replacing) return;
    const action = button.dataset.action;
    if (action) {
      if (action === 'download-local') { this.download('foreshadow-local-draft.json', this.cloud.data); return; }
      if (action === 'download-kept') { void this.downloadKept(); return; }
      if (this.editing && action !== 'retry') { this.host.toast('请先保存或取消正在编辑的行。'); return; }
      if (action === 'load') void this.cloud.loadCloud();
      else if (action === 'retry') void this.cloud.flush();
      else void this.cloud.flush(action as 'keep-web' | 'use-repo' | 'use-local' | 'fix-repo');
      return;
    }
    const data = this.cloud.data;
    if (!data) return;
    if (button.hasAttribute('data-cancel')) { this.closeEditor(); return; }
    if (this.editing) { this.host.toast('请先保存或取消正在编辑的行。'); return; }
    const index = Number(button.closest<HTMLElement>('[data-row]')?.dataset.row);
    if (button.hasAttribute('data-edit') || button.hasAttribute('data-add')) {
      const next = structuredClone(data), row = button.hasAttribute('data-add') ? addRow(next) : next.rows[index];
      this.editBase = button.hasAttribute('data-add') ? null : structuredClone(row);
      this.q('.fsh-editor-slot').innerHTML = editorHtml(next, row, button.hasAttribute('data-add') ? -1 : index);
      fillEditor(this.q('.fsh-editor') as HTMLFormElement, next, row);
      // On phones the editor takes the place of the card list until it closes, then the list returns to the same spot.
      this.editing = true; this.returnY = window.scrollY; this.q('.fsh').classList.add('fsh-is-editing');
      this.q('.fsh-editor').scrollIntoView({ block: 'start' }); this.q('textarea').focus({ preventScroll: true });
    } else if (button.hasAttribute('data-delete') && confirm('删除这条伏笔？')) {
      const next = structuredClone(data); deleteRow(next, next.rows[index]); this.cloud.edit(next);
    }
  };
  private submit = (event: Event) => {
    const form = event.target as HTMLFormElement;
    if (!form.matches('.fsh-editor') || !this.cloud.data) return;
    event.preventDefault();
    if (this.cloud.replacing) return;
    try {
      const next = structuredClone(this.cloud.data), index = Number(form.dataset.index);
      const row = index < 0 ? addRow(next) : next.rows.find(r => r.sheet === this.editBase?.sheet && r.source_row === this.editBase.source_row);
      if (!row) throw Error('这条伏笔已被云端删除，请取消后重新编辑。');
      if (index >= 0 && JSON.stringify(row) !== JSON.stringify(this.editBase)) throw Error('这条伏笔已在云端修改，请取消后重新编辑。本机输入仍保留。');
      const fields = new FormData(form);
      next.columns.forEach((c, i) => {
        const input = form.elements.namedItem(`cell${i}`) as HTMLTextAreaElement;
        if (input.value !== input.dataset.initial) row.author[c.header] = input.value;
      });
      row.derived.recovery_chapters = String(fields.get('recovery') ?? '').split(/[,，\s]+/).filter(Boolean);
      this.cloud.edit(validateForeshadow(next)); this.closeEditor();
    } catch (error) { this.q('.fsh-editor-error').textContent = String(error); }
  };
  private closeEditor() {
    this.editing = false; this.q('.fsh-editor-slot').replaceChildren(); this.q('.fsh').classList.remove('fsh-is-editing');
    window.scrollTo(0, this.returnY);
  }
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
  finish() { this.host.root.querySelector<HTMLFormElement>('.fsh-editor')?.requestSubmit(); }
  dispose() {
    this.cloud.dispose(); this.host.root.removeEventListener('click', this.click);
    this.host.root.removeEventListener('change', this.filter); this.host.root.removeEventListener('submit', this.submit);
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
      window.scrollTo(0, context.restore ?? y); return true;
    },
    hide() { panel?.finish(); y = window.scrollY; void panel?.cloud.flush(); },
    dispose() { panel?.dispose(); panel = null; },
    label: () => '伏笔表',
  };
};
export default createForeshadow;
