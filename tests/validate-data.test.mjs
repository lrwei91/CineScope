import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, mkdir, writeFile } from 'node:fs/promises';
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
    await mkdir(path.join(rootDir, 'assets'), { recursive: true });
    await writeFile(path.join(rootDir, 'assets/hero.webp'), 'fixture', 'utf8');
    await writeJson(rootDir, 'content/editorial.json', {
        metadata: {
            schemaVersion: 1,
            updatedAt: '2026-07-13',
            title: 'Fixture'
        },
        hero: {
            eyebrow: 'CineScope',
            title: '光影',
            accent: '片单',
            description: 'Fixture description',
            ctaLabel: 'Explore',
            image: 'assets/hero.webp'
        },
        news: [],
        reviews: [],
        about: {
            title: '关于本站',
            description: 'Fixture description',
            repositoryUrl: 'https://example.com/repository',
            feedbackUrl: 'https://example.com/issues'
        },
        subscription: {
            enabled: false,
            formAction: '',
            disabledMessage: '订阅暂未开放'
        }
    });
    return rootDir;
}

test('data validator accepts a structurally valid fixture', async () => {
    const rootDir = await createFixture();
    const result = await validateData({ rootDir, baselineRef: null });
    assert.deepEqual(result.errors, []);
});

test('data validator combines staged JSON with project editorial assets', async () => {
    const projectRoot = await createFixture();
    const stagedRoot = await mkdtemp(path.join(os.tmpdir(), 'cinescope-staged-validation-'));
    await cp(path.join(projectRoot, 'json'), path.join(stagedRoot, 'json'), { recursive: true });

    const result = await validateData({
        rootDir: stagedRoot,
        posterRoot: projectRoot,
        baselineRef: null
    });
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

test('data validator rejects invalid editorial dates, duplicate ids, unsafe subscription endpoints and missing references', async () => {
    const rootDir = await createFixture();
    await writeJson(rootDir, 'content/editorial.json', {
        metadata: {
            schemaVersion: 1,
            updatedAt: '2026-02-30',
            title: 'Fixture'
        },
        hero: {
            eyebrow: 'CineScope',
            title: '光影',
            accent: '片单',
            description: 'Fixture description',
            ctaLabel: 'Explore',
            image: 'assets/hero.webp'
        },
        news: [{
            id: 'duplicate',
            label: '影讯',
            title: '不存在的条目',
            summary: 'Fixture',
            publishedAt: '2026-07-13',
            categoryId: 'movie_cn',
            itemId: '404',
            image: 'posters/missing.jpg'
        }],
        reviews: [{
            id: 'duplicate',
            label: '片单札记',
            title: '重复条目',
            summary: 'Fixture',
            publishedAt: 'not-a-date',
            byline: 'CineScope 编辑部',
            categoryId: 'unknown',
            itemId: '1',
            image: 'assets/hero.webp'
        }],
        about: {
            title: '关于本站',
            description: 'Fixture description',
            repositoryUrl: 'https://example.com/repository',
            feedbackUrl: 'https://example.com/issues'
        },
        subscription: {
            enabled: true,
            formAction: 'http://example.com/form',
            disabledMessage: ''
        }
    });

    const result = await validateData({ rootDir, baselineRef: null });
    assert.ok(result.errors.some((message) => message.includes('metadata.updatedAt')));
    assert.ok(result.errors.some((message) => message.includes('duplicate editorial id duplicate')));
    assert.ok(result.errors.some((message) => message.includes('subscription.formAction must use HTTPS')));
    assert.ok(result.errors.some((message) => message.includes('references missing item 404')));
    assert.ok(result.errors.some((message) => message.includes('references unknown category unknown')));
    assert.ok(result.errors.some((message) => message.includes('missing news.duplicate.image asset')));
});
