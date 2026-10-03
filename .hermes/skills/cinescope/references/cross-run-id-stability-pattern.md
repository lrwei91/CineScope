# Cross-run id stability pattern (data-pipeline diff class)

> **Class-level lesson, not CineScope-specific.** Applies to any pipeline that:
> - Generates an item list from a remote API on each run
> - Uses `item["id"]` (or similar) as the diff key across runs
> - Reports "what changed since last run" based on per-item diffs

## Symptom signature (recognition pattern)

If you see ANY of these, suspect cross-run id drift before chasing other bugs:

- Cron reports identical "新增 N 部" content across 2+ consecutive runs (same titles, same trailer/diff payload) — but git log shows the underlying JSON file actually changed
- `git diff --stat` on the JSON file shows large line churn, yet the diff report shows minimal real additions
- `bvid`/`url`/other stable identifier set is unchanged between two report runs, but the diff still says "新增"
- The same item has different `id` values across two consecutive commits (`{... "id": 1671548 ...}` vs `{... "id": 37116446 ...}`)

## Root cause (always one of these three)

1. **Source API returns unstable ids for the same entity**
   - E.g. `douban_search` / `/discover/movie` / `/search/tv` can return different `subject_id` for the same movie on different runs
   - Sympton: ids have different lengths/prefixes between runs (7位 ↔ 8位)

2. **Generator rebuilds from scratch and drops the "old id"**
   - Even if the data was correctly backfilled (rating, poster, cast), `id` was forgotten
   - JS anti-pattern: `const merged = { ...newItem }` followed by selective overrides — easy to forget `id` is one of the fields that needs to carry over

3. **Two writers (local cron + GitHub Actions) use different source paths**
   - Local trailer task uses `douban_search` (unstable ids)
   - Actions daily uses `douban_statuses` (stable ids)
   - Each pull overwrites the other's id assignment

## Dual defense (mandatory)

Fix BOTH sides, not just one:

### Defense 1 — Root fix at generation (id lock)
At the merge/backfill step, **lock the id from the old item onto the new item**:
```javascript
// Anti-pattern (silently loses old id)
const merged = { ...newItem };
// ... override specific fields ...

// Correct pattern (lock id from old item)
if (oldItem?.id != null) {
    merged.id = oldItem.id;  // ← this is the line that was missing
}
```
**Only safe if `backfill` already verified oldItem === newItem** via signature/title/tmdb/douban-link match.

### Defense 2 — Diff consumer uses fallback key
When the diff baseline uses `item.id` as a key, **add a title-based fallback**:
```python
# Single-key (brittle)
prev = {item["id"]: bvids for item in data}

# Double-key (robust)
prev = {}
for item in data:
    bvids = collect_bvids(item)
    prev[str(item["id"])] = bvids
    if (title_key := normalize_title(item.get("title", ""))):
        prev.setdefault(f"title::{title_key}", bvids)
```
**Defense 2 catches historical bad data** (commits already pushed with wrong ids will still diff correctly). **Defense 1 prevents future bad data** (no new commits with wrong ids).

## Verification: history commit replay

**Do not just verify the future run. Replay historical commits.**

This is the technique that caught the 6/6 CineScope fix was correct end-to-end:

```python
def verify_fix(commit_pairs):
    """commit_pairs: list of (baseline_ref, current_ref) for known-bad transitions"""
    for base_ref, curr_ref in commit_pairs:
        base = load_json_via_git(base_ref)
        curr = load_json_via_git(curr_ref)
        prev_baseline = save_trailer_baseline_for_data(base)  # uses new logic
        new, updated = diff_trailers_for_data(prev_baseline, curr)  # uses new logic
        yield (base_ref, curr_ref, len(new), len(updated), [item for item in new])
```

A fix is only proven correct if:
- Real new data (e.g. 6/3 trailer cron) still reports `NEW > 0`
- Known false-positive (e.g. 6/4 trailer cron id drift) now reports `NEW == 0`
- The same code replayed against 3+ historical transitions matches user-reported observations

## Generalization beyond trailer cron

This pattern applies to ANY cross-run diff pipeline:

| Domain | "item" | "stable identifier" | Typical drift source |
|---|---|---|---|
| Stock screener | stock | stock code (stable) | rarely drifts — codes are official |
| Movie/TV catalog | movie | subject_id (UNSTABLE) | API path-dependent |
| E-commerce product | product | SKU (stable) | rarely drifts |
| News/article feed | article | URL slug (usually stable) | slug rewrite on update |
| RSS aggregation | entry | guid (depends) | publisher's choice |
| IoT sensor | device | device_id (stable) | hardware-level |

The "movie" case is the textbook example because `subject_id` is a public web id, not a database PK, and APIs surface it differently per endpoint.

## Red flags in code review

When you see code like:
- `for item in data: prev[item["id"]] = ...`  ← no fallback, single point of failure
- `const merged = { ...newItem }`  ← field set depends on what you remember to override
- `merge_from_search(candidates)`  ← candidates order is API-dependent

Ask: **"If the upstream API returns a different id for the same entity on the next run, will this code still produce a sane diff?"** If no, add defense 1 (id lock) or defense 2 (fallback key) — preferably both.

## Reference implementation (CineScope 6/6)

- Root fix: `scripts/generate_douban_catalog.mjs:backfillFromExistingItems` — added `if (kind === 'movie' && oldItem.id != null) { merged.id = oldItem.id; }`
- Diff fix: `cinescope_trailer_update.py:save_trailer_baseline_for` + `diff_trailers` — `(id, title)` double-key with normalized title fallback
- Verification: replayed 9819dc0→b57493d (real new), 1121ff5→6353380 (false positive), 035c258→615c5eb (false positive) — all matched user-reported behavior post-fix
