export function createBuildReport({
    activeCategorySpecs,
    isPartial,
    tmdbEnabled,
    doubanSubjectCacheTtlDays,
    doubanSearchCacheTtlDays,
    doubanSearchQueryLimit,
    previousReport = null,
    taskName = isPartial ? 'partial' : 'full',
    now = new Date()
}) {
    const startedAt = now.toISOString();
    const previous = previousReport && typeof previousReport === 'object' ? previousReport : {};
    const previousCategories = Array.isArray(previous.categories) ? previous.categories : [];
    const previousLastFullBuild =
        previous.last_full_build ||
        (previous.metadata?.mode === 'full'
            ? {
                  started_at: previous.metadata.started_at || null,
                  completed_at: previous.completed_at || null,
                  category_ids: previous.metadata.category_ids || []
              }
            : null);

    return {
        ...previous,
        schema_version: 2,
        metadata: {
            started_at: startedAt,
            mode: isPartial ? 'partial' : 'full',
            category_ids: activeCategorySpecs.map((spec) => spec.id),
            tmdb_enabled: tmdbEnabled,
            douban_subject_cache_ttl_days: doubanSubjectCacheTtlDays,
            douban_search_cache_ttl_days: doubanSearchCacheTtlDays,
            douban_search_query_limit: doubanSearchQueryLimit
        },
        latest_run: {
            task: taskName,
            status: 'running',
            started_at: startedAt,
            completed_at: null,
            category_ids: activeCategorySpecs.map((spec) => spec.id),
            tmdb_enabled: tmdbEnabled
        },
        last_full_build: previousLastFullBuild,
        task_statuses: previous.task_statuses && typeof previous.task_statuses === 'object' ? previous.task_statuses : {},
        categories: isPartial ? previousCategories : [],
        douban_statuses: isPartial ? previous.douban_statuses || null : null,
        douban_subject_cache: null,
        douban_search_cache: null,
        douban_top250: isPartial ? previous.douban_top250 || null : null,
        completed_at: null
    };
}

export function mergeCategoryReport(buildReport, categoryReport) {
    const categories = Array.isArray(buildReport.categories) ? buildReport.categories : [];
    const nextCategories = categories.filter((entry) => entry?.id !== categoryReport.id);
    nextCategories.push(categoryReport);
    nextCategories.sort((left, right) => String(left.id).localeCompare(String(right.id)));
    buildReport.categories = nextCategories;
    return buildReport;
}

export function finalizeBuildReport(buildReport, { status = 'success', now = new Date() } = {}) {
    const completedAt = now.toISOString();
    const taskName = buildReport.latest_run?.task || 'unknown';
    buildReport.completed_at = completedAt;
    buildReport.latest_run = {
        ...(buildReport.latest_run || {}),
        status,
        completed_at: completedAt
    };
    buildReport.task_statuses = {
        ...(buildReport.task_statuses || {}),
        [taskName]: {
            status,
            last_run_at: completedAt,
            ...(status === 'success' ? { last_success_at: completedAt } : {})
        }
    };

    if (buildReport.metadata?.mode === 'full' && status === 'success') {
        buildReport.last_full_build = {
            started_at: buildReport.metadata.started_at,
            completed_at: completedAt,
            category_ids: buildReport.metadata.category_ids || []
        };
    }

    return buildReport;
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

export function summarizeItemQuality(kind, items) {
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
