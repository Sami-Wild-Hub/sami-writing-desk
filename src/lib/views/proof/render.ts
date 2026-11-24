// HTML for 校稿台: the history list, a record's live status (Drive fetch, ① manuscript,
// ② open) and the proof view — draft paragraphs on the left, each item (quote first, tagged
// ① or ②) beside its paragraph on the right, the quote marked in the text. Phones get the
// items as a list above the text instead.
import { esc } from '../../archive/ui.ts';
import type { Para } from './paragraphs.ts';
import { parseReport, placeItems, type PlacedItem, type ReportItem, type ReportResult } from './report.ts';
import { ENDED, reportsOf, type ProofRecord, type ProofReport, type Status, type Step } from './store.ts';
import { CHECKS, KINDS, LEVELS, type Check } from './task.ts';

export type Filter = 'all' | Check;
export type KindFilter = 'all' | (typeof KINDS)[number];
export const MARK: Record<Check, string> = { manuscript: '①', open: '②' };
export const NAME: Record<Check, string> = { manuscript: '对照正文', open: '开放式' };
const ABOUT: Record<Check | 'fetch', string> = { fetch: '本机 Luna 用 Google Drive 只读查找这一章', manuscript: '本机 Luna 对照资料库里的已写正文', open: 'ChatGPT 读 Novel Archivist 资料库' };
const STATUS: Record<Status, string> = { queued: '排队', sending: '发送中', sent: '已发送', done: '完成', failed: '失败' };

export const when = (ms: number) => new Date(ms).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
const badge = (status: Status) => `<span class="pst st-${status}">${STATUS[status]}</span>`;

export function historyHtml(records: ProofRecord[], current: string, href: (id: string) => string) {
  if (!records.length) return '<p class="muted hist-empty">还没有校稿记录。</p>';
  return records.map((r) => `<a class="navlink hist" href="${esc(href(r.id))}" data-novel-view="proof" data-id="${esc(r.id)}"${r.id === current ? ' aria-current="page"' : ''}>` +
    `<span><b>${esc(r.title)}</b><small>${esc(when(r.createdAt))} · ${STATUS[r.status] ?? r.status}${r.skipProse ? ' · 不验语病' : ''}</small></span></a>`).join('');
}

/** A stored report read again from its raw text (the raw text is what counts). */
export const readReport = (report: ProofReport): ReportResult => parseReport(report.report);

function stepHtml(name: string, about: string, step: Step, resend: Check | '') {
  const link = step.chat ? `<a href="${esc(step.chat)}" target="_blank" rel="noopener">打开对话 ↗</a>` : '';
  const job = step.job ? `<code title="Luna 任务号">${esc(step.job)}</code>` : '';
  const again = resend && ENDED.includes(step.status) ? `<button type="button" class="btn small" data-resend="${resend}">重新发送</button>` : '';
  return `<li class="pstep" data-step="${esc(name)}">${badge(step.status)}<span class="pname"><b>${esc(name)}</b><small>${esc(about)}` +
    `${step.attempt && step.attempt > 1 ? ` · 第 ${step.attempt} 次` : ''}${step.at ? ` · ${esc(when(step.at))}` : ''}</small></span>` +
    `<span class="pref">${link}${job}</span>${again}${step.error ? `<p class="perr">${esc(step.error)}</p>` : ''}</li>`;
}

/** The record's progress: one line per step, with links, reasons and, once the record has
 * ended (the watcher is not working on it), resend buttons. */
export function statusHtml(record: ProofRecord) {
  const ended = ENDED.includes(record.status);
  const steps = [
    record.source === 'drive' && record.fetch ? stepHtml(`取稿：${record.driveName ?? ''}`, ABOUT.fetch, record.fetch, '') : '',
    ...CHECKS.map((c) => stepHtml(`${MARK[c]} ${NAME[c]}`, ABOUT[c], record.checks?.[c] ?? { status: 'queued' }, ended ? c : '')),
  ];
  const all = ended ? '<button type="button" class="btn" data-resend="">全部重新发送</button>' : '';
  return `<section class="pstatus" aria-label="校稿进度" aria-live="polite"><div class="pstatus-head">${badge(record.status)}` +
    `<span class="hint">${record.status === 'done' ? '两项校验都已完成。' : record.status === 'failed' ? '有一项没完成，见下面的原因。' : '后台处理中，结果回来会自动显示。'}</span><span class="sp"></span>${all}</div>` +
    `${record.error ? `<p class="perr" role="alert">${esc(record.error)}</p>` : ''}<ol>${steps.join('')}</ol></section>`;
}

