#!/usr/bin/env python3
"""
CineScope 影视数据查询脚本。

2026-06-03 重命名：search_latest_tv.py → search_cinescope.py

用法:
  python3 search_cinescope.py <关键词> [选项]

选项:
  --category <类别>     限定类别: tv_cn, tv_jp, tv_jp_anime, tv_kr, tv_gb, tv_us, tv_cn_variety, movie_cn
  --scope <范围>        搜索范围: latest (默认) 或 complete
  --limit <数量>        返回结果数量 (默认 10)
  --json                输出原始 JSON 而非格式化文本

类别说明:
  tv_cn           国产剧
  tv_jp           日剧
  tv_jp_anime     日本动画
  tv_kr           韩剧
  tv_gb           英剧
  tv_us           美剧
  tv_cn_variety   综艺
  movie_cn        中国电影

示例:
  python3 search_cinescope.py 狂飙
  python3 search_cinescope.py 王传君 --category tv_cn
  python3 search_cinescope.py 进击的巨人 --category tv_jp_anime --scope complete
  python3 search_cinescope.py 流浪地球 --category movie_cn
"""

import json
import os
import sys
import argparse
from pathlib import Path

PROJECT_DIR = Path("/Users/lrwei91/Documents/Project/CineScope")
JSON_DIR = PROJECT_DIR / "json"

CATEGORIES = {
    "tv_cn": {"name": "国产剧", "latest": "tv_cn_latest.json", "complete": "tv_cn_complete.json"},
    "tv_jp": {"name": "日剧", "latest": "tv_jp_latest.json", "complete": "tv_jp_complete.json"},
    "tv_jp_anime": {"name": "日本动画", "latest": "tv_jp_anime_latest.json", "complete": "tv_jp_anime_complete.json"},
    "tv_kr": {"name": "韩剧", "latest": "tv_kr_latest.json", "complete": "tv_kr_complete.json"},
    "tv_gb": {"name": "英剧", "latest": "tv_gb_latest.json", "complete": "tv_gb_complete.json"},
    "tv_us": {"name": "美剧", "latest": "tv_us_latest.json", "complete": "tv_us_complete.json"},
    "tv_cn_variety": {"name": "综艺", "latest": "tv_cn_variety_latest.json", "complete": "tv_cn_variety_complete.json"},
    "movie_cn": {"name": "中国电影", "latest": "movie_cn_latest.json", "complete": "movie_cn_complete.json"},
}


def load_category_data(category, scope="latest"):
    """加载指定类别的数据文件。"""
    cat_info = CATEGORIES.get(category)
    if not cat_info:
        print(f"错误：未知类别 '{category}'")
        print(f"可用类别: {', '.join(CATEGORIES.keys())}")
        sys.exit(1)
    
    fname = cat_info.get(scope)
    if not fname:
        print(f"错误：类别 '{category}' 没有 {scope} 数据")
        sys.exit(1)
    
    path = JSON_DIR / fname
    if not path.exists():
        print(f"错误：文件不存在: {path}")
        sys.exit(1)
    
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def search_items(data, keyword, category, limit=10):
    """在数据中搜索关键词。"""
    keyword_lower = keyword.lower()
    results = []
    
    # 判断是电视剧还是电影
    items_key = "movies" if category == "movie_cn" else "shows"
    items = data.get(items_key, [])
    
    for item in items:
        score = 0
        match_fields = []
        
        # 名称匹配（最高优先级）
        name = (item.get("name") or "").lower()
        original_name = (item.get("original_name") or "").lower()
        if keyword_lower in name or keyword_lower in original_name:
            score += 10
            match_fields.append("名称")
        
        # 别名匹配
        aka_list = item.get("aka") or []
        for aka in aka_list:
            if keyword_lower in aka.lower():
                score += 8
                match_fields.append("别名")
                break
        
        # 导演匹配
        directors = item.get("directors") or []
        for d in directors:
            if keyword_lower in (d.get("name") or "").lower():
                score += 5
                match_fields.append("导演")
                break
        
        # 演员匹配
        actors = item.get("actors") or []
        for a in actors:
            if keyword_lower in (a.get("name") or "").lower():
                score += 3
                match_fields.append("演员")
                break
        
        # 简介匹配
        overview = (item.get("overview") or "").lower()
        if keyword_lower in overview:
            score += 1
            match_fields.append("简介")
        
        if score > 0:
            item["_score"] = score
            item["_match_fields"] = match_fields
            results.append(item)
    
    # 按分数排序，取前 limit 条
    results.sort(key=lambda x: x["_score"], reverse=True)
    return results[:limit]


