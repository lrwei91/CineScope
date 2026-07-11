import test from 'node:test';
import assert from 'node:assert/strict';

import { createHttpClient } from '../scripts/catalog/http-client.mjs';

function createResponse(body, options = {}) {
    return {
        ok: options.ok ?? true,
        status: options.status ?? 200,
        async json() { return body; },
        async text() { return String(body); },
        async arrayBuffer() { return new TextEncoder().encode(String(body)).buffer; }
    };
}

test('HTTP client builds TMDB requests and supports JSON, text and binary responses', async () => {
    const requests = [];
    const client = createHttpClient({
        requestHeaders: { 'User-Agent': 'CineScope' },
        timeoutMs: 1000,
        tmdbApiBase: 'https://api.example.test/3',
        tmdbApiKey: 'key',
        fetchImpl: async (url, options) => {
            requests.push({ url: String(url), options });
            return createResponse('ok');
        }
    });

    assert.equal(await client.fetchHtml('https://example.test/page'), 'ok');
    assert.equal((await client.fetchBinary('https://example.test/image')).toString(), 'ok');
    assert.equal(await client.fetchTmdbJson('/tv/1', { language: 'zh-CN' }), 'ok');
    assert.match(requests[2].url, /api_key=key/);
    assert.match(requests[2].url, /language=zh-CN/);
});

test('HTTP client reports upstream status and rejects TMDB calls without a key', async () => {
    const client = createHttpClient({
        requestHeaders: { 'User-Agent': 'CineScope' },
        timeoutMs: 1000,
        tmdbApiBase: 'https://api.example.test/3',
        tmdbApiKey: '',
        fetchImpl: async () => createResponse({}, { ok: false, status: 503 })
    });

    await assert.rejects(client.fetchJson('https://example.test/fail'), /503/);
    await assert.rejects(client.fetchTmdbJson('/tv/1'), /TMDB_API_KEY is not set/);
});

test('HTTP client does not include the TMDB API key in errors', async () => {
    const client = createHttpClient({
        requestHeaders: { 'User-Agent': 'CineScope' },
        timeoutMs: 1000,
        tmdbApiBase: 'https://api.example.test/3',
        tmdbApiKey: 'secret-key',
        fetchImpl: async () => createResponse({}, { ok: false, status: 401 })
    });

    await assert.rejects(client.fetchTmdbJson('/movie/1'), (error) => {
        assert.match(error.message, /TMDB request failed \(401\): \/movie\/1/);
        assert.doesNotMatch(error.message, /secret-key/);
        return true;
    });
});
