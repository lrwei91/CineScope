"""Pure helpers for comparing trailer assignments between catalog snapshots."""

from __future__ import annotations

import json
import re
from pathlib import Path


CATEGORY_FILES = (
    "movie_cn_latest",
    "movie_cn_complete",
    "tv_cn_latest",
    "tv_cn_complete",
)


def _normalize_title(value: str) -> str:
    value = re.sub(r"\(\d{4}\)", "", value or "")
    return re.sub(r"\s+", " ", value).strip().lower()


def _trailer_key(trailer: dict) -> str:
    bvid = str(trailer.get("bvid") or "").strip()
    if bvid:
        return f"bvid:{bvid}"
    url = str(trailer.get("url") or "").strip()
    if url:
        return f"url:{url}"
    title = str(trailer.get("title") or "").strip()
    published = str(trailer.get("publishedAt") or "").strip()
    return f"title:{title}|{published}" if title else ""


def _load_items(root: Path, name: str) -> list[dict]:
    payload = json.loads((root / "json" / f"{name}.json").read_text(encoding="utf-8"))
    key = "shows" if name.startswith("tv") else "movies"
    return payload.get(key, [])


def snapshot(root: Path, names: tuple[str, ...] = CATEGORY_FILES) -> dict[str, dict[str, set[str]]]:
    result: dict[str, dict[str, set[str]]] = {}
    for name in names:
        rows: dict[str, set[str]] = {}
        for item in _load_items(root, name):
            keys = {_trailer_key(trailer) for trailer in item.get("trailers", [])}
            keys.discard("")
            if not keys:
                continue
            item_id = str(item.get("id") or "")
            if item_id:
                rows[item_id] = keys
            title = _normalize_title(item.get("title") or item.get("name") or "")
            if title:
                rows.setdefault(f"title::{title}", keys)
        result[name] = rows
    return result


def diff_trailers(before: dict[str, dict[str, set[str]]], after_root: Path) -> dict:
    changed: dict[str, dict] = {}
    for name in CATEGORY_FILES:
        previous = before.get(name, {})
        for item in _load_items(after_root, name):
            item_id = str(item.get("id") or "")
            title = str(item.get("title") or item.get("name") or "").strip()
            if not item_id or not title:
                continue
            current = {_trailer_key(trailer) for trailer in item.get("trailers", [])}
            current.discard("")
            old = previous.get(item_id)
            if old is None:
                old = previous.get(f"title::{_normalize_title(title)}", set())
            added = sorted(current - old)
            if not added:
                continue
            entry = changed.setdefault(item_id, {"id": item_id, "title": title, "added": set(), "is_new": not old})
            entry["added"].update(added)
            entry["is_new"] = entry["is_new"] and not old

    items = [
        {**entry, "added": sorted(entry["added"])}
        for entry in changed.values()
    ]
    items.sort(key=lambda item: item["title"])
    return {
        "new_items": sum(1 for item in items if item["is_new"]),
        "updated_items": sum(1 for item in items if not item["is_new"]),
        "items": items,
    }
