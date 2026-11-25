// Local proof text and exact, reversible sentence replacements.
import type { Para } from './paragraphs.ts';
import type { ReportItem } from './report.ts';
import { fixProblem } from './diff.ts';

export interface Edits { paragraphs: string[]; accepted: Record<string, boolean> }
export const originalEdits = (paras: Para[]): Edits => ({ paragraphs: paras.map(p => p.text), accepted: {} });

export function replacement(text: string | undefined, item: ReportItem, accepted: boolean) {
  const problem = fixProblem(item.quote, item.fix);
  const from = accepted ? item.fix! : item.quote, to = accepted ? item.quote : item.fix!;
  const start = text?.indexOf(from) ?? -1;
  const reason = problem || (text === undefined ? '没有这一段' : start < 0 ? (accepted ? '建议句已被修改，无法撤销' : '原句已被修改或找不到，无法接受')
    : text!.indexOf(from, start + 1) >= 0 ? '句子出现多次，无法确定替换位置' : '');
  return { reason, text: reason ? text : text!.slice(0, start) + to + text!.slice(start + from.length) };
}
