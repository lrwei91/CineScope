/**
 * 渲染系统模块
 * 负责卡片、时间线、列表等 UI 渲染
 */

import { TMDB_IMAGE_BASE_URL, HIDDEN_GENRES, FUTURE_TAG, DOUBAN_STATUS_LABELS, GENRE_PRIORITY } from './config.js';
import { getGenreDisplayName } from './filters.js';
import { parseDateStringAsLocalDate } from './date-utils.js';

/**
 * 解析海报 URL
 */
export function resolvePosterUrl(posterPath) {
    if (!posterPath) return 'https://via.placeholder.com/500x750.png?text=No+Image';
    if (/^https?:\/\//i.test(posterPath)) return posterPath;
    return posterPath.startsWith('/') ? `${TMDB_IMAGE_BASE_URL}${posterPath}` : posterPath;
}

/**
 * 获取卡片芯片标签
 */
function getCardChipLabels(item) {
    const chips = [];
    const releaseWindows = Array.isArray(item.releaseWindows) ? item.releaseWindows : [];
    const visibleGenres = (item.genres || []).filter((genreName) => {
        const displayName = getGenreDisplayName(genreName);
        return !HIDDEN_GENRES.has(displayName) && !HIDDEN_GENRES.has(genreName);
    });

    releaseWindows.slice(0, 1).forEach((window) => {
        chips.push({
            label: window.label,
            variant: 'release-window'
        });
    });

    // 按优先级排序：优先级高的在前，优先级低的（如剧情、动画）在后
    const sortedGenres = sortGenresByPriority(visibleGenres);

    if (sortedGenres.length > 0) {
        chips.push({
            label: getGenreDisplayName(sortedGenres[0]),
            variant: 'genre'
        });
    }

    return chips.slice(0, 2);
}

/**
 * 按优先级排序类型标签
 * 优先级规则：
 * - 有 GENRE_PRIORITY 配置的按配置顺序（索引小的优先级高）
 * - 未配置的排在最后
 * - 剧情、动画等低优先级标签自动排在后面
 */
function sortGenresByPriority(genres) {
    return genres.slice().sort((a, b) => {
        const aDisplayName = getGenreDisplayName(a);
        const bDisplayName = getGenreDisplayName(b);
        const aIndex = GENRE_PRIORITY.indexOf(aDisplayName);
        const bIndex = GENRE_PRIORITY.indexOf(bDisplayName);

        // 都在优先级列表中，按索引排序
        if (aIndex !== -1 && bIndex !== -1) {
            return aIndex - bIndex;
        }
        // 只有 a 在列表中，a 优先
        if (aIndex !== -1) {
            return -1;
        }
        // 只有 b 在列表中，b 优先
        if (bIndex !== -1) {
            return 1;
        }
        // 都不在列表中，按字母顺序
        return aDisplayName.localeCompare(bDisplayName, 'zh-CN');
    });
}

/**
 * 创建目录卡片
 */
export function createCatalogCard(item, animationDelayIdx = 0, onCardClick) {
    const posterUrl = resolvePosterUrl(item.posterPath);
    const titleText = item.title || '未命名';
    const subtitleHtml = item.subtitle
        ? `<p class="card-subtitle" title="${item.subtitle}">${item.subtitle}</p>`
        : '';
    const chipLabels = getCardChipLabels(item);
    const chipHtml = chipLabels.length > 0
        ? `<div class="card-chip-row">${chipLabels.map((chip) => `<span class="card-chip ${chip.variant || ''}">${chip.label}</span>`).join('')}</div>`
        : '';

    let ratingElementHTML = '';
    if (item.doubanVerified && item.doubanRating) {
        ratingElementHTML = `<div class="card-rating"><span class="rating-star">★</span><span class="rating-label">豆瓣</span><span class="rating-value">${item.doubanRating}</span></div>`;
    } else {
        ratingElementHTML = `<div class="card-rating"><span class="rating-star">★</span><span class="rating-label">豆瓣</span><span class="rating-empty">暂无评分</span></div>`;
    }

    const airDateInfo = item.date ? `<p class="card-meta-info">上映日期：${item.date}</p>` : '';
    const imageHTML = `<img src="${posterUrl}" alt="${titleText}" class="poster" loading="lazy" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='https://via.placeholder.com/500x750.png?text=No+Image';">`;

    const statusBadgeHtml = item.doubanCollectionStatus
        ? `<span class="poster-status-badge ${item.doubanCollectionStatus}">${DOUBAN_STATUS_LABELS[item.doubanCollectionStatus] || item.doubanCollectionStatus}</span>`
        : '';

    const posterHTML = `${statusBadgeHtml}${imageHTML}`;

    const card = document.createElement('div');
    card.className = 'show-card matrix-enter clickable';
    card.style.animationDelay = `${animationDelayIdx * 40}ms`;
    card.innerHTML = `<div class="card-poster-container">${posterHTML}</div><div class="card-content">${ratingElementHTML}<h3 class="card-title" title="${titleText}">${titleText}</h3>${subtitleHtml}${airDateInfo}${chipHtml}</div>`;

    if (onCardClick) {
        card.addEventListener('click', () => onCardClick(item));
    }

    // 3D 悬停效果
    card.addEventListener('mousemove', (e) => {
        const rect = card.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;
        const rotateX = ((y - centerY) / centerY) * -8;
        const rotateY = ((x - centerX) / centerX) * 8;
        card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-6px) scale3d(1.02, 1.02, 1.02)`;
        card.style.transition = 'transform 0.1s ease-out';
        card.style.zIndex = '10';
    });

    card.addEventListener('mouseleave', () => {
        card.style.transform = '';
        card.style.transition = 'all 0.3s ease';
        card.style.zIndex = '';
    });

    return card;
}

/**
 * 显示骨架屏加载器
 */
export function showSkeletonLoader(container, skeletonContainer) {
    if (!container) return;

    container.innerHTML = '';
    const noResultsMessage = document.getElementById('no-results');
    if (noResultsMessage) noResultsMessage.style.display = 'none';

    const comingSoonContainer = document.getElementById('coming-soon-container');
    if (comingSoonContainer) {
        comingSoonContainer.innerHTML = `
            <h2 class="month-group-header skeleton">即将上映</h2>
            <div class="scroller-wrapper">
                <div class="scroller-container">
                    <div class="horizontal-scroller">
                        <div class="show-card skeleton"></div>
                        <div class="show-card skeleton"></div>
                        <div class="show-card skeleton"></div>
                        <div class="show-card skeleton"></div>
                        <div class="show-card skeleton"></div>
                        <div class="show-card skeleton"></div>
                    </div>
                </div>
            </div>
        `;
        comingSoonContainer.style.display = 'block';
    }

    if (skeletonContainer) {
        skeletonContainer.style.display = 'block';
        container.appendChild(skeletonContainer);
    }

    const loader = document.getElementById('loader');
    if (loader) loader.style.display = 'none';
}

/**
 * 渲染即将上映卡片
 */
export function renderComingSoon(futureItems, onCardClick) {
    const comingSoonContainer = document.getElementById('coming-soon-container');
    if (!comingSoonContainer) return;

    comingSoonContainer.innerHTML = '';
    if (futureItems.length === 0) {
        comingSoonContainer.style.display = 'none';
        return;
    }

    comingSoonContainer.innerHTML = `
        <h2 class="month-group-header">即将上映</h2>
        <div class="scroller-wrapper">
            <button class="scroller-arrow left" aria-label="Scroll left">‹</button>
            <div class="scroller-container">
                <div class="horizontal-scroller"></div>
            </div>
            <button class="scroller-arrow right" aria-label="Scroll right">›</button>
        </div>
    `;

    const horizontalScroller = comingSoonContainer.querySelector('.horizontal-scroller');
    if (horizontalScroller) {
        const fragment = document.createDocumentFragment();
        futureItems.forEach((item, index) => {
            fragment.appendChild(createCatalogCard(item, index, onCardClick));
        });
        horizontalScroller.appendChild(fragment);
    }

    comingSoonContainer.style.display = 'block';
    setupHorizontalScroller(comingSoonContainer);
}

/**
 * 设置水平滚动器
 */
function setupHorizontalScroller(container) {
    const scroller = container.querySelector('.scroller-container');
    const arrowLeft = container.querySelector('.scroller-arrow.left');
    const arrowRight = container.querySelector('.scroller-arrow.right');

    if (!scroller || !arrowLeft || !arrowRight) return;

    function updateArrowVisibility() {
        const scrollLeft = scroller.scrollLeft;
        const scrollWidth = scroller.scrollWidth;
        const clientWidth = scroller.clientWidth;

        arrowLeft.style.display = 'block';
        arrowRight.style.display = 'block';
        arrowLeft.disabled = scrollLeft < 10;
        arrowRight.disabled = scrollWidth - scrollLeft - clientWidth < 10;
    }

    arrowLeft.addEventListener('click', () => {
        scroller.scrollBy({ left: -scroller.clientWidth * 0.8, behavior: 'smooth' });
    });

    arrowRight.addEventListener('click', () => {
        scroller.scrollBy({ left: scroller.clientWidth * 0.8, behavior: 'smooth' });
    });

    scroller.addEventListener('scroll', updateArrowVisibility);
    setTimeout(updateArrowVisibility, 100);
}

/**
 * 渲染时间线
 */
export function renderTimeline(years, activeYear, visibleYearCount, onYearClick) {
    const yearList = document.getElementById('year-list');
    if (!yearList) return;

    yearList.innerHTML = '';
    const yearsToShow = years.slice(0, visibleYearCount);

    yearsToShow.forEach((year, index) => {
        const item = document.createElement('li');
        item.className = 'year-item';
        if (year === activeYear) item.classList.add('active');
        item.dataset.year = year;
        item.innerHTML = `<span class="dot"></span><span class="year-text">LOCK_ON: ${year}</span>`;

        item.addEventListener('click', (event) => {
            event.stopPropagation();
            const isLastItem = index === yearsToShow.length - 1;
            if (onYearClick) onYearClick(year, isLastItem);
        });

        yearList.appendChild(item);
    });
}

/**
 * 附加项目到容器
 */
export function appendItemsToContainer(itemsToRender, container, specialFilterMode, onCardClick) {
    let currentGrid = container.querySelector('.month-grid:last-of-type');

    if (specialFilterMode === 'recent_high_score' && !currentGrid) {
        currentGrid = document.createElement('div');
        currentGrid.className = 'month-grid';
        container.appendChild(currentGrid);
    }

    itemsToRender.forEach((item) => {
        if (specialFilterMode !== 'recent_high_score') {
            const monthKey = item.date.substring(0, 7);
            const lastHeader = container.querySelector('.month-group-header:last-of-type');

            if (!lastHeader || lastHeader.id !== `month-${monthKey}`) {
                const header = document.createElement('h2');
                header.className = 'month-group-header';
                header.id = `month-${monthKey}`;
                const date = parseDateStringAsLocalDate(`${monthKey}-01`);
                header.textContent = `${date.getFullYear()}年 ${date.getMonth() + 1}月`;
                container.appendChild(header);

                currentGrid = document.createElement('div');
                currentGrid.className = 'month-grid';
                container.appendChild(currentGrid);
            }
        }

        const card = createCatalogCard(item, 0, onCardClick);
        if (!currentGrid) {
            currentGrid = document.createElement('div');
            currentGrid.className = 'month-grid';
            container.appendChild(currentGrid);
        }
        currentGrid.appendChild(card);
    });
}
