# searchFromCatalog — 按 catalog 列表逐部搜预告片 (2026-06-06)

## 触发场景

**症状**: 某些 catalog item (movie / tv) **完全没 trailer**, 但项目里 *应该* 有 (它们是最新季度的片, B 站 UP 主空间没及时收录)。

**6/6 实测数据**: tv_cn latest 34 部剧里 **23 部没 trailer** (68%), 即 UP 主 `229864363` (罐头预告片) 没发这些剧的 trailer。

**老方案** (`searchFromCatalog` fallback) 的问题:
- `BILIBILI_TRAILER_ENABLE_SEARCH_FALLBACK` 默认 `false` → 多数 cron 跑不开
- 即便开, 也只在 UP 主空间拉取完后再补搜, **慢** + **对每部剧都重搜** 无缓存

**新方案**: **并行主路径** — UP 主空间 + 按 latest 列表逐部搜, merge dedupe, 7 天缓存。

## 架构

```
buildCategoryData(spec):
  ↓
  backfilledItems = backfillFromExistingItems(...)
  ↓
  // 2026-06-06 提前生成 latestItems, 供 searchFromCatalog 用
  latestItemsForTrailerSearch = selectLatestItems(spec, backfilledItems)
  ↓
  // 现状: UP 主空间拉取
  trailerDataset = await loadBilibiliTrailerDataset(...)
  trailerRows = trailerDataset?.rows || []
  ↓
  // 2026-06-06 新增: 按 latest 列表逐部搜
  if (spec.trailerSource?.searchFromCatalog) {
      catalogSearchRows = await searchTrailerRowsForCatalogWithCache({
          items: latestItemsForTrailerSearch,
          mid, searchSuffix,
          cacheRelativePath: spec.trailerSource.searchFromCatalogCacheRelativePath,
          rootDir: ROOT_DIR,
          ...throttle/retry params
      })
  }
  ↓
  mergedTrailerRows = dedupeTrailerCollections([trailerRows, catalogSearchRows])
  ↓
  finalItems = mergeTrailersIntoCatalogItems(backfilledItems, mergedTrailerRows, {
      existingItems, overrides
  })
```

## searchTrailerRowsForCatalogWithCache 实现细节

### 输入
- `items`: catalog item 列表 (来自 `selectLatestItems(spec, backfilledItems)`)
- `mid`: B 站 UP 主 ID (tv_cn 用 `229864363`)
- `searchSuffix`: 搜索后缀 (tv_cn 用 `罐头预告片`)
- `cacheRelativePath`: 缓存文件路径 (`.cache/bilibili/tv-cn-search-from-catalog.json`)
- `rootDir`: CineScope 根目录

### 算法

```javascript
const cache = await readCache(cacheRelativePath);
const now = Date.now();
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

const freshRows = [];   // 缓存命中
const staleItems = [];  // 需重搜
for (const item of items) {
    const cached = cache[String(item.id)];
    if (cached && (now - Date.parse(cached.searched_at)) < TTL_MS) {
        freshRows.push(...cached.rows);
    } else {
        staleItems.push(item);
    }
}

let newRows = [];
if (staleItems.length > 0) {
    newRows = await searchBilibiliTrailerRowsForCatalogItems({
        items: staleItems, mid, searchSuffix, ...throttle
    });
}

// 写缓存 (按 _matchedItemId 分桶)
if (staleItems.length > 0) {
    const newEntries = {};
    for (const item of staleItems) {
        newEntries[String(item.id)] = { title, searched_at, rows: [] };
    }
    for (const row of newRows) {
        if (row._matchedItemId && newEntries[row._matchedItemId]) {
            const { _matchedItemId, ...clean } = row;
            newEntries[row._matchedItemId].rows.push(clean);
        }
    }
    await writeCache(cacheRelativePath, { ...cache, ...newEntries });
}

return dedupeTrailerCollections([freshRows, newRows]);
```

### 关键设计点

1. **`_matchedItemId` 标记** (lib 函数内部)
   - `searchBilibiliTrailerRowsForCatalogItems` 在 row 上加 `_matchedItemId` (search 阶段已用 `scoreTrailerMovieMatch > 0` 过滤)
   - 缓存读回时 row 不带这个标记 (写入时剥掉), 避免污染最终 trailers 数组
   - `mergeTrailersIntoCatalogItems` 仍会做 `assignedBvids` 全局去重

2. **7 天 TTL**
   - 新剧: 首次搜索必命中或落空, 缓存 7 天
   - 老剧: 7 天内不重搜 (B 站搜索结果短时间稳定)
   - 7 天后重搜, 抓到新增的 trailer (UP 主可能后续补发)

