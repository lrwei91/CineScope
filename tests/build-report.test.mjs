import test from 'node:test';
import assert from 'node:assert/strict';

import {
    createBuildReport,
    finalizeBuildReport,
    mergeCategoryReport
} from '../scripts/lib/build-report.mjs';

const specs = [
    { id: 'tv_cn' },
    { id: 'movie_cn' }
];

test('partial build report preserves unrelated categories and component status', () => {
    const previous = {
        metadata: { mode: 'full', started_at: '2026-07-01T00:00:00.000Z', category_ids: ['tv_cn', 'tv_us'] },
        completed_at: '2026-07-01T00:05:00.000Z',
        categories: [
            { id: 'tv_cn', quality: { total_items: 10 } },
            { id: 'tv_us', quality: { total_items: 20 } }
        ],
        douban_statuses: { status: 'ok', total_items: 3 },
        douban_top250: { status: 'ok', total_items: 250 }
    };

    const report = createBuildReport({
        activeCategorySpecs: [specs[0]],
        isPartial: true,
        tmdbEnabled: false,
        doubanSubjectCacheTtlDays: 14,
        doubanSearchCacheTtlDays: 30,
        doubanSearchQueryLimit: 1,
        previousReport: previous,
        taskName: 'trailers',
        now: new Date('2026-07-02T00:00:00.000Z')
    });

    mergeCategoryReport(report, { id: 'tv_cn', quality: { total_items: 11 } });
    finalizeBuildReport(report, { now: new Date('2026-07-02T00:01:00.000Z') });

    assert.equal(report.schema_version, 2);
    assert.deepEqual(report.categories.map((entry) => entry.id), ['tv_cn', 'tv_us']);
    assert.equal(report.categories.find((entry) => entry.id === 'tv_us').quality.total_items, 20);
    assert.equal(report.douban_statuses.total_items, 3);
    assert.equal(report.douban_top250.total_items, 250);
    assert.equal(report.latest_run.task, 'trailers');
    assert.equal(report.task_statuses.trailers.status, 'success');
    assert.equal(report.last_full_build.completed_at, '2026-07-01T00:05:00.000Z');
});

test('full build resets category reports and updates last full build', () => {
    const report = createBuildReport({
        activeCategorySpecs: specs,
        isPartial: false,
        tmdbEnabled: true,
        doubanSubjectCacheTtlDays: 14,
        doubanSearchCacheTtlDays: 30,
        doubanSearchQueryLimit: 1,
        previousReport: { categories: [{ id: 'stale' }] },
        taskName: 'full',
        now: new Date('2026-07-03T00:00:00.000Z')
    });

    assert.deepEqual(report.categories, []);
    finalizeBuildReport(report, { now: new Date('2026-07-03T00:02:00.000Z') });
    assert.deepEqual(report.last_full_build.category_ids, ['tv_cn', 'movie_cn']);
    assert.equal(report.last_full_build.completed_at, '2026-07-03T00:02:00.000Z');
});
