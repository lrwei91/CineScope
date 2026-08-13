/**
 * 主应用入口
 * 整合所有模块，管理全局状态和应用生命周期
 */

import {
    CATEGORY_CONFIG,
    DEFAULT_TITLE,
    DEFAULT_CATEGORY_ID,
    ITEMS_PER_PAGE,
    createCategoryState
} from './js/modules/config.js';

import {
    loadCategoryData,
    ingestCategoryData,
    formatUpdateTimestamp
} from './js/modules/data-loader.js?v=20260811b';

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
    appendItemsToContainer
} from './js/modules/renderer.js?v=20260813a';


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
    setupBackToTop,
    setupEditorialMotion
} from './js/modules/ui-controls.js?v=20260811b';

import {
    openIntelDossier,
    initDossierEvents
} from './js/modules/dossier.js?v=20260813b';

import {
    openTrailerModal,
    initTrailerModalEvents
} from './js/modules/trailer-modal.js';

import {
    isMobile,
    syncMobileSheetFilters,
    updateFabState,
    initMobileSheetEvents
} from './js/modules/mobile-sheet.js?v=20260811b';

import { getNextPageRange } from './js/modules/paging.js';
import { ShareModule } from './share.js?v=20260811b';

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
    genreFiltersExpanded: false,
    lastAutoRefreshAt: 0,
    isSwitchingCategory: false
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
    state.searchQuery = '';
    if (elements.radarSearchInput) {
        elements.radarSearchInput.value = '';
    }
    const mobileSheetSearch = document.getElementById('mobile-sheet-search');
    if (mobileSheetSearch) {
        mobileSheetSearch.value = '';
    }
    state.genreFiltersExpanded = false;
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
        tag.setAttribute('aria-pressed', String(isActive));
    });
    syncMobileSheetFilters();
    updateFabState(state);
}

/**
 * 淡出主内容区域，执行回调后淡入。
 * 用于分类切换时消除视觉闪烁。
 */
function crossfadeMainContent(swapCallback) {
    const mainContent = document.getElementById('main-content');
    if (!mainContent) {
        swapCallback();
        return Promise.resolve();
    }

    if (getScrollBehavior() === 'auto') {
        swapCallback();
        return Promise.resolve();
    }

    return new Promise((resolve) => {
        mainContent.classList.add('category-fade-out');

        const afterFadeOut = () => {
            mainContent.removeEventListener('transitionend', afterFadeOut);
            swapCallback();

            // 在下一帧移除 fade-out 让 transition 反向播放（淡入）
            requestAnimationFrame(() => {
                mainContent.classList.remove('category-fade-out');
                resolve();
            });
        };

        mainContent.addEventListener('transitionend', afterFadeOut, { once: true });

        // 兜底：如果 transition 被跳过（例如 prefers-reduced-motion），150ms 后强制继续
        setTimeout(() => {
            if (mainContent.classList.contains('category-fade-out')) {
                mainContent.removeEventListener('transitionend', afterFadeOut);
                afterFadeOut();
            }
        }, 200);
    });
}

async function switchCategory(categoryId) {
    if (categoryId === state.currentCategoryId || !CATEGORY_CONFIG[categoryId] || state.isSwitchingCategory) return;

    state.isSwitchingCategory = true;

    resetFilterState();
    setCurrentCategory(categoryId);
    populateRatingFilters();

    const catState = state.categoryState[categoryId];
    if (catState.latestLoaded || catState.completeLoaded) {
        // 已缓存的分类：淡出 → 换内容 → 淡入（跳过卡片级联动画）
        elements.resultsContainer.classList.add('no-cascade');
        await crossfadeMainContent(() => {
            window.scrollTo({ top: 0 });
            syncCurrentCategoryData();
        });
        // 淡入完成后恢复级联动画（供后续分页使用）
        requestAnimationFrame(() => {
            elements.resultsContainer.classList.remove('no-cascade');
        });
        if (!catState.completeLoaded) {
            loadCategoryData(categoryId, 'complete', state.categoryState, buildLoadOptions({ silent: true }));
        }
        state.isSwitchingCategory = false;
        return;
    }

    // 未缓存的分类：淡出 → 显示骨架屏 → 淡入骨架屏 → 加载数据
    await crossfadeMainContent(() => {
        window.scrollTo({ top: 0 });
        populateGenreFilters([]);
        showSkeletonLoader(elements.resultsContainer, elements.skeletonContainer);
    });

    const loaded = await ensureCategoryLoaded(categoryId);
    if (!loaded) {
        showLoadError();
    }
    state.isSwitchingCategory = false;
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
        elements.statusMessage.dataset.state = 'error';
        elements.statusMessage.closest('.file-loader')?.classList.add('visible');
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
        elements.noResultsMessage.dataset.state = 'error';
        elements.noResultsMessage.style.display = 'block';
    }
    elements.loader.style.display = 'none';
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

