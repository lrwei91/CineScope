import test from 'node:test';
import assert from 'node:assert/strict';

import {
    createBoxOfficePayload,
    mergeBoxOfficeIntoMovies,
    normalizeBoxOfficeRows,
    normalizeBoxOfficeTitle
} from '../scripts/lib/box-office.mjs';

test('normalizeBoxOfficeTitle removes punctuation used in Chinese movie titles', () => {
    assert.equal(normalizeBoxOfficeTitle('三国第一部：争洛阳'), '三国第一部争洛阳');
    assert.equal(normalizeBoxOfficeTitle('熊出没·重启未来'), '熊出没重启未来');
});

test('normalizeBoxOfficeRows keeps Maoyan ranking and core display metrics', () => {
    const rows = normalizeBoxOfficeRows(
        [
            {
                top: 1,
                movieId: 1294273,
                movieName: '哪吒之魔童闹海',
                releaseInfo: '上映25天',
                box_office_desc: '536.55万',
                avgSeatView: '15.5%',
                avgShowView: '22.7',
                boxRate: '90.2%',
                showCount: 234524,
                showCountRate: '57.1%',
                splitBoxRate: '90.2%',
                sumBoxDesc: '129.48亿',
                sumSplitBoxDesc: '116.92亿'
            }
        ],
        '2026-05-05T00:00:00.000Z'
    );

    assert.deepEqual(rows[0], {
        source: 'maoyan',
        updated_at: '2026-05-05T00:00:00.000Z',
        rank: 1,
        maoyan_movie_id: 1294273,
        movie_name: '哪吒之魔童闹海',
        release_info: '上映25天',
        real_time_box_office: '536.55万',
        cumulative_box_office: '129.48亿',
        split_cumulative_box_office: '116.92亿',
        box_office_rate: '90.2%',
        split_box_office_rate: '90.2%',
        show_count: 234524,
        show_count_rate: '57.1%',
        seat_occupancy: '15.5%',
        avg_show_view: '22.7',
        title_key: '哪吒之魔童闹海'
    });
});

test('mergeBoxOfficeIntoMovies matches by title and aliases', () => {
    const movies = [
        {
            id: 1,
            title: '封神第二部',
            original_title: '封神第二部',
            aka: ['封神第二部：战火西岐']
        }
    ];
    const boxOfficeRows = normalizeBoxOfficeRows([
        {
            rank: 8,
            movie_id: 1245203,
            movie_name: '封神第二部：战火西岐',
            sum_box_desc: '11.75亿',
            box_office_rate: '0.4%',
            show_count_rate: '3.1%'
        }
    ]);

    const mergedMovies = mergeBoxOfficeIntoMovies(movies, boxOfficeRows);

    assert.equal(mergedMovies[0].box_office.rank, 8);
    assert.equal(mergedMovies[0].box_office.cumulative_box_office, '11.75亿');
    assert.equal(mergedMovies[0].box_office.title_key, undefined);
});

test('createBoxOfficePayload strips internal title keys from persisted rows', () => {
    const payload = createBoxOfficePayload(
        [
            {
                top: 1,
                movie_id: 1294273,
                movie_name: '哪吒之魔童闹海',
                sum_box_desc: '129.48亿'
            }
        ],
        { updatedAt: '2026-05-05T00:00:00.000Z' }
    );

    assert.equal(payload.metadata.total_items, 1);
    assert.equal(payload.movies[0].title_key, undefined);
    assert.equal(payload.movies[0].cumulative_box_office, '129.48亿');
});
