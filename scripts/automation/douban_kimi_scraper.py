#!/usr/bin/env python3
"""豆瓣详情页缓存补充工具 — 通过 Kimi WebBridge（真实 Chrome 登录态）抓取页面。

替代原本的 Playwright headless 抓取方案：
- 真实 Chrome 登录态：自动绕过 sec.douban.com 安全验证
- m.douban.com 走 WebBridge HTTP API，不直接发请求
- delay 默认 2s（与原 Playwright 周更节奏一致）

依赖（启动时检查，失败立即报错）：
- Kimi WebBridge daemon 127.0.0.1:10086 存活
- 浏览器扩展已连接（`~/.kimi-webbridge/bin/kimi-webbridge status`）

用法：
  python scripts/douban_kimi_scraper.py --kind movie --ids 36053104 37293378
  python scripts/douban_kimi_scraper.py --kind tv --ids 123456 --all
  python scripts/douban_kimi_scraper.py --report  # 从 build_report.json 提取失败 ID
"""

import argparse
import json
import os
import re
import sys
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import URLError, HTTPError


DAEMON = os.environ.get("KIMI_WB_DAEMON", "http://127.0.0.1:10086/command")
SESSION = os.environ.get("DOUBAN_WB_SESSION", "douban_weekly_scrape")
NAV_TIMEOUT = 60
EVAL_TIMEOUT = 20

PROJECT_ROOT = Path(os.environ.get("CINESCOPE_PROJECT_ROOT") or Path(__file__).resolve().parents[2]).resolve()

CACHE_DIR = PROJECT_ROOT / ".cache" / "douban" / "subjects"
BUILD_REPORT = PROJECT_ROOT / "json" / "build_report.json"
SCHEMA_VERSION = 2


def check_daemon() -> bool:
    """预检：daemon 存活 + extension 已连接。

    status 是 daemon 独立端点 (GET /status)，不是 action。
    daemon 死 → Connection refused / 502 / -L 等连接层错。
    """
    status_url = DAEMON.rsplit("/", 1)[0] + "/status"
    try:
        with urllib.request.urlopen(status_url, timeout=5) as r:
            res = json.loads(r.read().decode() or "{}")
    except (URLError, HTTPError, TimeoutError, json.JSONDecodeError) as e:
        print(f"❌ Kimi WebBridge daemon 未运行 ({status_url})", file=sys.stderr)
        print(f"   {type(e).__name__}: {e}", file=sys.stderr)
        print(f"   启动: ~/.kimi-webbridge/bin/kimi-webbridge start", file=sys.stderr)
        return False
    if not res.get("running"):
        print(f"❌ Kimi WebBridge daemon running=false ({status_url})", file=sys.stderr)
        print(f"   启动: ~/.kimi-webbridge/bin/kimi-webbridge start", file=sys.stderr)
        return False
    if not res.get("extension_connected"):
        print(f"❌ 浏览器扩展未连接到 daemon", file=sys.stderr)
        print(f"   检查 Chrome/Edge 扩展是否启用", file=sys.stderr)
        return False
    return True


def call(action, args=None, timeout=30):
    """daemon HTTP 调用 + 响应 flatten（坑 7：嵌套结构展平）。"""
    payload = {"action": action, "session": SESSION}
    if args is not None:
        payload["args"] = args
    try:
        with urllib.request.urlopen(urllib.request.Request(
            DAEMON,
            data=json.dumps(payload).encode(),
            headers={"Content-Type": "application/json"},
        ), timeout=timeout) as r:
            res = json.loads(r.read().decode() or '{"ok":true}')
    except (URLError, HTTPError, TimeoutError, json.JSONDecodeError) as e:
        return {"ok": False, "error": f"{type(e).__name__}: {e}"}
    if not isinstance(res, dict):
        return {"ok": False, "error": "unexpected response shape"}
    data = res.get("data")
    if isinstance(data, dict):
        flat = {"ok": res.get("ok", True), **data}
        if "error" in res:
            flat["error"] = res["error"]
        return flat
    return res


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


