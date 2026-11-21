# 校稿台

书页的第三个视图（`?book=<slug>&view=proof`）。交一份新稿，后台自动做两项只找矛盾的校验，结果回到网站，逐条显示在原文旁边。不用复制粘贴。

- **① 对照正文**：本机的 Luna（`delegate.py --agent luna-medium`）在 Novel Archivist 仓库（`leahthemule/novel-knowledge-base`）的只读副本里，拿新稿和 `novels/<slug>/manuscript/` 的已写各章对照。
- **② 开放式**：在 ChatGPT 项目（默认「Novel Archivist 维护」）里新开一个对话，读同一仓库的 `novels/<slug>/` 资料库。

两项都只查设定、时间线、人物、知情、地点、物品、时代、前文情节的矛盾，不查语病和文风；回复用同一种 JSON 格式。

## 用法

1. 「＋ 新校稿」：写标题（如「C23 初稿」），然后二选一：
   - 「贴入或上传」：贴入新稿，或上传 `.txt` / `.md`；
   - 「从 Drive 取」：写章节名或文件名（如「第22章」），后台让 ChatGPT 用 Google Drive 找到这一章取回来。
2. 点「发送校稿」。记录马上存进历史，页面跟着显示进度：排队 → 发送中 → 已发送（附对话链接或 Luna 任务号）→ 完成 / 失败（写明原因）。
3. 结果回来就自动显示：左边是分段编号的原文、引文标黄，右边每条反馈对齐它的段落，标 ①/②，可按来源筛选；手机上反馈列在上面，点一条跳到原文。

一项失败可以单独「重新发送」，也可以「全部重新发送」；每次发送的报告都留着，用「第 1 次 / 第 2 次」切换，新的不覆盖旧的。历史在左栏（手机点「历史」），最新的在上。排队中或已结束的记录可以删除（删除前确认；data 仓库里的文件不删）。

## 分段

每个非空行算一段，空行只是分隔，`#` 开头的 Markdown 标题行不编号。这和 KB 的 `source-views/C#.md`、`manuscript/` 各章的编号一致（每段一行、段间没有空行），所以新稿的 `P#` 和旧章的 `C#P#` 是同一种数法。

## 回复的读法

- 回复里带代码块、前后有别的话都可以：取第一个能解析的 `{…}`。
- 读不出来（没有 JSON、JSON 有错、被截断、没有 `items` 列表）时照样存下原文，并写明哪里不对；可以重新发送这一项。
- 某一条缺字段或值不对（如 `level` 不是 冲突/存疑/提示），这一条照样列出并注明格式问题。
- 引文在它那一段里找不到（空白差异不算），这一条照样显示，标「未对上原文」；段号不在这份稿里的放在最后。

网页和后台用的是同一套规则：后台通过 `src/lib/views/proof/cli.ts` 调用这里的 `report.ts`。

## 存储

**网站读写的** Firebase Realtime Database（与小说镜像同一个家庭）：

```
households/<householdId>/proofdesk/<slug>/<id>
  { id, title, createdAt, updatedAt, source: "paste" | "drive", draft?, driveName?,
    status: queued | sending | sent | done | failed, error?,
    fetch?: Step,                                   // 只有 Drive 来源
    checks: { manuscript: Step, open: Step },
    reports?: { "<check>-<n>": { id, check, attempt, createdAt, report, parsed?, path } } }
Step = { status, attempt?, chat?, job?, error?, at? }
```

- `id` 形如 `20261121-153012-1a2b`（UTC 时间 + 4 位随机），既是键也按时间排。
- 网页只写两种东西：新请求（两项都是 `queued`），和重新发送（把整条或某一项的 `status` 改回 `queued`）。其余字段都由后台用服务账号写；数据库规则（FamilyHub 的 `database.rules.json`）不许成员写 `sending` 以后的状态、`fetch`、`error`、`reports`，也不许改已存的新稿。
- `report` 是收到的回复原文，`parsed` 是读出的结果（JSON 字符串；读不出来时没有）。页面显示时以原文为准重新读一遍。

**后台留档的** 私有仓库 `samidore/sami-writing-desk-data` 的 `proofdesk/<slug>/<id>/`：

