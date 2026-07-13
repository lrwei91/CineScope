import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { validateData } from '../scripts/validate-data.mjs';

const categoryIds = ['tv_cn', 'movie_cn', 'tv_cn_variety', 'tv_kr', 'tv_jp', 'tv_us'];

async function writeJson(rootDir, relativePath, payload) {
    const targetPath = path.join(rootDir, relativePath);
    await mkdir(path.dirname(targetPath), { recursive: true });
    await writeFile(targetPath, `${JSON.stringify(payload)}\n`, 'utf8');
}

async function createFixture() {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), 'cinescope-validation-'));
    for (const id of categoryIds) {
        const key = id === 'movie_cn' ? 'movies' : 'shows';
        const item = id === 'movie_cn'
            ? { id: 1, title: 'Movie', release_date: '2026-01-01' }
            : { id: 1, name: 'Show', first_air_date: '2026-01-01', seasons: [{}] };
        await writeJson(rootDir, `json/${id}_latest.json`, { [key]: [item] });
        await writeJson(rootDir, `json/${id}_complete.json`, { [key]: [item] });
    }
    await writeJson(rootDir, 'json/douban_top250.json', { movies: [{ id: 1 }] });
    await writeJson(rootDir, 'json/douban_statuses.json', { statuses: {}, metadata: {} });
    await writeJson(rootDir, 'json/maoyan_box_office.json', { movies: [], metadata: {} });
    await writeJson(rootDir, 'json/maoyan_tv_heat.json', { series: [], metadata: {} });
    await writeJson(rootDir, 'json/build_report.json', {
        schema_version: 2,
        latest_run: {},
        task_statuses: {},
        categories: categoryIds.map((id) => ({
            id,
            counts: { latest: 1, complete: 1 },
            quality: { total_items: 1 }
        }))
    });
    return rootDir;
}

test('data validator accepts a structurally valid fixture', async () => {
    const rootDir = await createFixture();
    const result = await validateData({ rootDir, baselineRef: null });
    assert.deepEqual(result.errors, []);
});

test('data validator rejects duplicate ids and latest items missing from complete', async () => {
    const rootDir = await createFixture();
    await writeJson(rootDir, 'json/tv_cn_latest.json', {
        shows: [
            { id: 2, name: 'Missing', first_air_date: '2026-01-01', seasons: [{}] },
            { id: 2, name: 'Duplicate', first_air_date: '2026-01-01', seasons: [{}] }
        ]
    });
    const result = await validateData({ rootDir, baselineRef: null });
    assert.ok(result.errors.some((message) => message.includes('duplicate id 2')));
    assert.ok(result.errors.some((message) => message.includes('latest id 2 is missing from complete')));
});

test('data validator rejects missing local posters and invalid verified Douban links, and warns on distant dates', async () => {
    const rootDir = await createFixture();
    await writeJson(rootDir, 'json/movie_cn_complete.json', {
        movies: [{
            id: 1,
            title: 'Bad Movie',
            release_date: '2030-01-01',
            poster_path: 'posters/douban/movie_cn/missing.jpg',
            douban_link_google: 'https://example.com/not-a-douban-subject',
            douban_link_verified: true
        }]
    });

    const result = await validateData({ rootDir, baselineRef: null, now: '2026-07-13T00:00:00Z' });
    assert.ok(result.errors.some((message) => message.includes('missing local poster')));
    assert.ok(result.errors.some((message) => message.includes('verified Douban link is invalid')));
    assert.ok(result.warnings.some((message) => message.includes('unusually distant release date')));
});
