// The expanded event card of the timeline: this point, time, 经过, 参与, 各线, 出处,
// walks along the axis and each selected line, and 打开事件页. IDs read as names.
import { ownerName, parseLoc, pointLabel } from '../../labels.ts';
import type { TimelineLayout, TimelineLine, TimelineModel } from '../../novelTimelineModel.ts';
import { esc } from '../../archive/ui.ts';
import type { NovelViewHost } from '../types.ts';

export function swatch(o: TimelineLine, w = 22) {
  if (o.axis) return `<svg class="sw" width="${w}" height="10" aria-hidden="true"><line x1="1" y1="5" x2="${w - 1}" y2="5" stroke="var(--axis)" stroke-width="4" stroke-linecap="round"/></svg>`;
  return `<svg class="sw" width="${w}" height="10" aria-hidden="true"><line x1="1" y1="5" x2="${w - 1}" y2="5" stroke="${o.color}" stroke-width="3" stroke-dasharray="${o.dash}" stroke-linecap="${o.dash ? 'butt' : 'round'}"/></svg>`;
}

/** Link builders into the reader; without a synced page the label stays plain text. */
export function cardLinks(model: TimelineModel, host: NovelViewHost) {
  const domainOfPrefix: Record<string, string> = {};
  model.ordered.forEach((o) => { domainOfPrefix[o.id.split('-')[0]] = o.domain; });
  const pointNames: Record<string, string[]> = {};
  Object.keys(model.data.points).forEach((pid) => { const [eid, name] = pid.split('@'); if (name) (pointNames[eid] ||= []).push(name); });

  const link = (label: string, path: string | null, hash = '', cls = '') => {
    const href = path ? host.readerHref(path, hash) : null;
    const attr = cls ? ` class="${cls}"` : '';
    if (!href) return cls ? `<span${attr}>${label}</span>` : label;
    return `<a${attr} href="${esc(href)}" data-doc-path="${esc(path)}" data-doc-hash="${esc(hash)}">${label}</a>`;
  };
  const ownerPath = (id: string, page: string) => {
    const domain = model.lines[id]?.domain ?? domainOfPrefix[id.split('-')[0]];
    return domain ? `owners/${domain}/${id}/${page}` : null;
  };
  const eventHref = (pid: string) => {
    const [eid, name] = pid.split('@');
    return { path: `events/${eid}.md`, hash: name ? `#at-${name}` : '' };
  };
  /** Event IDs inside a sentence become links named like the rows (#0047·点名). */
  const linkEvents = (text: string) => esc(text).replace(/([A-Z]-\d{4})((?:@[^\s，。；、：:,;（）()“”「」]+)?)/g, (all, eid: string, at: string) => {
    const name = at ? (pointNames[eid] ?? []).filter((n) => at.slice(1).startsWith(n)).sort((a, b) => b.length - a.length)[0] : '';
    const id = name ? `${eid}@${name}` : eid;
    const { path, hash } = eventHref(id);
    return link(esc(pointLabel(id)), path, hash, 'ev') + all.slice(id.length);
  });
  return { link, ownerPath, eventHref, linkEvents };
}
export type CardLinks = ReturnType<typeof cardLinks>;

export function cardHtml(pid: string, padLeft: number, lay: TimelineLayout, model: TimelineModel, links: CardLinks) {
  const { data, lines: OWN, ownersOf } = model;
  const { link, ownerPath, eventHref, linkEvents } = links;
  const P = data.points[pid];
  const pname = pid.split('@')[1];
  const name = (id: string) => esc(OWN[id]?.name ?? ownerName(id));
  const persp = (ownersOf[pid] ?? []).filter((id) => OWN[id].text[pid]).map((id) =>
    `<div><span class="oc">${swatch(OWN[id], 14)}<b>${link(name(id), ownerPath(id, 'TIMELINE_INDEX.md'))}</b></span>${linkEvents(OWN[id].text[pid])}</div>`).join('');
  const roles = Object.entries(P.roles ?? {}).map(([id, t]) => `<div><b>${link(name(id), ownerPath(id, 'START_HERE.md'))}</b>：${linkEvents(t)}</div>`).join('');
  let dl = '';
  if (pname && P.pt) dl += `<dt>此点</dt><dd>${linkEvents(P.pt)}</dd>`;
  if (P.time) dl += `<dt>${pname ? '整件事时间' : '时间'}</dt><dd>${linkEvents(P.time)}</dd>`;
  if (P.end && !pname) dl += `<dt>结束</dt><dd>${linkEvents(P.end)}</dd>`;
  if (P.story) dl += `<dt>经过</dt><dd>${linkEvents(P.story)}</dd>`;
  if (roles) dl += `<dt>参与</dt><dd>${roles}</dd>`;
  if (persp) dl += `<dt>各线</dt><dd class="persp">${persp}</dd>`;
  const locs = (P.locs ?? []).map((l) => {
    const loc = parseLoc(l);
    return link(esc(loc?.label ?? l), loc ? `source/C${loc.chapter}.md` : null, loc ? `#p${loc.paragraph}` : '', 'loc');
  }).join('');
  if (locs) dl += `<dt>出处</dt><dd>${locs}</dd>`;

  const walk = (label: string, sw: string, seq: string[]) => {
    const i = seq.indexOf(pid), prev = seq[i - 1], next = seq[i + 1];
    return `<div class="walk">${sw}<span class="nm">${esc(label)}</span>` +
      `<button type="button" class="btn" data-go="${esc(prev ?? '')}"${prev ? '' : ' disabled'}>← ${prev ? esc(pointLabel(prev)) : '无'}</button>` +
      `<button type="button" class="btn" data-go="${esc(next ?? '')}"${next ? '' : ' disabled'}>${next ? esc(pointLabel(next)) : '无'} →</button></div>`;
  };
  const axisLine = model.ordered.find((o) => o.axis);
  let walks = lay.axisPts.has(pid) && axisLine ? walk('主轴', swatch(axisLine, 14), lay.pts.filter((p) => lay.axisPts.has(p))) : '';
  lay.sel.filter((o) => o.text[pid] !== undefined).forEach((o) => { walks += walk(o.name, swatch(o, 14), lay.seqs[o.id]); });

  const { path, hash } = eventHref(pid);
  const title = `${esc(P.title)}${pname ? ` · ${esc(pname)}` : ''}`;
  const open = link('打开事件页', path, hash, 'btn primary');
  return `<div class="card" style="margin-left:${padLeft}px" data-card="${esc(pid)}"><h4>${link(title, path, hash)}</h4>` +
    `<div class="meta">${esc(pointLabel(pid))} · ${esc(data.bands[P.b] ?? '')}</div><dl>${dl}</dl>` +
    (walks ? `<div class="walks">${walks}</div>` : '') +
    `<div class="acts">${open.startsWith('<a') ? open : ''}<span class="sp"></span><button type="button" class="btn" data-close="${esc(pid)}">收起</button></div></div>`;
}
