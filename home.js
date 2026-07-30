import {
    CATEGORY_CONFIG,
    DEFAULT_CATEGORY_ID,
    FUTURE_TAG,
    GENRE_PRIORITY,
    createCategoryState
} from './js/modules/config.js';
import { loadCategoryData, formatUpdateTimestamp } from './js/modules/data-loader.js';
import { applyFilters, getGenreDisplayName } from './js/modules/filters.js';
import {
    buildYearGroups,
    getTopGenreStats,
    loadEditorialContent,
    selectFeaturedItems
} from './js/modules/editorial.js';
import {
    applyAboutContent,
    applyHeroContent,
    configureSubscription,
    createEditorialReferenceOpener,
    renderNewsEntries,
    renderReviewEntries
} from './js/modules/editorial-ui.js';
import { renderComingSoon, renderTimeline } from './js/modules/renderer.js';
import {
    hydrateDoubanStatuses,
    syncAllItems,
    updateUI as updateDoubanUI
} from './js/modules/douban-sync.js';
import { initDossierEvents, openIntelDossier } from './js/modules/dossier.js';
import { initTrailerModalEvents, openTrailerModal } from './js/modules/trailer-modal.js';
import { ensureMediaOverlays } from './js/modules/site-shell.js';
import { setupBackToTop, showToast } from './js/modules/ui-controls.js';
import { ShareModule } from './share.js';

const categoryState = createCategoryState();
const openEditorialReference = createEditorialReferenceOpener();

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

function buildCatalogUrl(params = {}) {
    const url = new URL(`catalog/${DEFAULT_CATEGORY_ID}/`, document.baseURI);
    Object.entries(params).forEach(([key, value]) => {
        if (value) url.searchParams.set(key, value);
    });
    return url.href;
}

function renderGenreBrowser(items) {
    const container = document.getElementById('genre-browser-grid');
    if (!container) return;

    const genres = getTopGenreStats(items, {
        limit: 8,
        priority: GENRE_PRIORITY,
        getDisplayName: getGenreDisplayName
    });
    const fragment = document.createDocumentFragment();

    genres.forEach((genre) => {
        const link = document.createElement('a');
        link.className = 'genre-browser-card';
        link.href = buildCatalogUrl({ genre: genre.value });
        link.setAttribute('aria-label', `查看${genre.name}片单，共 ${genre.count} 部`);

        const monogram = document.createElement('span');
        monogram.className = 'genre-monogram';
        monogram.setAttribute('aria-hidden', 'true');
        monogram.textContent = genre.name.slice(0, 1);
        const name = document.createElement('strong');
        name.textContent = genre.name;
        const count = document.createElement('small');
        count.textContent = `${genre.count} 部`;
        link.append(monogram, name, count);
        fragment.appendChild(link);
    });

    container.replaceChildren(fragment);
}

function renderCatalogPreview() {
    const data = categoryState[DEFAULT_CATEGORY_ID];
    if (!data.latestLoaded && !data.completeLoaded) return;

    const items = syncAllItems(data.items);
    const { filteredPastAndPresentItems, futureItems } = applyFilters(items, {
        searchQuery: '',
        specialFilterMode: null,
        selectedRating: '全部',
        selectedGenres: []
    }, DEFAULT_CATEGORY_ID);
    const featuredItems = selectFeaturedItems({
        futureItems,
        currentItems: filteredPastAndPresentItems,
        limit: 4
    });
    renderComingSoon(featuredItems, openIntelDossier, openTrailerModal);

    const years = [
        ...new Set(filteredPastAndPresentItems.map((item) => String(item.date).slice(0, 4)))
    ];
    if (futureItems.length > 0) years.unshift(FUTURE_TAG);
    const groups = buildYearGroups({
        years,
        items: filteredPastAndPresentItems,
        futureItems,
        futureTag: FUTURE_TAG,
        previewLimit: 4
    });
    renderTimeline(years, null, Math.min(4, years.length), (year) => {
        window.location.assign(buildCatalogUrl({ year }));
    }, groups);
    document.getElementById('interactive-timeline')?.classList.toggle('visible', years.length > 0);
    renderGenreBrowser(items);

    const updateDate = document.querySelector('.hero-actions .update-date');
    if (updateDate) {
        updateDate.textContent = data.updateDate
            ? `数据更新于：${formatUpdateTimestamp(data.updateDate)}`
            : '';
        updateDate.classList.toggle('skeleton', !data.updateDate);
    }
}

async function loadHomeCatalog() {
    const config = CATEGORY_CONFIG[DEFAULT_CATEGORY_ID];
    const initialLevel = config.preferCompleteOnFirstLoad || !config.latestUrl ? 'complete' : 'latest';
    const options = {
        getCurrentCategoryId: () => DEFAULT_CATEGORY_ID,
        onSync: renderCatalogPreview,
        silent: true,
        isDesktop: false
    };
    const loaded = await loadCategoryData(DEFAULT_CATEGORY_ID, initialLevel, categoryState, options);
    if (!loaded && initialLevel !== 'complete') {
        await loadCategoryData(DEFAULT_CATEGORY_ID, 'complete', categoryState, options);
    }
    renderCatalogPreview();

    if (!categoryState[DEFAULT_CATEGORY_ID].completeLoaded && config.completeUrl) {
        void loadCategoryData(DEFAULT_CATEGORY_ID, 'complete', categoryState, options);
    }
}

async function bootstrapHome() {
    ensureMediaOverlays();
    setupBackToTop(document.getElementById('back-to-top'));
    initDossierEvents(shareDossier, openTrailerModal);
    initTrailerModalEvents();
    updateDoubanUI();

    const contentPromise = loadEditorialContent().then((content) => {
        applyHeroContent(content);
        applyAboutContent(content);
        configureSubscription(content.subscription);
        renderNewsEntries(
            document.getElementById('editorial-news'),
            content.news || [],
            openEditorialReference,
            { limit: 3 }
        );
        renderReviewEntries(
            document.getElementById('editorial-reviews'),
            content.reviews || [],
            openEditorialReference,
            { limit: 3 }
        );
    });
    const statusPromise = hydrateDoubanStatuses()
        .then(renderCatalogPreview)
        .catch((error) => console.error('Douban status hydration failed:', error));

    try {
        await Promise.all([contentPromise, statusPromise, loadHomeCatalog()]);
    } catch (error) {
        console.error('Home page initialization failed:', error);
        document.querySelector('.recommendation-section')?.setAttribute('hidden', '');
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrapHome, { once: true });
} else {
    void bootstrapHome();
}
