/**
 * 主应用入口
 * 整合所有模块，管理全局状态和应用生命周期
 */

import {
    CATEGORY_CONFIG,
    DEFAULT_TITLE,
    DEFAULT_CATEGORY_ID,
    ITEMS_PER_PAGE,
    FUTURE_TAG,
    DOUBAN_STATUS_LABELS,
    createCategoryState
} from './js/modules/config.js';

import {
    loadCategoryData,
    ingestCategoryData,
    formatUpdateTimestamp,
    dedupeCatalogItems
} from './js/modules/data-loader.js';

import {
    getCurrentRatingConfig,
    getGenreDisplayName,
    getSortedGenres,
    getSortedNetworks,
    applyFilters,
    createRatingTag,
    createGenreTag,
    createNetworkTag
} from './js/modules/filters.js';

import {
    resolvePosterUrl,
    showSkeletonLoader,
    renderComingSoon,
    renderTimeline,
    appendItemsToContainer
} from './js/modules/renderer.js';

import {
    hydrateDoubanStatuses,
    syncAllItems,
    attachDoubanStatus,
    updateUI as updateDoubanUI
} from './js/modules/douban-sync.js';

import {
    typeWriterEffect,
    updateFilterCollapse,
    setupScrollFade,
    showToast,
    setupBackToTop
} from './js/modules/ui-controls.js';

import {
    openIntelDossier,
    closeIntelDossier,
    initDossierEvents,
    getCurrentDossierItem
} from './js/modules/dossier.js';

import {
    isMobile,
    openMobileFilterSheet,
    closeMobileFilterSheet,
    openMobileCategorySheet,
    closeMobileCategorySheet,
    buildMobileCategoryPills,
    syncMobileCategoryLabel,
    syncMobileSheetFilters,
    updateFabState,
    initMobileSheetEvents
} from './js/modules/mobile-sheet.js';

// =====================================================
// 全局状态
// =====================================================
const state = {
    categoryState: createCategoryState(),
    allItems: [],
    filteredPastAndPresentItems: [],
    currentCategoryId: DEFAULT_CATEGORY_ID,
    specialFilterMode: null,
    selectedGenres: [],
    selectedNetworks: [],
    selectedRating: '全部',
    searchQuery: '',
    currentPage: 1,
    isLoading: false,
    lastRenderedMonth: null,
    allAvailableYears: [],
    currentActiveYear: null,
    visibleYearCount: 3,
    isScrollingProgrammatically: false,
    genreFiltersExpanded: false,
    networkFiltersExpanded: false,
    lastAutoRefreshAt: 0
};

// 暴露状态供其他模块访问
window.__appState = state;
window.syncCurrentCategoryData = syncCurrentCategoryData;
window.typeWriterEffect = typeWriterEffect;

// 暴露 appContext 供 share.js 使用
window.appContext = {
    resolvePosterUrl,
    getGenreDisplayName,
    HIDDEN_GENRES: new Set(['剧情', '动画']),
    showToast
};

// DOM 元素缓存
const elements = {};

function cacheElements() {
    elements.pageTitleText = document.getElementById('page-title-text');
    elements.mainTitle = document.querySelector('h1');
    elements.categoryFilterContainer = document.getElementById('category-filter-container');
    elements.ratingFilterContainer = document.getElementById('rating-filter-container');
    elements.genreFilterContainer = document.getElementById('genre-filter-container');
    elements.genreFilterToggle = document.getElementById('genre-filter-toggle');
    elements.loadingOverlay = document.getElementById('loading-overlay');
    elements.comingSoonContainer = document.getElementById('coming-soon-container');
    elements.yearList = document.getElementById('year-list');
    elements.statusMessage = document.getElementById('status-message');
    elements.fileInput = document.getElementById('file-input');
    elements.resultsContainer = document.getElementById('results-container');
    elements.noResultsMessage = document.getElementById('no-results');
    elements.loader = document.getElementById('loader');
    elements.skeletonContainer = document.getElementById('skeleton-container');
    elements.radarSearchInput = document.getElementById('radar-search');
    elements.backToTopBtn = document.getElementById('back-to-top');
}

// =====================================================
// 核心业务逻辑
// =====================================================

function getCurrentCategoryConfig() {
    return CATEGORY_CONFIG[state.currentCategoryId];
}

function getCurrentCategoryState() {
    return state.categoryState[state.currentCategoryId];
}

