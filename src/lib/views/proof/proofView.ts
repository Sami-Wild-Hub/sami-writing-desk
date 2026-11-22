// 校稿台 view: history in the side column, and either the form for a new request (no doc)
// or one record (doc=<record id>). The form saves a queued request — a pasted or uploaded
// draft, or a chapter name for the watcher to fetch from Drive — and the record page follows
// it live: each step's status, links and reasons, resend buttons, then the items of both
// checks beside the draft. The unsent form is kept per book while signed in.
import { esc } from '../../archive/ui.ts';
import type { NovelRoute } from '../../novelArchiveRoute.ts';
import type { CreateNovelView, NovelViewHost, ShowContext } from '../types.ts';
import { splitParagraphs } from './paragraphs.ts';
import { historyHtml, resultHtml, statusHtml, when, type Filter, type KindFilter } from './render.ts';
import { ENDED, newId, proofStore, queuedRecord, reportsOf, type ProofRecord } from './store.ts';
import { CHECKS, type Check } from './task.ts';

const ID = /^\d{8}-\d{6}-[0-9a-z]{4}$/;
interface ProofMemo {
  source: 'paste' | 'drive'; title: string; draft: string; driveName: string; skipProse: boolean;
  /** Per record: the report chosen for each check, and the item filter. */
  report: Record<string, Record<string, string>>; filter: Record<string, Filter>; kind: Record<string, KindFilter>; y?: number;
}

const failed = (error: unknown) => (error instanceof Error ? error.message : String(error));

class ProofPanel {
  private host: NovelViewHost;
  private store: ReturnType<typeof proofStore>;
  private st: ProofMemo;
  private side: HTMLElement;
  private list: HTMLElement;
  private main: HTMLElement;
  private records: ProofRecord[] = [];
  private loadError: Error | null = null;
  private ready: Promise<void>;
  private stop: () => void = () => {};
  private open: ProofRecord | null = null;
  private shown = '';
  private visible = false;

  constructor(host: NovelViewHost) {
    this.host = host;
    this.store = proofStore(host.householdRef, host.slug);
    this.st = (host.memo.state as ProofMemo | undefined) ?? { source: 'paste', title: '', draft: '', driveName: '', skipProse: false, report: {}, filter: {}, kind: {} };
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
    this.ready = new Promise((resolve) => {
      this.stop = this.store.watch((records) => {
        this.records = records;
        this.loadError = null;
        resolve();
        this.onRecords();
      }, (error) => {
        this.loadError = error;
        resolve();
      });
    });
  }

  async show(route: NovelRoute, ctx: ShowContext) {
    await this.ready;
    if (!ctx.latest()) return false;
    this.visible = true;
    if (this.loadError) {
      this.main.innerHTML = `<div class="perr" role="alert">读不到校稿历史：${esc(failed(this.loadError))}</div>`;
      return true;
    }
    this.open = this.records.find((r) => r.id === route.doc) ?? null;
    // Another view's page (doc) is left in the URL so the way back keeps it.
    if (!this.open && ID.test(route.doc)) {
      this.host.toast('找不到这条校稿记录，可能已删除');
      route.doc = '';
    }
    this.renderList();
    if (this.open) this.renderRecord(); else this.renderCompose();
    window.scrollTo(0, ctx.restore ?? (ctx.via === 'pop' ? this.st.y ?? 0 : 0));
    return true;
  }

  /** A new version of the records arrived: refresh the list and the open record if it changed. */
  private onRecords() {
    if (!this.visible || this.loadError) return;
    this.renderList();
    if (!this.open) return;
    const next = this.records.find((r) => r.id === this.open!.id);
    if (!next) return;
    this.open = next;
    if (JSON.stringify(next) !== this.shown) this.renderRecord();
  }

  private renderList() {
    this.list.innerHTML = historyHtml(this.records, this.open?.id ?? '', (id) => this.host.href({ view: 'proof', doc: id }));
    this.side.querySelector('.new')!.toggleAttribute('aria-current', !this.open);
  }

