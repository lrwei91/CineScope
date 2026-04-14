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
- 日漫分页：复用 `tv_jp` 数据源，按“动画”类型切出独立分页，其他规则与普通 TV 分类一致

## 加载策略

- 首页默认进入 `tv_cn`
- 初始化时只请求 `json/tv_cn_latest.json`
- `json/tv_cn_latest.json` 渲染完成后，后台再请求 `json/tv_cn_complete.json`
- 其他分类在首次切换时，先请求各自 `latest`，随后异步请求各自 `complete`
- `tv_jp_anime` 复用 `tv_jp` 的 `latest` / `complete` JSON，并在前端归一化后按“动画”类型过滤
- 已加载过的分类会直接命中前端缓存，不重复请求

这样做的目的，是避免在进入页面时同时预取多份完整 JSON，导致静态站点的后台流量和解析成本明显上升。

## 豆瓣数据生成

国产剧和院线电影目前直接来自豆瓣移动端接口：

- `tv_cn`：`subject_collection/tv_domestic` + `subject_collection/tv_hot`（筛中国大陆）
- `movie_cn`：`subject_collection/movie_showing` + `subject_collection/movie_soon` + `subject_collection/movie_latest`

刷新这两类数据：

```bash
TMDB_API_KEY=你的_tmdb_api_key node scripts/generate_douban_catalog.mjs
```

脚本会更新：

- `json/tv_cn_latest.json`
- `json/tv_cn_complete.json`
- `json/movie_cn_latest.json`
- `json/movie_cn_complete.json`
- `posters/douban/tv_cn/*`
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
      "imdb_id": "tt1234567",
      "poster_path": "/poster.jpg",
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
      "imdb_id": "tt1234567",
      "poster_path": "/poster.jpg",
      "douban_rating": "8.2",
      "douban_link_google": "https://movie.douban.com/subject/...",
      "douban_link_verified": true
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
- `json/movie_cn_latest.json`
- `json/movie_cn_complete.json`

其中国产剧、韩剧、日剧和院线电影文件由本仓库内的生成脚本维护；提供 `TMDB_API_KEY` 时会使用 `tmdb+douban` 混合源补齐月份覆盖，不提供时退回纯豆瓣。英剧和美剧仍沿用原有 JSON 数据来源。`tv_jp_anime` 不单独生成 JSON，而是直接复用 `tv_jp` 数据并在前端过滤出动画内容。

## 数据来源

- 影视基础信息：The Movie Database (TMDB)
- 评分信息：豆瓣

## 说明

这个仓库当前不包含原有美剧、英剧的抓取 pipeline；但已经包含国产剧、韩剧、日剧和院线电影的数据生成脚本，用于直接更新前端消费的 JSON 文件。日漫分页不单独抓取，而是从日剧数据中切分得到。
