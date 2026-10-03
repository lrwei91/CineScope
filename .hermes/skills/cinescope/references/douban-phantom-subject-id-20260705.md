# 8 位 subject_id 幽灵条目 404 坑

> 沉淀自 2026-07-05 `douban_cn_status_sync.py` cron 输出 `⚠ HTTP 404 (size=155)` + `API 失败 1` 排查实战。
> 与 `douban-old-subject-id-pitfall-20260628.md` 是**不同问题**：那批是 ≤6 位老 ID（v2 API 全不支持），这批是 8 位 ID 但豆瓣侧不存在。

## 现象

cron `55762d895c40`（每天 6:00）stdout：

```
⚠ HTTP 404 (size=155)
📌 国产剧同步 · 07-05 06:01

📊 共 225 / 完结跳过 171 / 待检查 54 / 更新 24 / 无变化 30 / API 失败 1
```

`--verbose --dry-run` 定位到失败条目：

```
[4/51] 入戏(37659239)...   ⚠ HTTP 404 (size=155)
⚠ API 失败
```

## 根因

`入戏` 的 `id=37659239`（8 位，通过 `len(sid) <= 6` 跳过逻辑），但豆瓣 Rexxar v2 TV API 返回 404：

```bash
curl -sS -H "User-Agent: Mozilla/5.0" \
  "https://m.douban.com/rexxar/api/v2/tv/37659239"
```

响应：

```json
{
  "request": "GET /v2/tv/37659239",
  "msg": "traversal_error",
  "code": 404,
  "localized_message": "要访问的内容不存在"
}
```

该 ID 在豆瓣侧已删除 / 下架 / 从未存在。JSON 里 `id` 字段不是 TMDB ID（`tmdb_id=303084` 与 `id=37659239` 不同），是录入时填入了一个豆瓣不认识的 subject_id。

## 与老 ID 坑的区别

| 维度 | 老 ID 坑（6/28） | 幽灵条目坑（7/5） |
|---|---|---|
| ID 位数 | ≤6 位 | 8 位（正常位数） |
| 占比 | 66%（146/221） | 个例（1 部） |
| 根因 | v2 API 不支持老 ID 空间 | 豆瓣侧条目不存在 |
| 脚本是否跳过 | ✅ `len(sid) <= 6` 跳过 | ❌ 通过跳过逻辑，仍发请求 |
| 影响 | 8 部每天浪费请求 | 1 部每天 1 次 404 噪音 |

## 诊断 SOP

```bash
# 1) --verbose --dry-run 定位哪个 ID 404
cd /Users/lrwei91/Documents/Project/CineScope && \
  ~/.hermes/hermes-agent/venv/bin/python \
  ~/.hermes/skills/cinescope/scripts/douban_cn_status_sync.py --verbose --dry-run 2>&1 | grep "404"

# 2) curl 确认是 traversal_error（条目不存在）而非临时故障
curl -sS -H "User-Agent: Mozilla/5.0" \
  "https://m.douban.com/rexxar/api/v2/tv/<sid>"
# 返回 {"msg":"traversal_error","code":404} = 幽灵条目
# 返回 {"msg":"rate_limited","code":429} = 限流，不是幽灵

# 3) 确认 id 不是误填的 tmdb_id
python3 -c "
import json
d = json.load(open('json/tv_cn_complete.json'))
for s in d['shows']:
    if str(s.get('id')) == '<sid>':
        print(f'id={s[\"id\"]} tmdb_id={s.get(\"tmdb_id\")} same={s[\"id\"]==s.get(\"tmdb_id\")}')
"
# same=False 说明 id 不是 tmdb_id，是填错的豆瓣 subject_id
```

## 处理方案（按 ROI 排序）

| # | 方案 | 改动 | 状态 |
|---|---|---|---|
| 1 | **不管它**：1 次 API 失败不影响 24 部更新，404 噪音可接受 | 0 | 临时默认，已废弃 |
| 2 | **JSON 里标记完结/移除**：把 `入戏` 的 `status` 改成 `completed`，不再进 active 列表 | 改 1 行 JSON | 未采用（需人工确认是否真下架） |
| 3 | **脚本加连续 404 自动跳过** ✅ | 脚本 +30 行 | **2026-07-05 已实施** |

## 实施记录

### 2026-07-05 — 已实施方案 3（连续失败自动跳过）

主人选了方案 b（自动化自愈），不选人工改 JSON 也不留噪音。改动落在 `scripts/douban_cn_status_sync.py`，6 处 patch：

**机制**：

1. 常量 `API_FAIL_THRESHOLD = 3`
2. 每个 show 新增 `api_fail_count` 字段（int，默认 0）
3. 主循环顶部检查：`api_fail_count >= 3` → 计入 `auto_skipped`，`continue`，不调 `fetch_api`
4. `fetch_api` 返回 None → `api_fail_count += 1`，置 `fail_counts_changed = True`
5. `fetch_api` 成功 → `api_fail_count` 归 0（仅当原值 > 0 时才置 flag）
6. 持久化条件从 `if updated` 放宽到 `if updated or fail_counts_changed`；commit message 区分两种情况（`chore: 同步国产剧状态: N 部更新` vs `chore: 更新 API 失败计数（自动跳过机制）`）

**输出变化**（quiet 模式）：

```
📊 共 225 / 完结跳过 171 / 待检查 54 / 更新 24 / 无变化 30 / 自动跳过 1 / API 失败 1
```

`自动跳过 N` 仅在有达阈值条目时出现；`API 失败 N` 仍统计本轮实际请求失败数（未达阈值的）。

**验证**：5 场景单测全通过（首次失败递增 / 达阈值不请求 / 成功重置 / 真实 37659239 返回 None / 真实 35633152 返回数据）。备份在 `douban_cn_status_sync.py.bak.api-fail-skip`。

**自愈语义**：`入戏` 再失败 2 次（7/6、7/7）后，7/8 起自动跳过，不再产生 `⚠ HTTP 404` 噪音。若豆瓣侧恢复该 ID，成功一次即重置，自动恢复同步——无需人工干预。

### 2026-07-05（早段）

- 沉淀 reference：记录诊断 SOP + 与老 ID 坑的区别
- SKILL.md §1 加陷阱行

## 相关资源

- 主 skill: `cinescope/SKILL.md` §1 已知陷阱
- 老 ID 坑（不同问题）: `references/douban-old-subject-id-pitfall-20260628.md`
- 失败条目：`入戏(37659239)`，tmdb_id=303084，status=`Returning Series`
