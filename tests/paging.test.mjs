import test from 'node:test';
import assert from 'node:assert/strict';

import { getNextPageRange, getPageEndIndex, getRefreshedPageEndIndex } from '../js/modules/paging.js';

function createItem(date, title) {
    return { date, title };
}

test('getPageEndIndex keeps the trailing month intact when enabled', () => {
    const items = [
        createItem('2026-07-10', '七月 A'),
        createItem('2026-06-20', '六月 A'),
        createItem('2026-05-30', '五月 A'),
        createItem('2026-05-20', '五月 B'),
        createItem('2026-05-10', '五月 C'),
        createItem('2026-04-01', '四月 A')
    ];

    assert.equal(getPageEndIndex(items, 0, 4, { keepMonthIntact: true }), 5);
});

test('getPageEndIndex keeps the base page size when month padding is disabled', () => {
    const items = [
        createItem('2026-07-10', '七月 A'),
        createItem('2026-06-20', '六月 A'),
        createItem('2026-05-30', '五月 A'),
        createItem('2026-05-20', '五月 B'),
        createItem('2026-05-10', '五月 C'),
        createItem('2026-04-01', '四月 A')
    ];

    assert.equal(getPageEndIndex(items, 0, 4, { keepMonthIntact: false }), 4);
});

test('getPageEndIndex does not overflow when the page already reaches the end', () => {
    const items = [
        createItem('2026-05-30', '五月 A'),
        createItem('2026-05-20', '五月 B')
    ];

    assert.equal(getPageEndIndex(items, 0, 18, { keepMonthIntact: true }), 2);
});

test('getNextPageRange starts after the actual rendered end when keeping months intact', () => {
    const items = [
        createItem('2026-07-10', '七月 A'),
        createItem('2026-06-20', '六月 A'),
        createItem('2026-05-30', '五月 A'),
        createItem('2026-05-20', '五月 B'),
        createItem('2026-05-10', '五月 C'),
        createItem('2026-04-01', '四月 A')
    ];

    const firstRange = getNextPageRange(items, 0, 4, { keepMonthIntact: true });
    const secondRange = getNextPageRange(items, firstRange.endIndex, 4, { keepMonthIntact: true });

    assert.deepEqual(firstRange, { startIndex: 0, endIndex: 5 });
    assert.deepEqual(secondRange, { startIndex: 5, endIndex: 6 });
    assert.deepEqual(items.slice(secondRange.startIndex, secondRange.endIndex).map((item) => item.title), ['四月 A']);
});


test('late complete data expands a one-item latest page to a whole first page', () => {
    const items = Array.from({ length: 50 }, (_, i) => createItem(`2026-${String(12 - Math.floor(i / 10)).padStart(2, '0')}-01`, `item ${i}`));
    assert.equal(getRefreshedPageEndIndex(items.slice(0, 1), 1, 18, { keepMonthIntact: true }), 1);
    assert.equal(getRefreshedPageEndIndex(items, 1, 18, { keepMonthIntact: true }), 20);
    assert.equal(getNextPageRange(items, 20, 18, { keepMonthIntact: true }).startIndex, 20);
});

test('background refresh preserves pages already reached and clamps shortened results', () => {
    const items = Array.from({ length: 80 }, (_, i) => createItem('2026-01-01', `item ${i}`));
    assert.equal(getRefreshedPageEndIndex(items, 54, 18), 54);
    assert.equal(getRefreshedPageEndIndex(items.slice(0, 3), 54, 18), 3);
    assert.equal(getRefreshedPageEndIndex([], 1, 18), 0);
});