# 单次 evaluate 拿全：JSON-LD + #info + rating + intro
# 用 IIFE 包一层是因为 evaluate 不自动调用 arrow function（直接返 type:function）
EXTRACT_CODE = """(() => {
  const result = {ld: null, info: '', rating: null, intro: '', title: ''};

  // JSON-LD（含控制字符清理）
  const ldEl = document.querySelector('script[type="application/ld+json"]');
  if (ldEl) {
    let text = ldEl.textContent;
    try { result.ld = JSON.parse(text); }
    catch(e) {
      text = text.replace(/[\\x00-\\x1f\\x7f]/g, '');
      try { result.ld = JSON.parse(text); } catch(e2) { result.ld = null; }
    }
  }

  // #info
  const infoEl = document.querySelector('#info');
  if (infoEl) result.info = infoEl.innerText;

  // rating
  const avgEl = document.querySelector('[property="v:average"]');
  const countEl = document.querySelector('.rating_sum');
  if (avgEl) {
    result.rating = {
      value: avgEl.innerText.trim(),
      count: countEl ? countEl.innerText.trim().replace(/[^\\d]/g, '') : '0'
    };
  }

  // intro
  const introEl = document.querySelector('[property="v:summary"]');
  if (introEl) result.intro = introEl.innerText.trim();

  // title fallback
  result.title = document.title || '';

  return JSON.stringify(result);
})()"""


def parse_info_text(info_text: str, is_tv: bool = False) -> dict:
    """从 #info 文本解析导演/主演/国家/语言/上映/又名/集数等。"""
    directors, actors, countries, languages = [], [], [], []
    aka, pubdate = [], []
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
        elif line.startswith('类型:'):
            pass
        elif line.startswith('制片国家/地区:'):
            countries = [x.strip() for x in line.replace('制片国家/地区:', '').strip().split('/') if x.strip()]
        elif line.startswith('语言:'):
            languages = [x.strip() for x in line.replace('语言:', '').strip().split('/') if x.strip()]
        elif line.startswith('上映日期:') or line.startswith('首播:'):
            key = '首播:' if is_tv else '上映日期:'
            dates = line.replace(key, '').strip()
            pubdate = [x.strip() for x in dates.split('/') if x.strip()]
        elif (line.startswith('集数:') or line.startswith('单集片长:')) and is_tv:
            num = re.search(r'\d+', line)
            if num and line.startswith('集数'):
                episodes_info = f"更新至 {num.group()}"
        elif line.startswith('又名:'):
            aka = [x.strip() for x in line.replace('又名:', '').strip().split('/') if x.strip()]
        elif line.startswith('片长:'):
            pass
        elif line.startswith('IMDb:'):
            pass

    return {
        'directors': directors,
        'actors': actors,
        'countries': countries,
        'languages': languages,
        'aka': aka,
        'pubdate': pubdate,
        'episodes_info': episodes_info,
    }


def _rating_or_none(rating: dict | None) -> tuple:
    if not rating or not rating.get('value') or rating['value'] in ('尚未', '暂无'):
        return (None, 0)
    try:
        v = float(rating['value'])
    except (TypeError, ValueError):
        return (None, 0)
    try:
        c = int(rating.get('count', '0') or 0)
    except (TypeError, ValueError):
        c = 0
    return (v, c)


def _clean_name(name: str) -> str:
    """去除英文名后缀，如 \"陈思诚 Sicheng Chen\" -> \"陈思诚\""""
    return re.split(r'\s+[A-Z]', name)[0].strip()


