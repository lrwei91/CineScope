import json
import os
import tempfile
import unittest
from unittest.mock import patch
from pathlib import Path


AUTOMATION_DIR = Path(__file__).resolve().parents[1] / "scripts" / "automation"
os.sys.path.insert(0, str(AUTOMATION_DIR))

from run_update import (  # noqa: E402
    UpdateLock,
    collect_changed_files,
    ensure_clean_for_publish,
    ensure_publish_branch_ready,
)
from trailer_report import diff_trailers, snapshot  # noqa: E402


class UpdateLockTests(unittest.TestCase):
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
        result = type("Result", (), {})
        run.side_effect = [
            result(),
            type("Status", (), {"stdout": ""})(),
            type("Ancestor", (), {"returncode": 1})(),
            type("Ancestor", (), {"returncode": 0})(),
            result(),
        ]

        ensure_publish_branch_ready()

        self.assertEqual(
            run.call_args_list[-1].args[0],
            ["git", "merge", "--ff-only", "origin/main"],
        )

    @patch("run_update.subprocess.run")
    def test_publish_branch_rejects_dirty_worktree_before_sync(self, run):
        result = type("Result", (), {})
        run.side_effect = [
            result(),
            type("Status", (), {"stdout": " M scripts/local.py\n"})(),
        ]

        with self.assertRaisesRegex(RuntimeError, "clean worktree"):
            ensure_publish_branch_ready()

        self.assertEqual(len(run.call_args_list), 2)

    @patch("run_update.subprocess.run")
    def test_publish_branch_rejects_true_divergence(self, run):
        result = type("Result", (), {})
        run.side_effect = [
            result(),
            type("Status", (), {"stdout": ""})(),
            type("Ancestor", (), {"returncode": 1})(),
            type("Ancestor", (), {"returncode": 1})(),
        ]

        with self.assertRaisesRegex(RuntimeError, "diverged"):
            ensure_publish_branch_ready()


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


if __name__ == "__main__":
    unittest.main()
