export function createHttpClient({
    requestHeaders,
    timeoutMs,
    tmdbApiBase,
    tmdbApiKey,
    fetchImpl = fetch
}) {
    async function request(
        url,
        { headers = requestHeaders, responseType = 'json', errorPrefix = 'Request failed', errorTarget = String(url) } = {}
    ) {
        const response = await fetchImpl(url, {
            headers,
            signal: AbortSignal.timeout(timeoutMs)
        });
        if (!response.ok) {
            throw new Error(`${errorPrefix} (${response.status}): ${errorTarget}`);
        }
        if (responseType === 'text') return response.text();
        if (responseType === 'binary') return Buffer.from(await response.arrayBuffer());
        return response.json();
    }

    return {
        fetchJson(url) {
            return request(url);
        },
        fetchBinary(url) {
            return request(url, { responseType: 'binary' });
        },
        fetchHtml(url) {
            return request(url, {
                headers: {
                    Referer: 'https://movie.douban.com/',
                    'User-Agent': requestHeaders['User-Agent'],
                    Accept: 'text/html,application/xhtml+xml'
                },
                responseType: 'text'
            });
        },
        async fetchTmdbJson(endpoint, params = {}) {
            if (!tmdbApiKey) throw new Error('TMDB_API_KEY is not set');
            const url = new URL(`${tmdbApiBase}${endpoint}`);
            url.searchParams.set('api_key', tmdbApiKey);
            for (const [key, value] of Object.entries(params)) {
                if (value !== undefined && value !== null && value !== '') {
                    url.searchParams.set(key, String(value));
                }
            }
            return request(url, {
                headers: {
                    Accept: 'application/json',
                    'User-Agent': requestHeaders['User-Agent']
                },
                errorPrefix: 'TMDB request failed',
                errorTarget: endpoint
            });
        }
    };
}
