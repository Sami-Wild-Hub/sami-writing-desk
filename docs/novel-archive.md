# 小离总周报 · 私人小说阅读

首页 `/` 按 `src/config/books.ts` 的 `novelBooks` 每本小说一张卡片（标题是可公开的书名），打开 `/book/?book=<slug>`，页面标题即书名。书页使用 `FirebaseHouseholdSession`（`src/lib/householdSession.ts`）：与 FamilyHub 同一个 Firebase 项目、同一个 household，Google 登录、成员校验和报名关闭时的 `accessRequests` 流程都相同；两站同在 `samidore.github.io`，Firebase app 名也相同，所以共用同一份浏览器登录状态。

## 视图与地址

地址是唯一的视图状态（`src/lib/novelArchiveRoute.ts`）：`?book=<slug>&view=<view>&doc=<path>#<hash>`。`view` 现有 `reader`（默认，地址里省略）与 `timeline`；以后的视图（tab）加进 `novelViews` 即可。用户切书、切视图、点链接都写入地址（pushState）；浏览器前进后退只按地址重绘，不再写历史。

- **阅读器**：编译页、目录与检索。
- **时间线**：`src/lib/novelTimeline.ts` + `src/lib/novelTimelineModel.ts` + `src/styles/novelTimeline.css`。Event 标题跳到阅读器的 `events/E-xxxx.md`，出处 `C#P#` 跳到 `source/C#.md#p#`，线路名跳到该 Owner 的时间索引页。时间线数据是 `books/<slug>/timeline`，由 Novel 仓库 `site/sync_familyhub.py` 写成**一个 JSON 字符串**（RTDB 会丢掉空列表与空对象），页面登录后读取并 `JSON.parse`。

## 权威与数据流

- **唯一内容来源**：私有 `leahthemule/novel-knowledge-base` 仓库的正式 `novels/<slug>/kb/`、正文以及由既有 publish 流程生成的 `compiled/`。
- **只读镜像**：在上述私有仓库运行 `site/sync_familyhub.py`，把 `compiled/` 的 Markdown 转为经过清理的 HTML，写到 Firebase Realtime Database 的 `households/<householdId>/novelArchive`。
- **访问权限**：规则在 FamilyHub 仓库的 `database.rules.json`（`novelArchive`：Google 身份、已验证邮箱、家庭成员邮箱匹配，只读），由 FamilyHub 的部署流程部署；本仓库不部署规则。
- **页面**：`src/lib/novelArchiveUi.ts` 在权限为 `connected` 后才读取 `catalog`、目标小说的 `manifest`，以及所需页面；检索时单独读取 `search`。读取失败时不给出公开数据回退。退出或撤销权限时清空已有阅读视图。
- **导航**：保留每个编译 Event 的独立页面、Owner 的 K/AN 页面、世界、伏笔、章节 `C#P#` 原文定位。所有点击停留在本站内。
- **隐私**：GitHub Pages 输出只包含登录和阅读器壳。小说正文、KB 内容、检索索引都不进入公开 repo 或静态 HTML。

## 验证

`pnpm run verify`：`astro check`、构建、单元测试、Playwright。

- `tests/privacy.test.mjs` 扫描 `dist`，确保没有 Event ID、`C#P#` 或 Owner ID 进入公开构建；部署流程在生产构建后再跑一次。
- `tests/book-views.spec.ts` 用 Playwright 在浏览器里模拟一个已登录用户与 RTDB（不需要 emulator 或真实凭证），覆盖未登录不读取、直达链接与刷新、视图与书之间的前进后退。`playwright.config.ts` 用 stub Firebase 配置另建一份 `dist-stub` 来跑，不影响 `dist`。
- 另设 `NOVEL_SHOTS_DIR=<目录>` 会输出手机与桌面截图；设 `NOVEL_STUB_DB=<json>` 可以用一份完整私人数据（`{manifest,pages,search,timeline}`）代替合成数据。这份 JSON 不得提交。
