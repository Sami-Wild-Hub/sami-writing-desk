// 校稿台 view: history in the side column, and either the form for a new draft (no doc)
// or one record (doc=<record id>) — copy its task, paste ChatGPT's reply back, read the
// items beside the draft. Every record and every pasted reply is saved to the household's
// database before it is shown; the unsent form is kept per book while signed in.
import { esc } from '../../archive/ui.ts';
import type { NovelRoute } from '../../novelArchiveRoute.ts';
import type { CreateNovelView, NovelViewHost, ShowContext } from '../types.ts';
import { splitParagraphs } from './paragraphs.ts';
import { historyHtml, readReport, reportTabsHtml, resultHtml, when } from './render.ts';
import { newId, proofStore, reportsOf, type ProofRecord, type ProofReport } from './store.ts';
import { proofTask } from './task.ts';

const ID = /^\d{8}-\d{6}-[0-9a-z]{4}$/;
interface ProofMemo { title: string; draft: string; report: Record<string, string>; y?: number; }

const failed = (error: unknown) => (error instanceof Error ? error.message : String(error));

class ProofPanel {
  private host: NovelViewHost;
  private store: ReturnType<typeof proofStore>;
  private st: ProofMemo;
  private side: HTMLElement;
  private list: HTMLElement;
  private main: HTMLElement;
  private records: ProofRecord[] = [];
  private open: ProofRecord | null = null;

  constructor(host: NovelViewHost) {
    this.host = host;
    this.store = proofStore(host.householdRef, host.slug);
    this.st = (host.memo.state as ProofMemo | undefined) ?? { title: '', draft: '', report: {} };
    host.memo.state = this.st;
    const frame = document.createElement('div');
    frame.className = 'proof frame';
    frame.innerHTML = '<aside class="side" aria-label="校稿历史"><div class="side-body">' +
      `<a class="navlink new" href="${esc(host.href({ view: 'proof', doc: '' }))}" data-novel-view="proof">＋ 新校稿</a>` +
      '<h3>历史</h3><nav class="hist-list" aria-label="校稿历史"></nav></div></aside><div class="pmain"></div>';
    host.root.append(frame);
    this.side = frame.querySelector('.side')!;
    this.list = frame.querySelector('.hist-list')!;
    this.main = frame.querySelector('.pmain')!;
    this.side.prepend(host.sideHead());
    this.main.addEventListener('click', (event) => this.onClick(event));
  }

  async show(route: NovelRoute, ctx: ShowContext) {
    let records: ProofRecord[];
    try {
      records = await this.store.list();
    } catch (error) {
      if (!ctx.latest()) return false;
      this.main.innerHTML = `<div class="perr" role="alert">读不到校稿历史：${esc(failed(error))}</div>`;
      return true;
    }
    if (!ctx.latest()) return false;
    this.records = records;
    this.open = records.find((r) => r.id === route.doc) ?? null;
    // Another view's page (doc) is left in the URL so the way back keeps it.
    if (!this.open && ID.test(route.doc)) {
      this.host.toast('找不到这条校稿记录，可能已删除');
      route.doc = '';
    }
    this.list.innerHTML = historyHtml(records, this.open?.id ?? '', (id) => this.host.href({ view: 'proof', doc: id }));
    this.side.querySelector('.new')!.toggleAttribute('aria-current', !this.open);
    if (this.open) this.renderRecord(); else this.renderCompose();
    window.scrollTo(0, ctx.restore ?? (ctx.via === 'pop' ? this.st.y ?? 0 : 0));
    return true;
  }

  private head(title: string, meta = '', tools = '') {
    return '<div class="phead"><button type="button" class="btn only-phone" data-drawer>历史</button>' +
      `<h2>${esc(title)}</h2>${meta ? `<span class="meta">${meta}</span>` : ''}<span class="sp"></span>${tools}</div>`;
  }

