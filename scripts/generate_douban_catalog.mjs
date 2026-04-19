#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');

const TMDB_API_KEY = process.env.TMDB_API_KEY || '';
const CATEGORY_IDS = String(process.env.CATEGORY_IDS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
const TMDB_API_BASE = 'https://api.themoviedb.org/3';
const CURRENT_YEAR = new Date().getFullYear();
const END_OF_CURRENT_YEAR = `${CURRENT_YEAR}-12-31`;
const DOUBAN_DEFAULT_USER_ID = 'lrwei91';

const REQUEST_HEADERS = {
    Referer: 'https://m.douban.com/',
    'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
    Accept: 'application/json'
};

const CATEGORY_SPECS = [
    {
        id: 'tv_cn',
        kind: 'tv',
        latestCount: 18,
        minDate: '2025-01-01',
        latestPath: 'json/tv_cn_latest.json',
        completePath: 'json/tv_cn_complete.json',
        doubanSources: [
            { slug: 'tv_domestic', includeItem: isMainlandChinaEntry },
            { slug: 'tv_hot', includeItem: isMainlandChinaEntry }
        ],
        tmdb: {
            discoverPath: '/discover/tv',
            detailPath: '/tv',
            params: {
                language: 'zh-CN',
                sort_by: 'first_air_date.desc',
                'first_air_date.gte': '2025-01-01',
                'first_air_date.lte': END_OF_CURRENT_YEAR,
                with_origin_country: 'CN',
                with_original_language: 'zh',
                include_null_first_air_dates: 'false',
                'vote_count.gte': '5'
            }
        }
    },
    {
        id: 'tv_kr',
        kind: 'tv',
        latestCount: 18,
        minDate: '2025-01-01',
        latestPath: 'json/tv_kr_latest.json',
        completePath: 'json/tv_kr_complete.json',
        doubanSources: [
            { slug: 'tv_korean', includeItem: isKoreanEntry }
        ],
        tmdb: {
            discoverPath: '/discover/tv',
            detailPath: '/tv',
            params: {
                language: 'zh-CN',
                sort_by: 'first_air_date.desc',
                'first_air_date.gte': '2025-01-01',
                'first_air_date.lte': END_OF_CURRENT_YEAR,
                with_origin_country: 'KR',
                include_null_first_air_dates: 'false',
                'vote_count.gte': '5'
            }
        }
    },
    {
        id: 'tv_jp',
        kind: 'tv',
        latestCount: 18,
        minDate: '2025-01-01',
        latestPath: 'json/tv_jp_latest.json',
        completePath: 'json/tv_jp_complete.json',
        doubanSources: [
            { slug: 'tv_japanese', includeItem: isJapaneseEntry }
        ],
        tmdb: {
            discoverPath: '/discover/tv',
            detailPath: '/tv',
            params: {
                language: 'zh-CN',
                sort_by: 'first_air_date.desc',
                'first_air_date.gte': '2025-01-01',
                'first_air_date.lte': END_OF_CURRENT_YEAR,
                with_origin_country: 'JP',
                include_null_first_air_dates: 'false',
                'vote_count.gte': '5'
            }
        }
    },
    {
        id: 'tv_jp_anime',
        kind: 'tv',
        latestCount: 18,
        minDate: '2025-01-01',
        latestPath: 'json/tv_jp_anime_latest.json',
        completePath: 'json/tv_jp_anime_complete.json',
        doubanSources: [
            { slug: 'tv_animation', includeItem: isJapaneseAnimationEntry }
        ],
        tmdb: {
            discoverPath: '/discover/tv',
            detailPath: '/tv',
            params: {
                language: 'zh-CN',
                sort_by: 'first_air_date.desc',
                'first_air_date.gte': '2025-01-01',
                'first_air_date.lte': END_OF_CURRENT_YEAR,
                with_origin_country: 'JP',
                with_original_language: 'ja',
                with_genres: '16',
                include_null_first_air_dates: 'false',
                'vote_count.gte': '5'
            }
        }
    },
    {
        id: 'movie_cn',
        kind: 'movie',
        latestCount: 24,
        minDate: '2025-01-01',
        latestPath: 'json/movie_cn_latest.json',
        completePath: 'json/movie_cn_complete.json',
        doubanSources: [
            { slug: 'movie_showing' },
            { slug: 'movie_soon' },
            { slug: 'movie_latest', totalLimit: 200 }
        ],
        tmdb: {
            discoverPath: '/discover/movie',
            detailPath: '/movie',
            params: {
                language: 'zh-CN',
                sort_by: 'primary_release_date.desc',
                'release_date.gte': '2025-01-01',
                'release_date.lte': END_OF_CURRENT_YEAR,
                region: 'CN',
                with_release_type: '2|3',
                include_adult: 'false',
                include_video: 'false',
                'vote_count.gte': '5'
            }
        }
    }
];

async function main() {
    const activeCategorySpecs =
        CATEGORY_IDS.length > 0
            ? CATEGORY_SPECS.filter((spec) => CATEGORY_IDS.includes(spec.id))
            : CATEGORY_SPECS;

    if (CATEGORY_IDS.length > 0 && activeCategorySpecs.length === 0) {
        throw new Error(`No category spec matched CATEGORY_IDS=${CATEGORY_IDS.join(',')}`);
    }

    for (const spec of activeCategorySpecs) {
        const result = await buildCategoryData(spec);
        await writeJson(spec.latestPath, result.latestPayload);
        await writeJson(spec.completePath, result.completePayload);
        console.log(
            `[${spec.id}] latest=${result.latestCount} complete=${result.completeCount} -> ${spec.latestPath}, ${spec.completePath}`
        );
        logFallbackSummary(spec.id, result.fallbackSummary);
    }

    if (CATEGORY_IDS.length === 0) {
        const doubanStatusesPayload = await buildDoubanStatusesPayload(DOUBAN_DEFAULT_USER_ID);
        await writeJson('json/douban_statuses.json', doubanStatusesPayload);
        console.log(
            `[douban_statuses] user=${DOUBAN_DEFAULT_USER_ID} total=${doubanStatusesPayload.metadata.total_items} -> json/douban_statuses.json`
        );
    }
}

async function buildCategoryData(spec) {
    const fallbackCollector = createFallbackCollector();
    const doubanSourceResults = await buildDoubanSourceResults(spec, fallbackCollector);
    const doubanItems = dedupeBySignature(
        spec.kind,
        sortByDateDesc(doubanSourceResults.flatMap((sourceResult) => sourceResult.items)).filter((item) =>
            spec.minDate ? getItemDate(spec.kind, item) >= spec.minDate : true
        )
    );
    const doubanLookup = createDoubanLookup(spec.kind, doubanItems);

    const tmdbItems = TMDB_API_KEY && spec.tmdb ? await buildTmdbItems(spec, doubanLookup) : [];
    const mergedItems = dedupeBySignature(
        spec.kind,
        sortByDateDesc([...tmdbItems, ...doubanItems]).filter((item) =>
            spec.minDate ? getItemDate(spec.kind, item) >= spec.minDate : true
        )
    );

    // [新增] 二次去重兜底：针对那些没能通过 ID 匹配的同名同年作品进行合并
    const finallyDedupedItems = dedupeByNameAndYear(spec.kind, mergedItems);
    const tmdbEnrichedItems =
        TMDB_API_KEY && spec.tmdb ? await enrichItemsWithTmdbFallback(spec, finallyDedupedItems) : finallyDedupedItems;

    const latestItems = tmdbEnrichedItems.slice(0, spec.latestCount);
    const sourceResults = [
        ...doubanSourceResults.map((sourceResult) => ({
            slug: sourceResult.slug,
            source: 'douban',
            items: sourceResult.items
        })),
        ...(tmdbItems.length > 0
            ? [{ slug: spec.tmdb.discoverPath.replace('/', ''), source: 'tmdb', items: tmdbItems }]
            : [])
    ];

    const latestPayload = createPayload(spec, latestItems, sourceResults, 'latest');
    const completePayload = createPayload(spec, tmdbEnrichedItems, sourceResults, 'complete');
    const finalCompleteCount = tmdbEnrichedItems.length;

    return {
        latestPayload,
        completePayload,
        latestCount: spec.kind === 'tv' ? latestPayload.shows.length : latestPayload.movies.length,
        completeCount: finalCompleteCount,
        fallbackSummary: fallbackCollector.summary()
    };
}

async function buildDoubanSourceResults(spec, fallbackCollector) {
    const sourceResults = [];

    for (const source of spec.doubanSources || []) {
        const collectionItems = (await fetchAllCollectionItems(source.slug, source.totalLimit)).filter((item) =>
            source.includeItem ? source.includeItem(item) : true
        );

        const normalizedItems = await mapWithConcurrency(collectionItems, 6, async (item) => {
            let detail = await fetchDoubanSubjectDetail(spec.kind, item.id).catch((error) => {
                fallbackCollector.record(item.id, error);
                return null;
            });

            const normalizedItem =
                spec.kind === 'tv' ? normalizeDoubanTvEntry(item, detail) : normalizeDoubanMovieEntry(item, detail);

            if (!normalizedItem) {
                return null;
            }

            const localPosterPath = await materializePoster(spec.id, normalizedItem.id, normalizedItem.poster_path);
            if (localPosterPath) {
                normalizedItem.poster_path = localPosterPath;
                if (spec.kind === 'tv' && normalizedItem.seasons?.[0]) {
                    normalizedItem.seasons[0].poster_path = localPosterPath;
                }
            }

            return normalizedItem;
        });

        sourceResults.push({
            slug: source.slug,
            items: normalizedItems.filter(Boolean)
        });
    }

    return sourceResults;
}

function createFallbackCollector() {
    const stats = {
        total: 0,
        byStatus: new Map(),
        sampleIds: []
    };

    return {
        record(itemId, error) {
            const message = error instanceof Error ? error.message : String(error);
            const statusMatch = message.match(/Request failed \((\d+)\)/);
            const status = statusMatch ? statusMatch[1] : 'unknown';

            stats.total += 1;
            stats.byStatus.set(status, (stats.byStatus.get(status) || 0) + 1);

            if (stats.sampleIds.length < 10) {
                stats.sampleIds.push(String(itemId));
            }

            if (status !== '400') {
                console.warn(`Fallback to collection item ${itemId}: ${message}`);
            }
        },
        summary() {
            return {
                total: stats.total,
                byStatus: [...stats.byStatus.entries()].sort(([left], [right]) => left.localeCompare(right)),
                sampleIds: [...stats.sampleIds]
            };
        }
    };
}

function logFallbackSummary(categoryId, summary) {
    if (!summary || summary.total === 0) {
        return;
    }

    const statusText = summary.byStatus.map(([status, count]) => `${status}=${count}`).join(', ');
    const sampleText = summary.sampleIds.length > 0 ? ` sample=${summary.sampleIds.join(',')}` : '';
    console.warn(`[${categoryId}] douban detail fallback total=${summary.total} ${statusText}${sampleText}`);
}

async function buildTmdbItems(spec, doubanLookup) {
    const discoverItems = await fetchTmdbDiscoverItems(spec.tmdb.discoverPath, spec.tmdb.params);

    const normalizedItems = await mapWithConcurrency(discoverItems, 6, async (item) => {
        const detail = await fetchTmdbDetail(spec.tmdb.detailPath, item.id).catch((error) => {
            console.warn(`Skip TMDB detail ${item.id}: ${error.message}`);
            return null;
        });

        if (!detail) {
            return null;
        }

        const doubanMatch = findDoubanMatch(spec.kind, doubanLookup, {
            title: detail.title || detail.name || item.title || item.name,
            originalTitle:
                detail.original_title || detail.original_name || item.original_title || item.original_name || '',
            date:
                detail.release_date ||
                detail.first_air_date ||
                item.release_date ||
                item.first_air_date ||
                ''
        });

        return spec.kind === 'tv'
            ? normalizeTmdbTvEntry(detail, doubanMatch)
            : normalizeTmdbMovieEntry(detail, doubanMatch);
    });

    return normalizedItems.filter(Boolean);
}

async function enrichItemsWithTmdbFallback(spec, items) {
    if (!TMDB_API_KEY || !spec.tmdb) {
        return items;
    }

    const searchPath = spec.kind === 'tv' ? '/search/tv' : '/search/movie';

    return mapWithConcurrency(items, 4, async (item) => {
        const needsTmdbLink = !item.tmdb_id;
        const needsOverview = !String(item.overview || '').trim();

        if (!needsTmdbLink && !needsOverview) {
            return item;
        }

        const detail = await searchTmdbDetail(searchPath, {
            title: item.title || item.name || item.original_title || item.original_name || '',
            originalTitle: item.subtitle || '',
            date: getItemDate(spec.kind, item)
        });

        if (!detail) {
            return item;
        }

        return mergeTmdbFallbackIntoItem(spec.kind, item, detail);
    });
}

async function searchTmdbDetail(searchPath, { title, originalTitle, date }) {
    const searchQueries = [...new Set([title, originalTitle].map((value) => String(value || '').trim()).filter(Boolean))];
    const year = String(date || '').slice(0, 4);

    for (const query of searchQueries) {
        const params = {
            language: 'zh-CN',
            query,
            include_adult: 'false',
            page: 1
        };

        if (year) {
            if (searchPath === '/search/movie') {
                params.primary_release_year = year;
            } else {
                params.first_air_date_year = year;
            }
        }

        const searchResult = await fetchTmdbJson(searchPath, params).catch((error) => {
            console.warn(`TMDB search failed for ${query}: ${error.message}`);
            return null;
        });

        const results = Array.isArray(searchResult?.results) ? searchResult.results : [];
        if (results.length === 0) {
            continue;
        }

        const bestMatch = pickBestTmdbSearchResult(results, title, originalTitle, year);
        if (!bestMatch?.id) {
            continue;
        }

        const detailPath = searchPath === '/search/tv' ? '/tv' : '/movie';
        const detail = await fetchTmdbDetail(detailPath, bestMatch.id).catch((error) => {
            console.warn(`Skip TMDB fallback detail ${bestMatch.id}: ${error.message}`);
            return null;
        });

        if (detail) {
            return detail;
        }
    }

    return null;
}

function pickBestTmdbSearchResult(results, title, originalTitle, year) {
    const titleKey = normalizeLookupText(title);
    const originalTitleKey = normalizeLookupText(originalTitle);

    return [...results]
        .map((result) => ({
            result,
            score: scoreTmdbSearchResult(result, titleKey, originalTitleKey, year)
        }))
        .sort((left, right) => right.score - left.score)[0]?.result || null;
}

function scoreTmdbSearchResult(result, titleKey, originalTitleKey, year) {
    const candidateTitle = normalizeLookupText(result.title || result.name || '');
    const candidateOriginalTitle = normalizeLookupText(result.original_title || result.original_name || '');
    const candidateYear = String(result.release_date || result.first_air_date || '').slice(0, 4);

    let score = 0;

    if (candidateTitle && candidateTitle === titleKey) {
        score += 8;
    }
    if (candidateOriginalTitle && candidateOriginalTitle === titleKey) {
        score += 7;
    }
    if (candidateTitle && candidateTitle === originalTitleKey) {
        score += 6;
    }
    if (candidateOriginalTitle && candidateOriginalTitle === originalTitleKey) {
        score += 6;
    }
    if (year && candidateYear === year) {
        score += 4;
    }
    if (Number.isFinite(Number(result.popularity))) {
        score += Math.min(Number(result.popularity) / 100, 2);
    }

    return score;
}

function mergeTmdbFallbackIntoItem(kind, item, detail) {
    const tmdbId = detail.id || item.tmdb_id || null;
    const tmdbUrl = tmdbId ? `https://www.themoviedb.org/${kind === 'tv' ? 'tv' : 'movie'}/${tmdbId}` : item.tmdbUrl || null;
    const overview = item.overview || detail.overview || '';
    const posterPath = item.poster_path || detail.poster_path || null;
    const imdbId = item.imdb_id || detail.external_ids?.imdb_id || null;

    if (kind === 'tv') {
        return {
            ...item,
            tmdb_id: tmdbId,
            tmdbUrl,
            overview,
            poster_path: posterPath,
            imdb_id: imdbId,
            countries: item.countries?.length ? item.countries : extractStringList(detail.origin_country),
            languages: item.languages?.length ? item.languages : [detail.original_language].filter(Boolean),
            episodes_info: item.episodes_info || detail.status || null,
            status: item.status || detail.status || ''
        };
    }

    return {
        ...item,
        tmdb_id: tmdbId,
        tmdbUrl,
        overview,
        poster_path: posterPath,
        imdb_id: imdbId,
        countries: item.countries?.length ? item.countries : extractStringList(detail.production_countries),
        languages: item.languages?.length ? item.languages : [detail.original_language].filter(Boolean),
        durations: item.durations?.length ? item.durations : detail.runtime ? [`${detail.runtime}分钟`] : []
    };
}

async function fetchAllCollectionItems(slug, totalLimit = null) {
    const items = [];
    let start = 0;
    let total = Infinity;

    while (start < total) {
        const data = await fetchJson(
            `https://m.douban.com/rexxar/api/v2/subject_collection/${slug}/items?start=${start}&count=50`
        );
        const pageItems = data.subject_collection_items || [];
        total = data.total || pageItems.length;

        if (pageItems.length === 0) {
            break;
        }

        items.push(...pageItems);
        start += pageItems.length;
        if (totalLimit && start >= totalLimit) {
            break;
        }
    }

    return totalLimit ? items.slice(0, totalLimit) : items;
}

async function fetchDoubanSubjectDetail(kind, subjectId) {
    const endpoint = kind === 'tv' ? 'tv' : 'movie';
    return fetchJson(`https://m.douban.com/rexxar/api/v2/${endpoint}/${subjectId}?for_mobile=1`);
}

async function fetchJson(url) {
    const response = await fetch(url, {
        headers: REQUEST_HEADERS
    });

    if (!response.ok) {
        throw new Error(`Request failed (${response.status}): ${url}`);
    }

    return response.json();
}

async function fetchBinary(url) {
    const response = await fetch(url, {
        headers: REQUEST_HEADERS
    });

    if (!response.ok) {
        throw new Error(`Request failed (${response.status}): ${url}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
}

async function fetchHtml(url) {
    const response = await fetch(url, {
        headers: {
            Referer: 'https://movie.douban.com/',
            'User-Agent': REQUEST_HEADERS['User-Agent'],
            Accept: 'text/html,application/xhtml+xml'
        }
    });

    if (!response.ok) {
        throw new Error(`Request failed (${response.status}): ${url}`);
    }

    return response.text();
}

async function materializePoster(categoryId, subjectId, remoteUrl) {
    if (!remoteUrl || !/^https?:\/\//i.test(remoteUrl)) {
        return remoteUrl;
    }

    const posterBuffer = await fetchBinary(remoteUrl).catch((error) => {
        console.warn(`Poster download skipped for ${subjectId}: ${error.message}`);
        return null;
    });

    if (!posterBuffer || posterBuffer.length === 0) {
        return remoteUrl;
    }

    const relativePath = `posters/douban/${categoryId}/${subjectId}.jpg`;
    const targetPath = path.resolve(ROOT_DIR, relativePath);
    await mkdir(path.dirname(targetPath), { recursive: true });
    await writeFile(targetPath, posterBuffer);
    return relativePath;
}

async function fetchTmdbDiscoverItems(discoverPath, extraParams) {
    const items = [];
    let page = 1;
    let totalPages = 1;

    while (page <= totalPages) {
        const data = await fetchTmdbJson(discoverPath, { ...extraParams, page });
        items.push(...(data.results || []));
        totalPages = data.total_pages || 1;
        page += 1;
    }

    return items;
}

async function buildDoubanStatusesPayload(userId) {
    const timestamp = new Date().toISOString();
    const statuses = await fetchDoubanUserStatuses(userId);
    return {
        metadata: {
            last_updated: timestamp,
            source: 'douban-public-page',
            user_id: userId,
            total_items: Object.keys(statuses).length
        },
        statuses
    };
}

async function fetchDoubanUserStatuses(userId) {
    const statusMap = {
        wish: 'wishlist',
        do: 'watching',
        collect: 'watched'
    };
    const statuses = {};

    for (const [slug, normalizedStatus] of Object.entries(statusMap)) {
        let start = 0;

        while (true) {
            const html = await fetchHtml(buildDoubanPeopleUrl(userId, slug, start));
            const page = parseDoubanPeoplePage(html, normalizedStatus);
            page.items.forEach((item) => {
                statuses[item.subjectId] = {
                    status: item.status,
                    updatedAt: item.updatedAt
                };
            });

            if (!page.hasNextPage || page.items.length === 0) {
                break;
            }

            start += page.items.length;
        }
    }

    return statuses;
}

function buildDoubanPeopleUrl(userId, slug, start) {
    const url = new URL(`https://movie.douban.com/people/${encodeURIComponent(userId)}/${slug}`);
    url.searchParams.set('start', String(start));
    url.searchParams.set('sort', 'time');
    url.searchParams.set('rating', 'all');
    url.searchParams.set('filter', 'all');
    url.searchParams.set('mode', 'grid');
    return url.toString();
}

function parseDoubanPeoplePage(html, normalizedStatus) {
    const itemPattern = /<div class="item comment-item"[\s\S]*?<\/div>\s*<\/div>/g;
    const hrefPattern = /href="https?:\/\/movie\.douban\.com\/subject\/(\d+)\/"/;
    const datePattern = /<span class="date">([^<]+)<\/span>/;
    const items = [];

    const matches = html.match(itemPattern) || [];
    matches.forEach((block) => {
        const hrefMatch = block.match(hrefPattern);
        if (!hrefMatch) {
            return;
        }

        const dateMatch = block.match(datePattern);
        items.push({
            subjectId: hrefMatch[1],
            status: normalizedStatus,
            updatedAt: dateMatch ? dateMatch[1].trim() : new Date().toISOString()
        });
    });

    return {
        items,
        hasNextPage: /<span class="next">[\s\S]*?<a href=/.test(html) || /<a[^>]+>后页/.test(html)
    };
}

async function fetchTmdbDetail(detailPath, itemId) {
    return fetchTmdbJson(`${detailPath}/${itemId}`, {
        language: 'zh-CN',
        append_to_response: 'external_ids'
    });
}

async function fetchTmdbJson(endpoint, params = {}) {
    if (!TMDB_API_KEY) {
        throw new Error('TMDB_API_KEY is not set');
    }

    const url = new URL(`${TMDB_API_BASE}${endpoint}`);
    url.searchParams.set('api_key', TMDB_API_KEY);

    Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
            url.searchParams.set(key, String(value));
        }
    });

    const response = await fetch(url, {
        headers: {
            Accept: 'application/json',
            'User-Agent': REQUEST_HEADERS['User-Agent']
        }
    });

    if (!response.ok) {
        throw new Error(`TMDB request failed (${response.status}): ${endpoint}`);
    }

    return response.json();
}