def format_item(item, category):
    """格式化单条结果为可读文本。"""
    lines = []
    
    # 标题
    name = item.get("name") or item.get("original_name") or "未知"
    lines.append(f"**{name}**")
    
    # 年份/日期
    date_key = "first_air_date" if category != "movie_cn" else "release_date"
    date_val = item.get(date_key) or item.get("first_air_date")
    if date_val:
        lines.append(f"年份: {str(date_val)[:4]}")
    
    # 类别/类型
    genres = item.get("genres") or []
    genre_names = [g.get("name") for g in genres if g.get("name")]
    if genre_names:
        lines.append(f"类型: {' / '.join(genre_names)}")
    
    # 评分（优先豆瓣，其次 TMDB）
    douban_rating = None
    douban_link = None
    seasons = item.get("seasons") or []
    if isinstance(seasons, list) and seasons:
        first_season = seasons[0]
        douban_rating = first_season.get("douban_rating")
        douban_link = first_season.get("douban_link_google") or first_season.get("douban_link")
    
    if douban_rating:
        douban_count = item.get("rating_count", 0)
        douban_str = str(douban_rating)
        lines.append(f"豆瓣评分: {douban_str}/10 ({douban_count} 人评价)")
    else:
        rating = item.get("vote_average")
        if rating:
            vote_count = item.get("vote_count", 0)
            lines.append(f"TMDB评分: {rating}/10 ({vote_count} 人评价)")
    
    # 导演
    directors = item.get("directors") or []
    if directors:
        dir_names = [d.get("name") for d in directors if d.get("name")]
        if dir_names:
            lines.append(f"导演: {', '.join(dir_names[:5])}")
    
    # 演员
    actors = item.get("actors") or []
    if actors:
        actor_names = [a.get("name") for a in actors if a.get("name")]
        if actor_names:
            lines.append(f"演员: {', '.join(actor_names[:8])}")
    
    # 集数（电视剧）
    if category != "movie_cn":
        seasons = item.get("number_of_seasons")
        episodes = item.get("number_of_episodes")
        if seasons or episodes:
            lines.append(f"季数: {seasons or '?'}  集数: {episodes or '?'}")
    
    # 状态
    status = item.get("status") or item.get("episodes_info")
    if status:
        lines.append(f"状态: {status}")
    
    # 简介
    overview = item.get("overview") or ""
    if overview:
        lines.append(f"简介: {overview[:200]}{'...' if len(overview) > 200 else ''}")
    
    # 外部链接
    if douban_link:
        lines.append(f"豆瓣: {douban_link}")
    tmdb_url = item.get("tmdbUrl")
    if tmdb_url:
        lines.append(f"TMDB: {tmdb_url}")
    
    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description="搜索 CineScope 影视数据")
    parser.add_argument("keyword", help="搜索关键词（名称/演员/导演）")
    parser.add_argument("--category", choices=list(CATEGORIES.keys()), 
                       help="限定类别，不指定则搜索所有类别")
    parser.add_argument("--scope", choices=["latest", "complete"], default="latest",
                       help="搜索范围: latest(新剧/新电影) 或 complete(全部)")
    parser.add_argument("--limit", type=int, default=10, help="返回结果数量")
    parser.add_argument("--json", action="store_true", help="输出原始 JSON")
    
    args = parser.parse_args()
    
    categories_to_search = [args.category] if args.category else list(CATEGORIES.keys())
    all_results = []
    
    for cat in categories_to_search:
        if args.scope == "latest":
            # 先查 latest，无结果自动查 complete
            data_latest = load_category_data(cat, "latest")
            results = search_items(data_latest, args.keyword, cat, limit=args.limit * 2)
            for r in results:
                r["_category"] = cat
            all_results.extend(results)
            
            if not all_results or len(all_results) < 3:
                data_complete = load_category_data(cat, "complete")
                results = search_items(data_complete, args.keyword, cat, limit=args.limit)
                for r in results:
                    r["_category"] = cat
                    if r not in all_results:
                        all_results.append(r)
        else:
            data = load_category_data(cat, args.scope)
            results = search_items(data, args.keyword, cat, limit=args.limit)
            for r in results:
                r["_category"] = cat
            all_results.extend(results)
    
    # 全局排序
    all_results.sort(key=lambda x: x["_score"], reverse=True)
    all_results = all_results[:args.limit]
    
    if not all_results:
        print(f"未找到与「{args.keyword}」相关的结果。")
        sys.exit(0)
    
    if args.json:
        # 清理内部字段后输出 JSON
        clean_results = []
        for r in all_results:
            cr = {k: v for k, v in r.items() if not k.startswith("_")}
            clean_results.append(cr)
        print(json.dumps(clean_results, ensure_ascii=False, indent=2))
        return
    
    # 格式化输出
    print(f"搜索「{args.keyword}」共找到 {len(all_results)} 条结果：\n")
    
    for i, item in enumerate(all_results, 1):
        cat_name = CATEGORIES[item["_category"]]["name"]
        print(f"--- {i}. [{cat_name}] ---")
        print(format_item(item, item["_category"]))
        if item.get("_match_fields"):
            print(f"[命中: {', '.join(item['_match_fields'])}]")
        print()


if __name__ == "__main__":
    main()
