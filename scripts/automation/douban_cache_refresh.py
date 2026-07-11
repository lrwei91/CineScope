#!/usr/bin/env python3
"""豆瓣缓存每周自动更新脚本。

自动流程：
1. 提取 missing IDs（json 里有但 cache 没文件）
2. probe 哪些是 404 → 自动从 json 删除（避免下次重复 probe）
3. 抓取剩余有效 IDs
4. 返回抓取结果；构建、验证和发布由统一任务入口处理

依赖：
- Kimi WebBridge daemon 127.0.0.1:10086 存活 + Chrome 扩展连接
- kimi scraper 通过 douban_kimi_scraper.py 调用
"""

import argparse
import os
import subprocess
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
OUTPUT_ROOT = Path(os.environ.get("CINESCOPE_OUTPUT_ROOT") or PROJECT_ROOT).resolve()

CACHE_DIR = PROJECT_ROOT / ".cache" / "douban" / "subjects" / "movie"
MOVIE_JSON = OUTPUT_ROOT / "json" / "movie_cn_complete.json"
LATEST_JSON = OUTPUT_ROOT / "json" / "movie_cn_latest.json"
SCRAPER = Path(__file__).resolve().parent / "douban_kimi_scraper.py"

# 复用 probe 模块
sys.path.insert(0, str(Path(__file__).resolve().parent))
from douban_probe_404 import (  # noqa: E402
    probe_missing_ids,
    delete_ids_from_json,
    get_missing_ids_from_json,
)


def get_missing_ids() -> list[str]:
    """从 movie_cn_complete.json 提取未缓存的电影 ID（去重保序）。"""
    if not MOVIE_JSON.exists():
        print("找不到 movie_cn_complete.json，跳过")
        return []
    missing = get_missing_ids_from_json(MOVIE_JSON, CACHE_DIR)
    print(f"缺失缓存: {len(missing)} 个")
    return missing


def probe_and_dedup(missing: list[str]) -> list[str]:
    """probe missing IDs → 删除 404 → 返回剩余有效 IDs。

    返回的列表供 run_scraper 抓取。
    """
    if not missing:
        print("没有 missing IDs，跳过 probe")
        return []

    print(f"\n=== probe + dedup 阶段 ===")
    valid, not_found, errors = probe_missing_ids(
        missing,
        session="douban_weekly_probe",
        delay=2.0,
        verbose=True,
    )

    if not_found:
        print(f"\n🚫 发现 {len(not_found)} 个 404 ID，自动从 json 删除")
        rc, rl = delete_ids_from_json(not_found, MOVIE_JSON, LATEST_JSON)
        print(f"  movie_cn_complete 删除: {rc} 条")
        print(f"  movie_cn_latest  删除: {rl} 条")

    if errors:
        print(f"\n⚠️  {len(errors)} 个 probe 错误（daemon/网络问题）", flush=True)
        for sid, err in errors:
            print(f"  {sid}: {err}")
        # errors 里的 ID 既不是 404 也不是 valid — 谨慎起见加入 valid 列表让 scraper 再试一次
        # （scraper 也能处理 evaluate 失败的情况，会标为"无 title"）
        for sid, _ in errors:
            if sid not in valid:
                valid.append(sid)
        print(f"  → 把 errors 加入 valid 列表，让 scraper 重试")

    print(f"\nprobe 阶段完成，valid IDs: {len(valid)}")
    return valid


def run_scraper(ids: list[str]) -> bool:
    """运行豆瓣抓取脚本。"""
    if not ids:
        print("没有缺失 ID，跳过抓取")
        return True

    id_file = PROJECT_ROOT / ".cache" / "douban" / ".tmp_missing_ids.txt"
    id_file.parent.mkdir(parents=True, exist_ok=True)
    id_file.write_text("\n".join(ids), encoding="utf-8")

    cmd = [sys.executable, str(SCRAPER), "--kind", "movie", "--file", str(id_file), "--delay", "2"]
    print(f"\n=== 抓取阶段 ===")
    print(f"执行: {' '.join(cmd[:5])} ...")
    # Kimi WebBridge 走真实 Chrome navigate + sleep 2s，每条 ID ~6-7s。
    # 189 个 missing × ~7s ≈ 1300s，给 1800s (30 min) 上限；之前 600s 撞墙是 Playwright 串行。
    result = subprocess.run(cmd, capture_output=False, timeout=1800)

    id_file.unlink(missing_ok=True)
    return result.returncode == 0


def main():
    parser = argparse.ArgumentParser(description="刷新 CineScope 豆瓣详情缓存")
    parser.add_argument("--dry-run", action="store_true", help="只统计缺失缓存，不抓取或改写 JSON")
    args = parser.parse_args()
    print("=== 豆瓣缓存周更新开始 ===")

    # Step 1: 提取 missing
    missing = get_missing_ids()
    if args.dry_run:
        print(f"[DRY RUN] 将检查并抓取 {len(missing)} 个缺失 ID")
        return

    # Step 2: probe + dedup（自动清理 404）
    valid = probe_and_dedup(missing)

    # Step 3: 抓取有效 IDs
    if not run_scraper(valid):
        print("抓取失败")
        sys.exit(1)

    print("\n=== 豆瓣缓存周更新完成 ===")


if __name__ == "__main__":
    main()
