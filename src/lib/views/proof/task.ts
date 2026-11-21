// The proofreading task the editor copies to ChatGPT: where the book's KB is, what to
// check, the reply format, then the numbered draft. docs/proofdesk.md shows it verbatim.
import type { Para } from './paragraphs.ts';

export const KINDS = ['时间线', '人物', '知情', '地点', '物品', '时代', '情节', '其他'] as const;
export const LEVELS = ['冲突', '存疑', '提示'] as const;

export function proofTask({ slug, title, paras }: { slug: string; title: string; paras: Para[] }) {
  const book = `novels/${slug}`;
  return `请帮我校一份小说新稿：只找它和已写内容、已有设定的矛盾。

资料在 GitHub 仓库 leahthemule/novel-knowledge-base（main 分支）的 ${book}/。
- 读法先看同仓库 contracts/shared/kb-use/overview.md（同目录还有时间、原文等细则）。
- 从 ${book}/kb/INDEX.md 出发，只走它列出的入口；一次核一件事，只打开和疑点有关的文件，不要通读整个仓库或整个 KB。
- 时代考据查 ${book}/reference/era-research.md 列出的 R 研究卡。
- 要核旧章原文，按出处打开 ${book}/source-views/ 里那一章的相关段落。
- INDEX.md 开头写了 KB 已处理到哪一章；如果这份新稿之前还有没进 KB 的章节，先按顺序读完那几章原文。

只查这几类矛盾：
- 时间线与先后
- 人物：身份、称呼、外貌、关系
- 知情：谁在这时知道什么
- 地点与地理
- 物品归属
- 时代考据
- 与前文情节冲突

不查语病、文风、修辞。新稿里新出现、资料里没有的内容不算错，只有明显和已有事实冲突时才报。

新稿已分段编号（P1、P2……），在最后。

只回一个 JSON，放在一个代码块里，代码块外不要写别的。格式：
{"title": ${JSON.stringify(title)}, "items": [{"para": "P12", "quote": "…", "kind": "人物", "level": "冲突", "issue": "…", "evidence": ["…"], "suggestion": "…"}], "summary": "…"}
- para：段号
- quote：该段里的一小段原文，逐字照抄
- kind：${KINDS.join(' / ')}
- level：冲突（确定矛盾）/ 存疑（可能矛盾，证据不够）/ 提示（值得留意）
- issue：问题，一两句
- evidence：依据，写 KB 条目编号或原文位置，如事件 E-编号、R 研究卡编号、原文 C章#P段
- suggestion：改法，可不写
- summary：总的一两句，可不写
items 按正文顺序排；没有问题就回 "items": []。

标题：${title}

新稿：
${paras.map((p) => `[${p.label}] ${p.text}`).join('\n')}
`;
}
