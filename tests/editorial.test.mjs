import test from 'node:test';
import assert from 'node:assert/strict';

import {
    buildYearGroups,
    findReferencedItem,
    getTopGenreStats,
    selectFeaturedItems
} from '../js/modules/editorial.js';

function item(id, overrides = {}) {
    return {
        id,
        kind: 'movie',
        categoryId: 'movie_cn',
        title: `作品 ${id}`,
        date: '2026-01-01',
        posterPath: `posters/${id}.jpg`,
        genres: ['剧情'],
        doubanRating: null,
        doubanVerified: false,
        ...overrides
    };
}

test('featured selection handles fewer than four items and skips missing posters', () => {
    const result = selectFeaturedItems({
        futureItems: [
            item(1, { date: '2026-09-02' }),
            item(2, { date: '2026-08-01', posterPath: null })
        ],
        currentItems: [item(3)],
        limit: 4
    });

    assert.deepEqual(result.map((entry) => entry.id), [1, 3]);
});

test('featured selection removes duplicates and fills by verified rating then date', () => {
    const duplicate = item(1, { date: '2026-08-01' });
    const result = selectFeaturedItems({
        futureItems: [duplicate],
        currentItems: [
            duplicate,
            item(2, { date: '2025-01-01', doubanRating: '9.1', doubanVerified: true }),
            item(3, { date: '2026-06-01', doubanRating: '8.3', doubanVerified: true }),
            item(4, { date: '2026-07-01', doubanRating: '9.8', doubanVerified: false })
        ],
        limit: 4
    });

    assert.deepEqual(result.map((entry) => entry.id), [1, 2, 3, 4]);
});

test('featured selection remains deterministic when ratings are absent', () => {
    const result = selectFeaturedItems({
        currentItems: [
            item(1, { date: '2024-01-01' }),
            item(2, { date: '2026-01-01' })
        ],
        limit: 4
    });

    assert.deepEqual(result.map((entry) => entry.id), [2, 1]);
});

test('year groups count all unique works and omit missing posters from previews', () => {
    const result = buildYearGroups({
        years: ['LOCK_ON', '2026', '2025'],
        futureItems: [item(1), item(1)],
        items: [
            item(2, { date: '2026-04-02' }),
            item(3, { date: '2026-02-01', posterPath: '' }),
            item(4, { date: '2025-12-12' })
        ],
        futureTag: 'LOCK_ON',
        previewLimit: 4
    });

    assert.deepEqual(result.map(({ year, count }) => [year, count]), [
        ['LOCK_ON', 1],
        ['2026', 2],
        ['2025', 1]
    ]);
    assert.deepEqual(result[1].previews.map((entry) => entry.id), ['2']);
});

test('year groups and genre stats handle an empty category', () => {
    assert.deepEqual(buildYearGroups(), []);
    assert.deepEqual(getTopGenreStats([], { limit: 8 }), []);
});

test('genre stats keep configured priority and actual counts', () => {
    const result = getTopGenreStats([
        item(1, { genres: ['剧情', '科幻'] }),
        item(2, { genres: ['科幻'] }),
        item(3, { genres: ['喜剧'] })
    ], {
        priority: ['科幻', '喜剧', '剧情'],
        limit: 2
    });

    assert.deepEqual(result, [
        { name: '科幻', value: '科幻', count: 2 },
        { name: '喜剧', value: '喜剧', count: 1 }
    ]);
});

test('editorial references resolve by stable string ids', () => {
    const items = [item(1889243)];
    assert.equal(findReferencedItem(items, '1889243'), items[0]);
    assert.equal(findReferencedItem(items, 'missing'), null);
});
