/**
 * 筛选器系统模块
 * 负责评分、类型、网络、流派筛选逻辑
 */

import {
    CATEGORY_RATING_CONFIG,
    DEFAULT_RATING_CONFIG,
    GENRE_DISPLAY_MAP,
    GENRE_PRIORITY,
    NETWORK_PRIORITY,
    HIDDEN_GENRES,
    CATEGORY_CONFIG
} from './config.js';

/**
 * 获取当前分类的评分配置
 */
export function getCurrentRatingConfig(categoryId) {
    return CATEGORY_RATING_CONFIG[categoryId] || DEFAULT_RATING_CONFIG;
}

/**
 * 获取类型显示名称
 */
export function getGenreDisplayName(genreName) {
    return GENRE_DISPLAY_MAP[genreName] || genreName;
}

/**
 * 获取排序后的类型列表
 */
export function getSortedGenres(items) {
    const uniqueGenres = [...new Set(items.flatMap((item) => item.genres))].filter((genreName) => {
        const displayName = getGenreDisplayName(genreName);
        return !HIDDEN_GENRES.has(displayName) && !HIDDEN_GENRES.has(genreName);
    });

    return uniqueGenres.sort((left, right) => {
        const leftPriority = GENRE_PRIORITY.indexOf(getGenreDisplayName(left));
        const rightPriority = GENRE_PRIORITY.indexOf(getGenreDisplayName(right));

        if (leftPriority !== -1 || rightPriority !== -1) {
            if (leftPriority === -1) return 1;
            if (rightPriority === -1) return -1;
            return leftPriority - rightPriority;
        }

        return getGenreDisplayName(left).localeCompare(getGenreDisplayName(right), 'zh-CN');
    });
}

/**
 * 获取排序后的网络列表
 */
export function getSortedNetworks(items) {
    const uniqueNetworks = [...new Set(items.flatMap((item) => item.networks))];

    return uniqueNetworks.sort((left, right) => {
        const leftPriority = NETWORK_PRIORITY.findIndex((name) => name.toLowerCase() === left.toLowerCase());
        const rightPriority = NETWORK_PRIORITY.findIndex((name) => name.toLowerCase() === right.toLowerCase());

        if (leftPriority !== -1 || rightPriority !== -1) {
            if (leftPriority === -1) return 1;
            if (rightPriority === -1) return -1;
            return leftPriority - rightPriority;
        }

        return left.localeCompare(right, 'zh-CN');
    });
}

/**
 * 检查项目是否包含某类型
 */
export function itemHasGenre(item, genreName) {
    return (item.genres || []).some((genre) => getGenreDisplayName(genre) === genreName || genre === genreName);
}

/**
 * 检查是否为动画项目
 */
export function isAnimationItem(item) {
    return itemHasGenre(item, '动画');
}

/**
 * 应用筛选条件
 */
export function applyFilters(allItems, filters, categoryId) {
    const {
        searchQuery,
        specialFilterMode,
        selectedRating,
        selectedGenres,
        selectedNetworks
    } = filters;

    let sourceItems = [...allItems];

    // 搜索筛选
    if (searchQuery) {
        const query = searchQuery.toLowerCase();
        sourceItems = sourceItems.filter(item =>
            (item.title && item.title.toLowerCase().includes(query)) ||
            (item.subtitle && item.subtitle.toLowerCase().includes(query))
        );
    }

    // 近 2 年高分筛选
    if (specialFilterMode === 'recent_high_score') {
        const specialConfig = getCurrentRatingConfig(categoryId).special;
        const sinceDate = new Date();
        sinceDate.setFullYear(sinceDate.getFullYear() - specialConfig.years);

        sourceItems = sourceItems.filter((item) => {
            const itemDate = new Date(item.date);
            const rating = parseFloat(item.doubanRating) || 0;
            return itemDate >= sinceDate && rating >= specialConfig.minRating;
        });
    }

    // 评分筛选
    const ratingThresholdMap = Object.fromEntries(
        getCurrentRatingConfig(categoryId).thresholds.map(({ label, value }) => [label, value])
    );

    const ratingFiltered =
        selectedRating === '全部' || specialFilterMode === 'recent_high_score'
            ? sourceItems
            : sourceItems.filter((item) => {
                  const rating = parseFloat(item.doubanRating) || 0;
                  return rating >= (ratingThresholdMap[selectedRating] || 0);
              });

    // 类型筛选
    const genreFiltered =
        selectedGenres.length === 0
            ? ratingFiltered
            : ratingFiltered.filter((item) =>
                  item.genres.some((genre) => selectedGenres.includes(genre))
              );

    // 日漫无评分处理
    const filteredNoRatingAnime = CATEGORY_CONFIG[categoryId]?.allowUnratedAnimation
        ? genreFiltered
        : genreFiltered.filter((item) => {
              const isAnimation = isAnimationItem(item);
              const hasRating = item.doubanRating && Number(item.doubanRating) > 0;
              return !(isAnimation && !hasRating);
          });

    // 网络/平台筛选
    const networkFiltered =
        selectedNetworks.length === 0
            ? filteredNoRatingAnime
            : filteredNoRatingAnime.filter((item) =>
                  item.networks.some((network) =>
                      selectedNetworks.some(
                          (selectedNetwork) => selectedNetwork.toLowerCase() === network.toLowerCase()
                      )
                  )
              );

    // 分离即将上映和已上映
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    const futureItems =
        specialFilterMode === 'recent_high_score'
            ? []
            : networkFiltered
                  .filter((item) => new Date(item.date) > now)
                  .sort((left, right) => new Date(left.date) - new Date(right.date));

    const pastAndPresentItems =
        specialFilterMode === 'recent_high_score'
            ? networkFiltered
            : networkFiltered.filter((item) => new Date(item.date) <= now);

    // 排序
    const sortedItems = pastAndPresentItems.sort((left, right) => {
        if (specialFilterMode === 'recent_high_score') {
            const leftRating = parseFloat(left.doubanRating) || 0;
            const rightRating = parseFloat(right.doubanRating) || 0;
            if (leftRating !== rightRating) return rightRating - leftRating;
            return right.date.localeCompare(left.date);
        }

        if (left.date !== right.date) return right.date.localeCompare(left.date);

        const leftRating = parseFloat(left.doubanRating) || 0;
        const rightRating = parseFloat(right.doubanRating) || 0;
        return rightRating - leftRating;
    });

    return {
        futureItems,
        filteredPastAndPresentItems: sortedItems
    };
}

/**
 * 创建评分筛选标签
 */
export function createRatingTag(label, value, isActive, onClick) {
    const tag = document.createElement('div');
    tag.className = 'genre-tag';
    tag.textContent = label;
    tag.dataset.rating = value;

    if (isActive) tag.classList.add('active');

    tag.addEventListener('click', onClick);
    return tag;
}

/**
 * 创建类型筛选标签
 */
export function createGenreTag(displayName, actualValue, isSelected, onClick) {
    const tag = document.createElement('div');
    tag.className = 'genre-tag';
    tag.textContent = displayName;
    tag.dataset.genre = actualValue;

    if (isSelected) {
        tag.classList.add('active', 'multiselect-tick');
    }

    tag.addEventListener('click', onClick);
    return tag;
}

/**
 * 创建网络筛选标签
 */
export function createNetworkTag(networkName, isSelected, onClick) {
    const tag = document.createElement('div');
    tag.className = 'genre-tag';
    tag.textContent = networkName;
    tag.dataset.network = networkName;

    if (isSelected) {
        tag.classList.add('active', 'multiselect-tick');
    }

    tag.addEventListener('click', onClick);
    return tag;
}
