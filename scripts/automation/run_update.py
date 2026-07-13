#!/usr/bin/env python3
"""Canonical CineScope data-task runner.

All data tasks run against a staged copy of ``json/``. Only a validated run is
promoted to the working tree; ``--dry-run`` always discards staged output.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
from contextlib import AbstractContextManager
from datetime import datetime, timezone
from pathlib import Path

from trailer_report import diff_trailers, snapshot


PROJECT_ROOT = Path(__file__).resolve().parents[2]
CACHE_ROOT = PROJECT_ROOT / ".cache" / "automation"
LOCK_PATH = CACHE_ROOT / "update.lock"
PUBLISH_PATHS = ("json", "posters")
TASK_TIMEOUTS = {
    "full": 2400,
    "tv-status": 900,
    "douban-cache": 2400,
    "trailers": 420,
}
COMMIT_MESSAGES = {
    "full": "chore: 每日数据更新",
    "tv-status": "chore: 同步国产剧状态",
    "douban-cache": "chore: 每周豆瓣缓存更新",
    "trailers": "chore: 增量刷新国产影视预告片",
}


class UpdateLock(AbstractContextManager):
    def __init__(self, path: Path = LOCK_PATH):
        self.path = path
        self.acquired = False

    def _remove_stale_lock(self) -> None:
        try:
            payload = json.loads(self.path.read_text(encoding="utf-8"))
            pid = int(payload.get("pid", 0))
        except (OSError, ValueError, json.JSONDecodeError):
            pid = 0
        if pid:
            try:
                os.kill(pid, 0)
                return
            except ProcessLookupError:
                pass
            except PermissionError:
                return
        self.path.unlink(missing_ok=True)

    def __enter__(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        for attempt in range(2):
            try:
                descriptor = os.open(self.path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
                with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
                    json.dump({"pid": os.getpid(), "started_at": datetime.now(timezone.utc).isoformat()}, handle)
                self.acquired = True
                return self
            except FileExistsError:
                if attempt == 0:
                    self._remove_stale_lock()
                    continue
                raise RuntimeError(f"another CineScope update is running ({self.path})")
        raise RuntimeError(f"could not acquire update lock ({self.path})")

    def __exit__(self, exc_type, exc, traceback):
        if self.acquired:
            self.path.unlink(missing_ok=True)
        return False


def run_command(args: list[str], *, env: dict[str, str], timeout: int) -> None:
    print(f"+ {' '.join(args)}", flush=True)
    result = subprocess.run(args, cwd=PROJECT_ROOT, env=env, timeout=timeout)
    if result.returncode != 0:
        raise RuntimeError(f"command failed ({result.returncode}): {' '.join(args)}")


def file_digest(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def collect_changed_files(staged_root: Path) -> list[str]:
    changed: list[str] = []
    for top_level in PUBLISH_PATHS:
        source_root = staged_root / top_level
        if not source_root.exists():
            continue
        for source in source_root.rglob("*"):
            if not source.is_file():
                continue
            relative = source.relative_to(staged_root)
            destination = PROJECT_ROOT / relative
            if not destination.exists() or file_digest(source) != file_digest(destination):
                changed.append(relative.as_posix())
    return sorted(changed)


def promote(staged_root: Path, changed_files: list[str]) -> None:
    for relative_path in changed_files:
        source = staged_root / relative_path
        destination = PROJECT_ROOT / relative_path
        destination.parent.mkdir(parents=True, exist_ok=True)
        temporary = destination.with_name(f".{destination.name}.tmp-{os.getpid()}")
        shutil.copy2(source, temporary)
        os.replace(temporary, destination)


def ensure_publish_branch_ready() -> None:
    subprocess.run(["git", "fetch", "origin", "main"], cwd=PROJECT_ROOT, check=True, timeout=60)

    status = subprocess.run(
        ["git", "status", "--porcelain"],
        cwd=PROJECT_ROOT,
        capture_output=True,
        text=True,
        check=True,
    )
    if status.stdout.strip():
        raise RuntimeError("--publish requires a clean worktree before syncing origin/main")

    remote_is_ancestor = subprocess.run(
        ["git", "merge-base", "--is-ancestor", "origin/main", "HEAD"],
        cwd=PROJECT_ROOT,
    )
    if remote_is_ancestor.returncode == 0:
        return

    local_is_ancestor = subprocess.run(
        ["git", "merge-base", "--is-ancestor", "HEAD", "origin/main"],
        cwd=PROJECT_ROOT,
    )
    if local_is_ancestor.returncode == 0:
        subprocess.run(
            ["git", "merge", "--ff-only", "origin/main"],
            cwd=PROJECT_ROOT,
            check=True,
            timeout=60,
        )
        return

    raise RuntimeError("local main diverged from origin/main; refusing publish")


def ensure_clean_for_publish(changed_files: list[str]) -> None:
    if not changed_files:
        return
    result = subprocess.run(
        ["git", "status", "--porcelain", "--", *changed_files],
        cwd=PROJECT_ROOT,
        capture_output=True,
        text=True,
        check=True,
    )
    dirty = [line for line in result.stdout.splitlines() if line.strip()]
    if dirty:
        raise RuntimeError("--publish output paths already contain uncommitted changes")


def publish(task: str, changed_files: list[str]) -> bool:
    if not changed_files:
        return False
    subprocess.run(["git", "add", "--", *changed_files], cwd=PROJECT_ROOT, check=True)
    staged = subprocess.run(["git", "diff", "--staged", "--quiet"], cwd=PROJECT_ROOT)
    if staged.returncode == 0:
        return False
    if staged.returncode != 1:
        raise RuntimeError("could not inspect staged update")

    timestamp = datetime.now().astimezone().strftime("%Y-%m-%d %H:%M")
    message = f"{COMMIT_MESSAGES[task]} {timestamp}"
    subprocess.run(
        ["git", "commit", "--only", "-m", message, "--", *changed_files],
        cwd=PROJECT_ROOT,
        check=True,
        timeout=60,
    )

    for attempt in range(1, 4):
        push = subprocess.run(["git", "push", "origin", "main"], cwd=PROJECT_ROOT, timeout=60)
        if push.returncode == 0:
            return True
        if attempt == 3:
            raise RuntimeError("git push failed after 3 attempts")
        subprocess.run(["git", "pull", "--rebase", "origin", "main"], cwd=PROJECT_ROOT, check=True, timeout=60)
        time.sleep(attempt * 2)
    return False


def update_task_report(staged_root: Path, task: str) -> None:
    report_path = staged_root / "json" / "build_report.json"
    report = json.loads(report_path.read_text(encoding="utf-8"))
    completed_at = datetime.now(timezone.utc).isoformat()
    report["schema_version"] = 2
    report["latest_run"] = {
        "task": task,
        "status": "success",
        "started_at": completed_at,
        "completed_at": completed_at,
        "category_ids": ["tv_cn"],
        "tmdb_enabled": False,
    }
    task_statuses = report.setdefault("task_statuses", {})
    previous = task_statuses.get(task, {})
    task_statuses[task] = {
        **previous,
        "status": "success",
        "last_run_at": completed_at,
        "last_success_at": completed_at,
    }
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def execute_task(task: str, staged_root: Path, *, dry_run: bool, allow_large_drop: bool) -> dict:
    env = os.environ.copy()
    env["CINESCOPE_OUTPUT_ROOT"] = str(staged_root)
    env["CINESCOPE_PROJECT_ROOT"] = str(PROJECT_ROOT)
    env["UPDATE_TASK"] = task
    timeout = TASK_TIMEOUTS[task]
    node = ["node"]
    if env.get("CINESCOPE_NODE_USE_ENV_PROXY") == "1":
        node.append("--use-env-proxy")
    trailer_before = snapshot(PROJECT_ROOT) if task == "trailers" else None

    if task == "full":
        run_command([*node, "scripts/generate_maoyan_cache.mjs"], env=env, timeout=timeout)
        run_command([*node, "scripts/generate_douban_catalog.mjs"], env=env, timeout=timeout)
    elif task == "tv-status":
        run_command([sys.executable, "scripts/automation/tv_status_sync.py", "--quiet"], env=env, timeout=timeout)
        update_task_report(staged_root, task)
    elif task == "douban-cache":
        cache_command = [sys.executable, "scripts/automation/douban_cache_refresh.py"]
        if dry_run:
            cache_command.append("--dry-run")
        run_command(cache_command, env=env, timeout=timeout)
        if not dry_run:
            env["CATEGORY_IDS"] = "movie_cn"
            run_command([*node, "scripts/generate_douban_catalog.mjs"], env=env, timeout=timeout)
    elif task == "trailers":
        env["CATEGORY_IDS"] = "movie_cn,tv_cn"
        run_command([*node, "scripts/generate_douban_catalog.mjs"], env=env, timeout=timeout)
    else:
        raise ValueError(f"unknown task: {task}")

    validation_command = [
        "node",
        "scripts/validate-data.mjs",
        "--root",
        str(staged_root),
        "--poster-root",
        str(PROJECT_ROOT),
        "--baseline-root",
        str(PROJECT_ROOT),
        "--baseline-ref",
        "HEAD",
    ]
    if allow_large_drop:
        validation_command.append("--allow-large-drop")
    run_command(
        validation_command,
        env=env,
        timeout=180,
    )

    return diff_trailers(trailer_before, staged_root) if trailer_before is not None else {}


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run a staged CineScope data update")
    parser.add_argument("--task", required=True, choices=sorted(TASK_TIMEOUTS))
    parser.add_argument("--dry-run", action="store_true", help="validate staged output without promoting it")
    parser.add_argument("--publish", action="store_true", help="commit and push validated output")
    parser.add_argument("--allow-large-drop", action="store_true", help="allow an intentional count drop over 20%%")
    args = parser.parse_args()
    if args.dry_run and args.publish:
        parser.error("--dry-run and --publish cannot be used together")
    return args


def main() -> int:
    args = parse_arguments()
    result = {
        "schema_version": 1,
        "task": args.task,
        "status": "failed",
        "dry_run": args.dry_run,
        "published": False,
        "changed_files": [],
        "metrics": {},
    }

    try:
        with UpdateLock():
            if args.publish:
                ensure_publish_branch_ready()
            CACHE_ROOT.mkdir(parents=True, exist_ok=True)
            with tempfile.TemporaryDirectory(prefix=f"{args.task}-", dir=CACHE_ROOT) as temporary_dir:
                staged_root = Path(temporary_dir)
                shutil.copytree(PROJECT_ROOT / "json", staged_root / "json")
                metrics = execute_task(
                    args.task,
                    staged_root,
                    dry_run=args.dry_run,
                    allow_large_drop=args.allow_large_drop,
                )
                changed_files = collect_changed_files(staged_root)
                if not args.dry_run:
                    if args.publish:
                        ensure_clean_for_publish(changed_files)
                    promote(staged_root, changed_files)
                    if args.publish:
                        result["published"] = publish(args.task, changed_files)
                result.update(status="success", changed_files=changed_files, metrics=metrics)
    except (OSError, RuntimeError, subprocess.SubprocessError) as error:
        result["error"] = str(error)
        print(json.dumps(result, ensure_ascii=False))
        return 1

    print(json.dumps(result, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