function resetFilterState() {
    state.specialFilterMode = null;
    state.selectedRating = '全部';
    state.selectedGenres = [];
    state.selectedNetworks = [];
    state.searchQuery = '';
    if (elements.radarSearchInput) {
        elements.radarSearchInput.value = '';
    }
    state.genreFiltersExpanded = false;
    state.networkFiltersExpanded = false;
}

function setCurrentCategory(categoryId) {
    if (!CATEGORY_CONFIG[categoryId]) return;

    state.currentCategoryId = categoryId;
    elements.categoryFilterContainer.querySelectorAll('.genre-tag').forEach((tag) => {
        tag.classList.toggle('active', tag.dataset.category === categoryId);
    });
}

async function switchCategory(categoryId) {
    if (categoryId === state.currentCategoryId || !CATEGORY_CONFIG[categoryId]) return;

    setCurrentCategory(categoryId);
    resetFilterState();
    populateRatingFilters();

    const catState = state.categoryState[categoryId];
    if (catState.latestLoaded || catState.completeLoaded) {
        syncCurrentCategoryData();
        if (!catState.completeLoaded) {
            loadCategoryData(categoryId, 'complete', state.categoryState);
        }
        return;
    }

    populateGenreFilters([]);
    showSkeletonLoader(elements.resultsContainer, elements.skeletonContainer);
    await ensureCategoryLoaded(categoryId);
}

async function ensureCategoryLoaded(categoryId) {
    const catState = state.categoryState[categoryId];

    if (catState.completeLoaded || catState.latestLoaded) {
        if (categoryId === state.currentCategoryId) {
            syncCurrentCategoryData();
        }
        if (!catState.completeLoaded) {
            loadCategoryData(categoryId, 'complete', state.categoryState);
        }
        return;
    }

    const latestLoaded = await loadCategoryData(categoryId, 'latest', state.categoryState);
    if (!latestLoaded) {
        await loadCategoryData(categoryId, 'complete', state.categoryState);
        return;
    }

    loadCategoryData(categoryId, 'complete', state.categoryState);
}

function syncCurrentCategoryData() {
    const catState = getCurrentCategoryState();
    state.allItems = syncAllItems(catState.items);
    updateSubtitleText();
    populateGenreFilters(state.allItems);
    filterAndRenderItems();
}

async function refreshCurrentCategoryData() {
    const catState = getCurrentCategoryState();
    const refreshLevel = catState.completeLoaded ? 'complete' : 'latest';

    if (!catState.latestLoaded && !catState.completeLoaded) return;

    await loadCategoryData(state.currentCategoryId, refreshLevel, state.categoryState, {
        forceRefresh: true,
        silent: true
    });
}

function scheduleCurrentCategoryRefresh() {
    const now = Date.now();
    if (now - state.lastAutoRefreshAt < 5 * 60 * 1000) return;

    state.lastAutoRefreshAt = now;
    refreshCurrentCategoryData().catch((error) => {
        console.error('Failed to refresh current category data:', error);
    });
}

function updateSubtitleText() {
    const updateDateElement = elements.mainTitle?.querySelector('.update-date');
    if (!updateDateElement) return;

    const updateDate = getCurrentCategoryState().updateDate;
    if (updateDate) {
        updateDateElement.textContent = `数据更新于：${formatUpdateTimestamp(updateDate)}`;
        updateDateElement.classList.remove('skeleton');
    } else {
        updateDateElement.textContent = '';
        updateDateElement.classList.add('skeleton');
    }
}

// =====================================================
// 筛选器 UI
// =====================================================

function populateRatingFilters() {
    if (!elements.ratingFilterContainer) return;

    elements.ratingFilterContainer.innerHTML = '';
    const ratingConfig = getCurrentRatingConfig(state.currentCategoryId);
    const ratingOptions = [...ratingConfig.thresholds, ratingConfig.special];

    ratingOptions.forEach(({ label, value }) => {
        const isActive =
            (state.specialFilterMode === 'recent_high_score' && value === 'recent_high_score') ||
            (!state.specialFilterMode && label === state.selectedRating);

        const tag = createRatingTag(label, value, isActive, () => {
            if (tag.classList.contains('active')) return;

            if (value === 'recent_high_score') {
                state.specialFilterMode = 'recent_high_score';
            } else {
                state.specialFilterMode = null;
                state.selectedRating = label;
            }

            populateRatingFilters();
            filterAndRenderItems();
        });

        elements.ratingFilterContainer.appendChild(tag);
    });
}

