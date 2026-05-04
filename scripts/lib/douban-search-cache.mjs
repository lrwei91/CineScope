import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const CACHE_SCHEMA_VERSION = 2;

export function createDoubanSearchCache({ rootDir, ttlDays = 14 }) {
    const cacheDir = path.resolve(rootDir, '.cache/douban/search');
    const ttlMs = Math.max(0, ttlDays) * 24 * 60 * 60 * 1000;
    const stats = {
        hits: 0,
        misses: 0,
        stale: 0,
        invalid: 0,
        writes: 0,
        errors: 0,
        staleFallbacks: 0
    };

    async function fetchSearch({ query, fetchHtml }) {
        const normalizedQuery = String(query || '').trim();
        if (!normalizedQuery) {
            return [];
        }

        const cached = await readCache(normalizedQuery);
        if (cached.state === 'fresh') {
            stats.hits += 1;
            return cached.payload;
        }

        if (cached.state === 'stale') {
            stats.stale += 1;
        } else if (cached.state === 'invalid') {
            stats.invalid += 1;
        } else {
            stats.misses += 1;
        }

        const url = `https://movie.douban.com/subject_search?search_text=${encodeURIComponent(normalizedQuery)}&cat=1002&start=0`;

        try {
            const html = await fetchHtml(url);
            const items = parseSubjectSearchItems(html);
            await writeCache(normalizedQuery, items);
            stats.writes += 1;
            return items;
        } catch (error) {
            stats.errors += 1;
            if (cached.payload) {
                stats.staleFallbacks += 1;
                console.warn(`Use stale Douban search cache "${normalizedQuery}": ${error.message}`);
                return cached.payload;
            }
            throw error;
        }
    }

    async function readCache(query) {
        const cachePath = getCachePath(query);
        try {
            const rawText = await readFile(cachePath, 'utf8');
            const cacheEntry = JSON.parse(rawText);
            const fetchedAt = Date.parse(cacheEntry.fetched_at);
            const payload = cacheEntry.payload;

            if (cacheEntry.schema_version !== CACHE_SCHEMA_VERSION || !Array.isArray(payload) || !Number.isFinite(fetchedAt)) {
                return { state: 'invalid', payload: null };
            }

            return {
                state: Date.now() - fetchedAt <= ttlMs ? 'fresh' : 'stale',
                payload
            };
        } catch (error) {
            if (error?.code === 'ENOENT') {
                return { state: 'missing', payload: null };
            }
            return { state: 'invalid', payload: null };
        }
    }

    async function writeCache(query, payload) {
        const cachePath = getCachePath(query);
        await mkdir(path.dirname(cachePath), { recursive: true });
        await writeFile(
            cachePath,
            `${JSON.stringify(
                {
                    schema_version: CACHE_SCHEMA_VERSION,
                    fetched_at: new Date().toISOString(),
                    query,
                    payload
                },
                null,
                2
            )}\n`,
            'utf8'
        );
    }

    function getCachePath(query) {
        return path.join(cacheDir, `${hashQuery(query)}.json`);
    }

    function summarize() {
        const totalReads = stats.hits + stats.misses + stats.stale + stats.invalid;
        return {
            ...stats,
            total_reads: totalReads,
            hit_rate: totalReads > 0 ? Number((stats.hits / totalReads).toFixed(4)) : 0,
            cache_dir: path.relative(rootDir, cacheDir)
        };
    }

    return {
        fetchSearch,
        summarize,
        ttlDays
    };
}

function parseSubjectSearchItems(html) {
    const jsonText = extractWindowDataJson(String(html || ''));
    if (!jsonText) {
        return [];
    }

    try {
        const payload = JSON.parse(jsonText);
        return Array.isArray(payload.items) ? payload.items : [];
    } catch {
        return [];
    }
}

function extractWindowDataJson(html) {
    const marker = 'window.__DATA__';
    const markerIndex = html.indexOf(marker);
    if (markerIndex === -1) {
        return '';
    }

    const startIndex = html.indexOf('{', markerIndex);
    if (startIndex === -1) {
        return '';
    }

    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let index = startIndex; index < html.length; index += 1) {
        const char = html[index];

        if (inString) {
            if (escaped) {
                escaped = false;
            } else if (char === '\\') {
                escaped = true;
            } else if (char === '"') {
                inString = false;
            }
            continue;
        }

        if (char === '"') {
            inString = true;
            continue;
        }
        if (char === '{') {
            depth += 1;
            continue;
        }
        if (char === '}') {
            depth -= 1;
            if (depth === 0) {
                return html.slice(startIndex, index + 1);
            }
        }
    }

    return '';
}

function hashQuery(query) {
    let hash = 2166136261;
    const text = String(query || '');
    for (let index = 0; index < text.length; index += 1) {
        hash ^= text.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16);
}
