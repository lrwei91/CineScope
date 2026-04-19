/**
 * 移动端 Action Sheet 模块
 * 负责移动端筛选面板和分类选择面板
 */

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

    if (onOpen) onOpen();

    mobileSheetOverlay.classList.add('active');
    mobileFilterSheet.classList.add('active');
    document.body.classList.add('modal-open');
}

/**
 * 关闭筛选面板
 */
export function closeMobileFilterSheet() {
    const mobileFilterSheet = document.getElementById('mobile-filter-sheet');
    const mobileSheetOverlay = document.getElementById('mobile-sheet-overlay');
    if (!mobileFilterSheet || !mobileSheetOverlay) return;

    mobileSheetOverlay.classList.remove('active');
    mobileFilterSheet.classList.remove('active');
    document.body.classList.remove('modal-open');
}

/**
 * 打开分类选择面板
 */
export function openMobileCategorySheet(onBuild) {
    const mobileCategorySheet = document.getElementById('mobile-category-sheet');
    const mobileCategoryOverlay = document.getElementById('mobile-category-overlay');
    if (!mobileCategorySheet) return;

    if (onBuild) onBuild();

    mobileCategorySheet.classList.add('active');
    mobileCategoryOverlay.classList.add('active');
    const mobileCategoryTrigger = document.getElementById('mobile-category-trigger');
    if (mobileCategoryTrigger) mobileCategoryTrigger.classList.add('open');
}

/**
 * 关闭分类选择面板
 */
export function closeMobileCategorySheet() {
    const mobileCategorySheet = document.getElementById('mobile-category-sheet');
    const mobileCategoryOverlay = document.getElementById('mobile-category-overlay');
    if (!mobileCategorySheet) return;

    mobileCategorySheet.classList.remove('active');
    mobileCategoryOverlay.classList.remove('active');
    const mobileCategoryTrigger = document.getElementById('mobile-category-trigger');
    if (mobileCategoryTrigger) mobileCategoryTrigger.classList.remove('open');
}

/**
 * 构建移动端分类 Pills
 */
export function buildMobileCategoryPills(container) {
    if (!container) return;
    container.innerHTML = '';

    const categoryTags = document.querySelectorAll('#category-filter-container .genre-tag');
    categoryTags.forEach((tag) => {
        const pill = document.createElement('div');
        pill.className = 'mobile-category-pill-item' + (tag.classList.contains('active') ? ' active' : '');
        pill.textContent = tag.textContent.trim();
        pill.dataset.category = tag.dataset.category;

        pill.addEventListener('click', () => {
            tag.click();
            const mobileCategoryLabel = document.getElementById('mobile-category-label');
            if (mobileCategoryLabel) mobileCategoryLabel.textContent = tag.textContent.trim();
            closeMobileCategorySheet();
        });

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
export function updateFabState() {
    const mobileFilterFab = document.getElementById('mobile-filter-fab');
    const fabActiveBadge = document.getElementById('fab-active-badge');
    if (!mobileFilterFab || !fabActiveBadge) return;

    const state = window.__appState || {};
    const hasRating = true;
    const hasGenre = (state.selectedGenres || []).length > 0;
    const hasSearch = (state.searchQuery || '').length > 0;
    const totalActive = (hasRating ? 1 : 0) + (hasGenre ? (state.selectedGenres || []).length : 0) + (hasSearch ? 1 : 0);

    mobileFilterFab.classList.add('has-active');
    fabActiveBadge.textContent = totalActive;
    fabActiveBadge.hidden = false;
}

/**
 * 初始化移动端 Action Sheet 事件
 */
export function initMobileSheetEvents(onFilterOpen) {
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
        if (e.key === 'Escape') {
            closeMobileFilterSheet();
            closeMobileCategorySheet();
        }
    });

    // 初始同步
    syncMobileCategoryLabel();
    updateFabState();
}
