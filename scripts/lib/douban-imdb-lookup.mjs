import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const CACHE_SCHEMA_VERSION = 1;
const LOOKUP_ENDPOINT = 'https://api.douban.com/v2/movie/imdb';
const IMDB_ID_PATTERN = /^tt\d{5,}$/;
const DAY_MS = 24 * 60 * 60 * 1000;
const LOOKUP_USER_AGENT =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function toPositiveNumber(value) {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) && numericValue > 0 ? numericValue : null;
}

export function normalizeImdbId(value) {
    const normalized = String(value || '')
        .trim()
        .toLowerCase();
    return IMDB_ID_PATTERN.test(normalized) ? normalized : null;
}

function extractDoubanSubjectId(raw) {
    for (const candidate of [raw?.id, raw?.alt, raw?.mobile_link]) {
        const match = String(candidate || '').match(/\/(?:movie|tv|subject)\/(\d+)/);
        if (match) {
            return match[1];
        }
    }
    return null;
}

/**
 * 通过豆瓣官方 v2 接口按 IMDB ID 反查豆瓣条目。
 *
 * 该链路用于补齐 TMDB 驱动分类（tv_us / tv_kr / tv_jp 等）中
 * 「豆瓣榜单标题匹配失败」导致缺失的评分与链接——榜单只覆盖近期热门，
 * 而 IMDB ID 是精确键，命中率显著更高。
 *
 * apiKey 必须由调用方从环境变量传入，不得写入仓库。
 */
export function createDoubanImdbLookup({
    rootDir,
    ttlDays = 30,
    negativeTtlDays = 3,
    apiKey = '',
    minIntervalMs = 1500,
    timeoutMs = 15000,
    fetchImpl = fetch
}) {
    const cacheDir = path.resolve(rootDir, '.cache/douban/imdb-lookup');
    const ttlMs = Math.max(0, ttlDays) * DAY_MS;
    const negativeTtlMs = Math.max(0, negativeTtlDays) * DAY_MS;
    const normalizedApiKey = String(apiKey || '').trim();

    let lastRequestAt = 0;
    let queue = Promise.resolve();

    const stats = {
        hits: 0,
        misses: 0,
        stale: 0,
        invalid: 0,
        writes: 0,
        errors: 0,
        matched: 0,
        unmatched: 0,
        skipped: 0
    };

    function countOutcome(payload) {
        if (payload?.rating) {
            stats.matched += 1;
        } else {
            stats.unmatched += 1;
        }
    }

    // 全局串行节流：并发调用方排队穿过同一闸门，保证请求间隔不小于 minIntervalMs。
    function throttle() {
        const slot = queue.then(async () => {
            const waitMs = lastRequestAt + minIntervalMs - Date.now();
            if (waitMs > 0) {
                await sleep(waitMs);
            }
            lastRequestAt = Date.now();
        });
        queue = slot.catch(() => {});
        return slot;
    }

    async function lookup(imdbId) {
        const normalizedId = normalizeImdbId(imdbId);
        if (!normalizedId || !normalizedApiKey) {
            stats.skipped += 1;
            return null;
        }

        const cached = await readCache(normalizedId);
        if (cached.state === 'fresh') {
            stats.hits += 1;
            countOutcome(cached.payload);
            return cached.payload;
        }

        if (cached.state === 'stale') {
            stats.stale += 1;
        } else if (cached.state === 'invalid') {
            stats.invalid += 1;
        } else {
            stats.misses += 1;
        }

        try {
            await throttle();
            const payload = await requestLookup(normalizedId);
            await writeCache(normalizedId, payload);
            stats.writes += 1;
            countOutcome(payload);
            return payload;
        } catch (error) {
            stats.errors += 1;
            if (cached.payload) {
                countOutcome(cached.payload);
                return cached.payload;
            }
            throw error;
        }
    }

    async function requestLookup(imdbId) {
        const response = await fetchImpl(`${LOOKUP_ENDPOINT}/${imdbId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': LOOKUP_USER_AGENT,
                Accept: 'application/json'
            },
            body: new URLSearchParams({ apikey: normalizedApiKey }).toString(),
            signal: AbortSignal.timeout(timeoutMs)
        });

        // 404 表示豆瓣无此条目，记为负缓存，避免重复请求。
        if (response.status === 404) {
            return null;
        }
        if (!response.ok) {
            throw new Error(`Douban imdb lookup failed (${response.status}): ${imdbId}`);
        }

        return normalizePayload(await response.json(), imdbId);
    }

    function normalizePayload(raw, imdbId) {
        if (!raw || typeof raw !== 'object') {
            return null;
        }

        const doubanId = extractDoubanSubjectId(raw);
        const rating = toPositiveNumber(raw.rating?.average);
        const ratingCount = toPositiveNumber(raw.rating?.numRaters);

        if (!doubanId && !rating) {
            return null;
        }

        return {
            imdb_id: imdbId,
            douban_id: doubanId,
            rating,
            rating_count: ratingCount,
            title: typeof raw.title === 'string' ? raw.title : null
        };
    }

    async function readCache(imdbId) {
        const cachePath = getCachePath(imdbId);
        try {
            const entry = JSON.parse(await readFile(cachePath, 'utf8'));
            if ((entry.schema_version || 1) !== CACHE_SCHEMA_VERSION) {
                return { state: 'invalid', payload: null };
            }

            const fetchedAt = Date.parse(entry.fetched_at);
            if (!Number.isFinite(fetchedAt)) {
                return { state: 'invalid', payload: null };
            }

            const payload = entry.payload ?? null;
            // 有评分的条目缓存长 TTL；无评分/未收录的条目短 TTL，以便捕捉后续开分。
            const maxFreshMs = payload?.rating ? ttlMs : negativeTtlMs;
            const isFresh = Date.now() - fetchedAt <= maxFreshMs;

            return { state: isFresh ? 'fresh' : 'stale', payload };
        } catch (error) {
            if (error?.code === 'ENOENT') {
                return { state: 'missing', payload: null };
            }
            return { state: 'invalid', payload: null };
        }
    }

    async function writeCache(imdbId, payload) {
        const cachePath = getCachePath(imdbId);
        await mkdir(path.dirname(cachePath), { recursive: true });
        await writeFile(
            cachePath,
            `${JSON.stringify(
                {
                    schema_version: CACHE_SCHEMA_VERSION,
                    fetched_at: new Date().toISOString(),
                    imdb_id: imdbId,
                    payload
                },
                null,
                2
            )}\n`,
            'utf8'
        );
    }

    function getCachePath(imdbId) {
        return path.join(cacheDir, `${imdbId}.json`);
    }

    function summarize() {
        const totalReads = stats.hits + stats.misses + stats.stale + stats.invalid;
        return {
            ...stats,
            total_reads: totalReads,
            hit_rate: totalReads > 0 ? Number((stats.hits / totalReads).toFixed(4)) : 0,
            enabled: Boolean(normalizedApiKey),
            cache_dir: path.relative(rootDir, cacheDir)
        };
    }

    return {
        lookup,
        summarize,
        enabled: Boolean(normalizedApiKey),
        ttlDays
    };
}
