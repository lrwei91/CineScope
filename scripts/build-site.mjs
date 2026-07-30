#!/usr/bin/env node

import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSiteRoutePlan, renderRouteTemplate } from './lib/site-routes.mjs';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT_DIR = path.resolve(ROOT_DIR, process.env.SITE_OUTPUT_DIR || '.site');
const PUBLIC_PATHS = [
    'app.js',
    'home.js',
    'editorial-page.js',
    'share.js',
    'style.css',
    'share.css',
    'favicon.svg',
    'favicon.png',
    'assets',
    'content',
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

const routePlan = createSiteRoutePlan();
const templateCache = new Map();

for (const route of routePlan) {
    let template = templateCache.get(route.sourcePath);
    if (!template) {
        template = await readFile(path.join(ROOT_DIR, route.sourcePath), 'utf8');
        templateCache.set(route.sourcePath, template);
    }
    const html = renderRouteTemplate(template, route.replacements);
    const outputPath = path.join(OUTPUT_DIR, route.outputPath);
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, html);
}

console.log(
    `Static site prepared at ${path.relative(ROOT_DIR, OUTPUT_DIR)} ` +
    `(${PUBLIC_PATHS.length} public paths, ${routePlan.length} routes).`
);
