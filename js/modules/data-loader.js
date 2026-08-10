/**
 * 数据加载与标准化模块
 * 负责数据获取、解析、标准化、去重和合并
 */

import { CATEGORY_CONFIG, TMDB_IMAGE_BASE_URL, VALID_GENRES } from './config.js';
import { parseDateStringAsLocalDate } from './date-utils.js';
import { showToast } from './ui-controls.js';

const realtimePayloadCache = new Map();

// 实时数据源驱动表。新增数据源时，请同时：
//   1) 在 CATEGORY_CONFIG 中配 urlKey 指向的 URL（如 boxOfficeUrl / tvHeatUrl）
//   2) 在 fetchMaoyan*Payload（scripts/lib/box-office.mjs）中实现对应的解析
//   3) 在 normalize* 函数中定义归一化输出形状
// 漏配任意一项都会让前端拿不到对应数据，但不会报错。
const REALTIME_ENRICHMENTS = [
    {
        urlKey: 'boxOfficeUrl',
        expectedKind: 'movie',
        collectionKey: 'movies',
        titleKey: 'movie_name',
        targetKey: 'boxOffice',
        normalize: normalizeBoxOffice,
        label: 'box office'
    },
    {
        urlKey: 'tvHeatUrl',
        expectedKind: 'tv',
        collectionKey: 'series',
        titleKey: 'series_name',
        targetKey: 'tvHeat',
        normalize: normalizeTvHeat,
        label: 'TV heat'
    }
];

/**
 * 构建带时间戳的防缓存 URL
 */
export function buildFreshUrl(url) {
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}t=${Date.now()}`;
}

/**
 * 构建 TMDB 搜索 URL
 */
export function buildTmdbSearchUrl(title, date) {
    const query = encodeURIComponent(String(title || '').trim());
    return `https://www.themoviedb.org/search?query=${query}`;
}

/**
 * 格式化时间戳
 */
export function formatUpdateTimestamp(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    }).format(date);
}

/**
 * 加载分类数据
 *
 * 依赖由 options 显式传入（便于测试与解耦）：
 *   - getCurrentCategoryId: () => string
 *   - onSync: (categoryState) => void
 *   - isDesktop: boolean                         // 默认 false。决定 complete 加载完成时是否弹 toast
 */
export async function loadCategoryData(categoryId, level, categoryState, options = {}) {
    const config = CATEGORY_CONFIG[categoryId];
    const state = categoryState[categoryId];
    const promiseKey = level === 'latest' ? 'latestPromise' : 'completePromise';
    const loadedKey = level === 'latest' ? 'latestLoaded' : 'completeLoaded';
    const url = level === 'latest' ? config.latestUrl : config.completeUrl;
    const {
        forceRefresh = false,
        silent = false,
        getCurrentCategoryId = () => categoryId,
        onSync = () => {},
        isDesktop = false
    } = options;

    // 没有对应 URL 的级别直接跳过（如 douban_top250 没有 latestUrl）
    if (!url) return false;

    if (state[loadedKey] && !forceRefresh) return true;
    if (state[promiseKey]) return state[promiseKey];

    state[promiseKey] = (async () => {
        try {
            const response = await fetch(buildFreshUrl(url), { cache: 'no-store' });
            if (!response.ok) {
                if (level === 'latest') {
                    console.warn(`Could not load ${url}, will fall back to complete data.`);
                    return false;
                }
                throw new Error(`Could not load ${url}`);
            }

            const data = await response.json();
            ingestCategoryData(categoryId, data, level, categoryState, { sync: false });
            await applyRealtimeDataIfNeeded(categoryId, config, state);
            if (categoryId === getCurrentCategoryId()) {
                onSync(categoryState);
            }

            if (!silent && level === 'complete' && categoryId === getCurrentCategoryId() && isDesktop) {
                showToast('已加载全部内容');
            }

            return true;
        } catch (error) {
            console.error(`Failed to load ${level} data for ${categoryId}:`, error);
            if (level === 'complete' && categoryId === getCurrentCategoryId() && !state.latestLoaded) {
                const statusMessage = document.getElementById('status-message');
                if (statusMessage) {
                    statusMessage.textContent = '加载数据失败或文件格式无效。';
                    statusMessage.dataset.state = 'error';
                    statusMessage.closest('.file-loader')?.classList.add('visible');
                }
                const comingSoonContainer = document.getElementById('coming-soon-container');
                const skeletonContainer = document.getElementById('skeleton-container');
                if (comingSoonContainer) comingSoonContainer.style.display = 'none';
                if (skeletonContainer) skeletonContainer.style.display = 'none';
            }
            return false;
        } finally {
            state[promiseKey] = null;
        }
    })();

    return state[promiseKey];
}

