# Bilibili trailer source replacement evaluation

> **2026-06-03 备注**：本评估文档成文时项目名还叫 `latest_tv`，**现已重命名为 `CineScope`**（仓库 `lrwei91/CineScope`）。下文出现的 `latest_tv` 均为历史名称，实质均指当前 CineScope 项目。

## Scope
Evaluate whether `Nemo2011/bilibili-api` should replace latest_tv's current Bilibili trailer ingestion for `movie_cn` and `tv_cn`.

## Current latest_tv implementation
- Main code:
  - `scripts/lib/bilibili-trailers.mjs`
  - `scripts/generate_douban_catalog.mjs`
- Current source pattern:
  - UP video list API: `https://api.bilibili.com/x/space/arc/search`
  - movie trailer UP: `mid=8465957`
  - tv trailer UP: `mid=229864363`
- Merge path:
  - fetch trailer dataset
  - merge trailers into catalog items
  - optional search fallback if remote fetch is not `remote`
- Existing fallback implementation:
  - parses `https://search.bilibili.com/all?...` HTML
  - extracts `window.__pinia` payload from page source

## Observed runtime behavior
- Direct requests to `x/space/arc/search` can return `HTTP 412 Precondition Failed` even with browser-like headers.
- This was reproduced for both trailer UP mids during review.
- Project output already exposed this in generated JSON:
  - `json/tv_cn_complete.json` contained `fetch_error: "Bilibili trailer request failed (412)"` for `bilibili_up_229864363`.
- The HTML search page remained reachable and the JSON search API remained reachable.

## Relevant upstream capabilities from Nemo2011/bilibili-api
Useful modules inspected:
- `user.get_videos()` -> wraps `x/space/wbi/arc/search`
- `search.search()` -> `x/web-interface/wbi/search/all/v2`
- `search.search_by_type()` -> `x/web-interface/wbi/search/type`
- `bangumi.get_timeline()` / `get_index_info()` / `Bangumi.get_meta()` for PGC metadata

## Replacement verdict
Do **not** directly replace latest_tv's current Node/MJS implementation with `Nemo2011/bilibili-api`.

Reasons:
1. `user.get_videos()` still depends on the same class of UP-video-list endpoint that is currently failing under risk control. It is a wrapper, not a fundamentally different source.
2. The library is Python async, while latest_tv's pipeline is Node/MJS. A direct replacement would add a Python sidecar, async runtime management, dependency coordination, and Node/Python bridging overhead.
3. The repo is GPL-3.0. Referencing its endpoint choices is fine; copying implementation code into latest_tv requires deliberate license handling.

## Recommended improvement path
Prefer improving the existing Node implementation:

1. Keep the current primary fetch path for UP video lists.
2. When UP-list fetch fails or is blocked, switch fallback from HTML parsing to JSON search API:
   - `https://api.bilibili.com/x/web-interface/wbi/search/all/v2`
   - optionally `https://api.bilibili.com/x/web-interface/wbi/search/type`
3. Filter candidates by:
   - `mid`
   - `author`
   - `bvid`
   - normalized `title`
   - optional `typename` (e.g. trailer/info category hints)
4. Keep existing local cache + manual overrides.
5. Default-enable fallback in automation unless there is a known reason not to.

## Why JSON search fallback is preferred over HTML fallback
- More stable than scraping `search.bilibili.com/all` page HTML.
- Avoids dependence on `window.__pinia` page internals.
- Easier to test and inspect.
- Returned fields are directly useful (`bvid`, `mid`, `author`, `title`, `typename`).

## Maintenance note
If future work introduces a Python helper, treat `bilibili-api` as an optional sidecar fetcher rather than the canonical replacement. The canonical pipeline should stay Node-first unless there is a clear project-wide migration decision.