function normalizeDoubanTvEntry(item, detail) {
    const airDate = extractSubjectDate(detail?.pubdate, item.year, null);
    if (!airDate) {
        return null;
    }

    const posterUrl = detail?.pic?.large || item?.pic?.large || item?.pic?.normal || null;
    const ratingValue = getRatingValue(detail?.rating?.value ?? item?.rating?.value);
    const directors = extractPersonObjects(detail?.directors);
    const actors = extractPersonObjects(detail?.actors);
    const countries = extractStringList(detail?.countries);
    const languages = extractStringList(detail?.languages);
    const aka = extractStringList(detail?.aka);
    const episodesInfo = detail?.episodes_info || item?.episodes_info || '';
    const vendorList = Array.isArray(detail?.vendors)
        ? detail.vendors
              .filter((vendor) => vendor && vendor.title)
              .map((vendor, index) => ({
                  id: index + 1,
                  name: vendor.title,
                  logo_path: vendor.icon || null
              }))
        : [];

    return {
        id: normalizeNumericId(item.id),
        name: detail?.title || item.title,
        original_name: detail?.original_title || detail?.title || item.title,
        imdb_id: null,
        genres: extractGenreObjects(detail?.card_subtitle || item.card_subtitle),
        networks: vendorList,
        directors,
        actors,
        countries,
        languages,
        aka,
        homepage: null,
        popularity: null,
        number_of_seasons: 1,
        number_of_episodes: extractEpisodeCount(episodesInfo),
        first_air_date: airDate,
        last_air_date: airDate,
        in_production: Boolean(episodesInfo && /更新/.test(episodesInfo)),
        status: episodesInfo,
        episodes_info: episodesInfo || null,
        adult: false,
        poster_path: posterUrl,
        backdrop_path: null,
        overview: detail?.intro || item.comment || '',
        rating_count: getRatingCount(detail?.rating?.count ?? item?.rating?.count),
        rating_star_count: getRatingCount(detail?.rating?.star_count ?? item?.rating?.star_count),
        seasons: [
            {
                name: '',
                season_number: 1,
                id: normalizeNumericId(item.id),
                air_date: airDate,
                episode_count: extractEpisodeCount(episodesInfo),
                vote_average: ratingValue ? Number(ratingValue) : 0,
                poster_path: posterUrl,
                douban_rating: ratingValue,
                douban_link_google: buildDoubanSubjectUrl(item.id),
                overview: detail?.intro || item.comment || '',
                douban_link_verified: true
            }
        ]
    };
}

