#!/usr/bin/env node

import { cp, mkdir, rm, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
    'assets',
    'js',
    'json',
    'posters'
];

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

// 部署产物移除 JSON 的格式空白，源数据仍保留缩进以便审阅。
async function compactJson(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
        const target = path.join(directory, entry.name);
        if (entry.isDirectory()) await compactJson(target);
        else if (entry.isFile() && entry.name.endsWith('.json')) {
            const payload = JSON.parse(await readFile(target, 'utf8'));
            await writeFile(target, JSON.stringify(payload), 'utf8');
        }
    }
}
await compactJson(path.join(OUTPUT_DIR, 'json'));

console.log(`Static site prepared at ${path.relative(ROOT_DIR, OUTPUT_DIR)} (${PUBLIC_PATHS.length} paths).`);
