#!/usr/bin/env python3
"""豆瓣缓存每周自动更新脚本。

自动提取缺失 ID → 浏览器抓取 → 构建 → Git 提交。
"""

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CACHE_DIR = ROOT / ".cache" / "douban" / "subjects" / "movie"
MOVIE_JSON = ROOT / "json" / "movie_cn_complete.json"
SCRAPER = ROOT / "scripts" / "douban_browser_scraper.py"
CATALOG = ROOT / "scripts" / "generate_douban_catalog.mjs"


def get_missing_ids() -> list[str]:
    """从 movie_cn_complete.json 提取未缓存的电影 ID。"""
    if not MOVIE_JSON.exists():
        print("找不到 movie_cn_complete.json，跳过")
        return []

    data = json.loads(MOVIE_JSON.read_text(encoding="utf-8"))
    movies = data.get("movies", [])
    missing = []

    for m in movies:
        sid = str(m.get("id", ""))
        cp = CACHE_DIR / f"{sid}.json"
        if not cp.exists():
            missing.append(sid)

    print(f"缺失缓存: {len(missing)} 个")
    return missing


def run_scraper(ids: list[str]) -> bool:
    """运行豆瓣抓取脚本。"""
    if not ids:
        print("没有缺失 ID，跳过抓取")
        return True

    id_file = ROOT / "scripts" / ".tmp_missing_ids.txt"
    id_file.write_text("\n".join(ids), encoding="utf-8")

    cmd = [sys.executable, str(SCRAPER), "--kind", "movie", "--file", str(id_file), "--delay", "2"]
    print(f"执行: {' '.join(cmd[:5])} ...")
    result = subprocess.run(cmd, capture_output=False, timeout=600)

    id_file.unlink(missing_ok=True)
    return result.returncode == 0


def run_catalog() -> bool:
    """运行构建脚本。"""
    cmd = ["node", str(CATALOG)]
    print("执行构建...")
    result = subprocess.run(cmd, capture_output=False, timeout=300)
    return result.returncode == 0


def git_commit() -> bool:
    """提交变更到 git。"""
    cmds = [
        ["git", "add", ".cache/douban/", "json/"],
        ["git", "commit", "-m", "chore: 每周日豆瓣缓存更新"],
        ["git", "push"],
    ]
    for cmd in cmds:
        result = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True)
        print(f"  {' '.join(cmd[:3])}... {result.returncode}")
        if result.returncode != 0:
            # commit 可能因为没有变更而失败，不算错误
            if "nothing to commit" in result.stderr or "nothing to commit" in result.stdout:
                print("  (无变更)")
                return True
            print(f"  stderr: {result.stderr[:200]}")
            return False
    return True


def main():
    print("=== 豆瓣缓存周更新开始 ===")

    missing = get_missing_ids()
    if not run_scraper(missing):
        print("抓取失败")
        sys.exit(1)

    if not run_catalog():
        print("构建失败")
        sys.exit(1)

    if not git_commit():
        print("Git 提交失败")
        sys.exit(1)

    print("=== 豆瓣缓存周更新完成 ===")


if __name__ == "__main__":
    main()
