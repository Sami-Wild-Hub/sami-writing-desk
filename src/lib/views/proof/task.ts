// MC triggers for the host watcher (via cli.ts); docs/proofdesk.md shows both verbatim.
import type { Para } from './paragraphs.ts';

export const KINDS = ['文字', '连续性', '人物', '世界设定', '推演', '资料补充'] as const;
export const LEVELS = ['冲突', '存疑', '提示'] as const;
export const CHECKS = ['manuscript', 'open'] as const;
export type Check = (typeof CHECKS)[number];

interface TaskInput { slug: string; title: string; paras: Para[]; skipProse?: boolean }

const trigger = '请按 leahthemule/novel-knowledge-base（main 分支）的 contracts/shared/kb-use/manuscript-check.md 入口及 contracts/manuscript-check/semantic.md 核心合同执行 Manuscript Check（MC）。';

const format = (title: string) => `回复格式覆盖：用以下 JSON 代替 report.md，只回一个 JSON 代码块，代码块外不要写别的。
{"title": ${JSON.stringify(title)}, "items": [{"para": "P12", "quote": "…", "kind": "人物", "issue": "…", "evidence": ["…"], "suggestion": "…"}], "summary": "…"}
- para：位置，用新稿段号
- quote：MC 要求的完整原句，逐字照抄
- kind：MC 的一个主 Tag，${KINDS.join(' / ')}
- issue：内容与关键依据
- evidence：证据及出处，写相关原文位置、Event/K/AN、R-ID 或外部资料出处
- suggestion：合同要求的最小修正或简短建议，可不写
- level：可选，冲突 / 存疑 / 提示；MC 不要求区分确定程度，可省略
- summary：注明受检范围、正文版本、所用历史 KB 及尚未完成的核查
items 按受检原文顺序排列；没有报告项就回 "items": []。`;

const tail = ({ title, paras, skipProse }: TaskInput) => `标题：${title}

新稿：
${paras.map((p) => `[${p.label}] ${p.text}`).join('\n')}
${skipProse ? '\n本次跳过 Tag `文字`（字词、语法、标点校勘），其他按合同执行。\n' : ''}`;

/** ② ChatGPT runs MC using the historical KB. */
export function openTask(input: TaskInput) {
  return `${trigger}

小说目录：leahthemule/novel-knowledge-base（main 分支）的 novels/${input.slug}/。
Seed：novels/${input.slug}/seeds/。
历史 KB：novels/${input.slug}/kb/。
受检范围仅为本份新稿，版本以文末标题和分段编号（P1、P2……）的正文为准。

${format(input.title)}

${tail(input)}`;
}

/** ① Luna runs MC using written chapters as history, without reading the KB. */
export function manuscriptTask(input: TaskInput) {
  return `${trigger}

小说目录：leahthemule/novel-knowledge-base（main 分支）的 novels/${input.slug}/。
Seed：novels/${input.slug}/seeds/。
历史 KB：不使用，以已写正文为历史；不读 novels/${input.slug}/kb/。
已写正文：novels/${input.slug}/manuscript/，每章一个文件，首行是章名，之后每个非空正文行从 P1 数起，标题行不编号。
先按新稿的章名找这一章的旧版本；有的话逐段对照，看改动有没有和别处正文冲突。
受检范围仅为本份新稿，版本以文末标题和分段编号（P1、P2……）的正文为准。

${format(input.title)}

${tail(input)}`;
}

export const TASKS: Record<Check, (input: TaskInput) => string> = { manuscript: manuscriptTask, open: openTask };
