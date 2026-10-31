#!/usr/bin/env python3
"""只把生成结果里的 `trailers` 字段合并回现有目录。

背景：`trailers` 任务原先直接重建 movie_cn/tv_cn，重建用豆瓣集合+TMDB 重新组装条目，
会把历史回捞的剧集和豆瓣链接/评分冲掉（2026-10-31 tv_cn 989→365，链接缺失率上涨 40pp）。
预告片任务只应该更新预告片字段，其余主数据保持原样。
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


def load_items(path: Path) -> tuple[dict, list]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    items = payload.get("shows") if "shows" in payload else payload.get("movies")
    if not isinstance(items, list):
        raise ValueError(f"{path}: 未找到 shows/movies 数组")
    return payload, items


def merge_trailers(generated_root: Path, target_root: Path, categories: list[str]) -> dict:
    report = {}
    for category in categories:
        generated_path = generated_root / "json" / f"{category}_complete.json"
        target_path = target_root / "json" / f"{category}_complete.json"
        if not generated_path.exists() or not target_path.exists():
            report[category] = {"skipped": "缺少 generated 或 target"}
            continue

        _gen_payload, gen_items = load_items(generated_path)
        target_payload, target_items = load_items(target_path)
        gen_by_id = {str(item.get("id")): item for item in gen_items if item.get("id") is not None}

        updated = 0
        for item in target_items:
            source = gen_by_id.get(str(item.get("id")))
            if not source:
                continue
            trailers = source.get("trailers")
            if trailers is None:
                continue
            if item.get("trailers") != trailers:
                item["trailers"] = trailers
                updated += 1

        if updated:
            target_path.write_text(
                json.dumps(target_payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
            )
        report[category] = {"updated": updated, "total": len(target_items)}
    return report


def main() -> int:
    parser = argparse.ArgumentParser(description="合并预告片字段")
    parser.add_argument("--generated", required=True, help="生成结果根目录（含 json/）")
    parser.add_argument("--target", required=True, help="要被更新的目录根（含 json/）")
    parser.add_argument("--categories", default="movie_cn,tv_cn")
    args = parser.parse_args()

    categories = [value.strip() for value in args.categories.split(",") if value.strip()]
    report = merge_trailers(Path(args.generated), Path(args.target), categories)
    print(json.dumps(report, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