  private renderCompose() {
    this.main.innerHTML = this.head('新校稿') +
      '<p class="hint">贴入新稿，或上传 .txt / .md。每个非空行算一段，# 开头的标题行不算。</p>' +
      '<label class="field"><span>标题</span><input type="text" name="title" maxlength="100" placeholder="如：C23 初稿" autocomplete="off"></label>' +
      '<label class="field"><span>新稿</span><textarea name="draft" rows="16" placeholder="把新稿贴在这里"></textarea></label>' +
      '<div class="prow-tools"><label class="btn file">上传文件<input type="file" accept=".txt,.md,text/plain,text/markdown"></label>' +
      '<span class="count" data-count></span><span class="sp"></span><button type="button" class="btn primary" data-generate>生成校稿任务</button></div>' +
      '<p class="perr" role="alert" data-err hidden></p>';
    const title = this.main.querySelector<HTMLInputElement>('[name=title]')!;
    const draft = this.main.querySelector<HTMLTextAreaElement>('[name=draft]')!;
    const count = this.main.querySelector<HTMLElement>('[data-count]')!;
    const recount = () => {
      const n = splitParagraphs(draft.value).length;
      count.textContent = n ? `${n} 段` : '';
    };
    title.value = this.st.title;
    draft.value = this.st.draft;
    recount();
    title.addEventListener('input', () => { this.st.title = title.value; });
    draft.addEventListener('input', () => { this.st.draft = draft.value; recount(); });
    this.main.querySelector<HTMLInputElement>('[type=file]')!.addEventListener('change', async (event) => {
      const input = event.target as HTMLInputElement;
      const file = input.files?.[0];
      if (!file) return;
      draft.value = this.st.draft = await file.text();
      if (!title.value.trim()) title.value = this.st.title = file.name.replace(/\.(txt|md)$/i, '');
      input.value = '';
      recount();
    });
  }

  private async generate(button: HTMLButtonElement) {
    const err = this.main.querySelector<HTMLElement>('[data-err]')!;
    const title = this.st.title.trim();
    const paras = splitParagraphs(this.st.draft);
    const problem = !title ? '先写个标题，如「C23 初稿」。' : !paras.length ? '新稿是空的。' : '';
    err.hidden = !problem;
    err.textContent = problem;
    if (problem) return;
    const now = Date.now();
    const record: ProofRecord = {
      id: newId(now), title, createdAt: now, updatedAt: now,
      draft: this.st.draft, task: proofTask({ slug: this.host.slug, title, paras }),
    };
    button.disabled = true;
    button.textContent = '保存中…';
    try {
      await this.store.create(record);
    } catch (error) {
      err.hidden = false;
      err.textContent = `没存上：${failed(error)}。稿子还在框里，可以再试。`;
      button.disabled = false;
      button.textContent = '生成校稿任务';
      return;
    }
    this.st.title = this.st.draft = '';
    this.host.go({ view: 'proof', doc: record.id }, 'nav');
  }

  private renderRecord() {
    const record = this.open!;
    const paras = splitParagraphs(record.draft);
    const reports = reportsOf(record);
    const current = reports.find((r) => r.id === this.st.report[record.id]) ?? reports.at(-1);
    const meta = `${esc(when(record.createdAt))} · ${paras.length} 段 · ${reports.length ? `${reports.length} 次报告` : '还没有报告'}`;
    this.main.innerHTML = this.head(record.title, meta, '<button type="button" class="btn" data-delete>删除</button>') +
      '<section class="step"><h3><b>1</b>复制任务，发给 ChatGPT</h3>' +
      '<div class="prow-tools"><button type="button" class="btn primary" data-copy>复制任务</button>' +
      '<span class="hint">ChatGPT 要能通过 GitHub 读到 Novel Archivist 的资料库。</span></div>' +
      `<details class="task"><summary>看任务全文</summary><textarea readonly rows="12">${esc(record.task)}</textarea></details></section>` +
      `<details class="step paste"${current && readReport(current).ok ? '' : ' open'}><summary><h3><b>2</b>贴回 ChatGPT 的回复</h3></summary>` +
      (reports.length ? '<p class="hint">再贴一次也会留着之前的，在下面切换。</p>' : '') + '<textarea data-paste rows="8" placeholder="把 ChatGPT 的回复整段贴进来，带代码块也行"></textarea>' +
      '<div class="prow-tools"><button type="button" class="btn primary" data-read>读取报告</button></div></details>' +
      `<section class="result" aria-label="校稿结果">${reportTabsHtml(reports, current?.id ?? '')}${resultHtml(paras, current)}</section>`;
  }

  private async copyTask(button: HTMLButtonElement) {
    const text = this.open!.task;
    try {
      await navigator.clipboard.writeText(text);
      this.host.toast('已复制任务，去 ChatGPT 粘贴发送');
      button.textContent = '已复制 ✓';
    } catch {
      const details = this.main.querySelector<HTMLDetailsElement>('details.task')!;
      details.open = true;
      details.querySelector('textarea')!.select();
      this.host.toast('没能自动复制：全文已选中，请手动复制');
    }
  }