function populateGenreFilters(items) {
    const availableGenres = getSortedGenres(items);
    state.selectedGenres = state.selectedGenres.filter((genre) => availableGenres.includes(genre));

    elements.genreFilterContainer.innerHTML = '';

    const allTag = createGenreTag('全部', '全部', state.selectedGenres.length === 0, handleGenreClick);
    elements.genreFilterContainer.appendChild(allTag);

    availableGenres.forEach((genreName) => {
        const tag = createGenreTag(
            getGenreDisplayName(genreName),
            genreName,
            state.selectedGenres.includes(genreName),
            () => handleGenreClick(genreName, tag)
        );
        elements.genreFilterContainer.appendChild(tag);
    });

    requestAnimationFrame(() => updateGenreFilterCollapse());
}

function handleGenreClick(actualValue, tag) {
    const isActive = tag.classList.contains('active');

    if (actualValue === '全部') {
        if (isActive) return;
        state.selectedGenres = [];
    } else if (isActive) {
        state.selectedGenres = state.selectedGenres.filter((genre) => genre !== actualValue);
    } else {
        state.selectedGenres.push(actualValue);
    }

    populateGenreFilters(state.allItems);
    filterAndRenderItems();

    if (isMobile()) {
        tag.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    }
}

function handleNetworkClick(networkName, tag) {
    const isActive = tag.classList.contains('active');

    if (networkName === '全部') {
        if (isActive) return;
        state.selectedNetworks = [];
    } else if (isActive) {
        state.selectedNetworks = state.selectedNetworks.filter((network) => network !== networkName);
    } else {
        state.selectedNetworks.push(networkName);
    }

    populateNetworkFilters(state.allItems);
    filterAndRenderItems();

    if (isMobile()) {
        tag.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    }
}

function populateNetworkFilters(items) {
    const networkFilterContainer = document.getElementById('network-filter-container');
    const networkFilterToggle = document.getElementById('network-filter-toggle');

    if (!networkFilterContainer) {
        state.selectedNetworks = [];
        return;
    }

    const config = getCurrentCategoryConfig();
    const networkFilterSection = networkFilterContainer.closest('.filter-block-network');

    state.selectedNetworks = config.showNetworkFilter ? state.selectedNetworks : [];
    networkFilterContainer.innerHTML = '';

    if (!config.showNetworkFilter) {
        if (networkFilterSection) networkFilterSection.style.display = 'none';
        networkFilterContainer.style.display = 'none';
        if (networkFilterToggle) networkFilterToggle.hidden = true;
        return;
    }

    if (networkFilterSection) networkFilterSection.style.display = '';
    networkFilterContainer.style.display = '';

    const availableNetworks = getSortedNetworks(items);
    state.selectedNetworks = state.selectedNetworks.filter((network) => availableNetworks.includes(network));

    const allTag = createNetworkTag('全部', state.selectedNetworks.length === 0, () => handleNetworkClick('全部', allTag));
    networkFilterContainer.appendChild(allTag);

    availableNetworks.forEach((networkName) => {
        const tag = createNetworkTag(networkName, state.selectedNetworks.includes(networkName), () =>
            handleNetworkClick(networkName, tag)
        );
        networkFilterContainer.appendChild(tag);
    });

    requestAnimationFrame(() => updateNetworkFilterCollapse());
}

function updateGenreFilterCollapse() {
    updateFilterCollapse(
        elements.genreFilterContainer,
        elements.genreFilterToggle,
        state.genreFiltersExpanded
    );
}

function updateNetworkFilterCollapse() {
    updateFilterCollapse(
        document.getElementById('network-filter-container'),
        document.getElementById('network-filter-toggle'),
        state.networkFiltersExpanded,
        getCurrentCategoryConfig().showNetworkFilter
    );
}

// =====================================================
// 渲染逻辑
// =====================================================

function filterAndRenderItems() {
    const { futureItems, filteredPastAndPresentItems } = applyFilters(
        state.allItems,
        {
            searchQuery: state.searchQuery,
            specialFilterMode: state.specialFilterMode,
            selectedRating: state.selectedRating,
            selectedGenres: state.selectedGenres,
            selectedNetworks: state.selectedNetworks
        },
        state.currentCategoryId
    );

    state.filteredPastAndPresentItems = filteredPastAndPresentItems;

    elements.comingSoonContainer.style.display = 'none';
    renderComingSoon(futureItems, openIntelDossier);
    startRendering();

    // 更新移动端状态
    updateFabState();
    syncMobileCategoryLabel();
}

