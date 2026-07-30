function normalizeLimit(value, fallback) {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function getItemKey(item) {
    const id = item?.id === undefined || item?.id === null ? '' : String(item.id);
    if (!id) return '';
    return `${item?.categoryId || item?.kind || 'catalog'}:${id}`;
}

function hasPoster(item) {
    return typeof item?.posterPath === 'string' && item.posterPath.trim() !== '';
}

function sortUpcoming(left, right) {
    return String(left?.date || '').localeCompare(String(right?.date || ''));
}

function sortRatedAndRecent(left, right) {
    const leftVerified = Boolean(left?.doubanVerified && Number(left?.doubanRating) > 0);
    const rightVerified = Boolean(right?.doubanVerified && Number(right?.doubanRating) > 0);
    if (leftVerified !== rightVerified) return rightVerified - leftVerified;

    const ratingDifference = (Number(right?.doubanRating) || 0) - (Number(left?.doubanRating) || 0);
    if (ratingDifference !== 0) return ratingDifference;
    return String(right?.date || '').localeCompare(String(left?.date || ''));
}

function appendUniqueItems(target, source, seen, limit) {
    for (const item of source) {
        if (target.length >= limit) break;
        const key = getItemKey(item);
        if (!key || seen.has(key) || !hasPoster(item)) continue;
        seen.add(key);
        target.push(item);
    }
}

/**
 * 选择首页推荐：先取近期上映，再由已验证评分和日期补齐。
 */
export function selectFeaturedItems({
    futureItems = [],
    currentItems = [],
    limit = 4
} = {}) {
    const safeLimit = normalizeLimit(limit, 4);
    if (safeLimit === 0) return [];

    const selected = [];
    const seen = new Set();
    appendUniqueItems(selected, [...futureItems].sort(sortUpcoming), seen, safeLimit);
    appendUniqueItems(selected, [...currentItems].sort(sortRatedAndRecent), seen, safeLimit);
    return selected;
}

/**
 * 将作品按页面给定的年份顺序分组，并为时间线选取有限数量的真实海报预览。
 */
export function buildYearGroups({
    years = [],
    items = [],
    futureItems = [],
    futureTag = 'LOCK_ON',
    previewLimit = 4
} = {}) {
    const safePreviewLimit = normalizeLimit(previewLimit, 4);

    return years.map((year) => {
        const source = year === futureTag
            ? futureItems
            : items.filter((item) => String(item?.date || '').startsWith(`${year}-`));
        const uniqueItems = [];
        const seen = new Set();

        for (const item of source) {
            const key = getItemKey(item);
            if (!key || seen.has(key)) continue;
            seen.add(key);
            uniqueItems.push(item);
        }

        const previews = uniqueItems
            .filter(hasPoster)
            .slice(0, safePreviewLimit)
            .map((item) => ({
                id: String(item.id),
                title: item.title || '未命名',
                posterPath: item.posterPath
            }));

        return {
            year,
            count: uniqueItems.length,
            previews
        };
    });
}

/**
 * 统计当前分类的主要类型。排序优先遵循既有类型优先级，再比较实际数量。
 */
export function getTopGenreStats(items, {
    limit = 8,
    priority = [],
    getDisplayName = (value) => value
} = {}) {
    const counts = new Map();

    items.forEach((item) => {
        const uniqueGenres = new Set(Array.isArray(item?.genres) ? item.genres : []);
        uniqueGenres.forEach((genre) => {
            const displayName = getDisplayName(genre);
            if (!displayName) return;
            const current = counts.get(displayName) || {
                name: displayName,
                value: genre,
                count: 0
            };
            current.count += 1;
            counts.set(displayName, current);
        });
    });

    return [...counts.values()]
        .sort((left, right) => {
            const leftPriority = priority.indexOf(left.name);
            const rightPriority = priority.indexOf(right.name);
            if (leftPriority !== -1 || rightPriority !== -1) {
                if (leftPriority === -1) return 1;
                if (rightPriority === -1) return -1;
                if (leftPriority !== rightPriority) return leftPriority - rightPriority;
            }
            if (left.count !== right.count) return right.count - left.count;
            return left.name.localeCompare(right.name, 'zh-CN');
        })
        .slice(0, normalizeLimit(limit, 8));
}

export function findReferencedItem(items, itemId) {
    const normalizedId = String(itemId ?? '');
    return items.find((item) => String(item?.id ?? '') === normalizedId) || null;
}

export async function loadEditorialContent(url = 'content/editorial.json') {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) {
        throw new Error(`Editorial content request failed: ${response.status}`);
    }
    return response.json();
}
