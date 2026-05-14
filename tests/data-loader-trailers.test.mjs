import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeTrailerEmbedUrl, normalizeTrailerList } from '../js/modules/data-loader.js';

test('normalizeTrailerList keeps valid trailer payload rows and normalizes field names', () => {
    const trailers = normalizeTrailerList([
        {
            source: 'bilibili',
            title: '测试预告片',
            bvid: 'BV1normalize7777',
            url: 'https://www.bilibili.com/video/BV1normalize7777',
            embed_url: 'https://player.bilibili.com/player.html?bvid=BV1normalize7777&page=1',
            cover: 'https://i0.hdslb.com/test.jpg',
            published_at: '2026-05-14T00:00:00.000Z'
        },
        {
            title: '',
            bvid: ''
        }
    ]);

    assert.deepEqual(trailers, [
        {
            source: 'bilibili',
            title: '测试预告片',
            bvid: 'BV1normalize7777',
            url: 'https://www.bilibili.com/video/BV1normalize7777',
            embedUrl: 'https://player.bilibili.com/player.html?bvid=BV1normalize7777&page=1&qn=64&high_quality=1',
            cover: 'https://i0.hdslb.com/test.jpg',
            publishedAt: '2026-05-14T00:00:00.000Z'
        }
    ]);
});

test('normalizeTrailerEmbedUrl upgrades Bilibili iframe URLs to best-effort 720p defaults', () => {
    assert.equal(
        normalizeTrailerEmbedUrl('https://player.bilibili.com/player.html?bvid=BV1normalize7777&page=1', 'BV1normalize7777'),
        'https://player.bilibili.com/player.html?bvid=BV1normalize7777&page=1&qn=64&high_quality=1'
    );
});
