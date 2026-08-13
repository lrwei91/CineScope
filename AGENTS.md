# CineScope Agent Guide

## 项目目标

CineScope 是原生 ES Modules 驱动的静态影视片单，业务数据由脚本生成 JSON，并通过 GitHub Pages 发布。所有改动应优先保证数据可靠、静态构建可复现、核心浏览链路可用，同时只做完成当前需求所需的最小改动。

## 成功标准

- 问题在真实源头修复，而不是只修生成结果或表面样式。
- 分类 ID、Hash URL、JSON 结构和现有业务能力保持兼容，除非用户明确要求迁移。
- 相关自动检查通过；涉及页面输出时 `.site/` 可完整构建。
- 最终说明改了什么、验证了什么、未验证什么以及剩余风险。

## 架构与边界

- 保持静态前端、原生 JavaScript、生成 JSON 和 GitHub Pages 架构，不擅自引入框架、后端或运行时依赖。
- 前端入口为 `index.html`、`app.js`、`style.css`、`share.js` 和 `share.css`；功能模块位于 `js/modules/`。
- 页面数据位于 `json/`，海报位于 `posters/`，生成插画位于 `assets/`。
- `.site/` 是 `scripts/build-site.mjs` 生成的 Pages 白名单产物，不直接编辑、不作为源文件修复目标。
- 保留分类切换、搜索、评分与类型筛选、渐进加载、年份定位、详情抽屉、预告片、分享、豆瓣状态和移动筛选能力。

## 视觉与交互基线

- 以 `docs/DESIGN_BRIEF.md` 为当前视觉真源：片单优先、固定浅色、白纸黑墨和荧光黄，不恢复欢迎页式全屏 Hero、深色模式或主题切换。
- 目录题头保持紧凑，分类和首批片单应尽快进入视野；插画是次级信息，不与数据和海报争抢加载优先级。
- 响应式卡片列数保持：小于 360px 单列、360px 至 760px 双列、大于 760px 三列。
- HTML 默认内容可见，JavaScript 只增强动效；`prefers-reduced-motion` 下直接显示最终状态。
- 触屏交互不能依赖 hover；键盘焦点、焦点恢复、Escape 关闭和弹层焦点循环必须保留。
- 修改 CSS 或带查询参数的 ES Module 后，同步更新入口中的缓存版本，避免 Pages 使用旧资源。

## 数据更新协议

- `scripts/automation/run_update.py` 是唯一标准数据更新入口。它负责临时目录生成、进程锁、数据校验和原子提升。
- 不在可由标准任务安全生成时手改 `json/`。窄范围元数据修复也必须同步相关数量、报告字段并通过数据门禁。
- 修改数据前先检查生成器、目标 JSON、`json/build_report.json` 和 `scripts/validate-data.mjs`。
- 使用最小任务：`full`、`tv-status`、`douban-cache` 或 `trailers`；评估更新时优先使用 `--dry-run`。
- 超过 20% 的预期数据缩减只有在确认上游和业务意图后才可使用 `--allow-large-drop`。
- `--publish` 会提交并推送，只有用户明确要求发布时才可使用，且任务开始前工作区必须干净。

## 技能路由

技能用于补充专业工作流，不能替代本仓库的架构约束、验证命令或用户授权。开始任务时只选择与需求直接相关的最小技能集；技能不可用时使用等价工具继续，不为普通任务擅自安装插件或技能。

| 功能或任务 | 优先技能 | 使用边界 |
| --- | --- | --- |
| 页面布局、卡片、筛选区、详情与分享界面重构 | `design-taste-frontend` | 先读取 `docs/DESIGN_BRIEF.md`，保持片单优先和现有原生架构 |
| 滚动、指针、入场和交互动效 | `oil-motion` | 仅在动效是明确需求时使用；必须保留减弱动效、触屏和性能降级 |
| 生成或编辑插画、位图视觉资产 | `imagegen` | 复用现有资产优先；生成结果写入 `assets/` 并检查透明边缘、尺寸和 Pages 白名单 |
| 本地页面、响应式和交互回归 | `vercel:agent-browser`、`vercel:agent-browser-verify` | 启动本地静态服务后执行；检查控制台、关键流程和视口矩阵，完成后关闭浏览器与服务 |
| 提交并推送已完成的本地改动 | `github:yeet` | 仅在用户明确要求提交或推送时使用；先确认范围和验证结果，不扩大发布范围 |
| 排查 GitHub Actions 或 PR 检查失败 | `github:gh-fix-ci` | 先读取真实失败日志，区分 CI、每日更新和 Pages 部署，不凭本地通过推断远端已修复 |
| 处理 PR 审查意见 | `github:gh-address-comments` | 仅处理用户指定或仍未解决的可执行意见，修改后按影响范围回归 |

数据生成、状态同步、预告片和豆瓣缓存任务不依赖通用技能，始终以 `scripts/automation/run_update.py`、项目测试和数据门禁为权威入口。

## Git 与外部副作用

- 开始工作先运行 `git status --short --branch`，保护所有已有改动，不回滚、不覆盖、不顺手整理无关文件。
- 工作区干净时，更新主分支使用 `git pull --ff-only origin main`。
- 默认不提交、不推送、不部署、不触发工作流。用户明确要求后才执行，并只暂存本次范围内的文件。
- 禁止 force push、重写历史和破坏性重置。远端阻止推送时先 fetch，检查分歧，再保留更新的规范数据。
- Pages 链路保持单一：`daily-update.yml` 推送后调用可复用的 `deploy-pages.yml`；不要增加第二个 `workflow_run` 或重复部署触发器。
- 不把密码、Token、Cookie、API Key 或可滥用凭据写入仓库、日志或文档。

## 验证规则

- 代码或数据改动：运行 `npm run check`。
- 页面、样式、静态资源、构建脚本或工作流改动：额外运行 `npm run build:site`。
- 自动化改动：先运行最小相关任务的 staged `--dry-run`，再考虑更宽范围执行。
- 视觉改动：至少检查 320、390、768、1024、1440px，无横向溢出，并核对卡片列数、分类可达性、移动筛选和固定浅色。
- 交互改动：按影响范围回归分类、筛选、渐进加载、详情、预告片、分享、焦点管理和 Hash 地址。
- 动效改动：验证触屏、减弱动效和页面初始可见性；避免持续离屏动画和重复全局 scroll 监听。
- 工作流改动：除本地检查外验证 YAML 可解析；本地通过不能替代远端 Actions 结果。
- 文档或 agent 合约改动：至少运行 `git diff --check` 并核对所有路径、命令和行为仍真实存在。

## 停止条件

遇到以下情况应停止并请求方向：

- 需要凭据、生产发布或用户未授权的外部写入。
- 需要不可逆的数据选择、历史重写或明显扩大需求范围。
- 工作区存在与当前任务重叠且无法安全保留的未知改动。
- 远端生成数据已使本地修复过时，且规范版本无法从现场判断。

## 参考入口

- 项目与运行说明：`README.md`
- 当前视觉规范：`docs/DESIGN_BRIEF.md`
- 数据运维手册：`docs/DATA_UPDATE_GUIDE.md`
- 项目速记与任务边界：`CONTEXT.md`
- 数据统一入口：`scripts/automation/run_update.py`
- 目录生成器：`scripts/generate_douban_catalog.mjs`
- 数据门禁：`scripts/validate-data.mjs`
- Pages 构建：`scripts/build-site.mjs`
- CI 与发布：`.github/workflows/`
