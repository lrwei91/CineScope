/**
 * 筛选器系统模块
 * 负责评分、类型、网络、流派筛选逻辑
 */

import {
    CATEGORY_RATING_CONFIG,
    DEFAULT_RATING_CONFIG,
    GENRE_DISPLAY_MAP,
    GENRE_PRIORITY,
    CATEGORY_CONFIG
} from './config.js';
import { parseDateStringAsLocalDate } from './date-utils.js';

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
    const uniqueGenres = [...new Set(items.flatMap((item) => item.genres))];

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
        selectedGenres
    } = filters;

    const query = String(searchQuery || '').trim().toLowerCase();
    const recentHighScore = specialFilterMode === 'recent_high_score';
    const ratingConfig = getCurrentRatingConfig(categoryId);
    const threshold = ratingConfig.thresholds.find(({ label }) => label === selectedRating)?.value || 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const sinceDate = new Date(today.getTime());
    if (recentHighScore) sinceDate.setFullYear(sinceDate.getFullYear() - ratingConfig.special.years);
    const pastAndPresentItems = [];

    // 所有上映日期共用片单，未来上映作品也参与排序、筛选和分页。
    for (const item of allItems) {
        if (query && ![item.title, item.subtitle, ...(item.aka || []), item.overview]
            .some((value) => String(value || '').toLowerCase().includes(query))) continue;

        const rating = parseFloat(item.doubanRating) || 0;
        if (!recentHighScore && selectedRating !== '全部' && rating < threshold) continue;
        if (selectedGenres.length && !(item.genres || []).some((genre) => selectedGenres.includes(genre))) continue;
        if (isAnimationItem(item) && !(Number(item.doubanRating) > 0)) continue;

        const itemDate = parseDateStringAsLocalDate(item.date);
        if (recentHighScore) {
            if (!(itemDate >= sinceDate) || rating < ratingConfig.special.minRating) continue;
        }
        pastAndPresentItems.push(item);
    }

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
        filteredPastAndPresentItems: sortedItems
    };
}

/**
 * 创建评分筛选标签
 */
export function createRatingTag(label, value, isActive, onClick) {
    const tag = document.createElement('button');
    tag.type = 'button';
    tag.className = 'genre-tag';
    tag.textContent = label;
    tag.dataset.rating = value;
    tag.setAttribute('aria-pressed', String(isActive));

    if (isActive) tag.classList.add('active');

    tag.addEventListener('click', onClick);
    return tag;
}

/**
 * 创建类型筛选标签
 */
export function createGenreTag(displayName, actualValue, isSelected, onClick) {
    const tag = document.createElement('button');
    tag.type = 'button';
    tag.className = 'genre-tag';
    tag.textContent = displayName;
    tag.dataset.genre = actualValue;
    tag.setAttribute('aria-pressed', String(isSelected));

    if (isSelected) {
        tag.classList.add('active', 'multiselect-tick');
    }

    tag.addEventListener('click', onClick);
    return tag;
}
