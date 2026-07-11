#!/usr/bin/env python3
"""批量 probe douban ID 是否 404（重定向到 movie.douban.com 首页 / 页面不存在 / 无 JSON-LD）。

CLI 用法：
  python3 ~/.hermes/skills/douban-cache/scripts/douban_probe_404.py

作为模块导入：
  from douban_probe_404 import probe_missing_ids
  valid, not_found, errors = probe_missing_ids(["123", "456"])
"""
import json
import os
import sys
import time
import urllib.request
from pathlib import Path
from urllib.error import URLError, HTTPError


DAEMON = "http://127.0.0.1:10086/command"
SESSION = "douban_404_probe"


def make_caller(daemon: str = DAEMON, session: str = SESSION):
    """返回一个 call(action, args, timeout) 函数，绑定到指定 daemon + session。

    weekly_update.py 用自己的 session 避免和 probe CLI 的 session 冲突。
    """
    def call(action, args=None, timeout=30):
        payload = {"action": action, "session": session}
        if args is not None:
            payload["args"] = args
        try:
            with urllib.request.urlopen(urllib.request.Request(
                daemon, data=json.dumps(payload).encode(),
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
    return call


# 默认 call 走全局 SESSION（CLI 用）
call = make_caller()


PROJECT_ROOT = Path(os.environ.get("CINESCOPE_OUTPUT_ROOT") or Path(__file__).resolve().parents[2]).resolve()
CACHE_DIR = PROJECT_ROOT / ".cache" / "douban" / "subjects" / "movie"
MOVIE_JSON = PROJECT_ROOT / "json" / "movie_cn_complete.json"


# IIFE: 检查 title / URL / JSON-LD 判定是否 404
EVAL_CODE = """(() => {
  const title = document.title;
  const hasLd = !!document.querySelector('script[type="application/ld+json"]');
  return JSON.stringify({title, hasLd, url: location.href});
})()"""


def is_404(info: dict) -> bool:
    """判定 probe 返回的 page info 是否 404。

    douban 404 三种表现：
    1. title == "页面不存在"  — 电影被下架后返回的页面
    2. title == "豆瓣电影" + 无 JSON-LD  — 重定向到首页（rate-limit 也可能触发，但通常会带 JSON-LD）
    3. url 重定向到 https://movie.douban.com/  — 显式首页重定向
    """
    if info.get("title") == "页面不存在":
        return True
    if info.get("title") == "豆瓣电影" and not info.get("hasLd"):
        return True
    if info.get("url", "").rstrip("/") == "https://movie.douban.com":
        return True
    return False


def probe_missing_ids(ids: list[str], session: str | None = None, delay: float = 2.0, verbose: bool = True) -> tuple[list[str], list[str], list[tuple[str, str]]]:
    """批量 probe IDs，返回 (valid_ids, not_found_ids, errors)。

    - valid_ids: 页面正常（hasLd 或非 404 title），可以安全抓取
    - not_found_ids: 确认 404（豆瓣已删除/重组），从 movie_cn_complete.json 删除即可
    - errors: navigate/evaluate 失败（daemon 死 / Chrome 扩展断 / 网络抖），需保留重试
    """
    caller = make_caller(session=session) if session else call
    n = len(ids)
    if verbose:
        print(f"probe 总数: {n}", flush=True)

    valid = []
    not_found = []
    errors = []

    for i, sid in enumerate(ids):
        url = f"https://movie.douban.com/subject/{sid}/"
        nav = caller("navigate", {"url": url}, timeout=30)
        if not nav.get("success"):
            errors.append((sid, nav.get("error", "navigate fail")))
            if verbose:
                print(f"[{i+1}/{n}] {sid} ... ❌ navigate err", flush=True)
            continue

        time.sleep(delay)

        ev = caller("evaluate", {"code": EVAL_CODE}, timeout=15)
        if ev.get("type") != "string":
            errors.append((sid, "evaluate fail"))
            if verbose:
                print(f"[{i+1}/{n}] {sid} ... ❌ evaluate err", flush=True)
            continue

        try:
            info = json.loads(ev["value"])
        except Exception:
            errors.append((sid, "JSON parse"))
            continue

        if is_404(info):
            not_found.append(sid)
            if verbose:
                print(f"[{i+1}/{n}] {sid} ... 🚫 404 ({info.get('title')})", flush=True)
        else:
            valid.append(sid)
            if verbose:
                print(f"[{i+1}/{n}] {sid} ... ✅ {info.get('title')}", flush=True)

    # 清理 session
    caller("close_session")

    if verbose:
        print(f"\n=== 汇总 ===", flush=True)
        print(f"✅ 仍存在: {len(valid)}", flush=True)
        print(f"🚫 404 已删除: {len(not_found)}", flush=True)
        print(f"❌ 错误: {len(errors)}", flush=True)

    return valid, not_found, errors


def get_missing_ids_from_json(movie_json: Path = MOVIE_JSON, cache_dir: Path = CACHE_DIR) -> list[str]:
    """从 movie json 提取未缓存的 ID（去重保序）。"""
    data = json.loads(movie_json.read_text(encoding="utf-8"))
    missing = []
    seen = set()
    for m in data.get("movies", []):
        sid = str(m.get("id", ""))
        if not sid or sid in seen:
            continue
        if not (cache_dir / f"{sid}.json").exists():
            missing.append(sid)
            seen.add(sid)
    return missing


def delete_ids_from_json(not_found_ids: list[str],
                         complete_json: Path = PROJECT_ROOT / "json" / "movie_cn_complete.json",
                         latest_json: Path = PROJECT_ROOT / "json" / "movie_cn_latest.json") -> tuple[int, int]:
    """从 movie_cn_complete + movie_cn_latest 删除指定 IDs，返回 (complete_removed, latest_removed)。"""
    s = set(not_found_ids)

    removed_complete = 0
    if complete_json.exists():
        data = json.loads(complete_json.read_text(encoding="utf-8"))
        before = len(data.get("movies", []))
        data["movies"] = [m for m in data.get("movies", []) if str(m.get("id", "")) not in s]
        removed_complete = before - len(data["movies"])
        complete_json.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    removed_latest = 0
    if latest_json.exists():
        data = json.loads(latest_json.read_text(encoding="utf-8"))
        before = len(data.get("movies", []))
        data["movies"] = [m for m in data.get("movies", []) if str(m.get("id", "")) not in s]
        removed_latest = before - len(data["movies"])
        latest_json.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    return removed_complete, removed_latest


def main():
    """CLI 用法：probe 当前 missing IDs + 删除 404（不传参数时）。"""
    missing = get_missing_ids_from_json()
    if not missing:
        print("没有 missing IDs")
        return

    valid, not_found, errors = probe_missing_ids(missing)

    if not_found:
        rc, rl = delete_ids_from_json(not_found)
        print(f"\n已从 movie_cn_complete 删除 {rc} 条", flush=True)
        print(f"已从 movie_cn_latest 删除 {rl} 条", flush=True)
    else:
        print("\n无需删除", flush=True)

    if errors:
        print(f"\n⚠️ {len(errors)} 个 probe 错误（daemon/网络问题，保留重试）", flush=True)


if __name__ == "__main__":
    main()
