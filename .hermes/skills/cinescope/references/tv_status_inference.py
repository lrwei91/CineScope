#!/usr/bin/env python3
"""从豆瓣 rexxar TV 缓存推断连载/完结状态，写入 JSON。

用法（作为模块）：
  from tv_status_inference import infer_tv_status, update_shows_status, status_type_label

推断逻辑：
  1. episodes_info 含 "集全"/"完结" → completed
  2. episodes_info 含 "更新至X集"，且 X >= episodes_count → completed
  3. episodes_info 含 "更新至X集"，且 X < episodes_count → ongoing
  4. is_released=False + episodes_count>0 → completed
  5. episodes_count>0 但 episodes_info 为空 → uncertain（周播/刚开播）
  6. 其余 → unknown

CLI：
  python3 tv_status_inference.py --json /Users/lrwei91/Documents/Project/CineScope/json/tv_cn_complete.json
"""
import json
import re
from pathlib import Path
from typing import Literal

StatusType = Literal["completed", "ongoing", "uncertain", "unknown"]
StatusResult = tuple[StatusType, str]


def infer_tv_status(payload: dict) -> StatusResult:
    ep_info: str = payload.get("episodes_info") or ""
    ep_count = payload.get("episodes_count") or 0
    is_released = payload.get("is_released")

    if "集全" in ep_info or "完结" in ep_info:
        return ("completed", ep_info)

    update_match = re.search(r"更新至(\d+)集", ep_info)
    if update_match:
        updated = int(update_match.group(1))
        if ep_count and updated >= ep_count:
            return ("completed", f"{ep_count}集全")
        return ("ongoing", ep_info)

    if is_released is False and ep_count and ep_count > 0:
        return ("completed", f"{ep_count}集全")

    if ep_count and ep_count > 0:
        return ("uncertain", f"共{ep_count}集")

    return ("unknown", "")


def status_type_label(t: StatusType) -> str:
    return {"completed": "已完结", "ongoing": "连载中", "uncertain": "待确认", "unknown": "未知"}[t]


def update_shows_status(shows: list[dict], cache_map: dict[str, dict]) -> dict:
    stats: dict = {"completed": 0, "ongoing": 0, "uncertain": 0, "unknown": 0, "no_cache": 0}

    for show in shows:
        cn_id = str(show.get("id", ""))
        seasons: list = show.get("seasons") or []

        if cn_id not in cache_map:
            stats["no_cache"] += 1
            continue

        payload = cache_map[cn_id].get("payload", {})
        st_type, st_detail = infer_tv_status(payload)
        stats[st_type] += 1

        if seasons:
            seasons[0]["episodes_info"] = st_detail
            show["status"] = st_detail or show.get("status", "")
            seasons[0]["in_production"] = (st_type == "ongoing")

    return stats


def main():
    import argparse
    parser = argparse.ArgumentParser(description="用豆瓣 rexxar cache 更新电视剧连载/完结状态")
    parser.add_argument("--json", required=True, help="tv_xx_complete.json 路径")
    parser.add_argument("--cache-dir", help=".cache/douban/subjects/tv 目录")
    args = parser.parse_args()

    ROOT = Path.home() / "Documents" / "Project" / "CineScope"
    cache_dir = Path(args.cache_dir) if args.cache_dir else ROOT / ".cache" / "douban" / "subjects" / "tv"

    data = json.loads(Path(args.json).read_text(encoding="utf-8"))
    shows = data["shows"]

    cache_map: dict = {}
    if cache_dir.exists():
        for f in cache_dir.glob("*.json"):
            try:
                entry = json.loads(f.read_text(encoding="utf-8"))
                sid = entry.get("subject_id", "")
                if sid:
                    cache_map[sid] = entry
            except Exception:
                pass

    stats = update_shows_status(shows, cache_map)
    data["shows"] = shows
    Path(args.json).write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"更新完成。统计：{stats}")

if __name__ == "__main__":
    main()
