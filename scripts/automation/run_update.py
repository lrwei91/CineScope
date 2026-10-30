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
ALLOW_UNRELATED_WORKTREE_CHANGES_TASKS = frozenset({"tv-status", "douban-cache", "trailers"})
# 本机调度器的共享重试策略在 ~/.hermes/scripts/lib/git_helpers.py；
# 没有它的环境（如 GitHub Actions）走下面的内置兜底实现。
FETCH_TIMEOUT_SECONDS = 45  # 单次 fetch 超时（冷启动实测可到 ~20s，15s 太紧）
FALLBACK_RETRY_ATTEMPTS = 3
FALLBACK_RETRY_DELAY_SECONDS = 5
FALLBACK_FETCH_TIMEOUT_SECONDS = 60
FALLBACK_PUSH_TIMEOUT_SECONDS = 60
TASK_TIMEOUTS = {
    "full": 2400,
    "tv-status": 900,
    "douban-cache": 2400,
    "trailers": 420,
}


def task_timeout(task: str) -> int:
    """回捞/限流排查时可用 TASK_TIMEOUT_SECONDS 覆盖单任务超时。"""
    override = os.environ.get("TASK_TIMEOUT_SECONDS", "").strip()
    if override.isdigit():
        return int(override)
    return TASK_TIMEOUTS[task]
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


def copy_tracked_json_baseline(staged_root: Path) -> None:
    """Copy only Git-tracked JSON files into staging.

    The worktree may contain editor/cloud-provider leftovers under ``json/``.
    They are not part of the catalog baseline and can even be temporarily
    unreadable, so copying the whole directory is unsafe.
    """
    result = subprocess.run(
        ["git", "ls-files", "-z", "--", "json"],
        cwd=PROJECT_ROOT,
        capture_output=True,
        check=True,
    )
    for encoded_path in result.stdout.split(b"\0"):
        if not encoded_path:
            continue
        relative = Path(os.fsdecode(encoded_path))
        if relative.is_absolute() or ".." in relative.parts or not relative.parts or relative.parts[0] != "json":
            raise RuntimeError(f"invalid tracked JSON path: {relative}")
        source = PROJECT_ROOT / relative
        if not source.is_file():
            raise RuntimeError(f"tracked JSON file is missing: {relative}")
        destination = staged_root / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, destination)


def promote(staged_root: Path, changed_files: list[str]) -> None:
    for relative_path in changed_files:
        source = staged_root / relative_path
        destination = PROJECT_ROOT / relative_path
        destination.parent.mkdir(parents=True, exist_ok=True)
        temporary = destination.with_name(f".{destination.name}.tmp-{os.getpid()}")
        shutil.copy2(source, temporary)
        os.replace(temporary, destination)


def publish_allows_unrelated_worktree_changes(task: str) -> bool:
    return task in ALLOW_UNRELATED_WORKTREE_CHANGES_TASKS


def load_shared_git_helpers():
    """Return the local scheduler's shared git policy module, or None off-host."""
    helper_dir = Path.home() / ".hermes" / "scripts" / "lib"
    if not helper_dir.is_dir():
        return None
    if str(helper_dir) not in sys.path:
        sys.path.insert(0, str(helper_dir))
    try:
        import git_helpers
    except ImportError:
        return None
    return git_helpers


def fetch_origin_with_retry() -> bool:
    """Fetch origin with retries; shared policy locally, inline fallback on CI."""
    helpers = load_shared_git_helpers()
    if helpers is not None:
        return helpers.safe_fetch(PROJECT_ROOT, timeout=FETCH_TIMEOUT_SECONDS)
    return _fetch_origin_fallback()


def _fetch_origin_fallback() -> bool:
    for attempt in range(1, FALLBACK_RETRY_ATTEMPTS + 1):
        try:
            result = subprocess.run(
                ["git", "fetch", "origin", "main"],
                cwd=PROJECT_ROOT,
                capture_output=True,
                text=True,
                timeout=FALLBACK_FETCH_TIMEOUT_SECONDS,
            )
            if result.returncode == 0:
                return True
        except subprocess.TimeoutExpired:
            pass
        if attempt < FALLBACK_RETRY_ATTEMPTS:
            time.sleep(FALLBACK_RETRY_DELAY_SECONDS * attempt)
    return False