function normalizeDoubanMovieEntry(item, detail) {
    const releaseDate = extractSubjectDate(detail?.pubdate, item.year, item.release_date);
    if (!releaseDate) {
        return null;
    }

    const posterUrl = detail?.pic?.large || item?.cover?.url || null;
    const ratingValue = getRatingValue(detail?.rating?.value ?? item?.rating?.value);
    const directors = extractPersonObjects(detail?.directors?.length ? detail.directors : item?.directors);
    const actors = extractPersonObjects(detail?.actors?.length ? detail.actors : item?.actors);
    const countries = extractStringList(detail?.countries);
    const languages = extractStringList(detail?.languages);
    const aka = extractStringList(detail?.aka);
    const overview = detail?.intro || item?.description || '';

    return {
        id: normalizeNumericId(item.id),
        title: detail?.title || item.title,
        original_title: detail?.original_title || detail?.title || item.title,
        release_date: releaseDate,
        genres: extractGenreObjects(detail?.card_subtitle || item.card_subtitle || item.info),
        directors,
        actors,
        countries,
        languages,
        aka,
        imdb_id: null,
        poster_path: posterUrl,
        douban_rating: ratingValue,
        douban_link_google: buildDoubanSubjectUrl(item.id),
        douban_link_verified: true,
        overview,
        durations: extractStringList(detail?.durations),
        rating_count: getRatingCount(detail?.rating?.count ?? item?.rating?.count),
        rating_star_count: getRatingCount(detail?.rating?.star_count ?? item?.rating?.star_count),
        type: 'movie'
    };
}

