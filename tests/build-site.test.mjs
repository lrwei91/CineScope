import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { CATEGORY_CONFIG, DOUBAN_STATUS_URL } from '../js/modules/config.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataPaths = [...new Set([
    DOUBAN_STATUS_URL, 'json/build_report.json',
    ...Object.values(CATEGORY_CONFIG).flatMap((category) =>
        [category.latestUrl, category.completeUrl, category.boxOfficeUrl, category.tvHeatUrl].filter(Boolean))
])];

async function fixture(t) {
    const root = await mkdtemp(path.join(os.tmpdir(), 'cinescope-build-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    for (const directory of ['scripts', 'js/modules', 'assets', 'json', 'posters/douban/test']) {
        await mkdir(path.join(root, directory), { recursive: true });
    }
    await cp(path.join(ROOT, 'scripts/build-site.mjs'), path.join(root, 'scripts/build-site.mjs'));
    await cp(path.join(ROOT, 'js/modules/config.js'), path.join(root, 'js/modules/config.js'));
    await writeFile(path.join(root, 'package.json'), '{"type":"module"}');
    for (const file of ['index.html', 'app.js', 'share.js', 'style.css', 'share.css', 'favicon.svg', 'favicon.png', 'manifest.webmanifest']) {
        await writeFile(path.join(root, file), 'fixture');
    }
    for (const file of dataPaths) await writeFile(path.join(root, file), '{}');
    return root;
}

function build(root) {
    return spawnSync(process.execPath, ['scripts/build-site.mjs'], {
        cwd: root, encoding: 'utf8', env: { ...process.env, SITE_OUTPUT_DIR: '.site' }
    });
}

test('静态发布保留标准 JSON 和嵌套引用海报，排除副本及未引用海报', async (t) => {
    const root = await fixture(t);
    const payload = { movies: [{ poster_path: 'posters/douban/test/used.jpg', seasons: [
        { poster_path: '/posters/douban/test/season.jpg' },
        { poster_path: 'https://example.com/remote.jpg' }
    ] }] };
    await writeFile(path.join(root, 'json/movie_cn_complete.json'), JSON.stringify(payload, null, 2));
    await writeFile(path.join(root, 'json/movie_cn_complete 2.json'), 'invalid backup');
    for (const name of ['used.jpg', 'season.jpg', 'orphan.jpg']) {
        await writeFile(path.join(root, 'posters/douban/test', name), name);
    }
    await mkdir(path.join(root, '.site'), { recursive: true });
    await writeFile(path.join(root, '.site/previous-release.txt'), 'old');
    const result = build(root);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual((await readdir(path.join(root, '.site/json'))).sort(), dataPaths.map((p) => path.basename(p)).sort());
    assert.deepEqual((await readdir(path.join(root, '.site/posters/douban/test'))).sort(), ['season.jpg', 'used.jpg']);
    assert.equal(await readFile(path.join(root, '.site/json/movie_cn_complete.json'), 'utf8'), JSON.stringify(payload));
    assert.ok(!(await readdir(path.join(root, '.site'))).includes('previous-release.txt'));
    assert.ok((await readdir(path.join(root, 'posters/douban/test'))).includes('orphan.jpg'), '不删除源海报');
});

test('缺失片单引用的本地海报时构建失败，阻止发布缺图站点', async (t) => {
    const root = await fixture(t);
    await writeFile(path.join(root, 'json/movie_cn_complete.json'), JSON.stringify({ poster_path: 'posters/missing.jpg' }));
    const result = build(root);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /missing\.jpg/);
});
