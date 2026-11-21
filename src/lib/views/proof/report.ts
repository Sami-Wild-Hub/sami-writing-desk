// Reads the report pasted back from ChatGPT: takes the first JSON object out of the text
// (a code fence or chatter around it is fine), checks its shape, and keeps every item,
// noting what is wrong with it instead of dropping it. placeItems ties items to the draft.
import { findQuote, paraNumber, type Para } from './paragraphs.ts';
import { KINDS, LEVELS } from './task.ts';

export interface ReportItem {
  para: string; quote: string; kind: string; level: string; issue: string;
  evidence: string[]; suggestion: string;
  /** What does not match the format; empty when the item is well-formed. */
  problems: string[];
}
export interface ParsedReport { title: string; summary: string; items: ReportItem[]; }
export type ReportResult = { ok: true; report: ParsedReport } | { ok: false; error: string };

/** The end (exclusive) of the balanced {…} starting at `start`, or -1 when it never closes. */
function closing(text: string, start: number) {
  let depth = 0;
  let inString = false;
  for (let i = start; i < text.length; i += 1) {
    const c = text[i];
    if (inString) {
      if (c === '\\') i += 1;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === '{') depth += 1;
    else if (c === '}' && (depth -= 1) === 0) return i + 1;
  }
  return -1;
}

/** The first {…} in the text that parses as JSON. */
function firstObject(text: string): { value: unknown } | { error: string } {
  let error = '';
  for (let start = text.indexOf('{'); start >= 0;) {
    const end = closing(text, start);
    if (end < 0) return { error: error || '没找到完整的 JSON：有 { 没有对应的 }，回复可能被截断了。' };
    const candidate = text.slice(start, end);
    try {
      return { value: JSON.parse(candidate) };
    } catch (e) {
      if (!error || candidate.includes('"items"')) error = `JSON 格式有误：${(e as Error).message}`;
    }
    start = text.indexOf('{', end);
  }
  return { error: error || '没找到 JSON：回复里没有 { … }。' };
}

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : value == null ? '' : JSON.stringify(value));
const shown = (value: unknown) => (value === undefined ? '没有' : JSON.stringify(value));

function readItem(raw: unknown): ReportItem {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { para: '', quote: '', kind: '', level: '', issue: text(raw), evidence: [], suggestion: '', problems: ['这一条不是 {…} 对象'] };
  }
  const r = raw as Record<string, unknown>;
  const problems: string[] = [];
  const need = (key: string, ok: boolean, rule: string) => { if (!ok) problems.push(`${key} ${rule}，实际是 ${shown(r[key])}`); };
  need('para', typeof r.para === 'string' && paraNumber(r.para) > 0, '应是段号，如 "P12"');
  need('quote', typeof r.quote === 'string' && Boolean(r.quote.trim()), '应是一小段原文');
  need('kind', (KINDS as readonly unknown[]).includes(r.kind), `应是 ${KINDS.join('/')} 之一`);
  need('level', (LEVELS as readonly unknown[]).includes(r.level), `应是 ${LEVELS.join('/')} 之一`);
  need('issue', typeof r.issue === 'string' && Boolean(r.issue.trim()), '应写明问题');
  const evidence = Array.isArray(r.evidence) ? r.evidence : typeof r.evidence === 'string' ? [r.evidence] : [];
  need('evidence', Array.isArray(r.evidence) && r.evidence.every((e) => typeof e === 'string'), '应是字符串列表');
  need('suggestion', r.suggestion === undefined || typeof r.suggestion === 'string', '应是文字');
  return {
    para: text(r.para), quote: text(r.quote), kind: text(r.kind), level: text(r.level), issue: text(r.issue),
    evidence: evidence.map(text).filter(Boolean), suggestion: text(r.suggestion), problems,
  };
}

export function parseReport(pasted: string): ReportResult {
  const found = firstObject(pasted);
  if ('error' in found) return { ok: false, error: found.error };
  const value = found.value as Record<string, unknown>;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ok: false, error: '最外层应是一个 {…} 对象。' };
  if (!Array.isArray(value.items)) return { ok: false, error: `缺少 "items" 列表（实际是 ${shown(value.items)}）。` };
  return { ok: true, report: { title: text(value.title), summary: text(value.summary), items: value.items.map(readItem) } };
}

export interface PlacedItem {
  item: ReportItem;
  /** Index into the draft's paragraphs, or -1 when the item names no paragraph of this draft. */
  at: number;
  /** Where the quote is in that paragraph; null when it is not found there. */
  range: [number, number] | null;
}

/** Items tied to their paragraph and quote, in the draft's order (unplaced ones last). */
export function placeItems(paras: Para[], items: ReportItem[]): PlacedItem[] {
  const placed = items.map((item) => {
    const at = paraNumber(item.para) - 1;
    const para = paras[at];
    return { item, at: para ? at : -1, range: para ? findQuote(para.text, item.quote) : null };
  });
  const key = (p: PlacedItem) => (p.at < 0 ? Infinity : p.at * 1e6 + (p.range?.[0] ?? 0));
  return placed.sort((a, b) => (key(a) - key(b)) || 0);
}
