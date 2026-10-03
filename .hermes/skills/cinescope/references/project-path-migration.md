# CineScope 项目路径迁移排查清单

## 当前事实

- 当前项目根：`/Users/lrwei91/Documents/Project/CineScope`
- 旧根：`/Volumes/外挂硬盘/Project/CineScope`
- 数据更新唯一入口：`scripts/automation/run_update.py`

## 必须联动的位置

| 优先级 | 位置 | 检查项 |
|---|---|---|
| P0 | `~/.hermes/scripts/cron-no-agent/` | 3 个 wrapper 的 `RUNNER` |
| P0 | Hermes cron | 3 个 CineScope 任务的 `workdir` |
| P1 | `~/.hermes/skills/cinescope/scripts/` | `PROJECT_DIR`、`RUNNER` |
| P1 | `~/.hermes/skills/cinescope/SKILL.md` | 命令与当前根目录 |
| P2 | `~/.hermes/skills/cinescope/references/` | 可执行示例路径 |

## 修复顺序

1. 现场确认新目录及 runner 存在：
   ```bash
   test -d /Users/lrwei91/Documents/Project/CineScope
   test -f /Users/lrwei91/Documents/Project/CineScope/scripts/automation/run_update.py
   ```
2. 先用 `patch` 修改一个 wrapper，执行 `python3 -m py_compile` 并确认路径可解析。
3. 修其余 active skill、reference 与 wrapper；排除 `.bak.*`、`legacy/`、`__pycache__/`、日志和历史会话。
4. 用 `cronjob action=list` 取得真实 job ID，再逐个 `cronjob action=update` 修改 `workdir`，不要直接猜 ID。
5. 复扫旧根路径；允许旧路径只出现在明确标记的历史快照中。

## 最小验证

```bash
python3 -m py_compile \
  ~/.hermes/scripts/cron-no-agent/cinescope_trailer_update.py \
  ~/.hermes/scripts/cron-no-agent/douban_cn_status_sync.py \
  ~/.hermes/scripts/cron-no-agent/douban_weekly_update.py

cd /Users/lrwei91/Documents/Project/CineScope
python3 scripts/automation/run_update.py --task tv-status --dry-run
```

`--publish` 会提交并推送，路径迁移验证不要擅自使用。若 wrapper 本身固定带 `--publish`，只做导入/语法/目标文件存在性验证，除非用户明确要求执行发布。

## 常见坑

- 只改 SKILL.md，不改 wrapper 或 cron workdir，任务仍会报 `No such file or directory`。
- 机械全局替换迁移说明，会产生“从新路径迁到新路径”的矛盾文本；迁移文档必须按当前事实重写。
- `clawbkk` 是 `~/.hermes` 的备份镜像，不是 active skill 真源；不要从仓库目录反向 `rsync --delete` 到 active 目录。