type Tagged = ReportItem & { check: Check; key: string };

function itemHtml({ item, at, range }: PlacedItem<Tagged>) {
  const level = item.level && (LEVELS as readonly string[]).includes(item.level) ? item.level : '';
  const off = at < 0 ? '没有这一段' : range ? '' : '未对上原文';
  return `<article class="pitem${level ? ` lv-${level}` : ''}${off ? ' off' : ''}" data-key="${esc(item.key)}" data-check="${item.check}"${at >= 0 ? ` data-at="${at}"` : ''} tabindex="0">` +
    `<blockquote>${esc(item.quote || '（没有引文）')}</blockquote>` +
    `<div class="tags"><span class="src" title="${NAME[item.check]}">${MARK[item.check]} ${NAME[item.check]}</span>${level ? `<span class="lv">${esc(level)}</span>` : ''}` +
    `${item.kind ? `<span class="pill">${esc(item.kind)}</span>` : ''}${item.para ? `<span class="pill">${esc(item.para)}</span>` : ''}${off ? `<span class="pill warn">${off}</span>` : ''}</div>` +
    `<p class="issue">${esc(item.issue)}</p>` +
    (item.suggestion ? `<p class="sugg"><b>建议</b>${esc(item.suggestion)}</p>` : '') +
    (item.evidence.length ? `<p class="ev"><b>依据</b>${item.evidence.map((e) => `<code>${esc(e)}</code>`).join('')}</p>` : '') +
    (item.problems.length ? `<p class="prob">格式问题：${esc(item.problems.join('；'))}</p>` : '') +
    '</article>';
}

/** Paragraph text with the placed quotes marked; overlapping quotes keep the first mark. */
function markedText(text: string, marks: { range: [number, number]; key: string }[]) {
  let out = '';
  let pos = 0;
  for (const { range: [start, end], key } of [...marks].sort((a, b) => a.range[0] - b.range[0])) {
    if (start < pos) continue;
    out += `${esc(text.slice(pos, start))}<mark data-key="${esc(key)}">${esc(text.slice(start, end))}</mark>`;
    pos = end;
  }
  return out + esc(text.slice(pos));
}

/** The proof view for a draft and the placed items. */
export function proofHtml(paras: Para[], placed: PlacedItem<Tagged>[]) {
  const byPara = new Map<number, string[]>();
  const marks = new Map<number, { range: [number, number]; key: string }[]>();
  placed.forEach(p => {
    byPara.set(p.at, [...byPara.get(p.at) ?? [], itemHtml(p)]);
    if (p.range) marks.set(p.at, [...marks.get(p.at) ?? [], { range: p.range, key: p.item.key }]);
  });
  const rows = paras.map((para, at) => `<div class="prow${byPara.has(at) ? ' has' : ''}" id="pp-${para.n}" data-at="${at}">` +
    `<p class="ptext"><span class="pn">${para.label}</span>${markedText(para.text, marks.get(at) ?? [])}</p>` +
    `<div class="pnotes">${(byPara.get(at) ?? []).join('')}</div></div>`);
  if (byPara.has(-1)) rows.push(`<div class="prow has orphan"><p class="ptext muted">这些反馈指的段落不在这份稿里：</p><div class="pnotes">${byPara.get(-1)!.join('')}</div></div>`);
  return `<div class="plist">${placed.map(itemHtml).join('')}</div><div class="pv">${rows.join('')}</div>`;
}