function filterAndRenderItems(options = {}) {
    const { preserveRenderedContent = false } = options;
    const nextResults = getFilteredResults(state.allItems);
    state.filteredPastAndPresentItems = nextResults.filteredPastAndPresentItems;

    renderComingSoon(nextResults.futureItems, openIntelDossier, openTrailerModal);

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
    } else {
        startRendering();
    }

    // 更新移动端状态
    updateFabState(state);
}

function startRendering() {
    if (elements.skeletonContainer) {
        elements.skeletonContainer.style.display = 'none';
    }

    elements.resultsContainer.innerHTML = '';
    elements.noResultsMessage.textContent = '没有找到符合条件的内容。';
    elements.noResultsMessage.dataset.state = 'empty';
    elements.noResultsMessage.style.display = 'none';

    // 首次渲染内容时显示 body（如果还没显示）
    if (document.body.style.visibility !== 'visible') {
        document.body.style.visibility = 'visible';
    }

    if (state.specialFilterMode === 'recent_high_score') {
        elements.comingSoonContainer.style.display = 'none';
    }

    state.currentPage = 1;
    state.renderedItemCount = 0;
    state.lastRenderedMonth = null;

    if (state.filteredPastAndPresentItems.length === 0 && elements.comingSoonContainer.style.display === 'none') {
        elements.noResultsMessage.textContent = '没有找到符合条件的内容。';
        elements.noResultsMessage.style.display = 'block';
    }

    if (state.filteredPastAndPresentItems.length > 0) {
        loadMoreItems();
    } else {
        elements.loader.style.display = 'none';
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

    if (!elements.loadingOverlay?.classList.contains('visible')) {
        elements.loader.style.display = 'block';
    }

    appendNextItemsToResults();

    state.isLoading = false;
    elements.loader.style.display = 'none';

}

// =====================================================
// 初始化
// =====================================================

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
    } catch (error) {
        console.error('Initialize failed:', error);
        showLoadError();
    }
}

function setupEventListeners() {
    // 分类筛选 (通过 Hash 驱动独立路由)
    elements.categoryFilterContainer.addEventListener('click', (event) => {
        const target = event.target.closest('.genre-tag');
        if (!target || !target.dataset.category) return;
        window.location.hash = target.dataset.category;
    });

    // 监听 Hash 变化以实现独立路由切换
    window.addEventListener('hashchange', () => {
        const categoryId = window.location.hash.replace('#', '');
        if (CATEGORY_CONFIG[categoryId]) {
            void switchCategory(categoryId);
        }
    });

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
                elements.statusMessage.dataset.state = 'success';
            } catch (error) {
                elements.statusMessage.textContent = `文件 "${file.name}" 不是有效的当前分类 JSON 格式。`;
                elements.statusMessage.dataset.state = 'error';
                showLoadError(`文件 "${file.name}" 不是有效的当前分类 JSON 格式。`);
            }
        };
        reader.readAsText(file);
    });

    // 单一 passive scroll 入口，在 RAF 中统一分页、进度与返回顶部状态。
    const updateBackToTop = setupBackToTop(elements.backToTopBtn);
    let scrollFrame = 0;
    const updateScrollDrivenUI = () => {
        scrollFrame = 0;
        const scrollY = window.scrollY;
        const scrollRange = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
        const progress = Math.max(0, Math.min(1, scrollY / scrollRange));
        document.documentElement.style.setProperty('--page-progress', String(progress));

        updateBackToTop(scrollY);
        if (!state.isLoading && window.innerHeight + scrollY >= document.body.offsetHeight - 500) {
            loadMoreItems();
        }
    };
    const scheduleScrollFrame = () => {
        if (!scrollFrame) scrollFrame = requestAnimationFrame(updateScrollDrivenUI);
    };
    window.addEventListener('scroll', scheduleScrollFrame, { passive: true });
    scheduleScrollFrame();

    // 筛选器展开收起
    elements.genreFilterToggle?.addEventListener('click', () => {
        state.genreFiltersExpanded = !state.genreFiltersExpanded;
        updateGenreFilterCollapse();
    });

    window.addEventListener('resize', () => {
        requestAnimationFrame(updateGenreFilterCollapse);
        scheduleScrollFrame();
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
    cacheElements();

    // 设置页面标题（直接赋值，避免打字机乱码动画造成闪烁）
    document.title = DEFAULT_TITLE;
    // 解析初始 Hash 路由，默认为 DEFAULT_CATEGORY_ID
    let initialCategory = window.location.hash.replace('#', '');
    if (!CATEGORY_CONFIG[initialCategory]) {
        initialCategory = DEFAULT_CATEGORY_ID;
        window.location.hash = DEFAULT_CATEGORY_ID;
    }

    setCurrentCategory(initialCategory);

    // 设置事件监听器
    setupEventListeners();
    setupScrollFade(elements.ratingFilterContainer);
    setupScrollFade(elements.genreFilterContainer);
    setupEditorialMotion();

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
