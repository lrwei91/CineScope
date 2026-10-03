# Douban Catalog 字段与 CI 403 问题

## Douban rexxar API 详情接口

**端点**: `https://m.douban.com/rexxar/api/v2/{tv|movie}/{subjectId}?for_mobile=1`

**请求头要求**:
- `Referer: https://m.douban.com/`
- `User-Agent`: Chrome macOS UA
- `Accept: application/json`

**GitHub Actions 403 根因**: GitHub runner 云 IP 被豆瓣列入黑名单，即使带正确 headers 也返回 403。本地 macOS 不受影响。

## 已采用的解决方案：本地 Playwright 浏览器抓取 + 写入 cache

**脚本**: `scripts/douban_browser_scraper.py`（项目根目录下）

**原理**: 用 Playwright 启动 headless Chromium，访问 `movie.douban.com/subject/{id}/` 桌面端页面，从 JSON-LD + `#info` 区域 + microdata 提取字段，构造与 rexxar API 相同格式的 payload，写入 `.cache/douban/subjects/{kind}/{id}.json`。CI 的 `douban-subject-cache.mjs` 优先读 cache，命中后跳过 API 请求。

**用法**:
```bash
python3 scripts/douban_browser_scraper.py --kind movie --file /tmp/ids.txt --delay 2
python3 scripts/douban_browser_scraper.py --kind movie --ids 36053104 37293378 --delay 2
python3 scripts/douban_browser_scraper.py --report
```

**关键解析策略**:
- JSON-LD (`application/ld+json`) 提供 title, genres, actors, directors, image, datePublished, aggregateRating, description
- 老页面 JSON-LD 可能含控制字符 → 先清理 `[\x00-\x1f\x7f]` 再 parse
- 桌面端 `#info` 区域提供 pubdate, countries, languages, aka, episodes_info
- 评分用 `[property="v:average"]`，简介用 `[property="v:summary"]`
- card_subtitle 由 year + countries + genres + director + actors 拼接

**维护节奏**: 每周本地跑一次补齐缺失 cache，然后 `git add .cache/` 提交到仓库。

## 提取的字段清单

从 `fetchDoubanSubjectDetail` 返回的 detail 对象中提取：

| 字段 | 来源路径 | 说明 |
|------|----------|------|
| title | `detail.title` | 中文名 |
| original_title | `detail.original_title` | 原名 |
| rating | `detail.rating.value` | 豆瓣评分 |
| rating_count | `detail.rating.count` | 评价人数 |
| rating_star_count | `detail.rating.star_count` | 评价人数（星级） |
| pic | `detail.pic.large` | 海报 URL |
| intro | `detail.intro` | 简介 |
| pubdate | `detail.pubdate` | 上映/播出日期 |
| card_subtitle | `detail.card_subtitle` | 类型解析源（用于提取 genres） |
| directors | `detail.directors` | 导演列表 |
| actors | `detail.actors` | 演员列表 |
| countries | `detail.countries` | 国家 |
| languages | `detail.languages` | 语言 |
| aka | `detail.aka` | 别名 |
| episodes_info | `detail.episodes_info` | 更新状态（仅 TV） |
| vendors | `detail.vendors` | 播放平台（仅 TV） |

## 当前代码位置

- 主脚本: `scripts/generate_douban_catalog.mjs`
- 浏览器抓取: `scripts/douban_browser_scraper.py` ← 新增
- Detail 缓存: `scripts/lib/douban-subject-cache.mjs`（TTL 7 天）
- 搜索缓存: `scripts/lib/douban-search-cache.mjs`（TTL 14 天）
- 数据归一化: `normalizeDoubanTvEntry` / `normalizeDoubanMovieEntry`
