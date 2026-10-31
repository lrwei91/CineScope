#!/usr/bin/env python3
"""给缺豆瓣链接的条目补链、补封面。

背景：中日韩美剧 2020 年起历史回捞后，大量条目只来自 TMDB，没有豆瓣 subject，
``douban_link_google`` 为空、``poster_path`` 还是 TMDB 原始路径（iOS 端按站内路径解析，
必然 404），表现为详情页没有豆瓣入口、卡片无封面。

通道（2026-10-31 实测，替代已失效的 ``/j/subject_suggest``）：
- ``movie.douban.com/j/subject_suggest`` 会软限流，前端表现是返回空数组，还会被
  「检测到有异常请求从您的IP发出」拒绝整类 /j/ 接口；
- ``m.douban.com/rexxar/api/v2/search/subjects`` 正常，且一次请求就带标题/年份/
  影视类型/评分/封面，所以改用它，经 BrowserSkill 登录态 Chrome 同源 fetch；
- 豆瓣图床对 python-requests 只回 989 字节拦截页（curl 没事），封面统一用 curl 取，
  并按封面 p-id 换成 ``m_ratio_poster`` 规格（540x675，与库内海报量级一致）。

流程（只处理缺链条目）：
1. 按片名/原名/别名批量搜索候选
2. 规范化标题全等 + 年份 ±1 + 影视类型一致才算命中
3. 命中 → 写 douban_link_google / douban_rating / douban_link_verified，封面落地
4. 未命中但有 TMDB 海报 → 下载到 ``posters/tmdb/<category>/<subject_id>.jpg``，
   否则 iOS 把 ``/xxx.jpg`` 当站内路径，永远没有封面

结果写入 ``.cache/douban/suggest_matches.json``，可断点续跑；``--budget`` 限制
单轮处理条数，``--until-empty`` 反复小批次推进，便于长跑与周更任务。
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

PROJECT_ROOT = Path(__file__).resolve().parents[2]
OUTPUT_ROOT = Path(os.environ.get("CINESCOPE_OUTPUT_ROOT") or PROJECT_ROOT).resolve()
CACHE_DIR = PROJECT_ROOT / ".cache" / "douban"
MATCH_CACHE = CACHE_DIR / "suggest_matches.json"

KIND_BY_CATEGORY = {
    "movie_cn": "movie",
    "tv_cn": "tv",
    "tv_cn_variety": "tv",
    "tv_jp": "tv",
    "tv_kr": "tv",
    "tv_us": "tv",
}
DEFAULT_CATEGORIES = "movie_cn,tv_cn,tv_jp,tv_kr,tv_us"

DOUBAN_MOBILE_ORIGIN = "https://m.douban.com"
DOUBAN_MOBILE_ANCHOR = "/movie/"
SEARCH_PATH = "/rexxar/api/v2/search/subjects?q={query}&count={count}"
SUBJECT_URL = "https://movie.douban.com/subject/{sid}/"
TMDB_IMAGE_URL = "https://image.tmdb.org/t/p/w500{path}"
DOUBAN_POSTER_URL = "https://img9.doubanio.com/view/photo/m_ratio_poster/public/p{pid}.jpg"

CURL_UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
)

SEASON_SUFFIX = re.compile(
    r"(?:第\s*[0-9一二三四五六七八九十]+\s*季|season\s*\d+|s\d{1,2})$", re.IGNORECASE
)
PUNCTUATION = re.compile(r"[\s:：·•'\"’“”.,，、!！?？\-—–_()（）\[\]【】]")
POSTER_ID = re.compile(r"/p(\d+)\.jpg")

CANARY_QUERY = "辐射"
CANARY_RETRIES = 3
CANARY_BACKOFF_SECONDS = 60
CANARY_MIN_RESULTS = 1
SUSPECT_BATCH_SIZE = 8
SUSPECT_EMPTY_RATIO = 0.95

SESSION_LOST_PATTERN = re.compile(
    r"session not registered|already stopped|session_idle_timeout|no such session", re.IGNORECASE
)


class MatchError(RuntimeError):
    pass


# ---------------------------------------------------------------- 纯函数（可测试）


def normalize_title(value: Any) -> str:
    """与生成器 normalizeLookupText 一致：去控制符、标点与空格后小写。"""
    text = str(value or "")
    text = re.sub(r"[\u0000-\u001f\u007f-\u009f\u200b\u200c\u200d\ufeff]", "", text)
    text = PUNCTUATION.sub("", text)
    return text.strip().lower()


def strip_season(key: str) -> str:
    stripped = SEASON_SUFFIX.sub("", key)
    return stripped or key


def title_key_variants(*values: Any) -> list[str]:
    keys: list[str] = []
    for value in values:
        key = normalize_title(value)
        if not key:
            continue
        for candidate in (key, strip_season(key)):
            if candidate and candidate not in keys:
                keys.append(candidate)
    return keys


def is_tv_item(kind: str) -> bool:
    return kind == "tv"


def item_title(item: dict, kind: str) -> str:
    return str((item.get("name") if is_tv_item(kind) else item.get("title")) or "")


def item_original_title(item: dict, kind: str) -> str:
    return str(
        (item.get("original_name") if is_tv_item(kind) else item.get("original_title")) or ""
    )


def item_date(item: dict, kind: str) -> str:
    if is_tv_item(kind):
        seasons = item.get("seasons") or []
        first = seasons[0] if seasons and isinstance(seasons[0], dict) else {}
        return str(item.get("first_air_date") or first.get("air_date") or "")
    return str(item.get("release_date") or "")


def season_zero(item: dict) -> dict:
    seasons = item.get("seasons") or []
    if seasons and isinstance(seasons[0], dict):
        return seasons[0]
    return {}


def douban_link_of(item: dict, kind: str) -> str:
    season = season_zero(item) if is_tv_item(kind) else {}
    return str(season.get("douban_link_google") or item.get("douban_link_google") or "")


def poster_of(item: dict, kind: str) -> str:
    season = season_zero(item) if is_tv_item(kind) else {}
    return str(season.get("poster_path") or item.get("poster_path") or "")


def build_queries(item: dict, kind: str, limit: int = 3) -> list[str]:
    values = [item_title(item, kind), item_original_title(item, kind)]
    aka = item.get("aka")
    if isinstance(aka, list):
        values.extend(aka[:4])
    queries: list[str] = []
    for value in values:
        text = str(value or "").strip()
        if len(text) < 2 or text in queries:
            continue
        queries.append(text)
        if len(queries) >= limit:
            break
    return queries


def candidate_from_search(entry: dict) -> dict | None:
    """把 rexxar 搜索结果摊平成匹配用的候选结构。"""
    target = (entry or {}).get("target") or {}
    subject_id = str(target.get("id") or entry.get("target_id") or "").strip()
    title = str(target.get("title") or "").strip()
    if not subject_id or not title:
        return None
    rating = (target.get("rating") or {}).get("value")
    return {
        "id": subject_id,
        "title": title,
        "year": str(target.get("year") or "")[:4],
        "type": str(entry.get("target_type") or "").strip(),
        "img": str(target.get("cover_url") or ""),
        "rating": rating if isinstance(rating, (int, float)) and rating else None,
        "episode": str(target.get("episodes_count") or ""),
    }


def score_candidate(item: dict, kind: str, candidate: dict) -> int | None:
    """返回匹配得分（越小越好），None 表示不可接受。"""
    target_year = item_date(item, kind)[:4]
    titles = title_key_variants(
        item_title(item, kind),
        item_original_title(item, kind),
        *(item.get("aka") or [])[:6],
    )
    candidate_title = normalize_title(candidate.get("title"))
    candidate_sub = normalize_title(candidate.get("sub_title"))
    candidate_year = str(candidate.get("year") or "")[:4]

    if not titles or not (candidate_title or candidate_sub):
        return None

    exact = False
    for title in titles:
        for cand in (candidate_title, strip_season(candidate_title)):
            if cand and cand == title:
                exact = True
                break
        if exact:
            break
    if not exact:
        for title in titles:
            for cand in (candidate_sub, strip_season(candidate_sub)):
                if cand and cand == title:
                    exact = True
                    break
            if exact:
                break
    if not exact:
        return None

    year_penalty = 0
    if target_year and candidate_year:
        try:
            diff = abs(int(candidate_year) - int(target_year))
        except ValueError:
            diff = 0
        if diff > 1:
            return None
        year_penalty = diff

    # 影视类型必须一致：豆瓣的 tv/movie 分类可靠，错类型等于错条目
    candidate_type = str(candidate.get("type") or "")
    if candidate_type:
        expected = "tv" if is_tv_item(kind) else "movie"
        if candidate_type != expected:
            return None

    return year_penalty


def pick_best(item: dict, kind: str, candidates: list[dict]) -> dict | None:
    scored = []
    for candidate in candidates:
        score = score_candidate(item, kind, candidate)
        if score is None:
            continue
        has_episode = bool(str(candidate.get("episode") or "").strip())
        tie_break = 0 if (is_tv_item(kind) == has_episode) else 1
        scored.append((score, tie_break, candidate))
    if not scored:
        return None
    scored.sort(key=lambda entry: (entry[0], entry[1]))
    return scored[0][2]


def poster_id_from_cover(cover_url: str) -> str:
    match = POSTER_ID.search(str(cover_url or ""))
    return match.group(1) if match else ""


def poster_candidates(cover_url: str) -> list[str]:
    """优先用 p-id 拼标准规格，拿不到再退回原始封面地址。"""
    pid = poster_id_from_cover(cover_url)
    urls = []
    if pid:
        urls.append(DOUBAN_POSTER_URL.format(pid=pid))
    if cover_url and str(cover_url).startswith("http"):
        urls.append(str(cover_url))
    return urls


# ---------------------------------------------------------------- 缓存


def load_cache() -> dict:
    if not MATCH_CACHE.exists():
        return {}
    try:
        return json.loads(MATCH_CACHE.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}


def save_cache(cache: dict) -> None:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    MATCH_CACHE.write_text(
        json.dumps(cache, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )


UNMATCHED_TTL_DAYS = 30


def cache_entry_expired(entry: dict, ttl_days: int = UNMATCHED_TTL_DAYS) -> bool:
    """未命中的记录会过期重试，避免豆瓣后来补了条目却永久跳过。"""
    checked = str(entry.get("checked_at") or "")
    if not checked:
        return False
    try:
        checked_at = datetime.fromisoformat(checked.replace("Z", "+00:00"))
    except ValueError:
        return True
    if checked_at.tzinfo is None:
        checked_at = checked_at.replace(tzinfo=timezone.utc)
    age = datetime.now(timezone.utc) - checked_at
    return age.days >= ttl_days


# ---------------------------------------------------------------- BrowserSkill 通道


SEARCH_BATCH_CODE = """
(async () => {
  const queries = %s;
  const out = {};
  for (const q of queries) {
    await new Promise(r => setTimeout(r, %d));
    try {
      const url = '/rexxar/api/v2/search/subjects?q=' + encodeURIComponent(q) + '&count=%d';
      const resp = await fetch(url, {credentials: 'include', headers: {'Content-Type': 'application/json'}});
      const text = await resp.text();
      let payload = {};
      try { payload = text ? JSON.parse(text) : {}; } catch (e) { payload = {}; }
      const items = (payload.subjects && payload.subjects.items) || [];
      out[q] = {status: resp.status, banned: payload.banned || '', items: items};
    } catch (error) {
      out[q] = {status: 0, banned: '', items: [], error: String(error)};
    }
  }
  return out;
})()
"""


class DoubanSearchClient:
    """基于 BrowserSkill 登录态 Chrome 的豆瓣搜索客户端。"""

    def __init__(self, delay_ms: int = 450, batch_size: int = 10, count: int = 10, max_retries: int = 2):
        self.delay_ms = delay_ms
        self.batch_size = batch_size
        self.count = count
        self.max_retries = max_retries
        self.request_count = 0
        self._client = None

    def __enter__(self) -> "DoubanSearchClient":
        sys.path.insert(0, str(Path.home() / ".hermes" / "scripts" / "lib"))
        try:
            from browser_skill_client import BrowserSkillClient  # noqa: PLC0415
        except ImportError as exc:  # pragma: no cover - 运行环境缺依赖
            raise MatchError(f"BrowserSkill 客户端不可用: {exc}") from exc
        self._client = BrowserSkillClient()
        self._client.start()
        self._client.navigate(DOUBAN_MOBILE_ORIGIN + DOUBAN_MOBILE_ANCHOR, timeout=90)
        return self

    def restart(self) -> None:
        """bsk 默认 5 分钟会话空闲回收，长任务需要能自愈重开。"""
        if self._client is not None:
            try:
                self._client.stop()
            except Exception:  # noqa: BLE001 - 旧会话可能已失效
                pass
        self._client = None
        self.__enter__()

    def __exit__(self, *exc_info) -> None:
        if self._client is not None:
            try:
                self._client.stop()
            except Exception:  # pragma: no cover - 关闭失败不影响结果
                pass
            self._client = None

    def _evaluate(self, code: str, timeout: float = 120) -> Any:
        assert self._client is not None
        result = self._client.evaluate(code, timeout=timeout)
        return result.get("value") if isinstance(result, dict) else result

    def search(self, queries: list[str]) -> dict[str, list[dict]]:
        """批量搜索；一批里几乎全空时判定为限流，抛错而不是把空结果当成「无对应」。"""
        results = self._search_raw(queries)
        if len(queries) >= SUSPECT_BATCH_SIZE:
            empties = sum(1 for query in queries if not results.get(query))
            if empties / len(queries) >= SUSPECT_EMPTY_RATIO:
                raise MatchError(
                    f"搜索返回大面积空结果（{empties}/{len(queries)}），疑似限流；"
                    "本轮不写未命中缓存，稍后重试"
                )
        return results

    def _search_raw(self, queries: list[str]) -> dict[str, list[dict]]:
        out: dict[str, list[dict]] = {}
        for start in range(0, len(queries), self.batch_size):
            chunk = queries[start : start + self.batch_size]
            # 每批都夹一个金丝雀：接口限流时返回 200 + 空数组，只看批量空比例会漏检
            chunk = [CANARY_QUERY, *[query for query in chunk if query != CANARY_QUERY]]
            payload = None
            for attempt in range(self.max_retries + 1):
                try:
                    payload = self._evaluate(
                        SEARCH_BATCH_CODE
                        % (json.dumps(chunk, ensure_ascii=False), self.delay_ms, self.count)
                    )
                    break
                except Exception as exc:  # noqa: BLE001 - bsk 异常类型繁多
                    if attempt == self.max_retries:
                        raise MatchError(f"bsk evaluate 失败: {exc}") from exc
                    if SESSION_LOST_PATTERN.search(str(exc)):
                        self.restart()
                    else:
                        time.sleep(2.0 * (attempt + 1))
            if not isinstance(payload, dict):
                continue
            self.request_count += len(chunk)
            canary = (payload.get(CANARY_QUERY) or {}).get("items") or []
            if not canary:
                raise MatchError(
                    "豆瓣搜索金丝雀在本批无结果，判定限流；本轮不写未命中缓存，稍后重试"
                )
            for query in chunk:
                entry = payload.get(query) or {}
                candidates = [candidate_from_search(item) for item in (entry.get("items") or [])]
                out[query] = [c for c in candidates if c]
        return out

    def ensure_healthy(self) -> None:
        """搜索接口也会软限流；限流时不能把空结果当成「豆瓣没有这个条目」。"""
        for attempt in range(CANARY_RETRIES + 1):
            results = self.search([CANARY_QUERY])
            if len(results.get(CANARY_QUERY) or []) >= CANARY_MIN_RESULTS:
                return
            if attempt == CANARY_RETRIES:
                raise MatchError(
                    "豆瓣搜索金丝雀查询无结果，疑似限流；本轮不写未命中缓存，稍后重试"
                )
            time.sleep(CANARY_BACKOFF_SECONDS)


# ---------------------------------------------------------------- 封面


def _curl_bytes(url: str, referer: str, retries: int = 2) -> bytes | None:
    """python-requests 会被豆瓣图床拦成 989 字节拦截页，curl 正常。"""
    for attempt in range(retries + 1):
        try:
            result = subprocess.run(
                [
                    "curl",
                    "-sS",
                    "-m",
                    "25",
                    "-A",
                    CURL_UA,
                    "-H",
                    f"Referer: {referer}",
                    url,
                ],
                capture_output=True,
                timeout=40,
            )
            if result.returncode == 0 and len(result.stdout) > 1024:
                return result.stdout
        except (OSError, subprocess.SubprocessError):
            pass
        if attempt < retries:
            time.sleep(1.0 * (attempt + 1))
    return None


def _write_poster(relative: Path, urls: list[str], referer: str) -> str | None:
    target = OUTPUT_ROOT / relative
    if target.exists() and target.stat().st_size > 1024:
        return relative.as_posix()
    # 仓库里已有同名海报时不覆盖：既有图可能是更高规格，不能被小图替换
    existing = PROJECT_ROOT / relative
    if existing.exists() and existing.stat().st_size > 1024:
        return relative.as_posix()
    for url in urls:
        blob = _curl_bytes(url, referer)
        if blob:
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(blob)
            return relative.as_posix()
    return None


def download_poster(category: str, subject_id: str, cover_url: str) -> str | None:
    return _write_poster(
        Path("posters") / "douban" / category / f"{subject_id}.jpg",
        poster_candidates(cover_url),
        "https://movie.douban.com/",
    )


# ---------------------------------------------------------------- 写回数据


def apply_match(item: dict, kind: str, link: str, rating: Any, poster: str | None) -> None:
    if is_tv_item(kind):
        seasons = item.setdefault("seasons", [{}])
        if not seasons or not isinstance(seasons[0], dict):
            seasons.insert(0, {})
        season = seasons[0]
        season["douban_link_google"] = link
        season["douban_link_verified"] = True
        if rating:
            season["douban_rating"] = rating
        if poster:
            season["poster_path"] = poster
            item["poster_path"] = poster
    else:
        item["douban_link_google"] = link
        item["douban_link_verified"] = True
        if rating:
            item["douban_rating"] = rating
        if poster:
            item["poster_path"] = poster


def apply_poster(item: dict, kind: str, poster: str) -> None:
    if is_tv_item(kind):
        seasons = item.setdefault("seasons", [{}])
        if seasons and isinstance(seasons[0], dict):
            seasons[0]["poster_path"] = poster
        item["poster_path"] = poster
    else:
        item["poster_path"] = poster


# ---------------------------------------------------------------- 主流程


def repair_posters(category: str, kind: str, items: list[dict], cache: dict, *, dry_run: bool) -> int:
    """已有豆瓣链接但封面还不可用的条目，补下载（历史补链遗留）。"""
    repaired = 0
    for item in items:
        if not douban_link_of(item, kind):
            continue
        current = poster_of(item, kind)
        if current and not current.startswith("/") and not current.startswith("http"):
            if (OUTPUT_ROOT / current).exists():
                continue
        if dry_run:
            continue
        poster = None
        cached = cache.get(f"{category}:{item.get('id')}") or {}
        if cached.get("status") == "matched" and cached.get("poster_url"):
            poster = download_poster(category, cached["subject_id"], cached["poster_url"])
            if poster:
                cached["poster"] = poster
        if poster and poster != current:
            apply_poster(item, kind, poster)
            repaired += 1
    return repaired


def sync_latest(category: str, kind: str, items: list[dict], *, dry_run: bool) -> int:
    """把 complete 里的豆瓣字段同步到 latest（两端页面分别读不同文件）。"""
    latest_path = OUTPUT_ROOT / "json" / f"{category}_latest.json"
    if not latest_path.exists():
        return 0
    payload = json.loads(latest_path.read_text(encoding="utf-8"))
    latest_items = payload.get("shows") if is_tv_item(kind) else payload.get("movies")
    if not isinstance(latest_items, list):
        return 0
    source = {str(item.get("id")): item for item in items}
    updated = 0
    for item in latest_items:
        origin = source.get(str(item.get("id")))
        if not origin:
            continue
        origin_season = season_zero(origin) if is_tv_item(kind) else {}
        target_season = season_zero(item) if is_tv_item(kind) else {}
        changed = False
        for key in ("douban_link_google", "douban_link_verified", "douban_rating"):
            value = origin_season.get(key) if is_tv_item(kind) else origin.get(key)
            if not value:
                continue
            if is_tv_item(kind):
                if target_season.get(key) != value:
                    target_season[key] = value
                    changed = True
            elif item.get(key) != value:
                item[key] = value
                changed = True
        poster = poster_of(origin, kind)
        if poster and not poster.startswith("/") and poster_of(item, kind) != poster:
            if is_tv_item(kind) and target_season:
                target_season["poster_path"] = poster
            item["poster_path"] = poster
            changed = True
        if changed:
            updated += 1
    if updated and not dry_run:
        latest_path.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
    return updated


def process_category(
    category: str,
    kind: str,
    client: "DoubanSearchClient | None",
    cache: dict,
    *,
    budget: int,
    dry_run: bool,
) -> dict:
    path = OUTPUT_ROOT / "json" / f"{category}_complete.json"
    if not path.exists():
        return {"category": category, "skipped": "missing json"}
    payload = json.loads(path.read_text(encoding="utf-8"))
    items = payload.get("shows") if is_tv_item(kind) else payload.get("movies")
    if not isinstance(items, list):
        return {"category": category, "skipped": "unexpected json shape"}

    stats = {
        "category": category,
        "total": len(items),
        "missing_link": 0,
        "matched": 0,
        "unmatched": 0,
        "poster_from_douban": 0,
        "poster_from_tmdb": 0,
        "cache_hits": 0,
        "budget_exhausted": False,
        "changed": False,
    }

    pending: list[tuple[dict, str, str, str]] = []
    for item in items:
        if douban_link_of(item, kind):
            continue
        stats["missing_link"] += 1
        cache_key = f"{category}:{item.get('id')}"
        cached = cache.get(cache_key) or {}
        if cached.get("status") == "matched":
            poster = cached.get("poster")
            if not dry_run and (not poster or not (OUTPUT_ROOT / poster).exists()):
                poster = download_poster(category, cached["subject_id"], cached.get("poster_url") or "")
                if poster:
                    cached["poster"] = poster
            apply_match(item, kind, cached["link"], cached.get("rating"), poster)
            stats["matched"] += 1
            stats["cache_hits"] += 1
            stats["changed"] = True
            continue
        if cached.get("status") == "unmatched" and not cache_entry_expired(cached):
            stats["unmatched"] += 1
            continue
        if len(pending) >= budget:
            stats["budget_exhausted"] = True
            continue
        pending.append((item, cache_key, str(item.get("id")), item_date(item, kind)[:4]))

    repaired = repair_posters(category, kind, items, cache, dry_run=dry_run)
    if repaired:
        stats["poster_from_douban"] += repaired
        stats["changed"] = True

    if pending:
        assert client is not None
        client.ensure_healthy()
        queries: list[str] = []
        for item, _key, _sid, _year in pending:
            for query in build_queries(item, kind):
                if query not in queries:
                    queries.append(query)
        search_results = client.search(queries)

        chosen: dict[int, dict] = {}
        for index, (item, _key, _sid, _year) in enumerate(pending):
            for query in build_queries(item, kind):
                candidate = pick_best(item, kind, search_results.get(query) or [])
                if candidate:
                    chosen[index] = candidate
                    break

        saved_marker = 0
        for index in range(len(pending)):
            item, cache_key, _sid, year = pending[index]
            candidate = chosen.get(index)
            if not candidate:
                # 未命中就不写豆瓣链接；TMDB 原始路径由客户端按图床解析，
                # 不在这里落地成几千张大图，避免仓库体积失控
                stats["unmatched"] += 1
                cache[cache_key] = {
                    "status": "unmatched",
                    "checked_at": datetime.now(timezone.utc).isoformat(),
                }
            else:
                subject_id = str(candidate["id"])
                link = SUBJECT_URL.format(sid=subject_id)
                rating = candidate.get("rating")
                cover_url = str(candidate.get("img") or "")
                poster = None if dry_run else download_poster(category, subject_id, cover_url)
                if poster:
                    stats["poster_from_douban"] += 1
                apply_match(item, kind, link, rating, poster)
                cache[cache_key] = {
                    "status": "matched",
                    "subject_id": subject_id,
                    "link": link,
                    "rating": rating,
                    "poster": poster,
                    "poster_url": cover_url,
                    "title": candidate.get("title"),
                    "year": candidate.get("year"),
                    "checked_at": datetime.now(timezone.utc).isoformat(),
                }
                stats["matched"] += 1
                stats["changed"] = True

            if len(cache) - saved_marker >= 100:
                save_cache(cache)
                saved_marker = len(cache)

    save_cache(cache)
    latest_updated = sync_latest(category, kind, items, dry_run=dry_run)
    stats["latest_synced"] = latest_updated
    if (stats["changed"] or latest_updated) and not dry_run:
        path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return stats


THROTTLE_MARKERS = ("限流", "金丝雀", "大面积空结果")


def _is_throttle_error(error: Exception) -> bool:
    text = str(error)
    return any(marker in text for marker in THROTTLE_MARKERS)


def main() -> int:
    parser = argparse.ArgumentParser(description="补豆瓣链接与封面")
    parser.add_argument("--categories", default=os.environ.get("CATEGORIES", DEFAULT_CATEGORIES))
    parser.add_argument("--budget", type=int, default=250, help="每个分类单轮最多处理条数")
    parser.add_argument("--delay-ms", type=int, default=2000, help="浏览器内请求间隔（毫秒）")
    parser.add_argument("--batch-size", type=int, default=10)
    parser.add_argument("--count", type=int, default=10, help="每次搜索返回候选数")
    parser.add_argument("--until-empty", action="store_true", help="反复小批次推进直到没有待补条目")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    categories = [value.strip() for value in args.categories.split(",") if value.strip()]
    unknown = [value for value in categories if value not in KIND_BY_CATEGORY]
    if unknown:
        print(f"未知分类: {', '.join(unknown)}", file=sys.stderr)
        return 2

    cache = load_cache()
    total_requests = 0
    rounds = 0
    while True:
        try:
            rounds += 1
            remaining = 0
            with DoubanSearchClient(
                delay_ms=args.delay_ms, batch_size=args.batch_size, count=args.count
            ) as client:
                for category in categories:
                    stats = process_category(
                        category,
                        KIND_BY_CATEGORY[category],
                        client,
                        cache,
                        budget=args.budget,
                        dry_run=args.dry_run,
                    )
                    if stats.get("budget_exhausted"):
                        remaining += 1
                    print(json.dumps({**stats, "round": rounds}, ensure_ascii=False), flush=True)
                total_requests += client.request_count
        except MatchError as error:
            if _is_throttle_error(error):
                # 限流是外部状态，不是任务失败：不写任何数据，静默跳过本轮
                print(
                    json.dumps({"status": "skipped", "reason": str(error)[:200]}, ensure_ascii=False),
                    flush=True,
                )
                return 0
            raise
        if not args.until_empty or remaining == 0:
            break
        print(
            json.dumps({"round_done": rounds, "categories_with_backlog": remaining}, ensure_ascii=False),
            flush=True,
        )
    print(
        json.dumps(
            {
                "requests": total_requests,
                "cache_entries": len(cache),
                "rounds": rounds,
                "dry_run": args.dry_run,
            },
            ensure_ascii=False,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
