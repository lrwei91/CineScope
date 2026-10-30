const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

export function createHttpClient({
    requestHeaders,
    timeoutMs,
    tmdbApiBase,
    tmdbApiKey,
    fetchImpl = fetch
}) {
    async function requestOnce(
        url,
        { headers = requestHeaders, responseType = 'json', errorPrefix = 'Request failed', errorTarget = String(url) } = {}
    ) {
        const response = await fetchImpl(url, {
            headers,
            signal: AbortSignal.timeout(timeoutMs)
        });
        if (!response.ok) {
            const error = new Error(`${errorPrefix} (${response.status}): ${errorTarget}`);
            error.status = response.status;
            throw error;
        }
        if (responseType === 'text') return response.text();
        if (responseType === 'binary') return Buffer.from(await response.arrayBuffer());
        return response.json();
    }

    // 网络抖动（ECONNRESET、超时）与限流/网关错误重试；其余 4xx 立即失败。
    async function request(url, options = {}) {
        const maxAttempts = 3;
        for (let attempt = 1; ; attempt++) {
            try {
                return await requestOnce(url, options);
            } catch (error) {
                const retryable = !error?.status || RETRYABLE_STATUS.has(error.status);
                if (!retryable || attempt >= maxAttempts) {
                    throw error;
                }
                await new Promise((resolve) => setTimeout(resolve, 1500 * 2 ** (attempt - 1)));
            }
        }
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
