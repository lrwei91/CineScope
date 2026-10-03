#!/usr/bin/env python3
"""检测 CineScope JSON 在两个 commit 之间 movie id 的漂移情况。

用法:
  python3 detect_id_drift.py <ref1> <ref2> [--category movie_cn|tv_cn] [--project-dir PATH]

输出: 列出所有 title 出现 id 变化的情况,以及 trailer bvid 是否跟着漂移。
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path


def get_version(ref: str, json_path: str, project_dir: Path) -> dict:
    """从 git 历史里读指定 ref 的 JSON。"""
    out = subprocess.run(
        ["git", "show", f"{ref}:{json_path}"],
        cwd=str(project_dir),
        capture_output=True,
        text=True,
        check=True,
    ).stdout
    return json.loads(out)


def payload(data: dict) -> list[dict]:
    return data.get("movies", data.get("shows", data)) if isinstance(data, dict) else data


def collect_bvids(trailers: list[dict]) -> set[str]:
    keys = set()
    for t in trailers or []:
        bvid = (t.get("bvid") or "").strip()
        if bvid:
            keys.add(bvid)
    return keys


def diff(
    ref1: str,
    ref2: str,
    category: str,
    project_dir: Path,
) -> int:
    json_name = f"json/{category}_complete.json"
    if not (project_dir / json_name).exists():
        # fallback to _latest.json
        json_name = f"json/{category}_latest.json"

    try:
        prev = get_version(ref1, json_name, project_dir)
        curr = get_version(ref2, json_name, project_dir)
    except subprocess.CalledProcessError as e:
        print(f"❌ git show 失败: {e}", file=sys.stderr)
        return 2

    prev_items = payload(prev)
    curr_items = payload(curr)

    # 索引: title -> {id, bvids}
    def index_by_title(items: list[dict]) -> dict[str, dict]:
        idx = {}
        for item in items:
            t = (item.get("title") or item.get("name") or "").strip()
            if not t:
                continue
            idx[t] = {
                "id": item.get("id"),
                "bvids": collect_bvids(item.get("trailers", [])),
            }
        return idx

    prev_idx = index_by_title(prev_items)
    curr_idx = index_by_title(curr_items)

    # 检测 id 漂移
    drifted = []
    for title, curr_info in curr_idx.items():
        if title not in prev_idx:
            continue
        prev_info = prev_idx[title]
        if prev_info["id"] != curr_info["id"]:
            drifted.append({
                "title": title,
                "prev_id": prev_info["id"],
                "curr_id": curr_info["id"],
                "prev_bvids": prev_info["bvids"],
                "curr_bvids": curr_info["bvids"],
            })

    # 检测新增 title
    new_titles = [t for t in curr_idx if t not in prev_idx]

    # 输出
    print(f"📊 {ref1} → {ref2} ({json_name})")
    print(f"   prev items: {len(prev_items)}")
    print(f"   curr items: {len(curr_items)}")
    print()

    if not drifted:
        print("✅ 无 id 漂移")
    else:
        print(f"⚠️  {len(drifted)} 部 movie id 发生变化:")
        for d in drifted:
            bvids_changed = "🔄" if d["prev_bvids"] != d["curr_bvids"] else "  "
            print(f"  {bvids_changed} {d['title']}")
            print(f"      id: {d['prev_id']} → {d['curr_id']}")
            if d["prev_bvids"] != d["curr_bvids"]:
                added = d["curr_bvids"] - d["prev_bvids"]
                removed = d["prev_bvids"] - d["curr_bvids"]
                if added:
                    print(f"      bvid 新增: {sorted(added)}")
                if removed:
                    print(f"      bvid 消失: {sorted(removed)}")

    if new_titles:
        print()
        print(f"🆕 {len(new_titles)} 个新 title (不影响 id 漂移):")
        for t in new_titles[:10]:
            print(f"  - {t} (id={curr_idx[t]['id']})")
        if len(new_titles) > 10:
            print(f"  ... 还有 {len(new_titles) - 10} 个")

    # 退出码: 有 id 漂移 = 1 (供 CI / cron 监控用)
    return 1 if drifted else 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("ref1", help="基线 ref (git rev-parse 接受的格式)")
    ap.add_argument("ref2", help="对比 ref")
    ap.add_argument(
        "--category",
        default="movie_cn",
        choices=["movie_cn", "tv_cn", "tv_jp", "tv_kr", "tv_us"],
    )
    ap.add_argument(
        "--project-dir",
        default=str(Path.home() / "Documents" / "Project" / "CineScope"),
    )
    args = ap.parse_args()
    return diff(args.ref1, args.ref2, args.category, Path(args.project_dir))


if __name__ == "__main__":
    sys.exit(main())
