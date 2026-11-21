# 校稿台

书页的第三个视图（`?book=<slug>&view=proof`）。把新稿交给 ChatGPT，让它对照 Novel Archivist 的资料库（私有仓库 `leahthemule/novel-knowledge-base` 的 `novels/<slug>/`）只找矛盾，再把回复贴回来逐条看。

## 用法

1. 「＋ 新校稿」：写标题（如「C23 初稿」），贴入新稿或上传 `.txt` / `.md`，点「生成校稿任务」。这一步就存进历史。
2. 「复制任务」，到 ChatGPT（要能通过 GitHub 读这个仓库）粘贴发送。
3. 把 ChatGPT 的回复整段贴回「贴回 ChatGPT 的回复」，点「读取报告」。左边是分段编号的原文、引文标黄，右边每条反馈对齐它的段落；手机上反馈列在上面，点一条跳到原文。

同一份稿可以贴多次回复（比如让 ChatGPT 重查一遍），每次都留着，用「第 1 次 / 第 2 次」切换。历史在左栏（手机点「历史」），最新的在上，可以打开、删除（删除前确认）。

## 分段

每个非空行算一段，空行只是分隔，`#` 开头的 Markdown 标题行不编号。这和 KB 的 `source-views/C#.md` 编号一致（原稿每段一行、段间没有空行），所以新稿的 `P#` 和旧章的 `C#P#` 是同一种数法。

## 回复的读法

- 回复里带代码块、前后有别的话都可以：取第一个能解析的 `{…}`。
- 读不出来（没有 JSON、JSON 有错、被截断、没有 `items` 列表）时照样存下原文，并写明哪里不对；可以让 ChatGPT 按格式重发，再贴一次。
- 某一条缺字段或值不对（如 `level` 不是 冲突/存疑/提示），这一条照样列出并注明格式问题。
- 引文在它那一段里找不到（空白差异不算），这一条照样显示，标「未对上原文」；段号不在这份稿里的放在最后。

## 存储

Firebase Realtime Database（与小说镜像同一个家庭）：

```
households/<householdId>/proofdesk/<slug>/<id>
  { id, title, createdAt, updatedAt, draft, task,
    reports?: { <reportId>: { id, createdAt, report, parsed? } } }
```

- `id` 形如 `20261121-153012-1a2b`（UTC 时间 + 4 位随机），既是键也按时间排。
- 生成任务时写整条记录；每贴一次回复在 `reports` 下加一条，同时更新 `updatedAt`，不覆盖旧的。
- `report` 是贴回的原文，`parsed` 是读出的结果（JSON 字符串，RTDB 会丢空列表；读不出来时没有这一项）。页面显示时以原文为准重新读一遍。
- 读写权限只给家庭成员（规则在 FamilyHub 的 `database.rules.json`，与 `notebook` 同一套成员校验）；浏览器不另存副本。
- 每日备份：`sami-writing-desk-data` 仓库的 GitHub Actions 把每个家庭的 `proofdesk` 导出为 `proofdesk/<householdId>/<slug>/<id>.json`，有变化才提交。

## 任务全文

任务文字在 `src/lib/views/proof/task.ts`，下面是它对 `maritime-story`、标题「C23 初稿」、两段占位新稿生成的全文（`tests/proof.test.mjs` 会检查这里和代码一致；改了模板要同步改这里）：

```text
请帮我校一份小说新稿：只找它和已写内容、已有设定的矛盾。

资料在 GitHub 仓库 leahthemule/novel-knowledge-base（main 分支）的 novels/maritime-story/。
- 读法先看同仓库 contracts/shared/kb-use/overview.md（同目录还有时间、原文等细则）。
- 从 novels/maritime-story/kb/INDEX.md 出发，只走它列出的入口；一次核一件事，只打开和疑点有关的文件，不要通读整个仓库或整个 KB。
- 时代考据查 novels/maritime-story/reference/era-research.md 列出的 R 研究卡。
- 要核旧章原文，按出处打开 novels/maritime-story/source-views/ 里那一章的相关段落。
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
{"title": "C23 初稿", "items": [{"para": "P12", "quote": "…", "kind": "人物", "level": "冲突", "issue": "…", "evidence": ["…"], "suggestion": "…"}], "summary": "…"}
- para：段号
- quote：该段里的一小段原文，逐字照抄
- kind：时间线 / 人物 / 知情 / 地点 / 物品 / 时代 / 情节 / 其他
- level：冲突（确定矛盾）/ 存疑（可能矛盾，证据不够）/ 提示（值得留意）
- issue：问题，一两句
- evidence：依据，写 KB 条目编号或原文位置，如事件 E-编号、R 研究卡编号、原文 C章#P段
- suggestion：改法，可不写
- summary：总的一两句，可不写
items 按正文顺序排；没有问题就回 "items": []。

标题：C23 初稿

新稿：
[P1] （新稿第一段）
[P2] （新稿第二段）
```

依据的例子写成「E-编号」「C章#P段」而不是具体编号，是因为任务文字会进公开的页面脚本，而 `tests/privacy.test.mjs` 不许公开构建里出现真实格式的 Event ID 和 `C#P#`。

## 代码

- `src/lib/views/proof/`：`proofView.ts`（视图）、`task.ts`（任务模板）、`paragraphs.ts`（分段、找引文）、`report.ts`（读回复、对齐段落）、`render.ts`（HTML）、`store.ts`（读写 RTDB）。
- `src/styles/proof.css`。
- 测试：`tests/proof.test.mjs`（分段、任务、回复的各种情况、本页任务全文），`tests/proof.spec.ts`（贴稿 → 生成 → 复制 → 贴回复 → 逐条看 → 刷新后从历史打开 → 删除；手机上点一条跳到原文；设 `NOVEL_SHOTS_DIR` 时出 390 / 2560 截图）。
