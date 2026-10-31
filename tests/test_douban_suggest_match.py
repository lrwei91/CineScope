"""douban_suggest_match 纯函数与写回逻辑的单元测试。"""

import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


AUTOMATION_DIR = Path(__file__).resolve().parents[1] / "scripts" / "automation"
sys.path.insert(0, str(AUTOMATION_DIR))

import douban_suggest_match as match  # noqa: E402


def tv_item(**overrides):
    item = {
        "id": "tmdb-1",
        "name": "辐射",
        "original_name": "Fallout",
        "first_air_date": "2024-04-10",
        "aka": [],
        "poster_path": "/abc.jpg",
        "seasons": [{"season_number": 1, "poster_path": "/abc.jpg", "douban_rating": None}],
    }
    item.update(overrides)
    return item


def search_entry(
    subject_id="35128081", title="辐射 第一季", year="2024", target_type="tv", rating=8.6
):
    return {
        "target": {
            "id": subject_id,
            "title": title,
            "year": year,
            "rating": {"value": rating},
            "cover_url": (
                "https://qnmob3-sign.doubanio.com/view/photo/large/public/p2928966665.jpg?sa_cv=x"
            ),
        },
        "target_type": target_type,
        "target_id": subject_id,
        "type_name": "电视剧",
    }


class NormalizeTests(unittest.TestCase):
    def test_normalize_strips_punctuation_and_space(self):
        self.assertEqual(match.normalize_title("嗜血法医：杀魔复生"), "嗜血法医杀魔复生")
        self.assertEqual(match.normalize_title("Dexter: Resurrection"), "dexterresurrection")

    def test_strip_season(self):
        self.assertEqual(match.normalize_title("辐射 第一季"), "辐射第一季")
        self.assertEqual(match.strip_season(match.normalize_title("辐射 第一季")), "辐射")
        self.assertEqual(match.strip_season(match.normalize_title("Fallout Season 2")), "fallout")

    def test_title_key_variants_dedupes(self):
        keys = match.title_key_variants("辐射", "辐射 第一季", "Fallout")
        self.assertIn("辐射", keys)
        self.assertIn("fallout", keys)
        self.assertEqual(len(keys), len(set(keys)))


class CandidateTests(unittest.TestCase):
    def test_candidate_from_search_flattens_fields(self):
        candidate = match.candidate_from_search(search_entry())
        self.assertEqual(candidate["id"], "35128081")
        self.assertEqual(candidate["title"], "辐射 第一季")
        self.assertEqual(candidate["year"], "2024")
        self.assertEqual(candidate["type"], "tv")
        self.assertEqual(candidate["rating"], 8.6)
        self.assertTrue(candidate["img"].startswith("https://"))

    def test_candidate_from_search_rejects_incomplete(self):
        self.assertIsNone(match.candidate_from_search({"target": {"title": "缺 id"}}))
        self.assertIsNone(match.candidate_from_search({"target": {"id": "1"}}))

    def test_poster_candidates_prefers_standard_size(self):
        urls = match.poster_candidates(
            "https://qnmob3-sign.doubanio.com/view/photo/large/public/p2928966665.jpg?sa_cv=x"
        )
        self.assertEqual(
            urls[0], "https://img9.doubanio.com/view/photo/m_ratio_poster/public/p2928966665.jpg"
        )
        self.assertTrue(urls[1].startswith("https://qnmob3-sign"))

    def test_poster_candidates_without_id_falls_back_to_cover(self):
        self.assertEqual(
            match.poster_candidates("https://example.com/cover.jpg"),
            ["https://example.com/cover.jpg"],
        )


