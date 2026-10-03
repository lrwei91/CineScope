# B 站 API 端点速查 (CineScope trailer pipeline, 2026-06-06 实测)

> 本文件只覆盖 CineScope 实际用到的 B 站端点。完整 API 文档见 [social-media/bilibili-api](https://github.com/SocialSisterYi/bilibili-API-collect)。

## 端点总览

| 端点 | 用途 | 限流码 | 解析 | 备注 |
|---|---|---|---|---|
| `https://api.bilibili.com/x/space/arc/search` | UP 主空间拉取 | `code=-799` 请求过于频繁 | flat `data.list.vlist[]` | **主路径**, 限流后无解 |
| `https://api.bilibili.com/x/web-interface/wbi/search/all/v2` | 全站搜索 v2 | 未实测 | **typed result groups** (见下) | searchFromCatalog 用 |
| `https://search.bilibili.com/all` (HTML) | 旧搜索 fallback | 容易触发 captcha | 解析 `window.__pinia` | **脆弱, 建议废弃** |

---

## 1. `x/space/arc/search` — UP 主空间

**调用方式**:
```
GET https://api.bilibili.com/x/space/arc/search?mid={mid}&pn=1&ps=30&order=pubdate&jsonp=jsonp
```

**响应结构** (成功):
```json
{
  "code": 0,
  "message": "0",
  "ttl": 1,
  "data": {
    "list": {
      "vlist": [
        {
          "aid": 114730035322858,
          "bvid": "BV1awK4ztE8y",
          "title": "新剧《主角》发布预告，张嘉益/刘浩存/...",
          "author": "罐头预告片",
          "mid": 229864363,
          "created": 1717200000,
          "pic": "http://i2.hdslb.com/bfs/archive/...jpg",
          ...
        }
      ]
    }
  }
}
```

**响应结构** (限流, 6/6 实测):
```json
{
  "code": -799,
  "message": "请求过于频繁，请稍后再试",
  "ttl": 1,
  "data": null
}
```

**关键字段**:
- `data.list.vlist[].bvid` — 用作 trailer row key
- `data.list.vlist[].title` — 用作 scoreTrailerMovieMatch 匹配 (但**不含 HTML 高亮**, UP 主空间是 raw title)
- `data.list.vlist[].mid` — UP 主 ID

**CineScope 用法**: `loadBilibiliTrailerDataset` (在 `scripts/lib/bilibili-trailers.mjs`)

**限流实测**:
- 6/6 20:30 (UTC) 连续调 5 次, 第 1 次就开始 `code=-799`
- `maxRetries: 3` 重试全部同样 fail
- 限流是分钟级, **不要** 在这端点上做无限重试

---

## 2. `x/web-interface/wbi/search/all/v2` — 全站搜索 v2

**调用方式**:
```
GET https://api.bilibili.com/x/web-interface/wbi/search/all/v2?keyword={keyword}&page=1
```

**响应结构** (成功, 6/6 curl 实测):
```json
{
  "code": 0,
  "message": "OK",
  "ttl": 1,
  "data": {
    "seid": "...",
    "page": 1,
    "pagesize": 20,
    "numResults": 1234,
    "result": [
      { "result_type": "tips",         "data": [] },
      { "result_type": "brand_ad",     "data": [] },
      { "result_type": "video",        "data": [ { /* video obj */ } ] },
      { "result_type": "bili_user",    "data": [] },
      { "result_type": "user",         "data": [] },
      { "result_type": "star",         "data": [] }
      // 完整 12 种 result_type, 见下
    ]
  }
}
```

**完整 result_type 列表** (6/6 实测, 12 种):
- `tips` (空, 提示词)
- `brand_ad` (品牌广告)
- `esports` (电竞赛事)
- `activity` (活动)
- `web_game`
- `card`
- `media_bangumi` (番剧)
- `media_ft` (影视)
- `bili_user` (B 站用户)
- `user` (用户)
- `star` (明星)
- **`video`** (视频, 唯一需要的)

**正确解析** (绝对不要 `.data.result[0]`):
```javascript
// ❌ 错误: 假设 result[0] 是 video
const rows = payload.data.result[0].data;

// ✅ 正确: 找到 video 类型 group
const videoGroup = payload.data.result.find((g) => g?.result_type === 'video');
const rows = videoGroup?.data ?? [];
```

**Video 对象结构**:
```json
{
  "type": "video",
  "id": 114730035322858,
  "author": "罐头预告片",
  "mid": 229864363,
  "typeid": "184",
  "typename": "预告·资讯",
  "arcurl": "http://www.bilibili.com/video/av114730035322858",
  "aid": 114730035322858,
  "bvid": "BV1awK4ztE8y",
  "title": "新剧《<em class=\"keyword\">主角</em>》发布预告，张嘉益/刘浩存/秦海璐/窦骁/翟子路 等主演",
  "description": "...",
  "pic": "http://i2.hdslb.com/bfs/archive/...jpg",
  "play": 12345,
  "pubdate": 1717200000,
  "tag": "..."
}
```

**关键字段** (用这几个就够):
- `bvid` — trailer row key
- `title` — **含 `<em class="keyword">` HTML 高亮**, 必须先 strip
- `mid` / `author` — 过滤用 (确认是罐头预告片 UP)
- `pubdate` — 发布时间戳

**HTML 高亮标签陷阱** (6/6 实测根因):

`<em class="keyword">` 是 B 站前端用来在搜索结果页 mark 搜索词。raw API 返回的 `title` 字段**直接带这个标签**, 不是渲染后的纯文本。

```javascript
// ❌ 错误: 不 strip
buildTrailerCandidateKeys('新剧《<em class="keyword">主角</em>》发布预告')
// → ['新剧<emclass=keyword>主角<em>...', ...]  跟 movie key '主角' 不匹配

// ✅ 正确: 先 stripHtmlTags
function stripHtmlTags(value) {
    return String(value || '').replace(/<[^>]+>/g, '');
}
buildTrailerCandidateKeys(stripHtmlTags('新剧《<em class="keyword">主角</em>》发布预告'))
// → ['主角', '新剧主角', ...]  正确匹配
```

`buildTrailerCandidateKeys` 已在 6/6 commit `e72c3bc` 修过 (入口加 stripHtmlTags)。

**CineScope 用法**: `fetchBilibiliSearchPageResults` + `extractBilibiliSearchResultsFromJson` (在 `scripts/lib/bilibili-trailers.mjs`)

**限流实测**:
- 6/6 19:00 连续 5 个 query, 全 200 + 正常 video data, **未触发限流**
- B 站搜索限流比 UP 主空间宽松得多, 适合做兜底

**搜索结果 vs mid 过滤**:
B 站搜索 API **不按 mid 过滤**, 只按 keyword 文本匹配。搜 "主角 罐头预告片" 返回 20 条 video, 大部分跟"主角"无关(罐头预告片 UP 发的**其他**剧), 需要客户端按 `mid` / `author` 再过滤。

---

## 3. HTML fallback (`search.bilibili.com/all`) — 旧方案

**调用方式**:
```
GET https://search.bilibili.com/all?keyword={keyword}
```

**解析**: 拿 HTML 里的 `window.__pinia` 字段提取数据

**问题**:
- 容易触发 captcha (`验证码` HTML 页面)
- 前端改版会断 (依赖 `__pinia` 字段名, 抓 pinia 节点位置)
- 比 v2 API 慢, 不稳定

**CineScope 现状**: `BILIBILI_TRAILER_ENABLE_SEARCH_FALLBACK` 默认 `false`, 不主用; 仅在 v2 API 失败时降级

**建议**: 新功能直接用 v2 API, 不要碰 HTML fallback

---

## 端点选择决策树

```
需要 trailer data?
├── 整批 (UP 主最近发的) → x/space/arc/search
│   └── 限流? → 接受 0 results, 跑 searchFromCatalog 兜底
├── 按 catalog item 搜 → x/web-interface/wbi/search/all/v2
│   └── 结果少? → 改用更宽的 query, 或多 query (剧名 + 别名)
└── 临时调试? → curl 直接看 JSON
```

## 速查表

```bash
# UP 主空间 (UP mid 已知)
curl "https://api.bilibili.com/x/space/arc/search?mid=229864363&pn=1&ps=5&order=pubdate&jsonp=jsonp" \
  -H "Referer: https://space.bilibili.com/229864363/upload/video" | jq .data.list.vlist[].bvid

# 全站搜索 v2
curl "https://api.bilibili.com/x/web-interface/wbi/search/all/v2?keyword=主角%20罐头预告片&page=1" \
  -H "Referer: https://www.bilibili.com" \
  | jq '.data.result[] | select(.result_type=="video") | .data[].bvid'

# 检查限流码
curl -s "https://api.bilibili.com/x/space/arc/search?mid=229864363&pn=1&ps=1&jsonp=jsonp" \
  -H "Referer: https://space.bilibili.com/229864363/upload/video" | jq '.code,.message'
# 0 = ok, -799 = 限流, -352 = 风控
```

## 跟其他 reference 的关系

- `trailer-diff-bvid-set.md` — 重复误报诊断 + 修复
- `trailer-id-drift-20260606.md` — movie id 漂移 (跟 B 站 API 无关, 豆瓣 search 漂移)
- `cross-run-id-stability-pattern.md` — class-level 模式
- `search-from-catalog.md` — searchFromCatalog 新功能, 用 v2 API
- **本文件** — B 站 API 端点速查
