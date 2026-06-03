import test from 'node:test';
import assert from 'node:assert/strict';

import { selectLatestItems } from '../scripts/generate_douban_catalog.mjs';

function createTvItem(date, name) {
    return {
        id: `${name}-${date}`,
        name,
        first_air_date: date
    };
}

test('selectLatestItems returns all current-quarter items for quarter-based latest specs', () => {
    const items = [
        createTvItem('2026-06-20', '六月剧'),
        createTvItem('2026-05-10', '五月剧'),
        createTvItem('2026-04-01', '四月剧'),
        createTvItem('2026-03-31', '三月剧'),
        createTvItem('2026-02-01', '二月剧')
    ];

    const selected = selectLatestItems(
        {
            id: 'tv_cn',
            kind: 'tv',
            latestCount: 18,
            latestSelectionMode: 'current_quarter_all'
        },
        items,
        new Date('2026-05-09T12:00:00+08:00')
    );

    assert.deepEqual(
        selected.map((item) => item.name),
        ['六月剧', '五月剧', '四月剧']
    );
});

test('selectLatestItems falls back to latestCount when quarter has no items', () => {
    const items = [
        createTvItem('2026-03-31', '三月剧'),
        createTvItem('2026-02-01', '二月剧'),
        createTvItem('2026-01-01', '一月剧')
    ];

    const selected = selectLatestItems(
        {
            id: 'tv_jp',
            kind: 'tv',
            latestCount: 2,
            latestSelectionMode: 'current_quarter_all'
        },
        items,
        new Date('2026-05-09T12:00:00+08:00')
    );

    assert.deepEqual(
        selected.map((item) => item.name),
        ['三月剧', '二月剧']
    );
});

test('selectLatestItems keeps latestWindowDays behavior for window-based latest specs', () => {
    const items = [
        createTvItem('2026-07-01', '七月剧'),
        createTvItem('2026-06-15', '六月剧'),
        createTvItem('2026-05-20', '五月剧'),
        createTvItem('2026-02-01', '二月剧')
    ];

    const selected = selectLatestItems(
        {
            id: 'tv_jp',
            kind: 'tv',
            latestCount: 3,
            latestWindowDays: 60
        },
        items,
        new Date('2026-05-09T12:00:00+08:00')
    );

    assert.deepEqual(
        selected.map((item) => item.name),
        ['七月剧', '六月剧', '五月剧']
    );
});
