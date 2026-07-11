#!/usr/bin/env python3
"""国产剧豆瓣连载状态每日同步工具。

每天 06:00 自动运行（cron job）。
- 读取 tv_cn_complete.json，过滤出非完结的剧（跳过 "集全"/"完结"/"Ended"）
- 用 Rexxar API（m.douban.com/rexxar/api/v2/tv/{id}）获取最新集数信息
- 用 episodes_info 推断最新状态（"更新至X集" → 连载中，"X集全" → 已完结）
- 更新 seasons[0].episodes_info + episode_count + in_production + status，写回 JSON
- 仅负责更新 staging JSON；提交与推送由统一任务入口处理

用法：
  python3 scripts/douban_cn_status_sync.py          # 实际执行
  python3 scripts/douban_cn_status_sync.py --dry-run # 只打印，不写入
"""

import argparse
import json
import os
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

try:
    import requests
except ImportError:
    print("请先安装: pip install requests")
    sys.exit(1)

ROOT = Path(os.environ.get("CINESCOPE_OUTPUT_ROOT") or Path(__file__).resolve().parents[2]).resolve()

JSON_PATH = ROOT / "json" / "tv_cn_complete.json"

# 连续失败阈值：达此次数后自动跳过该 show，不再每天浪费 API 请求
# （豆瓣侧 ID 不存在 / 已下架等）。成功时计数重置。
API_FAIL_THRESHOLD = 3

API_HEADERS = {
    "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
    "Referer": "https://m.douban.com/",
}


def load_json():
    return json.loads(JSON_PATH.read_text(encoding="utf-8"))


def save_json(data: dict):
    data["metadata"]["last_updated"] = datetime.now(timezone.utc).isoformat()
    JSON_PATH.write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def is_finished(show: dict) -> bool:
    """判断是否已完结。"""
    status = show.get("status", "") or ""
    ep_info = show.get("episodes_info", "") or ""
    for text in [status, ep_info]:
        if "集全" in text or "完结" in text:
            return True
    if status == "Ended":
        return True
    return False




def fetch_api(sid: str) -> dict | None:
    """调用 Rexxar API 获取剧集信息。

    返回 None 时，调用方应同时读取上一次 set 的 _last_fetch_status 字段，
    或自己分类 (len(sid) <= 6 → 已知老 ID / 其他 → 真实 API 失败)。
    """
    url = f"https://m.douban.com/rexxar/api/v2/tv/{sid}"
    try:
        r = requests.get(url, headers=API_HEADERS, timeout=10)
        if r.status_code == 200:
            data = r.json()
            return {
                "episodes_info": data.get("episodes_info") or "",
                "episodes_count": data.get("episodes_count") or 0,
                "title": data.get("title", ""),
            }
        # 区分失败原因（2026-06-28 加入：让 stdout 可诊断，不要再静默 None）
        print(f"  ⚠ HTTP {r.status_code} (size={len(r.content)})")
        return None
    except requests.RequestException as e:
        print(f"  ⚠ 网络异常: {type(e).__name__}: {e}")
        return None
    except Exception as e:
        print(f"  ⚠ 解析异常: {type(e).__name__}: {e}")
        return None


