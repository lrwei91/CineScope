#!/usr/bin/env node

import { createTvHeatFallbackPayload, fetchMaoyanTvHeatPayload } from './lib/box-office.mjs';
import { readJson, writeJson } from './lib/write-json.mjs';

const TV_HEAT_PATH = 'json/maoyan_tv_heat.json';
const MAOYAN_TV_HEAT_API_URL =
    process.env.MAOYAN_TV_HEAT_API_URL || 'https://60s.viki.moe/v2/maoyan/realtime/web';

async function main() {
    let payload;

    try {
        payload = await fetchMaoyanTvHeatPayload({
            apiUrl: MAOYAN_TV_HEAT_API_URL
        });
    } catch (error) {
        const cachedPayload = await readJson(TV_HEAT_PATH, null);
        const fallbackPayload = createTvHeatFallbackPayload(cachedPayload, error, {
            sourceUrl: MAOYAN_TV_HEAT_API_URL
        });

        if (!fallbackPayload) {
            throw error;
        }

        payload = fallbackPayload;
        console.warn(`[tv_heat] upstream unavailable, reusing cached snapshot: ${error.message}`);
    }

    await writeJson(TV_HEAT_PATH, payload);
    console.log(`[tv_heat] total=${payload.metadata.total_items} -> ${TV_HEAT_PATH}`);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
