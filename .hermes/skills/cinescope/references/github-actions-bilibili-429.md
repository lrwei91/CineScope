# GitHub Actions B站 429 限流问题

## 问题
GitHub Actions runner IP 被 B站 API (`api.bilibili.com`) 限流，返回 HTTP 429。
触发场景：`.github/workflows/update-trailers.yml` 定时运行 `generate_douban_catalog.mjs` 时拉取 B站 UP 主视频列表。

## 根因
GitHub Actions runner 共享 IP 池，B站对高频请求做了 IP 级限流（412/429），`shouldRetryBilibiliError()` 虽然识别了可重试状态码，但重试 3 次后仍失败。

## 解决方案
将预告片更新从 GitHub Actions 迁移到**本地 macOS Hermes cron**（`~/.hermes/scripts/cron-no-agent/cinescope_trailer_update.py`），每天 20:00 执行。

本地 IP 不受 B站限流，脚本内置重试机制（3 次，指数退避）+ 缓存兜底。

## 脚本位置
- 执行脚本：`~/.hermes/scripts/cron-no-agent/cinescope_trailer_update.py`
- Skill：`~/.hermes/skills/automation/cinescope-trailer-update/SKILL.md`
- Cron：`735de336fba5`（`0 20 * * *`）

## 原始 GitHub Workflow
`.github/workflows/update-trailers.yml` — 已不再使用，建议禁用或删除。