async function applyRealtimeDataIfNeeded(categoryId, config, state) {
    const enrichments = REALTIME_ENRICHMENTS.filter(
        (enrichment) => config.kind === enrichment.expectedKind && config[enrichment.urlKey]
    );
    if (enrichments.length === 0) return;

    for (const enrichment of enrichments) {
        const payload = await loadRealtimePayload(config[enrichment.urlKey], enrichment.label);
        const rows = Array.isArray(payload?.[enrichment.collectionKey]) ? payload[enrichment.collectionKey] : [];
        if (rows.length === 0) continue;

        state.items = mergeRealtimeRowsIntoCatalogItems(state.items, rows, enrichment);
    }

}

async function loadRealtimePayload(url, label) {
    if (realtimePayloadCache.has(url)) {
        return realtimePayloadCache.get(url);
    }

    const payloadPromise = fetch(buildFreshUrl(url), { cache: 'no-store' })
        .then((response) => {
            if (!response.ok) {
                throw new Error(`Could not load ${url}`);
            }
            return response.json();
        })
        .catch((error) => {
            console.warn(`${label} data skipped: ${error.message}`);
            return null;
        });

    realtimePayloadCache.set(url, payloadPromise);
    return payloadPromise;
}

function mergeRealtimeRowsIntoCatalogItems(items, rows, enrichment) {
    const rowByTitleKey = new Map();
    rows.forEach((row) => {
        const titleKey = normalizeCatalogText(row?.[enrichment.titleKey]);
        if (titleKey && !rowByTitleKey.has(titleKey)) {
            rowByTitleKey.set(titleKey, row);
        }
    });

    return items.map((item) => {
        const titleKeys = [item.title, item.subtitle, ...(Array.isArray(item.aka) ? item.aka : [])]
            .map(normalizeCatalogText)
            .filter(Boolean);
        const row = titleKeys.map((key) => rowByTitleKey.get(key)).find(Boolean);
        return row ? { ...item, [enrichment.targetKey]: enrichment.normalize(row) } : item;
    });
}

function normalizeTvHeat(value) {
    if (!value || typeof value !== 'object') return null;

    return {
        source: String(value.source || 'maoyan'),
        updatedAt: String(value.updated_at || ''),
        rank: normalizeCount(value.rank),
        maoyanSeriesId: normalizeCount(value.maoyan_series_id),
        seriesName: String(value.series_name || '').trim(),
        releaseInfo: String(value.release_info || '').trim(),
        platformDesc: String(value.platform_desc || '').trim(),
        currHeat: String(value.curr_heat || '').trim(),
        currHeatDesc: String(value.curr_heat_desc || '').trim(),
        barValue: typeof value.bar_value === 'number' ? value.bar_value : null
    };
}

/**
 * 解析并存储分类数据
 */
export function ingestCategoryData(categoryId, data, level, categoryState, options = {}) {
    const config = CATEGORY_CONFIG[categoryId];
    const state = categoryState[categoryId];
    const {
        sync = true,
        getCurrentCategoryId = () => categoryId,
        onSync = () => {}
    } = options;

    if (level === 'latest' && state.completeLoaded) return;

    const normalizedItems = normalizePayload(data, config);
    state.items = normalizedItems;
    state.updateDate = data.metadata && data.metadata.last_updated ? data.metadata.last_updated : '';
    state.latestLoaded = state.latestLoaded || level === 'latest';
    state.completeLoaded = state.completeLoaded || level === 'complete';

    if (sync && categoryId === getCurrentCategoryId()) {
        onSync(categoryState);
    }
}

