#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchMaoyanBoxOfficePayload } from './lib/box-office.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const BOX_OFFICE_PATH = 'json/maoyan_box_office.json';
const MAOYAN_BOX_OFFICE_API_URL =
    process.env.MAOYAN_BOX_OFFICE_API_URL || 'https://60s.viki.moe/v2/maoyan/realtime/movie';

async function main() {
    const payload = await fetchMaoyanBoxOfficePayload({
        apiUrl: MAOYAN_BOX_OFFICE_API_URL
    });

    await writeJson(BOX_OFFICE_PATH, payload);
    console.log(`[box_office] total=${payload.metadata.total_items} -> ${BOX_OFFICE_PATH}`);
}

async function writeJson(relativePath, payload) {
    const targetPath = path.resolve(ROOT_DIR, relativePath);
    await mkdir(path.dirname(targetPath), { recursive: true });
    await writeFile(targetPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
