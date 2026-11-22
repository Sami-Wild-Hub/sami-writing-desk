# Sami Writing Desk

私人写作台，现有「小离总周报」：每本小说一个书页（阅读器、时间线、检索），只对 FamilyHub 家庭成员开放。线上地址：<https://sami-wild-hub.github.io/sami-writing-desk/>。

- **数据**：小说内容来自私有 novel-knowledge-base 仓库的同步 Action，写入 Firebase Realtime Database（与 FamilyHub 同一项目、同一 household）。本仓库不含任何小说内容。
- **权限**：登录用 FamilyHub 的同一套 Google 登录与家庭成员校验。数据库规则在 FamilyHub 仓库的 `database.rules.json`，由 FamilyHub 部署；本仓库不部署规则。
- **说明**：[`docs/novel-archive.md`](docs/novel-archive.md)。

## 本地开发

需要 Node.js 24 与 pnpm。

```bash
pnpm install
pnpm exec playwright install chromium   # 新机器上一次
pnpm run dev
pnpm run verify
```

## 部署

推送 `main`：GitHub Actions 跑 `pnpm run verify`，用仓库 Actions variables（`PUBLIC_FIREBASE_*`、`PUBLIC_FAMILY_HOUSEHOLD_ID`）构建生产版本并部署到 GitHub Pages。