function startRendering() {
    if (elements.skeletonContainer) {
        elements.skeletonContainer.style.display = 'none';
    }

    elements.resultsContainer.innerHTML = '';
    elements.noResultsMessage.style.display = 'none';

    if (state.specialFilterMode === 'recent_high_score') {
        document.getElementById('interactive-timeline')?.classList.remove('visible');
        elements.comingSoonContainer.style.display = 'none';
    } else {
        document.getElementById('interactive-timeline')?.classList.add('visible');
    }

    state.currentPage = 1;
    state.lastRenderedMonth = null;

    state.allAvailableYears = [
        ...new Set(state.filteredPastAndPresentItems.map((item) => item.date.substring(0, 4)))
    ];
    if (elements.comingSoonContainer.style.display === 'block') {
        state.allAvailableYears.unshift(FUTURE_TAG);
    }

    state.visibleYearCount = Math.min(3, state.allAvailableYears.length);
    state.currentActiveYear = null;

    if (state.filteredPastAndPresentItems.length === 0 && elements.comingSoonContainer.style.display === 'none') {
        elements.noResultsMessage.style.display = 'block';
    }

    if (state.allAvailableYears.length > 0 || state.specialFilterMode === 'recent_high_score') {
        if (state.specialFilterMode !== 'recent_high_score') {
            renderTimeline(state.allAvailableYears, state.currentActiveYear, state.visibleYearCount, handleYearClick);
        }
        loadMoreItems();
    } else {
        elements.yearList.innerHTML = '';
        elements.loader.style.display = 'none';
        document.getElementById('interactive-timeline')?.classList.remove('visible');
    }
}

