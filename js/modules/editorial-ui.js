import { CATEGORY_CONFIG, createCategoryState } from './config.js';
import { loadCategoryData } from './data-loader.js';
import { findReferencedItem } from './editorial.js';
import { syncAllItems } from './douban-sync.js';
import { openIntelDossier } from './dossier.js';
import { showToast } from './ui-controls.js';

function formatEditorialDate(value) {
    const [year, month, day] = String(value || '').split('-');
    return year && month && day ? `${year}.${month}.${day}` : '';
}

function createEditorialMeta(entry) {
    const meta = document.createElement('span');
    meta.className = 'editorial-entry-meta';

    const label = document.createElement('span');
    label.className = 'editorial-entry-label';
    label.textContent = entry.label;
    const date = document.createElement('time');
    date.dateTime = entry.publishedAt;
    date.textContent = formatEditorialDate(entry.publishedAt);
    meta.append(label, date);
    return meta;
}

export function createNewsEntry(entry, openReference) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'editorial-card-button';
    button.setAttribute('aria-label', `查看《${entry.title}》关联作品`);

    const image = document.createElement('img');
    image.className = 'editorial-card-image';
    image.src = entry.image;
    image.alt = '';
    image.loading = 'lazy';
    image.referrerPolicy = 'no-referrer';

    const copy = document.createElement('span');
    copy.className = 'editorial-card-copy';
    const title = document.createElement('h3');
    title.textContent = entry.title;
    const summary = document.createElement('p');
    summary.textContent = entry.summary;
    copy.append(createEditorialMeta(entry), title, summary);
    button.append(image, copy);
    button.addEventListener('click', () => void openReference(entry));
    return button;
}

export function createReviewEntry(entry, openReference) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'review-entry';
    button.setAttribute('aria-label', `查看《${entry.title}》关联作品`);

    const image = document.createElement('img');
    image.src = entry.image;
    image.alt = '';
    image.loading = 'lazy';
    image.referrerPolicy = 'no-referrer';

    const copy = document.createElement('span');
    copy.className = 'review-copy';
    const title = document.createElement('h3');
    title.textContent = entry.title;
    const summary = document.createElement('p');
    summary.textContent = entry.summary;
    const byline = document.createElement('span');
    byline.className = 'review-byline';
    const author = document.createElement('span');
    author.textContent = entry.byline;
    const date = document.createElement('time');
    date.dateTime = entry.publishedAt;
    date.textContent = formatEditorialDate(entry.publishedAt);
    byline.append(author, date);
    copy.append(createEditorialMeta(entry), title, summary, byline);
    button.append(image, copy);
    button.addEventListener('click', () => void openReference(entry));
    return button;
}

export function createEditorialReferenceOpener() {
    const categoryState = createCategoryState();

    return async function openReference(entry) {
        if (!entry || !CATEGORY_CONFIG[entry.categoryId]) {
            showToast('该内容引用的片单分类不可用');
            return;
        }

        try {
            const config = CATEGORY_CONFIG[entry.categoryId];
            const state = categoryState[entry.categoryId];
            const loadOptions = {
                getCurrentCategoryId: () => entry.categoryId,
                onSync: () => {},
                silent: true
            };

            if (!state.latestLoaded && !state.completeLoaded) {
                const firstLevel = config.preferCompleteOnFirstLoad || !config.latestUrl
                    ? 'complete'
                    : 'latest';
                await loadCategoryData(entry.categoryId, firstLevel, categoryState, loadOptions);
            }

            let item = findReferencedItem(syncAllItems(state.items), entry.itemId);
            if (!item && !state.completeLoaded) {
                await loadCategoryData(entry.categoryId, 'complete', categoryState, loadOptions);
                item = findReferencedItem(syncAllItems(state.items), entry.itemId);
            }

            if (!item) {
                showToast('暂未找到对应作品');
                return;
            }
            openIntelDossier(item);
        } catch (error) {
            console.error('Failed to open editorial reference:', error);
            showToast('作品数据加载失败');
        }
    };
}

export function renderNewsEntries(container, entries, openReference, { limit } = {}) {
    if (!container) return;
    const visibleEntries = Number.isInteger(limit) ? entries.slice(0, limit) : entries;
    container.replaceChildren(...visibleEntries.map((entry) => createNewsEntry(entry, openReference)));
}

export function renderReviewEntries(container, entries, openReference, { limit } = {}) {
    if (!container) return;
    const visibleEntries = Number.isInteger(limit) ? entries.slice(0, limit) : entries;
    container.replaceChildren(...visibleEntries.map((entry) => createReviewEntry(entry, openReference)));
}

export function applyHeroContent(content) {
    const hero = content?.hero || {};
    const fields = [
        ['hero-eyebrow', hero.eyebrow],
        ['page-title-text', hero.title],
        ['hero-title-accent', hero.accent],
        ['hero-description', hero.description],
        ['hero-cta-label', hero.ctaLabel]
    ];
    fields.forEach(([id, value]) => {
        const element = document.getElementById(id);
        if (element) element.textContent = value || '';
    });

    const heroHeader = document.querySelector('.hero-header');
    if (heroHeader && hero.image) {
        const imageUrl = new URL(hero.image, document.baseURI).href.replaceAll('"', '%22');
        heroHeader.style.setProperty('--hero-image', `url("${imageUrl}")`);
    }
}

export function applyAboutContent(content) {
    const about = content?.about || {};
    const description = document.getElementById('about-description');
    const repositoryLink = document.getElementById('about-repository-link');
    const feedbackLink = document.getElementById('about-feedback-link');
    if (description) description.textContent = about.description || '';
    if (repositoryLink && about.repositoryUrl) repositoryLink.href = about.repositoryUrl;
    if (feedbackLink && about.feedbackUrl) feedbackLink.href = about.feedbackUrl;
}

export function configureSubscription(subscription = {}) {
    const form = document.getElementById('subscription-form');
    const email = document.getElementById('subscription-email');
    const submit = document.getElementById('subscription-submit');
    const status = document.getElementById('subscription-status');
    const enabled = subscription.enabled === true && /^https:\/\//.test(subscription.formAction || '');

    if (form) {
        form.action = enabled ? subscription.formAction : '';
        form.dataset.enabled = String(enabled);
        form.addEventListener('submit', (event) => {
            if (!enabled) event.preventDefault();
        }, { once: true });
    }
    if (email) email.disabled = !enabled;
    if (submit) submit.disabled = !enabled;
    if (status) {
        status.textContent = enabled
            ? '提交后将由订阅服务处理你的邮箱'
            : subscription.disabledMessage || '订阅暂未开放';
    }
}