export function countsHtml(placed: PlacedItem<Tagged>[]) {
  if (!placed.length) return '<p class="pcount">没有报告项。</p>';
  const counts = LEVELS.map((level) => [level, placed.filter((p) => p.item.level === level).length] as const).filter(([, n]) => n);
  const off = placed.filter((p) => !p.range).length;
  return `<p class="pcount">${placed.length} 条反馈${counts.map(([level, n]) => ` · <span class="lv-${level}"><span class="lv">${level}</span> ${n}</span>`).join('')}` +
    `${off ? ` · <span class="warn">${off} 条未对上原文</span>` : ''}</p>`;
}

function attemptsHtml(record: ProofRecord, shown: Partial<Record<Check, ProofReport>>) {
  const rows = CHECKS.map((c) => [c, reportsOf(record, c)] as const).filter(([, reports]) => reports.length > 1);
  return rows.map(([c, reports]) => `<div class="seg rtabs" role="group" aria-label="${MARK[c]} ${NAME[c]} 的各次报告"><span class="seg-label">${MARK[c]}</span>` +
    reports.map((r) => `<button type="button" data-report="${esc(r.id)}" aria-pressed="${r.id === shown[c]?.id}">第 ${r.attempt} 次 · ${esc(when(r.createdAt))}</button>`).join('') + '</div>').join('');
}

/** Each check's shown report (the chosen one, else the newest) read against the draft, filtered. */
export function resultHtml(paras: Para[], record: ProofRecord, chosen: Record<string, string>, filter: Filter, kind: KindFilter = 'all') {
  if (!paras.length) return '<p class="muted pnote">新稿还没取到，取到后会显示在这里。</p>';
  const shown: Partial<Record<Check, ProofReport>> = {};
  const items: Tagged[] = [];
  const errors: string[] = [];
  for (const c of CHECKS) {
    const reports = reportsOf(record, c);
    const report = shown[c] = reports.find((r) => r.id === chosen[c]) ?? reports.at(-1);
    if (!report) continue;
    const read = readReport(report);
    if (read.ok) items.push(...read.report.items.map((item, index) => ({ ...item, check: c, key: JSON.stringify([c, report.id, index]) })));
    else errors.push(`<div class="perr" role="alert"><b>${MARK[c]} 第 ${report.attempt} 次的回复读不出来：</b>${esc(read.error)}</div>` +
      `<details class="raw" data-report="${esc(report.id)}"><summary>${MARK[c]} 收到的原文</summary><pre>${esc(report.report)}</pre></details>`);
  }
  if (!shown.manuscript && !shown.open) return `<p class="muted pnote">结果回来后会自动显示在这里。下面是分好段的原文。</p>${proofHtml(paras, [])}`;
  const count = (f: Filter) => items.filter((i) => f === 'all' || i.check === f).length;
  const filters = `<div class="seg pfilter" role="group" aria-label="按来源筛选">${(['all', ...CHECKS] as Filter[]).map((f) =>
    `<button type="button" data-filter="${f}" aria-pressed="${f === filter}">${f === 'all' ? '全部' : `${MARK[f]} ${NAME[f]}`} ${count(f)}</button>`).join('')}</div>`;
  const sourceItems = items.filter((i) => filter === 'all' || i.check === filter);
  const kinds = `<div class="seg pfilter" role="group" aria-label="按 Tag 筛选">${(['all', ...KINDS] as KindFilter[]).map((k) =>
    `<button type="button" data-kind="${k}" aria-pressed="${k === kind}">${k === 'all' ? '全部类型' : k} ${sourceItems.filter((i) => k === 'all' || i.kind === k).length}</button>`).join('')}</div>`;
  const placed = placeItems(paras, sourceItems.filter((i) => kind === 'all' || i.kind === kind));
  const bad = placed.filter((p) => p.item.problems.length).length;
  const sums = CHECKS.map((c) => [c, shown[c] && readReport(shown[c]!)] as const)
    .map(([c, read]) => (read && read.ok && read.report.summary && (filter === 'all' || filter === c) ? `<p class="psum"><b>${MARK[c]}</b> ${esc(read.report.summary)}</p>` : '')).join('');
  return filters + kinds + attemptsHtml(record, shown) + errors.join('') + countsHtml(placed) + sums +
    (bad ? `<div class="perr" role="alert">有 ${bad} 条格式不对，已照样列出并注明问题。</div>` : '') + proofHtml(paras, placed);
}