function normalizeTmdbTvEntry(detail, doubanMatch) {
    if (!detail.first_air_date) {
        return null;
    }

    const doubanRating = getDoubanField(doubanMatch, 'rating');
    const doubanLink = getDoubanField(doubanMatch, 'link');

    return {
        id: detail.id,
        tmdb_id: detail.id,
        name: detail.name,
        original_name: detail.original_name || detail.name,
        imdb_id: detail.external_ids?.imdb_id || null,
        genres: Array.isArray(detail.genres) ? detail.genres : [],
        type: detail.type || '',
        vote_average: detail.vote_average || 0,
        vote_count: detail.vote_count || 0,
        origin_country: detail.origin_country || [],
        original_language: detail.original_language || '',
        networks: Array.isArray(detail.networks) ? detail.networks : [],
        directors: getDoubanField(doubanMatch, 'directors') || [],
        actors: getDoubanField(doubanMatch, 'actors') || [],
        countries: getDoubanField(doubanMatch, 'countries') || [],
        languages: getDoubanField(doubanMatch, 'languages') || [],
        aka: getDoubanField(doubanMatch, 'aka') || [],
        homepage: detail.homepage || null,
        popularity: detail.popularity || null,
        number_of_seasons: detail.number_of_seasons || 1,
        number_of_episodes: detail.number_of_episodes || null,
        first_air_date: detail.first_air_date,
        last_air_date: detail.last_air_date || detail.first_air_date,
        in_production: Boolean(detail.in_production),
        status: detail.status || '',
        episodes_info: getDoubanField(doubanMatch, 'episodes_info') || detail.status || null,
        adult: Boolean(detail.adult),
        poster_path: detail.poster_path || getDoubanField(doubanMatch, 'poster') || null,
        backdrop_path: detail.backdrop_path || null,
        overview: detail.overview || getDoubanField(doubanMatch, 'overview') || '',
        rating_count: getDoubanField(doubanMatch, 'rating_count'),
        rating_star_count: getDoubanField(doubanMatch, 'rating_star_count'),
        seasons: [
            {
                name: '',
                season_number: 1,
                id: detail.id,
                air_date: detail.first_air_date,
                episode_count: detail.number_of_episodes || null,
                vote_average: detail.vote_average || 0,
                poster_path: detail.poster_path || getDoubanField(doubanMatch, 'poster') || null,
                douban_rating: doubanRating,
                douban_link_google: doubanLink,
                overview: detail.overview || getDoubanField(doubanMatch, 'overview') || '',
                douban_link_verified: Boolean(doubanLink)
            }
        ]
    };
}

