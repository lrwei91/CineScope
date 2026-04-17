# 最新影视内容实时更新

一个静态聚合展示页，聚焦近期影视内容的浏览和筛选。当前前端支持七个分类：国产剧、院线电影、韩剧、日剧、日漫、美剧、英剧。页面会优先加载默认分类的最新数据，再按分类懒加载完整数据，兼顾首屏速度和后续浏览体验。

在线体验：[https://lrwei91.github.io/latest_tv/](https://lrwei91.github.io/latest_tv/)

## 预览

![预览图](preview.png)

## 功能特性

- 分类切换：支持 `tv_cn` 国产剧、`movie_cn` 院线电影、`tv_kr` 韩剧、`tv_jp` 日剧、`tv_jp_anime` 日漫、`tv_us` 美剧、`tv_gb` 英剧
- 评分筛选：支持全部、`> 9分`、`> 8分`、`> 7分`、近 2 年高分
- 类型筛选：按当前分类数据动态生成，未预设的类型也会直接展示
- 平台筛选：TV 分类按当前数据动态生成平台/电视网，院线电影默认隐藏该筛选
- 时间线导航：按年份和月份浏览历史条目，并保留即将上映区域
- 分页加载：滚动时渐进追加卡片，降低一次性渲染压力
- 日漫分页：使用独立 `tv_jp_anime` 数据源，和日剧分开抓取、分开缓存、分开展示
- 豆瓣状态：默认展示豆瓣用户 `lrwei91` 的想看、在看、看过状态，并在卡片上显示状态标签

## 加载策略

- 首页默认进入 `tv_cn`
- 初始化时只请求 `json/tv_cn_latest.json`
- `json/tv_cn_latest.json` 渲染完成后，后台再请求 `json/tv_cn_complete.json`
- 其他分类在首次切换时，先请求各自 `latest`，随后异步请求各自 `complete`
- `tv_jp_anime` 使用独立的 `json/tv_jp_anime_latest.json` / `json/tv_jp_anime_complete.json`
- 已加载过的分类会直接命中前端缓存，不重复请求
- 豆瓣状态由仓库内脚本抓取并缓存为静态 JSON，前端不会在页面加载时直接抓取豆瓣站点

这样做的目的，是避免在进入页面时同时预取多份完整 JSON，导致静态站点的后台流量和解析成本明显上升。

## 豆瓣数据生成

国产剧、韩剧、日剧、日漫和院线电影目前由脚本统一生成：

- `tv_cn`：`subject_collection/tv_domestic` + `subject_collection/tv_hot`（筛中国大陆）
- `tv_kr`：`subject_collection/tv_korean`（筛韩国）
- `tv_jp`：`subject_collection/tv_japanese`（筛日本）
- `tv_jp_anime`：`subject_collection/tv_animation`（筛日本动画）
- `movie_cn`：`subject_collection/movie_showing` + `subject_collection/movie_soon` + `subject_collection/movie_latest`

刷新这些分类数据：

```bash
TMDB_API_KEY=你的_tmdb_api_key node scripts/generate_douban_catalog.mjs
```

脚本会更新：

- `json/tv_cn_latest.json`
- `json/tv_cn_complete.json`
- `json/tv_kr_latest.json`
- `json/tv_kr_complete.json`
- `json/tv_jp_latest.json`
- `json/tv_jp_complete.json`
- `json/tv_jp_anime_latest.json`
- `json/tv_jp_anime_complete.json`
- `json/douban_statuses.json`
- `json/movie_cn_latest.json`
- `json/movie_cn_complete.json`
- `posters/douban/tv_cn/*`
- `posters/douban/tv_kr/*`
- `posters/douban/tv_jp/*`
- `posters/douban/tv_jp_anime/*`
- `posters/douban/movie_cn/*`

## 数据契约

### TV 分类

TV 分类继续沿用现有结构：

```json
{
  "metadata": {
    "last_updated": "2026-04-06T06:06:47+08:00"
  },
  "shows": [
    {
      "id": 123,
      "name": "中文名",
      "original_name": "Original Title",
      "genres": [{ "name": "剧情" }],
      "networks": [{ "name": "Netflix" }],
      "directors": [{ "name": "导演甲" }],
      "actors": [{ "name": "演员甲" }, { "name": "演员乙" }],
      "countries": ["中国大陆"],
      "languages": ["汉语普通话"],
      "aka": ["别名 A"],
      "imdb_id": "tt1234567",
      "poster_path": "/poster.jpg",
      "overview": "剧情简介",
      "rating_count": 12345,
      "rating_star_count": 4,
      "episodes_info": "更新至12集",
      "seasons": [
        {
          "id": 456,
          "season_number": 1,
          "name": "第 1 季",
          "air_date": "2026-04-01",
          "poster_path": "/season.jpg",
          "douban_rating": "8.2",
          "douban_link_google": "https://movie.douban.com/subject/...",
          "douban_link_verified": true
        }
      ]
    }
  ]
}
```

### 电影分类

院线电影使用新的结构：

```json
{
  "metadata": {
    "last_updated": "2026-04-06T06:06:47+08:00"
  },
  "movies": [
    {
      "id": 123,
      "title": "片名",
      "original_title": "Original Title",
      "release_date": "2026-04-01",
      "genres": [{ "name": "剧情" }],
      "directors": [{ "name": "导演甲" }],
      "actors": [{ "name": "演员甲" }, { "name": "演员乙" }],
      "countries": ["中国大陆"],
      "languages": ["汉语普通话"],
      "aka": ["别名 A"],
      "imdb_id": "tt1234567",
      "poster_path": "/poster.jpg",
      "douban_rating": "8.2",
      "douban_link_google": "https://movie.douban.com/subject/...",
      "douban_link_verified": true,
      "overview": "剧情简介",
      "durations": ["118分钟"],
      "rating_count": 12345,
      "rating_star_count": 4
    }
  ]
}
```

前端内部会把 TV 和电影都归一化成统一的 `CatalogItem`，字段至少包含：

- `kind`
- `id`
- `date`
- `title`
- `subtitle`
- `posterPath`
- `genres`
- `networks`
- `doubanRating`
- `doubanLink`
- `doubanVerified`
- `tmdbUrl`
- `imdbUrl`
- `directors`
- `actors`
- `countries`
- `languages`
- `overview`

## 当前 JSON 文件

- `json/tv_us_latest.json`
- `json/tv_us_complete.json`
- `json/tv_gb_latest.json`
- `json/tv_gb_complete.json`
- `json/tv_cn_latest.json`
- `json/tv_cn_complete.json`
- `json/tv_kr_latest.json`
- `json/tv_kr_complete.json`
- `json/tv_jp_latest.json`
- `json/tv_jp_complete.json`
- `json/tv_jp_anime_latest.json`
- `json/tv_jp_anime_complete.json`
- `json/movie_cn_latest.json`
- `json/movie_cn_complete.json`

其中国产剧、韩剧、日剧、日漫和院线电影文件由本仓库内的生成脚本维护；提供 `TMDB_API_KEY` 时会使用 `tmdb+douban` 混合源补齐月份覆盖，不提供时退回纯豆瓣。英剧和美剧仍沿用原有 JSON 数据来源。

## 数据来源

- 影视基础信息：The Movie Database (TMDB)
- 评分信息：豆瓣

## 说明

这个仓库当前不包含原有美剧、英剧的抓取 pipeline；但已经包含国产剧、韩剧、日剧、日漫和院线电影的数据生成脚本，用于直接更新前端消费的 JSON 文件。

## 豆瓣状态同步

- 页面默认展示豆瓣用户 `lrwei91` 的 `想看 / 在看 / 看过`
- 抓取脚本会同步 `https://movie.douban.com/people/lrwei91/` 下的公开电影列表页
- 抓取结果会写入 `json/douban_statuses.json`
- 列表卡片通过现有 `douban_link_google` 提取 subject id，与抓取到的状态做匹配
