# 预告片 diff 口径: bvid set 而非数量

## 为什么不能用 trailer 数量

```python
# ❌ 错误实现 (cinescope_trailer_update.py:54-69, 6/3 之前)
for item in data:
    tid = item.get("id")
    t_count = len(item.get("trailers", []))
    p_count = prev.get(name, {}).get(tid, 0)
    if t_count <= p_count:
        continue
    # ↑ 这把"movie A 的 trailers 从 0 → 1"算成"1 部新增预告片"
    # ↑ 但实际上是 bvid-X 漂移: 之前 bvid-X 匹配 movie B, 本次匹配 movie A
```

## 漂移的真实场景

- B 站 UP `8465957` 视频标题如: `国产超人返乡！超能力不敌人情世故！2026超英喜剧片《特立独行》定档预告`
- `scoreTrailerMovieMatch()` 走标题/别名包含匹配, 受 `TRAILER_DESCRIPTOR_PATTERNS` (官方/电影/院线/...) 影响
- `mergeTrailersIntoCatalogItems` 没在 `{movie.id, bvid}` 配对级 dedupe
- 同一次 cron 跑出来的 15 部"新增", 其中:
  - 真实新增: 特立独行 (movie_cn 之前没匹配上) ← 1 条
  - 漂移: 同一 bvid 这次匹配到《特立独行》, 上次匹配到其他同名/别名相似的 movie ← 大量
  - 跨分类串味: movie 分类报告里出现《雨霖铃》《低智商犯罪》《逐玉》(全是 tv_cn 电视剧名)

## 正确实现

```python
def collect_bvid_set(item):
    """从单条 movie/tv 条目提取 bvid 集合 (空 title / 无 bvid 跳过)"""
    title = (item.get("title") or "").strip()
    if not title or title == "?":
        return None  # 标记为 "skip - bad item"
    return {t["bvid"] for t in item.get("trailers", []) if t.get("bvid")}


def diff_trailers_by_bvid(prev: dict) -> tuple[list, list, list]:
    """
    返回 (新增条目列表, 补充条目列表, 异常项列表)
    - 新增条目: 上一版 bvid 集合为空, 当前非空
    - 补充条目: 当前 bvid 集合 ⊃ 上一版 (新增 bvid 数量 > 0)
    - 异常项: 空 title 或无 bvid 的项
    """
    new_items, updated_items, anomalies = [], [], []
    for name in CATEGORY_JSON_FILES:
        fpath = JSON_DIR / f"{name}.json"
        try:
            with open(fpath) as fh:
                items = json.load(fh)
        except (FileNotFoundError, json.JSONDecodeError):
            continue

        key = "shows" if name.startswith("tv") else "movies"
        data = items.get(key, items) if isinstance(items, dict) else items

        for item in data:
            tid = item.get("id")
            if tid is None:
                continue
            cur_set = collect_bvid_set(item)
            if cur_set is None:
                anomalies.append((tid, item.get("title", "?"), name, "empty_title"))
                continue
            prev_set = prev.get(name, {}).get(tid, set())
            added = cur_set - prev_set
            if not added:
                continue
            added_titles = [t.get("title", "?") for t in item.get("trailers", []) if t.get("bvid") in added]
            entry = (tid, item.get("title", "?"), name, added_titles)
            if not prev_set:
                new_items.append(entry)
            else:
                updated_items.append(entry)
    return new_items, updated_items, anomalies
```

## 配套 format_report 改造

```python
def format_report(new_items, updated_items, anomalies):
    lines = []
    if anomalies:
        lines.append(f"⚠️ {len(anomalies)} 条异常项 (空 title/无 bvid), 已跳过")
    if new_items:
        # 按 category 分组, 不要把 movie_cn 和 tv_cn 混在一起
        by_cat = {}
        for tid, title, cat, t_titles in new_items:
            by_cat.setdefault(cat, []).append((title, t_titles))
        for cat, entries in by_cat.items():
            lines.append(f"--- {cat} 新增 ({len(entries)}) ---")
            for title, t_titles in entries:
                lines.append(f"  {title}")
                for t in t_titles:
                    lines.append(f"    ▶️ {t}")
    # ... 补充段同样按 category 分组
    return "\n".join(lines)
```