/**
 * 标准化数据载荷
 */
function normalizePayload(data, config) {
    if (!data || typeof data !== 'object') {
        throw new Error('Data payload is not a valid object.');
    }

    if (config.kind === 'tv') {
        if (!Array.isArray(data.shows)) {
            throw new Error('TV payload must contain a "shows" array.');
        }
        const normalizedItems = dedupeCatalogItems('tv', normalizeTvItems(data.shows, config));
        return typeof config.itemFilter === 'function' ? normalizedItems.filter(config.itemFilter) : normalizedItems;
    }

    if (!Array.isArray(data.movies)) {
        throw new Error('Movie payload must contain a "movies" array.');
    }

    const normalizedItems = dedupeCatalogItems('movie', normalizeMovieItems(data.movies));
    return typeof config.itemFilter === 'function' ? normalizedItems.filter(config.itemFilter) : normalizedItems;
}

/**
 * 标准化 TV 项目
 */
function normalizeTvItems(shows, config = {}) {
    const normalizedItems = [];
    shows.forEach((show) => {
        const seasons = Array.isArray(show.seasons) ? show.seasons : [];
        const title = buildLocalizedTitle(show.name, show.original_name);
        const genres = normalizeNameList(show.genres, { filterValid: true });
        const networks = normalizeNameList(show.networks);
        const tmdbId = typeof show.tmdb_id === 'number' ? show.tmdb_id : null;
        const trailers = normalizeTrailerList(show.trailers);

        seasons.forEach((season) => {
            if (!season.air_date) return;
            const dossierTitle = show.name || title;
            const dossierSubtitle =
                show.original_name && show.original_name !== show.name
                    ? show.original_name
                    : season.name || '';
            const dossierOverview = show.overview || season.overview || '';
            const dossierNetworks = normalizeNameList(show.networks);

            normalizedItems.push({
                kind: 'tv',
                categoryId: config.id || '',
                id: season.id || `${show.id}-${season.season_number}-${season.air_date}`,
                date: season.air_date,
                title,
                subtitle: season.name || '',
                posterPath: season.poster_path || show.poster_path || null,
                genres,
                networks,
                doubanRating: season.douban_rating || null,
                doubanLink: season.douban_link_google || null,
                doubanSubjectId: extractDoubanSubjectId(season.douban_link_google || null),
                doubanCollectionStatus: null,
                doubanVerified: Boolean(season.douban_link_verified),
                tmdbId,
                imdbId: show.imdb_id || null,
                tmdbUrl: tmdbId ? `https://www.themoviedb.org/tv/${tmdbId}` : null,
                tmdbSearchUrl: buildTmdbSearchUrl(title, season.air_date),
                imdbUrl: show.imdb_id ? `https://www.imdb.com/title/${show.imdb_id}/` : null,
                directors: normalizeNameList(show.directors),
                actors: normalizeNameList(show.actors),
                countries: normalizeStringList(show.countries),
                languages: normalizeStringList(show.languages),
                aka: normalizeStringList(show.aka),
                overview: show.overview || season.overview || '',
                trailers,
                primaryTrailer: trailers[0] || null,
                dossierTitle,
                dossierSubtitle,
                dossierOverview,
                dossierNetworks,
                posterStatusLabel: config.id === 'tv_cn' ? resolveTvPosterStatusLabel(show) : null,
                detailStatus: show.episodes_info || show.status || '',
                detailRuntime: show.number_of_episodes ? `${show.number_of_episodes} 集` : '',
                ratingCount: normalizeCount(show.rating_count),
                ratingStarCount: normalizeCount(show.rating_star_count)
            });
        });
    });
    return normalizedItems;
}