  private head(title: string, meta = '', tools = '') {
    return '<div class="phead"><button type="button" class="btn only-phone" data-drawer>历史</button>' +
      `<h2>${esc(title)}</h2>${meta ? `<span class="meta">${meta}</span>` : ''}<span class="sp"></span>${tools}</div>`;
  }

  private renderCompose() {
    const drive = this.st.source === 'drive';
    const seg = (source: ProofMemo['source'], label: string) => `<button type="button" data-source="${source}" aria-pressed="${this.st.source === source}">${label}</button>`;
    this.main.innerHTML = this.head('新校稿') +
      `<div class="seg psource" role="group" aria-label="稿子从哪来">${seg('paste', '贴入或上传')}${seg('drive', '从 Drive 取')}</div>` +
      '<label class="field"><span>标题</span><input type="text" name="title" maxlength="100" placeholder="如：C23 初稿" autocomplete="off"></label>' +
      (drive
        ? '<label class="field"><span>章节名或文件名</span><input type="text" name="driveName" maxlength="200" placeholder="如：第22章" autocomplete="off"></label>' +
          '<p class="hint">后台让 ChatGPT 用 Google Drive 按这个名字在原稿里找这一章，取到后接着校。</p>'
        : '<label class="field"><span>新稿</span><textarea name="draft" rows="16" placeholder="把新稿贴在这里"></textarea></label>' +
          '<p class="hint">每个非空行算一段，# 开头的标题行不算。</p>') +
      '<label class="poption"><input type="checkbox" name="skipProse">不验语病</label>' +
      `<div class="prow-tools">${drive ? '' : '<label class="btn file">上传文件<input type="file" accept=".txt,.md,text/plain,text/markdown"></label><span class="count" data-count></span>'}` +
      '<span class="sp"></span><button type="button" class="btn primary" data-send>发送校稿</button></div>' +
      '<p class="hint">发出后自动做两项校验：① 对照正文（本机 Luna 读已写各章）、② 开放式（ChatGPT 读资料库）。结果回来自动显示，不用复制粘贴。</p>' +
      '<p class="perr" role="alert" data-err hidden></p>';
    const bind = (name: 'title' | 'draft' | 'driveName', after = () => {}) => {
      const field = this.main.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name=${name}]`);
      if (!field) return;
      field.value = this.st[name];
      field.addEventListener('input', () => { this.st[name] = field.value; after(); });
    };
    const count = this.main.querySelector<HTMLElement>('[data-count]');
    const recount = () => {
      const n = splitParagraphs(this.st.draft).length;
      if (count) count.textContent = n ? `${n} 段` : '';
    };
    bind('title');
    bind('driveName');
    bind('draft', recount);
    const skipProse = this.main.querySelector<HTMLInputElement>('[name=skipProse]')!;
    skipProse.checked = this.st.skipProse;
    skipProse.addEventListener('change', () => { this.st.skipProse = skipProse.checked; });
    recount();
    this.main.querySelector<HTMLInputElement>('[type=file]')?.addEventListener('change', async (event) => {
      const input = event.target as HTMLInputElement;
      const file = input.files?.[0];
      if (!file) return;
      this.st.draft = await file.text();
      if (!this.st.title.trim()) this.st.title = file.name.replace(/\.(txt|md)$/i, '');
      input.value = '';
      this.renderCompose();
    });
  }

  private async send(button: HTMLButtonElement) {
    const err = this.main.querySelector<HTMLElement>('[data-err]')!;
    const { source } = this.st;
    const title = this.st.title.trim();
    const driveName = this.st.driveName.trim();
    const problem = !title ? '先写个标题，如「C23 初稿」。'
      : source === 'paste' && !splitParagraphs(this.st.draft).length ? '新稿是空的。'
        : source === 'drive' && !driveName ? '写上要取的章节名，如「第22章」。' : '';
    err.hidden = !problem;
    err.textContent = problem;
    if (problem) return;
    const now = Date.now();
    const record = queuedRecord({ id: newId(now), title, createdAt: now, source, draft: this.st.draft, driveName, skipProse: this.st.skipProse });
    button.disabled = true;
    button.textContent = '发送中…';
    try {
      await this.store.create(record);
    } catch (error) {
      err.hidden = false;
      err.textContent = `没发出去：${failed(error)}。内容还在框里，可以再试。`;
      button.disabled = false;
      button.textContent = '发送校稿';
      return;
    }
    this.st.title = this.st.draft = this.st.driveName = '';
    this.st.skipProse = false;
    this.host.go({ view: 'proof', doc: record.id }, 'nav');
  }

  private renderRecord() {
    const record = this.open!;
    const paras = splitParagraphs(record.draft ?? '');
    const from = record.source === 'drive' ? `Drive：${esc(record.driveName ?? '')}` : '贴入';
    const meta = `${esc(when(record.createdAt))} · ${from} · ${paras.length ? `${paras.length} 段` : '待取稿'} · 不验语病：${record.skipProse ? '是' : '否'}`;
    // While the watcher works on a record it is not deleted (its writes would bring parts back).
    const idle = record.status === 'queued' || ENDED.includes(record.status);
    const tools = idle ? '<button type="button" class="btn" data-delete>删除</button>' : '';
    this.main.innerHTML = this.head(record.title, meta, tools) + statusHtml(record) +
      `<section class="result" aria-label="校稿结果">${resultHtml(paras, record, this.st.report[record.id] ?? {}, this.st.filter[record.id] ?? 'all', this.st.kind[record.id] ?? 'all')}</section>`;
    this.shown = JSON.stringify(record);
  }

  private async resend(check: string) {
    const record = this.open!;
    const checks = (CHECKS as readonly string[]).includes(check) ? [check as Check] : CHECKS;
    try {
      await this.store.resend(record.id, Date.now(), checks);
    } catch (error) {
      return this.host.toast(`没发出去：${failed(error)}`);
    }
    this.host.toast('已重新排队，之前的报告都留着');
  }

  private async remove() {
    const record = this.open!;
    const n = reportsOf(record).length;
    if (!confirm(`删除「${record.title}」？新稿${n ? `和 ${n} 次报告` : ''}会从网站删掉，不能恢复（data 仓库里的文件还在）。`)) return;
    try {
      await this.store.remove(record.id);
    } catch (error) {
      return this.host.toast(`没删掉：${failed(error)}`);
    }
    delete this.st.report[record.id];
    delete this.st.filter[record.id];
    delete this.st.kind[record.id];
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
    const id = this.open?.id ?? '';
    if (button?.matches('[data-drawer]')) return this.host.setDrawer(true);
    if (button?.dataset.source) {
      this.st.source = button.dataset.source as ProofMemo['source'];
      return this.renderCompose();
    }
    if (button?.matches('[data-send]')) return void this.send(button);
    if (button?.matches('[data-resend]')) return void this.resend(button.dataset.resend!);
    if (button?.matches('[data-delete]')) return void this.remove();
    if (button?.dataset.filter && this.open) {
      this.st.filter[id] = button.dataset.filter as Filter;
      return this.renderRecord();
    }
    if (button?.dataset.kind && this.open) {
      this.st.kind[id] = button.dataset.kind as KindFilter;
      return this.renderRecord();
    }
    const report = button?.dataset.report && this.open && reportsOf(this.open).find((r) => r.id === button.dataset.report);
    if (report) {
      this.st.report[id] = { ...this.st.report[id], [report.check]: report.id };
      return this.renderRecord();
    }
    const card = target.closest<HTMLElement>('.pitem');
    if (card) return this.locate(card);
    const mark = target.closest<HTMLElement>('.pv mark[data-i]');
    const note = mark && this.main.querySelector<HTMLElement>(`.pnotes .pitem[data-i="${mark.dataset.i}"]`);
    if (note) { note.classList.remove('flash'); void note.offsetWidth; note.classList.add('flash'); }
  }

  hide() {
    this.st.y = window.scrollY;
    this.visible = false;
  }
  dispose() { this.stop(); }
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
    dispose: () => panel?.dispose(),
    label: () => panel?.label() ?? '校稿台',
  };
};

export default createProof;
