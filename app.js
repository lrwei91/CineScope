/**
 * 主应用入口
 * 整合所有模块，管理全局状态和应用生命周期
 */

import {
    CATEGORY_CONFIG,
    DEFAULT_CATEGORY_ID,
    ITEMS_PER_PAGE,
    FUTURE_TAG,
    createCategoryState
} from './js/modules/config.js';

import {
    loadCategoryData,
    ingestCategoryData,
    formatUpdateTimestamp
} from './js/modules/data-loader.js';

import {
    getCurrentRatingConfig,
    getGenreDisplayName,
    getSortedGenres,
    applyFilters,
    createRatingTag,
    createGenreTag
} from './js/modules/filters.js';

import {
    showSkeletonLoader,
    renderComingSoon,
    renderTimeline,
    appendItemsToContainer
} from './js/modules/renderer.js?v=20260731a';

import {
    buildYearGroups,
    selectFeaturedItems
} from './js/modules/editorial.js?v=20260731a';


import {
    hydrateDoubanStatuses,
    syncAllItems,
    configureDoubanSync,
    updateUI as updateDoubanUI
} from './js/modules/douban-sync.js';

import {
    getScrollBehavior,
    updateFilterCollapse,
    setupScrollFade,
    showToast,
    setupBackToTop
} from './js/modules/ui-controls.js';

import {
    openIntelDossier,
    initDossierEvents
} from './js/modules/dossier.js?v=20260730b';

import {
    openTrailerModal,
    initTrailerModalEvents
} from './js/modules/trailer-modal.js';

import {
    isMobile,
    syncMobileCategoryLabel,
    syncMobileSheetFilters,
    updateFabState,
    initMobileSheetEvents
} from './js/modules/mobile-sheet.js';

import { getNextPageRange } from './js/modules/paging.js';
import { ensureCatalogMobileControls, ensureMediaOverlays } from './js/modules/site-shell.js';
import { ShareModule } from './share.js';

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
    selectedRating: '全部',
    searchQuery: '',
    currentPage: 1,
    renderedItemCount: 0,
    isLoading: false,
    lastRenderedMonth: null,
    allAvailableYears: [],
    currentActiveYear: null,
    visibleYearCount: 4,
    currentFutureItems: [],
    isScrollingProgrammatically: false,
    genreFiltersExpanded: false,
    lastAutoRefreshAt: 0,
    requestedYear: null,
    requestedYearApplied: false
};

// 统一封装 loadCategoryData 的回调选项（避免每个调用点重复透传）
function buildLoadOptions(extra = {}) {
    return {
        getCurrentCategoryId: () => state.currentCategoryId,
        onSync: () => syncCurrentCategoryData(),
        isDesktop: !isMobile(),
        ...extra
    };
}

// DOM 元素缓存
const elements = {};

