import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const DEFAULT_BILIBILI_TRAILER_UP_MID = '8465957';
export const DEFAULT_BILIBILI_TRAILER_CACHE_PATH = '.cache/bilibili/up-8465957-videos.json';
export const DEFAULT_BILIBILI_TRAILER_OVERRIDES_PATH = 'scripts/data/movie_cn_trailer_overrides.json';
export const DEFAULT_BILIBILI_TRAILER_BOOTSTRAP_PAGE_LIMIT = 8;
export const DEFAULT_BILIBILI_TRAILER_INCREMENTAL_PAGE_LIMIT = 4;

const BILIBILI_API_HEADERS = {
    Accept: 'application/json, text/plain, */*',
    Origin: 'https://www.bilibili.com',
    Referer: `https://space.bilibili.com/${DEFAULT_BILIBILI_TRAILER_UP_MID}/upload/video`,
    'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36'
};

const TRAILER_DESCRIPTOR_PATTERNS = [
    /官方/g,
    /电影/g,
    /院线/g,
    /全新/g,
    /独家/g,
    /震撼/g,
    /热映/g,
    /同步/g,
    /口碑/g,
    /特别视频/g,
    /特别预告/g,
    /特别呈现/g,
    /特别篇/g,
    /发布/g,
    /曝光/g,
    /揭晓/g,
    /抢先/g,
    /独播/g,
    /独家首发/g,
    /首曝/g,
    /首支/g,
    /定档/g,
    /先导/g,
    /终极/g,
    /正式/g,
    /全阵容/g,
    /片段/g,
    /花絮/g,
    /特辑/g,
    /幕后/g,
    /制作特辑/g,
    /口碑特辑/g,
    /预售/g,
    /献映/g,
    /上映/g,
    /见面会/g,
    /路演/g,
    /主题曲/g,
    /mv/gi,
    /ost/gi,
    /预告片/g,
    /预告/g,
    /中字/g,
    /中文/g,
    /国配/g,
    /国语/g,
    /粤语/g,
    /4k/gi,
    /imax/gi,
    /hdr/gi
];