## 验证步骤

```bash
# 跑完 cron 后, 手验: 同一 bvid 出现在多部电影的 trailers 里?
python3 -c "
import json, glob
bvid_to_movies = {}
for f in glob.glob('json/*_latest.json'):
    data = json.load(open(f))
    key = 'shows' if 'tv' in f else 'movies'
    for item in data.get(key, []):
        for t in item.get('trailers', []):
            bvid = t.get('bvid')
            if bvid:
                bvid_to_movies.setdefault(bvid, []).append(item['title'])
duplicates = {b: m for b, m in bvid_to_movies.items() if len(m) > 1}
if duplicates:
    print('⚠️ 同一 bvid 出现在多部电影 (漂移):')
    for b, m in duplicates.items():
        print(f'  {b}: {m}')
else:
    print('✅ 无漂移')
"
```

## 配套补丁清单 (2026-06-03 状态更新)

- [x] `cinescope_trailer_update.py:diff_trailers` 改用 bvid set — 本文件"正确实现"段已合入
- [x] `cinescope_trailer_update.py:format_report` 按 category 分组 + 异常项警告 — 已合入
- [x] `scripts/lib/bilibili-trailers.mjs:mergeTrailersIntoCatalogItems` 加 `assignedBvids` 集合实现 `{movie.id, bvid}` 配对级 dedupe — CineScope commit `4a565db` 已 push
- [x] SKILL.md 报告口径铁律段补"按 category 分组不要混 movie_cn 和 tv_cn" — 已合入
- [ ] `scripts/lib/git_helpers.py:push_with_retry` 升级到 5 次 + 指数退避 + SSL 抖识别 — **用户明确跳过本次修复 (2026-06-03)**; 6/2 SSL 抖时 3 次重试全挂, commit 留在本地未 push, 等下次 session 单独修复

---

# 二次事故: item id 漂移 → 误报"新增预告片" (2026-06-06, tv 部分 6/6 验证补全)

## 现象

6/4 跟 6/5 trailer cron 报告**完全一样**("2 部新增: 给阿嬷/镖人"),但实际 trailer 数据没变。git 模拟 diff 显示两天的 trailers 集合都是 `4 个 bvid` (3+1)。

## 根因

`generate_douban_catalog.mjs:generateDoubanSearchResults` 走 `findDoubanMatchBySearch` → `doubanSearchCache.fetchSearch` → 拿 `pickBestDoubanSearchCandidate(searchItems, ...)`。**同一 query 多次跑的 searchItems 顺序不稳定**,导致选中的 `candidate.id` 不同。**Movie + tv 都受影响** (6/6 验证 tv 也漂移):

| 时点 | 给阿嬷 id (movie) | 镖人 id (movie) | 雨霖铃 id (tv) | 触发 |
|---|---|---|---|---|
| 6/3 20:02 trailer 前 | 1671548 | 1305781 | 254486 | (old) |
| 6/3 20:02 trailer 后 | 1671548 | 1305781 | **36310054** | 7/8 位 search_id 漂移 |
| 6/4 16:49 Actions | 1671548 | 1305781 | 254486 | Actions 反向漂移 |
| 6/4 20:02 trailer 后 | **37116446** | **36474027** | 36310054 | trailer 再漂移 |
| 6/5 06:01 sync | 1671548 | 1305781 | 36310054 | sync 反向漂移 |
| 6/5 20:03 trailer | **37116446** | **36474027** | 36310054 | trailer 再漂移 |
| 6/5 16:30 Actions | 1671548 | 1305781 | 254486 | Actions 稳定 |
| 6/6 我跑 (commit eb49570) | 1671548 | 1305781 | 254486 | 跟 Actions 路径一致, 稳定 |

**关键发现**: movie + tv id 都漂移. 之前以为 tv 走 TMDB id 稳定是错的, douban_search 同样会改 tv id.

Python `cinescope_trailer_update.py:save_trailer_baseline_for` 用 `item["id"]` 当 key。id 变了 → 基线查不到 → 报"新 id, 前空" → 误报"新增"。

更糟的是 `backfillFromExistingItems`(CineScope 内部)找到了 oldItem,merge 了 rating/poster/crew/seasons,但**漏了 id 字段** —— `merged = { ...newItem }` 后没追加 `merged.id = oldItem.id`。

