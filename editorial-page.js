import { loadEditorialContent } from './js/modules/editorial.js';
import {
    applyAboutContent,
    configureSubscription,
    createEditorialReferenceOpener,
    renderNewsEntries,
    renderReviewEntries
} from './js/modules/editorial-ui.js';
import {
    hydrateDoubanStatuses,
    updateUI as updateDoubanUI
} from './js/modules/douban-sync.js';
import { initDossierEvents } from './js/modules/dossier.js';
import { initTrailerModalEvents, openTrailerModal } from './js/modules/trailer-modal.js';
import { ensureMediaOverlays } from './js/modules/site-shell.js';
import { setupBackToTop, showToast } from './js/modules/ui-controls.js';
import { ShareModule } from './share.js';

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

async function bootstrapEditorialPage() {
    ensureMediaOverlays();
    setupBackToTop(document.getElementById('back-to-top'));
    initDossierEvents(shareDossier, openTrailerModal);
    initTrailerModalEvents();
    updateDoubanUI();
    void hydrateDoubanStatuses().catch((error) => {
        console.error('Douban status hydration failed:', error);
    });

    const page = document.body.dataset.page;
    const content = await loadEditorialContent();
    const openReference = createEditorialReferenceOpener();
    applyAboutContent(content);
    configureSubscription(content.subscription);

    if (page === 'news') {
        renderNewsEntries(
            document.getElementById('editorial-news'),
            content.news || [],
            openReference
        );
    } else if (page === 'reviews') {
        renderReviewEntries(
            document.getElementById('editorial-reviews'),
            content.reviews || [],
            openReference
        );
    } else if (page === 'about') {
        const description = document.getElementById('about-main-description');
        if (description) description.textContent = content.about?.description || '';
    }
}

function start() {
    void bootstrapEditorialPage().catch((error) => {
        console.error('Editorial page initialization failed:', error);
        const errorMessage = document.getElementById('route-error');
        if (errorMessage) errorMessage.hidden = false;
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
} else {
    start();
}