def ensure_publish_branch_ready(*, allow_unrelated_worktree_changes: bool = False) -> None:
    """Fetch ``origin/main`` and fast-forward without losing local edits.

    Scheduled data updates publish only ``json/`` and ``posters/``, so those
    tasks may retain edits elsewhere in the worktree. Untracked files are
    ignored here because Git will still reject a fast-forward that would
    overwrite one; the later changed-file guard protects actual outputs.
    Other publish tasks keep the stricter whole-worktree guard. If a
    fast-forward would overwrite a local change, Git itself rejects the merge
    and the publish is aborted.
    """
    if not fetch_origin_with_retry():
        raise RuntimeError("git fetch failed after shared retry policy; refusing publish")

    status_command = ["git", "status", "--porcelain"]
    if allow_unrelated_worktree_changes:
        status_command.extend(["--untracked-files=no", "--", *PUBLISH_PATHS])
    status = subprocess.run(
        status_command,
        cwd=PROJECT_ROOT,
        capture_output=True,
        text=True,
        check=True,
    )
    if status.stdout.strip():
        if allow_unrelated_worktree_changes:
            raise RuntimeError("--publish output paths must be clean before syncing origin/main")
        raise RuntimeError("--publish requires a clean worktree before syncing origin/main")

    relation = _origin_relation()
    if relation in ("equal", "local_ahead"):
        return
    if relation == "remote_ahead":
        _merge_origin_ff_only(context="before update")
        return
    raise RuntimeError("local main diverged from origin/main; refusing publish")


def _origin_relation() -> str:
    """Classify HEAD vs origin/main: equal / local_ahead / remote_ahead / diverged."""
    remote_is_ancestor = subprocess.run(
        ["git", "merge-base", "--is-ancestor", "origin/main", "HEAD"],
        cwd=PROJECT_ROOT,
    )
    if remote_is_ancestor.returncode == 0:
        local_is_ancestor = subprocess.run(
            ["git", "merge-base", "--is-ancestor", "HEAD", "origin/main"],
            cwd=PROJECT_ROOT,
        )
        return "equal" if local_is_ancestor.returncode == 0 else "local_ahead"
    local_is_ancestor = subprocess.run(
        ["git", "merge-base", "--is-ancestor", "HEAD", "origin/main"],
        cwd=PROJECT_ROOT,
    )
    return "remote_ahead" if local_is_ancestor.returncode == 0 else "diverged"


def _merge_origin_ff_only(*, context: str) -> None:
    merge = subprocess.run(
        ["git", "merge", "--ff-only", "origin/main"],
        cwd=PROJECT_ROOT,
        capture_output=True,
        text=True,
        timeout=60,
    )
    if merge.returncode != 0:
        lines = (merge.stderr or merge.stdout or "").strip().splitlines()
        detail = lines[-1] if lines else "unknown error"
        raise RuntimeError(f"could not fast-forward to origin/main ({context}): {detail}")


def reconcile_remote_before_promote() -> None:
    """Absorb a remote advance that happened during the long generation step.

    The pre-flight sync only pins origin/main at task start; the scheduled
    GitHub Actions update pushes to main on its own clock, and a multi-minute
    generation can outlive that race. Fast-forward onto the newer origin/main
    before this run commits so the publish push stacks cleanly instead of
    being rejected as non-fast-forward.
    """
    if not fetch_origin_with_retry():
        raise RuntimeError("re-check fetch failed before commit; refusing publish")
    relation = _origin_relation()
    if relation in ("equal", "local_ahead"):
        return
    if relation == "remote_ahead":
        _merge_origin_ff_only(context="after generation")
        return
    raise RuntimeError("local main diverged from origin/main before commit; refusing publish")


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

    if push_main_with_retry():
        return True
    _raise_after_push_failure()
    raise RuntimeError("unreachable: _raise_after_push_failure() did not raise")


