import test from 'node:test';
import assert from 'node:assert/strict';
import { applyFilters } from '../js/modules/filters.js';
import { sameCatalogItems } from '../js/modules/catalog-view.js';
import { attachDoubanStatus, getDoubanStatuses } from '../js/modules/douban-sync.js';

const filters = { searchQuery: '', selectedRating: '全部', selectedGenres: [], specialFilterMode: null };
const movie = (overrides = {}) => ({ title: '作品', subtitle: '', date: '2020-01-01', genres: [], doubanRating: 8, ...overrides });

test('collection sync preserves unchanged items and updates status without mutating input', () => {
    const item = movie({ doubanSubjectId: '123', doubanCollectionStatus: null });
    assert.equal(attachDoubanStatus(item), item);
    const statuses = getDoubanStatuses();
    try {
        statuses['123'] = { status: 'watched' };
        const updated = attachDoubanStatus(item);
        assert.notEqual(updated, item);
        assert.equal(updated.doubanCollectionStatus, 'watched');
        assert.equal(item.doubanCollectionStatus, null);
        assert.equal(attachDoubanStatus(updated), updated);
        delete statuses['123'];
        assert.equal(attachDoubanStatus(updated).doubanCollectionStatus, null);
    } finally {
        delete statuses['123'];
    }
});

test('search includes aliases and synopsis, with case and whitespace normalization', () => {
    const items = [movie({ aka: ['Alternate Title'] }), movie({ title: '另一部', overview: '侦探寻找失踪线索' })];
    assert.deepEqual(applyFilters(items, { ...filters, searchQuery: ' ALTERNATE ' }, 'movie_cn').filteredPastAndPresentItems, [items[0]]);
    assert.deepEqual(applyFilters(items, { ...filters, searchQuery: '失踪' }, 'movie_cn').filteredPastAndPresentItems, [items[1]]);
});

test('combined filters retain ordering and exclude unrated animation without mutating input', () => {
    const items = [movie({ doubanRating: 7 }), movie({ genres: ['动画'], doubanRating: null }), movie({ doubanRating: 9 }), movie({ date: '2019-01-01', doubanRating: 10 })];
    const snapshot = structuredClone(items);
    assert.deepEqual(applyFilters(items, filters, 'movie_cn').filteredPastAndPresentItems, [items[2], items[0], items[3]]);
    assert.deepEqual(applyFilters(items, { ...filters, selectedRating: '> 8 分' }, 'movie_cn').filteredPastAndPresentItems, [items[2], items[3]]);
    assert.deepEqual(applyFilters(items, { ...filters, selectedGenres: ['动画'] }, 'movie_cn').filteredPastAndPresentItems, []);
    assert.deepEqual(items, snapshot);
});

test('recent high score excludes invalid dates and preserves rating-first order', () => {
    const today = new Date();
    const date = `${today.getFullYear()}-01-01`;
    const items = [movie({ date, doubanRating: 8 }), movie({ date, doubanRating: 9 }), movie({ date: 'invalid', doubanRating: 10 })];
    const result = applyFilters(items, { ...filters, specialFilterMode: 'recent_high_score' }, 'movie_cn');
    assert.deepEqual(result.futureItems, []);
    assert.deepEqual(result.filteredPastAndPresentItems, [items[1], items[0]]);
});

test('visible catalog comparison detects order, metadata, collection and trailer changes', () => {
    const items = [movie(), movie({ title: '第二部' })];
    assert.equal(sameCatalogItems(items, structuredClone(items)), true);
    assert.equal(sameCatalogItems(items, [...items].reverse()), false);
    assert.equal(sameCatalogItems(items, items.slice(0, 1)), false);
    for (const change of [{ doubanCollectionStatus: 'collect' }, { overview: '更新简介' }, { trailers: [{ bvid: 'BV1' }] }]) {
        assert.equal(sameCatalogItems(items, [{ ...items[0], ...change }, items[1]]), false);
    }
});
