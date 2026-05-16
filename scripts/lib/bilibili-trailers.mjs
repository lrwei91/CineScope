import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const DEFAULT_BILIBILI_TRAILER_UP_MID = '8465957';
export const DEFAULT_BILIBILI_TRAILER_CACHE_PATH = '.cache/bilibili/up-8465957-videos.json';
export const DEFAULT_BILIBILI_TRAILER_OVERRIDES_PATH = 'scripts/data/movie_cn_trailer_overrides.json';
export const DEFAULT_BILIBILI_TRAILER_BOOTSTRAP_PAGE_LIMIT = 8;
export const DEFAULT_BILIBILI_TRAILER_INCREMENTAL_PAGE_LIMIT = 4;
export const DEFAULT_BILIBILI_TRAILER_REQUEST_DELAY_MS = 1200;
export const DEFAULT_BILIBILI_TRAILER_REQUEST_JITTER_MS = 400;
export const DEFAULT_BILIBILI_TRAILER_MAX_RETRIES = 3;
export const DEFAULT_BILIBILI_TRAILER_RETRY_BASE_DELAY_MS = 3000;
export const DEFAULT_BILIBILI_TRAILER_SEARCH_SUFFIX = '乌鸦预告片';
export const DEFAULT_BILIBILI_TRAILER_REQUEST_TIMEOUT_MS = 15000;
export const DEFAULT_BILIBILI_TV_TRAILER_UP_MID = '229864363';
export const DEFAULT_BILIBILI_TV_TRAILER_CACHE_PATH = '.cache/bilibili/up-229864363-videos.json';
export const DEFAULT_BILIBILI_TV_TRAILER_OVERRIDES_PATH = 'scripts/data/tv_cn_trailer_overrides.json';
export const DEFAULT_BILIBILI_TV_TRAILER_SEARCH_SUFFIX = '追剧情报社';

const BILIBILI_API_HEADERS = {
    Accept: 'application/json, text/plain, */*',
    Origin: 'https://www.bilibili.com',
    'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36'
};

