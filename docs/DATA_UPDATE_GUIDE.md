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
- `--publish`：要求干净工作区；验证后提交、rebase 重试并推送
- `--allow-large-drop`：仅用于已经确认的超过 20% 数据缩减
- 同一时间只允许一个本地数据任务运行

每次命令最后一行输出结构化 JSON，Hermes 包装层只负责把结果转换成通知。

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

GitHub Actions 每日 22:00 运行并使用 `--publish`。

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

依赖 Kimi WebBridge 和真实 Chrome 豆瓣登录态：

1. 统计 catalog 中缺失的 subject cache
2. 探测已删除或 404 的条目
3. 通过真实浏览器补充缓存
4. 重建 `movie_cn`
5. 验证并立即发布

本地每周日 08:00 运行，不再等待单独的 Git 同步任务。

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

本地每日 20:00 运行。

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

硬失败：

- JSON 无法解析或 collection 为空
- 条目缺少 ID 或存在重复 ID
- latest 中的 ID 不在 complete
- 本地海报路径越界或文件不存在
- complete 数量相对 HEAD 无授权下降超过 20%

警告：

- 评分缺失率相对 HEAD 恶化超过 10 个百分点
- 豆瓣链接缺失率相对 HEAD 恶化超过 10 个百分点

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

- `ci.yml`：Pull Request 执行代码、数据和 Pages 产物检查
- `daily-update.yml`：调用统一入口完成 full 更新和发布
- `deploy-pages.yml`：main push 后验证并部署一次
- `.site/`：只包含 HTML、CSS、JS、JSON、海报和 favicon

部署不再监听每日工作流的 `workflow_run`，避免同一提交重复部署。

## 7. 故障处理

- 锁存在：先确认是否有任务仍在运行；仅失效 PID 会自动清锁
- 数据下降门禁：先核对上游和 diff，不要直接使用 override
- 豆瓣浏览器失败：检查 WebBridge daemon、扩展连接和登录态
- B 站 412/429：检查本地代理；保留旧缓存，不要删除正式 JSON
- push 失败：统一入口最多重试 3 次，本地 commit 会保留供人工处理