def push_main_with_retry() -> bool:
    """Push main with retries; shared policy locally, inline fallback on CI."""
    helpers = load_shared_git_helpers()
    if helpers is not None:
        return helpers.safe_push(PROJECT_ROOT, branch="main")
    return _push_main_fallback()


def _push_main_fallback() -> bool:
    for attempt in range(1, FALLBACK_RETRY_ATTEMPTS + 1):
        try:
            result = subprocess.run(
                ["git", "push", "origin", "main"],
                cwd=PROJECT_ROOT,
                capture_output=True,
                text=True,
                timeout=FALLBACK_PUSH_TIMEOUT_SECONDS,
            )
            if result.returncode == 0:
                return True
            combined = f"{result.stdout or ''}\n{result.stderr or ''}".lower()
            if "non-fast-forward" in combined or "rejected" in combined or "fetch first" in combined:
                return False  # 远端已推进，重试救不了；交给上层重新对齐
        except subprocess.TimeoutExpired:
            pass
        if attempt < FALLBACK_RETRY_ATTEMPTS:
            time.sleep(FALLBACK_RETRY_DELAY_SECONDS * attempt)
    return False


def _raise_after_push_failure() -> None:
    """Push failed after retries: re-sync if origin/main moved, then fail loudly."""
    if not fetch_origin_with_retry():
        raise RuntimeError(
            "git push failed and the re-sync fetch also failed; local commit kept, next run will retry"
        )
    behind = subprocess.run(
        ["git", "rev-list", "--count", "HEAD..origin/main"],
        cwd=PROJECT_ROOT,
        capture_output=True,
        text=True,
        timeout=30,
    )
    try:
        behind_count = int((behind.stdout or "").strip() or 0)
    except ValueError:
        behind_count = 0
    if behind_count > 0:
        _resync_local_to_origin()
        raise RuntimeError(
            "origin/main advanced during publish; local branch re-synced to origin/main, next run will republish"
        )
    raise RuntimeError("git push failed after retries; local commit kept for the next run")


def _resync_local_to_origin() -> None:
    """Drop the local data commit without disturbing unrelated worktree edits.

    ``git reset --hard`` would also revert tracked edits outside the publish
    paths (local code work), so move the branch pointer with a mixed reset and
    restore only ``json/`` and ``posters/`` from the new index.
    """
    subprocess.run(["git", "reset", "--mixed", "origin/main"], cwd=PROJECT_ROOT, check=True, timeout=60)
    subprocess.run(["git", "checkout", "--", *PUBLISH_PATHS], cwd=PROJECT_ROOT, check=True, timeout=60)


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
    timeout = task_timeout(task)
    node = ["node"]
    if env.get("CINESCOPE_NODE_USE_ENV_PROXY") == "1":
        node.append("--use-env-proxy")
    trailer_before = snapshot(PROJECT_ROOT) if task == "trailers" else None

    if task == "full":
        category_ids = {value.strip() for value in env.get("CATEGORY_IDS", "").split(",") if value.strip()}
        if not category_ids or "movie_cn" in category_ids:
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
                ensure_publish_branch_ready(
                    allow_unrelated_worktree_changes=publish_allows_unrelated_worktree_changes(args.task)
                )
            CACHE_ROOT.mkdir(parents=True, exist_ok=True)
            with tempfile.TemporaryDirectory(prefix=f"{args.task}-", dir=CACHE_ROOT) as temporary_dir:
                staged_root = Path(temporary_dir)
                copy_tracked_json_baseline(staged_root)
                metrics = execute_task(
                    args.task,
                    staged_root,
                    dry_run=args.dry_run,
                    allow_large_drop=args.allow_large_drop,
                )
                changed_files = collect_changed_files(staged_root)
                if not args.dry_run:
                    if args.publish:
                        if changed_files:
                            reconcile_remote_before_promote()
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
