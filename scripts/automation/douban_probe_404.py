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
from pathlib import Path

sys.path.insert(0, str(Path.home() / ".hermes" / "scripts" / "lib"))
from browser_skill_client import BrowserSkillClient, BrowserSkillError  # noqa: E402


SESSION = "douban-404-probe"


def make_caller(daemon: str | None = None, session: str = SESSION):
    """返回绑定到一个 BrowserSkill session 的 call(action, args, timeout) 函数。

    ``daemon`` 仅为兼容旧调用方保留，不再作为 HTTP 地址使用。
    """
    client = BrowserSkillClient()
    try:
        client.start()
    except (BrowserSkillError, OSError, TimeoutError) as exc:
        def failed_call(action, args=None, timeout=30):
            return {"ok": False, "error": str(exc)}
        setattr(failed_call, "close", lambda: None)
        return failed_call

    def call(action, args=None, timeout=30):
        try:
            result = client.command(action, args, timeout=timeout)
        except (BrowserSkillError, OSError, TimeoutError) as exc:
            return {"ok": False, "error": str(exc)}
        if isinstance(result, dict):
            result.setdefault("ok", True)
            return result
        return {"ok": False, "error": "unexpected response shape"}

    def close():
        try:
            client.stop()
        except (BrowserSkillError, OSError, TimeoutError):
            pass

    setattr(call, "close", close)
    return call


# 默认 call 懒启动，导入模块不会创建 BrowserSkill session。
_DEFAULT_CALLER = None


def call(action, args=None, timeout=30):
    global _DEFAULT_CALLER
    if _DEFAULT_CALLER is None:
        _DEFAULT_CALLER = make_caller()
    return _DEFAULT_CALLER(action, args, timeout)


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
    caller = make_caller(session=session) if session else make_caller()
    n = len(ids)
    if verbose:
        print(f"probe 总数: {n}", flush=True)

    valid = []
    not_found = []
    errors = []

    for i, sid in enumerate(ids):
        url = f"https://movie.douban.com/subject/{sid}/"
        nav = caller("navigate", {"url": url}, timeout=30)
        if nav.get("ok") is False or not nav.get("final_url"):
            errors.append((sid, nav.get("error", "navigate fail")))
            if verbose:
                print(f"[{i+1}/{n}] {sid} ... ❌ navigate err", flush=True)
            continue

        time.sleep(delay)

        ev = caller("evaluate", {"code": EVAL_CODE}, timeout=15)
        if ev.get("ok") is False or not isinstance(ev.get("value"), str):
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

    # 清理本次 caller 绑定的 BrowserSkill session。
    getattr(caller, "close", lambda: None)()

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
