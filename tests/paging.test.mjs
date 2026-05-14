import test from 'node:test';
import assert from 'node:assert/strict';

import { getPageEndIndex } from '../js/modules/paging.js';

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