export async function loadBilibiliTrailerDataset({
    rootDir,
    mid = DEFAULT_BILIBILI_TRAILER_UP_MID,
    fetchImpl = fetch,
    cacheRelativePath = DEFAULT_BILIBILI_TRAILER_CACHE_PATH,
    overridesRelativePath = DEFAULT_BILIBILI_TRAILER_OVERRIDES_PATH,
    bootstrapPageLimit = DEFAULT_BILIBILI_TRAILER_BOOTSTRAP_PAGE_LIMIT,
    incrementalPageLimit = DEFAULT_BILIBILI_TRAILER_INCREMENTAL_PAGE_LIMIT
} = {}) {
    if (!rootDir) {
        throw new Error('loadBilibiliTrailerDataset requires a rootDir.');
    }

    const cachePath = path.resolve(rootDir, cacheRelativePath);
    const overridesPath = path.resolve(rootDir, overridesRelativePath);
    const overridesPayload = await readJsonFile(overridesPath, { mid, overrides: [] });
    const cachedPayload = await readJsonFile(cachePath, null);
    const cachedRows = Array.isArray(cachedPayload?.rows)
        ? normalizeBilibiliTrailerRows(cachedPayload.rows, cachedPayload.metadata?.mid || mid)
        : [];

    try {
        const fetchResult = await fetchBilibiliTrailerRows({
            mid,
            fetchImpl,
            existingRows: cachedRows,
            bootstrapPageLimit,
            incrementalPageLimit
        });
        const rows = fetchResult.rows;
        const payload = {
            metadata: {
                last_updated: new Date().toISOString(),
                mid: String(mid),
                source: 'bilibili',
                total_items: rows.length,
                status: 'remote',
                fetched_pages: fetchResult.fetchedPages,
                mode: fetchResult.mode
            },
            rows
        };

        await mkdir(path.dirname(cachePath), { recursive: true });
        await writeFile(cachePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

        return {
            rows,
            overrides: normalizeTrailerOverrides(overridesPayload?.overrides),
            metadata: payload.metadata
        };
    } catch (error) {
        if (cachedRows.length > 0) {
            return {
                rows: cachedRows,
                overrides: normalizeTrailerOverrides(overridesPayload?.overrides),
                metadata: {
                    last_updated: cachedPayload.metadata?.last_updated || new Date().toISOString(),
                    mid: String(cachedPayload.metadata?.mid || mid),
                    source: 'bilibili',
                    total_items: cachedRows.length,
                    status: 'cache',
                    message: error instanceof Error ? error.message : String(error),
                    fetched_pages: cachedPayload.metadata?.fetched_pages || 0,
                    mode: cachedPayload.metadata?.mode || 'cache'
                }
            };
        }

        return {
            rows: [],
            overrides: normalizeTrailerOverrides(overridesPayload?.overrides),
            metadata: {
                last_updated: new Date().toISOString(),
                mid: String(mid),
                source: 'bilibili',
                total_items: 0,
                status: 'failed',
                message: error instanceof Error ? error.message : String(error)
            }
        };
    }
}

export async function fetchBilibiliTrailerRows({
    mid = DEFAULT_BILIBILI_TRAILER_UP_MID,
    fetchImpl = fetch,
    existingRows = [],
    bootstrapPageLimit = DEFAULT_BILIBILI_TRAILER_BOOTSTRAP_PAGE_LIMIT,
    incrementalPageLimit = DEFAULT_BILIBILI_TRAILER_INCREMENTAL_PAGE_LIMIT
} = {}) {
    const rows = [];
    let page = 1;
    let totalCount = null;
    let fetchedPages = 0;
    const normalizedExistingRows = normalizeBilibiliTrailerRows(existingRows, mid);
    const cachedKeys = new Set(normalizedExistingRows.map((row) => row.bvid || row.url).filter(Boolean));
    const hasExistingCache = normalizedExistingRows.length > 0;
    const pageLimit = hasExistingCache ? incrementalPageLimit : bootstrapPageLimit;
    let reachedKnownRow = false;

    while (page <= pageLimit) {
        const payload = await fetchBilibiliVideoPage({ mid, page, fetchImpl });
        const list = Array.isArray(payload?.data?.list?.vlist) ? payload.data.list.vlist : [];
        const pageCount = Number(payload?.data?.page?.count);
        fetchedPages += 1;
        if (Number.isFinite(pageCount)) {
            totalCount = pageCount;
        }

        rows.push(...list);
        if (hasExistingCache && list.some((row) => cachedKeys.has(String(row?.bvid || row?.bv_id || '').trim()))) {
            reachedKnownRow = true;
        }

        if (list.length === 0) {
            break;
        }

        if (totalCount !== null && rows.length >= totalCount) {
            break;
        }

        if (hasExistingCache && reachedKnownRow) {
            break;
        }

        page += 1;
    }

    return {
        rows: dedupeTrailerCollections([
            normalizeBilibiliTrailerRows(rows, mid),
            normalizedExistingRows
        ]),
        fetchedPages,
        mode: hasExistingCache ? 'incremental' : 'bootstrap'
    };
}

async function fetchBilibiliVideoPage({ mid, page, fetchImpl }) {
    const url = new URL('https://api.bilibili.com/x/space/arc/search');
    url.searchParams.set('mid', String(mid));
    url.searchParams.set('pn', String(page));
    url.searchParams.set('ps', '30');
    url.searchParams.set('order', 'pubdate');
    url.searchParams.set('jsonp', 'jsonp');

    const response = await fetchImpl(url, {
        headers: BILIBILI_API_HEADERS
    });
    const responseText = await response.text();

    if (!response.ok) {
        throw new Error(`Bilibili trailer request failed (${response.status})`);
    }

    if (/<!doctype html/i.test(responseText) || /验证码/i.test(responseText)) {
        throw new Error('Bilibili trailer request was blocked by a captcha page.');
    }

    let payload = null;
    try {
        payload = JSON.parse(responseText);
    } catch {
        throw new Error('Bilibili trailer response is not valid JSON.');
    }

    if (Number(payload?.code) !== 0) {
        throw new Error(payload?.message || `Bilibili trailer request failed with code ${payload?.code ?? 'unknown'}.`);
    }

    return payload;
}

export function normalizeBilibiliTrailerRows(rows, mid = DEFAULT_BILIBILI_TRAILER_UP_MID) {
    if (!Array.isArray(rows)) {
        return [];
    }

    const dedupedRows = new Map();

    rows.forEach((row) => {
        const normalized = normalizeSingleTrailerRow(row, mid);
        if (!normalized) return;
        const rowKey = normalized.bvid || normalized.url;
        if (!rowKey || dedupedRows.has(rowKey)) return;
        dedupedRows.set(rowKey, normalized);
    });

    return [...dedupedRows.values()];
}

function normalizeSingleTrailerRow(row, mid) {
    if (!row || typeof row !== 'object') return null;

    const bvid = String(row.bvid || row.bv_id || '').trim();
    const title = String(row.title || '').trim();
    if (!bvid || !title) {
        return null;
    }

    const cover = normalizeBilibiliCoverUrl(row.pic || row.cover || '');
    const publishedAt = normalizePublishedAt(row.created || row.pubdate || row.ctime || row.publishedAt);

    return {
        source: 'bilibili',
        title,
        bvid,
        url: buildBilibiliVideoUrl(bvid),
        embedUrl: buildBilibiliEmbedUrl(bvid),
        cover,
        publishedAt,
        upMid: String(row.mid || mid || DEFAULT_BILIBILI_TRAILER_UP_MID)
    };
}

export function buildBilibiliVideoUrl(bvid) {
    return `https://www.bilibili.com/video/${String(bvid || '').trim()}`;
}

export function buildBilibiliEmbedUrl(bvid) {
    const url = new URL('https://player.bilibili.com/player.html');
    url.searchParams.set('bvid', String(bvid || '').trim());
    url.searchParams.set('page', '1');
    url.searchParams.set('qn', '64');
    url.searchParams.set('high_quality', '1');
    return url.toString();
}

function normalizeBilibiliCoverUrl(value) {
    const url = String(value || '').trim();
    if (!url) return '';
    if (url.startsWith('//')) return `https:${url}`;
    return url;
}

function normalizePublishedAt(value) {
    if (!value) return '';
    if (typeof value === 'number' || /^\d+$/.test(String(value))) {
        const timestamp = Number(value);
        const date = new Date(timestamp < 1e12 ? timestamp * 1000 : timestamp);
        return Number.isNaN(date.getTime()) ? '' : date.toISOString();
    }

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

export function normalizeMovieTrailerMatchKey(value) {
    return String(value || '')
        .toLowerCase()
        .replace(/[\u0000-\u001f\u007f-\u009f\u200b\u200c\u200d\ufeff]/g, '')
        .replace(/[\s:：·•'"’“”.,，、!！?？\-—–_()（）\[\]【】《》]/g, '')
        .trim();
}

export function buildMovieTrailerLookupKeys(movie) {
    if (!movie || typeof movie !== 'object') return [];

    return [...new Set(
        [movie.title, movie.original_title, movie.originalTitle, ...(Array.isArray(movie.aka) ? movie.aka : [])]
            .map(normalizeMovieTrailerMatchKey)
            .filter(Boolean)
    )];
}

export function buildTrailerCandidateKeys(title) {
    const rawTitle = String(title || '').trim();
    if (!rawTitle) return [];

    const keys = new Set();
    const quotedMatches = rawTitle.matchAll(/[《「『“"]([^》」』”"]{1,60})[》」』”"]/g);
    for (const match of quotedMatches) {
        const key = normalizeMovieTrailerMatchKey(match[1]);
        if (key) keys.add(key);
    }

    rawTitle
        .split(/[|｜/\\:：\-_—–]+/)
        .map((segment) => normalizeTrailerDescriptorText(segment))
        .filter(Boolean)
        .forEach((key) => keys.add(key));

    const normalizedWholeTitle = normalizeTrailerDescriptorText(rawTitle);
    if (normalizedWholeTitle) {
        keys.add(normalizedWholeTitle);
    }

    return [...keys].sort((left, right) => right.length - left.length);
}

function normalizeTrailerDescriptorText(value) {
    let cleaned = String(value || '').trim();
    cleaned = cleaned.replace(/[【】\[\]()（）]/g, ' ');
    cleaned = cleaned.replace(/\b(19|20)\d{2}\b/g, ' ');

    TRAILER_DESCRIPTOR_PATTERNS.forEach((pattern) => {
        cleaned = cleaned.replace(pattern, ' ');
    });

    return normalizeMovieTrailerMatchKey(cleaned);
}

export function mergeTrailersIntoMovies(movies, trailerRows, options = {}) {
    const normalizedMovies = Array.isArray(movies) ? movies : [];
    const normalizedRows = normalizeBilibiliTrailerRows(trailerRows);
    const existingTrailersByMovie = createExistingTrailersMap(options.existingMovies);
    const manualOverrides = normalizeTrailerOverrides(options.overrides);
    const assignedTrailers = new Map();
    const lockedMovieIds = new Set();

    manualOverrides.forEach((override) => {
        const movie = normalizedMovies.find((candidate) => movieMatchesOverride(candidate, override.match));
        if (!movie) return;
        assignedTrailers.set(movie.id, dedupeTrailers(override.trailers));
        lockedMovieIds.add(movie.id);
    });

    normalizedRows.forEach((row) => {
        const match = findBestMovieMatch(row, normalizedMovies, lockedMovieIds);
        if (!match) return;
        const movieTrailers = assignedTrailers.get(match.movie.id) || [];
        movieTrailers.push(row);
        assignedTrailers.set(match.movie.id, dedupeTrailers(movieTrailers));
    });

    return normalizedMovies.map((movie) => {
        const matchedTrailers = assignedTrailers.get(movie.id);
        const preservedTrailers =
            existingTrailersByMovie.byMovieId.get(movie.id) ||
            buildMovieTrailerLookupKeys(movie)
                .map((titleKey) => existingTrailersByMovie.byTitleKey.get(titleKey))
                .find((trailers) => Array.isArray(trailers) && trailers.length > 0) ||
            [];
        const nextTrailers = dedupeTrailers(matchedTrailers?.length ? matchedTrailers : preservedTrailers);

        if (nextTrailers.length === 0) {
            const { trailers, ...movieWithoutTrailers } = movie;
            return movieWithoutTrailers;
        }

        return {
            ...movie,
            trailers: nextTrailers
        };
    });
}

function createExistingTrailersMap(existingMovies) {
    const trailersByMovieId = new Map();
    const trailersByTitleKey = new Map();
    if (!Array.isArray(existingMovies)) {
        return {
            byMovieId: trailersByMovieId,
            byTitleKey: trailersByTitleKey
        };
    }

    existingMovies.forEach((movie) => {
        const trailers = dedupeTrailers(movie.trailers);
        if (trailers.length === 0) return;

        if (movie?.id) {
            trailersByMovieId.set(movie.id, trailers);
        }

        buildMovieTrailerLookupKeys(movie).forEach((titleKey) => {
            if (titleKey && !trailersByTitleKey.has(titleKey)) {
                trailersByTitleKey.set(titleKey, trailers);
            }
        });
    });

    return {
        byMovieId: trailersByMovieId,
        byTitleKey: trailersByTitleKey
    };
}

function findBestMovieMatch(row, movies, lockedMovieIds) {
    let bestMatch = null;

    movies.forEach((movie) => {
        if (!movie?.id || lockedMovieIds.has(movie.id)) return;

        const score = scoreTrailerMovieMatch(row, movie);
        if (score <= 0) return;

        if (!bestMatch || score > bestMatch.score) {
            bestMatch = { movie, score };
        }
    });

    return bestMatch;
}

export function scoreTrailerMovieMatch(row, movie) {
    const movieKeys = buildMovieTrailerLookupKeys(movie);
    const trailerKeys = buildTrailerCandidateKeys(row?.title);
    if (movieKeys.length === 0 || trailerKeys.length === 0) {
        return -1;
    }

    let bestScore = -1;

    trailerKeys.forEach((trailerKey) => {
        movieKeys.forEach((movieKey) => {
            if (!trailerKey || !movieKey) return;

            let score = -1;
            if (trailerKey === movieKey) {
                score = 100 + movieKey.length;
            } else if (movieKey.length >= 4 && trailerKey.includes(movieKey)) {
                score = 70 + movieKey.length;
            } else if (trailerKey.length >= 4 && movieKey.includes(trailerKey)) {
                score = 55 + trailerKey.length;
            }

            if (score > 0) {
                score += scoreTrailerYearAffinity(row, movie);
                if (score > bestScore) {
                    bestScore = score;
                }
            }
        });
    });

    return bestScore;
}

function scoreTrailerYearAffinity(row, movie) {
    const titleYear = extractYearFromText(row?.title);
    const movieYear = String(movie?.release_date || movie?.date || '').slice(0, 4);
    if (!titleYear || !movieYear) return 0;
    if (titleYear === movieYear) return 5;
    return -Math.min(5, Math.abs(Number(titleYear) - Number(movieYear)));
}

function extractYearFromText(value) {
    return String(value || '').match(/\b(19|20)\d{2}\b/)?.[0] || '';
}

function dedupeTrailers(trailers) {
    if (!Array.isArray(trailers)) return [];

    const trailerMap = new Map();
    trailers
        .map((trailer) => normalizeManualTrailer(trailer))
        .filter(Boolean)
        .forEach((trailer) => {
            const trailerKey = trailer.bvid || trailer.url || `${trailer.title}-${trailer.publishedAt}`;
            if (!trailerKey || trailerMap.has(trailerKey)) return;
            trailerMap.set(trailerKey, trailer);
        });

    return [...trailerMap.values()].sort((left, right) => {
        const leftTime = Date.parse(left.publishedAt || '') || 0;
        const rightTime = Date.parse(right.publishedAt || '') || 0;
        return rightTime - leftTime;
    });
}

function dedupeTrailerCollections(collections) {
    const trailerMap = new Map();

    collections
        .flatMap((collection) => (Array.isArray(collection) ? collection : []))
        .map((trailer) => normalizeManualTrailer(trailer))
        .filter(Boolean)
        .forEach((trailer) => {
            const trailerKey = trailer.bvid || trailer.url || `${trailer.title}-${trailer.publishedAt}`;
            if (!trailerKey || trailerMap.has(trailerKey)) return;
            trailerMap.set(trailerKey, trailer);
        });

    return [...trailerMap.values()].sort((left, right) => {
        const leftTime = Date.parse(left.publishedAt || '') || 0;
        const rightTime = Date.parse(right.publishedAt || '') || 0;
        return rightTime - leftTime;
    });
}

function normalizeTrailerOverrides(overrides) {
    if (!Array.isArray(overrides)) return [];

    return overrides
        .map((override) => {
            const trailers = dedupeTrailers(override?.trailers);
            if (trailers.length === 0) return null;

            return {
                match: override?.match || {},
                trailers
            };
        })
        .filter(Boolean);
}

function normalizeManualTrailer(trailer) {
    if (!trailer || typeof trailer !== 'object') return null;

    const bvid = String(trailer.bvid || '').trim();
    const title = String(trailer.title || '').trim();
    const url = String(trailer.url || (bvid ? buildBilibiliVideoUrl(bvid) : '')).trim();
    const embedUrl = bvid
        ? buildBilibiliEmbedUrl(bvid)
        : String(trailer.embedUrl || '').trim();
    if (!title || (!bvid && !url)) return null;

    return {
        source: 'bilibili',
        title,
        bvid,
        url,
        embedUrl,
        cover: normalizeBilibiliCoverUrl(trailer.cover || ''),
        publishedAt: normalizePublishedAt(trailer.publishedAt || trailer.published_at || '')
    };
}

function movieMatchesOverride(movie, match = {}) {
    if (!movie || !match || typeof match !== 'object') return false;

    if (match.movieId && String(match.movieId) === String(movie.id)) return true;
    if (match.tmdbId && String(match.tmdbId) === String(movie.tmdb_id || movie.tmdbId)) return true;
    if (match.doubanSubjectId && String(match.doubanSubjectId) === String(extractDoubanSubjectId(movie.douban_link_google || movie.doubanLink || ''))) {
        return true;
    }

    const candidateTitles = [
        match.title,
        ...(Array.isArray(match.titles) ? match.titles : [])
    ]
        .map(normalizeMovieTrailerMatchKey)
        .filter(Boolean);
    if (candidateTitles.length === 0) return false;

    const movieKeys = new Set(buildMovieTrailerLookupKeys(movie));
    return candidateTitles.some((titleKey) => movieKeys.has(titleKey));
}

function extractDoubanSubjectId(link) {
    const match = String(link || '').match(/subject\/(\d+)/);
    return match ? match[1] : null;
}

async function readJsonFile(targetPath, fallbackValue) {
    try {
        return JSON.parse(await readFile(targetPath, 'utf8'));
    } catch {
        return fallbackValue;
    }
}
