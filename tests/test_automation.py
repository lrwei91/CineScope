import json
import os
import subprocess
import tempfile
import unittest
from unittest.mock import patch
from pathlib import Path


AUTOMATION_DIR = Path(__file__).resolve().parents[1] / "scripts" / "automation"
os.sys.path.insert(0, str(AUTOMATION_DIR))

from run_update import (  # noqa: E402
    FETCH_TIMEOUT_SECONDS,
    PROJECT_ROOT,
    UpdateLock,
    collect_changed_files,
    ensure_clean_for_publish,
    ensure_publish_branch_ready,
    execute_task,
    fetch_origin_with_retry,
    publish,
    publish_allows_unrelated_worktree_changes,
    reconcile_remote_before_promote,
)
from trailer_report import diff_trailers, snapshot  # noqa: E402
from tv_status_sync import (  # noqa: E402
    format_updated_line,
    is_finished,
)  # type: ignore[reportMissingImports]


class UpdateLockTests(unittest.TestCase):
    def setUp(self):
        fetch = patch("run_update.fetch_origin_with_retry", return_value=True)
        self.fetch = fetch.start()
        self.addCleanup(fetch.stop)

    @patch("run_update.subprocess.run")
    def test_fetch_failure_stops_before_worktree_or_merge(self, run):
        self.fetch.return_value = False
        with self.assertRaisesRegex(RuntimeError, "fetch"):
            ensure_publish_branch_ready()
        run.assert_not_called()

    def test_rejects_second_live_lock(self):
        with tempfile.TemporaryDirectory() as temporary_dir:
            lock_path = Path(temporary_dir) / "update.lock"
            with UpdateLock(lock_path):
                with self.assertRaises(RuntimeError):
                    with UpdateLock(lock_path):
                        pass
            self.assertFalse(lock_path.exists())

    def test_publish_collection_ignores_non_whitelisted_paths(self):
        with tempfile.TemporaryDirectory() as temporary_dir:
            root = Path(temporary_dir)
            (root / "json").mkdir()
            (root / "scripts").mkdir()
            (root / "json" / "__automation_test__.json").write_text("{}", encoding="utf-8")
            (root / "scripts" / "not-public.txt").write_text("no", encoding="utf-8")
            self.assertEqual(collect_changed_files(root), ["json/__automation_test__.json"])

    @patch("run_update.subprocess.run")
    def test_publish_clean_check_only_scopes_changed_files(self, run):
        run.return_value = type("Result", (), {"stdout": ""})()
        ensure_clean_for_publish(["json/changed.json"])
        self.assertEqual(
            run.call_args_list[0].args[0],
            ["git", "status", "--porcelain", "--", "json/changed.json"],
        )

    @patch("run_update.subprocess.run")
    def test_publish_rejects_dirty_output_paths(self, run):
        run.return_value = type("Result", (), {"stdout": " M json/data.json\n"})()
        with self.assertRaisesRegex(RuntimeError, "output paths"):
            ensure_clean_for_publish(["json/data.json"])

    @patch("run_update.subprocess.run")
    def test_publish_branch_fast_forwards_when_remote_is_ahead(self, run):
        run.side_effect = [
            type("Status", (), {"stdout": ""})(),
            type("Ancestor", (), {"returncode": 1})(),
            type("Ancestor", (), {"returncode": 0})(),
            type("Merge", (), {"returncode": 0})(),
        ]

        ensure_publish_branch_ready()

        self.assertEqual(
            run.call_args_list[-1].args[0],
            ["git", "merge", "--ff-only", "origin/main"],
        )

    @patch("run_update.subprocess.run")
    def test_publish_branch_rejects_dirty_worktree_for_non_output_scoped_tasks(self, run):
        result = type("Result", (), {})
        run.side_effect = [
            type("Status", (), {"stdout": " M scripts/local.py\n"})(),
        ]

        with self.assertRaisesRegex(RuntimeError, "clean worktree"):
            ensure_publish_branch_ready()

        self.assertEqual(len(run.call_args_list), 1)

    def test_only_output_scoped_tasks_allow_unrelated_worktree_changes(self):
        self.assertTrue(publish_allows_unrelated_worktree_changes("tv-status"))
        self.assertTrue(publish_allows_unrelated_worktree_changes("douban-cache"))
        self.assertTrue(publish_allows_unrelated_worktree_changes("douban-match"))
        self.assertTrue(publish_allows_unrelated_worktree_changes("trailers"))
        self.assertFalse(publish_allows_unrelated_worktree_changes("full"))

    @patch("run_update.subprocess.run")
    def test_publish_branch_allows_unrelated_worktree_changes_for_output_scoped_tasks(self, run):
        run.side_effect = [
            type("Status", (), {"stdout": ""})(),
            type("Ancestor", (), {"returncode": 0})(),
            type("Ancestor", (), {"returncode": 0})(),
        ]

        ensure_publish_branch_ready(allow_unrelated_worktree_changes=True)

        self.assertEqual(len(run.call_args_list), 3)
        self.assertEqual(
            run.call_args_list[0].args[0],
            ["git", "status", "--porcelain", "--untracked-files=no", "--", "json", "posters"],
        )

    @patch("run_update.subprocess.run")
    def test_publish_branch_rejects_dirty_output_paths_before_sync(self, run):
        result = type("Result", (), {})
        run.side_effect = [
            type("Status", (), {"stdout": " M json/data.json\n"})(),
        ]

        with self.assertRaisesRegex(RuntimeError, "output paths"):
            ensure_publish_branch_ready(allow_unrelated_worktree_changes=True)

        self.assertEqual(len(run.call_args_list), 1)

    @patch("run_update.subprocess.run")
    def test_publish_branch_rejects_true_divergence(self, run):
        run.side_effect = [
            type("Status", (), {"stdout": ""})(),
            type("Ancestor", (), {"returncode": 1})(),
            type("Ancestor", (), {"returncode": 1})(),
        ]

        with self.assertRaisesRegex(RuntimeError, "diverged"):
            ensure_publish_branch_ready()

        self.assertEqual(len(run.call_args_list), 3)

    def test_fetch_uses_shared_policy_with_repo_timeout(self):
        calls = []

        class FakeHelpers:
            @staticmethod
            def safe_fetch(repo, *, timeout=None):
                calls.append((repo, timeout))
                return True

        with patch("run_update.load_shared_git_helpers", return_value=FakeHelpers):
            self.assertTrue(fetch_origin_with_retry())

        self.assertEqual(calls, [(PROJECT_ROOT, FETCH_TIMEOUT_SECONDS)])

    @patch("run_update.load_shared_git_helpers", return_value=None)
    @patch("run_update.time.sleep")
    @patch("run_update.subprocess.run")
    def test_fetch_fallback_retries_after_timeout(self, run, sleep, load):
        run.side_effect = [
            subprocess.TimeoutExpired(cmd=["git", "fetch"], timeout=60),
            type("Fetched", (), {"returncode": 0})(),
        ]

        self.assertTrue(fetch_origin_with_retry())

        self.assertEqual(run.call_count, 2)
        sleep.assert_called_once()

    @patch("run_update.subprocess.run")
    def test_reconcile_fast_forwards_when_remote_advanced(self, run):
        run.side_effect = [
            type("Ancestor", (), {"returncode": 1})(),
            type("Ancestor", (), {"returncode": 0})(),
            type("Merge", (), {"returncode": 0})(),
        ]

        reconcile_remote_before_promote()

        self.assertEqual(
            run.call_args_list[-1].args[0],
            ["git", "merge", "--ff-only", "origin/main"],
        )

    @patch("run_update.subprocess.run")
    def test_reconcile_is_noop_when_remote_is_ancestor(self, run):
        run.side_effect = [
            type("Ancestor", (), {"returncode": 0})(),
            type("Ancestor", (), {"returncode": 0})(),
        ]

        reconcile_remote_before_promote()

        self.assertEqual(len(run.call_args_list), 2)

    @patch("run_update.subprocess.run")
    def test_reconcile_rejects_divergence(self, run):
        run.side_effect = [
            type("Ancestor", (), {"returncode": 1})(),
            type("Ancestor", (), {"returncode": 1})(),
        ]

        with self.assertRaisesRegex(RuntimeError, "diverged"):
            reconcile_remote_before_promote()

    @patch("run_update.push_main_with_retry", return_value=True)
    @patch("run_update.subprocess.run")
    def test_publish_returns_true_when_push_succeeds(self, run, push):
        run.side_effect = [
            type("Added", (), {"returncode": 0})(),
            type("Staged", (), {"returncode": 1})(),
            type("Committed", (), {"returncode": 0})(),
        ]

        self.assertTrue(publish("tv-status", ["json/tv_cn_complete.json"]))

        self.assertEqual(
            run.call_args_list[-1].args[0][:4],
            ["git", "commit", "--only", "-m"],
        )

    @patch("run_update.push_main_with_retry", return_value=False)
    @patch("run_update.subprocess.run")
    def test_push_failure_resyncs_when_remote_advanced(self, run, push):
        run.side_effect = [
            type("Added", (), {"returncode": 0})(),
            type("Staged", (), {"returncode": 1})(),
            type("Committed", (), {"returncode": 0})(),
            type("Behind", (), {"stdout": "1\n"})(),
            type("Reset", (), {"returncode": 0})(),
            type("Checkout", (), {"returncode": 0})(),
        ]

        with self.assertRaisesRegex(RuntimeError, "advanced"):
            publish("tv-status", ["json/tv_cn_complete.json"])

        commands = [call.args[0] for call in run.call_args_list]
        self.assertEqual(commands[-2], ["git", "reset", "--mixed", "origin/main"])
        self.assertEqual(commands[-1], ["git", "checkout", "--", "json", "posters"])

    @patch("run_update.push_main_with_retry", return_value=False)
    @patch("run_update.subprocess.run")
    def test_push_failure_keeps_commit_when_remote_unchanged(self, run, push):
        run.side_effect = [
            type("Added", (), {"returncode": 0})(),
            type("Staged", (), {"returncode": 1})(),
            type("Committed", (), {"returncode": 0})(),
            type("Behind", (), {"stdout": "0\n"})(),
        ]

        with self.assertRaisesRegex(RuntimeError, "kept"):
            publish("tv-status", ["json/tv_cn_complete.json"])

        self.assertNotIn(
            ["git", "reset", "--mixed", "origin/main"],
            [call.args[0] for call in run.call_args_list],
        )


