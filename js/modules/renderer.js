/**
 * 渲染系统模块
 * 负责卡片、时间线、列表等 UI 渲染
 */

import { TMDB_IMAGE_BASE_URL, FUTURE_TAG, DOUBAN_STATUS_LABELS, GENRE_PRIORITY } from './config.js';
import { getGenreDisplayName } from './filters.js';
import { parseDateStringAsLocalDate } from './date-utils.js';

const POSTER_FALLBACK_SVG = encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="500" height="750" viewBox="0 0 500 750">
  <rect width="500" height="750" fill="#24211e"/>
  <rect x="48" y="70" width="404" height="610" rx="12" fill="#302c27" stroke="#70685d" stroke-width="2"/>
  <path d="M150 334h200v26H150zM150 386h138v16H150z" fill="#9b9286"/>
  <circle cx="250" cy="266" r="50" fill="#70685d"/>
  <text x="250" y="494" fill="#eee9e0" font-family="Arial,sans-serif" font-size="28" font-weight="700" text-anchor="middle">暂无海报</text>
</svg>
`);

const POSTER_FALLBACK_URL = `data:image/svg+xml;charset=utf-8,${POSTER_FALLBACK_SVG}`;

/**
 * 解析海报 URL
 */
export function resolvePosterUrl(posterPath) {
    if (!posterPath) return POSTER_FALLBACK_URL;
    if (/^https?:\/\//i.test(posterPath)) return posterPath;
    return posterPath.startsWith('/') ? `${TMDB_IMAGE_BASE_URL}${posterPath}` : posterPath;
}

/**
 * 获取卡片芯片标签
 */
function getCardChipLabels(item) {
    const chips = [];
    const releaseWindows = Array.isArray(item.releaseWindows) ? item.releaseWindows : [];
    const visibleGenres = item.genres || [];

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

function getScrollBehavior() {
    return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
}

function createBoxOfficeElement(item) {
    const boxOffice = item.boxOffice;
    if (!boxOffice || item.kind !== 'movie') {
        return null;
    }

    const rankLabel = boxOffice.rank ? `#${boxOffice.rank}` : '实时';
    const totalLabel = boxOffice.realTimeBoxOffice || boxOffice.cumulativeBoxOffice || '暂无';
    const root = document.createElement('div');
    root.className = 'card-box-office';

    const main = document.createElement('div');
    main.className = 'box-office-main';
    const labelSpan = document.createElement('span');
    labelSpan.textContent = `票房 ${rankLabel}`;
    const totalStrong = document.createElement('strong');
    totalStrong.textContent = totalLabel;
    main.append(labelSpan, totalStrong);
    root.appendChild(main);

    const sub = document.createElement('div');
    sub.className = 'box-office-sub';
    if (boxOffice.boxOfficeRate) {
        const rateSpan = document.createElement('span');
        rateSpan.textContent = `占比 ${boxOffice.boxOfficeRate}`;
        sub.appendChild(rateSpan);
    }
    if (boxOffice.showCountRate) {
        const showRateSpan = document.createElement('span');
        showRateSpan.textContent = `排片 ${boxOffice.showCountRate}`;
        sub.appendChild(showRateSpan);
    }
    if (sub.childElementCount > 0) {
        root.appendChild(sub);
    }

    return root;
}

function createTvHeatElement(item) {
    const tvHeat = item.tvHeat;
    if (!tvHeat || item.kind !== 'tv') {
        return null;
    }

    const rankLabel = tvHeat.rank ? `#${tvHeat.rank}` : '实时';
    const heatLabel = tvHeat.currHeatDesc || tvHeat.currHeat || '暂无';

    const root = document.createElement('div');
    root.className = 'card-box-office';
    const main = document.createElement('div');
    main.className = 'box-office-main';
    const labelSpan = document.createElement('span');
    labelSpan.textContent = `热度 ${rankLabel}`;
    const heatStrong = document.createElement('strong');
    heatStrong.textContent = heatLabel;
    main.append(labelSpan, heatStrong);
    root.appendChild(main);
    return root;
}