function normalizeTmdbMovieEntry(detail, doubanMatch) {
    if (!detail.release_date) {
        return null;
    }

    const doubanRating = getDoubanField(doubanMatch, 'rating');
    const doubanLink = getDoubanField(doubanMatch, 'link');

    return {
        id: detail.id,
        tmdb_id: detail.id,
        title: detail.title,
        original_title: detail.original_title || detail.title,
        release_date: detail.release_date,
        genres: Array.isArray(detail.genres) ? detail.genres : [],
        directors: getDoubanField(doubanMatch, 'directors') || [],
        actors: getDoubanField(doubanMatch, 'actors') || [],
        countries: getDoubanField(doubanMatch, 'countries') || [],
        languages: getDoubanField(doubanMatch, 'languages') || [],
        aka: getDoubanField(doubanMatch, 'aka') || [],
        imdb_id: detail.external_ids?.imdb_id || null,
        poster_path: detail.poster_path || getDoubanField(doubanMatch, 'poster') || null,
        douban_rating: doubanRating,
        douban_link_google: doubanLink,
        douban_link_verified: Boolean(doubanLink),
        overview: detail.overview || getDoubanField(doubanMatch, 'overview') || '',
        durations: getDoubanField(doubanMatch, 'durations') || [],
        rating_count: getDoubanField(doubanMatch, 'rating_count'),
        rating_star_count: getDoubanField(doubanMatch, 'rating_star_count'),
        type: 'movie'
    };
}

