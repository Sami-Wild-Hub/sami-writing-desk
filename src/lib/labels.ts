// Reader-facing names for compiled KB paths and IDs: domain labels, owner names,
// event numbers, chapter/paragraph locators and friendly page titles. Pure functions,
// shared by the reader, the timeline and search.

export const domainLabels: Record<string, string> = {
  CHARACTER: '人物', GROUP: '组织', LOCATION: '地点', OBJECT: '物件', CONCEPT: '概念', TOPIC: '主题',
};
export const domainOrder = Object.keys(domainLabels);

/** Pages with a fixed place in the book, in table-of-contents order. */
export const overviewPages: [path: string, label: string][] = [
  ['INDEX.md', '总目录'],
  ['events/INDEX.md', '事件索引'],
  ['CHRONOLOGY.md', '文字时间线'],
  ['DUAL_ORDER.md', '发生／披露对照'],
  ['setups/INDEX.md', '伏笔'],
  ['WORLD_EVENTS.md', '大事记'],
  ['CONTINUITY.md', '全局现况'],
  ['events/NARRATIVE_INDEX.md', '事件叙事索引'],
];
const overviewLabel = new Map(overviewPages);

/** The pages of one owner, in sub-tab order. */
export const ownerPages: [file: string, label: string][] = [
  ['START_HERE.md', '起点'], ['CURRENT.md', '当前'], ['TIMELINE_INDEX.md', '时间索引'],
  ['NARRATIVE_INDEX.md', '叙事索引'], ['SIDE_LINE.md', '支线'], ['setups.md', '伏笔'],
];

export const ownerName = (id: string) => id.replace(/^[A-Z]+-/, '');
export const eventNo = (eid: string) => `#${eid.replace(/^[A-Z]+-/, '')}`;
/** A timeline point ID (event, optionally @point name) as shown to readers. */
export const pointLabel = (pid: string) => {
  const [eid, name] = pid.split('@');
  return name ? `${eventNo(eid)}·${name}` : eventNo(eid);
};

const LOCATOR = /^C(\d+)#P(\d+)(?:-P?(\d+))?$/;
/** Chapter/paragraph locator → { label: 第7章·37–41段, chapter, paragraph }, or null. */
export function parseLoc(text: string) {
  const m = LOCATOR.exec(text.trim());
  if (!m) return null;
  const range = m[3] && m[3] !== m[2] ? `${m[2]}–${m[3]}` : m[2];
  return { label: `第${m[1]}章·${range}段`, chapter: Number(m[1]), paragraph: Number(m[2]) };
}

export interface PathInfo {
  kind: 'overview' | 'human' | 'chapter' | 'event' | 'world-event' | 'owner' | 'owner-event' | 'owner-note' | 'record' | 'other';
  domain?: string; owner?: string; file?: string; event?: string; chapter?: number;
}

export function pathInfo(path: string): PathInfo {
  let m: RegExpExecArray | null;
  if (overviewLabel.has(path)) return { kind: 'overview' };
  if (path.startsWith('human/')) return { kind: 'human' };
  if ((m = /^source\/C(\d+)\.md$/.exec(path))) return { kind: 'chapter', chapter: Number(m[1]) };
  if ((m = /^events\/([A-Z]+-\d+)\.md$/.exec(path))) return { kind: 'event', event: m[1] };
  if ((m = /^world-events\/([A-Z]+-\d+)\.md$/.exec(path))) return { kind: 'world-event', event: m[1] };
  if ((m = /^owners\/([A-Z]+)\/([^/]+)\/events\/([A-Z]+-\d+)\.md$/.exec(path))) return { kind: 'owner-event', domain: m[1], owner: m[2], event: m[3] };
  if ((m = /^owners\/([A-Z]+)\/([^/]+)\/([^/]+)$/.exec(path))) {
    const page = ownerPages.some(([file]) => file === m![3]);
    return { kind: page ? 'owner' : 'owner-note', domain: m[1], owner: m[2], file: m[3] };
  }
  if ((m = /^records\/([A-Z]+)\/([^/]+)\.md$/.exec(path))) return { kind: 'record', domain: m[1], owner: m[2] };
  return { kind: 'other' };
}

/** Manifest titles carry IDs and markdown; readers get the words. */
export function cleanTitle(title: string) {
  return title
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^(?:[A-Z]+-)+[^\s]*\s+/, '')
    .replace(/^[A-Z]+-\d+\s+/, '')
    .trim() || title;
}

/** The title a page is shown and linked with. */
export function pageLabel(path: string, manifestTitle: string) {
  const info = pathInfo(path);
  if (info.kind === 'overview') return path === 'INDEX.md' ? manifestTitle : overviewLabel.get(path)!;
  if (info.kind === 'chapter') return `第${info.chapter}章`;
  if (info.kind === 'owner' || info.kind === 'record') return ownerName(info.owner!);
  if (/^[A-Z_]+$/.test(manifestTitle)) return manifestTitle;
  return cleanTitle(manifestTitle).replace(/（编译生成）$/, '');
}
