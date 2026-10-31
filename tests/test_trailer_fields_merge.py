"""trailer_fields_merge 的单元测试：只动 trailers，其它字段保持原样。"""

import json
import sys
import tempfile
import unittest
from pathlib import Path


AUTOMATION_DIR = Path(__file__).resolve().parents[1] / "scripts" / "automation"
sys.path.insert(0, str(AUTOMATION_DIR))

from trailer_fields_merge import merge_trailers  # noqa: E402


def write(root: Path, name: str, payload: dict) -> None:
    path = root / "json" / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")


class MergeTests(unittest.TestCase):
    def test_only_trailers_are_replaced(self):
        with tempfile.TemporaryDirectory() as temporary_dir:
            root = Path(temporary_dir)
            generated = root / "generated"
            target = root / "target"
            target_item = {
                "id": "1",
                "title": "片名",
                "poster_path": "posters/douban/movie_cn/1.jpg",
                "douban_link_google": "https://movie.douban.com/subject/1/",
                "douban_rating": 8.1,
                "trailers": [],
            }
            generated_item = {
                "id": "1",
                "title": "片名",
                "poster_path": None,
                "trailers": [{"bvid": "BV1xx", "url": "https://www.bilibili.com/video/BV1xx"}],
            }
            write(target, "movie_cn_complete.json", {"movies": [target_item]})
            write(generated, "movie_cn_complete.json", {"movies": [generated_item]})

            report = merge_trailers(generated, target, ["movie_cn"])

            merged = json.loads((target / "json" / "movie_cn_complete.json").read_text())
            item = merged["movies"][0]
            self.assertEqual(report["movie_cn"]["updated"], 1)
            self.assertEqual(item["trailers"][0]["bvid"], "BV1xx")
            self.assertEqual(item["douban_link_google"], "https://movie.douban.com/subject/1/")
            self.assertEqual(item["douban_rating"], 8.1)
            self.assertEqual(item["poster_path"], "posters/douban/movie_cn/1.jpg")

    def test_items_absent_from_generated_are_untouched(self):
        with tempfile.TemporaryDirectory() as temporary_dir:
            root = Path(temporary_dir)
            generated = root / "generated"
            target = root / "target"
            write(
                target,
                "tv_cn_complete.json",
                {"shows": [{"id": "keep", "name": "历史剧", "seasons": [], "trailers": []}]},
            )
            write(generated, "tv_cn_complete.json", {"shows": [{"id": "other", "trailers": [{"bvid": "x"}]}]})

            report = merge_trailers(generated, target, ["tv_cn"])

            merged = json.loads((target / "json" / "tv_cn_complete.json").read_text())
            self.assertEqual(report["tv_cn"]["updated"], 0)
            self.assertEqual(merged["shows"][0]["trailers"], [])

    def test_missing_files_are_reported_not_raised(self):
        with tempfile.TemporaryDirectory() as temporary_dir:
            root = Path(temporary_dir)
            report = merge_trailers(root / "nope", root / "nope2", ["movie_cn"])
            self.assertIn("skipped", report["movie_cn"])


if __name__ == "__main__":
    unittest.main()