class ScoreTests(unittest.TestCase):
    def test_accepts_same_title_and_year(self):
        candidate = match.candidate_from_search(search_entry())
        self.assertEqual(match.score_candidate(tv_item(), "tv", candidate), 0)

    def test_accepts_one_year_off(self):
        candidate = match.candidate_from_search(search_entry(year="2025"))
        self.assertEqual(match.score_candidate(tv_item(), "tv", candidate), 1)

    def test_rejects_year_mismatch(self):
        candidate = match.candidate_from_search(search_entry(year="2011"))
        self.assertIsNone(match.score_candidate(tv_item(), "tv", candidate))

    def test_rejects_title_mismatch(self):
        candidate = match.candidate_from_search(search_entry(title="辐射 电影版"))
        self.assertIsNone(match.score_candidate(tv_item(), "tv", candidate))

    def test_rejects_wrong_media_type(self):
        candidate = match.candidate_from_search(search_entry(target_type="movie"))
        self.assertIsNone(match.score_candidate(tv_item(), "tv", candidate))

    def test_matches_by_original_title(self):
        candidate = {
            "id": "1",
            "title": "其它译名",
            "sub_title": "Fallout",
            "year": "2024",
            "type": "tv",
        }
        self.assertEqual(match.score_candidate(tv_item(), "tv", candidate), 0)

    def test_pick_best_prefers_episode_candidate(self):
        plain = {"id": "1", "title": "辐射", "year": "2024", "type": "tv", "episode": ""}
        episodic = {"id": "2", "title": "辐射", "year": "2024", "type": "tv", "episode": "8"}
        self.assertEqual(match.pick_best(tv_item(), "tv", [plain, episodic])["id"], "2")

    def test_pick_best_returns_none_without_match(self):
        self.assertIsNone(
            match.pick_best(tv_item(), "tv", [{"title": "别的东西", "year": "2024"}])
        )


class CacheTests(unittest.TestCase):
    def test_expired_entry_detection(self):
        self.assertTrue(match.cache_entry_expired({"checked_at": "2020-01-01T00:00:00+00:00"}))
        self.assertFalse(match.cache_entry_expired({"checked_at": "2099-01-01T00:00:00+00:00"}))
        self.assertFalse(match.cache_entry_expired({}))


class ApplyTests(unittest.TestCase):
    def test_apply_match_writes_season_fields_for_tv(self):
        item = tv_item()
        match.apply_match(
            item,
            "tv",
            "https://movie.douban.com/subject/35128081/",
            8.2,
            "posters/douban/tv_us/35128081.jpg",
        )
        season = item["seasons"][0]
        self.assertEqual(season["douban_link_google"], "https://movie.douban.com/subject/35128081/")
        self.assertTrue(season["douban_link_verified"])
        self.assertEqual(season["douban_rating"], 8.2)
        self.assertEqual(season["poster_path"], "posters/douban/tv_us/35128081.jpg")
        self.assertEqual(item["poster_path"], "posters/douban/tv_us/35128081.jpg")

    def test_apply_match_writes_top_level_for_movie(self):
        item = {"id": "1", "title": "片名", "release_date": "2024-01-01", "poster_path": None}
        match.apply_match(item, "movie", "https://movie.douban.com/subject/1/", 7.0, None)
        self.assertTrue(item["douban_link_verified"])
        self.assertIsNone(item["poster_path"])
        self.assertEqual(item["douban_rating"], 7.0)

    def test_apply_poster_keeps_link_untouched(self):
        item = tv_item()
        match.apply_poster(item, "tv", "posters/tmdb/tv_us/123.jpg")
        self.assertEqual(item["seasons"][0]["poster_path"], "posters/tmdb/tv_us/123.jpg")
        self.assertNotIn("douban_link_google", item["seasons"][0])


