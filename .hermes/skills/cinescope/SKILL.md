---
name: cinescope
description: 维护 CineScope 豆瓣缓存、国产剧状态、预告片和本地查询。
version: 3.0.4
owner: cinescope
tags:
  - cinescope
  - douban
  - trailer
  - entertainment
---

# CineScope

## 架构边界

CineScope 仓库是数据任务业务逻辑的唯一来源：

```text
/Users/lrwei91/Documents/Project/CineScope/scripts/automation/
├── run_update.py              # 统一任务、staging、验证、发布
├── tv_status_sync.py          # 国产剧状态
├── douban_cache_refresh.py    # 豆瓣缓存周更
├── douban_browser_scraper.py  # BrowserSkill 抓取
├── douban_probe_404.py        # 404 探测
└── trailer_report.py          # 预告片差异
```

Hermes 只负责 cron、代理环境和通知格式。不要在 `~/.hermes` 重新实现数据转换、build report、Git 冲突合并或预告片 diff。

## 统一命令

```bash
cd /Users/lrwei91/Documents/Project/CineScope

# 国产剧状态
python3 scripts/automation/run_update.py --task tv-status --dry-run
python3 scripts/automation/run_update.py --task tv-status --publish

# 豆瓣缓存
python3 scripts/automation/run_update.py --task douban-cache --dry-run
python3 scripts/automation/run_update.py --task douban-cache --publish

# 预告片
CINESCOPE_NODE_USE_ENV_PROXY=1 \
HTTP_PROXY=http://127.0.0.1:7890 \
HTTPS_PROXY=http://127.0.0.1:7890 \
python3 scripts/automation/run_update.py --task trailers --publish
```

任务最后一行是结构化 JSON。失败、超时或数据门禁不通过时不会提升 staging，也不会提交正式 JSON。

## 当前 cron

| 时间 | 任务 | cron id | wrapper |
|---|---|---|---|
| 每日 06:00 | 豆瓣国产剧连载状态同步 | `ea423a45f252` | `cron-no-agent/douban_cn_status_sync.py` |
| 周日 08:00 | 豆瓣缓存周更新 | `b86e739f876d` | `cron-no-agent/douban_weekly_update.py` |
| 每日 20:10 | CineScope 预告片更新 | `7aa26e8f968b` | `cron-no-agent/cinescope_trailer_update.py` |

cron id 以 `~/.hermes/cron/jobs.json` 为准；任务重建后 id 会变化，使用前先核对该文件。

旧 07:30 `CineScope GitHub 同步` 已删除；每个任务验证后自行发布。

## 数据源约束

- GitHub Actions 云 IP 无法可靠访问豆瓣，完整 catalog 可读本地 cache 并保留旧数据。
- 豆瓣详情补全必须走本地 BrowserSkill + 真实 Chrome 登录态。
- Rexxar v2 对老 subject ID 和已删除的幽灵条目可能返回 404；状态脚本保留失败计数并自动跳过连续失败条目。
- B 站在本地直连可能返回 412/429；Node 原生 fetch 需要 `--use-env-proxy`，由 wrapper 通过 `CINESCOPE_NODE_USE_ENV_PROXY=1` 开启。
- 不要清空正式 JSON 作为重试手段；缓存失败应保留旧数据。
- 豆瓣评分与链接只来自豆瓣榜单的标题+年份匹配，覆盖面天然有限——数百条 TMDB 驱动条目匹配不到是**正常状态**，不要误判成接口故障。2026-10-04 起原 IMDB ID 反查链路（`DOUBAN_API_KEY` + `scripts/lib/douban-imdb-lookup.mjs`）因该 key 无官方申请入口、且自 2026-09-16 引入以来 `writes` 恒为 0，从未产生过任何补全，已整体删除。
- 统计豆瓣评分/链接缺失率必须用 `seasons[0].douban_rating || 顶层 douban_rating` 口径（与 `validate-data.mjs`、`build-report.mjs` 一致）。剧集把这两个字段放在 `seasons[0]` 下，只读顶层会把缺口严重高估——曾因此把 59.8% 误读成 76.7%。
- 重跑数据任务若报 `ModuleNotFoundError: No module named 'requests'`，是本地 Python 环境缺依赖，先 `python3 -m pip install -r scripts/automation/requirements.txt`，不要改业务代码。