function createTrailerButtonElement(item) {
    if (!item.primaryTrailer) {
        return null;
    }

    const button = document.createElement('button');
    button.className = 'poster-trailer-btn';
    button.type = 'button';
    button.setAttribute('aria-label', `播放 ${item.title || '作品'} 预告片`);
    button.title = '播放预告片';
    const iconSpan = document.createElement('span');
    iconSpan.className = 'poster-trailer-icon';
    iconSpan.setAttribute('aria-hidden', 'true');
    button.appendChild(iconSpan);
    return button;
}

/**
 * 创建目录卡片
 *
 * 全部用 createElement 拼装，避免 innerHTML 拼接未转义字段带来的 XSS 风险。
 * 数据来源（TMDB / 豆瓣 / 猫眼）虽基本可信，但下游 JSON 任何写入路径都可能被污染。
 */
export function createCatalogCard(item, animationDelayIdx = 0, onCardClick, onTrailerClick) {
    const posterUrl = resolvePosterUrl(item.posterPath);
    const titleText = item.title || '未命名';
    const chipLabels = getCardChipLabels(item);

    // 卡片保留作品内容语义；覆盖按钮提供键盘入口，预告片保持独立操作。
    const card = document.createElement('article');
    card.className = 'show-card';
    card.style.setProperty('--card-order', String(animationDelayIdx));

    const openButton = document.createElement('button');
    openButton.className = 'show-card__open';
    openButton.type = 'button';
    openButton.setAttribute('aria-label', `查看《${titleText}》详情`);

    // 海报容器
    const posterContainer = document.createElement('div');
    posterContainer.className = 'card-poster-container';

    if (item.categoryId === 'tv_cn' && item.posterStatusLabel) {
        const ribbon = document.createElement('span');
        ribbon.className = 'poster-airing-ribbon';
        ribbon.textContent = item.posterStatusLabel;
        posterContainer.appendChild(ribbon);
    }
    if (item.doubanCollectionStatus) {
        const badge = document.createElement('span');
        badge.className = `poster-status-badge ${item.doubanCollectionStatus}`;
        badge.textContent = DOUBAN_STATUS_LABELS[item.doubanCollectionStatus] || item.doubanCollectionStatus;
        posterContainer.appendChild(badge);
    }
    const trailerButtonEl = createTrailerButtonElement(item);

    const img = document.createElement('img');
    img.className = 'poster';
    img.loading = 'lazy';
    img.referrerPolicy = 'no-referrer';
    img.alt = titleText;
    img.src = posterUrl;
    img.addEventListener('error', () => {
        img.onerror = null;
        img.src = POSTER_FALLBACK_URL;
    }, { once: true });
    posterContainer.appendChild(img);

    // 内容区
    const content = document.createElement('div');
    content.className = 'card-content';

    // 评分
    const ratingEl = document.createElement('div');
    ratingEl.className = 'card-rating';
    const ratingStar = document.createElement('span');
    ratingStar.className = 'rating-star';
    ratingStar.textContent = '★';
    const ratingLabel = document.createElement('span');
    ratingLabel.className = 'rating-label';
    ratingLabel.textContent = '豆瓣';
    if (item.doubanVerified && item.doubanRating) {
        const ratingValue = document.createElement('span');
        ratingValue.className = 'rating-value';
        ratingValue.textContent = String(item.doubanRating);
        ratingEl.append(ratingStar, ratingLabel, ratingValue);
    } else {
        const ratingEmpty = document.createElement('span');
        ratingEmpty.className = 'rating-empty';
        ratingEmpty.textContent = '暂无评分';
        ratingEl.append(ratingStar, ratingLabel, ratingEmpty);
    }
    content.appendChild(ratingEl);

    // 标题
    const titleEl = document.createElement('h3');
    titleEl.className = 'card-title';
    titleEl.title = titleText;
    titleEl.textContent = titleText;
    content.appendChild(titleEl);

    if (item.date) {
        const airDate = document.createElement('p');
        airDate.className = 'card-meta-info';
        airDate.textContent = `上映日期：${item.date}`;
        content.appendChild(airDate);
    }

    const boxOfficeEl = createBoxOfficeElement(item);
    if (boxOfficeEl) content.appendChild(boxOfficeEl);

    const tvHeatEl = createTvHeatElement(item);
    if (tvHeatEl) content.appendChild(tvHeatEl);

    if (chipLabels.length > 0) {
        const chipRow = document.createElement('div');
        chipRow.className = 'card-chip-row';
        chipLabels.forEach((chip) => {
            const chipSpan = document.createElement('span');
            chipSpan.className = `card-chip ${chip.variant || ''}`;
            chipSpan.textContent = chip.label;
            chipRow.appendChild(chipSpan);
        });
        content.appendChild(chipRow);
    }

    card.append(posterContainer, content, openButton);
    if (trailerButtonEl) card.appendChild(trailerButtonEl);

    if (onCardClick) {
        openButton.addEventListener('click', () => {
            openButton.focus();
            onCardClick(item);
        });
    } else {
        openButton.disabled = true;
    }

    if (trailerButtonEl && onTrailerClick) {
        trailerButtonEl.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            trailerButtonEl.focus();
            onTrailerClick(item, 0);
        });
    }

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
        comingSoonContainer.innerHTML = '';
        comingSoonContainer.style.display = 'none';
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
export function renderComingSoon(futureItems, onCardClick, onTrailerClick) {
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
            <button class="scroller-arrow left" type="button" aria-label="向左滚动"></button>
            <div class="scroller-container">
                <div class="horizontal-scroller"></div>
            </div>
            <button class="scroller-arrow right" type="button" aria-label="向右滚动"></button>
        </div>
    `;

    const horizontalScroller = comingSoonContainer.querySelector('.horizontal-scroller');
    if (horizontalScroller) {
        const fragment = document.createDocumentFragment();
        futureItems.forEach((item, index) => {
            fragment.appendChild(createCatalogCard(item, index, onCardClick, onTrailerClick));
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
        scroller.scrollBy({ left: -scroller.clientWidth * 0.8, behavior: getScrollBehavior() });
    });

    arrowRight.addEventListener('click', () => {
        scroller.scrollBy({ left: scroller.clientWidth * 0.8, behavior: getScrollBehavior() });
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
        const button = document.createElement('button');
        const isActive = year === activeYear;
        const label = year === FUTURE_TAG ? '即将上映' : `${year} 年`;

        button.type = 'button';
        button.className = 'year-item';
        button.dataset.year = year;
        button.setAttribute('aria-label', `跳转至${label}片单`);
        if (isActive) {
            button.classList.add('active');
            button.setAttribute('aria-current', 'true');
        }

        const dot = document.createElement('span');
        dot.className = 'dot';
        dot.setAttribute('aria-hidden', 'true');
        const text = document.createElement('span');
        text.className = 'year-text';
        text.textContent = label;
        button.append(dot, text);

        button.addEventListener('click', () => {
            const isLastItem = index === yearsToShow.length - 1;
            if (onYearClick) onYearClick(year, isLastItem);
        });

        item.appendChild(button);
        yearList.appendChild(item);
    });
}

/**
 * 附加项目到容器
 */
export function appendItemsToContainer(itemsToRender, container, specialFilterMode, onCardClick, onTrailerClick) {
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

        const card = createCatalogCard(item, 0, onCardClick, onTrailerClick);
        if (!currentGrid) {
            currentGrid = document.createElement('div');
            currentGrid.className = 'month-grid';
            container.appendChild(currentGrid);
        }
        currentGrid.appendChild(card);
    });
}
