#!/usr/bin/env node

import {
    createTvHeatFallbackPayload,
    fetchMaoyanBoxOfficePayload,
    fetchMaoyanTvHeatPayload
} from './lib/box-office.mjs';
import { readJson, writeJson } from './lib/write-json.mjs';

const BOX_OFFICE_PATH = 'json/maoyan_box_office.json';
const TV_HEAT_PATH = 'json/maoyan_tv_heat.json';
const MAOYAN_BOX_OFFICE_API_URL =
    process.env.MAOYAN_BOX_OFFICE_API_URL || 'https://60s.viki.moe/v2/maoyan/realtime/movie';
const MAOYAN_TV_HEAT_API_URL =
    process.env.MAOYAN_TV_HEAT_API_URL || 'https://60s.viki.moe/v2/maoyan/realtime/web';

export async function generateMaoyanCache() {
    const tvHeatPromise = (async () => {
        try {
            return await fetchMaoyanTvHeatPayload({
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

            console.warn(`[tv_heat] upstream unavailable, reusing cached snapshot: ${error.message}`);
            return fallbackPayload;
        }
    })();

    const [boxOfficePayload, tvHeatPayload] = await Promise.all([
        fetchMaoyanBoxOfficePayload({
            apiUrl: MAOYAN_BOX_OFFICE_API_URL
        }),
        tvHeatPromise
    ]);

    await Promise.all([
        writeJson(BOX_OFFICE_PATH, boxOfficePayload),
        writeJson(TV_HEAT_PATH, tvHeatPayload)
    ]);

    console.log(`[box_office] total=${boxOfficePayload.metadata.total_items} -> ${BOX_OFFICE_PATH}`);
    console.log(`[tv_heat] total=${tvHeatPayload.metadata.total_items} -> ${TV_HEAT_PATH}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
    generateMaoyanCache().catch((error) => {
        console.error(error);
        process.exitCode = 1;
    });
}