## 发布约束

- 命令示例、历史排障案例和验证清单均不授予发布权限。`--publish`、手动触发工作流和其他外部写入需有对应用户授权；已有授权且目标、范围未变时不重复确认。

- `--publish` 默认要求工作区干净；`tv-status`、`douban-cache`、`trailers` 只发布 `json/` 和 `posters/`，允许保留这两条路径之外的本地编辑，但发布路径本身必须干净，远端快进若会覆盖本地改动则停止。白名单在 `run_update.py` 的 `ALLOW_UNRELATED_WORKTREE_CHANGES_TASKS`，`full` 仍要求全仓干净。
- 暂存基线由 `copy_tracked_json_baseline()` 按 `git ls-files json` 逐个拷贝，不再整目录 `copytree`，`json/` 下的非跟踪残留不会进入 staging。
- 部署只有 Vercel 仓库集成一条链路（`vercel.json`：`npm run build:site` → `.site/`）。`deploy-pages.yml` 已在 `aa422658`「迁移影视站点至 Vercel」删除，仓库内没有独立部署工作流。
- 本地任务共用 `.cache/automation/update.lock`。
- 只允许发布 `json/` 和 `posters/`。
- 数量下降超过 20% 默认失败；确认是业务变更后才使用 `--allow-large-drop`。
- push 最多重试 3 次，仍失败时保留本地 commit 供人工处理。

## 通知包装

no-agent wrapper 只能：

1. 设置代理或环境变量
2. 调用仓库 `run_update.py`
3. 解析最后一行结构化 JSON
4. 输出简短通知

通知中的影视名称必须使用完整正式名称，不主动简写。若上游主标题是短名、`aka` 中存在以短名开头的完整名称（如主标题“小芳”、别名“小芳出嫁”），展示时优先完整别名。不要把上游短标题合理化为“目录短名”。预告片任务中的“新增”指新增预告片匹配，不是新增影视条目；通知应明确写成“新增预告片匹配”，并在来源不是官方预告时避免把杀青资讯、自媒体解说统称为正式预告片。

## tv-status 更新口径

- 完结判断包含 `in_production == false`；即使 `status` 和 `episodes_info` 为空，也视为已完结并跳过后续同步。
- “本次更新”只统计内容状态变化：`episodes_info`、`status` 或连载/完结状态推进。仅补齐缺失的 `seasons[0].episode_count` 属于元数据修复，不计入“本次更新”。
- 汇总单独显示“补齐总集数”，避免把历史完结剧包装成当天更新。
- “本次更新”通知使用一行一部的格式，不把多部剧名压在同一行。
- 统一入口仍使用 `python3 scripts/automation/run_update.py --task tv-status --dry-run` 先核对口径，再按需 `--publish`；相关修复已在 CineScope 仓库提交并推送。

不要把完整 stderr 发送到 IM；失败只保留首行 hint，详细日志留本地。

## 查询

本地搜索脚本仍属于 Hermes 查询能力，不参与更新/发布：

```bash
~/.hermes/hermes-agent/venv/bin/python \
  ~/.hermes/skills/cinescope/scripts/search_cinescope.py "隐秘的角落"
```

## 常见坑

