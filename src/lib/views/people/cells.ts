// Table rows and the expanded detail of the 人物 view. Every backticked reference
// reads like the reader's links (人物名 / #0047 / 第7章·12段) and opens the reader there;
// without a synced page it stays plain text.
import { ownerName, parseLoc, pathInfo, pointLabel } from '../../labels.ts';
import { esc } from '../../archive/ui.ts';
import { HOOK_CATEGORIES, LOOK_COLUMNS, NAME_COLUMNS, hasEntries, type NovelPeopleData, type Person } from '../../novelPeopleModel.ts';
import type { NovelViewHost } from '../types.ts';

const REF = /`([^`\s]+)`/g;
const NOTE_ID = /^(K|AN)-[A-Z]+-/;
const ENTITY = /^(?:CH|GR|LOC|OBJ|CON|TP)-/;
const MARK_TITLE: Record<string, string> = { '一见': '当场可辨', '?': '适用范围未明' };

export function peopleLinks(data: NovelPeopleData, host: NovelViewHost) {
  const target = (ref: string) => {
    const [path, hash = ''] = (data.paths[ref] ?? '').split(/(?=#)/);
    return path && host.readerHref(path, hash) ? { path, hash, href: host.readerHref(path, hash)! } : null;
  };
  const label = (ref: string, path = '') => {
    const loc = parseLoc(ref);
    if (loc) return { cls: 'loc', text: loc.label };
    if (/^[A-Z]-\d{4}/.test(ref)) return { cls: 'ev', text: pointLabel(ref) };
    const note = NOTE_ID.exec(ref);
    if (note) return { cls: 'ev', text: note[1] === 'K' ? '知识' : '分析' };
    const info = pathInfo(path);
    if (info.kind === 'owner' || info.kind === 'record' || ENTITY.test(ref)) return { cls: 'ent', text: ownerName(ref) };
    return { cls: '', text: ref };
  };
  /** One reference as a link; `text` overrides the label (escaped HTML). */
  const ref = (id: string, text?: string, cls?: string) => {
    const to = target(id);
    const l = label(id, to?.path);
    const html = text ?? esc(l.text);
    const c = cls ?? l.cls;
    if (!to) return c ? `<span class="${c}">${html}</span>` : html;
    return `<a${c ? ` class="${c}"` : ''} href="${esc(to.href)}" data-doc-path="${esc(to.path)}" data-doc-hash="${esc(to.hash)}">${html}</a>`;
  };
  /** A KB sentence: backticked references become links, the rest is escaped text. */
  const rich = (text: string) => text.split(REF).map((part, i) => (i % 2 ? ref(part) : esc(part))).join('');
  /** A compact 出处 chip for the table (1·39), with the full label as its title. */
  const chip = (loc: string) => {
    const m = /^C(\d+)#P(\d+)(?:-P?(\d+))?$/.exec(loc);
    if (!m) return ref(loc);
    const full = parseLoc(loc)!.label;
    return ref(loc, `${m[1]}·${m[2]}${m[3] && m[3] !== m[2] ? `–${m[3]}` : ''}`, 'loc').replace(/^<(a|span)/, `<$1 title="${esc(full)}" aria-label="${esc(full)}"`);
  };
  const profile = (p: Person, text = '档案') => ref(p.id, text, 'pill');
  return { ref, rich, chip, profile };
}
export type PeopleLinks = ReturnType<typeof peopleLinks>;

/** Plain text for the table: entity references read as names, the rest is dropped. */
const strip = (text: string) => text.replace(REF, (_, id: string) => (ENTITY.test(id) ? ownerName(id) : id === 'T0' ? id : ''))
  .replace(/\s+/g, ' ').replace(/[\s；;]+$/, '').trim();
const highlight = (text: string, q: string) => {
  if (!q) return esc(text);
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  return i < 0 ? esc(text) : `${esc(text.slice(0, i))}<mark>${esc(text.slice(i, i + q.length))}</mark>${esc(text.slice(i + q.length))}`;
};
const markTag = (mark: string, rich: (t: string) => string) =>
  mark ? `<i class="mk" title="${esc(MARK_TITLE[mark] ?? '明确阶段')}">${rich(mark)}</i>` : '';

export function rowHtml(p: Person, open: boolean, q: string, links: PeopleLinks, asOf: string) {
  const { ref, chip, rich } = links;
  const names = p.names.map((n) => `<span class="nm">${highlight(n.name, q)}<span class="who">（${esc([...new Set(n.users.map(strip))].join('、'))}）</span>` +
    `${n.refs.map(chip).join('')}</span>`).join('');
  const hooks = HOOK_CATEGORIES.map((cat) => {
    const items = p.hooks.filter((h) => h.cat === cat);
    if (!items.length) return '';
    return `<div class="hk"><b>${esc(cat)}</b>${items.map((h) => `<span>${esc(h.text)}${markTag(h.mark, rich)}${h.refs.map(chip).join('')}</span>`).join('；')}</div>`;
  }).join('');
  const current = p.current?.items[0] ? strip(p.current.items[0]) : '';
  const late = p.current && p.current.as !== asOf ? `<small>${esc(p.current.as)}</small>` : '';
  const dash = '<span class="muted">—</span>';
  return `<tr class="person${open ? ' open' : ''}" data-id="${esc(p.id)}">` +
    `<th scope="row" data-label="姓名"><button type="button" class="who-btn" aria-expanded="${open}" data-toggle="${esc(p.id)}">` +
    `<span class="caret" aria-hidden="true">▸</span>${highlight(p.name, q)}</button>${p.kind === 'record' ? '<span class="kind">简档</span>' : ''}</th>` +
    `<td data-label="称呼/别名">${names || dash}</td>` +
    `<td data-label="所属">${p.group.map((g) => ref(g)).join('、') || dash}</td>` +
    `<td data-label="一句话身份">${rich(p.basic) || dash}</td>` +
    `<td data-label="首次出现">${p.first ? chip(p.first) : dash}</td>` +
    `<td data-label="当前状态">${current ? `<div class="cur" title="${esc(current)}">${late}${esc(current)}</div>` : dash}</td>` +
    `<td data-label="记忆钩子">${hooks || dash}</td></tr>`;
}

function evidenceTable(title: string, columns: string[], data: string[][], links: PeopleLinks) {
  if (!data.length) return `<h4>${esc(title)} <span class="n">0 条</span></h4><p class="muted">这一段里没有${esc(title)}条目。</p>`;
  const at = columns.indexOf('出处');
  const body = data.map((row) => `<tr>${row.map((cell, i) => `<td data-label="${esc(columns[i])}">${i === at ? cell.split(REF).filter((_, k) => k % 2).map((id) => links.ref(id)).join(' ') || esc(cell) : links.rich(cell)}</td>`).join('')}</tr>`).join('');
  return `<h4>${esc(title)} <span class="n">${data.length} 条</span></h4>` +
    `<div class="ev-wrap"><table class="evt"><thead><tr>${columns.map((c) => `<th scope="col">${esc(c)}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></div>`;
}

export function detailHtml(p: Person, data: NovelPeopleData, links: PeopleLinks) {
  const { ref, rich, profile } = links;
  const current = p.current ? `<dt>当前状态</dt><dd><div class="muted">${esc(p.current.as)}</div><ul>${p.current.items.map((t) => `<li>${rich(t)}</li>`).join('')}</ul></dd>` : '';
  const evidence = hasEntries(p)
    ? evidenceTable('称呼', NAME_COLUMNS, p.evidence.names, links) + evidenceTable('外在与言行', LOOK_COLUMNS, p.evidence.looks, links)
    : `<p class="muted">称呼、外在与言行：${data.extracted ? `已抽 ${esc(data.extracted)}，这一段里没有这个人的条目。` : '尚未抽取。'}</p>`;
  return `<tr class="detail" data-detail="${esc(p.id)}"><td colspan="7"><div class="pd">` +
    `<div class="pd-head"><h3>${esc(p.name)}</h3><span class="muted">${p.kind === 'owner' ? '人物档案' : '简档'}</span><span class="sp"></span>${profile(p, '打开 KB 档案')}</div>` +
    `<dl><dt>一句话身份</dt><dd>${rich(p.basic) || '—'}</dd>` +
    `<dt>所属</dt><dd>${p.group.map((g) => ref(g)).join('、') || '—'}</dd>` +
    `<dt>首次出现</dt><dd>${p.first ? ref(p.first) : '—'}</dd>${current}</dl>` +
    `${evidence}<div class="acts"><span class="sp"></span><button type="button" class="btn" data-toggle="${esc(p.id)}">收起</button></div></div></td></tr>`;
}