export function resolveTvPosterStatusLabel(show, referenceDate = new Date()) {
    if (!show || typeof show !== 'object') return null;

    const statusValue = String(show.status || '').trim();
    const episodesInfoValue = String(show.episodes_info || '').trim();
    const statusText = statusValue || episodesInfoValue;
    const normalizedStatusValue = statusValue.toLowerCase();
    const totalEpisodeCount = normalizeCount(show.number_of_episodes);
    const updatedEpisodeMatch = (episodesInfoValue || statusText).match(/更新至\s*(\d+)\s*集/);
    const updatedEpisodeCount = updatedEpisodeMatch ? Number(updatedEpisodeMatch[1]) : null;
    const lastAirDate = parseDateStringAsLocalDate(show.last_air_date || '');
    const hasValidReferenceDate = referenceDate instanceof Date && !Number.isNaN(referenceDate.getTime());
    const daysSinceLastAir = lastAirDate && hasValidReferenceDate
        ? computeDayDifference(lastAirDate, referenceDate)
        : null;
    const explicitEndedStatus = ['ended', 'canceled', 'cancelled'].includes(normalizedStatusValue);
    const explicitReturningStatus = normalizedStatusValue.includes('returning series');
    const endedByEpisodeText = /\d+\s*集全/.test(statusText);
    const endedByStaleUpdate = Boolean(
        updatedEpisodeCount &&
        totalEpisodeCount &&
        updatedEpisodeCount >= totalEpisodeCount &&
        daysSinceLastAir !== null &&
        daysSinceLastAir > 14
    );
    const endedByStaleReturningSeason = Boolean(
        daysSinceLastAir !== null &&
        daysSinceLastAir > 14 &&
        (
            explicitReturningStatus ||
            show.in_production === true
        )
    );

    if (explicitEndedStatus || endedByEpisodeText || endedByStaleUpdate || endedByStaleReturningSeason) {
        return null;
    }

    if (
        statusText.includes('更新至') ||
        statusText.includes('连载中') ||
        statusText.includes('连載中') ||
        explicitReturningStatus ||
        normalizedStatusValue.includes('in production')
    ) {
        return '连载中';
    }

    if (show.in_production === true) {
        return '连载中';
    }

    return null;
}

function computeDayDifference(fromDate, toDate) {
    const millisecondsPerDay = 24 * 60 * 60 * 1000;
    return Math.floor((toDate.getTime() - fromDate.getTime()) / millisecondsPerDay);
}

/**
 * 标准化电影项目
 */
function normalizeMovieItems(movies) {
    return movies.reduce((normalizedItems, movie) => {
        const releaseDate = movie.release_date || movie.air_date || movie.first_air_date;
        if (!releaseDate) return normalizedItems;

        const primaryTitle = movie.title || movie.name || movie.original_title || movie.original_name || '未命名';
        const originalTitle = movie.original_title || movie.original_name || primaryTitle;
        const tmdbId = typeof movie.tmdb_id === 'number' ? movie.tmdb_id : null;
        const trailers = normalizeTrailerList(movie.trailers);

        normalizedItems.push({
            kind: 'movie',
            categoryId: '',
            id: movie.id || `${primaryTitle}-${releaseDate}`,
            date: releaseDate,
            title: primaryTitle,
            subtitle: primaryTitle !== originalTitle ? originalTitle : '',
            posterPath: movie.poster_path || null,
            genres: normalizeNameList(movie.genres, { filterValid: true }),
            releaseWindows: normalizeReleaseWindows(movie.release_windows),
            boxOffice: normalizeBoxOffice(movie.box_office),
            networks: [],
            doubanRating: movie.douban_rating || null,
            doubanLink: movie.douban_link_google || null,
            doubanSubjectId: extractDoubanSubjectId(movie.douban_link_google || null),
            doubanCollectionStatus: null,
            doubanVerified: Boolean(movie.douban_link_verified),
            tmdbId,
            imdbId: movie.imdb_id || null,
            tmdbUrl: tmdbId ? `https://www.themoviedb.org/movie/${tmdbId}` : null,
            tmdbSearchUrl: buildTmdbSearchUrl(primaryTitle, releaseDate),
            imdbUrl: movie.imdb_id ? `https://www.imdb.com/title/${movie.imdb_id}/` : null,
            directors: normalizeNameList(movie.directors),
            actors: normalizeNameList(movie.actors),
            countries: normalizeStringList(movie.countries),
            languages: normalizeStringList(movie.languages),
            aka: normalizeStringList(movie.aka),
            overview: movie.overview || '',
            trailers,
            primaryTrailer: trailers[0] || null,
            dossierTitle: primaryTitle,
            dossierSubtitle: primaryTitle !== originalTitle ? originalTitle : '',
            dossierOverview: movie.overview || '',
            dossierNetworks: [],
            detailStatus: '',
            detailRuntime: buildMovieRuntime(movie.durations),
            ratingCount: normalizeCount(movie.rating_count),
            ratingStarCount: normalizeCount(movie.rating_star_count)
        });

        return normalizedItems;
    }, []);
}