function createPayload(spec, items, sourceResults, level) {
    const timestamp = new Date().toISOString();
    const sourceSummary = sourceResults.map((sourceResult) => ({
        slug: sourceResult.slug,
        source: sourceResult.source,
        count: sourceResult.items.length
    }));

    const categoryNames = {
        tv_cn: '国产剧',
        tv_kr: '韩剧',
        tv_jp: '日剧',
        tv_jp_anime: '日漫',
        movie_cn: '院线电影'
    };

    const categoryName = categoryNames[spec.id] || spec.id;

    const metadata = {
        last_updated: timestamp,
        version: '2.0.0',
        update_log: [
            {
                time: timestamp,
                summary:
                    spec.kind === 'tv'
                        ? `已同步${categoryName}数据（${level}）：${items.length} 条`
                        : `已同步${categoryName}数据（${level}）：${items.length} 条`
            }
        ],
        source: TMDB_API_KEY ? 'tmdb+douban' : 'douban',
        source_collections: sourceSummary,
        total_items: items.length
    };

    return spec.kind === 'tv'
        ? {
              metadata,
              shows: items
          }
        : {
              metadata,
              movies: items
          };
}

function createDoubanLookup(kind, items) {
    const lookup = new Map();

    items.forEach((item) => {
        const title = kind === 'tv' ? item.name : item.title;
        const originalTitle = kind === 'tv' ? item.original_name : item.original_title;
        const date = getItemDate(kind, item);

        buildLookupKeys(title, originalTitle).forEach((key) => {
            if (!lookup.has(key)) {
                lookup.set(key, []);
            }
            lookup.get(key).push({ item, date });
        });
    });

    return lookup;
}

