<p align="center">
  <img src="assets/icons/icon-any-192.png" width="72" alt="CineScope：黄色播放按钮与 C 形电影环">
</p>

<h1 align="center">CineScope</h1>

<p align="center">从近期新作到豆瓣 Top250，在一张片单里找下一部想看的影视。</p>

<p align="center">
  <a href="https://movie.lrwei91.cn/">在线浏览</a> ·
  <a href="#本地启动">本地启动</a> ·
  <a href="https://github.com/lrwei91/CineScope/issues">反馈建议</a>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="代码许可：MIT"></a>
</p>

![CineScope 本地桌面实景：分类导航、筛选条件与按月份排列的影视海报](docs/screenshots/discover.png)

CineScope（站内名称「鲤鱼环球片单」）是面向中文用户的静态影视目录，覆盖国产剧、院线电影、综艺、韩剧、日剧、美剧和豆瓣 Top250。界面采用白纸、黑墨和黄色强调，优先呈现真实海报与作品信息。

## 找片、了解、留存

- **找片**：选择分类，按名称、评分、类型、年份或形式筛选；可用条件随分类变化。
- **了解作品**：按时间浏览片单，打开详情查看简介、评分、连载状态与可用预告片；票房和剧集热度来自猫眼数据。
- **查看收藏**：关联已同步的豆瓣想看、在看、看过状态，手机「我的」页提供收藏列表与统计。
- **分享与安装**：生成作品分享图，也可添加到主屏或在支持的浏览器中安装为独立窗口应用。

手机以「发现、我的、关于、搜索」组织入口，详情采用全屏阅读布局；桌面保留分类导航、筛选与月份分组。上图来自本地页面，展示仓库内已有数据，不代表线上实时状态。

## 本地启动

只浏览已有片单，需要 Python 提供静态 HTTP 服务，无需 API Key、npm 安装或数据更新：

```bash
git clone https://github.com/lrwei91/CineScope.git
cd CineScope
python3 -m http.server 8000
```

打开 [localhost:8000](http://localhost:8000)。仓库已包含页面 JSON 与海报。

开发与数据维护另需 **Node.js 18+、Python 3.11+**（CI 使用 Node.js 22、Python 3.11），并安装 Python 依赖：

```bash
python3 -m pip install -r scripts/automation/requirements.txt
```

完整更新使用 `TMDB_API_KEY`；模板见 `.env.example`；runner 读取进程环境变量，不自动加载 `.env`，运行更新前需在本地安全配置并导出该变量。豆瓣缓存补充依赖真实浏览器登录态，部分任务还依赖本地网络环境，详见 [数据更新指南](docs/DATA_UPDATE_GUIDE.md)。

## 数据如何到达页面

项目使用原生 ES Modules，没有后端或运行时 npm 依赖。数据先生成、验证，再由静态页面读取：

```text
TMDB / 豆瓣 / 猫眼 / Bilibili
            ↓
scripts/automation/run_update.py
            ↓
临时目录生成 → 数据门禁 → 原子提升
            ↓
       json/ + posters/
            ↓
       静态页面 / Vercel
```

首屏优先加载当前分类的 `latest.json`，后台用 `complete.json` 补全；切换分类按需加载并缓存。豆瓣收藏状态并行请求，失败不会阻塞片单。院线电影优先使用完整数据。

数据依赖上游可用性与更新任务，评分、预告片或状态可能缺失。猫眼接口失败时，有效缓存会保留原更新时间并标记 `stale_upstream`；缓存不等于实时结果。

## 更新片单

所有数据更新使用统一入口，先试运行，再决定是否写入本地：

```bash
# 临时生成与验证，不提升到正式 JSON
python3 scripts/automation/run_update.py --task tv-status --dry-run

# 验证成功后更新本地 JSON，不提交、不推送
python3 scripts/automation/run_update.py --task tv-status
```

| 任务 | 更新内容 |
| --- | --- |
| `full` | 全分类、猫眼、豆瓣状态与 Top250 |
| `tv-status` | 国产剧集数与连载状态 |
| `douban-cache` | 通过浏览器登录态补充豆瓣详情缓存 |
| `trailers` | 国产影视 Bilibili 预告片 |

GitHub Actions 中的 `full` 配置为北京时间每日 22:00。需要本地登录态或网络环境的任务由 Hermes 调度；职责、调度约定与环境配置见 [数据更新指南](docs/DATA_UPDATE_GUIDE.md#2-任务职责)，本仓库维护业务逻辑和验证协议。

`--publish` 会提交并推送生成数据，使用前应确认发布意图。`full` 发布要求工作区干净；`tv-status`、`douban-cache`、`trailers` 可保留非发布路径编辑，但 `json/`、`posters/` 必须干净。远端同步不得覆盖本地改动。

任务通过进程锁防止本地并发，并校验结构、重复 ID、latest/complete 一致性、数量回退和海报路径。超过 20% 的数据缩减只有在确认上游与业务意图后才使用 `--allow-large-drop`。运行结果记录在 [`json/build_report.json`](json/build_report.json)；v2 报告保留分任务状态与最近完整构建结果，局部任务不会清空其他分类报告。

## 开发与部署

```bash
npm test              # Node + Python 单测（需要上面的 Python 依赖）
npm run check:syntax  # JS/MJS 语法检查
npm run check:data    # JSON 数据门禁
npm run check         # 全部检查
npm run build:site    # 生成 .site/ 静态部署产物
```

PR 检查执行代码、数据与构建验证；每日更新验证后推送 `main`，Vercel 通过仓库集成构建并发布 `.site/`。部署只包含运行所需的白名单文件，不发布脚本、测试和文档；不要直接编辑 `.site/`。

- `index.html`、`app.js`、`js/modules/`：页面入口、交互与数据渲染。
- `share.js`、`share.css`：作品分享图。
- `json/`、`posters/`：生成数据与本地海报。
- `assets/`、`manifest.webmanifest`：插画、安装图标与安装清单。
- `scripts/automation/`：统一更新入口与本地数据任务。
- `scripts/catalog/`、`scripts/lib/`：分类配置、数据源与转换逻辑。
- `tests/`、`.github/workflows/`：回归测试与 CI。

海报目前以普通 Git 二进制文件跟踪，未启用 Git LFS。安装图标与标签页 favicon 分开维护；替换图标后可能需要移除旧安装并重新添加，详见 [项目设计说明](docs/DESIGN_BRIEF.md#平台图标与安装元数据)。

## 维护文档

- [数据更新指南](docs/DATA_UPDATE_GUIDE.md)：环境变量、任务职责、发布与故障处理。
- [设计与验收说明](docs/DESIGN_BRIEF.md)：视觉、手机交互、图标与验收边界。
- [项目上下文](CONTEXT.md)：架构速记与维护入口。

## 数据来源与许可

- [TMDB](https://www.themoviedb.org/)：影视基础信息与海报。
- [豆瓣](https://movie.douban.com/)：评分、Top250 与收藏状态。
- 猫眼 60s：票房与剧集热度。
- [Bilibili](https://www.bilibili.com/)：预告片。

[MIT](LICENSE) © 2026 lrwei91。许可覆盖仓库代码与配置；`json/`、`posters/` 及界面截图中的第三方影视元数据和素材，其版权与使用条件归各自权利人所有。
