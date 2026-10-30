#!/usr/bin/env node

import { cp, mkdir, rm, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CATEGORY_CONFIG, DOUBAN_STATUS_URL } from '../js/modules/config.js';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT_DIR = path.resolve(ROOT_DIR, process.env.SITE_OUTPUT_DIR || '.site');
const PUBLIC_PATHS = [
    'index.html',
    'app.js',
    'share.js',
    'style.css',
    'share.css',
    'favicon.svg',
    'favicon.png',
    'manifest.webmanifest',
    'assets',
    'js'
];
// 与浏览入口共用数据清单，避免把本地副本、备份和旧分类打包上线。
const DATA_PATHS = [...new Set([
    DOUBAN_STATUS_URL,
    'json/build_report.json',
    ...Object.values(CATEGORY_CONFIG).flatMap((category) =>
        [category.latestUrl, category.completeUrl, category.boxOfficeUrl, category.tvHeatUrl].filter(Boolean))
])];

if (OUTPUT_DIR === ROOT_DIR || !OUTPUT_DIR.startsWith(`${ROOT_DIR}${path.sep}`)) {
    throw new Error(`SITE_OUTPUT_DIR must be inside the project: ${OUTPUT_DIR}`);
}

await rm(OUTPUT_DIR, { recursive: true, force: true });
await mkdir(OUTPUT_DIR, { recursive: true });

for (const relativePath of PUBLIC_PATHS) {
    await cp(path.join(ROOT_DIR, relativePath), path.join(OUTPUT_DIR, relativePath), {
        recursive: true,
        force: true
    });
}

const posters = new Set();
function collectPosters(value) {
    if (Array.isArray(value)) {
        value.forEach(collectPosters);
    } else if (value && typeof value === 'object') {
        Object.values(value).forEach(collectPosters);
    } else if (typeof value === 'string' && /^\/?posters\//.test(value)) {
        const relativePath = value.replace(/^\//, '');
        const absolutePath = path.resolve(ROOT_DIR, relativePath);
        if (!absolutePath.startsWith(`${path.join(ROOT_DIR, 'posters')}${path.sep}`)) {
            throw new Error(`Poster path escapes posters/: ${value}`);
        }
        posters.add(path.relative(ROOT_DIR, absolutePath));
    }
}

// 仅压缩发布副本，不改源数据；只复制当前数据中实际引用的本地海报。
await mkdir(path.join(OUTPUT_DIR, 'json'), { recursive: true });
for (const relativePath of DATA_PATHS) {
    const payload = JSON.parse(await readFile(path.join(ROOT_DIR, relativePath), 'utf8'));
    collectPosters(payload);
    await writeFile(path.join(OUTPUT_DIR, relativePath), JSON.stringify(payload), 'utf8');
}
for (const relativePath of posters) {
    const destination = path.join(OUTPUT_DIR, relativePath);
    await mkdir(path.dirname(destination), { recursive: true });
    await cp(path.join(ROOT_DIR, relativePath), destination);
}

console.log(`Static site prepared at ${path.relative(ROOT_DIR, OUTPUT_DIR)} (${DATA_PATHS.length} JSON files, ${posters.size} referenced posters).`);