function findDoubanMatch(kind, lookup, { title, originalTitle, date }) {
    const year = String(date || '').slice(0, 4);
    const candidates = [];

    buildLookupKeys(title, originalTitle).forEach((key) => {
        (lookup.get(key) || []).forEach((entry) => {
            candidates.push(entry);
        });
    });

    if (candidates.length === 0) {
        return null;
    }

    candidates.sort((left, right) => {
        const leftScore = scoreDoubanCandidate(left.date, year);
        const rightScore = scoreDoubanCandidate(right.date, year);
        return leftScore - rightScore;
    });

    return candidates[0].item;
}

function scoreDoubanCandidate(candidateDate, targetYear) {
    const candidateYear = String(candidateDate || '').slice(0, 4);
    if (!targetYear || !candidateYear) {
        return 10;
    }
    if (candidateYear === targetYear) {
        return 0;
    }
    return Math.abs(Number(candidateYear) - Number(targetYear));
}

function buildLookupKeys(...titles) {
    return [...new Set(titles.map(normalizeLookupText).filter(Boolean))];
}

function normalizeLookupText(value) {
    return String(value || '')
        .toLowerCase()
        // 移除所有不可见字符（如零宽空格 \u200b）及控制字符
        .replace(/[\u0000-\u001f\u007f-\u009f\u200b\u200c\u200d\ufeff]/g, '')
        // 移除标点符号和空格
        .replace(/[\s:：·•'".,，、!！?？\-—_()（）\[\]【】]/g, '')
        .trim();
}

function getDoubanField(match, field) {
    if (!match) {
        return null;
    }

    if (field === 'rating') {
        return match.seasons?.[0]?.douban_rating || match.douban_rating || null;
    }
    if (field === 'link') {
        return match.seasons?.[0]?.douban_link_google || match.douban_link_google || null;
    }
    if (field === 'poster') {
        return match.seasons?.[0]?.poster_path || match.poster_path || null;
    }
    if (field === 'overview') {
        return match.seasons?.[0]?.overview || match.overview || '';
    }
    if (field === 'directors') {
        return match.directors || [];
    }
    if (field === 'actors') {
        return match.actors || [];
    }
    if (field === 'countries') {
        return match.countries || [];
    }
    if (field === 'languages') {
        return match.languages || [];
    }
    if (field === 'aka') {
        return match.aka || [];
    }
    if (field === 'durations') {
        return match.durations || [];
    }
    if (field === 'episodes_info') {
        return match.episodes_info || match.status || null;
    }
    if (field === 'rating_count') {
        return getRatingCount(match.rating_count);
    }
    if (field === 'rating_star_count') {
        return getRatingCount(match.rating_star_count);
    }

    return null;
}

function extractPersonObjects(list) {
    if (!Array.isArray(list)) {
        return [];
    }

    return list
        .map((item) => {
            if (typeof item === 'string') {
                return item.trim();
            }
            if (item && typeof item.name === 'string') {
                return item.name.trim();
            }
            return '';
        })
        .filter(Boolean)
        .map((name, index) => ({
            id: index + 1,
            name
        }));
}

function extractStringList(list) {
    if (!Array.isArray(list)) {
        return [];
    }

    return list
        .map((item) => {
            if (typeof item === 'string') {
                return item.trim();
            }
            if (item && typeof item.name === 'string') {
                return item.name.trim();
            }
            return '';
        })
        .filter(Boolean);
}

function extractGenreObjects(subtitle) {
    const segments = String(subtitle || '')
        .split('/')
        .map((segment) => segment.trim())
        .filter(Boolean);
    const genreSegment = segments[2] || '';
    const names = genreSegment
        .split(/\s+/)
        .map((name) => name.trim())
        .filter(Boolean);

    return names.map((name, index) => ({
        id: index + 1,
        name
    }));
}

function extractSubjectDate(pubdateList, year, fallbackMonthDay) {
    if (Array.isArray(pubdateList)) {
        for (const pubdate of pubdateList) {
            const match = String(pubdate).match(/\d{4}-\d{2}-\d{2}/);
            if (match) {
                return match[0];
            }
        }
    }

    if (fallbackMonthDay && /^\d{2}\.\d{2}$/.test(fallbackMonthDay) && /^\d{4}$/.test(String(year || ''))) {
        return `${year}-${fallbackMonthDay.replace('.', '-')}`;
    }

    if (/^\d{4}$/.test(String(year || ''))) {
        return `${year}-01-01`;
    }

    return null;
}

function extractEpisodeCount(episodesInfo) {
    const match = String(episodesInfo || '').match(/(\d+)\s*集/);
    return match ? Number(match[1]) : null;
}

function buildDoubanSubjectUrl(subjectId) {
    return `https://movie.douban.com/subject/${subjectId}/`;
}

function getRatingValue(value) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue) || numericValue <= 0) {
        return null;
    }

    return numericValue.toFixed(1).replace(/\.0$/, '.0');
}