/**
 * 去重目录项目
 */
export function dedupeCatalogItems(kind, items) {
    const dedupedItems = [];
    const itemIndexByKey = new Map();

    items.forEach((item) => {
        const dedupeKey = createCatalogDedupeKey(kind, item);
        const existingIndex = itemIndexByKey.get(dedupeKey);

        if (existingIndex === undefined) {
            itemIndexByKey.set(dedupeKey, dedupedItems.length);
            dedupedItems.push(item);
            return;
        }

        dedupedItems[existingIndex] = mergeCatalogItems(dedupedItems[existingIndex], item);
    });

    return dedupedItems;
}

/**
 * 创建去重键
 */
function createCatalogDedupeKey(kind, item) {
    const normalizedTitle = normalizeCatalogText(item.title || item.name || '');

    if (item.doubanSubjectId) return `${kind}::douban::${item.doubanSubjectId}`;
    if (item.tmdbId) return `${kind}::tmdb::${item.tmdbId}`;
    if (item.imdbId) return `${kind}::imdb::${item.imdbId}`;

    const normalizedSubtitle = normalizeCatalogText(item.subtitle || '');
    const date = item.date || '';

    if (kind === 'movie') return `movie::${normalizedTitle}::${date.slice(0, 7)}`;
    return `tv::${normalizedTitle}::${normalizedSubtitle}::${date}`;
}

/**
 * 标准化文本用于比较
 */
