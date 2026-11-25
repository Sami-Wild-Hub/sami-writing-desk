// Render the foreshadow table as a live grid (cards on phones): every visible author cell is an input.
// The quote text links to its 埋设章节 location and 实际回收章节 links each chapter in place; no separate link lines.
import { esc } from '../../archive/ui.ts';
import type { NovelViewHost } from '../types.ts';
import type { ForeshadowData, ForeshadowRow } from './schema.ts';
import { STATUSES, plantingChapterText, plantingParts, rowKey, visibleColumns } from './model.js';

// Card role and short card label per known column; other columns render as labelled long text.
const ROLE: Record<string, string> = { 伏笔ID: 'id', '伏笔／线索内容': 'content', 埋设章节: 'meta', 重要程度: 'meta', 是否已收: 'state', 实际回收章节: 'meta' };
const SHORT: Record<string, string> = { 埋设章节: '埋设', 重要程度: '重要', 是否已收: '', 实际回收章节: '回收' };
// Cells whose display text is a link; the input appears in place of the text while the cell has focus.
const LINKED = new Set(['伏笔／线索内容', '实际回收章节']);
export const columnClass = (header: string) => `fsh-${ROLE[header] ?? 'long'}`;
export const STATUS_LABEL: Record<string, string> = { '': '未收' };

function readerLink(host: NovelViewHost, path: string, hash: string, label: string, kind: string, extra = '') {
  const href = host.readerHref(path, hash);
  return href ? `<a class="fsh-link${extra}" tabindex="-1" data-kind="${kind}" data-doc-path="${esc(path)}" data-doc-hash="${hash}" href="${esc(href)}">${esc(label)}</a>`
    : `${esc(label)}<span class="fsh-unavailable">（尚未同步）</span>`;
}

export function plantingHtml(text: string, host: NovelViewHost) {
  return plantingParts(text).map(p => p.chapter
    ? readerLink(host, `source/C${p.chapter}.md`, p.paragraph ? `#p${p.paragraph}` : '', p.text, 'planting') : esc(p.text)).join('');
}

// The quote links to the first planting location in 埋设章节 (the paragraph it was copied from).
export function quoteHtml(row: ForeshadowRow, host: NovelViewHost) {
  const text = row.author['伏笔／线索内容'], at = plantingParts(row.author['埋设章节'] ?? '').find(p => p.chapter);
  if (!text || !at) return esc(text);
  return readerLink(host, `source/C${at.chapter}.md`, at.paragraph ? `#p${at.paragraph}` : '', text, 'planting', ' fsh-quote');
}

// Each Cn written in 实际回收章节 links to that chapter; the rest of the author's text stays as written.
export function recoveryHtml(text: string, host: NovelViewHost) {
  return text.split(/(C[1-9]\d*)/).map((part, i) => i % 2
    ? readerLink(host, `source/${part}.md`, '', part, 'recovery') : esc(part)).join('');
}

export function viewHtml(header: string, row: ForeshadowRow, host: NovelViewHost) {
  return header === '伏笔／线索内容' ? quoteHtml(row, host) : recoveryHtml(row.author[header], host);
}

export function statusOptions(value: string) {
  return [...new Set(['', ...STATUSES, value])].map(v =>
    `<option value="${esc(v)}"${v === value ? ' selected' : ''}>${esc(STATUS_LABEL[v] ?? v)}</option>`).join('');
}

// What a cell's input shows for the stored text: 埋设章节 shows chapter numbers only.
export const cellValue = (header: string, text: string) => header === '埋设章节' ? plantingChapterText(text) : text;

// A textarea's content loses one leading newline when parsed, so one is added to keep the author's text exact.
const textarea = (header: string, text: string) =>
  `<textarea class="fsh-input" rows="1" data-col="${esc(header)}" aria-label="${esc(header)}" spellcheck="false">\n${esc(text)}</textarea>`;

export function cellHtml(header: string, row: ForeshadowRow, host: NovelViewHost) {
  const text = row.author[header];
  if (header === '是否已收') return `<select class="fsh-input" data-col="是否已收" aria-label="是否已收">${statusOptions(text)}</select>`;
  if (LINKED.has(header)) return `<div class="fsh-view" aria-hidden="true">${viewHtml(header, row, host)}</div>${textarea(header, text)}`;
  return textarea(header, cellValue(header, text));
}

export function cellClass(header: string, row: ForeshadowRow) {
  return `${columnClass(header)}${LINKED.has(header) ? ' fsh-linked' : ''}${row.author[header] ? '' : ' fsh-empty'}`;
}

export function rowHtml(data: ForeshadowData, row: ForeshadowRow, host: NovelViewHost) {
  const cells = visibleColumns(data).map(({ header }) =>
    `<td class="${cellClass(header, row)}" data-label="${esc(SHORT[header] ?? header)}">${cellHtml(header, row, host)}</td>`).join('');
  return `<tr data-key="${esc(rowKey(row))}" data-state="${esc(row.author['是否已收'] ?? '')}">${cells}</tr>`;
}
