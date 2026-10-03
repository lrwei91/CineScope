# trailer id 漂移导致重复误报 (2026-06-06)

## TL;DR

`generate_douban_catalog.mjs` 每次从零重建 `*_complete.json`,`movie` / `tv` 的 `id` 都来自豆瓣 API `candidate.id`（不同端点返回的 id 不同）。`cinescope_trailer_update.py:save_trailer_baseline_for` 用 `item["id"]` 当唯一 key，id 漂移时同一组 trailers 会被误报"新增"。

**症状**：6/4 跟 6/5 推送的"2 部新增"内容字节级一致（同一组 bvid、同一组 movie 名字），但 trailer 实际没新增。

**适用范围**: **movie + tv 都有** (6/6 验证 tv 同样漂移, 之前以为 tv 走 TMDB id 稳定是错的)

## 完整时间线 — movie (以《给阿嬷的情书》《镖人:风起大漠》为例)

| 时点 | 给阿嬷 id | 镖人 id | trailers | 触发者 |
|---|---|---|---|---|
| 6/3 20:02 trailer cron 后 | 1671548 | 1305781 | 3 / 1 | 本地 trailer 任务 |
| 6/4 02:21 Actions 每日数据 | 1671548 | 1305781 | 3 / 1 | GitHub Actions |
| 6/4 16:49 Actions 每日数据 | 1671548 | 1305781 | 3 / 1 | GitHub Actions |
| 6/4 20:02 trailer cron 后 | **37116446** | **36474027** | 3 / 1 | 本地 trailer (Node 重建) |
| 6/5 06:01 同步国产剧状态 | **1671548** | **1305781** | 3 / 1 | Node 重建（id 回归） |
| 6/5 20:03 trailer cron 后 | **37116446** | **36474027** | 3 / 1 | 本地 trailer (Node 再重建) |

id 在 6/4 ~ 6/5 之间反复漂移（1671548 ↔ 37116446），trailers 内容字节级一致。

## 完整时间线 — tv (以《雨霖铃》为例，6/6 验证)

| 时点 | 雨霖铃 id | trailers | 触发者 |
|---|---|---|---|
| 6/3 20:02 trailer 之前 | 254486 | 1 | (old) |
| 6/3 20:02 trailer 之后 | **36310054** | 1 | **本地 trailer 触发漂移** |
| 6/4 16:49 Actions 之后 | 254486 | 1 | Actions 反向漂移 |
| 6/4 20:02 trailer 之后 | 36310054 | 1 | 本地 trailer 再漂移 |
| 6/5 16:30 Actions 之后 | 254486 | 1 | Actions 反向漂移 (稳定) |
| 6/6 trailer (我跑的) | 254486 | 1 | 跟 e4b3542 一致 (稳定) |

**关键观察**: tv id 漂移规律跟 movie 一样, douban_search 路径 + GitHub Actions 路径会触发不同 id 漂移. 同一组 trailers 通过 `preservedTrailers` title 兜底跟过去, 但 id 漂移导致 GitHub Pages 部署看到不一致的 id.

## 误报链路详解（6/5 trailer cron 为例）

1. 20:02 cron 启动 → `git pull --rebase` 成功 → 工作区 = `035c258`（6/5 06:01 提交）
2. 20:02 `save_trailer_baseline_for` 读 JSON:
   - `id=1671548` 给阿嬷 → 3 bvid (BV1ypLE6PEBS, BV1FkRJBZEWL, BV1mZRiBDEQJ)
   - `id=1305781` 镖人 → 1 bvid (BV1bQVf6SE6z)
3. 20:02-20:03 `node scripts/generate_douban_catalog.mjs` 跑完
   - id 漂移到 `37116446` / `36474027`
   - trailers 内容**没变**, bvid 跟 baseline 完全一致
4. 20:03 `diff_trailers`:
   - 当前 `id=37116446` 给阿嬷 → baseline 查 37116446 没找到 → 报"新 id,前空" → **误报 3 个新增**
   - 当前 `id=36474027` 镖人 → baseline 查 36474027 没找到 → **误报 1 个新增**
5. 推送消息: "2 部新增,0 补充" — 跟 6/4 内容完全一致 (同样 4 个 bvid)

## 为什么报告口径铁律没拦住?

"报告口径铁律" 段要求"用 bvid set 对比, 不是 trailer 数量"。当前 `cinescope_trailer_update.py` 确实是用 bvid set 做的差集 — 问题是:

- baseline 是 `{id_1671548: {3 bvid}, id_1305781: {1 bvid}}`
- 当前 是 `{id_37116446: {3 bvid}, id_36474027: {1 bvid}}`
- 遍历当前时查 baseline[id_37116446] → 找不到 → 默认 `set()` → `current - set() = current` → 全部当新增
- 即使 trailer 集合完全相同, **只要 id 变了就会被误报**

## 已实施修复 (2026-06-06)

### 方案 1: Node 端 id 锁定 (根治, 双 kind 适用)

