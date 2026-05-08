import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveTvPosterStatusLabel } from '../js/modules/data-loader.js';

test('shows vertical status ribbon for updating Chinese drama payloads', () => {
    assert.equal(
        resolveTvPosterStatusLabel({
            status: '更新至22集',
            in_production: true
        }, new Date('2026-05-08')),
        '连载中'
    );
});

test('shows vertical status ribbon for returning series payloads', () => {
    assert.equal(
        resolveTvPosterStatusLabel({
            status: 'Returning Series',
            in_production: false
        }, new Date('2026-05-08')),
        '连载中'
    );
});

test('does not show vertical status ribbon for completed payloads', () => {
    assert.equal(
        resolveTvPosterStatusLabel({
            status: '24集全',
            in_production: false
        }, new Date('2026-05-08')),
        null
    );
});

test('does not show vertical status ribbon for stale update statuses that already aired out', () => {
    assert.equal(
        resolveTvPosterStatusLabel({
            status: '更新至25集',
            episodes_info: '更新至25集',
            in_production: true,
            number_of_episodes: 25,
            last_air_date: '2026-02-21'
        }, new Date('2026-05-08')),
        null
    );
});

test('does not show vertical status ribbon for explicit ended status even if episodes_info still says update', () => {
    assert.equal(
        resolveTvPosterStatusLabel({
            status: 'Ended',
            episodes_info: '更新至35集',
            in_production: false,
            number_of_episodes: 40,
            last_air_date: '2026-04-15'
        }, new Date('2026-05-08')),
        null
    );
});

test('does not show vertical status ribbon for stale returning series seasons', () => {
    assert.equal(
        resolveTvPosterStatusLabel({
            status: 'Returning Series',
            episodes_info: 'Returning Series',
            in_production: true,
            number_of_episodes: 12,
            last_air_date: '2026-03-28'
        }, new Date('2026-05-08')),
        null
    );
});
