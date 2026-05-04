import test from 'node:test';
import assert from 'node:assert/strict';

import { buildMovieReleaseWindows } from '../scripts/lib/release-windows.mjs';

test('buildMovieReleaseWindows marks fixed Chinese movie seasons', () => {
    assert.deepEqual(buildMovieReleaseWindows('2026-02-17'), [{ id: 'spring_festival', label: '春节档' }]);
    assert.deepEqual(buildMovieReleaseWindows('2026-05-01'), [{ id: 'may_day', label: '五一档' }]);
    assert.deepEqual(buildMovieReleaseWindows('2026-10-03'), [{ id: 'national_day', label: '国庆档' }]);
});

test('buildMovieReleaseWindows marks summer and normal weekends', () => {
    assert.deepEqual(buildMovieReleaseWindows('2026-07-10'), [{ id: 'summer', label: '暑期档' }]);
    assert.deepEqual(buildMovieReleaseWindows('2026-03-07'), [{ id: 'weekend', label: '周末档' }]);
});

test('buildMovieReleaseWindows ignores weekdays outside configured windows', () => {
    assert.deepEqual(buildMovieReleaseWindows('2026-03-09'), []);
    assert.deepEqual(buildMovieReleaseWindows('not-a-date'), []);
});
