// Render author columns verbatim and reader links from the separate derived locations.
import { esc } from '../../archive/ui.ts';
import { parseLoc } from '../../labels.ts';
import type { NovelViewHost } from '../types.ts';
import type { ForeshadowData, ForeshadowRow } from './schema.ts';

export function plantingLink(row: ForeshadowRow, host: NovelViewHost) {
  const loc = parseLoc(row.derived.planting_location.link);
  if (!loc) return '';
  return readerLink(host, `source/C${loc.chapter}.md`, `#p${loc.paragraph}`, loc.label, 'planting');
}

function readerLink(host: NovelViewHost, path: string, hash: string, label: string, kind: string) {
  const href = host.readerHref(path, hash);
  return href ? `<a class="fsh-link" data-kind="${kind}" data-doc-path="${esc(path)}" data-doc-hash="${hash}" href="${esc(href)}">${esc(label)}</a>` : `<span class="fsh-unavailable">${esc(label)}（尚未同步）</span>`;
}

export function rowHtml(data: ForeshadowData, row: ForeshadowRow, host: NovelViewHost) {
  const cells = data.columns.map(({ header }) => {
    const links = header === '埋设章节' ? plantingLink(row, host) : header === '实际回收章节'
      ? row.derived.recovery_chapters.map(c => readerLink(host, `source/${c}.md`, '', `第${c.slice(1)}章`, 'recovery')).join(' ') : '';
    return `<td${header === '伏笔／线索内容' ? ' class="fsh-content"' : ''}><div class="fsh-text">${esc(row.author[header])}</div>${links}</td>`;
  }).join('');
  return `<tr data-row="${data.rows.indexOf(row)}">${cells}<td><button type="button" data-edit>编辑</button><button type="button" data-delete>删除</button></td></tr>`;
}

export function editorHtml(data: ForeshadowData, row: ForeshadowRow, index: number) {
  return `<form class="fsh-editor" data-index="${index}"><h3>编辑伏笔 ${esc(row.author['伏笔ID'] || '')}</h3>` +
    data.columns.map(({ header }, i) => `<label>${esc(header)}<textarea aria-label="${esc(header)}" name="cell${i}" rows="${header === '伏笔／线索内容' ? 5 : 2}"></textarea></label>`).join('') +
    '<label>埋设链接<input aria-label="埋设链接" name="planting" placeholder="C章号#P起段-P末段"></label>' +
    '<label>回收章节链接<input aria-label="回收章节链接" name="recovery" placeholder="C2, C3"></label>' +
    '<p>修改原文或章节后，可在这里手动调整链接。</p><p class="fsh-editor-error" role="alert"></p><button type="submit">保存修改</button> <button type="button" data-cancel>取消</button></form>';
}

export function fillEditor(form: HTMLFormElement, data: ForeshadowData, row: ForeshadowRow) {
  const set = (name: string, value: string) => {
    const input = form.elements.namedItem(name) as HTMLInputElement | HTMLTextAreaElement;
    input.value = value; input.dataset.initial = input.value;
  };
  data.columns.forEach(({ header }, i) => set(`cell${i}`, row.author[header]));
  set('planting', row.derived.planting_location.link);
  set('recovery', row.derived.recovery_chapters.join(', '));
}
