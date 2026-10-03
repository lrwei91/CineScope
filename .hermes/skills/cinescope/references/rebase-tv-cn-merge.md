# tv_cn_complete.json rebase 字段级合并 (2026-06-30)

## 背景

CineScope 有两个 cron 都会碰 `json/tv_cn_complete.json`:

| Cron | 时间 (BJT) | 改的字段 |
|---|---|---|
| 每日数据 `douban_weekly_update.py` (或其上游) | 16:54 (前一天 UTC 08:00) | `metadata.last_updated`, `update_log`,各 show 的 `vote_average` / `douban_rating` 等评分字段,以及 **season object 的 `id` 字段** |
| 国产剧同步 `douban_cn_status_sync.py` | 06:00 | `metadata.last_updated`, show 顶层 `status` / `episodes_info` / `in_production`, season object 的 `episode_count` |

字段**不重叠**,但因为同文件同区域,git 行级 diff 把它们当冲突,rebase 撞上后 `CalledProcessError` 报 "could not apply chore: 同步国产剧状态: X 部更新"。

## schema drift 警告 (踩过的坑)

`tv_cn_complete.json` 在多次 commit 间, **season object 的 `id` 字段** 含义改过一次:

- `f69a07d` 之前:`season.id = 272432`(独立编号)
- `f69a07d` 之后 / 我们的 cron (c1ce1f7) 写出来的 tree 里:`season.id = show.id = 35517044`(跟 show 同 id)
- `6d3149f` (每日数据):又改回 `season.id = 272432`,而且 `vote_average` 8.2 → 7.861

也就是 HEAD/6d3149f 跟 OURS/c1ce1f7 的 parent (f69a07d) 在 **season object id 字段上不一致**,而且顺手改了 vote_average。这部分是每日数据 cron 引入的,不是国产剧 cron 该管的。

**字段级合并要按 `season_number` 对齐**,**不要按 `season.id`**。否则会找不到对应 season,或者把 "id=272432 的旧 schema season" 跟 "id=35517044 的新 schema season" 误当两个不同 season。

## 字段归属规则 (字段级合并时该取哪边)

| 字段 | 取值 | 理由 |
|---|---|---|
| `metadata.last_updated` | OURS | 时间戳,谁跑谁更新 |
| `metadata.update_log` | HEAD + OURS 合并去重 (按 `time`) | 两条记录都有意义 |
| `show[].status` / `episodes_info` / `in_production` | OURS | 国产剧 cron 的领域 |
| `show[].episode_count` (顶层) | OURS | 国产剧 cron 的领域 |
| `season[].episode_count` | OURS | 同上 |
| `season[].vote_average` / `douban_rating` | **HEAD** | 这是每日数据 cron 的领域 (可能引入了 schema drift);国产剧 cron 不改这个 |
| `season[].id` | HEAD | 跟随 schema drift 的最新版本,不引新冲突 |
| `season[].air_date` / `overview` / `poster_path` 等"内容"字段 | HEAD | 都不是国产剧 cron 的领域 |

**易错点**:字段级合并时如果按 `season.id` 对齐,会找不到对应 season,结果 OURS 的 ep_count 改不上去;如果按 `season_number` 对齐就 OK。

## 实现位置

| 路径 | 用途 |
|---|---|
| `~/.hermes/skills/cinescope/scripts/douban_cn_status_sync.py` 的 `_auto_merge_rebase_conflicts(repo, quiet)` 函数 | rebase 撞冲突时检查 `.git/rebase-merge` / `.git/rebase-apply`,对 JSON 冲突文件做字段级合并并 `git add` |
| 同一文件 `_merge_tv_cn_like(head, ours)` | 实际合并函数,遵循上表归属规则 |

工作流入口 (在 `main()` 里,原 `git pull --rebase` 那段):

1. 跑 `git pull --rebase origin main`,`check=False` 拿到 result
2. 如果 `rebase_result.returncode != 0` 且 `.git/rebase-merge` (或 `rebase-apply`) 存在 → 调 `_auto_merge_rebase_conflicts`
3. 返回空 (无未解冲突) → 跑 `git rebase --continue`
4. 还撞冲突 (非 JSON 之类) → 抛 `CalledProcessError`,原有的 except 路径报给主人

### ⚠ `git rebase --continue` 在 cron 无 TTY 卡编辑器（2026-07-05 修复）

第 3 步的 `git rebase --continue` 会尝试 commit replay 的 commit，git 默认调 `$EDITOR` 编辑 commit message。cron 环境**无 TTY 无 EDITOR** → 报：

