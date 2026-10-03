import test from 'node:test';
import assert from 'node:assert/strict';

import { applyFilters } from '../js/modules/filters.js';
import { isDateAfterToday, parseDateStringAsLocalDate } from '../js/modules/date-utils.js';

function createMovie(date, title) {
    return {
        id: `${title}-${date}`,
        title,
        subtitle: '',
        date,
        genres: [],
        networks: [],
        doubanRating: null
    };
}

test('parseDateStringAsLocalDate keeps YYYY-MM-DD on the same local calendar day', () => {
    const date = parseDateStringAsLocalDate('2026-05-01');

    assert.equal(date.getFullYear(), 2026);
    assert.equal(date.getMonth(), 4);
    assert.equal(date.getDate(), 1);
    assert.equal(date.getHours(), 0);
});

test('isDateAfterToday treats the current day as already released', () => {
    const today = new Date(2026, 4, 1, 12, 0, 0);

    assert.equal(isDateAfterToday('2026-05-01', today), false);
    assert.equal(isDateAfterToday('2026-05-02', today), true);
});

test('applyFilters keeps future, same-day and past releases in one date-sorted catalog', () => {
    const items = [
        createMovie('2026-05-02', '明天上映'),
        createMovie('2026-05-01', '今天上映'),
        createMovie('2026-04-30', '昨天上映')
    ];

    const realDate = Date;
    class MockDate extends Date {
        constructor(...args) {
            if (args.length === 0) {
                super(2026, 4, 1, 12, 0, 0);
                return;
            }
            super(...args);
        }

        static now() {
            return new realDate(2026, 4, 1, 12, 0, 0).getTime();
        }
    }

    global.Date = MockDate;

    try {
        const result = applyFilters(
            items,
            {
                searchQuery: '',
                specialFilterMode: null,
                selectedRating: '全部',
                selectedGenres: [],
                selectedNetworks: []
            },
            'tv_cn'
        );

        assert.deepEqual(
            result.filteredPastAndPresentItems.map((item) => item.title),
            ['明天上映', '今天上映', '昨天上映']
        );
    } finally {
        global.Date = realDate;
    }
});

test('all categories retain future releases and apply ordinary rating and genre filters', () => {
    const future = { ...createMovie('2099-05-02', '未来电影'), genres: ['剧情'], doubanRating: 8.5 };
    const past = { ...createMovie('2020-05-01', '已上映'), genres: ['喜剧'], doubanRating: 7 };
    for (const category of ['tv_cn', 'movie_cn', 'tv_cn_variety', 'tv_kr', 'tv_jp', 'tv_us', 'douban_top250']) {
        const filters = { searchQuery: '', specialFilterMode: null, selectedRating: '全部', selectedGenres: [] };
        assert.deepEqual(applyFilters([past, future], filters, category).filteredPastAndPresentItems, [future, past]);
        assert.deepEqual(applyFilters([past, future], { ...filters, selectedGenres: ['剧情'] }, category).filteredPastAndPresentItems, [future]);
        assert.deepEqual(applyFilters([past, future], { ...filters, searchQuery: '未来' }, category).filteredPastAndPresentItems, [future]);
        assert.deepEqual(applyFilters([past, future], { ...filters, selectedRating: '> 8 分' }, category).filteredPastAndPresentItems, [future]);
    }
});