| 文件 | 内容 |
| --- | --- |
| `draft.md` | 新稿（贴入的，或 ChatGPT 从 Drive 取回推上来的） |
| `task-open.md`、`task-manuscript.md` | 两项的任务全文（下面的模板） |
| `report-open-<n>.json`、`report-manuscript-<n>.json` | 第 n 次发送收到的回复原文 |
| `fetch-error-<n>.md` | Drive 上没找到时 ChatGPT 写的原因 |

## 后台

`samidore/Protocols` 的 `proofdesk/watch.py`（像 Runner 一样由计划任务启动，用法见那里的 `proofdesk/README.md`）。每隔几秒查一次 `status` 为 `queued`/`sending`/`sent` 的记录：

1. 先把记录标成 `sending`，这样同一请求不会被取两次。
2. Drive 来源先开一个 ChatGPT 对话取稿，取到后把 `draft` 写回数据库。
3. 两项并行发送，各自记 `checks.<check>`（对话链接或 Luna 任务号）；同时最多一个 ChatGPT 对话、一个 Luna 在跑。
4. 等报告出现在 data 仓库（默认最多 60 分钟），用和网页相同的规则读，把原文和读出的结果写进 `reports`。
5. 两项都结束：都完成为 `done`；有一项失败为 `failed`，`error` 写明是哪一项、为什么。

后台重启后从数据库的状态接着做，不会重复发送。

## 任务全文

任务文字在 `src/lib/views/proof/task.ts`，下面是它对 `maritime-story`、标题「C23 初稿」、两段占位新稿生成的全文（`tests/proof.test.mjs` 会检查这里和代码一致；改了模板要同步改这里）。后台把它存成 data 仓库里的 `task-*.md`，ChatGPT 收到的消息只是一句「读这个文件，按它做，把 JSON 推到某路径」。

### ② 开放式

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

### ① 对照正文

```text
请帮我校一份小说新稿：只拿它和已写的正文对照，找矛盾。

正文在 leahthemule/novel-knowledge-base（main 分支）的 novels/maritime-story/manuscript/，每章一个文件（如 Act 1/第1章.md）：首行是章名，之后每段一行，从 P1 数起。只读这个目录，不改、不提交任何文件。
- 先按新稿的章名找这一章的旧版本；有的话逐段对照，看改动有没有和别处正文冲突。
- 再按需要读这一章之前的各章，核对人物、时间、地点、物品、谁知道什么。一次核一件事，只打开有关的章节，不要逐字通读全部正文。

只查这几类矛盾：
- 时间线与先后
- 人物：身份、称呼、外貌、关系
- 知情：谁在这时知道什么
- 地点与地理
- 物品归属
- 时代考据
- 与前文情节冲突

不查语病、文风、修辞。新稿里新出现、前文没有的内容不算错；和旧版本不同本身也不算错，只有明显和已写正文冲突时才报。

新稿已分段编号（P1、P2……），在最后。

结果是一个 JSON，格式：
{"title": "C23 初稿", "items": [{"para": "P12", "quote": "…", "kind": "人物", "level": "冲突", "issue": "…", "evidence": ["…"], "suggestion": "…"}], "summary": "…"}
- para：段号
- quote：该段里的一小段原文，逐字照抄
- kind：时间线 / 人物 / 知情 / 地点 / 物品 / 时代 / 情节 / 其他
- level：冲突（确定矛盾）/ 存疑（可能矛盾，证据不够）/ 提示（值得留意）
- issue：问题，一两句
- evidence：依据，写原文位置，如 C章#P段，可加一句原文
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

- `src/lib/views/proof/`：`proofView.ts`（视图）、`task.ts`（两份任务模板）、`paragraphs.ts`（分段、找引文）、`report.ts`（读回复、对齐段落）、`render.ts`（HTML）、`store.ts`（读写 RTDB）、`cli.ts`（后台调用模板和读回复的入口）。
- `src/styles/proof.css`。
- 测试：`tests/proof.test.mjs`（分段、两份任务、cli、回复的各种情况、新请求的形状、本页任务全文），`tests/proof.spec.ts`（贴稿发送 → 排队 → 已发送带链接 → 两项报告逐条显示、筛选 → 一项失败、单独重发、多次报告切换 → Drive 来源取稿 → 手机上点一条跳到原文 → 删除；后台的写入在测试里模拟；设 `NOVEL_SHOTS_DIR` 时出 390 / 2560 截图）。
