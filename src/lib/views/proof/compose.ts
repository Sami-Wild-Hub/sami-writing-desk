// Chapter names and next-draft titles for the book's Drive request form.
import type { ProofRecord } from './store.ts';

const NUMBER = '[0-9零〇一二两三四五六七八九十百千]+';
const CHAPTER = new RegExp(`^(?:c\\s*(\\d+)|第?\\s*(${NUMBER})\\s*章|(${NUMBER}))$`, 'i');
const TITLE_CHAPTER = new RegExp(`^(c\\s*\\d+|第?\\s*${NUMBER}\\s*章)(?=\\s|第|初稿|$)`, 'i');

function number(text: string): number {
  if (/^\d+$/.test(text)) return Number(text);
  const digits: Record<string, number> = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  const units: Record<string, number> = { 十: 10, 百: 100, 千: 1000 };
  let total = 0, digit = 0;
  for (const char of text) {
    if (char in digits) digit = digit * 10 + digits[char];
    else { total += (digit || 1) * units[char]; digit = 0; }
  }
  return total + digit;
}

export function chapterName(input: string): string {
  const text = input.trim();
  const match = CHAPTER.exec(text);
  const n = match ? number(match[1] ?? match[2] ?? match[3]) : 0;
  return Number.isSafeInteger(n) && n > 0 ? `C${n}` : input;
}

/** Chapter identity for submitted versions; not a confirmation of the canonical manuscript. */
export function submittedChapter(title: string, driveName?: string): string {
  const match = TITLE_CHAPTER.exec(title.trim());
  if (match) return chapterName(match[1]);
  if (driveName) {
    const chapter = chapterName(driveName);
    if (/^C\d+$/.test(chapter)) return chapter;
  }
  return '';
}

/** Start a new review without mutating the original submitted version or its reports. */
export function revisionTitle(record: ProofRecord, records: ProofRecord[]): string {
  const chapter = submittedChapter(record.title, record.driveName);
  return chapter ? nextTitle(chapter, records) : `${record.title.slice(0, 94)} 复校`;
}

export function nextTitle(input: string, records: ProofRecord[]): string {
  const chapter = chapterName(input).trim();
  if (!chapter) return '';
  let latest = 0;
  for (const record of records) {
    if (record.fetch?.status === 'failed') continue;
    const match = TITLE_CHAPTER.exec(record.title.trim());
    if (!match || chapterName(match[1]) !== chapter) continue;
    const suffix = record.title.trim().slice(match[0].length);
    const draft = new RegExp(`第\\s*(${NUMBER})\\s*稿`).exec(suffix);
    latest = Math.max(latest, draft ? number(draft[1]) : suffix.includes('初稿') ? 1 : 0);
  }
  return `${chapter} 第${latest + 1}稿`;
}