def main():
    parser = argparse.ArgumentParser(description="国产剧豆瓣连载状态每日同步")
    parser.add_argument("--dry-run", action="store_true", help="只打印，不写入")
    parser.add_argument(
        "--quiet", action="store_true",
        help="只打摘要，不逐条 (cron 默认走 quiet，调试加 --verbose 或不加 --quiet)",
    )
    parser.add_argument(
        "--verbose", action="store_true",
        help="逐条打 + git stderr 全文 (手动调试用)",
    )
    args = parser.parse_args()
    # 默认 quiet（cron 推送友好），调试显式加 --verbose
    verbose = args.verbose
    quiet = args.quiet or not verbose

    data = load_json()
    shows = data["shows"]
    if not quiet:
        print(f"📺 共 {len(shows)} 部国产剧")

    # 过滤出非完结的剧
    active_shows = [s for s in shows if not is_finished(s)]
    finished_count = len(shows) - len(active_shows)
    if not quiet:
        print(f"  已完结跳过: {finished_count} 部")
        print(f"  待检查: {len(active_shows)} 部")

    if not active_shows:
        print("✅ 全部已完结，无需同步")
        return

    updated = []
    skipped = 0
    failed = 0
    auto_skipped = 0             # 达失败阈值自动跳过
    fail_counts_changed = False  # 本次 api_fail_count 有变化，需持久化

    for i, show in enumerate(active_shows):
        sid = str(show["id"])
        name = show.get("name", sid)

        # 连续失败达阈值，自动跳过（豆瓣侧 ID 不存在/已下架等）
        if show.get("api_fail_count", 0) >= API_FAIL_THRESHOLD:
            auto_skipped += 1
            skipped += 1
            if not quiet:
                print(f"  [{i+1}/{len(active_shows)}] {name}({sid})... ⏭ 连续失败 {show['api_fail_count']} 次自动跳过")
            continue

        if not quiet:
            print(f"  [{i+1}/{len(active_shows)}] {name}({sid})...", end=" ", flush=True)

        # 2026-06-28 加入：跳过 ≤6 位老 subject_id。
        # 豆瓣 Rexxar v2 API 不支持老 ID（实测全部 HTTP 404），
        # 每天 8 部失败都是这个原因，浪费 8 次网络往返。
        # 见 references/douban-old-subject-id-pitfall-20260628.md §方案 1。
        if len(sid) <= 6:
            if not quiet:
                print("⏭ 已知老 ID 跳过（v2 API 不支持 ≤6 位 subject_id）")
            skipped += 1
            continue

        api_data = fetch_api(sid)
        if not api_data:
            if not quiet:
                print("⚠ API 失败")
            failed += 1
            skipped += 1
            # 递增连续失败计数（达阈值后后续自动跳过，不再每天请求）
            show["api_fail_count"] = show.get("api_fail_count", 0) + 1
            fail_counts_changed = True
            if i < len(active_shows) - 1:
                time.sleep(1)
            continue

        # 成功，重置连续失败计数
        if show.get("api_fail_count", 0) > 0:
            show["api_fail_count"] = 0
            fail_counts_changed = True

        api_ep_info = api_data["episodes_info"]
        api_ep_count = api_data["episodes_count"]

        # 如果 API 返回空 episodes_info，但有 episodes_count
        # 尝试构造 episodes_info
        if not api_ep_info and api_ep_count > 0:
            # 无法判断是已完结还是连载中，保守处理：不更新
            # 但如果 JSON 中已有 episodes_info，保持不动
            old_ep_info = show.get("episodes_info", "") or ""
            old_status = show.get("status", "") or ""
            s0 = (show.get("seasons") or [{}])[0]
            old_s0_count = s0.get("episode_count", 0)

            if old_s0_count is None or old_s0_count == 0:
                # 总集数缺失时补充
                changes = []
                s0["episode_count"] = api_ep_count
                if not show.get("seasons"):
                    show["seasons"] = [{}]
                show["seasons"][0] = s0
                changes.append(f"s0.episode_count: {old_s0_count} → {api_ep_count}")
                updated.append({"name": name, "id": sid, "changes": changes})
                if not quiet:
                    print(f"✅ (仅更新总集数) {', '.join(changes)}")
            else:
                skipped += 1
                if not quiet:
                    print(f"无变化")
            if i < len(active_shows) - 1:
                time.sleep(1)
            continue

        # 有 episodes_info（如 "更新至X集" 或 "X集全"）
        # 解析 API 返回的集数
        m = re.search(r"(\d+)", api_ep_info)
        api_ep_num = int(m.group(1)) if m else 0

        # 获取当前状态
        old_ep_info = show.get("episodes_info", "") or ""
        old_status = show.get("status", "") or ""
        old_in_prod = show.get("in_production", True)

        # 获取当前 season0 的 episode_count
        s0 = (show.get("seasons") or [{}])[0]
        old_s0_count = s0.get("episode_count", 0)

        # 解析已有的 episodes_info 中的集数
        m_old = re.search(r"(\d+)", old_ep_info)
        old_ep_num = int(m_old.group(1)) if m_old else 0

        changes = []

        # 比较 episodes_info
        if api_ep_info and api_ep_info != old_ep_info:
            changes.append(f"episodes_info: '{old_ep_info}' → '{api_ep_info}'")
            show["episodes_info"] = api_ep_info

        # 比较 status
        # 如果 episodes_info 包含 "集全"，更新 status
        if "集全" in api_ep_info:
            new_status = api_ep_info
        elif api_ep_info.startswith("更新至"):
            new_status = api_ep_info
        else:
            new_status = old_status

        if new_status and new_status != old_status:
            changes.append(f"status: '{old_status}' → '{new_status}'")
            show["status"] = new_status

            # 更新 in_production
            if "集全" in new_status or new_status == "Ended":
                if old_in_prod:
                    changes.append(f"in_production: True → False")
                    show["in_production"] = False
            elif "更新至" in new_status:
                if not old_in_prod:
                    changes.append(f"in_production: False → True")
                    show["in_production"] = True

        # 更新 season0.episode_count（仅在没有值或为 None 时设置）
        if api_ep_count > 0 and (old_s0_count is None or old_s0_count == 0):
            changes.append(f"s0.episode_count: {old_s0_count} → {api_ep_count}")
            s0["episode_count"] = api_ep_count
            if not show.get("seasons"):
                show["seasons"] = [{}]
            show["seasons"][0] = s0

        if changes:
            updated.append({"name": name, "id": sid, "changes": changes})
            if not quiet:
                print(f"✅ {', '.join(changes)}")
        else:
            skipped += 1
            if not quiet:
                print(f"无变化")

        if i < len(active_shows) - 1:
            time.sleep(1)

    # 汇总（quiet 模式：§3.2 简短成功模板）
    # 2026-06-28 patch：用 im-delivery-format §3.2 模板，不自创格式
    # 模板：📌 <任务名> · <时间>  +  📊 <关键数字 1> / <关键数字 2> / ...
    if quiet:
        from datetime import datetime, timezone, timedelta
        tz = timezone(timedelta(hours=8))
        ts = datetime.now(tz).strftime("%m-%d %H:%M")
        print(f"📌 国产剧同步 · {ts}")
        print()
        parts = [f"共 {len(shows)}", f"完结跳过 {finished_count}", f"待检查 {len(active_shows)}",
                 f"更新 {len(updated)}", f"无变化 {skipped}"]
        if auto_skipped:
            parts.append(f"自动跳过 {auto_skipped}")
        if failed:
            parts.append(f"API 失败 {failed}")
        print("📊 " + " / ".join(parts))
    else:
        print(f"\n📊 同步完成:")
        print(f"  更新: {len(updated)} 部")
        print(f"  无变化: {skipped} 部")
        if auto_skipped:
            print(f"  自动跳过: {auto_skipped} 部")
        print(f"  API 失败: {failed} 部")

    if not args.dry_run and (updated or fail_counts_changed):
        save_json(data)
        if not quiet:
            print(f"\n✅ 已写入 {JSON_PATH.name}（发布由统一任务入口处理）")
    elif updated and args.dry_run:
        if not quiet:
            print(f"\n[DRY RUN] 将更新 {len(updated)} 部剧（未写入）")
            for item in updated:
                print(f"  - {item['name']}({item['id']}): {', '.join(item['changes'])}")
    elif not quiet:
        print("\n✅ 无变化")


if __name__ == "__main__":
    main()
