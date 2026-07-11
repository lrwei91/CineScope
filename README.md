# CineScope

影视内容聚合展示平台，追踪国产剧、院线电影、综艺、韩剧、日剧、美剧和豆瓣 Top250。

[在线体验](https://lrwei91.github.io/CineScope/) · [反馈建议](https://github.com/lrwei91/CineScope/issues)

## 功能

- 按分类、评分、类型和名称筛选影视内容
- latest → complete 渐进加载，按分类缓存
- 猫眼票房与剧集热度、B 站预告片、豆瓣收藏状态
- 年月时间线、分页加载、移动端筛选面板和分享图

## 架构

CineScope 保持无后端静态架构：

```text
TMDB / 豆瓣 / 猫眼 / B站
          ↓
scripts/automation/run_update.py
          ↓
临时目录生成 → 数据门禁 → 原子提升
          ↓
json/ + posters/
          ↓
GitHub Pages 白名单产物
```

数据任务分为：

| task | 用途 | 默认调度 |
|---|---|---|
| `full` | 全分类、猫眼、豆瓣状态和 Top250 | GitHub Actions 每日 22:00 |
| `tv-status` | 国产剧连载状态 | 本地每日 06:00 |
| `douban-cache` | 登录态补充豆瓣详情缓存 | 本地每周日 08:00 |
| `trailers` | 国产影视 B 站预告片 | 本地每日 20:00 |

需要浏览器登录态或本地网络环境的任务由 Hermes 触发，但业务逻辑、验证和发布协议均在本仓库。Hermes 只保留调度、代理环境和通知包装。

## 数据加载

```text
首页 → 当前分类 latest.json
        ├─ 豆瓣收藏状态（并行，不阻塞首屏）
        └─ complete.json（后台补全）
```

- 首屏只请求当前分类的 latest 数据
- 切换分类时按需加载并缓存
- 豆瓣状态失败不会阻塞卡片展示
- 院线电影保留完整数据优先策略

## 快速开始

要求：

- Node.js 20+
- Python 3.11+
- `requests`（仅 `tv-status` 任务）
- `TMDB_API_KEY`（完整数据更新）

```bash
git clone https://github.com/lrwei91/CineScope.git
cd CineScope
cp .env.example .env
python3 -m pip install -r scripts/automation/requirements.txt
python3 -m http.server 8000
```

访问 `http://localhost:8000`。

## 数据任务

所有更新都通过统一入口：

```bash
# 只在临时目录生成和验证，不改正式 JSON
python3 scripts/automation/run_update.py --task douban-cache --dry-run

# 更新本地工作区，不提交
python3 scripts/automation/run_update.py --task trailers

# 更新、验证、提交并推送
python3 scripts/automation/run_update.py --task full --publish
```

`--publish` 要求任务开始前工作区干净。任务使用进程锁避免本地并发；输出必须通过结构、重复 ID、latest/complete 一致性、数量回退和海报路径检查后才会提升。

有意进行超过 20% 的数据缩减时，需显式传入 `--allow-large-drop`。

## 开发检查

项目没有运行时 npm 依赖：

```bash
npm test              # Node + Python 单测
npm run check:syntax  # JS/MJS 语法检查
npm run check:data    # 当前 JSON 数据门禁
npm run check         # 全部检查
npm run build:site    # 生成 .site/ Pages 白名单产物
```

CI 会在 Pull Request、每日更新和 Pages 部署前执行这些检查。

## Build Report v2

`json/build_report.json` 保留原有 `metadata`、`categories`、`douban_statuses` 等字段，并增加：

- `schema_version`
- `latest_run`
- `last_full_build`
- `task_statuses`

局部任务只替换相关分类报告，不会再清空其他分类、豆瓣状态或 Top250 的最近结果。

## 项目结构

```text
CineScope/
├── index.html / app.js / share.js
├── js/modules/                 # 前端 ES Modules
├── json/                       # 生成后的页面数据
├── posters/                    # 本地海报
├── scripts/
│   ├── automation/             # 统一任务、豆瓣本地任务、预告片报告
│   ├── catalog/                # 分类配置
│   ├── lib/                    # 可测试的数据源与转换模块
│   └── generate_*.mjs          # 数据生成入口
├── tests/                      # Node 与 Python 单测
└── .github/workflows/          # CI、每日更新、Pages 部署
```

## 存储说明

海报目前作为普通 Git 二进制文件跟踪，`.gitattributes` 仅关闭文本 diff/merge；当前没有启用 Git LFS。为避免破坏历史，本次改造不迁移海报、不重写 Git 历史。Pages 只上传运行所需的白名单文件，不再发布脚本、测试和文档。

## 数据来源

- [TMDB](https://www.themoviedb.org/)：影视基础信息和海报
- [豆瓣](https://movie.douban.com/)：评分、Top250、收藏状态
- 猫眼 60s：票房和剧集热度
- Bilibili：预告片

## License

MIT
