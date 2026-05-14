import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';

import {
    buildTrailerCandidateKeys,
    fetchBilibiliTrailerRows,
    loadBilibiliTrailerDataset,
    mergeTrailersIntoMovies
} from '../scripts/lib/bilibili-trailers.mjs';

test('buildTrailerCandidateKeys extracts movie title from decorated Bilibili trailer title', () => {
    const keys = buildTrailerCandidateKeys('《四渡》首支正式预告发布 2026');

    assert.ok(keys.includes('四渡'));
    assert.ok(!keys.includes('首支正式预告发布'));
});

test('mergeTrailersIntoMovies matches trailers by normalized titles and preserves existing trailers on failure', () => {
    const movies = [
        {
            id: 1,
            title: '三国第一部：争洛阳',
            original_title: '三国第一部：争洛阳',
            release_date: '2026-07-10',
            aka: []
        },
        {
            id: 2,
            title: '大圣崛起',
            original_title: '大圣崛起',
            release_date: '2026-07-10',
            aka: ['混世之王：大圣崛起']
        }
    ];
    const trailers = [
        {
            title: '《三国第一部：争洛阳》终极预告',
            bvid: 'BV1abc411111',
            url: 'https://www.bilibili.com/video/BV1abc411111',
            embedUrl: 'https://player.bilibili.com/player.html?bvid=BV1abc411111&page=1',
            cover: '',
            publishedAt: '2026-05-01T00:00:00.000Z'
        }
    ];
    const existingMovies = [
        {
            id: 2,
            trailers: [
                {
                    source: 'bilibili',
                    title: '《大圣崛起》先导预告',
                    bvid: 'BV1fallback2222',
                    url: 'https://www.bilibili.com/video/BV1fallback2222',
                    embedUrl: 'https://player.bilibili.com/player.html?bvid=BV1fallback2222&page=1',
                    cover: '',
                    publishedAt: '2026-04-01T00:00:00.000Z'
                }
            ]
        }
    ];

    const merged = mergeTrailersIntoMovies(movies, trailers, { existingMovies });

    assert.equal(merged[0].trailers.length, 1);
    assert.equal(merged[0].trailers[0].bvid, 'BV1abc411111');
    assert.equal(merged[1].trailers.length, 1);
    assert.equal(merged[1].trailers[0].bvid, 'BV1fallback2222');
});

test('mergeTrailersIntoMovies lets manual overrides take precedence over auto match', () => {
    const movies = [
        {
            id: 1,
            title: '四渡',
            original_title: '四渡',
            release_date: '2026-06-26',
            aka: []
        }
    ];
    const trailers = [
        {
            title: '《四渡》预告片',
            bvid: 'BV1auto333333',
            url: 'https://www.bilibili.com/video/BV1auto333333',
            embedUrl: 'https://player.bilibili.com/player.html?bvid=BV1auto333333&page=1',
            cover: '',
            publishedAt: '2026-05-01T00:00:00.000Z'
        }
    ];
    const overrides = [
        {
            match: { movieId: 1 },
            trailers: [
                {
                    title: '《四渡》手工指定预告',
                    bvid: 'BV1manual44444',
                    publishedAt: '2026-05-02T00:00:00.000Z'
                }
            ]
        }
    ];

    const merged = mergeTrailersIntoMovies(movies, trailers, { overrides });

    assert.equal(merged[0].trailers.length, 1);
    assert.equal(merged[0].trailers[0].bvid, 'BV1manual44444');
});

test('loadBilibiliTrailerDataset falls back to cached rows when remote fetch fails', async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), 'latest-tv-bili-'));
    const cacheRelativePath = '.cache/bilibili/up-8465957-videos.json';
    const overrideRelativePath = 'scripts/data/movie_cn_trailer_overrides.json';
    const cachePath = path.join(rootDir, cacheRelativePath);
    const overridesPath = path.join(rootDir, overrideRelativePath);

    await mkdir(path.dirname(cachePath), { recursive: true });
    await mkdir(path.dirname(overridesPath), { recursive: true });
    await writeFile(
        cachePath,
        `${JSON.stringify({
            metadata: {
                last_updated: '2026-05-14T00:00:00.000Z',
                mid: '8465957'
            },
            rows: [
                {
                    title: '《四渡》正式预告',
                    bvid: 'BV1cached55555',
                    url: 'https://www.bilibili.com/video/BV1cached55555',
                    embedUrl: 'https://player.bilibili.com/player.html?bvid=BV1cached55555&page=1',
                    cover: '',
                    publishedAt: '2026-05-01T00:00:00.000Z'
                }
            ]
        }, null, 2)}\n`,
        'utf8'
    );
    await writeFile(overridesPath, '{"mid":"8465957","overrides":[]}\n', 'utf8');

    const result = await loadBilibiliTrailerDataset({
        rootDir,
        cacheRelativePath,
        overridesRelativePath: overrideRelativePath,
        fetchImpl: async () => {
            throw new Error('blocked by captcha');
        }
    });

    assert.equal(result.metadata.status, 'cache');
    assert.equal(result.rows.length, 1);
    assert.equal(result.rows[0].bvid, 'BV1cached55555');
});

test('fetchBilibiliTrailerRows stops early in incremental mode after hitting known cached bvid', async () => {
    const payloads = [
        {
            code: 0,
            data: {
                page: { count: 90 },
                list: {
                    vlist: [
                        { title: '《新片》预告', bvid: 'BV1new888888', created: 1715600000 },
                        { title: '《消失的人》预告片', bvid: 'BV1cached55555', created: 1715500000 }
                    ]
                }
            }
        },
        {
            code: 0,
            data: {
                page: { count: 90 },
                list: {
                    vlist: [
                        { title: '《第二页影片》预告', bvid: 'BV1page29999', created: 1715400000 }
                    ]
                }
            }
        }
    ];
    let callCount = 0;

    const result = await fetchBilibiliTrailerRows({
        existingRows: [
            {
                title: '《消失的人》预告片',
                bvid: 'BV1cached55555',
                url: 'https://www.bilibili.com/video/BV1cached55555',
                embedUrl: 'https://player.bilibili.com/player.html?bvid=BV1cached55555&page=1',
                cover: '',
                publishedAt: '2026-05-01T00:00:00.000Z'
            }
        ],
        fetchImpl: async () => {
            const payload = payloads[callCount];
            callCount += 1;
            return {
                ok: true,
                async text() {
                    return JSON.stringify(payload);
                }
            };
        }
    });

    assert.equal(callCount, 1);
    assert.equal(result.mode, 'incremental');
    assert.equal(result.rows.length, 2);
    assert.equal(result.rows[0].bvid, 'BV1new888888');
});
