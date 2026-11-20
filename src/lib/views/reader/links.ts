// Rewrites the links of a compiled KB page for the reader: relative .md links become
// reader links, and links named by an ID read as words (人物 / #0047 事件 / 第7章·12段 出处).
import { ownerName, pageLabel, parseLoc, pathInfo, pointLabel } from '../../labels.ts';
import type { NovelViewHost } from '../types.ts';

const OWNER_ID = /^[A-Z]+-[^\s#/]+$/;
const EVENT_ID = /^[A-Z]-\d+(?:@.+)?$/;
const NOTE_ID = /^(K|AN)-[A-Z]+-/;

/** How a link to `path` whose text is `text` should read; null keeps the text. */
function relabel(anchor: HTMLAnchorElement, path: string, host: NovelViewHost) {
  const text = anchor.textContent?.trim() ?? '';
  const info = pathInfo(path);
  const loc = info.kind === 'chapter' ? parseLoc(text) : null;
  if (loc) return { cls: 'loc', text: loc.label };
  if ((info.kind === 'event' || info.kind === 'world-event' || info.kind === 'owner-event') && EVENT_ID.test(text)) return { cls: 'ev', text: pointLabel(text) };
  const note = NOTE_ID.exec(text);
  if (note && info.kind === 'owner-note') return { cls: 'ev', text: note[1] === 'K' ? '知识' : '分析' };
  if ((info.kind === 'owner' || info.kind === 'record') && OWNER_ID.test(text)) return { cls: 'ent', text: ownerName(text) };
  if (/\.md$|^[A-Z_]+$/.test(text) || text === path) {
    const key = host.pathToKey.get(path);
    return { cls: '', text: key ? pageLabel(path, host.entries[key].title) : text };
  }
  return null;
}

export function remapLinks(article: HTMLElement, currentPath: string, host: NovelViewHost) {
  for (const anchor of article.querySelectorAll<HTMLAnchorElement>('a[href]')) {
    const href = anchor.getAttribute('href')!;
    try {
      const resolved = new URL(href, new URL(currentPath, 'https://kb.invalid/'));
      if (resolved.hostname === 'kb.invalid' && resolved.pathname.endsWith('.md')) {
        const path = decodeURIComponent(resolved.pathname.slice(1));
        const target = host.readerHref(path, resolved.hash);
        if (!target) { anchor.removeAttribute('href'); continue; }
        anchor.href = target;
        anchor.dataset.docPath = path;
        anchor.dataset.docHash = resolved.hash;
        const label = relabel(anchor, path, host);
        if (label) {
          anchor.textContent = label.text;
          if (label.cls) anchor.classList.add(label.cls);
        }
      } else if (href.startsWith('#')) {
        anchor.href = host.readerHref(currentPath, href) ?? href;
        anchor.dataset.docHash = href;
      } else if (resolved.protocol === 'https:' && resolved.hostname !== 'kb.invalid') {
        anchor.target = '_blank';
        anchor.rel = 'noopener noreferrer';
      } else {
        anchor.removeAttribute('href');
      }
    } catch {
      anchor.removeAttribute('href');
    }
  }
}
