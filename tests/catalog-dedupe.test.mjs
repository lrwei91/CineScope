import test from 'node:test';
import assert from 'node:assert/strict';

import { dedupeCatalogByStableId } from '../scripts/lib/catalog-dedupe.mjs';

test('dedupeCatalogByStableId keeps the richer row and merges aliases and trailers', () => {
    const rows = dedupeCatalogByStableId('movie', [
        {
            id: 1,
            title: '旧标题',
            aka: ['别名'],
            networks: [{ id: 10, name: '平台' }],
            trailers: [{ bvid: 'BV1', title: 'A' }]
        },
        {
            id: 1,
            title: '正式标题',
            original_title: 'Original',
            douban_link_google: 'https://movie.douban.com/subject/1/',
            douban_rating: '8.0',
            networks: [{ id: 10, name: '平台' }],
            trailers: [{ bvid: 'BV2', title: 'B' }]
        }
    ]);

    assert.equal(rows.length, 1);
    assert.equal(rows[0].title, '正式标题');
    assert.deepEqual(rows[0].trailers.map((trailer) => trailer.bvid), ['BV2', 'BV1']);
    assert.ok(rows[0].aka.includes('旧标题'));
    assert.ok(rows[0].aka.includes('别名'));
    assert.equal(rows[0].networks.length, 1);
});