function getRatingCount(value) {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) && numericValue > 0 ? numericValue : null;
}

function normalizeNumericId(value) {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : value;
}

function getItemDate(kind, item) {
    return kind === 'tv' ? item.first_air_date || item.seasons?.[0]?.air_date || '' : item.release_date || '';
}

function sortByDateDesc(items) {
    return [...items].sort((left, right) => {
        const leftDate = getAnyDate(left);
        const rightDate = getAnyDate(right);
        return rightDate.localeCompare(leftDate);
    });
}

function getAnyDate(item) {
    return item.release_date || item.first_air_date || item.seasons?.[0]?.air_date || '';
}

function dedupeBySignature(kind, items) {
    const seen = new Set();

    return items.filter((item) => {
        const signature = createItemSignature(kind, item);
        if (seen.has(signature)) {
            return false;
        }
        seen.add(signature);
        return true;
    });
}

function createItemSignature(kind, item) {
    const title = kind === 'tv' ? item.name : item.title;
    const originalTitle = kind === 'tv' ? item.original_name : item.original_title;
    const date = getItemDate(kind, item);
    const doubanLink =
        kind === 'tv'
            ? item.seasons?.[0]?.douban_link_google || item.douban_link_google || ''
            : item.douban_link_google || '';
    const imdbId = item.imdb_id || '';

    // 对于豆瓣链接，提取 subject_id 作为签名（不带日期）
    // 同一豆瓣条目在不同数据源可能有不同的日期，应视为同一部作品
    if (doubanLink) {
        const subjectId = extractDoubanSubjectId(doubanLink);
        if (subjectId) {
            return `douban::${subjectId}`;
        }
        // 如果无法提取 subject_id，回退到原逻辑
        return `douban::${normalizeLookupText(doubanLink)}::${String(date).slice(0, 10)}`;
    }

    // TMDB 数据优先使用 tmdb_id 作为签名
    if (item.tmdb_id) {
        return `tmdb::${item.tmdb_id}`;
    }

    if (imdbId) {
        return `imdb::${imdbId}`;
    }

    // 没有唯一 ID 时，才使用标题 + 日期作为签名
    if (kind === 'movie') {
        return `${normalizeLookupText(originalTitle || title)}::${String(date).slice(0, 7)}`;
    }

    return `${normalizeLookupText(originalTitle || title)}`;
}

/**
 * 从豆瓣链接中提取 subject_id
 * 支持格式: https://movie.douban.com/subject/123456/ 或 movie.douban.com/subject/123456
 */
function extractDoubanSubjectId(link) {
    if (!link) return null;
    const match = link.match(/subject\/(\d+)/);
    return match ? match[1] : null;
}

function isMainlandChinaEntry(item) {
    const subtitle = item?.card_subtitle || item?.info || '';
    return subtitle.includes('中国大陆');
}

function isKoreanEntry(item) {
    const subtitle = item?.card_subtitle || item?.info || '';
    return subtitle.includes('韩国');
}

function isJapaneseEntry(item) {
    const subtitle = item?.card_subtitle || item?.info || '';
    return subtitle.includes('日本');
}

function isAnimationEntry(item) {
    const subtitle = item?.card_subtitle || item?.info || '';
    return subtitle.includes('动画');
}

function isJapaneseAnimationEntry(item) {
    return isJapaneseEntry(item) && isAnimationEntry(item);
}

/**
 * [新增] 基于名称和年份的兜底去重逻辑
 * 用于处理那些没有匹配上同一 ID（TMDB vs Douban）但实际是同一部作品的条目
 */
function dedupeByNameAndYear(kind, items) {
    const seen = new Set();
    return items.filter(item => {
        const title = kind === 'tv' ? item.name : item.title;
        const originalTitle = kind === 'tv' ? item.original_name : item.original_title;
        const date = getItemDate(kind, item);
        const year = String(date || '').slice(0, 4);
        
        // 尝试主标题和原名
        const key1 = `${normalizeLookupText(title)}::${year}`;
        const key2 = originalTitle ? `${normalizeLookupText(originalTitle)}::${year}` : key1;
        
        if (seen.has(key1) || seen.has(key2)) {
            return false;
        }
        
        seen.add(key1);
        if (key2 !== key1) seen.add(key2);
        return true;
    });
}

async function mapWithConcurrency(items, concurrency, mapper) {
    const results = new Array(items.length);
    let currentIndex = 0;

    async function worker() {
        while (currentIndex < items.length) {
            const index = currentIndex;
            currentIndex += 1;

            try {
                results[index] = await mapper(items[index], index);
            } catch (error) {
                console.warn(`Skip item ${items[index]?.id}: ${error.message}`);
                results[index] = null;
            }
        }
    }

    const workers = Array.from({ length: Math.min(concurrency, items.length || 1) }, () => worker());
    await Promise.all(workers);
    return results;
}

async function writeJson(relativePath, payload) {
    const targetPath = path.resolve(ROOT_DIR, relativePath);
    await mkdir(path.dirname(targetPath), { recursive: true });
    await writeFile(targetPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
