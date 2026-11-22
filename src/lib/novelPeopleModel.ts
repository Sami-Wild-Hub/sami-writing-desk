// The people view's data, synced by the private KB repo as one JSON string at
// books/<slug>/people: every CHARACTER with the KB's basic columns, plus 称呼 and
// 外在与言行 from the writer-reference layer with their full evidence rows.
import { ownerName } from './labels.ts';

export interface PersonName { name: string; users: string[]; refs: string[]; }
export interface PersonHook { cat: string; text: string; mark: string; refs: string[]; }
export interface Person {
  id: string; name: string; kind: 'owner' | 'record'; basic: string; group: string[]; first: string;
  current: { as: string; items: string[] } | null;
  names: PersonName[]; hooks: PersonHook[];
  /** 称呼 rows: 叫法 谁用 方式 对谁说 场合 场景时间 出处 原文短引; 外在与言行 rows: 类别 内容 来源 适用范围 场景时间 出处 原文短引. */
  evidence: { names: string[][]; looks: string[][] };
}
export interface NovelPeopleData {
  /** KB coverage (C1–C22) and the chapters the writer-reference layer has read (C1–C1, or ''). */
  scope: string; extracted: string;
  people: Person[];
  /** Backticked reference → compiled page path with its anchor. */
  paths: Record<string, string>;
}

export const NAME_COLUMNS = ['叫法', '谁用', '方式', '对谁说', '场合', '场景时间', '出处', '原文短引'];
export const LOOK_COLUMNS = ['类别', '内容', '来源', '适用范围', '场景时间', '出处', '原文短引'];
export const HOOK_CATEGORIES = ['体貌', '身体状态', '外在标识', '声音说话', '行为习惯', '好恶禁忌'];

const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every((s) => typeof s === 'string');
const rows = (v: unknown, width: number) => Array.isArray(v) && v.every((row) => strings(row) && row.length === width);

function validPerson(p: any): p is Person {
  return p && typeof p.id === 'string' && typeof p.name === 'string' && (p.kind === 'owner' || p.kind === 'record') &&
    typeof p.basic === 'string' && strings(p.group) && typeof p.first === 'string' &&
    (p.current === null || (typeof p.current?.as === 'string' && strings(p.current.items))) &&
    Array.isArray(p.names) && p.names.every((n: any) => typeof n?.name === 'string' && strings(n.users) && strings(n.refs)) &&
    Array.isArray(p.hooks) && p.hooks.every((h: any) => typeof h?.cat === 'string' && typeof h.text === 'string' && typeof h.mark === 'string' && strings(h.refs)) &&
    rows(p.evidence?.names, NAME_COLUMNS.length) && rows(p.evidence?.looks, LOOK_COLUMNS.length);
}

export function parsePeopleData(value: unknown): NovelPeopleData | null {
  if (typeof value !== 'string') return null;
  try {
    const data = JSON.parse(value);
    if (!Array.isArray(data?.people) || !data.people.every(validPerson) || !data.paths || typeof data.paths !== 'object') return null;
    const paths = Object.fromEntries(Object.entries(data.paths).filter((e): e is [string, string] => typeof e[1] === 'string'));
    return { scope: typeof data.scope === 'string' ? data.scope : '', extracted: typeof data.extracted === 'string' ? data.extracted : '', people: data.people, paths };
  } catch {
    return null;
  }
}

export const hasEntries = (p: Person) => p.names.length > 0 || p.hooks.length > 0;

/** 所属 values with their people counts: groups (GR-) first, then by count. */
export function groupsOf(people: Person[]) {
  const count = new Map<string, number>();
  people.forEach((p) => p.group.forEach((g) => count.set(g, (count.get(g) ?? 0) + 1)));
  return [...count].sort((a, b) => Number(b[0].startsWith('GR-')) - Number(a[0].startsWith('GR-')) || b[1] - a[1])
    .map(([id, n]) => ({ id, name: ownerName(id), n }));
}

/** Text the search box looks in: 姓名, every 叫法 and the one-line identity (it carries 又称). */
export const searchText = (p: Person) => [p.name, ...p.names.map((n) => n.name), p.basic.replace(/`/g, '')].join('\n').toLowerCase();

export type PeopleFilter = '' | '*entries' | '*none' | string;
export function filterPeople(people: Person[], q: string, filter: PeopleFilter) {
  const needle = q.trim().toLowerCase();
  return people.filter((p) => (!needle || searchText(p).includes(needle)) &&
    (!filter || (filter === '*entries' ? hasEntries(p) : filter === '*none' ? !p.group.length : p.group.includes(filter))));
}
