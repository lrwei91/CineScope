/**
 * 移动端 Action Sheet 模块
 * 负责移动端筛选面板
 */

import { focusModal, restoreModalFocus, syncBodyModalState, trapFocus } from './modal-state.js?v=20260811a';

let getAppState = () => ({});
let filterReturnFocus = null;

/**
 * 检查是否为移动端
 */
export function isMobile() {
    return window.innerWidth <= 760;
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
        if (e.key === 'Escape' && filterSheet?.classList.contains('active')) {
            closeMobileFilterSheet();
            return;
        }
        if (filterSheet?.classList.contains('active')) trapFocus(e, filterSheet);
    });

    // 初始同步
    updateFabState();
}
