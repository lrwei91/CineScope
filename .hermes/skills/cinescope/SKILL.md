---
name: cinescope
description: 用于维护 CineScope 的静态影视片单、JSON 数据同步、豆瓣缓存、预告片任务或 Vercel 静态构建时
version: 1.0.0
author: lrwei91
license: MIT
metadata:
  hermes:
    tags: [cinescope, static-site, media-data, vercel]
---

# CineScope

原生 ES Modules 静态影视片单与可复现数据更新工作流。

## 边界

- 业务源代码、生成 JSON、海报和静态部署产物必须保持可追溯。
- 数据更新统一从 `scripts/automation/run_update.py` 进入，不绕过数据门禁。
- 保持无后端、原生 JavaScript、生成 JSON 和 Vercel 静态部署架构。
- `.site/` 是构建产物，只能通过 `scripts/build-site.mjs` 生成，不能直接修复。
- 默认只做本地修改和验证；提交、推送、发布或带 `--publish` 的任务必须由用户明确授权。

## 核心结构

| 区域 | 真正入口 | 约束 |
|---|---|---|
| 前端 | `index.html`、`app.js`、`js/modules/`、`share.js` | 保留分类、Hash URL、搜索、筛选、详情、预告片和分享契约 |
| 数据 | `json/`、`posters/`、`assets/` | 优先由生成器更新；检查 ID、结构、数量和资源路径 |
| 自动化 | `scripts/automation/run_update.py` | `full`、`tv-status`、`douban-cache`、`trailers` 的唯一标准入口 |
| 门禁 | `scripts/validate-data.mjs`、`npm run check` | 生成结果提升前必须通过 |
| 发布构建 | `scripts/build-site.mjs`、`.github/workflows/` | Vercel 只发布白名单静态产物 |

## 使用

```bash
# 开始前保护已有改动
git status --short --branch

# 评估数据变化，不提升正式 JSON
python3 scripts/automation/run_update.py --task douban-cache --dry-run

# 本地更新：按需求选择最小任务
python3 scripts/automation/run_update.py --task trailers

# 代码和数据门禁
npm run check

# 生成 Vercel 静态目录
npm run build:site
```

`--publish` 会提交并推送，只有用户明确要求发布时才使用；预期数据缩减超过 20% 时，先确认上游和业务意图，再显式使用 `--allow-large-drop`。

## 当前 5 大坑

### 1. 直接编辑 `.site/`

**触发**：线上页面看起来不对，直接改 `.site/`。**表现**：下一次构建覆盖修复。**修法**：回到源代码、生成器或数据源，最后重新执行 `npm run build:site`。

### 2. 手改生成 JSON

**触发**：想快速修一条片目或状态。**表现**：build report、latest/complete 或数量门禁漂移。**修法**：先定位生成器；确需窄范围修复时同步报告字段并运行 `npm run check`。

### 3. 把局部任务当全量任务

**触发**：只需状态或预告片更新却运行 `full`。**表现**：无关分类被重建，diff 和失败面扩大。**修法**：先用 `--dry-run`，只选完成需求所需的 task。

### 4. 资源缓存版本未同步

**触发**：修改 CSS 或带查询参数的 ES Module。**表现**：本地正常、线上继续使用旧资源。**修法**：同步入口缓存版本，再构建并检查发布白名单。

### 5. 把本地通过当远端发布成功

**触发**：`npm run check` 通过就声称线上已更新。**表现**：没有远端 Actions/Vercel 证据。**修法**：分开报告本地门禁、GitHub Actions 和 Vercel 状态，未经发布授权不做外部写入。

## 验证清单

- [ ] `git status` 中原有改动未被覆盖或混入。
- [ ] 数据任务使用 `--dry-run` 或最小 task，未泄露登录态和密钥。
- [ ] `npm run check` 通过；涉及页面输出时 `npm run build:site` 通过。
- [ ] `git diff --check` 通过，`.site/` 没有被手工编辑。
- [ ] UI 改动至少检查片单首屏、分类切换、筛选、详情、分享和移动筛选。

## references/

本 skill 无 `references/` 目录；仓库内项目规则、`README.md` 和列出的脚本就是当前项目真源。
