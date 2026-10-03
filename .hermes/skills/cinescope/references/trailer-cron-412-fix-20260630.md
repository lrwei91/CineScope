# Trailer cron B 站 412 修复（2026-06-30 实战）

## 现象

20:00 cron 报 `generate_douban_catalog.mjs（180s 超时）`，实际是 node 原生 `fetch()` 直连 `api.bilibili.com` 返回 HTTP 412，retry 3 次后脚本超时退出。

## 根因

Clash TUN fakeip 模式下，macOS native 应用（含 node fetch）走 TUN 接口但 DNS/路由偶尔没接管到大陆域名出口；即使直连也返回 412（B 站 UA 风控 — 必须走代理出口）。

## 诊断三件套

| 步骤 | 命令 | 期望 |
|---|---|---|
| 1. 直连 B 站 | `curl -I https://api.bilibili.com/x/web-interface/search/type?search_type=video` | `412`（确认风控） |
| 2. 走代理 | `curl -I -x http://127.0.0.1:7890 https://api.bilibili.com/...` | `200`（确认 Clash 出口 OK） |
| 3. node fetch + proxy | `node --use-env-proxy -e "fetch(...UA...)"` | `200`（验证 Node 22 需 `--use-env-proxy` flag 才读 env proxy） |

## 修法

修改 `~/.hermes/scripts/cron-no-agent/cinescope_trailer_update.py` 第 290 行附近：

```python
# Clash TUN 没接管 native fetch 时, 显式走 HTTP 代理避免 B 站 412 (2026-06-30 撞过)
# Node 22 需配合 --use-env-proxy flag 让原生 fetch 读 env proxy
env.setdefault("HTTP_PROXY", "http://127.0.0.1:7890")
env.setdefault("HTTPS_PROXY", "http://127.0.0.1:7890")
success, stdout, stderr = _run(["node", "--use-env-proxy", str(NODE_SCRIPT)], cwd=PROJECT_DIR, env=env, timeout=180)
```

关键点：
- 只在 node 调那一处加，**不要污染 `_run` 函数**（git 等其他 subprocess 不需要 proxy）
- `setdefault` 让用户自定义 env 优先（dev/prod 切换代理不用改脚本）
- Node 22 的原生 fetch **默认不读 HTTP_PROXY**，必须显式 `--use-env-proxy` flag

## 下次 cron 自检

> 本文记录于 2026-06-30，当时的 cron id 为 `735de336fba5`、调度为 20:00。
> 任务重建后 id 与调度均已变更，当前值以 `~/.hermes/cron/jobs.json` 为准（2026-10-04 核实为 `7aa26e8f968b` / `10 20 * * *`）。

```bash
# 看产出是否成功（jobs.json 顶层是 {jobs, updated_at}，需先取 .jobs）
jid=$(jq -r '(.jobs // .)[] | select(.name=="CineScope 预告片更新") | .id' ~/.hermes/cron/jobs.json)
tail -20 ~/.hermes/cron/output/$jid/<昨天日期>_20-*.md

# 若仍 timeout, 检查 Clash 是否活着
pgrep -lf clash-verge | head -3
lsof -nP -iTCP:7890 -sTCP:LISTEN | head -3
```

## 已知关联

- AGENTS §11 IM 推送纪律（失败摘要不贴 stderr）
- IM 通知格式：`❌ CineScope 预告片更新失败` 走 §3.8 A 五段
- no_agent cron "没通知" 诊断：先看 `last_run_at`/`last_status`/`last_delivery_error`，99% 命中 `[SILENT]` 自回，不在这里