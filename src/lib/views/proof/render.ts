// HTML for 校稿台: the history list, a record's head and steps, and the proof view —
// draft paragraphs on the left, each item (quote first) beside its paragraph on the right,
// the quote marked in the text. Phones get the items as a list above the text instead.
import { esc } from '../../archive/ui.ts';
import type { Para } from './paragraphs.ts';
import { parseReport, placeItems, type PlacedItem, type ReportResult } from './report.ts';
import { reportsOf, type ProofRecord, type ProofReport } from './store.ts';
import { LEVELS } from './task.ts';

export const when = (ms: number) => new Date(ms).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });

export function historyHtml(records: ProofRecord[], current: string, href: (id: string) => string) {
  if (!records.length) return '<p class="muted hist-empty">还没有校稿记录。</p>';
  return records.map((r) => {
    const n = reportsOf(r).length;
    return `<a class="navlink hist" href="${esc(href(r.id))}" data-novel-view="proof" data-id="${esc(r.id)}"${r.id === current ? ' aria-current="page"' : ''}>` +
      `<span><b>${esc(r.title)}</b><small>${esc(when(r.createdAt))} · ${n ? `${n} 次报告` : '待贴报告'}</small></span></a>`;
  }).join('');
}

/** A stored report read again from its raw text (the raw text is what counts). */
export const readReport = (report: ProofReport): ReportResult => parseReport(report.report);

function itemHtml({ item, at, range }: PlacedItem, i: number) {
  const level = (LEVELS as readonly string[]).includes(item.level) ? item.level : '';
  const off = at < 0 ? '没有这一段' : range ? '' : '未对上原文';
  return `<article class="pitem${level ? ` lv-${level}` : ''}${off ? ' off' : ''}" data-i="${i}"${at >= 0 ? ` data-at="${at}"` : ''} tabindex="0">` +
    `<blockquote>${esc(item.quote || '（没有引文）')}</blockquote>` +
    `<div class="tags">${level ? `<span class="lv">${esc(level)}</span>` : ''}${item.kind ? `<span class="pill">${esc(item.kind)}</span>` : ''}` +
    `${item.para ? `<span class="pill">${esc(item.para)}</span>` : ''}${off ? `<span class="pill warn">${off}</span>` : ''}</div>` +
    `<p class="issue">${esc(item.issue)}</p>` +
    (item.suggestion ? `<p class="sugg"><b>建议</b>${esc(item.suggestion)}</p>` : '') +
    (item.evidence.length ? `<p class="ev"><b>依据</b>${item.evidence.map((e) => `<code>${esc(e)}</code>`).join('')}</p>` : '') +
    (item.problems.length ? `<p class="prob">格式问题：${esc(item.problems.join('；'))}</p>` : '') +
    '</article>';
}

/** Paragraph text with the placed quotes marked; overlapping quotes keep the first mark. */
function markedText(text: string, marks: { range: [number, number]; i: number }[]) {
  let out = '';
  let pos = 0;
  for (const { range: [start, end], i } of [...marks].sort((a, b) => a.range[0] - b.range[0])) {
    if (start < pos) continue;
    out += `${esc(text.slice(pos, start))}<mark data-i="${i}">${esc(text.slice(start, end))}</mark>`;
    pos = end;
  }
  return out + esc(text.slice(pos));
}

/** The proof view for a draft and, when given, one report's items. */
export function proofHtml(paras: Para[], placed: PlacedItem[]) {
  const byPara = new Map<number, string[]>();
  const marks = new Map<number, { range: [number, number]; i: number }[]>();
  placed.forEach((p, i) => {
    byPara.set(p.at, [...byPara.get(p.at) ?? [], itemHtml(p, i)]);
    if (p.range) marks.set(p.at, [...marks.get(p.at) ?? [], { range: p.range, i }]);
  });
  const rows = paras.map((para, at) => `<div class="prow${byPara.has(at) ? ' has' : ''}" id="pp-${para.n}" data-at="${at}">` +
    `<p class="ptext"><span class="pn">${para.label}</span>${markedText(para.text, marks.get(at) ?? [])}</p>` +
    `<div class="pnotes">${(byPara.get(at) ?? []).join('')}</div></div>`);
  if (byPara.has(-1)) rows.push(`<div class="prow has orphan"><p class="ptext muted">这些反馈指的段落不在这份稿里：</p><div class="pnotes">${byPara.get(-1)!.join('')}</div></div>`);
  return `<div class="plist">${placed.map(itemHtml).join('')}</div><div class="pv">${rows.join('')}</div>`;
}

export function countsHtml(placed: PlacedItem[]) {
  if (!placed.length) return '<p class="pcount">没有发现矛盾。</p>';
  const counts = LEVELS.map((level) => [level, placed.filter((p) => p.item.level === level).length] as const).filter(([, n]) => n);
  const off = placed.filter((p) => !p.range).length;
  return `<p class="pcount">${placed.length} 条反馈${counts.map(([level, n]) => ` · <span class="lv-${level}"><span class="lv">${level}</span> ${n}</span>`).join('')}` +
    `${off ? ` · <span class="warn">${off} 条未对上原文</span>` : ''}</p>`;
}

/** Summary, problems and items of one report against the record's draft. */
export function resultHtml(paras: Para[], report: ProofReport | undefined) {
  if (!report) return `<p class="muted pnote">还没有报告。下面是分好段的原文。</p>${proofHtml(paras, [])}`;
  const read = readReport(report);
  if (!read.ok) {
    return `<div class="perr" role="alert"><b>这次的回复读不出来：</b>${esc(read.error)}<br>原文已存进历史。可以让 ChatGPT 按格式重发，再贴一次。</div>` +
      `<details class="raw" open><summary>贴回的原文</summary><pre>${esc(report.report)}</pre></details>${proofHtml(paras, [])}`;
  }
  const placed = placeItems(paras, read.report.items);
  const bad = placed.filter((p) => p.item.problems.length).length;
  return countsHtml(placed) + (read.report.summary ? `<p class="psum">${esc(read.report.summary)}</p>` : '') +
    (bad ? `<div class="perr" role="alert">有 ${bad} 条格式不对，已照样列出并注明问题。</div>` : '') + proofHtml(paras, placed);
}

export function reportTabsHtml(reports: ProofReport[], current: string) {
  if (reports.length < 2) return '';
  return `<div class="seg rtabs" role="group" aria-label="报告">${reports.map((r, i) =>
    `<button type="button" data-report="${esc(r.id)}" aria-pressed="${r.id === current}">第 ${i + 1} 次 · ${esc(when(r.createdAt))}</button>`).join('')}</div>`;
}
