#!/usr/bin/env python3
"""豆瓣详情页缓存补充工具 — 用本地浏览器抓取页面，写入 douban-subject-cache 格式。

解决 GitHub Actions IP 被豆瓣 403 的问题。

用法：
  python scripts/douban_browser_scraper.py --kind movie --ids 36053104 37293378
  python scripts/douban_browser_scraper.py --kind tv --ids 123456 --all
  python scripts/douban_browser_scraper.py --report  # 从 build_report.json 提取失败 ID
"""

import argparse
import json
import os
import re
import time
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlencode

try:
    from playwright.sync_api import sync_playwright
except ImportError:
    print("请先安装: pip install playwright && playwright install chromium")
    sys.exit(1)


ROOT = Path(__file__).resolve().parents[1]
CACHE_DIR = ROOT / ".cache" / "douban" / "subjects"
BUILD_REPORT = ROOT / "json" / "build_report.json"
SCHEMA_VERSION = 2


def cache_path(kind: str, subject_id: str) -> Path:
    k = "tv" if kind == "tv" else "movie"
    return CACHE_DIR / k / f"{subject_id}.json"


def write_cache(kind: str, subject_id: str, payload: dict):
    p = cache_path(kind, subject_id)
    p.parent.mkdir(parents=True, exist_ok=True)
    entry = {
        "schema_version": SCHEMA_VERSION,
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        "kind": kind,
        "subject_id": str(subject_id),
        "payload": payload,
        "blocked_status": None,
    }
    p.write_text(json.dumps(entry, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def parse_movie_page(page, subject_id: str) -> dict | None:
    """从电影详情页提取数据，构造 rexxar API 格式的 payload。"""
    try:
        # JSON-LD
        ld = page.evaluate("""() => {
            const el = document.querySelector('script[type="application/ld+json"]');
            if (!el) return null;
            try {
                return JSON.parse(el.textContent);
            } catch {
                // 有些老页面的 JSON-LD 含控制字符，需要清理
                let text = el.textContent;
                text = text.replace(/[\x00-\x1f\x7f]/g, '');
                try { return JSON.parse(text); } catch { return null; }
            }
        }""")
        if not ld:
            return None

        # 从 #info 区域提取更多字段
        info_text = page.evaluate("""() => {
            const el = document.querySelector('#info');
            return el ? el.innerText : '';
        }""")

        # 评分
        rating_val = page.evaluate("""() => {
            const el = document.querySelector('[property="v:average"]');
            return el ? el.innerText.trim() : null;
        }""")
        rating_count_str = page.evaluate("""() => {
            const el = document.querySelector('.rating_sum');
            return el ? el.innerText.trim().replace(/[^\d]/g, '') : '0';
        }""")

        # 简介
        intro = page.evaluate("""() => {
            const el = document.querySelector('[property="v:summary"]');
            return el ? el.innerText.trim() : '';
        }""")

        # 解析 #info 文本
        directors = []
        actors = []
        countries = []
        languages = []
        aka = []
        pubdate = []

        for line in info_text.split('\n'):
            line = line.strip()
            if line.startswith('导演:'):
                names = line.replace('导演:', '').strip()
                for n in names.split(' / '):
                    n = n.strip()
                    if n and n != '更多...':
                        directors.append({"name": n})
            elif line.startswith('编剧:'):
                pass  # 不需要
            elif line.startswith('主演:'):
                names = line.replace('主演:', '').strip()
                for n in names.split(' / '):
                    n = n.strip()
                    if n and n != '更多...':
                        actors.append({"name": n})
            elif line.startswith('类型:'):
                pass  # 从 JSON-LD 获取
            elif line.startswith('制片国家/地区:'):
                countries = [x.strip() for x in line.replace('制片国家/地区:', '').strip().split('/') if x.strip()]
            elif line.startswith('语言:'):
                languages = [x.strip() for x in line.replace('语言:', '').strip().split('/') if x.strip()]
            elif line.startswith('上映日期:'):
                dates = line.replace('上映日期:', '').strip()
                pubdate = [x.strip() for x in dates.split('/') if x.strip()]
            elif line.startswith('片长:'):
                pass
            elif line.startswith('又名:'):
                aka = [x.strip() for x in line.replace('又名:', '').strip().split('/') if x.strip()]
            elif line.startswith('IMDb:'):
                pass

        # 如果没有 #info（某些页面结构不同），从 JSON-LD 补充
        if not directors and ld.get('director'):
            for d in (ld['director'] if isinstance(ld['director'], list) else [ld['director']]):
                name = d.get('name', '').strip()
                if name:
                    # 去除英文名后缀，如 "陈思诚 Sicheng Chen" -> "陈思诚"
                    clean = re.split(r'\s+[A-Z]', name)[0].strip()
                    directors.append({"name": clean})

        if not actors and ld.get('actor'):
            for a in ld['actor'][:20]:
                name = a.get('name', '').strip()
                if name:
                    clean = re.split(r'\s+[A-Z]', name)[0].strip()
                    actors.append({"name": clean})

        rating_count = int(re.sub(r'[^\d]', '', rating_count_str)) if rating_count_str else 0
        rating_value = float(rating_val) if rating_val and rating_val not in ('尚未', '暂无') else None

        # 从 JSON-LD 提取类型
        genres = ld.get('genre', [])
        if isinstance(genres, str):
            genres = [g.strip() for g in genres.split('/') if g.strip()]

        # 提取海报
        poster_url = ld.get('image', '')

        # card_subtitle: 构造类似 "2026 / 中国大陆 / 剧情 喜剧 / 陈思诚 / 蒋龙 齐溪"
        year = ''
        if pubdate:
            year = pubdate[0][:4] if pubdate[0] else ''
        director_names = ' '.join(d['name'] for d in directors[:2])
        actor_names = ' '.join(a['name'] for a in actors[:3])
        genre_str = ' '.join(genres) if isinstance(genres, list) else genres
        parts = [p for p in [year, '/ '.join(countries) if countries else '', genre_str, director_names, actor_names] if p]
        card_subtitle = ' / '.join(parts)

        payload = {
            "id": str(subject_id),
            "type": "movie",
            "subtype": "movie",
            "title": ld.get('name', ''),
            "original_title": '',
            "year": year,
            "pic": {"large": poster_url, "normal": poster_url},
            "cover_url": poster_url,
            "rating": {
                "value": rating_value,
                "count": rating_count,
                "star_count": rating_count,
            },
            "directors": directors,
            "actors": actors,
            "countries": countries,
            "languages": languages,
            "aka": aka,
            "genres": genres,
            "card_subtitle": card_subtitle,
            "intro": intro,
            "pubdate": pubdate,
            "episodes_info": '',
            "episodes_count": 0,
            "durations": [],
            "vendors": [],
            "vendor_icons": [],
            "linewatches": [],
            "trailers": [],
            "url": f"https://movie.douban.com/subject/{subject_id}/",
            "sharing_url": f"https://www.douban.com/doubanapp/dispatch/movie/{subject_id}",
        }

        return payload

    except Exception as e:
        print(f"  ⚠ 解析电影 {subject_id} 失败: {e}")
        return None


def parse_tv_page(page, subject_id: str) -> dict | None:
    """从剧集详情页提取数据。"""
    try:
        ld = page.evaluate("""() => {
            const el = document.querySelector('script[type="application/ld+json"]');
            if (!el) return null;
            try {
                return JSON.parse(el.textContent);
            } catch {
                let text = el.textContent;
                text = text.replace(/[\x00-\x1f\x7f]/g, '');
                try { return JSON.parse(text); } catch { return null; }
            }
        }""")
        if not ld:
            return None

        info_text = page.evaluate("""() => {
            const el = document.querySelector('#info');
            return el ? el.innerText : '';
        }""")

        rating_val = page.evaluate("""() => {
            const el = document.querySelector('.rating_self strong.ll.rating');
            return el ? el.innerText.trim() : null;
        }""")
        rating_count_str = page.evaluate("""() => {
            const el = document.querySelector('.rating_sum a span');
            return el ? el.innerText.trim() : '0';
        }""")

        intro = page.evaluate("""() => {
            const el = document.querySelector('#link-report-intra span.all') || document.querySelector('#link-report-intra .short');
            return el ? el.innerText.trim() : '';
        }""")

        directors = []
        actors = []
        countries = []
        languages = []
        aka = []
        pubdate = []
        episodes_info = ''

        for line in info_text.split('\n'):
            line = line.strip()
            if line.startswith('导演:'):
                names = line.replace('导演:', '').strip()
                for n in names.split(' / '):
                    n = n.strip()
                    if n and n != '更多...':
                        directors.append({"name": n})
            elif line.startswith('编剧:'):
                pass
            elif line.startswith('主演:'):
                names = line.replace('主演:', '').strip()
                for n in names.split(' / '):
                    n = n.strip()
                    if n and n != '更多...':
                        actors.append({"name": n})
            elif line.startswith('制片国家/地区:'):
                countries = [x.strip() for x in line.replace('制片国家/地区:', '').strip().split('/') if x.strip()]
            elif line.startswith('语言:'):
                languages = [x.strip() for x in line.replace('语言:', '').strip().split('/') if x.strip()]
            elif line.startswith('首播:'):
                dates = line.replace('首播:', '').strip()
                pubdate = [x.strip() for x in dates.split('/') if x.strip()]
            elif line.startswith('集数:') or line.startswith('单集片长:'):
                num = re.search(r'\d+', line)
                if num and line.startswith('集数'):
                    episodes_info = f"更新至 {num.group()}"
            elif line.startswith('又名:'):
                aka = [x.strip() for x in line.replace('又名:', '').strip().split('/') if x.strip()]

        if not directors and ld.get('director'):
            for d in (ld['director'] if isinstance(ld['director'], list) else [ld['director']]):
                name = d.get('name', '').strip()
                if name:
                    clean = re.split(r'\s+[A-Z]', name)[0].strip()
                    directors.append({"name": clean})

        if not actors and ld.get('actor'):
            for a in ld['actor'][:20]:
                name = a.get('name', '').strip()
                if name:
                    clean = re.split(r'\s+[A-Z]', name)[0].strip()
                    actors.append({"name": clean})

        rating_count = int(re.sub(r'[^\d]', '', rating_count_str)) if rating_count_str else 0
        rating_value = float(rating_val) if rating_val and rating_val not in ('尚未', '暂无') else None

        genres = ld.get('genre', [])
        if isinstance(genres, str):
            genres = [g.strip() for g in genres.split('/') if g.strip()]

        poster_url = ld.get('image', '')

        year = ''
        if pubdate:
            year = pubdate[0][:4] if pubdate[0] else ''
        elif ld.get('datePublished'):
            year = str(ld['datePublished'])[:4]

        director_names = ' '.join(d['name'] for d in directors[:2])
        actor_names = ' '.join(a['name'] for a in actors[:3])
        genre_str = ' '.join(genres) if isinstance(genres, list) else genres
        parts = [p for p in [year, '/ '.join(countries) if countries else '', genre_str, director_names, actor_names] if p]
        card_subtitle = ' / '.join(parts)

        first_air = pubdate[0] if pubdate else (ld.get('datePublished') or '')

        payload = {
            "id": str(subject_id),
            "type": "tv",
            "subtype": "tv",
            "title": ld.get('name', ''),
            "original_title": '',
            "year": year,
            "pic": {"large": poster_url, "normal": poster_url},
            "cover_url": poster_url,
            "rating": {
                "value": rating_value,
                "count": rating_count,
                "star_count": rating_count,
            },
            "directors": directors,
            "actors": actors,
            "countries": countries,
            "languages": languages,
            "aka": aka,
            "genres": genres,
            "card_subtitle": card_subtitle,
            "intro": intro,
            "pubdate": pubdate if pubdate else [first_air],
            "episodes_info": episodes_info,
            "episodes_count": 0,
            "vendors": [],
            "vendor_icons": [],
            "linewatches": [],
            "trailers": [],
            "url": f"https://movie.douban.com/subject/{subject_id}/",
            "sharing_url": f"https://www.douban.com/doubanapp/dispatch/tv/{subject_id}",
        }

        return payload

    except Exception as e:
        print(f"  ⚠ 解析剧集 {subject_id} 失败: {e}")
        return None


def scrape_ids(ids: list[str], kind: str, delay: float = 3.0):
    """批量抓取并写入 cache。"""
    endpoint = "movie" if kind == "movie" else "tv"
    ok = 0
    fail = 0

    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        context = browser.new_context(
            user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
            viewport={"width": 1280, "height": 800},
        )
        page = context.new_page()

        for i, sid in enumerate(ids):
            url = f"https://movie.douban.com/subject/{sid}/"
            print(f"[{i+1}/{len(ids)}] {kind}/{sid} ...", end=" ", flush=True)

            # 检查缓存是否已存在
            cp = cache_path(kind, sid)
            if cp.exists():
                try:
                    existing = json.loads(cp.read_text(encoding="utf-8"))
                    if existing.get("payload") and existing.get("blocked_status") is None:
                        print("✅ 已缓存 (跳过)")
                        ok += 1
                        continue
                except Exception:
                    pass

            try:
                page.goto(url, wait_until="domcontentloaded", timeout=15000)
                page.wait_for_selector("#info, #content", timeout=5000)

                if kind == "movie":
                    payload = parse_movie_page(page, sid)
                else:
                    payload = parse_tv_page(page, sid)

                if payload:
                    write_cache(kind, sid, payload)
                    print(f"✅ {payload['title']}")
                    ok += 1
                else:
                    print("❌ 解析失败")
                    fail += 1

            except Exception as e:
                print(f"❌ {e}")
                fail += 1

            if i < len(ids) - 1:
                time.sleep(delay)

        browser.close()

    print(f"\n完成: {ok} 成功, {fail} 失败")


def get_failed_ids_from_report() -> dict[str, list[str]]:
    """从 build_report.json 提取 403 失败的 ID。"""
    if not BUILD_REPORT.exists():
        print(f"找不到 {BUILD_REPORT}")
        return {}

    report = json.loads(BUILD_REPORT.read_text(encoding="utf-8"))
    result: dict[str, list[str]] = {}

    for cat in report.get("categories", []):
        fb = cat.get("fallback_summary", {})
        if fb.get("total", 0) == 0:
            continue
        by_status = dict(fb.get("byStatus", []))
        if "403" in by_status:
            cat_id = cat.get("id", "unknown")
            # 从 sampleIds 提取
            ids = fb.get("sampleIds", [])
            if ids:
                result[cat_id] = ids
                print(f"[{cat_id}] 403 失败: {len(by_status['403'])} 个，样本: {', '.join(ids[:5])}...")

    return result


def main():
    ap = argparse.ArgumentParser(description="豆瓣详情缓存补充工具")
    ap.add_argument("--kind", choices=["movie", "tv"], default="movie")
    ap.add_argument("--ids", nargs="*", help="豆瓣 subject ID 列表")
    ap.add_argument("--file", help="从文件读取 ID（每行一个）")
    ap.add_argument("--report", action="store_true", help="从 build_report.json 提取失败 ID 并抓取")
    ap.add_argument("--delay", type=float, default=3.0, help="请求间隔(秒)")
    args = ap.parse_args()

    if args.file:
        ids = Path(args.file).read_text(encoding="utf-8").split()
        ids = [x.strip() for x in ids if x.strip()]
        print(f"从 {args.file} 读取 {len(ids)} 个 ID")
        scrape_ids(ids, args.kind, args.delay)
    elif args.report:
        failed = get_failed_ids_from_report()
        if not failed:
            print("没有发现 403 失败记录")
            return
        # 收集所有失败 ID
        all_ids = []
        for ids in failed.values():
            all_ids.extend(ids)
        # 去重
        all_ids = list(dict.fromkeys(all_ids))
        print(f"\n共 {len(all_ids)} 个失败 ID，开始抓取...")
        scrape_ids(all_ids, "movie", args.delay)  # 默认 movie，实际可按分类区分
    elif args.ids:
        scrape_ids(args.ids, args.kind, args.delay)
    else:
        ap.print_help()


if __name__ == "__main__":
    main()
