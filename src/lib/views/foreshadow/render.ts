// Render author columns verbatim as table rows (cards on phones); 埋设章节 pieces and recovery chapters link to the reader.
import { esc } from '../../archive/ui.ts';
import type { NovelViewHost } from '../types.ts';
import type { ForeshadowData, ForeshadowRow } from './schema.ts';
import { plantingParts } from './model.js';

// Card role and short card label per known column; other columns render as labelled long text.
const ROLE: Record<string, string> = { 伏笔ID: 'id', '伏笔／线索内容': 'content', 埋设章节: 'meta', 重要程度: 'meta', 是否已收: 'state', 实际回收章节: 'meta' };
const SHORT: Record<string, string> = { 埋设章节: '埋设', 重要程度: '重要', 是否已收: '', 实际回收章节: '回收' };
export const columnClass = (header: string) => `fsh-${ROLE[header] ?? 'long'}`;

export function plantingHtml(text: string, host: NovelViewHost) {
  return plantingParts(text).map(p => p.chapter
    ? readerLink(host, `source/C${p.chapter}.md`, p.paragraph ? `#p${p.paragraph}` : '', p.text, 'planting') : esc(p.text)).join('');
}

function readerLink(host: NovelViewHost, path: string, hash: string, label: string, kind: string) {
  const href = host.readerHref(path, hash);
  return href ? `<a class="fsh-link" data-kind="${kind}" data-doc-path="${esc(path)}" data-doc-hash="${hash}" href="${esc(href)}">${esc(label)}</a>` : `<span class="fsh-unavailable">${esc(label)}（尚未同步）</span>`;
}

export function rowHtml(data: ForeshadowData, row: ForeshadowRow, host: NovelViewHost) {
  const cells = data.columns.map(({ header }) => {
    const text = row.author[header];
    const body = header === '埋设章节' ? plantingHtml(text, host) : esc(text);
    const links = header === '实际回收章节'
      ? row.derived.recovery_chapters.map(c => readerLink(host, `source/${c}.md`, '', `第${c.slice(1)}章`, 'recovery')).join(' ') : '';
    const empty = !text && !links ? ' fsh-empty' : '';
    return `<td class="${columnClass(header)}${empty}" data-label="${esc(SHORT[header] ?? header)}"><div class="fsh-text">${body}</div>${links}</td>`;
  }).join('');
  return `<tr data-row="${data.rows.indexOf(row)}">${cells}<td class="fsh-actions"><button type="button" data-edit>编辑</button><button type="button" data-delete>删除</button></td></tr>`;
}

export function editorHtml(data: ForeshadowData, row: ForeshadowRow, index: number) {
  return `<form class="fsh-editor" data-index="${index}"><h3>编辑伏笔 ${esc(row.author['伏笔ID'] || '')}</h3>` +
    data.columns.map(({ header }, i) => `<label>${esc(header)}<textarea aria-label="${esc(header)}" name="cell${i}" rows="${header === '伏笔／线索内容' ? 5 : 2}"${header === '埋设章节' ? ' placeholder="C1P8、C1P10-11 或 C3，多处用「，」分隔"' : ''}></textarea></label>`).join('') +
    '<label>回收章节链接<input aria-label="回收章节链接" name="recovery" placeholder="C2, C3"></label>' +
    '<p>修改实际回收章节后，可在这里手动调整回收链接。</p><p class="fsh-editor-error" role="alert"></p><button type="submit">保存修改</button> <button type="button" data-cancel>取消</button></form>';
}

export function fillEditor(form: HTMLFormElement, data: ForeshadowData, row: ForeshadowRow) {
  const set = (name: string, value: string) => {
    const input = form.elements.namedItem(name) as HTMLInputElement | HTMLTextAreaElement;
    input.value = value; input.dataset.initial = input.value;
  };
  data.columns.forEach(({ header }, i) => set(`cell${i}`, row.author[header]));
  set('recovery', row.derived.recovery_chapters.join(', '));
}