function normalizeCatalogText(value) {
    return String(value || '')
        .toLowerCase()
        .replace(/[\s:：·•'".,，、!！?？\-—_()（）\[\]【】]/g, '')
        .trim();
}

/**
 * 合并两个项目
 */
function mergeCatalogItems(leftItem, rightItem) {
    const preferredItem = scoreCatalogItem(rightItem) > scoreCatalogItem(leftItem) ? rightItem : leftItem;
    const secondaryItem = preferredItem === rightItem ? leftItem : rightItem;
    const mergedTrailers = mergeTrailers(preferredItem.trailers, secondaryItem.trailers);

    return {
        ...secondaryItem,
        ...preferredItem,
        categoryId: preferredItem.categoryId || secondaryItem.categoryId || '',
        title: preferredItem.title || secondaryItem.title,
        subtitle: preferredItem.subtitle || secondaryItem.subtitle,
        posterPath: preferredItem.posterPath || secondaryItem.posterPath,
        doubanRating: preferredItem.doubanRating || secondaryItem.doubanRating,
        doubanLink: preferredItem.doubanLink || secondaryItem.doubanLink,
        doubanVerified: preferredItem.doubanVerified || secondaryItem.doubanVerified,
        tmdbUrl: preferredItem.tmdbUrl || secondaryItem.tmdbUrl,
        imdbUrl: preferredItem.imdbUrl || secondaryItem.imdbUrl,
        genres: mergeUniqueStrings(preferredItem.genres, secondaryItem.genres),
        releaseWindows: mergeReleaseWindows(preferredItem.releaseWindows, secondaryItem.releaseWindows),
        boxOffice: preferredItem.boxOffice || secondaryItem.boxOffice || null,
        networks: mergeUniqueStrings(preferredItem.networks, secondaryItem.networks),
        directors: mergeUniqueStrings(preferredItem.directors, secondaryItem.directors),
        actors: mergeUniqueStrings(preferredItem.actors, secondaryItem.actors),
        countries: mergeUniqueStrings(preferredItem.countries, secondaryItem.countries),
        languages: mergeUniqueStrings(preferredItem.languages, secondaryItem.languages),
        aka: mergeUniqueStrings(preferredItem.aka, secondaryItem.aka),
        overview: preferredItem.overview || secondaryItem.overview || '',
        trailers: mergedTrailers,
        primaryTrailer: mergedTrailers[0] || null,
        dossierTitle: preferredItem.dossierTitle || secondaryItem.dossierTitle || preferredItem.title || secondaryItem.title,
        dossierSubtitle: preferredItem.dossierSubtitle || secondaryItem.dossierSubtitle || preferredItem.subtitle || secondaryItem.subtitle,
        dossierOverview: preferredItem.dossierOverview || secondaryItem.dossierOverview || preferredItem.overview || secondaryItem.overview || '',
        dossierNetworks: mergeUniqueStrings(preferredItem.dossierNetworks, secondaryItem.dossierNetworks),
        posterStatusLabel: preferredItem.posterStatusLabel || secondaryItem.posterStatusLabel || null,
        detailStatus: preferredItem.detailStatus || secondaryItem.detailStatus || '',
        detailRuntime: preferredItem.detailRuntime || secondaryItem.detailRuntime || '',
        ratingCount: preferredItem.ratingCount || secondaryItem.ratingCount || null,
        ratingStarCount: preferredItem.ratingStarCount || secondaryItem.ratingStarCount || null
    };
}

/**
 * 评分项目质量
 */
function scoreCatalogItem(item) {
    let score = 0;
    if (item.doubanVerified) score += 4;
    if (item.doubanRating) score += 3;
    if (item.doubanLink) score += 2;
    if (item.tmdbUrl) score += 1;
    if (item.imdbUrl) score += 1;
    if (item.posterPath) score += 1;
    if (item.subtitle) score += 1;
    score += (item.genres || []).length * 0.1;
    score += (item.networks || []).length * 0.1;
    return score;
}

/**
 * 合并唯一字符串列表
 */
function mergeUniqueStrings(primaryList = [], secondaryList = []) {
    return [...new Set([...(primaryList || []), ...(secondaryList || [])].filter(Boolean))];
}

function mergeReleaseWindows(primaryList = [], secondaryList = []) {
    const seen = new Set();
    return [...(primaryList || []), ...(secondaryList || [])].filter((window) => {
        if (!window?.id || seen.has(window.id)) return false;
        seen.add(window.id);
        return true;
    });
}

function mergeTrailers(primaryList = [], secondaryList = []) {
    const dedupedTrailers = new Map();

    [...(primaryList || []), ...(secondaryList || [])]
        .map((trailer) => normalizeSingleTrailer(trailer))
        .filter(Boolean)
        .forEach((trailer) => {
            const trailerKey = trailer.bvid || trailer.url || `${trailer.title}-${trailer.publishedAt}`;
            if (!trailerKey || dedupedTrailers.has(trailerKey)) return;
            dedupedTrailers.set(trailerKey, trailer);
        });

    return [...dedupedTrailers.values()];
}

/**
 * 标准化名称列表（用于类型、网络等）
 */
export function normalizeNameList(list, options = {}) {
    const { filterValid = false } = options;
    if (!Array.isArray(list)) return [];
    const result = list
        .map((item) => {
            if (typeof item === 'string') return item.trim();
            if (item && typeof item.name === 'string') return item.name.trim();
            return '';
        })
        .filter(Boolean);

    // 如果需要过滤有效类型，过滤掉不在白名单中的值
    if (filterValid && VALID_GENRES.size > 0) {
        return result.filter((name) => VALID_GENRES.has(name));
    }

    return result;
}

/**
 * 标准化字符串列表
 */
function normalizeStringList(list) {
    if (!Array.isArray(list)) return [];
    return list.map((item) => String(item || '').trim()).filter(Boolean);
}

function normalizeReleaseWindows(list) {
    if (!Array.isArray(list)) return [];
    return list
        .map((item) => ({
            id: String(item?.id || '').trim(),
            label: String(item?.label || '').trim()
        }))
        .filter((item) => item.id && item.label);
}

export function normalizeTrailerList(list) {
    if (!Array.isArray(list)) return [];

    return list
        .map((item) => normalizeSingleTrailer(item))
        .filter(Boolean);
}

function normalizeSingleTrailer(item) {
    if (!item || typeof item !== 'object') return null;

    const title = String(item.title || '').replace(/<[^>]*>/g, '').trim();
    const bvid = String(item.bvid || '').trim();
    const url = String(item.url || '').trim();
    const embedUrl = normalizeTrailerEmbedUrl(item.embedUrl || item.embed_url || '', bvid);
    if (!title || (!bvid && !url)) {
        return null;
    }

    return {
        source: String(item.source || 'bilibili').trim() || 'bilibili',
        title,
        bvid,
        url,
        embedUrl,
        cover: String(item.cover || '').trim(),
        publishedAt: String(item.publishedAt || item.published_at || '').trim()
    };
}

export function normalizeTrailerEmbedUrl(value, bvid = '') {
    const rawUrl = String(value || '').trim();
    const rawBvid = String(bvid || '').trim();

    if (!rawUrl && !rawBvid) return '';

    const url = rawUrl
        ? new URL(rawUrl, 'https://player.bilibili.com')
        : new URL('https://player.bilibili.com/player.html');

    if (rawBvid && !url.searchParams.get('bvid')) {
        url.searchParams.set('bvid', rawBvid);
    }
    if (!url.searchParams.get('page')) {
        url.searchParams.set('page', '1');
    }

    url.searchParams.set('qn', '64');
    url.searchParams.set('high_quality', '1');

    return url.toString();
}

function normalizeBoxOffice(value) {
    if (!value || typeof value !== 'object') return null;

    return {
        source: String(value.source || 'maoyan'),
        updatedAt: String(value.updated_at || ''),
        rank: normalizeCount(value.rank),
        maoyanMovieId: normalizeCount(value.maoyan_movie_id),
        movieName: String(value.movie_name || '').trim(),
        releaseInfo: String(value.release_info || value.release_day || '').trim(),
        realTimeBoxOffice: String(value.real_time_box_office || '').trim(),
        cumulativeBoxOffice: String(value.cumulative_box_office || '').trim(),
        splitCumulativeBoxOffice: String(value.split_cumulative_box_office || '').trim(),
        boxOfficeRate: String(value.box_office_rate || '').trim(),
        splitBoxOfficeRate: String(value.split_box_office_rate || '').trim(),
        showCount: normalizeCount(value.show_count),
        showCountRate: String(value.show_count_rate || '').trim(),
        seatOccupancy: String(value.seat_occupancy || '').trim(),
        avgShowView: String(value.avg_show_view || '').trim()
    };
}

/**
 * 标准化数值
 */
function normalizeCount(value) {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) && numericValue > 0 ? numericValue : null;
}

/**
 * 构建电影时长
 */
function buildMovieRuntime(durations) {
    const values = normalizeStringList(durations);
    return values[0] || '';
}

/**
 * 构建本地化标题
 */
function buildLocalizedTitle(name, originalName) {
    if (!name && !originalName) return '未命名';
    if (!name) return originalName;
    if (!originalName || name === originalName) return name;
    return `${name} (${originalName})`;
}

/**
 * 提取豆瓣 ID
 */
function extractDoubanSubjectId(link) {
    const match = String(link || '').match(/subject\/(\d+)/);
    return match ? match[1] : null;
}
