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
const ANILIST_API_BASE = 'https://graphql.anilist.co';
const CURRENT_YEAR = new Date().getFullYear();
const END_OF_CURRENT_YEAR = `${CURRENT_YEAR}-12-31`;
const DOUBAN_DEFAULT_USER_ID = 'lrwei91';

const REQUEST_HEADERS = {
    Referer: 'https://m.douban.com/',
    'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
    Accept: 'application/json'
};

const DOUBAN_TV_JP_ANIME_OVERRIDE_ITEMS = [
    {
        id: 37295319,
        name: 'Re：从零开始的异世界生活 第四季',
        original_name: 'Re:ゼロから始める異世界生活 4th season',
        imdb_id: null,
        genres: [
            { id: 1, name: '剧情' },
            { id: 2, name: '动画' },
            { id: 3, name: '奇幻' }
        ],
        networks: [],
        directors: [],
        actors: [],
        countries: ['日本'],
        languages: ['日语'],
        aka: [
            'Re:Zero kara Hajimeru Isekai Seikatsu 4th Season',
            'Re:ZERO -Starting Life in Another World- Season 4',
            'Re：从零开始的异世界生活 第四季'
        ],
        homepage: 'https://re-zero-anime.jp/tv/',
        popularity: null,
        number_of_seasons: 4,
        number_of_episodes: null,
        first_air_date: '2026-04-08',
        last_air_date: '2026-04-08',
        in_production: true,
        status: '尚未播出',
        episodes_info: null,
        adult: false,
        poster_path: null,
        backdrop_path: null,
        overview: '',
        rating_count: null,
        rating_star_count: null,
        seasons: [
            {
                name: '第 4 季',
                season_number: 4,
                id: 37295319,
                air_date: '2026-04-08',
                episode_count: null,
                vote_average: 0,
                poster_path: null,
                douban_rating: null,
                douban_link_google: 'https://movie.douban.com/subject/37295319/',
                overview: '',
                douban_link_verified: true
            }
        ]
    }
];

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
        latestWindowDays: 60,
        minDate: '2025-01-01',
        latestPath: 'json/tv_jp_anime_latest.json',
        completePath: 'json/tv_jp_anime_complete.json',
        doubanSources: [
            { slug: 'tv_animation', includeItem: isJapaneseAnimationEntry }
        ],
        doubanOverrideItems: DOUBAN_TV_JP_ANIME_OVERRIDE_ITEMS,
        anilist: {
            formats: ['TV', 'TV_SHORT', 'ONA'],
            countryOfOrigin: 'JP'
        },
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
    },
    {
        id: 'tv_cn_variety',
        kind: 'tv',
        latestCount: 18,
        minDate: '2025-01-01',
        latestPath: 'json/tv_cn_variety_latest.json',
        completePath: 'json/tv_cn_variety_complete.json',
        doubanSources: [
            { slug: 'tv_variety_show', includeItem: isMainlandChinaEntry }
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
                with_genres: '10764|10767',
                include_null_first_air_dates: 'false',
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
    const doubanSourceResults = [
        ...(await buildDoubanSourceResults(spec, fallbackCollector)),
        ...buildDoubanOverrideResults(spec)
    ];
    const doubanItems = dedupeBySignature(
        spec.kind,
        sortByDateDesc(doubanSourceResults.flatMap((sourceResult) => sourceResult.items)).filter((item) =>
            spec.minDate ? getItemDate(spec.kind, item) >= spec.minDate : true
        )
    );
    const doubanLookup = createDoubanLookup(spec.kind, doubanItems);

    const anilistItems = spec.anilist ? await buildAniListItems(spec, doubanLookup) : [];
    const tmdbItems = !spec.anilist && TMDB_API_KEY && spec.tmdb ? await buildTmdbItems(spec, doubanLookup) : [];
    const remoteItems = anilistItems.length > 0 ? anilistItems : tmdbItems;
    const mergedItems = dedupeBySignature(
        spec.kind,
        sortByDateDesc([...remoteItems, ...doubanItems]).filter((item) =>
            spec.minDate ? getItemDate(spec.kind, item) >= spec.minDate : true
        )
    );

    // [新增] 二次去重兜底：针对那些没能通过 ID 匹配的同名同年作品进行合并
    const finallyDedupedItems = dedupeByNameAndYear(spec.kind, mergedItems);
    const tmdbEnrichedItems =
        TMDB_API_KEY && spec.tmdb ? await enrichItemsWithTmdbFallback(spec, finallyDedupedItems) : finallyDedupedItems;

    const latestItems = selectLatestItems(spec, tmdbEnrichedItems);
    const sourceResults = [
        ...doubanSourceResults.map((sourceResult) => ({
            slug: sourceResult.slug,
            source: 'douban',
            items: sourceResult.items
        })),
        ...(anilistItems.length > 0 ? [{ slug: 'anilist-seasonal', source: 'anilist', items: anilistItems }] : []),
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

function buildDoubanOverrideResults(spec) {
    if (!Array.isArray(spec.doubanOverrideItems) || spec.doubanOverrideItems.length === 0) {
        return [];
    }

    return [
        {
            slug: 'douban_override',
            items: spec.doubanOverrideItems.map((item) => structuredClone(item))
        }
    ];
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
            aliases: Array.isArray(item.aka) ? item.aka : [],
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

async function buildAniListItems(spec, doubanLookup) {
    const seasonWindows = buildAniListSeasonWindows(spec.minDate || `${CURRENT_YEAR}-01-01`, END_OF_CURRENT_YEAR);
    const mediaItems = [];

    for (const seasonWindow of seasonWindows) {
        const seasonMedia = await fetchAniListSeasonMedia(spec.anilist, seasonWindow);
        mediaItems.push(...seasonMedia);
    }

    const seen = new Set();
    const uniqueMediaItems = mediaItems.filter((item) => {
        if (!item?.id || seen.has(item.id)) {
            return false;
        }
        seen.add(item.id);
        return true;
    });

    const normalizedItems = await mapWithConcurrency(uniqueMediaItems, 6, async (item) => {
        const date = formatAniListDate(item.startDate, item.seasonYear, item.season);
        const doubanMatch = findDoubanMatch(spec.kind, doubanLookup, {
            title: item.title?.english || item.title?.romaji || item.title?.native || '',
            originalTitle: item.title?.native || item.title?.romaji || item.title?.english || '',
            aliases: [item.title?.romaji, item.title?.english, item.title?.native, ...(item.synonyms || [])],
            date
        });

        return normalizeAniListTvEntry(item, doubanMatch);
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
            originalTitle: item.subtitle || item.original_title || item.original_name || '',
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
            name: detail.name || item.name,
            original_name: detail.original_name || item.original_name || detail.name || item.name,
            tmdb_id: tmdbId,
            tmdbUrl,
            overview,
            poster_path: posterPath,
            backdrop_path: item.backdrop_path || detail.backdrop_path || null,
            imdb_id: imdbId,
            genres: item.genres?.length ? item.genres : Array.isArray(detail.genres) ? detail.genres : [],
            networks: item.networks?.length ? item.networks : Array.isArray(detail.networks) ? detail.networks : [],
            vote_average: item.vote_average || detail.vote_average || 0,
            vote_count: item.vote_count || detail.vote_count || 0,
            countries: item.countries?.length ? item.countries : extractStringList(detail.origin_country),
            languages: item.languages?.length ? item.languages : [detail.original_language].filter(Boolean),
            number_of_episodes: item.number_of_episodes || detail.number_of_episodes || null,
            episodes_info: item.episodes_info || detail.status || null,
            status: item.status || detail.status || '',
            seasons: Array.isArray(item.seasons) && item.seasons.length > 0
                ? item.seasons.map((season) => ({
                      ...season,
                      poster_path: season.poster_path || detail.poster_path || null,
                      overview: season.overview || detail.overview || ''
                  }))
                : item.seasons
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

async function fetchAniListSeasonMedia(config, { season, seasonYear }) {
    const results = [];
    let page = 1;
    let hasNextPage = true;
    const query = `
        query ($page: Int, $perPage: Int, $season: MediaSeason, $seasonYear: Int, $formats: [MediaFormat], $countryOfOrigin: CountryCode) {
            Page(page: $page, perPage: $perPage) {
                pageInfo {
                    currentPage
                    hasNextPage
                }
                media(
                    season: $season
                    seasonYear: $seasonYear
                    type: ANIME
                    format_in: $formats
                    countryOfOrigin: $countryOfOrigin
                    sort: POPULARITY_DESC
                ) {
                    id
                    title {
                        romaji
                        english
                        native
                    }
                    synonyms
                    season
                    seasonYear
                    status
                    format
                    episodes
                    duration
                    averageScore
                    popularity
                    siteUrl
                    description(asHtml: false)
                    startDate {
                        year
                        month
                        day
                    }
                    endDate {
                        year
                        month
                        day
                    }
                    studios(isMain: true) {
                        nodes {
                            id
                            name
                        }
                    }
                    coverImage {
                        large
                    }
                    bannerImage
                    genres
                    staff(perPage: 12, sort: [RELEVANCE, ROLE, FAVOURITES_DESC]) {
                        edges {
                            role
                            node {
                                id
                                name {
                                    full
                                    native
                                }
                            }
                        }
                    }
                }
            }
        }
    `;

    while (hasNextPage) {
        const data = await fetchAniListJson(query, {
            page,
            perPage: 50,
            season,
            seasonYear,
            formats: config.formats,
            countryOfOrigin: config.countryOfOrigin
        });

        const pageData = data?.data?.Page;
        const media = Array.isArray(pageData?.media) ? pageData.media : [];
        results.push(...media);
        hasNextPage = Boolean(pageData?.pageInfo?.hasNextPage);
        page += 1;
    }

    return results;
}

async function fetchAniListJson(query, variables) {
    const response = await fetch(ANILIST_API_BASE, {
        method: 'POST',
        headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'User-Agent': REQUEST_HEADERS['User-Agent']
        },
        body: JSON.stringify({ query, variables })
    });

    if (!response.ok) {
        throw new Error(`AniList request failed (${response.status})`);
    }

    const payload = await response.json();
    if (Array.isArray(payload?.errors) && payload.errors.length > 0) {
        throw new Error(`AniList query failed: ${payload.errors[0]?.message || 'unknown error'}`);
    }

    return payload;
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

function normalizeAniListTvEntry(item, doubanMatch) {
    const firstAirDate = formatAniListDate(item.startDate, item.seasonYear, item.season);
    if (!firstAirDate) {
        return null;
    }

    const seasonNumber = extractSeasonNumber(
        item.title?.native,
        item.title?.english,
        item.title?.romaji,
        ...(item.synonyms || [])
    );
    const doubanTitle = getDoubanField(doubanMatch, 'title') || '';
    const doubanOriginalName = getDoubanField(doubanMatch, 'original_name') || '';
    const originalName = doubanOriginalName || item.title?.native || item.title?.romaji || item.title?.english || doubanTitle;
    const displayName = doubanTitle || item.title?.english || originalName;
    const overview = getDoubanField(doubanMatch, 'overview') || sanitizeText(item.description) || '';
    const doubanRating = getDoubanField(doubanMatch, 'rating');
    const doubanLink = getDoubanField(doubanMatch, 'link');
    const score = Number.isFinite(Number(item.averageScore)) ? Number(item.averageScore) / 10 : 0;
    const episodeCount = Number.isFinite(Number(item.episodes)) ? Number(item.episodes) : null;

    return {
        id: item.id,
        anilist_id: item.id,
        tmdb_id: null,
        name: displayName,
        original_name: originalName,
        subtitle: originalName,
        imdb_id: null,
        genres:
            getDoubanField(doubanMatch, 'genres') ||
            (item.genres || []).map((name, index) => ({
                id: index + 1,
                name
            })),
        type: 'Scripted',
        vote_average: score,
        vote_count: null,
        origin_country: [item.countryOfOrigin].filter(Boolean),
        original_language: 'ja',
        networks: getDoubanField(doubanMatch, 'networks') || [],
        directors: extractAniListStaff(item.staff?.edges, ['Director', 'Series Director']),
        actors: [],
        countries: getDoubanField(doubanMatch, 'countries') || ['日本'],
        languages: getDoubanField(doubanMatch, 'languages') || ['日语'],
        aka: buildAniListAka(item, displayName, originalName, doubanTitle),
        homepage: item.siteUrl || null,
        popularity: Number.isFinite(Number(item.popularity)) ? Number(item.popularity) : null,
        number_of_seasons: seasonNumber,
        number_of_episodes: episodeCount,
        first_air_date: firstAirDate,
        last_air_date: formatAniListDate(item.endDate, item.seasonYear, item.season) || firstAirDate,
        in_production: item.status === 'RELEASING' || item.status === 'NOT_YET_RELEASED',
        status: item.status || '',
        episodes_info: getDoubanField(doubanMatch, 'episodes_info') || formatAniListEpisodeInfo(item.status, episodeCount),
        adult: false,
        poster_path: item.coverImage?.large || getDoubanField(doubanMatch, 'poster') || null,
        backdrop_path: item.bannerImage || null,
        overview,
        rating_count: getDoubanField(doubanMatch, 'rating_count'),
        rating_star_count: getDoubanField(doubanMatch, 'rating_star_count'),
        seasons: [
            {
                name: seasonNumber > 1 ? `第 ${seasonNumber} 季` : '',
                season_number: seasonNumber,
                id: item.id,
                air_date: firstAirDate,
                episode_count: episodeCount,
                vote_average: score,
                poster_path: item.coverImage?.large || getDoubanField(doubanMatch, 'poster') || null,
                douban_rating: doubanRating,
                douban_link_google: doubanLink,
                overview,
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
    const sourceKinds = [...new Set(sourceSummary.map((sourceResult) => sourceResult.source))];

    const categoryNames = {
        tv_cn: '国产剧',
        tv_cn_variety: '综艺',
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
        source: sourceKinds.join('+') || 'unknown',
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
        const aliases = Array.isArray(item.aka) ? item.aka : [];

        buildLookupKeys(title, originalTitle, ...aliases).forEach((key) => {
            if (!lookup.has(key)) {
                lookup.set(key, []);
            }
            lookup.get(key).push({ item, date });
        });
    });

    return lookup;
}

function findDoubanMatch(kind, lookup, { title, originalTitle, aliases = [], date }) {
    const year = String(date || '').slice(0, 4);
    const candidates = [];

    buildLookupKeys(title, originalTitle, ...(Array.isArray(aliases) ? aliases : [])).forEach((key) => {
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
        .replace(/[\s:：·•'"’“”.,，、!！?？\-—–_()（）\[\]【】]/g, '')
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
    if (field === 'title') {
        return match.name || match.title || null;
    }
    if (field === 'original_name') {
        return match.original_name || match.original_title || match.name || match.title || null;
    }
    if (field === 'genres') {
        return match.genres || [];
    }
    if (field === 'networks') {
        return match.networks || [];
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

function buildAniListSeasonWindows(minDate, maxDate) {
    const min = new Date(`${minDate}T00:00:00Z`);
    const max = new Date(`${maxDate}T00:00:00Z`);
    const windows = [];

    for (let year = min.getUTCFullYear(); year <= max.getUTCFullYear(); year += 1) {
        for (const season of ['WINTER', 'SPRING', 'SUMMER', 'FALL']) {
            const { start, end } = getAniListSeasonBounds(year, season);
            if (end < min || start > max) {
                continue;
            }
            windows.push({ season, seasonYear: year });
        }
    }

    return windows;
}

function getAniListSeasonBounds(year, season) {
    const monthBySeason = {
        WINTER: 0,
        SPRING: 3,
        SUMMER: 6,
        FALL: 9
    };
    const startMonth = monthBySeason[season];
    const start = new Date(Date.UTC(year, startMonth, 1));
    const end = new Date(Date.UTC(year, startMonth + 3, 0));
    return { start, end };
}

function formatAniListDate(dateParts, fallbackYear, season) {
    const year = Number(dateParts?.year || fallbackYear);
    if (!Number.isFinite(year) || year <= 0) {
        return null;
    }

    const fallbackMonthBySeason = {
        WINTER: 1,
        SPRING: 4,
        SUMMER: 7,
        FALL: 10
    };
    const month = Number(dateParts?.month || fallbackMonthBySeason[season] || 1);
    const day = Number(dateParts?.day || 1);
    const normalizedMonth = String(Math.min(Math.max(month, 1), 12)).padStart(2, '0');
    const normalizedDay = String(Math.min(Math.max(day, 1), 31)).padStart(2, '0');
    return `${year}-${normalizedMonth}-${normalizedDay}`;
}

function extractAniListStaff(edges, roleKeywords) {
    if (!Array.isArray(edges)) {
        return [];
    }

    const normalizedKeywords = roleKeywords.map((keyword) => keyword.toLowerCase());
    const people = [];
    const seen = new Set();

    edges.forEach((edge) => {
        const role = String(edge?.role || '').toLowerCase();
        if (!normalizedKeywords.some((keyword) => role.includes(keyword))) {
            return;
        }

        const name = edge?.node?.name?.full || edge?.node?.name?.native || '';
        if (!name || seen.has(name)) {
            return;
        }

        seen.add(name);
        people.push({
            id: people.length + 1,
            name
        });
    });

    return people;
}

function buildAniListAka(item, displayName, originalName, doubanTitle) {
    return [...new Set([item.title?.english, item.title?.romaji, ...extractStringList(item.synonyms), doubanTitle])]
        .map((value) => String(value || '').trim())
        .filter((value) => value && value !== displayName && value !== originalName);
}

function sanitizeText(value) {
    return String(value || '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/\s+\n/g, '\n')
        .replace(/\n\s+/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

function extractSeasonNumber(...candidates) {
    for (const candidate of candidates) {
        const text = String(candidate || '');
        const zhMatch = text.match(/第\s*(\d+)\s*[期季]/i);
        if (zhMatch) {
            return Number(zhMatch[1]);
        }
        const enMatch = text.match(/(?:season\s*|)(\d+)(?:st|nd|rd|th)?\s*season/i) || text.match(/season\s*(\d+)/i);
        if (enMatch) {
            return Number(enMatch[1]);
        }
    }

    return 1;
}

function formatAniListEpisodeInfo(status, episodeCount) {
    if (Number.isFinite(episodeCount) && episodeCount > 0) {
        return `${episodeCount}集`;
    }

    return status || null;
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

function selectLatestItems(spec, items) {
    if (!Number.isFinite(Number(spec.latestWindowDays)) || Number(spec.latestWindowDays) <= 0) {
        return items.slice(0, spec.latestCount);
    }

    const maxDate = new Date();
    maxDate.setUTCDate(maxDate.getUTCDate() + Number(spec.latestWindowDays));
    const maxDateText = maxDate.toISOString().slice(0, 10);
    const nearTermItems = items.filter((item) => {
        const itemDate = getAnyDate(item);
        return itemDate && itemDate <= maxDateText;
    });

    if (nearTermItems.length >= spec.latestCount) {
        return nearTermItems.slice(0, spec.latestCount);
    }

    const seenIds = new Set(nearTermItems.map((item) => createItemSignature(spec.kind, item)));
    const remainder = items.filter((item) => !seenIds.has(createItemSignature(spec.kind, item)));
    return [...nearTermItems, ...remainder].slice(0, spec.latestCount);
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
    const survivors = [];

    items.forEach((item) => {
        const duplicateIndex = survivors.findIndex((existingItem) => isLikelySameEntry(kind, existingItem, item));
        if (duplicateIndex === -1) {
            survivors.push(item);
            return;
        }

        if (shouldReplaceDuplicate(kind, survivors[duplicateIndex], item)) {
            survivors[duplicateIndex] = item;
        }
    });

    return survivors;
}

function isLikelySameEntry(kind, leftItem, rightItem) {
    const leftDate = getItemDate(kind, leftItem);
    const rightDate = getItemDate(kind, rightItem);
    if (!leftDate || !rightDate || leftDate !== rightDate) {
        return false;
    }

    const leftKeys = buildComparableTitleKeys(kind, leftItem);
    const rightKeys = buildComparableTitleKeys(kind, rightItem);
    if (leftKeys.size === 0 || rightKeys.size === 0) {
        return false;
    }

    for (const key of leftKeys) {
        if (rightKeys.has(key)) {
            return true;
        }
    }

    return false;
}

function buildComparableTitleKeys(kind, item) {
    const values = kind === 'tv'
        ? [item.name, item.original_name, ...(Array.isArray(item.aka) ? item.aka : [])]
        : [item.title, item.original_title, ...(Array.isArray(item.aka) ? item.aka : [])];

    return new Set(
        values
            .map((value) => normalizeComparableTitle(value))
            .filter(Boolean)
    );
}

function normalizeComparableTitle(value) {
    return normalizeLookupText(value)
        .replace(/jojosbizarreadventure/g, 'jojo')
        .replace(/jojo的奇妙冒险/g, 'jojo')
        .replace(/ジョジョの奇妙な冒険/g, 'jojo')
        .replace(/第[一二三四五六七八九十\d]+(?:季|期)/g, '')
        .replace(/\d+(?:st|nd|rd|th)?season/g, '')
        .replace(/season\d+/g, '')
        .replace(/\d+(?:st|nd|rd|th)?stage/g, '')
        .replace(/stage\d+/g, '')
        .replace(/stage/g, '')
        .replace(/part\d+/g, '')
        .trim();
}

function shouldReplaceDuplicate(kind, currentItem, nextItem) {
    return scoreDuplicateCandidate(kind, nextItem) > scoreDuplicateCandidate(kind, currentItem);
}

function scoreDuplicateCandidate(kind, item) {
    const doubanLink =
        kind === 'tv'
            ? item.seasons?.[0]?.douban_link_google || item.douban_link_google || ''
            : item.douban_link_google || '';
    const hasPoster = Boolean(
        kind === 'tv' ? item.seasons?.[0]?.poster_path || item.poster_path : item.poster_path
    );
    const hasOverview = Boolean(String(item.overview || item.seasons?.[0]?.overview || '').trim());
    const aliasCount = Array.isArray(item.aka) ? item.aka.length : 0;

    return (
        (doubanLink ? 100 : 0) +
        (hasPoster ? 20 : 0) +
        (hasOverview ? 10 : 0) +
        aliasCount
    );
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
