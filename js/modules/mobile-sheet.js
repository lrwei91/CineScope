/**
 * 移动端 Action Sheet 模块
 * 负责移动端筛选面板和分类选择面板
 */

/**
 * 移动端 Action Sheet 模块
 * 负责移动端筛选面板和分类选择面板
 */

import { focusModal, restoreModalFocus, syncBodyModalState, trapFocus } from './modal-state.js';

let getAppState = () => ({});
let filterReturnFocus = null;
let categoryReturnFocus = null;

/**
 * 检查是否为移动端
 */
export function isMobile() {
    return window.innerWidth <= 900;
}

/**
 * 打开筛选面板
 */
export function openMobileFilterSheet(onOpen) {
    const mobileFilterSheet = document.getElementById('mobile-filter-sheet');
    const mobileSheetOverlay = document.getElementById('mobile-sheet-overlay');
    if (!mobileFilterSheet || !mobileSheetOverlay) return;

    if (!mobileFilterSheet.classList.contains('active')) {
        filterReturnFocus = document.activeElement === document.body
            ? document.getElementById('mobile-filter-fab')
            : document.activeElement;
    }
    if (onOpen) onOpen();

    mobileFilterSheet.removeAttribute('inert');
    mobileFilterSheet.setAttribute('aria-hidden', 'false');
    mobileSheetOverlay.classList.add('active');
    mobileFilterSheet.classList.add('active');
    document.body.classList.add('modal-open');
    focusModal(mobileFilterSheet, '#close-filter-sheet');
}

/**
 * 关闭筛选面板
 */
export function closeMobileFilterSheet() {
    const mobileFilterSheet = document.getElementById('mobile-filter-sheet');
    const mobileSheetOverlay = document.getElementById('mobile-sheet-overlay');
    if (!mobileFilterSheet || !mobileSheetOverlay) return;

    const wasOpen = mobileFilterSheet.classList.contains('active');
    mobileFilterSheet.setAttribute('aria-hidden', 'true');
    mobileFilterSheet.setAttribute('inert', '');
    mobileSheetOverlay.classList.remove('active');
    mobileFilterSheet.classList.remove('active');
    syncBodyModalState();
    if (wasOpen) restoreModalFocus(filterReturnFocus);
    filterReturnFocus = null;
}

/**
 * 打开分类选择面板
 */
export function openMobileCategorySheet(onBuild) {
    const mobileCategorySheet = document.getElementById('mobile-category-sheet');
    const mobileCategoryOverlay = document.getElementById('mobile-category-overlay');
    if (!mobileCategorySheet || !mobileCategoryOverlay) return;

    if (!mobileCategorySheet.classList.contains('active')) {
        categoryReturnFocus = document.activeElement === document.body
            ? document.getElementById('mobile-category-trigger')
            : document.activeElement;
    }
    if (onBuild) onBuild();

    mobileCategorySheet.removeAttribute('inert');
    mobileCategorySheet.setAttribute('aria-hidden', 'false');
    mobileCategorySheet.classList.add('active');
    mobileCategoryOverlay.classList.add('active');
    document.body.classList.add('modal-open');
    const mobileCategoryTrigger = document.getElementById('mobile-category-trigger');
    if (mobileCategoryTrigger) {
        mobileCategoryTrigger.classList.add('open');
        mobileCategoryTrigger.setAttribute('aria-expanded', 'true');
    }
    focusModal(mobileCategorySheet, '#close-category-sheet');
}

/**
 * 关闭分类选择面板
 */
export function closeMobileCategorySheet() {
    const mobileCategorySheet = document.getElementById('mobile-category-sheet');
    const mobileCategoryOverlay = document.getElementById('mobile-category-overlay');
    if (!mobileCategorySheet || !mobileCategoryOverlay) return;

    const wasOpen = mobileCategorySheet.classList.contains('active');
    mobileCategorySheet.setAttribute('aria-hidden', 'true');
    mobileCategorySheet.setAttribute('inert', '');
    mobileCategorySheet.classList.remove('active');
    mobileCategoryOverlay.classList.remove('active');
    const mobileCategoryTrigger = document.getElementById('mobile-category-trigger');
    if (mobileCategoryTrigger) {
        mobileCategoryTrigger.classList.remove('open');
        mobileCategoryTrigger.setAttribute('aria-expanded', 'false');
    }
    syncBodyModalState();
    if (wasOpen) restoreModalFocus(categoryReturnFocus);
    categoryReturnFocus = null;
}

/**
 * 构建移动端分类 Pills
 */
export function buildMobileCategoryPills(container) {
    if (!container) return;
    container.innerHTML = '';

    const categoryTags = document.querySelectorAll('#category-filter-container .genre-tag');
    categoryTags.forEach((tag) => {
        const pill = document.createElement('a');
        pill.className = 'mobile-category-pill-item' + (tag.classList.contains('active') ? ' active' : '');
        pill.textContent = tag.textContent.trim();
        pill.dataset.category = tag.dataset.category;
        pill.href = tag.href;
        if (tag.classList.contains('active')) pill.setAttribute('aria-current', 'page');

        container.appendChild(pill);
    });
}

/**
 * 同步移动端分类标签
 */
export function syncMobileCategoryLabel() {
    const mobileCategoryLabel = document.getElementById('mobile-category-label');
    if (!mobileCategoryLabel) return;

    const activeTag = document.querySelector('#category-filter-container .genre-tag.active');
    if (activeTag) mobileCategoryLabel.textContent = activeTag.textContent.trim();
}

/**
 * 同步移动端筛选器镜像
 */
