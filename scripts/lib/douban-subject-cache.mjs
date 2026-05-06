import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const CACHE_SCHEMA_VERSION = 2;

export function createDoubanSubjectCache({ rootDir, ttlDays = 7 }) {
    const cacheDir = path.resolve(rootDir, '.cache/douban/subjects');
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

    async function fetchDetail({ kind, subjectId, endpoint, fetchJson }) {
        const cached = await readCache(kind, subjectId);

        if (cached.state === 'fresh') {
            stats.hits += 1;
            return cached.blocked ? null : cached.payload;
        }

        if (cached.state === 'stale') {
            stats.stale += 1;
        } else if (cached.state === 'invalid') {
            stats.invalid += 1;
        } else {
            stats.misses += 1;
        }

        try {
            const payload = await fetchJson(`https://m.douban.com/rexxar/api/v2/${endpoint}/${subjectId}?for_mobile=1`);
            await writeCache(kind, subjectId, payload, null);
            stats.writes += 1;
            return payload;
        } catch (error) {
            stats.errors += 1;
            const statusMatch = String(error?.message || '').match(/Request failed \((\d+)\)/);
            const statusCode = statusMatch ? Number(statusMatch[1]) : null;

            if (statusCode === 403) {
                await writeCache(kind, subjectId, null, 403);
                stats.writes += 1;
                return null;
            }

            if (cached.payload) {
                stats.staleFallbacks += 1;
                console.warn(`Use stale Douban subject cache ${kind}/${subjectId}: ${error.message}`);
                return cached.payload;
            }
            throw error;
        }
    }

    async function readCache(kind, subjectId) {
        const cachePath = getCachePath(kind, subjectId);

        try {
            const rawText = await readFile(cachePath, 'utf8');
            const cacheEntry = JSON.parse(rawText);
            const fetchedAt = Date.parse(cacheEntry.fetched_at);
            const schemaVersion = cacheEntry.schema_version || 1;
            const payload = cacheEntry.payload;
            const blockedStatus = Number(cacheEntry.blocked_status) || null;
            const isBlockedEntry = schemaVersion >= 2 && blockedStatus === 403;

            if (!Number.isFinite(fetchedAt)) {
                return { state: 'invalid', payload: null };
            }

            if (!payload && !isBlockedEntry) {
                return { state: 'invalid', payload: null };
            }

            return {
                state: Date.now() - fetchedAt <= ttlMs ? 'fresh' : 'stale',
                payload,
                blocked: isBlockedEntry
            };
        } catch (error) {
            if (error?.code === 'ENOENT') {
                return { state: 'missing', payload: null };
            }
            return { state: 'invalid', payload: null };
        }
    }

    async function writeCache(kind, subjectId, payload, blockedStatus = null) {
        const cachePath = getCachePath(kind, subjectId);
        await mkdir(path.dirname(cachePath), { recursive: true });
        await writeFile(
            cachePath,
            `${JSON.stringify(
                {
                    schema_version: CACHE_SCHEMA_VERSION,
                    fetched_at: new Date().toISOString(),
                    kind,
                    subject_id: String(subjectId),
                    payload,
                    blocked_status: blockedStatus
                },
                null,
                2
            )}\n`,
            'utf8'
        );
    }

    function getCachePath(kind, subjectId) {
        const safeKind = kind === 'tv' ? 'tv' : 'movie';
        const safeSubjectId = String(subjectId || '').replace(/[^\dA-Za-z_-]/g, '');
        return path.join(cacheDir, safeKind, `${safeSubjectId}.json`);
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
        fetchDetail,
        summarize,
        ttlDays
    };
}