const BILIBILI_SEARCH_PAGE_HEADERS = {
    Accept: 'application/json, text/plain, */*',
    Referer: 'https://www.bilibili.com/',
    Origin: 'https://www.bilibili.com',
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
    incrementalPageLimit = DEFAULT_BILIBILI_TRAILER_INCREMENTAL_PAGE_LIMIT,
    forceBootstrap = false,
    requestDelayMs = DEFAULT_BILIBILI_TRAILER_REQUEST_DELAY_MS,
    requestJitterMs = DEFAULT_BILIBILI_TRAILER_REQUEST_JITTER_MS,
    maxRetries = DEFAULT_BILIBILI_TRAILER_MAX_RETRIES,
    retryBaseDelayMs = DEFAULT_BILIBILI_TRAILER_RETRY_BASE_DELAY_MS,
    requestTimeoutMs = DEFAULT_BILIBILI_TRAILER_REQUEST_TIMEOUT_MS
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
            incrementalPageLimit,
            forceBootstrap,
            requestDelayMs,
            requestJitterMs,
            maxRetries,
            retryBaseDelayMs,
            requestTimeoutMs
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
    incrementalPageLimit = DEFAULT_BILIBILI_TRAILER_INCREMENTAL_PAGE_LIMIT,
    forceBootstrap = false,
    requestDelayMs = DEFAULT_BILIBILI_TRAILER_REQUEST_DELAY_MS,
    requestJitterMs = DEFAULT_BILIBILI_TRAILER_REQUEST_JITTER_MS,
    maxRetries = DEFAULT_BILIBILI_TRAILER_MAX_RETRIES,
    retryBaseDelayMs = DEFAULT_BILIBILI_TRAILER_RETRY_BASE_DELAY_MS,
    requestTimeoutMs = DEFAULT_BILIBILI_TRAILER_REQUEST_TIMEOUT_MS
} = {}) {
    const rows = [];
    let page = 1;
    let totalCount = null;
    let fetchedPages = 0;
    const normalizedExistingRows = normalizeBilibiliTrailerRows(existingRows, mid);
    const cachedKeys = new Set(normalizedExistingRows.map((row) => row.bvid || row.url).filter(Boolean));
    const hasExistingCache = normalizedExistingRows.length > 0 && !forceBootstrap;
    const pageLimit = hasExistingCache ? incrementalPageLimit : bootstrapPageLimit;
    let reachedKnownRow = false;

    while (page <= pageLimit) {
        if (fetchedPages > 0) {
            await sleep(resolveWaitDuration(requestDelayMs, requestJitterMs));
        }

        const payload = await fetchBilibiliVideoPage({
            mid,
            page,
            fetchImpl,
            maxRetries,
            retryBaseDelayMs,
            requestTimeoutMs
        });
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

export async function searchBilibiliTrailerRowsForMovies({
    movies = [],
    mid = DEFAULT_BILIBILI_TRAILER_UP_MID,
    fetchImpl = fetch,
    requestDelayMs = DEFAULT_BILIBILI_TRAILER_REQUEST_DELAY_MS,
    requestJitterMs = DEFAULT_BILIBILI_TRAILER_REQUEST_JITTER_MS,
    maxRetries = DEFAULT_BILIBILI_TRAILER_MAX_RETRIES,
    retryBaseDelayMs = DEFAULT_BILIBILI_TRAILER_RETRY_BASE_DELAY_MS,
    searchSuffix = DEFAULT_BILIBILI_TRAILER_SEARCH_SUFFIX,
    requestTimeoutMs = DEFAULT_BILIBILI_TRAILER_REQUEST_TIMEOUT_MS
} = {}) {
    return searchBilibiliTrailerRowsForCatalogItems({
        items: movies,
        mid,
        fetchImpl,
        requestDelayMs,
        requestJitterMs,
        maxRetries,
        retryBaseDelayMs,
        searchSuffix,
        requestTimeoutMs
    });
}

export async function searchBilibiliTrailerRowsForCatalogItems({
    items = [],
    mid = DEFAULT_BILIBILI_TRAILER_UP_MID,
    fetchImpl = fetch,
    requestDelayMs = DEFAULT_BILIBILI_TRAILER_REQUEST_DELAY_MS,
    requestJitterMs = DEFAULT_BILIBILI_TRAILER_REQUEST_JITTER_MS,
    maxRetries = DEFAULT_BILIBILI_TRAILER_MAX_RETRIES,
    retryBaseDelayMs = DEFAULT_BILIBILI_TRAILER_RETRY_BASE_DELAY_MS,
    searchSuffix = DEFAULT_BILIBILI_TRAILER_SEARCH_SUFFIX,
    requestTimeoutMs = DEFAULT_BILIBILI_TRAILER_REQUEST_TIMEOUT_MS
} = {}) {
    const normalizedMovies = Array.isArray(items) ? items : [];
    const rows = [];

    for (let index = 0; index < normalizedMovies.length; index += 1) {
        const movie = normalizedMovies[index];
        const searchQueries = buildTrailerSearchQueries(movie, searchSuffix);
        let matchedRows = [];

        for (const query of searchQueries) {
            if (index > 0 || matchedRows.length > 0) {
                await sleep(resolveWaitDuration(requestDelayMs, requestJitterMs));
            }

            let searchResults = [];
            try {
                searchResults = await fetchBilibiliSearchPageResults({
                    keyword: query,
                    fetchImpl,
                    maxRetries,
                    retryBaseDelayMs,
                    requestTimeoutMs
                });
            } catch {
                continue;
            }
            matchedRows = searchResults
                .filter((result) => String(result?.mid || '') === String(mid) || String(result?.author || '').trim() === searchSuffix)
                .map((result) => normalizeSingleTrailerRow(result, mid))
                .filter(Boolean)
                .filter((row) => scoreTrailerMovieMatch(row, movie) > 0);

            if (matchedRows.length > 0) {
                break;
            }
        }

        rows.push(...matchedRows);
    }

    return dedupeTrailerCollections([rows]);
}

async function fetchBilibiliVideoPage({
    mid,
    page,
    fetchImpl,
    maxRetries = DEFAULT_BILIBILI_TRAILER_MAX_RETRIES,
    retryBaseDelayMs = DEFAULT_BILIBILI_TRAILER_RETRY_BASE_DELAY_MS,
    requestTimeoutMs = DEFAULT_BILIBILI_TRAILER_REQUEST_TIMEOUT_MS
}) {
    let attempt = 0;

    while (true) {
        try {
            const url = new URL('https://api.bilibili.com/x/space/arc/search');
            url.searchParams.set('mid', String(mid));
            url.searchParams.set('pn', String(page));
            url.searchParams.set('ps', '30');
            url.searchParams.set('order', 'pubdate');
            url.searchParams.set('jsonp', 'jsonp');

            const response = await fetchImpl(url, {
                headers: getBilibiliApiHeaders(mid),
                signal: createTimeoutSignal(requestTimeoutMs)
            });
            const responseText = await response.text();

            if (!response.ok) {
                throw createBilibiliFetchError(`Bilibili trailer request failed (${response.status})`, response.status);
            }

            if (/<!doctype html/i.test(responseText) || /验证码/i.test(responseText)) {
                throw createBilibiliFetchError('Bilibili trailer request was blocked by a captcha page.');
            }

            let payload = null;
            try {
                payload = JSON.parse(responseText);
            } catch {
                throw createBilibiliFetchError('Bilibili trailer response is not valid JSON.');
            }

            if (Number(payload?.code) !== 0) {
                throw createBilibiliFetchError(
                    payload?.message || `Bilibili trailer request failed with code ${payload?.code ?? 'unknown'}.`,
                    payload?.code
                );
            }

            return payload;
        } catch (error) {
            attempt += 1;

            if (!shouldRetryBilibiliError(error) || attempt > maxRetries) {
                throw error;
            }

            await sleep(resolveRetryDelay(retryBaseDelayMs, attempt));
        }
    }
}

function createBilibiliFetchError(message, code = null) {
    const error = new Error(message);
    error.code = code;
    return error;
}

async function fetchBilibiliSearchPageResults({
    keyword,
    page = 1,
    fetchImpl,
    maxRetries = DEFAULT_BILIBILI_TRAILER_MAX_RETRIES,
    retryBaseDelayMs = DEFAULT_BILIBILI_TRAILER_RETRY_BASE_DELAY_MS,
    requestTimeoutMs = DEFAULT_BILIBILI_TRAILER_REQUEST_TIMEOUT_MS
}) {
    let attempt = 0;

    while (true) {
        try {
            const url = new URL('https://api.bilibili.com/x/web-interface/wbi/search/all/v2');
            url.searchParams.set('keyword', String(keyword || '').trim());
            url.searchParams.set('page', String(page));

            const response = await fetchImpl(url, {
                headers: BILIBILI_SEARCH_PAGE_HEADERS,
                signal: createTimeoutSignal(requestTimeoutMs)
            });
            const responseText = await response.text();

            if (!response.ok) {
                throw createBilibiliFetchError(`Bilibili search API request failed (${response.status})`, response.status);
            }

            if (/<!doctype html/i.test(responseText) || /验证码|出错啦/i.test(responseText)) {
                throw createBilibiliFetchError('Bilibili search API request was blocked by a risk-control page.');
            }

            return extractBilibiliSearchResultsFromJson(responseText);
        } catch (error) {
            attempt += 1;

            if (!shouldRetryBilibiliError(error) || attempt > maxRetries) {
                throw error;
            }

            await sleep(resolveRetryDelay(retryBaseDelayMs, attempt));
        }
    }
}

export function extractBilibiliSearchResultsFromJson(jsonText) {
    const rawText = String(jsonText || '').trim();
    if (!rawText) {
        throw new Error('Bilibili search API response is empty.');
    }

    let payload = null;
    try {
        payload = JSON.parse(rawText);
    } catch {
        throw new Error('Bilibili search API response is not valid JSON.');
    }

    if (Number(payload?.code) !== 0) {
        throw new Error(payload?.message || `Bilibili search API failed with code ${payload?.code ?? 'unknown'}.`);
    }

    const resultGroups = Array.isArray(payload?.data?.result) ? payload.data.result : [];
    const videoGroup = resultGroups.find((group) => group?.result_type === 'video');
    const results = videoGroup?.data;
    return Array.isArray(results) ? results : [];
}

function shouldRetryBilibiliError(error) {
    const message = String(error?.message || '').toLowerCase();
    const code = Number(error?.code);

    if ([412, 429, -352].includes(code)) {
        return true;
    }

    return (
        message.includes('captcha') ||
        message.includes('频繁') ||
        message.includes('稍后再试') ||
        message.includes('too many requests') ||
        message.includes('request failed (412)') ||
        message.includes('request failed (429)') ||
        message.includes('risk control')
    );
}

function resolveWaitDuration(requestDelayMs, requestJitterMs) {
    const baseDelay = Math.max(0, Number(requestDelayMs) || 0);
    const jitter = Math.max(0, Number(requestJitterMs) || 0);
    if (jitter === 0) {
        return baseDelay;
    }

    return baseDelay + Math.floor(Math.random() * (jitter + 1));
}

function resolveRetryDelay(retryBaseDelayMs, attempt) {
    const baseDelay = Math.max(0, Number(retryBaseDelayMs) || 0);
    return baseDelay * attempt;
}

function createTimeoutSignal(timeoutMs) {
    const safeTimeoutMs = Math.max(0, Number(timeoutMs) || 0);
    if (safeTimeoutMs === 0 || typeof AbortSignal === 'undefined' || typeof AbortSignal.timeout !== 'function') {
        return undefined;
    }

    return AbortSignal.timeout(safeTimeoutMs);
}

function sleep(durationMs) {
    const safeDurationMs = Math.max(0, Number(durationMs) || 0);
    if (safeDurationMs === 0) {
        return Promise.resolve();
    }

    return new Promise((resolve) => {
        setTimeout(resolve, safeDurationMs);
    });
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
    return buildCatalogTrailerLookupKeys(movie);
}

export function buildCatalogTrailerLookupKeys(item) {
    if (!item || typeof item !== 'object') return [];

    return [...new Set(
        [
            item.title,
            item.name,
            item.original_title,
            item.originalTitle,
            item.original_name,
            item.originalName,
            ...(Array.isArray(item.aka) ? item.aka : [])
        ]
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

function buildTrailerSearchQueries(movie, searchSuffix = DEFAULT_BILIBILI_TRAILER_SEARCH_SUFFIX) {
    const rawTitles = [
        movie?.title,
        movie?.name,
        movie?.original_title,
        movie?.originalTitle,
        movie?.original_name,
        movie?.originalName,
        ...(Array.isArray(movie?.aka) ? movie.aka : [])
    ]
        .map((value) => String(value || '').trim())
        .filter(Boolean);

    return [...new Set(rawTitles.map((title) => `${title} ${searchSuffix}`.trim()))];
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
    return mergeTrailersIntoCatalogItems(movies, trailerRows, options);
}

export function mergeTrailersIntoCatalogItems(items, trailerRows, options = {}) {
    const normalizedMovies = Array.isArray(items) ? items : [];
    const normalizedRows = normalizeBilibiliTrailerRows(trailerRows);
    const existingTrailersByMovie = createExistingTrailersMap(options.existingMovies || options.existingItems);
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
            buildCatalogTrailerLookupKeys(movie)
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

function getBilibiliApiHeaders(mid) {
    return {
        ...BILIBILI_API_HEADERS,
        Referer: `https://space.bilibili.com/${String(mid || DEFAULT_BILIBILI_TRAILER_UP_MID)}/upload/video`
    };
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

        buildCatalogTrailerLookupKeys(movie).forEach((titleKey) => {
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
    const movieKeys = buildCatalogTrailerLookupKeys(movie);
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
    if (match.itemId && String(match.itemId) === String(movie.id)) return true;
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

    const movieKeys = new Set(buildCatalogTrailerLookupKeys(movie));
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
