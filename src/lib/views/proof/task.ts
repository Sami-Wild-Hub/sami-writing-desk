// The two proofreading tasks the host watcher sends out (via cli.ts): ① manuscript, a
// local Luna agent comparing the draft with the book's manuscript in the KB repo; ② open,
// a ChatGPT chat reading the book's KB. Both reply in the same JSON item format, then the
// numbered draft follows. docs/proofdesk.md shows both verbatim.
import type { Para } from './paragraphs.ts';

export const KINDS = ['时间线', '人物', '知情', '地点', '物品', '时代', '情节', '其他'] as const;
export const LEVELS = ['冲突', '存疑', '提示'] as const;
export const CHECKS = ['manuscript', 'open'] as const;
export type Check = (typeof CHECKS)[number];

interface TaskInput { slug: string; title: string; paras: Para[] }

const kinds = `只查这几类矛盾：
- 时间线与先后
- 人物：身份、称呼、外貌、关系
- 知情：谁在这时知道什么
- 地点与地理
- 物品归属
- 时代考据
- 与前文情节冲突`;

const format = (title: string, evidence: string) =>
  `{"title": ${JSON.stringify(title)}, "items": [{"para": "P12", "quote": "…", "kind": "人物", "level": "冲突", "issue": "…", "evidence": ["…"], "suggestion": "…"}], "summary": "…"}
- para：段号
- quote：该段里的一小段原文，逐字照抄
- kind：${KINDS.join(' / ')}
- level：冲突（确定矛盾）/ 存疑（可能矛盾，证据不够）/ 提示（值得留意）
- issue：问题，一两句
- evidence：${evidence}
- suggestion：改法，可不写
- summary：总的一两句，可不写
items 按正文顺序排；没有问题就回 "items": []。`;

const tail = (title: string, paras: Para[]) => `标题：${title}

新稿：
${paras.map((p) => `[${p.label}] ${p.text}`).join('\n')}
`;

/** ② The open check: ChatGPT reads the book's KB on GitHub. */
export function openTask({ slug, title, paras }: TaskInput) {
  const book = `novels/${slug}`;
  return `请帮我校一份小说新稿：只找它和已写内容、已有设定的矛盾。

资料在 GitHub 仓库 leahthemule/novel-knowledge-base（main 分支）的 ${book}/。
- 读法先看同仓库 contracts/shared/kb-use/overview.md（同目录还有时间、原文等细则）。
- 从 ${book}/kb/INDEX.md 出发，只走它列出的入口；一次核一件事，只打开和疑点有关的文件，不要通读整个仓库或整个 KB。
- 时代考据查 ${book}/reference/era-research.md 列出的 R 研究卡。
- 要核旧章原文，按出处打开 ${book}/source-views/ 里那一章的相关段落。
- INDEX.md 开头写了 KB 已处理到哪一章；如果这份新稿之前还有没进 KB 的章节，先按顺序读完那几章原文。

${kinds}

不查语病、文风、修辞。新稿里新出现、资料里没有的内容不算错，只有明显和已有事实冲突时才报。

新稿已分段编号（P1、P2……），在最后。

只回一个 JSON，放在一个代码块里，代码块外不要写别的。格式：
${format(title, '依据，写 KB 条目编号或原文位置，如事件 E-编号、R 研究卡编号、原文 C章#P段')}

${tail(title, paras)}`;
}

/** ① The manuscript check: an agent in a read-only checkout of the KB repo reads the chapters. */
export function manuscriptTask({ slug, title, paras }: TaskInput) {
  const dir = `novels/${slug}/manuscript/`;
  return `请帮我校一份小说新稿：只拿它和已写的正文对照，找矛盾。

正文在 leahthemule/novel-knowledge-base（main 分支）的 ${dir}，每章一个文件（如 Act 1/第1章.md）：首行是章名，之后每段一行，从 P1 数起。只读这个目录，不改、不提交任何文件。
- 先按新稿的章名找这一章的旧版本；有的话逐段对照，看改动有没有和别处正文冲突。
- 再按需要读这一章之前的各章，核对人物、时间、地点、物品、谁知道什么。一次核一件事，只打开有关的章节，不要逐字通读全部正文。

${kinds}

不查语病、文风、修辞。新稿里新出现、前文没有的内容不算错；和旧版本不同本身也不算错，只有明显和已写正文冲突时才报。

新稿已分段编号（P1、P2……），在最后。

结果是一个 JSON，格式：
${format(title, '依据，写原文位置，如 C章#P段，可加一句原文')}

${tail(title, paras)}`;
}

export const TASKS: Record<Check, (input: TaskInput) => string> = { manuscript: manuscriptTask, open: openTask };