3. **缓存粒度: per item id**
   - 不存全局 row 列表, 存每个 item 的"自己匹配的 rows"
   - 读写都用 id 作 key, 避免"row 属于哪个 item"的歧义

4. **节流复用**
   - 用现有 `BILIBILI_TRAILER_REQUEST_DELAY_MS=1200` 节流
   - 用现有 `BILIBILI_TRAILER_MAX_RETRIES=3` 重试
   - 34 部剧串行 ≈ 50 秒, 不会拖慢 cron

## tv_cn vs movie_cn 决策

| 项 | tv_cn | movie_cn |
|---|---|---|
| searchFromCatalog | **✅ 开** | ❌ 不开 (漏抓比例低 7%) |
| 漏抓比例 (6/6 实测) | 23/34 ≈ 68% | 估计 < 10% |
| UP 主 | 罐头预告片 (229864363) | 乌鸦预告片 (8465957) |
| 搜索后缀 | 罐头预告片 | 乌鸦预告片 |
| 缓存路径 | `.cache/bilibili/tv-cn-search-from-catalog.json` | (n/a) |

**判断标准**: 漏抓 > 30% 时开 `searchFromCatalog`, 否则保持原状。

## 验证

### 6/6 修复前 vs 修复后 (6/6 20:00 跑次)

```bash
# 1. latest 里有 trailer 的剧数量
python3 -c "
import json
with open('/Users/lrwei91/Documents/Project/CineScope/json/tv_cn_latest.json') as f:
    d = json.load(f)
shows = d.get('shows', d) if isinstance(d, dict) else d
has = sum(1 for s in shows if len(s.get('trailers', [])) > 0)
print(f'tv_cn latest: {has}/{len(shows)} 部有 trailer')
"
# 修复前预期: 11/34
# 修复后预期: 25-30/34 (search 补齐一批 + 缓存累积)
```

### 缓存健康

```bash
# 缓存文件大小 (每次跑会增长, 直到 7 天滚动)
ls -lh /Users/lrwei91/Documents/Project/CineScope/.cache/bilibili/tv-cn-search-from-catalog.json

# 缓存 entries 数 = 已搜过的剧数量
python3 -c "
import json
with open('/Users/lrwei91/Documents/Project/CineScope/.cache/bilibili/tv-cn-search-from-catalog.json') as f:
    print(f'cached items: {len(json.load(f))}')
"
```

### 错误注入测试

```bash
# 强制 stale 重搜 (绕过 7 天缓存)
rm /Users/lrwei91/Documents/Project/CineScope/.cache/bilibili/tv-cn-search-from-catalog.json
# 下次跑 trailer cron 时全部会重搜, 验证搜行为
```

## 已知边界

1. **searchBilibiliTrailerRowsForCatalogItems 不去重跨 item**: 同一 bvid 在多部剧里都能 score > 0 时, 两个 item 都会拿到这个 row
   - **缓解**: `mergeTrailersIntoCatalogItems` 内部 `assignedBvids` 全局去重, 第一个匹配的 item 拿走, 其他 item 跳过
   - 副作用: row "被抢" — 但本就是 bvid 漂移问题的本质, 不算新问题

2. **scoreTrailerMovieMatch 阈值 0**: 任何 row 跟 item 标题有交集就过
   - 通用剧名 (《主角》《雨霖铃》) 容易误匹配
   - **缓解**: 走 override (`scripts/data/tv_cn_trailer_overrides.json`) 锁 bvid, 绕过搜索

3. **缓存结构无 bvid 锁定**: 同 bvid 7 天内不会被重新分发到不同 item
   - 副作用: 7 天后重搜, bvid 可能挂到不同 item (漂移)
   - **接受**: 这是搜索源固有问题, override 是唯一根治

## 相关 commit

| commit | 作用 |
|---|---|
| `129771c` (2026-06-06) | feat(tv-trailer): 按 catalog latest 列表搜预告片 (并行补充 UP 主空间拉取) |
| `d330877` (2026-06-06) | fix(trailer): backfill lock movie id (此功能的前置修复, 避免 movie id 漂移导致 search target 错位) |

## 跟其他 reference 的关系

- `trailer-diff-bvid-set.md` — bvid 漂移 (row 漂移到不同 movie) 的诊断 + 修复
- `trailer-id-drift-20260606.md` — movie id 漂移 (item.id 变化) 的诊断 + 修复
- `cross-run-id-stability-pattern.md` — 上面两个问题的 class-level 模式总结
- **本文件** — searchFromCatalog 新功能, 按 catalog 列表主动搜预告片 (解决"完全没 trailer")