function loadMoreItems() {
    if (state.isLoading) return;

    state.isLoading = true;

    if (!elements.loadingOverlay?.classList.contains('visible') && !state.isScrollingProgrammatically) {
        elements.loader.style.display = 'block';
    }

    const startIndex = (state.currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    const itemsToRender = state.filteredPastAndPresentItems.slice(startIndex, endIndex);

    if (itemsToRender.length > 0) {
        appendItemsToContainer(itemsToRender, elements.resultsContainer, state.specialFilterMode, openIntelDossier);
        state.currentPage += 1;
    }

    state.isLoading = false;
    elements.loader.style.display = 'none';

    if (state.specialFilterMode !== 'recent_high_score') {
        updateActiveTimeline();
    }
}

async function loadMoreItemsAsync() {
    return new Promise((resolve) => {
        if (state.isLoading) {
            resolve();
            return;
        }

        state.isLoading = true;
        const startIndex = (state.currentPage - 1) * ITEMS_PER_PAGE;
        const endIndex = startIndex + ITEMS_PER_PAGE;
        const itemsToRender = state.filteredPastAndPresentItems.slice(startIndex, endIndex);

        if (itemsToRender.length > 0) {
            appendItemsToContainer(itemsToRender, elements.resultsContainer, state.specialFilterMode, openIntelDossier);
            state.currentPage += 1;
        }

        state.isLoading = false;
        setTimeout(resolve, 50);
    });
}

function handleYearClick(year, isLastItem) {
    if (isLastItem && state.visibleYearCount < state.allAvailableYears.length) {
        state.visibleYearCount = Math.min(state.allAvailableYears.length, state.visibleYearCount + 2);
    }
    scrollToYear(year);
}

async function scrollToYear(year) {
    state.isScrollingProgrammatically = true;
    renderTimeline(state.allAvailableYears, year, state.visibleYearCount, handleYearClick);
    state.currentActiveYear = year;

    const currentYearIndex = state.allAvailableYears.indexOf(year);
    const nextYearToPreload = state.allAvailableYears[currentYearIndex + 1];

    const mainTask = ensureYearIsLoadedAndScroll(year, false);
    if (nextYearToPreload) {
        ensureYearIsLoadedAndScroll(nextYearToPreload, true);
    }
    await mainTask;

    setTimeout(() => {
        state.isScrollingProgrammatically = false;
    }, 1000);
}

async function ensureYearIsLoadedAndScroll(year, preloadOnly = false) {
    let targetElement;
    if (year === FUTURE_TAG) {
        targetElement = document.body;
    } else {
        targetElement = document.querySelector(`#results-container .month-group-header[id^="month-${year}"]`);
    }

    if (!targetElement && year !== FUTURE_TAG) {
        if (!preloadOnly) {
            elements.loadingOverlay?.classList.add('visible');
        }

        while (!targetElement && (state.currentPage - 1) * ITEMS_PER_PAGE < state.filteredPastAndPresentItems.length) {
            await loadMoreItemsAsync();
            targetElement = document.querySelector(`#results-container .month-group-header[id^="month-${year}"]`);
        }

        if (!preloadOnly) {
            elements.loadingOverlay?.classList.remove('visible');
        }
    }

    if (targetElement && !preloadOnly) {
        setTimeout(() => {
            targetElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 50);
    }
}

function updateActiveTimeline() {
    if (state.isScrollingProgrammatically) return;

    let topVisibleYear = null;
    const comingSoonRect = elements.comingSoonContainer.getBoundingClientRect();

    if (
        elements.comingSoonContainer.style.display === 'block' &&
        comingSoonRect.top >= 0 &&
        comingSoonRect.top < window.innerHeight * 0.4
    ) {
        topVisibleYear = FUTURE_TAG;
    } else {
        const headers = document.querySelectorAll('#results-container .month-group-header');
        if (headers.length > 0) {
            headers.forEach((header) => {
                if (header.getBoundingClientRect().top < window.innerHeight * 0.4) {
                    topVisibleYear = header.id.substring(6, 10);
                }
            });
            if (!topVisibleYear) {
                topVisibleYear = state.allAvailableYears.find((year) => year !== FUTURE_TAG) || null;
            }
        } else if (state.allAvailableYears.includes(FUTURE_TAG)) {
            topVisibleYear = FUTURE_TAG;
        }
    }

    if (topVisibleYear && topVisibleYear !== state.currentActiveYear) {
        state.currentActiveYear = topVisibleYear;
        const currentIndex = state.allAvailableYears.indexOf(state.currentActiveYear);
        if (currentIndex >= state.visibleYearCount - 1 && state.visibleYearCount < state.allAvailableYears.length) {
            state.visibleYearCount = Math.min(state.allAvailableYears.length, currentIndex + 2);
        }
        renderTimeline(state.allAvailableYears, state.currentActiveYear, state.visibleYearCount, handleYearClick);
    }
}

// =====================================================
// 初始化
// =====================================================

async function initialize() {
    updateDoubanUI();
    populateRatingFilters();
    populateGenreFilters([]);
    showSkeletonLoader(elements.resultsContainer, elements.skeletonContainer);

    try {
        await hydrateDoubanStatuses();
        await ensureCategoryLoaded(DEFAULT_CATEGORY_ID);
    } catch (error) {
        elements.statusMessage.textContent = '加载数据失败或文件格式无效。';
        elements.statusMessage.style.color = '#F44336';
        console.error('Initialize failed:', error);
        if (elements.skeletonContainer) {
            elements.skeletonContainer.style.display = 'none';
        }
        elements.comingSoonContainer.style.display = 'none';
    }
}

function setupEventListeners() {
    // 分类筛选
    elements.categoryFilterContainer.addEventListener('click', (event) => {
        const target = event.target.closest('.genre-tag');
        if (!target || !target.dataset.category) return;
        void switchCategory(target.dataset.category);
    });

    // 文件上传
    elements.fileInput.addEventListener('change', (event) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (readerEvent) => {
            try {
                const data = JSON.parse(readerEvent.target.result);
                ingestCategoryData(state.currentCategoryId, data, 'complete', state.categoryState);
                const catState = state.categoryState[state.currentCategoryId];
                catState.latestLoaded = true;
                catState.completeLoaded = true;
                elements.statusMessage.textContent = `已加载文件：${file.name}`;
                elements.statusMessage.style.color = 'green';
            } catch (error) {
                elements.statusMessage.textContent = `文件 "${file.name}" 不是有效的当前分类 JSON 格式。`;
                elements.statusMessage.style.color = 'red';
            }
        };
        reader.readAsText(file);
    });

    // 滚动事件
    let scrollTimeout;
    window.addEventListener('scroll', () => {
        clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(() => {
            updateActiveTimeline();
            if (!state.isLoading && window.innerHeight + window.scrollY >= document.body.offsetHeight - 500) {
                loadMoreItems();
            }
        }, 50);
    });

    // 返回顶部
    setupBackToTop(elements.backToTopBtn);

    // 筛选器展开收起
    elements.genreFilterToggle?.addEventListener('click', () => {
        state.genreFiltersExpanded = !state.genreFiltersExpanded;
        updateGenreFilterCollapse();
    });

    const networkFilterToggle = document.getElementById('network-filter-toggle');
    networkFilterToggle?.addEventListener('click', () => {
        state.networkFiltersExpanded = !state.networkFiltersExpanded;
        updateNetworkFilterCollapse();
    });

    window.addEventListener('resize', () => {
        requestAnimationFrame(updateGenreFilterCollapse);
        requestAnimationFrame(updateNetworkFilterCollapse);
    });

    // 搜索
    if (elements.radarSearchInput) {
        elements.radarSearchInput.addEventListener('input', (e) => {
            state.searchQuery = e.target.value.trim();
            filterAndRenderItems();
        });
    }

    // 页面可见性变化时刷新
    window.addEventListener('focus', scheduleCurrentCategoryRefresh);
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            scheduleCurrentCategoryRefresh();
        }
    });
}