export function syncMobileSheetFilters() {
    const mobileRatingMirror = document.getElementById('mobile-rating-mirror');
    const mobileGenreMirror = document.getElementById('mobile-genre-mirror');
    if (!mobileRatingMirror || !mobileGenreMirror) return;

    // 镜像评分筛选
    mobileRatingMirror.innerHTML = '';
    document.querySelectorAll('#rating-filter-container .genre-tag').forEach((tag) => {
        const clone = tag.cloneNode(true);
        clone.addEventListener('click', () => {
            tag.click();
            setTimeout(() => syncMobileSheetFilters(), 50);
            updateFabState();
        });
        mobileRatingMirror.appendChild(clone);
    });

    // 镜像类型筛选
    mobileGenreMirror.innerHTML = '';
    document.querySelectorAll('#genre-filter-container .genre-tag').forEach((tag) => {
        const clone = tag.cloneNode(true);
        clone.addEventListener('click', () => {
            tag.click();
            setTimeout(() => syncMobileSheetFilters(), 50);
            updateFabState();
        });
        mobileGenreMirror.appendChild(clone);
    });

    const mobileSheetSearch = document.getElementById('mobile-sheet-search');
    const mainSearch = document.getElementById('radar-search');
    if (mobileSheetSearch && mainSearch && mobileSheetSearch.value !== mainSearch.value) {
        mobileSheetSearch.value = mainSearch.value;
    }

    // 同步豆瓣状态
    const doubanEl = document.getElementById('douban-auth-status');
    const mobileDoubanStatus = document.getElementById('mobile-douban-status');
    if (mobileDoubanStatus && doubanEl) {
        mobileDoubanStatus.textContent = doubanEl.textContent;
    }
}

/**
 * 更新 FAB 状态徽章
 */
export function updateFabState(appState = getAppState()) {
    const mobileFilterFab = document.getElementById('mobile-filter-fab');
    const fabActiveBadge = document.getElementById('fab-active-badge');
    if (!mobileFilterFab || !fabActiveBadge) return;

    const state = appState || {};
    const hasRating = Boolean(state.selectedRating && state.selectedRating !== '全部') || Boolean(state.specialFilterMode);
    const hasGenre = (state.selectedGenres || []).length > 0;
    const hasSearch = (state.searchQuery || '').length > 0;
    const totalActive =
        (hasRating ? 1 : 0) +
        (hasGenre ? (state.selectedGenres || []).length : 0) +
        (hasSearch ? 1 : 0);

    mobileFilterFab.classList.toggle('has-active', totalActive > 0);
    fabActiveBadge.textContent = String(totalActive);
    fabActiveBadge.hidden = totalActive === 0;
}

/**
 * 初始化移动端 Action Sheet 事件
 */
export function initMobileSheetEvents(onFilterOpen, options = {}) {
    getAppState = typeof options.getState === 'function' ? options.getState : getAppState;
    const mobileFilterFab = document.getElementById('mobile-filter-fab');
    const closeFilterSheetBtn = document.getElementById('close-filter-sheet');
    const mobileSheetOverlay = document.getElementById('mobile-sheet-overlay');
    const mobileCategoryTrigger = document.getElementById('mobile-category-trigger');
    const closeCategorySheetBtn = document.getElementById('close-category-sheet');
    const mobileCategoryOverlay = document.getElementById('mobile-category-overlay');
    const mobileCategoryPills = document.getElementById('mobile-category-pills');
    const mobileSheetSearch = document.getElementById('mobile-sheet-search');

    // 筛选面板事件
    if (mobileFilterFab) {
        mobileFilterFab.addEventListener('click', () => {
            mobileFilterFab.focus();
            openMobileFilterSheet(() => {
                syncMobileSheetFilters();
                if (onFilterOpen) onFilterOpen();
            });
        });
    }
    if (closeFilterSheetBtn) closeFilterSheetBtn.addEventListener('click', closeMobileFilterSheet);
    if (mobileSheetOverlay) mobileSheetOverlay.addEventListener('click', closeMobileFilterSheet);

    // 分类面板事件
    if (mobileCategoryTrigger) mobileCategoryTrigger.addEventListener('click', () => {
        mobileCategoryTrigger.focus();
        openMobileCategorySheet(() => buildMobileCategoryPills(mobileCategoryPills));
    });
    if (closeCategorySheetBtn) closeCategorySheetBtn.addEventListener('click', closeMobileCategorySheet);
    if (mobileCategoryOverlay) mobileCategoryOverlay.addEventListener('click', closeMobileCategorySheet);

    // 搜索镜像
    if (mobileSheetSearch) {
        mobileSheetSearch.addEventListener('input', (e) => {
            const mainSearch = document.getElementById('radar-search');
            if (mainSearch) {
                mainSearch.value = e.target.value;
                mainSearch.dispatchEvent(new Event('input'));
            }
        });
    }

    // ESC 关闭
    document.addEventListener('keydown', (e) => {
        const filterSheet = document.getElementById('mobile-filter-sheet');
        const categorySheet = document.getElementById('mobile-category-sheet');
        if (e.key === 'Escape' && filterSheet?.classList.contains('active')) {
            closeMobileFilterSheet();
            return;
        }
        if (e.key === 'Escape' && categorySheet?.classList.contains('active')) {
            closeMobileCategorySheet();
            return;
        }
        if (filterSheet?.classList.contains('active')) trapFocus(e, filterSheet);
        if (categorySheet?.classList.contains('active')) trapFocus(e, categorySheet);
    });

    // 初始同步
    syncMobileCategoryLabel();
    updateFabState();
}