def build_movie_payload(subject_id: str, raw: dict) -> dict:
    ld = raw.get('ld') or {}
    info_text = raw.get('info', '')
    rating = raw.get('rating')
    intro = raw.get('intro', '')

    parsed = parse_info_text(info_text, is_tv=False)
    directors = parsed['directors']
    actors = parsed['actors']
    countries = parsed['countries']
    languages = parsed['languages']
    aka = parsed['aka']
    pubdate = parsed['pubdate']

    if not directors and ld.get('director'):
        ds = ld['director'] if isinstance(ld['director'], list) else [ld['director']]
        for d in ds:
            n = d.get('name', '').strip()
            if n:
                directors.append({"name": _clean_name(n)})
    if not actors and ld.get('actor'):
        for a in ld['actor'][:20]:
            n = a.get('name', '').strip()
            if n:
                actors.append({"name": _clean_name(n)})

    rating_value, rating_count = _rating_or_none(rating)

    genres = ld.get('genre', [])
    if isinstance(genres, str):
        genres = [g.strip() for g in genres.split('/') if g.strip()]

    poster_url = ld.get('image', '')
    year = pubdate[0][:4] if pubdate else ''

    director_names = ' '.join(d['name'] for d in directors[:2])
    actor_names = ' '.join(a['name'] for a in actors[:3])
    genre_str = ' '.join(genres) if isinstance(genres, list) else genres
    parts = [p for p in [year, '/ '.join(countries) if countries else '', genre_str, director_names, actor_names] if p]
    card_subtitle = ' / '.join(parts)

    return {
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


def build_tv_payload(subject_id: str, raw: dict) -> dict:
    ld = raw.get('ld') or {}
    info_text = raw.get('info', '')
    rating = raw.get('rating')
    intro = raw.get('intro', '')

    parsed = parse_info_text(info_text, is_tv=True)
    directors = parsed['directors']
    actors = parsed['actors']
    countries = parsed['countries']
    languages = parsed['languages']
    aka = parsed['aka']
    pubdate = parsed['pubdate']
    episodes_info = parsed['episodes_info']

    if not directors and ld.get('director'):
        ds = ld['director'] if isinstance(ld['director'], list) else [ld['director']]
        for d in ds:
            n = d.get('name', '').strip()
            if n:
                directors.append({"name": _clean_name(n)})
    if not actors and ld.get('actor'):
        for a in ld['actor'][:20]:
            n = a.get('name', '').strip()
            if n:
                actors.append({"name": _clean_name(n)})

    rating_value, rating_count = _rating_or_none(rating)

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

    return {
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


def scrape_ids(ids: list[str], kind: str, delay: float = 2.0):
    """批量抓取并写入 cache。"""
    ok = 0
    fail = 0

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

        # navigate 同时探活（坑 6）
        nav = call("navigate", {"url": url}, timeout=NAV_TIMEOUT)
        if not nav.get("success"):
            err = nav.get('error', 'unknown')
            print(f"❌ navigate: {err}")
            fail += 1
            continue

        # 给真实 Chrome 时间渲染（典型 1-3s）
        time.sleep(delay)

        # 提取数据
        eval_res = call("evaluate", {"code": EXTRACT_CODE}, timeout=EVAL_TIMEOUT)
        if eval_res.get("type") != "string" or not eval_res.get("value"):
            err = eval_res.get('error') or f"type={eval_res.get('type')}, value={eval_res.get('value')}"
            print(f"❌ evaluate: {err}")
            fail += 1
            continue

        try:
            raw = json.loads(eval_res["value"])
        except Exception as e:
            print(f"❌ JSON parse: {e}")
            fail += 1
            continue

        if kind == "movie":
            payload = build_movie_payload(sid, raw)
        else:
            payload = build_tv_payload(sid, raw)

        if not payload.get("title"):
            print("❌ 解析失败 (无 title)")
            fail += 1
            continue

        write_cache(kind, sid, payload)
        print(f"✅ {payload['title']}")
        ok += 1

    print(f"\n完成: {ok} 成功, {fail} 失败")

    # 清理 session
    close = call("close_session")
    print(f"close_session: {close.get('closed', 0)} tab(s) closed")


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
            ids = fb.get("sampleIds", [])
            if ids:
                result[cat_id] = ids
                print(f"[{cat_id}] 403 失败: {len(by_status['403'])} 个，样本: {', '.join(ids[:5])}...")

    return result


def main():
    ap = argparse.ArgumentParser(description="豆瓣详情缓存补充工具 (Kimi WebBridge)")
    ap.add_argument("--kind", choices=["movie", "tv"], default="movie")
    ap.add_argument("--ids", nargs="*", help="豆瓣 subject ID 列表")
    ap.add_argument("--file", help="从文件读取 ID（每行一个）")
    ap.add_argument("--report", action="store_true", help="从 build_report.json 提取失败 ID 并抓取")
    ap.add_argument("--delay", type=float, default=2.0, help="请求间隔(秒)")
    ap.add_argument("--skip-daemon-check", action="store_true", help="跳过 daemon 预检")
    args = ap.parse_args()

    if not args.skip_daemon_check and not check_daemon():
        sys.exit(1)

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
        all_ids = []
        for ids in failed.values():
            all_ids.extend(ids)
        all_ids = list(dict.fromkeys(all_ids))
        print(f"\n共 {len(all_ids)} 个失败 ID，开始抓取...")
        scrape_ids(all_ids, "movie", args.delay)
    elif args.ids:
        scrape_ids(args.ids, args.kind, args.delay)
    else:
        ap.print_help()


if __name__ == "__main__":
    main()
