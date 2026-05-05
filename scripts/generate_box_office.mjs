#!/usr/bin/env node

import { fetchMaoyanBoxOfficePayload } from './lib/box-office.mjs';
import { writeJson } from './lib/write-json.mjs';

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

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
