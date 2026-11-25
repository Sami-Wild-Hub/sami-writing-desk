// Edit the displayed proof locally, preserving the stored draft and reports.
// Reads: localStorage <outline key>:proof-edit:<record id> (JSON)
// Writes: localStorage <outline key>:proof-edit:<record id> (JSON)
import { originalEdits, replacement, type Edits } from './edit.ts';
import { splitParagraphs } from './paragraphs.ts';
import { parseReport } from './report.ts';
import type { ProofRecord } from './store.ts';

export class ProofEditor {
  readonly id: string;
  readonly source: string;
  state: Edits;
  private events = new AbortController();

  constructor(root: HTMLElement, public record: ProofRecord, private key: string,
    private warn: (text: string) => void, private refresh: () => void) {
    this.id = record.id; this.source = record.draft ?? '';
    this.state = originalEdits(splitParagraphs(this.source));
    try {
      const stored = localStorage.getItem(key);
      if (stored) {
        const saved = JSON.parse(stored) as Edits;
        if (!Array.isArray(saved.paragraphs) || saved.paragraphs.length !== this.state.paragraphs.length ||
          !saved.paragraphs.every(p => typeof p === 'string') || !saved.accepted || typeof saved.accepted !== 'object') throw new Error('invalid edits');
        this.state = saved;
      }
    } catch { warn('未能读取本机修改，请检查浏览器存储'); }
    const options = { signal: this.events.signal };
    root.addEventListener('input', e => this.input(e as InputEvent), options);
    root.addEventListener('compositionend', () => this.refresh(), options);
    root.addEventListener('focusout', e => {
      if ((e.target as Element).matches('.pedit')) setTimeout(() => {
        if (this.events.signal.aborted) return;
        const result = root.querySelector<HTMLElement>('.result');
        if (result) delete result.dataset.html;
        this.refresh();
      }, 0);
    }, options);
    root.addEventListener('keydown', e => {
      if ((e.target as Element).matches('.pedit') && e.key === 'Enter' && !e.isComposing) e.preventDefault();
    }, options);
    root.addEventListener('paste', e => {
      if (!(e.target as Element).matches('.pedit')) return;
      e.preventDefault();
      document.execCommand('insertText', false, e.clipboardData?.getData('text/plain').replace(/\r\n|\r|\n/g, ' ') ?? '');
    }, options);
    root.addEventListener('click', e => void this.click(e), options);
  }

  get paras() { return this.state.paragraphs.map((text, i) => ({ n: i + 1, label: `P${i + 1}`, text })); }
  dispose() { this.events.abort(); }

  private save() {
    try { localStorage.setItem(this.key, JSON.stringify(this.state)); }
    catch { this.warn('修改未能保存在此浏览器，请复制正文保留一份'); }
  }

  private input(event: InputEvent) {
    const field = event.target as HTMLElement;
    if (!field.matches('.pedit')) return;
    this.state.paragraphs[Number(field.dataset.edit)] = field.textContent ?? '';
    this.save();
    if (!event.isComposing) this.refresh();
  }

  private async click(event: MouseEvent) {
    const button = (event.target as Element).closest<HTMLButtonElement>('button');
    if (!button || button.disabled) return;
    if (button.matches('[data-copy-body]')) {
      try { await navigator.clipboard.writeText(this.state.paragraphs.join('\n')); this.warn('已复制正文'); }
      catch { this.warn('复制失败，请允许浏览器访问剪贴板后再试'); }
    } else if (button.matches('[data-reset-body]')) {
      if (!confirm('还原原稿？此浏览器中这条记录的手改和已接受建议都会清除。')) return;
      this.state = originalEdits(splitParagraphs(this.source)); this.save(); this.refresh();
    } else if (button.dataset.accept) {
      const key = button.dataset.accept;
      const [, rid, index] = JSON.parse(key) as [string, string, number];
      const report = this.record.reports?.[rid];
      if (!report) return;
      const parsed = parseReport(report.report);
      if (!parsed.ok) return;
      const item = parsed.report.items[index], at = Number(button.dataset.at);
      const accepted = !!this.state.accepted[key];
      const change = replacement(this.state.paragraphs[at], item, accepted);
      if (change.reason) return this.warn(change.reason);
      this.state.paragraphs[at] = change.text!;
      if (accepted) delete this.state.accepted[key]; else this.state.accepted[key] = true;
      this.save(); this.refresh();
    }
  }
}
