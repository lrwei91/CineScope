export function createBuildReport({ activeCategorySpecs, isPartial, tmdbEnabled, doubanSubjectCacheTtlDays }) {
    return {
        metadata: {
            started_at: new Date().toISOString(),
            mode: isPartial ? 'partial' : 'full',
            category_ids: activeCategorySpecs.map((spec) => spec.id),
            tmdb_enabled: tmdbEnabled,
            douban_subject_cache_ttl_days: doubanSubjectCacheTtlDays
        },
        categories: [],
        douban_statuses: null,
        douban_subject_cache: null,
        completed_at: null
    };
}

export function createCategoryReport(spec, summary) {
    const sourceCollections = summary.doubanSourceResults.map((sourceResult) => ({
        slug: sourceResult.slug,
        raw_count: sourceResult.rawCount ?? sourceResult.items.length,
        included_count: sourceResult.includedCount ?? sourceResult.items.length,
        normalized_count: sourceResult.items.length
    }));

    return {
        id: spec.id,
        kind: spec.kind,
        latest_path: spec.latestPath,
        complete_path: spec.completePath,
        min_date: spec.minDate || null,
        source_collections: sourceCollections,
        counts: {
            douban_after_date_filter: summary.doubanSourceItems.length,
            douban_after_signature_dedupe: summary.doubanItems.length,
            anilist: summary.anilistItems.length,
            tmdb: summary.tmdbItems.length,
            merged_candidates: summary.mergedCandidateItems.length,
            merged_after_signature_dedupe: summary.mergedItems.length,
            merged_after_name_year_dedupe: summary.finallyDedupedItems.length,
            complete: summary.tmdbEnrichedItems.length,
            latest: summary.latestItems.length
        },
        fallback_summary: summary.fallbackSummary,
        quality: summarizeItemQuality(spec.kind, summary.tmdbEnrichedItems)
    };
}

function summarizeItemQuality(kind, items) {
    const missing = {
        date: 0,
        poster: 0,
        rating: 0,
        douban_link: 0,
        overview: 0,
        directors: 0,
        actors: 0
    };

    items.forEach((item) => {
        if (!getItemDate(kind, item)) missing.date += 1;
        if (!getItemPosterPath(kind, item)) missing.poster += 1;
        if (!getItemDoubanRating(kind, item)) missing.rating += 1;
        if (!getItemDoubanLink(kind, item)) missing.douban_link += 1;
        if (!String(item.overview || item.seasons?.[0]?.overview || '').trim()) missing.overview += 1;
        if (!Array.isArray(item.directors) || item.directors.length === 0) missing.directors += 1;
        if (!Array.isArray(item.actors) || item.actors.length === 0) missing.actors += 1;
    });

    return {
        total_items: items.length,
        missing,
        missing_rate: Object.fromEntries(
            Object.entries(missing).map(([field, count]) => [
                field,
                items.length > 0 ? Number((count / items.length).toFixed(4)) : 0
            ])
        )
    };
}

function getItemDate(kind, item) {
    return kind === 'tv' ? item.first_air_date || item.seasons?.[0]?.air_date || '' : item.release_date || '';
}

function getItemPosterPath(kind, item) {
    return kind === 'tv' ? item.seasons?.[0]?.poster_path || item.poster_path || '' : item.poster_path || '';
}

function getItemDoubanRating(kind, item) {
    return kind === 'tv'
        ? item.seasons?.[0]?.douban_rating || item.douban_rating || ''
        : item.douban_rating || '';
}

function getItemDoubanLink(kind, item) {
    return kind === 'tv'
        ? item.seasons?.[0]?.douban_link_google || item.douban_link_google || ''
        : item.douban_link_google || '';
}