```
error: Terminal is dumb, but EDITOR unset
Please supply the message using either -m or -F option.
error: could not commit staged changes.
```

**症状像 "git push 失败" 但实际在 commit/rebase 阶段就挂了**（脚本 except 路径把 stderr 头 1 行当 hint 打到 IM，主人看到的是 "git push 失败: error: Terminal is dumb..."）。2026-07-02~07-05 连续 4 天同一报错，根因是字段级自动合并稳定成功后每次都走到 `--continue` 就卡编辑器。

**修法**：脚本顶部加 `os.environ.setdefault("GIT_EDITOR", "true")`。`true` 命令直接返回 0 不修改 message，git 拿到"编辑完成"信号用原 message 继续。`setdefault` 不覆盖用户已设值（交互调试时主人 shell 里的 `$EDITOR` 不受影响）。验证：`GIT_EDITOR=true git var GIT_EDITOR` 输出 `true`。

**不适用 `git_helpers.py` 入口**：走 `git_helpers.sync_repo_to_remote_tip` / `safe_pull_rebase_with_conflict_resolution` 的脚本不受此坑影响（lib 内部 reset 对齐，不调 `--continue`）。此坑只针对**手写 commit 链路 + 手动 `rebase --continue`** 的脚本（本文件描述的字段级合并分支即属此类）。通用规则已沉淀到 `devops/git-repo-sync` Pitfall 8。

## 验证方法

临时分支演练:

```bash
cd /Users/lrwei91/Documents/Project/CineScope
git checkout -b test-auto-merge
git reset --hard 6d3149f      # 模拟 stale base
git cherry-pick c1ce1f7        # 复现冲突
# 在脚本调用 _auto_merge_rebase_conflicts(repo)
git cherry-pick --continue --no-edit
git checkout main && git branch -D test-auto-merge
```

跑过后应看到 `cherry-pick` 自动成功,合并后的 commit 内容跟手动 rebase + Python 合并的结果对得上 (status / episode_count 取 OURS,vote_average 取 HEAD)。

## 2026-06-30 实测案例 (29 部更新冲突)

| 时刻 (BJT) | 事件 |
|---|---|
| 06:00 | 国产剧 cron 跑完,commit `c1ce1f7` |
| 06:01 | push 阶段 `git pull --rebase` 撞 7-hunk 冲突,err.log 留 stderr,投递给主人 |
| 11:13 | 主人让我手动解 (走今日 rebase + Python 字段级合并) → push `2de80ef` 成功 |
| 11:14 | 同步 patch 脚本:`_auto_merge_rebase_conflicts` + `_merge_tv_cn_like` |
| 11:15 | 临时分支上 cherry-pick c1ce1f7 复现,自动合并 11/11 字段对得上,临时分支删 |

**关键教训**:

1. 6/30 06:00 跑完**不报错**;是 06:01 push 阶段 rebase 失败。主人看到的"06:01 冲突通知"在 script 看起来是 `git push 失败` 提示,实际是 rebase 撞冲突。
2. 误判过一次"国产剧 cron 跑前没拉最新代码" —— 实际是 rebase 撞冲突,`check=True` 直接抛。修法不是"加 rebase",而是"撞冲突时自动解决"。
3. `err.log` (`~/.hermes/logs/douban_cn_status_sync.err.log`) 留 stderr 头 1 行 + 完整 stderr;以后排查时**先 grep 这文件**,再用 `crontab -l` / `jobs.json` 三件套。

## 已知边界 / TODO

- **只对 `*.json` 文件生效**:非 json 冲突 (如 `*.md` 二进制不一致) 直接留给主人手动处理。
- **只对 `tv_cn_complete.json` 这套 schema 严格生效**:`metadata` + `shows[]` + `seasons[]` 这套结构。`movie_cn_*.json` / `tv_us_*.json` / 猫眼 等文件如果未来撞同类型冲突,合并函数会跑通 (因为逻辑只看 `metadata` + `shows`) 但字段归属不严谨,**不预期它们用这个分支**。
- **schema drift 根因没修**: 6d3149f 改 `season.id = 272432` 这件事属于每日数据 cron 的回归,跟国产剧 cron 没关系。留给那个 cron 自己处理。
- **2026-06-30 修法只覆盖国产剧 cron 这一条链路**。其他 CineScope 同步任务 (`douban_weekly_update.py`, `cinescope_trailer_update.py`, `daily_stock_analysis` 等) 如果将来也撞 rebase 冲突,**不会被自动解决**。要复用这个机制就 `from douban_cn_status_sync import _auto_merge_rebase_conflicts, _merge_tv_cn_like` 然后塞进各自的 push 流程。