class ProcessCategoryTests(unittest.TestCase):
    """端到端：用假 client 走完 search → 写回。"""

    class FakeClient:
        def __init__(self, results):
            self.results = results
            self.request_count = 0

        def ensure_healthy(self):
            return None

        def search(self, queries):
            self.request_count += len(queries)
            return {query: self.results.get(query, []) for query in queries}

    def test_matched_item_is_written_and_cached(self):
        with tempfile.TemporaryDirectory() as temporary_dir:
            root = Path(temporary_dir)
            (root / "json").mkdir()
            payload = {
                "shows": [tv_item(), tv_item(id="tmdb-2", name="无对应条目", original_name="Nothing")]
            }
            (root / "json" / "tv_us_complete.json").write_text(
                json.dumps(payload, ensure_ascii=False), encoding="utf-8"
            )
            client = self.FakeClient({"辐射": [match.candidate_from_search(search_entry())]})
            cache = {}
            with patch.object(match, "OUTPUT_ROOT", root), patch.object(
                match, "save_cache", lambda _cache: None
            ), patch.object(match, "download_poster", return_value=None):
                stats = match.process_category(
                    "tv_us", "tv", client, cache, budget=10, dry_run=False
                )
            self.assertEqual(stats["matched"], 1)
            self.assertEqual(stats["unmatched"], 1)
            written = json.loads(
                (root / "json" / "tv_us_complete.json").read_text(encoding="utf-8")
            )
            season = written["shows"][0]["seasons"][0]
            self.assertEqual(
                season["douban_link_google"], "https://movie.douban.com/subject/35128081/"
            )
            self.assertEqual(season["douban_rating"], 8.6)
            self.assertEqual(cache["tv_us:tmdb-1"]["status"], "matched")
            self.assertEqual(cache["tv_us:tmdb-2"]["status"], "unmatched")

    def test_budget_limits_processed_items(self):
        with tempfile.TemporaryDirectory() as temporary_dir:
            root = Path(temporary_dir)
            (root / "json").mkdir()
            payload = {"shows": [tv_item(id=f"t{i}", name=f"剧{i}") for i in range(5)]}
            (root / "json" / "tv_us_complete.json").write_text(
                json.dumps(payload, ensure_ascii=False), encoding="utf-8"
            )
            cache = {}
            with patch.object(match, "OUTPUT_ROOT", root), patch.object(
                match, "save_cache", lambda _cache: None
            ):
                stats = match.process_category(
                    "tv_us", "tv", self.FakeClient({}), cache, budget=2, dry_run=False
                )
            self.assertTrue(stats["budget_exhausted"])
            self.assertEqual(len(cache), 2)

    def test_dry_run_never_writes_json(self):
        with tempfile.TemporaryDirectory() as temporary_dir:
            root = Path(temporary_dir)
            (root / "json").mkdir()
            original = json.dumps({"shows": [tv_item()]}, ensure_ascii=False)
            target = root / "json" / "tv_us_complete.json"
            target.write_text(original, encoding="utf-8")
            client = self.FakeClient({"辐射": [match.candidate_from_search(search_entry())]})
            with patch.object(match, "OUTPUT_ROOT", root), patch.object(
                match, "save_cache", lambda _cache: None
            ):
                stats = match.process_category(
                    "tv_us", "tv", client, {}, budget=10, dry_run=True
                )
            self.assertEqual(stats["matched"], 1)
            self.assertEqual(target.read_text(encoding="utf-8"), original)

    def test_sync_latest_copies_douban_fields(self):
        with tempfile.TemporaryDirectory() as temporary_dir:
            root = Path(temporary_dir)
            (root / "json").mkdir()
            complete = {
                "shows": [
                    {
                        **tv_item(),
                        "seasons": [
                            {
                                "season_number": 1,
                                "poster_path": "posters/douban/tv_us/35128081.jpg",
                                "douban_link_google": "https://movie.douban.com/subject/35128081/",
                                "douban_link_verified": True,
                                "douban_rating": 8.6,
                            }
                        ],
                    }
                ]
            }
            latest = {
                "shows": [
                    {
                        **tv_item(),
                        "seasons": [
                            {
                                "season_number": 1,
                                "poster_path": "/abc.jpg",
                                "douban_rating": None,
                            }
                        ],
                    }
                ]
            }
            (root / "json" / "tv_us_complete.json").write_text(
                json.dumps(complete), encoding="utf-8"
            )
            latest_path = root / "json" / "tv_us_latest.json"
            latest_path.write_text(json.dumps(latest), encoding="utf-8")
            with patch.object(match, "OUTPUT_ROOT", root):
                updated = match.sync_latest("tv_us", "tv", complete["shows"], dry_run=False)
            self.assertEqual(updated, 1)
            written = json.loads(latest_path.read_text(encoding="utf-8"))
            season = written["shows"][0]["seasons"][0]
            self.assertEqual(
                season["douban_link_google"], "https://movie.douban.com/subject/35128081/"
            )
            self.assertEqual(season["poster_path"], "posters/douban/tv_us/35128081.jpg")


if __name__ == "__main__":
    unittest.main()