`generate_douban_catalog.mjs:backfillFromExistingItems` 在 `merged = { ...newItem }` 之后追加:

```javascript
// 注意: 不分 kind, movie + tv 都锁. 之前 `kind === 'movie'` 限制是错的, 6/6 验证 tv 也漂移.
if (oldItem.id != null) {
    merged.id = oldItem.id;
}
```

**为什么用 backfill 而不是 `toDoubanCollectionItem` 改 stable id**: backfill 已经按 signature/tmdb/douban_link 三个 key 找了 oldItem, 找到就证明 merged 跟 oldItem 是同一部, 锁 id 是 backfill 应有的语义. `toDoubanCollectionItem` 改 stable id 风险大 (全量回归 + 其他依赖 id 的逻辑).

### 方案 2: Python 端 (id, title) 双键 baseline (防御)

`cinescope_trailer_update.py:save_trailer_baseline_for` 改用双键结构:

```python
# baseline = {category_name: {key: bvid_set}}
# key 是 str(id) (主) 或 "title::<normalized_title>" (兜底)
def _normalize_title(title):
    cleaned = re.sub(r"\(\d{4}\)", "", title or "")
    return re.sub(r"\s+", " ", cleaned).strip().lower()

# 写入时: id 优先, title 兜底
base[str(item_id)] = bvids
base.setdefault(f"title::{title_key}", bvids)

# diff_trailers: id 查不到时, 用 title 查
prev_keys = prev_by_key.get(str(tid))
if prev_keys is None:
    title_key = _normalize_title(title)
    if title_key:
        prev_keys = prev_by_key.get(f"title::{title_key}")
```

**为什么保留双键 (而不是只方案 1)**: 方案 1 修新 run 跨次稳定, 但**历史 commit 已漂移的 id 仍然存在** (git 历史无法改). Python 双键让 baseline 能正确匹配历史漂移 id 的 trailers, 防止 cron 永远误报.

## 验证 (3 时点全绿)

| 时点 | 修复前 | 修复后 | 真实状态 |
|---|---|---|---|
| 6/3 (9819dc0 → b57493d) | NEW 3 部 ✅ | NEW 3 部 ✅ | 真新抓 3 部 |
| 6/4 (1121ff5 → 6353380) | NEW 2 部 ❌ 误报 | NEW 0 部 ✅ | 实际无新 trailer |
| 6/5 (035c258 → 615c5eb) | NEW 2 部 ❌ 误报 | NEW 0 部 ✅ | 实际无新 trailer |

## 已废弃方案 (保留备查)

### 方案 A (原方案 A 单一 title 兜底) — 已被方案 2 取代

之前文档里写的"方案 A 只加 title 兜底"已经被方案 2 (id + title 双键) 取代. 双键比单 title 兜底更精准, 因为同名同年不同剧的 title 会冲突 (罕见但存在).

### 方案 B (改 toDoubanCollectionItem 用 stable id) — 风险大未采纳

```javascript
function toDoubanCollectionItem(candidate) {
    const stableId = candidate.douban_id || candidate.id;
    return { id: stableId, ... };
}
```

风险: 需全量回归验证, 可能影响其他依赖 id 的逻辑 (如 build_report.json 计数). **6/6 决定不采纳**, 走方案 1 (backfill 锁 id) 风险更低.

### 方案 C (全局 bvid 集合差集) — 丢失 movie 关联

放弃 movie 维度, 只汇报"本轮出现了哪些新 bvid".

缺点: 丢失 movie 关联, 用户看到一长串 bvid 不知道属于哪部片. 6/6 决定不采纳.

## 关键 commit 索引

| commit | 作用 |
|---|---|
| `6353380` (6/4 20:02) | trailer cron 第一次 movie 漂移 (id → 37116446) |
| `1121ff5` (6/4 16:49) | Actions 每日数据更新 (movie id 还是旧) |
| `035c258` (6/5 06:01) | 同步国产剧状态 (movie id 回归旧值, tv id 漂移到长 id) |
| `615c5eb` (6/5 20:03) | trailer cron movie 再漂移 |
| `e4b3542` (6/5 16:30) | Actions tv id 反向漂移到短 id |
| `d330877` (6/6) | backfill lock movie id (kind === 'movie' 限制, 仅 movie) |
| `e72c3bc` (6/6) | stripHtmlTags 修 B 站 v2 search API title |
| `eb49570` (6/6) | backfill lock id 统一 movie+tv (去掉 kind 限制) |

## 相关 issue

- 6/3 同样问题: trailer 数量 / bvid 漂移到不同 movie — 见 `references/trailer-diff-bvid-set.md`
- 两者区别: 6/3 是 **bvid** 漂移到不同 movie (merge 算法问题), 6/6 是 **item id** 漂移 (candidate.id 不稳定). 修复点不同.
- 6/6 验证: tv 也有 id 漂移 (雨霖铃 `254486` ↔ `36310054`), 之前以为 tv 走 TMDB 稳定是错的.
