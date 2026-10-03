# CineScope 数据更新指南

## 1. 统一入口

所有会改写页面数据的流程都从下面的 CLI 进入：

本地状态任务首次运行前安装 Python 依赖：

```bash
python3 -m pip install -r scripts/automation/requirements.txt
```

```bash
python3 scripts/automation/run_update.py \
  --task <full|tv-status|douban-cache|trailers> \
  [--dry-run] [--publish] [--allow-large-drop]
```

行为约定：

- 默认：在 staging 生成并验证，成功后提升到工作区
- `--dry-run`：丢弃 staging，不改正式 JSON
- `--publish`：`tv-status`、`douban-cache`、`trailers` 任务只发布生成的 JSON/海报，可保留非发布路径编辑；发布路径必须干净，验证后提交、rebase 重试并推送；其他任务要求工作区干净
- `--allow-large-drop`：仅用于已经确认的超过 20% 数据缩减
- 同一时间只允许一个本地数据任务运行

每次命令最后一行输出结构化 JSON，Hermes 包装层只负责把结果转换成通知。

### 环境变量

| 变量 | 必需性 | 用途 | 缺失时的行为 |
| --- | --- | --- | --- |
| `TMDB_API_KEY` | 必需 | TMDB 发现与详情、语言与地区参数 | 不生成 TMDB 驱动条目，数据质量下降 |

本地配置（`.env` 已被 `.gitignore` 忽略）：

```bash
export TMDB_API_KEY=...
```

CI 配置：在仓库 Secrets 中添加 `TMDB_API_KEY`，并在 `daily-update.yml` 的更新步骤传入同名 env。
未配置时每日更新照常运行，runner 会输出 `::warning::` 并跳过 TMDB 驱动条目。

### 可调参数

以下均为可选，默认值已适合常规运行；仅在排查限流、缓存或超时问题时才需要调整。
定义位置见 `scripts/generate_douban_catalog.mjs` 与 `scripts/generate_maoyan_cache.mjs`。

| 变量 | 默认 | 用途 |
| --- | --- | --- |
| `DOUBAN_SUBJECT_CACHE_TTL_DAYS` | 14 | 豆瓣条目缓存有效期 |
| `DOUBAN_SEARCH_CACHE_TTL_DAYS` | 30 | 豆瓣搜索缓存有效期 |
| `DOUBAN_SEARCH_QUERY_LIMIT` | 1 | 单条目触发的搜索次数上限 |
| `HTTP_REQUEST_TIMEOUT_MS` | 15000 | 通用 HTTP 超时 |
| `SKIP_POSTER_DOWNLOADS` | false | 跳过海报下载 |
| `BILIBILI_TRAILER_FORCE_BOOTSTRAP` | false | 强制全量抓取预告片 |
| `BILIBILI_TRAILER_BOOTSTRAP_PAGE_LIMIT` | 8 | 全量抓取页数上限 |
| `BILIBILI_TRAILER_INCREMENTAL_PAGE_LIMIT` | 4 | 增量抓取页数上限 |
| `BILIBILI_TRAILER_REQUEST_DELAY_MS` | 1200 | 请求最小间隔 |
| `BILIBILI_TRAILER_REQUEST_JITTER_MS` | 400 | 请求间隔抖动 |
| `BILIBILI_TRAILER_MAX_RETRIES` | 3 | 失败重试次数 |
| `BILIBILI_TRAILER_RETRY_BASE_DELAY_MS` | 3000 | 重试退避基数 |
| `BILIBILI_TRAILER_ENABLE_SEARCH_FALLBACK` | false | 启用搜索兜底 |
| `BILIBILI_TRAILER_REQUEST_TIMEOUT_MS` | 15000 | B 站请求超时 |
| `MAOYAN_BOX_OFFICE_API_URL` | 60s 公共实例 | 猫眼实时票房接口 |
| `MAOYAN_TV_HEAT_API_URL` | 60s 公共实例 | 猫眼剧集热度接口 |
| `CINESCOPE_OUTPUT_ROOT` | 仓库根目录 | 数据输出根目录，由 runner 注入 |
| `CINESCOPE_PROJECT_ROOT` | 仓库根目录 | 项目根目录，由 runner 注入 |
| `CATEGORY_IDS` | 空（全部） | 限定分类，逗号分隔 |
| `UPDATE_TASK` | 由 task 推导 | 当前任务名，由 runner 注入 |

运行统计见 `json/build_report.json` 的 `douban_subject_cache`、`douban_search_cache` 字段。

## 2. 任务职责

### full

```bash
TMDB_API_KEY=... python3 scripts/automation/run_update.py --task full
```

顺序：

1. 更新猫眼票房与热度缓存
2. 生成全部 catalog
3. 更新豆瓣收藏状态和 Top250
4. 生成 build report v2
5. 执行数据门禁

猫眼接口失败时，有有效缓存就保留原快照和更新时间，并标记 `stale_upstream`，继续生成其他分类；没有有效缓存时仍报错停止。每日工作流启用 `pipefail`，生成或数据门禁失败不会被日志管道掩盖为成功。

GitHub Actions 每日 22:00 运行并使用 `--publish`。

仅重建国产剧目录时使用 `CATEGORY_IDS=tv_cn python3 scripts/automation/run_update.py --task full --dry-run`。
确认试运行通过后去掉 `--dry-run`，将验证后的数据提升到工作区。指定分类不含 `movie_cn` 时跳过猫眼缓存刷新；不指定分类时保留完整更新流程。

