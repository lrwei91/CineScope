#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');

const TMDB_API_KEY = process.env.TMDB_API_KEY || '';
const TMDB_API_BASE = 'https://api.themoviedb.org/3';
const CURRENT_YEAR = new Date().getFullYear();
const END_OF_CURRENT_YEAR = `${CURRENT_YEAR}-12-31`;

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
    for (const spec of CATEGORY_SPECS) {
        const result = await buildCategoryData(spec);
        await writeJson(spec.latestPath, result.latestPayload);
        await writeJson(spec.completePath, result.completePayload);
        console.log(
            `[${spec.id}] latest=${result.latestCount} complete=${result.completeCount} -> ${spec.latestPath}, ${spec.completePath}`
        );
        logFallbackSummary(spec.id, result.fallbackSummary);
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

    const latestItems = mergedItems.slice(0, spec.latestCount);
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
    const completePayload = createPayload(spec, mergedItems, sourceResults, 'complete');

    return {
        latestPayload,
        completePayload,
        latestCount: spec.kind === 'tv' ? latestPayload.shows.length : latestPayload.movies.length,
        completeCount: spec.kind === 'tv' ? completePayload.shows.length : completePayload.movies.length,
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
            const detail = await fetchDoubanSubjectDetail(spec.kind, item.id).catch((error) => {
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
        homepage: null,
        popularity: null,
        number_of_seasons: 1,
        number_of_episodes: extractEpisodeCount(detail?.episodes_info || item.episodes_info),
        first_air_date: airDate,
        last_air_date: airDate,
        in_production: Boolean(detail?.episodes_info && /更新/.test(detail.episodes_info)),
        status: detail?.episodes_info || '',
        adult: false,
        poster_path: posterUrl,
        backdrop_path: null,
        overview: detail?.intro || item.comment || '',
        seasons: [
            {
                name: '',
                season_number: 1,
                id: normalizeNumericId(item.id),
                air_date: airDate,
                episode_count: extractEpisodeCount(detail?.episodes_info || item.episodes_info),
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

    return {
        id: normalizeNumericId(item.id),
        title: detail?.title || item.title,
        original_title: detail?.original_title || detail?.title || item.title,
        release_date: releaseDate,
        genres: extractGenreObjects(detail?.card_subtitle || item.card_subtitle || item.info),
        imdb_id: null,
        poster_path: posterUrl,
        douban_rating: ratingValue,
        douban_link_google: buildDoubanSubjectUrl(item.id),
        douban_link_verified: true,
        overview: detail?.intro || item.description || '',
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
        homepage: detail.homepage || null,
        popularity: detail.popularity || null,
        number_of_seasons: detail.number_of_seasons || 1,
        number_of_episodes: detail.number_of_episodes || null,
        first_air_date: detail.first_air_date,
        last_air_date: detail.last_air_date || detail.first_air_date,
        in_production: Boolean(detail.in_production),
        status: detail.status || '',
        adult: Boolean(detail.adult),
        poster_path: detail.poster_path || getDoubanField(doubanMatch, 'poster') || null,
        backdrop_path: detail.backdrop_path || null,
        overview: detail.overview || getDoubanField(doubanMatch, 'overview') || '',
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
        imdb_id: detail.external_ids?.imdb_id || null,
        poster_path: detail.poster_path || getDoubanField(doubanMatch, 'poster') || null,
        douban_rating: doubanRating,
        douban_link_google: doubanLink,
        douban_link_verified: Boolean(doubanLink),
        overview: detail.overview || getDoubanField(doubanMatch, 'overview') || '',
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

    return null;
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

    if (kind === 'movie') {
        return `${normalizeLookupText(title || originalTitle)}::${String(date).slice(0, 7)}`;
    }

    return `${normalizeLookupText(title || originalTitle)}::${date}`;
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
