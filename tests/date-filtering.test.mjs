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

test('applyFilters moves same-day releases out of coming soon', () => {
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
            'movie_cn'
        );

        assert.deepEqual(
            result.futureItems.map((item) => item.title),
            ['明天上映']
        );
        assert.deepEqual(
            result.filteredPastAndPresentItems.map((item) => item.title),
            ['今天上映', '昨天上映']
        );
    } finally {
        global.Date = realDate;
    }
});