### tv-status

```bash
python3 scripts/automation/run_update.py --task tv-status --dry-run
```

使用豆瓣 Rexxar API更新国产剧集数和连载状态。业务脚本只改 staging 中的 `tv_cn_complete.json`；Git 操作由统一入口处理。

本地每日 06:00 运行。

### douban-cache

```bash
python3 scripts/automation/run_update.py --task douban-cache --dry-run
```

依赖 BrowserSkill 和真实 Chrome 豆瓣登录态。`douban_cache_refresh.py` 内部三个阶段：

1. 统计 `movie_cn_complete.json` 中缺失的 subject 缓存
2. probe 探测已删除或 404 的条目，并从 latest / complete 中移除
3. 通过真实浏览器抓取补齐缓存

`--dry-run` 只做检查与抓取，不写正式 JSON。**非 dry-run** 时，runner 在此之后额外用
`CATEGORY_IDS=movie_cn` 重建 `movie_cn`，再统一执行数据门禁。是否提交推送由 `--publish` 决定，
任务本身不会自动发布。

本地每周日 08:00 运行。

### trailers

```bash
python3 scripts/automation/run_update.py --task trailers --dry-run
```

只重建 `movie_cn,tv_cn`，并以 bvid/url 为稳定键生成去重后的新增/补充报告。本地包装层可设置：

```bash
CINESCOPE_NODE_USE_ENV_PROXY=1 \
HTTP_PROXY=http://127.0.0.1:7890 \
HTTPS_PROXY=http://127.0.0.1:7890 \
python3 scripts/automation/run_update.py --task trailers
```

本地每日 20:10 运行。

## 3. Staging 与发布

运行开始时：

1. 获取 `.cache/automation/update.lock`
2. 复制当前 `json/` 到临时 run 目录
3. 将 `CINESCOPE_OUTPUT_ROOT` 指向临时目录
4. 生成数据和新增海报
5. 验证完整 staging
6. 仅复制发生变化的白名单文件

失败、超时和 `--dry-run` 都不会提升 staging。缓存目录属于可恢复输入，不进入 Git 提交。

允许发布的路径只有 `json/` 和 `posters/`。

## 4. 数据门禁

实现见 `scripts/validate-data.mjs`，以下为完整清单。

硬失败（阻止提升）：

- 分类 JSON 缺少 `shows` / `movies` 数组，或 latest / complete 集合为空
- 条目缺少 ID，或同一层级存在重复 ID
- latest 中的 ID 不在 complete 中
- 海报路径越出 `posters/`，或本地海报文件不存在
- 条目标记为「已验证」的豆瓣链接不符合 subject URL 格式
- complete 数量相对 `HEAD` 下降超过 20%（`--allow-large-drop` 可放行）
- 辅助文件缺失或不是对象：`douban_top250.json`、`douban_statuses.json`、`maoyan_box_office.json`、`maoyan_tv_heat.json`、`build_report.json`
- `douban_top250.movies` 为空，或 `douban_statuses.statuses` 不是对象
- `build_report` 的 `schema_version` 不是 2、`categories` 不是数组、缺 `latest_run` 或 `task_statuses`
- `build_report` 缺少任一分类条目，或其 `counts.latest` / `counts.complete` / `quality.total_items` 与实际 JSON 不一致

警告（不阻止提升，但需在摘要中核对）：

- 评分缺失率相对 `HEAD` 恶化超过 10 个百分点
- 豆瓣链接缺失率相对 `HEAD` 恶化超过 10 个百分点
- 上映日期超出当前日期 550 天以上

```bash
npm run check:data
```

## 5. Build Report v2

局部任务会读取旧报告并按分类合并，保留未参与本轮任务的数据：

```json
{
  "schema_version": 2,
  "metadata": { "mode": "partial" },
  "latest_run": { "task": "trailers", "status": "success" },
  "last_full_build": {},
  "task_statuses": {},
  "categories": [],
  "douban_statuses": {},
  "douban_top250": {}
}
```

前端继续读取兼容的 `douban_statuses` 字段。

## 6. CI 与部署

- `ci.yml`：Pull Request 和手动触发执行 `npm run check` 与 `npm run build:site`，验证代码、数据和 `.site/` 构建产物
- `daily-update.yml`：定时（北京时间 22:00）或手动触发，调用统一入口完成 full 更新和发布，只推送已验证的 `main` 提交
- `vercel.json`：Vercel 仓库集成监听 `main` push，执行 `npm run build:site` 并以 `.site/` 作为输出目录
- `.site/`：只包含 HTML、CSS、JS、JSON、海报和 favicon

部署只有 Vercel 仓库集成一条链路：`deploy-pages.yml` 已在迁移到 Vercel 时移除，仓库内没有其他部署工作流，也不监听每日工作流的 `workflow_run`，避免同一提交重复部署。

## 7. 故障处理

- 锁存在：先确认是否有任务仍在运行；仅失效 PID 会自动清锁
- 数据下降门禁：先核对上游和 diff，不要直接使用 override
- 豆瓣浏览器失败：检查 BrowserSkill daemon、扩展连接和登录态
- B 站 412/429：检查本地代理；保留旧缓存，不要删除正式 JSON
- push 失败：统一入口最多重试 3 次，本地 commit 会保留供人工处理