## 双修复 (2026-06-06 已合入)

### 1) Node 侧: 锁定 id (根治, movie + tv 都锁)

`scripts/generate_douban_catalog.mjs:backfillFromExistingItems` 在 `merged = { ...newItem }` 之后加:

```javascript
// 0. Lock id (2026-06-06): douban_search 每次跑返回的 candidate.id 不稳定,
// 同一电影/电视剧在不同 run 会被分配到不同 subject_id,导致 cron diff 误报"新增"。
// 既然 backfill 已经按 signature/tmdb/douban_link 三个 key 找 oldItem,
// 那就说明 merged 和 oldItem 是同一部 —— 直接用 oldItem.id 锁定,跨 run 稳定。
// 无 kind 限制: movie + tv 都锁 (6/6 验证 tv 也漂移).
if (oldItem.id != null) {
    merged.id = oldItem.id;
}
```

**commit 演进**:
- `d330877` (6/6 第一版): `kind === 'movie'` 限制, **仅 movie** (当时以为 tv 稳定)
- `eb49570` (6/6 第二版): 去掉 kind 限制, movie + tv 统一 (验证 tv 也漂移)

### 2) Python 侧: (id, title) 双键 baseline (防御)

`cinescope_trailer_update.py:save_trailer_baseline_for` 改成双键结构:

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

## 验证 (修复后回放 6/3-6/5 三个时点)

| 时点 | 修复前 | 修复后 | 真实状态 |
|---|---|---|---|
| 6/3 (9819dc0 → b57493d) | NEW 3 部 ✅ | NEW 3 部 ✅ | 真新抓 3 部 |
| 6/4 (1121ff5 → 6353380) | NEW 2 部 ❌ 误报 | NEW 0 部 ✅ | 实际无新 trailer |
| 6/5 (035c258 → 615c5eb) | NEW 2 部 ❌ 误报 | NEW 0 部 ✅ | 实际无新 trailer |

3 个时点全绿。

## 教训

- **id 漂移是 douban_search API 的固有问题**, 锁定 id + 双键 baseline 必须**双管齐下**:
  - Node 锁定防止"再写一次又漂移"
  - Python 双键防止"历史 commit 已漂移"导致 cron 永远误报
- 凡是"用 item.id 当 key 跨 run 对比"的代码,都要评估 id 稳定性
- 修复完成后,要在历史 commit 上做回放验证(不能只信"未来 run")
- **同时锁 movie + tv,不能只锁一个**(2026-06-08 教训: 初次只锁 movie, tv 仍漂移 254486 ↔ 36310054)
- 修复完成后,跨历史 commit 验证 5 部以上已知会漂移的剧 id 是否稳定

---

# 三次事故: searchFromCatalog 上线后的连环 bug (2026-06-08)

按时间顺序排列,每条都来自这次"按 catalog latest 列表搜预告片"功能上线的真实跑次。

## 3.1 B 站 v2 search API title 含 HTML 高亮标签

**症状**: `searchBilibiliTrailerRowsForCatalogItems` 拿到的 row.title 形如:
```
新剧《<em class="keyword">主角</em>》发布预告，张嘉益/刘浩存/...
```

`buildTrailerCandidateKeys` 没 strip HTML,输出 keys 形如:
```
'新剧<emclass=keyword>主角</em>张嘉益/刘浩存/秦海璐/窦骁'
```

跟 movie key `主角` 完全匹配不到 → `scoreTrailerMovieMatch` 全返回 -1 → 误过滤所有 row。

**修复**: `buildTrailerCandidateKeys` 入口先 `stripHtmlTags(String(title || ''))`:
```javascript
function stripHtmlTags(value) {
    return String(value || '').replace(/<[^>]+>/g, '');
}
```

**影响范围**: searchFromCatalog 全路径。修后《主角》《雨霖铃》等罐头预告片 UP 发过的剧能正确匹配。

## 3.2 `normalizeManualTrailer` 静默丢弃额外字段

**症状**: `searchTrailerRowsForCatalogWithCache` 内部按 `_matchedItemId` 分桶写 cache,所有 row `_matchedItemId=undefined`,cache rows 写不进去。