function cacheElements() {
    elements.updateDate = document.querySelector('.update-date');
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
    elements.headerSearchButton = document.getElementById('header-search-btn');
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

function setCurrentCategory(categoryId) {
    if (!CATEGORY_CONFIG[categoryId]) return;

    state.currentCategoryId = categoryId;
    if (elements.resultsContainer) {
        elements.resultsContainer.dataset.category = categoryId;
    }
    elements.categoryFilterContainer.querySelectorAll('.genre-tag').forEach((tag) => {
        const isActive = tag.dataset.category === categoryId;
        tag.classList.toggle('active', isActive);
        if (isActive) {
            tag.setAttribute('aria-current', 'page');
        } else {
            tag.removeAttribute('aria-current');
        }
    });
    syncMobileSheetFilters();
    updateFabState(state);
}

async function ensureCategoryLoaded(categoryId) {
    const catState = state.categoryState[categoryId];
    const config = CATEGORY_CONFIG[categoryId];
    const options = buildLoadOptions();

    if (catState.completeLoaded || catState.latestLoaded) {
        if (categoryId === state.currentCategoryId) {
            syncCurrentCategoryData();
        }
        if (!catState.completeLoaded) {
            loadCategoryData(categoryId, 'complete', state.categoryState, { ...options, silent: true });
        }
        return true;
    }

    if (config?.preferCompleteOnFirstLoad) {
        return loadCategoryData(categoryId, 'complete', state.categoryState, options);
    }

    const latestLoaded = await loadCategoryData(categoryId, 'latest', state.categoryState, options);
    if (!latestLoaded) {
        return loadCategoryData(categoryId, 'complete', state.categoryState, { ...options, silent: true });
    }

    loadCategoryData(categoryId, 'complete', state.categoryState, { ...options, silent: true });
    return true;
}

function syncCurrentCategoryData() {
    const catState = getCurrentCategoryState();
    if (!catState || (!catState.latestLoaded && !catState.completeLoaded)) return;

    const previousItems = state.allItems;
    state.allItems = syncAllItems(catState.items);
    updateSubtitleText();
    populateGenreFilters(state.allItems);
    filterAndRenderItems({
        preserveRenderedContent: true,
        previousItems
    });
    applyRequestedYear();
}

async function refreshCurrentCategoryData() {
    const catState = getCurrentCategoryState();
    const refreshLevel = catState.completeLoaded ? 'complete' : 'latest';

    if (!catState.latestLoaded && !catState.completeLoaded) return;

    await loadCategoryData(state.currentCategoryId, refreshLevel, state.categoryState, {
        forceRefresh: true,
        silent: true,
        ...buildLoadOptions()
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
    const updateDateElement = elements.updateDate;
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

function showLoadError(message = '加载数据失败，请稍后重试或手动选择当前分类 JSON 文件。') {
    if (elements.statusMessage) {
        elements.statusMessage.textContent = message;
        elements.statusMessage.style.color = '#ff6b8f';
    }
    if (elements.skeletonContainer) {
        elements.skeletonContainer.style.display = 'none';
    }
    if (elements.comingSoonContainer) {
        elements.comingSoonContainer.style.display = 'none';
    }
    if (elements.resultsContainer) {
        elements.resultsContainer.innerHTML = '';
    }
    if (elements.noResultsMessage) {
        elements.noResultsMessage.textContent = message;
        elements.noResultsMessage.style.display = 'block';
    }
    elements.loader.style.display = 'none';
    document.getElementById('interactive-timeline')?.classList.remove('visible');
    document.body.style.visibility = 'visible';
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

    syncMobileSheetFilters();
    updateFabState(state);
}

function populateGenreFilters(items) {
    const availableGenres = getSortedGenres(items);
    if (items.length > 0) {
        state.selectedGenres = state.selectedGenres.filter((genre) => availableGenres.includes(genre));
    }

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
    syncMobileSheetFilters();
    updateFabState(state);
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
        tag.scrollIntoView({ behavior: getScrollBehavior(), block: 'nearest', inline: 'nearest' });
    }
}

function updateGenreFilterCollapse() {
    updateFilterCollapse(
        elements.genreFilterContainer,
        elements.genreFilterToggle,
        state.genreFiltersExpanded
    );
}

// =====================================================
// 渲染逻辑
// =====================================================

function getCurrentFilters() {
    return {
        searchQuery: state.searchQuery,
        specialFilterMode: state.specialFilterMode,
        selectedRating: state.selectedRating,
        selectedGenres: state.selectedGenres
    };
}

function getFilteredResults(items) {
    return applyFilters(items, getCurrentFilters(), state.currentCategoryId);
}

function getTimelineGroups() {
    return buildYearGroups({
        years: state.allAvailableYears,
        items: state.filteredPastAndPresentItems,
        futureItems: state.currentFutureItems,
        futureTag: FUTURE_TAG,
        previewLimit: 4
    });
}

function updateTimelineMetadata() {
    state.allAvailableYears = [
        ...new Set(state.filteredPastAndPresentItems.map((item) => item.date.substring(0, 4)))
    ];
    if (state.currentFutureItems.length > 0) {
        state.allAvailableYears.unshift(FUTURE_TAG);
    }
    state.visibleYearCount = Math.min(
        Math.max(state.visibleYearCount, 4),
        Math.max(state.allAvailableYears.length, 0)
    );
    if (state.specialFilterMode !== 'recent_high_score') {
        const nextActiveYear = state.allAvailableYears.includes(state.currentActiveYear)
            ? state.currentActiveYear
            : null;
        renderTimeline(
            state.allAvailableYears,
            nextActiveYear,
            state.visibleYearCount,
            handleYearClick,
            getTimelineGroups()
        );
    }
}

function filterAndRenderItems(options = {}) {
    const { preserveRenderedContent = false } = options;
    const nextResults = getFilteredResults(state.allItems);
    state.filteredPastAndPresentItems = nextResults.filteredPastAndPresentItems;
    state.currentFutureItems = nextResults.futureItems;

    const featuredItems = selectFeaturedItems({
        futureItems: nextResults.futureItems,
        currentItems: nextResults.filteredPastAndPresentItems,
        limit: 4
    });
    renderComingSoon(featuredItems, openIntelDossier, openTrailerModal);

    if (preserveRenderedContent && state.renderedItemCount > 0) {
        elements.resultsContainer.innerHTML = '';
        const itemsToRender = state.filteredPastAndPresentItems.slice(0, state.renderedItemCount);
        if (itemsToRender.length > 0) {
            appendItemsToContainer(
                itemsToRender,
                elements.resultsContainer,
                state.specialFilterMode,
                openIntelDossier,
                openTrailerModal
            );
        } else {
            elements.noResultsMessage.style.display = 'block';
        }
        updateTimelineMetadata();
    } else {
        startRendering();
    }

    // 更新移动端状态
    updateFabState(state);
    syncMobileCategoryLabel();
}

function startRendering() {
    if (elements.skeletonContainer) {
        elements.skeletonContainer.style.display = 'none';
    }

    elements.resultsContainer.innerHTML = '';
    elements.noResultsMessage.textContent = '没有找到符合条件的内容。';
    elements.noResultsMessage.style.display = 'none';

    // 首次渲染内容时显示 body（如果还没显示）
    if (document.body.style.visibility !== 'visible') {
        document.body.style.visibility = 'visible';
    }

    if (state.specialFilterMode === 'recent_high_score') {
        document.getElementById('interactive-timeline')?.classList.remove('visible');
        elements.comingSoonContainer.style.display = 'none';
    } else {
        document.getElementById('interactive-timeline')?.classList.add('visible');
    }

    state.currentPage = 1;
    state.renderedItemCount = 0;
    state.lastRenderedMonth = null;

    state.allAvailableYears = [
        ...new Set(state.filteredPastAndPresentItems.map((item) => item.date.substring(0, 4)))
    ];
    if (state.currentFutureItems.length > 0) {
        state.allAvailableYears.unshift(FUTURE_TAG);
    }

    state.visibleYearCount = Math.min(4, state.allAvailableYears.length);
    state.currentActiveYear = null;

    if (state.filteredPastAndPresentItems.length === 0 && state.currentFutureItems.length === 0) {
        elements.noResultsMessage.textContent = '没有找到符合条件的内容。';
        elements.noResultsMessage.style.display = 'block';
    }

    if (state.allAvailableYears.length > 0 || state.specialFilterMode === 'recent_high_score') {
        if (state.specialFilterMode !== 'recent_high_score') {
            renderTimeline(
                state.allAvailableYears,
                state.currentActiveYear,
                state.visibleYearCount,
                handleYearClick,
                getTimelineGroups()
            );
        }
        loadMoreItems();
    } else {
        elements.yearList.innerHTML = '';
        elements.loader.style.display = 'none';
        document.getElementById('interactive-timeline')?.classList.remove('visible');
    }
}

function appendNextItemsToResults() {
    const { startIndex, endIndex } = getNextPageRange(
        state.filteredPastAndPresentItems,
        state.renderedItemCount,
        ITEMS_PER_PAGE,
        { keepMonthIntact: true }
    );
    const itemsToRender = state.filteredPastAndPresentItems.slice(startIndex, endIndex);
    if (itemsToRender.length > 0) {
        appendItemsToContainer(
            itemsToRender,
            elements.resultsContainer,
            state.specialFilterMode,
            openIntelDossier,
            openTrailerModal
        );
        state.renderedItemCount = endIndex;
        state.currentPage += 1;
    }

    return itemsToRender.length;
}

function loadMoreItems() {
    if (state.isLoading) return;

    state.isLoading = true;

    if (!elements.loadingOverlay?.classList.contains('visible') && !state.isScrollingProgrammatically) {
        elements.loader.style.display = 'block';
    }

    appendNextItemsToResults();

    state.isLoading = false;
    elements.loader.style.display = 'none';

    if (state.specialFilterMode !== 'recent_high_score') {
        updateActiveTimeline();
    }
}

function handleYearClick(year, isLastItem) {
    if (isLastItem && state.visibleYearCount < state.allAvailableYears.length) {
        state.visibleYearCount = Math.min(state.allAvailableYears.length, state.visibleYearCount + 2);
    }
    scrollToYear(year);
}

async function scrollToYear(year) {
    state.isScrollingProgrammatically = true;
    renderTimeline(
        state.allAvailableYears,
        year,
        state.visibleYearCount,
        handleYearClick,
        getTimelineGroups()
    );
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
        targetElement = document.getElementById('discover');
    } else {
        targetElement = document.querySelector(`#results-container .month-group-header[id^="month-${year}"]`);
    }

    if (!targetElement && year !== FUTURE_TAG) {
        if (!preloadOnly) {
            elements.loadingOverlay?.classList.add('visible');
        }

        while (!targetElement && state.renderedItemCount < state.filteredPastAndPresentItems.length) {
            if (!state.isLoading) {
                state.isLoading = true;
                appendNextItemsToResults();
                state.isLoading = false;
            }
            // 等下一帧让浏览器渲染新卡片，再检查目标月份是否出现
            await new Promise((resolve) => setTimeout(resolve, 50));
            targetElement = document.querySelector(`#results-container .month-group-header[id^="month-${year}"]`);
        }

        if (!preloadOnly) {
            elements.loadingOverlay?.classList.remove('visible');
        }
    }

    if (targetElement && !preloadOnly) {
        setTimeout(() => {
            targetElement.scrollIntoView({ behavior: getScrollBehavior(), block: 'start' });
        }, 50);
    }
}

function updateActiveTimeline() {
    if (state.isScrollingProgrammatically) return;

    let topVisibleYear = null;
    const comingSoonRect = elements.comingSoonContainer.getBoundingClientRect();

    if (
        state.currentFutureItems.length > 0 &&
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
        renderTimeline(
            state.allAvailableYears,
            state.currentActiveYear,
            state.visibleYearCount,
            handleYearClick,
            getTimelineGroups()
        );
    }
}

// =====================================================
// 初始化
// =====================================================

function setupCatalogNavigation() {
    elements.headerSearchButton?.addEventListener('click', () => {
        elements.radarSearchInput?.focus();
    });
}

function applyRequestedYear() {
    if (
        state.requestedYearApplied ||
        !state.requestedYear ||
        !state.allAvailableYears.includes(state.requestedYear)
    ) {
        return;
    }
    state.requestedYearApplied = true;
    window.requestAnimationFrame(() => void scrollToYear(state.requestedYear));
}

async function initialize(initialCategoryId = DEFAULT_CATEGORY_ID) {
    updateDoubanUI();
    populateRatingFilters();
    populateGenreFilters([]);

    const catState = state.categoryState[initialCategoryId];
    const hasCachedData = catState.completeLoaded || catState.latestLoaded;

    // 只有在没有缓存数据时才显示骨架屏
    if (!hasCachedData) {
        showSkeletonLoader(elements.resultsContainer, elements.skeletonContainer);
    }

    try {
        const statusPromise = hydrateDoubanStatuses().catch((error) => {
            console.error('Douban status hydration failed:', error);
        });
        const loaded = await ensureCategoryLoaded(initialCategoryId);
        if (!loaded) {
            showLoadError();
        }
        await statusPromise;
        applyRequestedYear();
    } catch (error) {
        console.error('Initialize failed:', error);
        showLoadError();
    }
}

function setupEventListeners() {
    // 文件上传
    elements.fileInput.addEventListener('change', (event) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (readerEvent) => {
            try {
                const data = JSON.parse(readerEvent.target.result);
                ingestCategoryData(state.currentCategoryId, data, 'complete', state.categoryState, {
                    getCurrentCategoryId: () => state.currentCategoryId,
                    onSync: () => syncCurrentCategoryData()
                });
                const catState = state.categoryState[state.currentCategoryId];
                catState.latestLoaded = true;
                catState.completeLoaded = true;
                elements.statusMessage.textContent = `已加载文件：${file.name}`;
                elements.statusMessage.style.color = 'green';
            } catch (error) {
                elements.statusMessage.textContent = `文件 "${file.name}" 不是有效的当前分类 JSON 格式。`;
                elements.statusMessage.style.color = 'red';
                showLoadError(`文件 "${file.name}" 不是有效的当前分类 JSON 格式。`);
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

    window.addEventListener('resize', () => {
        requestAnimationFrame(updateGenreFilterCollapse);
    });

    // 搜索
    if (elements.radarSearchInput) {
        elements.radarSearchInput.addEventListener('input', (e) => {
            state.searchQuery = e.target.value.trim();
            const mobileSheetSearch = document.getElementById('mobile-sheet-search');
            if (mobileSheetSearch && mobileSheetSearch.value !== e.target.value) {
                mobileSheetSearch.value = e.target.value;
            }
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
        await ShareModule.shareItem(item);
    } catch (error) {
        console.error('分享失败:', error);
        showToast('分享失败，已取消');
    }
}

// =====================================================
// 启动应用
// =====================================================

function bootstrapApp() {
    ensureMediaOverlays();
    ensureCatalogMobileControls();
    cacheElements();

    const routeCategory = document.body.dataset.category;
    const initialCategory = CATEGORY_CONFIG[routeCategory] ? routeCategory : DEFAULT_CATEGORY_ID;
    const routeParams = new URLSearchParams(window.location.search);
    state.selectedGenres = routeParams.getAll('genre').filter(Boolean);
    state.searchQuery = (routeParams.get('q') || '').trim();
    state.requestedYear = routeParams.get('year');
    if (elements.radarSearchInput) elements.radarSearchInput.value = state.searchQuery;

    const categoryLabel = CATEGORY_CONFIG[initialCategory].label;
    document.title = `${categoryLabel}片单｜CineScope`;

    setCurrentCategory(initialCategory);

    // 设置事件监听器
    setupEventListeners();
    setupCatalogNavigation();
    setupScrollFade(elements.ratingFilterContainer);
    setupScrollFade(elements.genreFilterContainer);

    // 初始化详情面板
    initDossierEvents(shareDossier, openTrailerModal);
    initTrailerModalEvents();

    // 初始化移动端 Action Sheet
    initMobileSheetEvents(undefined, { getState: () => state });

    configureDoubanSync({
        onHydrated: syncCurrentCategoryData
    });

    // 启动应用
    initialize(initialCategory);
}

// 启动
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrapApp, { once: true });
} else {
    bootstrapApp();
}