class ScopedFullUpdateTests(unittest.TestCase):
    @patch("run_update.run_command")
    def test_tv_only_update_skips_movie_cache_but_still_validates(self, run):
        with patch.dict(os.environ, {"CATEGORY_IDS": "tv_cn"}):
            execute_task("full", Path("/tmp/cinescope-test-staging"), dry_run=True, allow_large_drop=False)
        commands = [call.args[0] for call in run.call_args_list]
        self.assertEqual(len(commands), 2)
        self.assertIn("scripts/generate_douban_catalog.mjs", commands[0])
        self.assertIn("scripts/validate-data.mjs", commands[1])

    @patch("run_update.run_command")
    def test_movie_and_unscoped_updates_keep_movie_cache_refresh(self, run):
        for category_ids in ("", "movie_cn,tv_cn"):
            with self.subTest(category_ids=category_ids):
                run.reset_mock()
                with patch.dict(os.environ, {"CATEGORY_IDS": category_ids}):
                    execute_task("full", Path("/tmp/cinescope-test-staging"), dry_run=True, allow_large_drop=False)
                self.assertIn("scripts/generate_maoyan_cache.mjs", run.call_args_list[0].args[0])
                self.assertEqual(run.call_count, 3)


class TrailerReportTests(unittest.TestCase):
    def _write_catalogs(self, root: Path, trailer=None):
        (root / "json").mkdir(parents=True)
        for name in ("movie_cn_latest", "movie_cn_complete", "tv_cn_latest", "tv_cn_complete"):
            key = "shows" if name.startswith("tv") else "movies"
            title_key = "name" if key == "shows" else "title"
            payload = {key: [{"id": 1, title_key: "作品", "trailers": [trailer] if trailer else []}]}
            (root / "json" / f"{name}.json").write_text(json.dumps(payload), encoding="utf-8")

    def test_trailer_diff_deduplicates_latest_and_complete(self):
        with tempfile.TemporaryDirectory() as before_dir, tempfile.TemporaryDirectory() as after_dir:
            before_root = Path(before_dir)
            after_root = Path(after_dir)
            self._write_catalogs(before_root)
            self._write_catalogs(after_root, {"bvid": "BV1", "title": "预告"})
            report = diff_trailers(snapshot(before_root), after_root)
            self.assertEqual(report["new_items"], 1)
            self.assertEqual(len(report["items"]), 1)


class TvStatusOutputTests(unittest.TestCase):
    def test_format_updated_line_lists_changed_shows_one_per_line(self):
        self.assertEqual(
            format_updated_line([{"name": "剧甲"}, {"name": "剧乙"}]),
            "📊 本次更新：\n📊 剧甲\n📊 剧乙",
        )

    def test_format_updated_line_is_empty_without_names(self):
        self.assertEqual(format_updated_line([]), "")
        self.assertEqual(format_updated_line([{"name": "  "}]), "")

    def test_in_production_false_counts_as_finished_without_status_text(self):
        self.assertTrue(
            is_finished(
                {
                    "status": "",
                    "episodes_info": "",
                    "in_production": False,
                }
            )
        )

    def test_in_production_true_is_not_finished_without_status_text(self):
        self.assertFalse(
            is_finished(
                {
                    "status": "",
                    "episodes_info": "",
                    "in_production": True,
                }
            )
        )


if __name__ == "__main__":
    unittest.main()
