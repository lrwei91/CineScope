import test from 'node:test';
import assert from 'node:assert/strict';

import { ingestCategoryData, normalizeTrailerEmbedUrl, normalizeTrailerList } from '../js/modules/data-loader.js';

test('normalizeTrailerList keeps valid trailer payload rows and normalizes field names', () => {
    const trailers = normalizeTrailerList([
        {
            source: 'bilibili',
            title: '《<em class="keyword">测试</em>预告片》',
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
            title: '《测试预告片》',
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

test('ingestCategoryData keeps tv trailers and primaryTrailer for tv_cn items', () => {
    const categoryState = {
        tv_cn: {
            items: [],
            latestLoaded: false,
            completeLoaded: false,
            updateDate: ''
        }
    };

    ingestCategoryData(
        'tv_cn',
        {
            metadata: {
                last_updated: '2026-05-14T12:00:00.000Z'
            },
            shows: [
                {
                    id: 101,
                    name: '长安的荔枝',
                    original_name: '长安的荔枝',
                    genres: [{ name: '剧情' }],
                    networks: [],
                    directors: [],
                    actors: [],
                    countries: ['中国大陆'],
                    languages: ['汉语普通话'],
                    aka: [],
                    overview: '',
                    trailer: null,
                    trailers: [
                        {
                            source: 'bilibili',
                            title: '《长安的荔枝》首支预告',
                            bvid: 'BV1tvnormalize01',
                            url: 'https://www.bilibili.com/video/BV1tvnormalize01',
                            embedUrl: 'https://player.bilibili.com/player.html?bvid=BV1tvnormalize01&page=1'
                        }
                    ],
                    seasons: [
                        {
                            id: 1001,
                            name: '第1季',
                            season_number: 1,
                            air_date: '2026-05-20',
                            douban_link_verified: true,
                            douban_rating: 7.8,
                            douban_link_google: 'https://movie.douban.com/subject/12345678/'
                        }
                    ]
                }
            ]
        },
        'complete',
        categoryState,
        { sync: false }
    );

    assert.equal(categoryState.tv_cn.items.length, 1);
    assert.equal(categoryState.tv_cn.items[0].trailers.length, 1);
    assert.equal(categoryState.tv_cn.items[0].primaryTrailer?.bvid, 'BV1tvnormalize01');
});