**根因**: `dedupeTrailerCollections` 内部 `normalizeManualTrailer` 只返回 7 个标准字段,丢弃所有其他字段(包括 `_matchedItemId`):
```javascript
return {
    source, title, bvid, url, embedUrl, cover, publishedAt
    // _matchedItemId, upMid, manual_added, ... 全部丢失
};
```

**修复**: 末尾追加 spread 保留额外字段:
```javascript
return {
    source, title, bvid, url, embedUrl, cover, publishedAt,
    ...(trailer._matchedItemId ? { _matchedItemId: trailer._matchedItemId } : {})
};
```

**教训**: 当 normalize 函数返回"干净"对象,上游 caller 可能 stash 额外元数据(分桶 key / 标记字段),会被静默 drop。**默认行为应是保留所有非冲突字段**,而不是只 whitelist 标准字段。

## 3.3 cache "0 rows 写进 TTL" 的陷阱

**症状**: 6/6 跑时 B 站 `x/space/arc/search` 限流 (`code=-799`, 后变 412), searchFromCatalog 拿 0 rows, 仍然把 34 部剧的 `searched_at` + 空 rows 写进 cache, 7 天 TTL 锁定。**6/6-6/13 期间即使限流解除, searchFromCatalog 仍按 cache 跳过这 34 部, 不会重搜**, 错过 UP 主新发布的 trailer。

**修复**: `searchTrailerRowsForCatalogWithCache` 写 cache 条件加 `newRows.length > 0`:
```javascript
// 2026-06-07: 0 rows 不写 cache
if (staleItems.length > 0 && newRows.length > 0) {
    // ... 写 cache
}
```

**教训**:
- 0 rows 不等于"搜完确认无结果" — 也可能是限流 / 异常被 catch
- TTL 缓存对 "真无结果" vs "搜失败" 必须区分, 否则限流期会永久锁死
- 副作用: 每次跑都重搜 0 rows 的剧, 35 部 × 1.2s ≈ 40 秒, 可控

## 3.4 验证方法: 跨 commit git show 回放

**症状**: 怀疑 trailer 报告误报时, 不能信 cron log, 必须**用历史 commit 的 JSON 状态回放**。

**步骤**:
```python
import json, subprocess
def get(ref):
    out = subprocess.run(['git', 'show', f'{ref}:json/tv_cn_complete.json'],
                         capture_output=True, text=True).stdout
    return json.loads(out)

# 看某剧在多个 commit 的 id 变化
for ref in ['a0ee850', 'b57493d', '1121ff5', '6353380', 'HEAD']:
    d = get(ref)
    for m in d.get('shows', []):
        if m.get('name') == '雨霖铃':
            print(f'  {ref:10s} | id={m["id"]:>8} | trailers={len(m.get("trailers",[]))}')
```

**实战价值**: 发现 6/3 trailer 跑完《雨霖铃》id `254486 → 36310054`,6/5 16:30 Actions 反向漂移回 `254486`。如果只看 cron log 永远看不到这个。

## 3.5 端到端验证清单

跑完一次 tv_cn 后必查:
1. `cache.total > 0` 且 `cache《迷墙》.rows=1` (验证 `_matchedItemId` 修复 + cache 写入)
2. `with_trailer` 数量 vs prev commit 比较 (验证 merge 正确)
3. 跨至少 5 部剧验证 `id` 跨 commit 稳定 (验证 id 锁修复)
4. 选 3 部 trailer 出现变化的剧, 看 JSON 里 trailers 数组的 bvid 是否跟 cache rows bvid 一致
5. 如果 bvid 不一致 → `mergeTrailersIntoCatalogItems` 的 `assignedBvids` 去重可能吃掉了 row

## 3.6 B 站限流状态码速查

| 状态 | 含义 | 应对 |
|---|---|---|
| `code=-799` msg "请求过于频繁" | 限流中 | 不重试, 等 |
| HTTP 412 Precondition Failed | 限流(更严) | 同上 |
| HTTP 200 + code=0 但 result[0].mid=None | 响应是 tips 类型, 不是 video | 已修 (video group 解析) |
| `title` 含 `<em class="keyword">` | 正常响应, 标签是前端高亮用 | stripHtmlTags |
