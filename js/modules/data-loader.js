/**
 * 数据加载与标准化模块
 * 负责数据获取、解析、标准化、去重和合并
 */

import { CATEGORY_CONFIG, TMDB_IMAGE_BASE_URL, VALID_GENRES } from './config.js';

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
 */
export async function loadCategoryData(categoryId, level, categoryState, options = {}) {
    const config = CATEGORY_CONFIG[categoryId];
    const state = categoryState[categoryId];
    const promiseKey = level === 'latest' ? 'latestPromise' : 'completePromise';
    const loadedKey = level === 'latest' ? 'latestLoaded' : 'completeLoaded';
    const url = level === 'latest' ? config.latestUrl : config.completeUrl;
    const { forceRefresh = false, silent = false } = options;

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
            ingestCategoryData(categoryId, data, level, categoryState);

            const currentCategoryId = window.__appState?.currentCategoryId;
            if (!silent && level === 'complete' && categoryId === currentCategoryId && window.innerWidth > 900) {
                showToast('已加载全部内容');
            }

            return true;
        } catch (error) {
            console.error(`Failed to load ${level} data for ${categoryId}:`, error);
            const currentCategoryId = window.__appState?.currentCategoryId;
            if (level === 'complete' && categoryId === currentCategoryId && !state.latestLoaded) {
                const statusMessage = document.getElementById('status-message');
                if (statusMessage) {
                    statusMessage.textContent = '加载数据失败或文件格式无效。';
                    statusMessage.style.color = '#F44336';
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

/**
 * 解析并存储分类数据
 */
export function ingestCategoryData(categoryId, data, level, categoryState) {
    const config = CATEGORY_CONFIG[categoryId];
    const state = categoryState[categoryId];

    if (level === 'latest' && state.completeLoaded) return;

    const normalizedItems = normalizePayload(data, config);
    state.items = normalizedItems;
    state.updateDate = data.metadata && data.metadata.last_updated ? data.metadata.last_updated : '';
    state.latestLoaded = state.latestLoaded || level === 'latest';
    state.completeLoaded = state.completeLoaded || level === 'complete';

    if (categoryId === getCurrentCategoryId()) {
        syncCurrentCategoryData(categoryState);
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
        const normalizedItems = dedupeCatalogItems('tv', normalizeTvItems(data.shows));
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
function normalizeTvItems(shows) {
    const normalizedItems = [];
    shows.forEach((show) => {
        const seasons = Array.isArray(show.seasons) ? show.seasons : [];
        const title = buildLocalizedTitle(show.name, show.original_name);
        const genres = normalizeNameList(show.genres, { filterValid: true });
        const networks = normalizeNameList(show.networks);
        const tmdbId = typeof show.tmdb_id === 'number' ? show.tmdb_id : null;

        seasons.forEach((season) => {
            if (!season.air_date) return;

            normalizedItems.push({
                kind: 'tv',
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
                detailStatus: show.episodes_info || show.status || '',
                detailRuntime: show.number_of_episodes ? `${show.number_of_episodes} 集` : '',
                ratingCount: normalizeCount(show.rating_count),
                ratingStarCount: normalizeCount(show.rating_star_count)
            });
        });
    });
    return normalizedItems;
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

        normalizedItems.push({
            kind: 'movie',
            id: movie.id || `${primaryTitle}-${releaseDate}`,
            date: releaseDate,
            title: primaryTitle,
            subtitle: primaryTitle !== originalTitle ? originalTitle : '',
            posterPath: movie.poster_path || null,
            genres: normalizeNameList(movie.genres, { filterValid: true }),
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

    return {
        ...secondaryItem,
        ...preferredItem,
        title: preferredItem.title || secondaryItem.title,
        subtitle: preferredItem.subtitle || secondaryItem.subtitle,
        posterPath: preferredItem.posterPath || secondaryItem.posterPath,
        doubanRating: preferredItem.doubanRating || secondaryItem.doubanRating,
        doubanLink: preferredItem.doubanLink || secondaryItem.doubanLink,
        doubanVerified: preferredItem.doubanVerified || secondaryItem.doubanVerified,
        tmdbUrl: preferredItem.tmdbUrl || secondaryItem.tmdbUrl,
        imdbUrl: preferredItem.imdbUrl || secondaryItem.imdbUrl,
        genres: mergeUniqueStrings(preferredItem.genres, secondaryItem.genres),
        networks: mergeUniqueStrings(preferredItem.networks, secondaryItem.networks),
        directors: mergeUniqueStrings(preferredItem.directors, secondaryItem.directors),
        actors: mergeUniqueStrings(preferredItem.actors, secondaryItem.actors),
        countries: mergeUniqueStrings(preferredItem.countries, secondaryItem.countries),
        languages: mergeUniqueStrings(preferredItem.languages, secondaryItem.languages),
        aka: mergeUniqueStrings(preferredItem.aka, secondaryItem.aka),
        overview: preferredItem.overview || secondaryItem.overview || '',
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

/**
 * 获取当前分类 ID（从全局状态）
 */
function getCurrentCategoryId() {
    return window.__appState?.currentCategoryId;
}

/**
 * 同步当前分类数据
 */
function syncCurrentCategoryData(categoryState) {
    if (typeof window.syncCurrentCategoryData === 'function') {
        window.syncCurrentCategoryData(categoryState);
    }
}

/**
 * 显示 Toast 提示
 */
function showToast(message) {
    const toast = document.getElementById('toast-notification');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
}