- **`json/` 内的非跟踪残留会进入本地构建产物，但不会上线上**：`scripts/build-site.mjs` 对 `json/` 是整目录 `cp`（只有顶层路径做白名单判定），所以躺在 `json/` 里的残留（云同步产生的 `xxx 2.json` 之类）都会进入 `.site/json/`。收窄到「本地影响」即可：Vercel 与 Pages 都从 git 树构建，未跟踪文件从不在远端（实测线上 `/json/build_report%202.json` 为 **404**）。真正会中招的只有本地 `python3 -m http.server` 直接伺服 `.site/`，或本地 `vercel` CLI 手工部署。注意这与 `run_update.py` 的 `copy_tracked_json_baseline` 是两套口径，不要混为一谈。
- **探测线上对象必须走代理**：本机沙箱里 curl 加 `--noproxy '*'` 会被拦截，对**任意路径**（包括不存在的路径）一律返回 301，据此判断会得出完全错误的存在性结论。抽样比对时用默认（走代理）路径：真实存在的文件给 200、不存在的给 404，这才是源站响应；另外用 `curl -D -` 读头时，代理会先回一行 `HTTP/1.1 200 Connection Established`，那不是源站状态码。
- **项目路径联动**：CineScope 当前路径是 `/Users/lrwei91/Documents/Project/CineScope/`。wrapper、cron workdir、SKILL.md、references 和 `scripts/search_cinescope.py` 都依赖同一根目录。出现 `No such file or directory` 时先确认该目录存在；项目再次迁移时必须同步更新这些位置。完整清单见 `references/project-path-migration.md`。
- **wrapper 执行权限**：`~/.hermes/scripts/cron-no-agent/` 下的 wrapper 当前为 `644`（无执行位），且各文件权限不一致（部分为 `711`）。Hermes 通过 `python <script>` 方式调用（cron 任务的 `script` 字段 + `no_agent: true`），因此权限不足不影响调度；但手动直接 `./wrapper.py` 会报 `Permission denied`。手动重跑时用 `~/.hermes/hermes-agent/venv/bin/python <wrapper>`，不要为临时重跑修改文件权限。
- **远端领先不等于分叉**：发布前若 `origin/main` 单纯领先，`run_update.py` 应自动 `git merge --ff-only origin/main` 后继续；`trailers` 仅允许保留非发布路径编辑，发布路径有改动，或快进会覆盖其他本地改动时才停止。若通知出现 `origin/main is ahead or diverged`，先查 `git status --short --branch` 和 `git rev-list --left-right --count HEAD...origin/main`，不要把 `0 1` 误判成冲突。
- **`--publish` 输出路径被脏改动拦截**：`trailers` 发布器允许保留 `json/`、`posters/` 之外的本地编辑；其他任务仍要求全仓干净。`ensure_clean_for_publish()` 会在生成后阻止待发布路径已有未提交改动。若出现 `--publish output paths already contain uncommitted changes`，只检查对应 `json/` / `posters/` 文件，避免回滚无关源代码；若远端快进阶段提示会覆盖本地改动，则先查看 `git status --short --branch` 和冲突路径，确认后再处理。
- **豆瓣缓存 publish 不保证一次幂等**：抓取会增量补全本地缓存；手动 `--publish` 成功后立刻只为刷新 `last_status` 再跑 Cron，第二次仍可能补充字段并生成新 commit，即使条目总数不变。不要把第一次 commit 当终态；若确需立即重跑，必须以第二次后的最终 HEAD 重新执行 `npm run check`、`npm run build:site`、远端 SHA 和当前 Vercel 部署的线上对象读回（先核对实际部署地址与提交版本）。只想清除历史错误展示时，优先等待下一次正常调度，不手改 `jobs.json` 状态。
- **历史 CI 案例：`ModuleNotFoundError: No module named 'requests'`**：先用 `gh run view <id> --log-failed` 读取目标运行的真实错误，再检查当前 `.github/workflows/ci.yml`、`.github/workflows/daily-update.yml`、Python 测试和依赖文件。历史原因是测试导入依赖而 runner 未安装，修复应按当前 runner 环境选择依赖安装方式，不机械照搬旧的安装参数或固定测试数量。运行项目要求的本地检查，并读取已有远端运行；本地通过不等于远端通过。只有用户已授权触发对应工作流及其数据更新、提交或发布副作用时，才可手动运行 `gh workflow run "每日数据更新"`，随后核对实际运行结果。没有触发授权时完成本地修复与验证，明确远端尚未验证，不为清除旧错误而自动触发。Node 弃用告警与实际失败分开判断，不因此顺手升级运行时。

## 诊断顺序

1. `git status --short --branch`
2. `python3 scripts/automation/run_update.py --task <task> --dry-run`
3. `npm run check:data`
4. 检查 BrowserSkill、代理/登录态
5. 检查结构化结果和 `json/build_report.json`

历史问题详情继续保留在本目录 `references/`，但实现以仓库代码和 `docs/DATA_UPDATE_GUIDE.md` 为准。