  private async readPasted(button: HTMLButtonElement) {
    const record = this.open!;
    const raw = this.main.querySelector<HTMLTextAreaElement>('[data-paste]')!.value.trim();
    if (!raw) return this.host.toast('先把 ChatGPT 的回复贴进框里');
    const now = Date.now();
    const read = readReport({ id: '', createdAt: now, report: raw });
    const report: ProofReport = { id: newId(now), createdAt: now, report: raw };
    if (read.ok) report.parsed = JSON.stringify(read.report);
    button.disabled = true;
    button.textContent = '保存中…';
    try {
      await this.store.addReport(record, report);
    } catch (error) {
      button.disabled = false;
      button.textContent = '读取报告';
      return this.host.toast(`没存上：${failed(error)}。回复还在框里，可以再试。`);
    }
    record.reports = { ...record.reports, [report.id]: report };
    record.updatedAt = now;
    this.st.report[record.id] = report.id;
    this.list.innerHTML = historyHtml(this.records, record.id, (id) => this.host.href({ view: 'proof', doc: id }));
    this.renderRecord();
    this.host.toast(read.ok ? `已存，${read.report.items.length} 条反馈` : '已存，但回复读不出来，见下方说明');
    this.main.querySelector('.result')!.scrollIntoView({ block: 'start' });
  }

  private async remove() {
    const record = this.open!;
    const n = reportsOf(record).length;
    if (!confirm(`删除「${record.title}」？新稿、任务${n ? `和 ${n} 次报告` : ''}都会删掉，不能恢复。`)) return;
    try {
      await this.store.remove(record.id);
    } catch (error) {
      return this.host.toast(`没删掉：${failed(error)}`);
    }
    delete this.st.report[record.id];
    this.host.toast(`已删除「${record.title}」`);
    this.host.go({ view: 'proof', doc: '' }, 'nav');
  }

  /** Tapping an item (phone list or side note) shows its paragraph and flashes the quote. */
  private locate(card: HTMLElement) {
    const i = card.dataset.i;
    const mark = this.main.querySelector<HTMLElement>(`.pv mark[data-i="${i}"]`);
    const row = card.dataset.at ? this.main.querySelector<HTMLElement>(`.pv .prow[data-at="${card.dataset.at}"]`) : null;
    const target = mark ?? row?.querySelector<HTMLElement>('.ptext');
    if (!target) return;
    if (card.closest('.plist')) {
      const bar = document.querySelector<HTMLElement>('.bar')?.offsetHeight ?? 0;
      window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY - bar - 24, behavior: 'instant' });
    }
    target.classList.remove('flash');
    void target.offsetWidth;
    target.classList.add('flash');
  }

  private onClick(event: MouseEvent) {
    const target = event.target as Element;
    const button = target.closest<HTMLButtonElement>('button');
    if (button?.matches('[data-drawer]')) return this.host.setDrawer(true);
    if (button?.matches('[data-generate]')) return void this.generate(button);
    if (button?.matches('[data-copy]')) return void this.copyTask(button);
    if (button?.matches('[data-read]')) return void this.readPasted(button);
    if (button?.matches('[data-delete]')) return void this.remove();
    if (button?.dataset.report && this.open) {
      this.st.report[this.open.id] = button.dataset.report;
      return this.renderRecord();
    }
    const card = target.closest<HTMLElement>('.pitem');
    if (card) return this.locate(card);
    const mark = target.closest<HTMLElement>('.pv mark[data-i]');
    const note = mark && this.main.querySelector<HTMLElement>(`.pnotes .pitem[data-i="${mark.dataset.i}"]`);
    if (note) { note.classList.remove('flash'); void note.offsetWidth; note.classList.add('flash'); }
  }

  hide() { this.st.y = window.scrollY; }
  label() { return this.open?.title ?? '校稿台'; }
}

const createProof: CreateNovelView = (host) => {
  let panel: ProofPanel | null = null;
  return {
    show(route, ctx) {
      document.title = `校稿台 · ${host.bookTitle} · 小离总周报`;
      panel ??= new ProofPanel(host);
      return panel.show(route, ctx);
    },
    hide: () => panel?.hide(),
    dispose: () => {},
    label: () => panel?.label() ?? '校稿台',
  };
};

export default createProof;