async function shareDossier(item) {
    if (!item) {
        showToast('当前没有可分享内容');
        return;
    }

    try {
        if (!window.ShareModule) {
            throw new Error('分享模块未加载');
        }
        await window.ShareModule.shareItem(item);
    } catch (error) {
        console.error('分享失败:', error);
        showToast('分享失败，已取消');
    }
}

// =====================================================
// 自定义光标
// =====================================================

function setupCustomCursor() {
    const cursorCore = document.getElementById('custom-cursor-core');
    const cursorRing = document.getElementById('custom-cursor-ring');

    if (!cursorCore || !cursorRing) return;

    let mouseX = window.innerWidth / 2;
    let mouseY = window.innerHeight / 2;

    document.addEventListener('mousemove', (e) => {
        mouseX = e.clientX;
        mouseY = e.clientY;
    }, { passive: true });

    const updateCursor = () => {
        cursorCore.style.left = mouseX + 'px';
        cursorCore.style.top = mouseY + 'px';
        cursorRing.style.left = mouseX + 'px';
        cursorRing.style.top = mouseY + 'px';
        requestAnimationFrame(updateCursor);
    };
    requestAnimationFrame(updateCursor);

    const setHoverState = () => document.body.classList.add('cursor-hover');
    const removeHoverState = () => document.body.classList.remove('cursor-hover');

    const interactiveSelectors = [
        'a',
        'button',
        'input',
        '.clickable',
        '.genre-tag',
        '.scroller-arrow',
        '.poster-link',
        '.interactive-timeline li',
        '.year-item',
        '.card-poster-container',
        '.card-title'
    ].join(',');

    document.addEventListener('mouseover', (e) => {
        if (e.target.closest(interactiveSelectors)) {
            setHoverState();
        }
    });

    document.addEventListener('mouseout', (e) => {
        if (e.target.closest(interactiveSelectors)) {
            removeHoverState();
        }
    });
}

// =====================================================
// 启动应用
// =====================================================

function bootstrapApp() {
    // 立即显示 body（防止 visibility:hidden 造成的移动端闪屏）
    document.body.style.visibility = 'visible';

    cacheElements();

    // 设置页面标题（直接赋值，避免打字机乱码动画造成闪烁）
    document.title = DEFAULT_TITLE;
    if (elements.pageTitleText) {
        elements.pageTitleText.textContent = DEFAULT_TITLE;
    }

    setCurrentCategory(DEFAULT_CATEGORY_ID);

    // 初始化所有模块
    setupEventListeners();
    setupScrollFade(elements.ratingFilterContainer);
    setupScrollFade(elements.genreFilterContainer);
    setupScrollFade(document.getElementById('network-filter-container'));

    // 初始化详情面板
    initDossierEvents(shareDossier);

    // 初始化移动端 Action Sheet
    initMobileSheetEvents();

    // 设置自定义光标
    setupCustomCursor();

    // 启动应用
    initialize();
}

// 启动
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrapApp, { once: true });
} else {
    bootstrapApp();
}
