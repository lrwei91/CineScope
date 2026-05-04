#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchMaoyanTvHeatPayload } from './lib/box-office.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const TV_HEAT_PATH = 'json/maoyan_tv_heat.json';
const MAOYAN_TV_HEAT_API_URL =
    process.env.MAOYAN_TV_HEAT_API_URL || 'https://60s.viki.moe/v2/maoyan/realtime/web';

async function main() {
    const payload = await fetchMaoyanTvHeatPayload({
        apiUrl: MAOYAN_TV_HEAT_API_URL
    });

    await writeJson(TV_HEAT_PATH, payload);
    console.log(`[tv_heat] total=${payload.metadata.total_items} -> ${TV_HEAT_PATH}`);
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
