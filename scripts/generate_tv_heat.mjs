#!/usr/bin/env node

import { fetchMaoyanTvHeatPayload } from './lib/box-office.mjs';
import { writeJson } from './lib/write-json.mjs';

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

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
