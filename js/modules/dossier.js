/**
 * 详情面板模块 (Intel Dossier)
 * 负责滑动详情面板的展示和控制
 */

import { DOUBAN_STATUS_LABELS, GENRE_PRIORITY } from './config.js';
import { resolvePosterUrl } from './renderer.js';
import { getGenreDisplayName } from './filters.js';
import { focusModal, restoreModalFocus, syncBodyModalState, trapFocus } from './modal-state.js';

let currentDossierItem = null;
let onOpenTrailerCallback = null;
let dossierReturnFocus = null;

/**
 * 从标题生成 ID
 */
function generateIdFromTitle(title) {
    let hash = 0;
    for (let i = 0; i < title.length; i++) {
        hash = title.charCodeAt(i) + ((hash << 5) - hash);
    }
    return Math.abs(hash).toString(16).toUpperCase().padStart(8, '0');
}

/**
 * 按优先级排序类型标签
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

/**
 * 设置详情面板字段
 */
function setDossierField(rowId, valueId, values) {
    const row = document.getElementById(rowId);
    const valueNode = document.getElementById(valueId);
    if (!row || !valueNode) return;

    const normalizedValues = Array.isArray(values)
        ? values.map((value) => String(value || '').trim()).filter(Boolean)
        : [String(values || '').trim()].filter(Boolean);

    if (normalizedValues.length === 0) {
        row.hidden = true;
        valueNode.textContent = '';
        return;
    }

    valueNode.textContent = normalizedValues.join(' / ');
    row.hidden = false;
}

function createExternalLink({ href, label, title }) {
    const link = document.createElement('a');
    link.className = 'dossier-external-btn';
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.setAttribute('aria-label', title);
    link.title = title;
    link.href = href;

    const labelSpan = document.createElement('span');
    labelSpan.className = 'dossier-external-label';
    labelSpan.textContent = label;
    link.appendChild(labelSpan);

    return link;
}

/**
 * 打开详情面板
 */
export function openIntelDossier(item) {
    const dossierOverlay = document.getElementById('intel-dossier-overlay');
    const dossierDrawer = document.getElementById('intel-dossier');
    if (!dossierOverlay || !dossierDrawer) return;

    if (!dossierDrawer.classList.contains('active')) {
        dossierReturnFocus = document.activeElement;
    }

    dossierDrawer.scrollTop = 0;
    dossierDrawer.classList.remove('swiping-close');
    dossierDrawer.style.removeProperty('--swipe-close-translate');
    currentDossierItem = item;

    // 填充数据
    const posterEl = document.getElementById('dossier-poster');
    if (posterEl) {
        posterEl.alt = item.title || '作品海报';
        posterEl.onerror = () => {
            posterEl.onerror = null;
            posterEl.src = resolvePosterUrl(null);
        };
        posterEl.src = resolvePosterUrl(item.posterPath);
    }

    // 状态徽章
    const statusBadgeHtml = item.doubanCollectionStatus && DOUBAN_STATUS_LABELS[item.doubanCollectionStatus]
        ? `<span class="poster-status-badge ${item.doubanCollectionStatus}">${DOUBAN_STATUS_LABELS[item.doubanCollectionStatus]}</span>`
        : '';
    const dossierStatusBadge = document.getElementById('dossier-status-badge');
    if (dossierStatusBadge) {
        dossierStatusBadge.innerHTML = statusBadgeHtml;
        dossierStatusBadge.hidden = !statusBadgeHtml;
    }

    // 报告 ID
    const reportIdSpan = document.getElementById('dossier-id');
    if (reportIdSpan) reportIdSpan.textContent = generateIdFromTitle(item.title || '未命名');

    // 标题
    const titleSpan = document.getElementById('dossier-title');
    if (titleSpan) titleSpan.textContent = item.dossierTitle || item.title || '未命名';

    // 副标题
    const subtitleSpan = document.getElementById('dossier-subtitle');
    if (subtitleSpan) subtitleSpan.textContent = item.dossierSubtitle || item.subtitle || '';

    // 评分
    const ratingSpan = document.getElementById('dossier-rating');
    if (ratingSpan) {
        ratingSpan.textContent = (item.doubanVerified && item.doubanRating) ? item.doubanRating.toString() : '暂无';
    }

    // 日期
    const dateSpan = document.getElementById('dossier-date');
    if (dateSpan) dateSpan.textContent = item.date || '未知';

    // 导演和主演
    setDossierField('dossier-directors-row', 'dossier-directors', item.directors);
    setDossierField('dossier-actors-row', 'dossier-actors', (item.actors || []).slice(0, 5));

    // 概述
    const overviewSection = document.getElementById('dossier-overview-section');
    const overviewElement = document.getElementById('dossier-overview');
    if (overviewSection && overviewElement) {
        const dossierOverview = item.dossierOverview || item.overview;
        if (dossierOverview) {
            overviewElement.textContent = dossierOverview;
            overviewSection.hidden = false;
        } else {
            overviewElement.textContent = '';
            overviewSection.hidden = true;
        }
    }

    // 类型标签
    const tagsContainer = document.getElementById('dossier-tags');
    if (tagsContainer) {
        tagsContainer.innerHTML = '';
        const releaseWindows = Array.isArray(item.releaseWindows) ? item.releaseWindows : [];
        const visibleGenres = item.genres || [];
        // 按优先级排序
        const sortedGenres = sortGenresByPriority(visibleGenres);
        if (releaseWindows.length > 0 || sortedGenres.length > 0) {
            releaseWindows.forEach((window) => {
                const tag = document.createElement('span');
                tag.className = 'dossier-tag-item release-window';
                tag.textContent = window.label;
                tagsContainer.appendChild(tag);
            });
            sortedGenres.forEach((g) => {
                const tag = document.createElement('span');
                tag.className = 'dossier-tag-item';
                tag.textContent = getGenreDisplayName(g);
                tagsContainer.appendChild(tag);
            });
        } else {
            tagsContainer.innerHTML = '<span class="dossier-tag-item">暂无数据</span>';
        }
    }

    // 网络标签
    const networksContainer = document.getElementById('dossier-networks');
    if (networksContainer) {
        networksContainer.innerHTML = '';
        const dossierNetworks = item.dossierNetworks || item.networks;
        if (dossierNetworks && dossierNetworks.length > 0) {
            dossierNetworks.forEach((n) => {
                const tag = document.createElement('span');
                tag.className = 'dossier-tag-item';
                tag.textContent = n;
                networksContainer.appendChild(tag);
            });
        } else {
            networksContainer.innerHTML = '<span class="dossier-tag-item">暂无数据</span>';
        }
    }

    const trailersSection = document.getElementById('dossier-trailers-section');
    const trailersContainer = document.getElementById('dossier-trailers');
    if (trailersSection && trailersContainer) {
        trailersContainer.innerHTML = '';
        const trailers = Array.isArray(item.trailers) ? item.trailers : [];
        if (trailers.length > 0) {
            trailers.forEach((trailer, index) => {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'dossier-trailer-btn';
                button.textContent = trailers.length > 1 ? `预告片 ${index + 1}` : '播放预告片';
                button.title = trailer.title || '播放预告片';
                button.addEventListener('click', () => {
                    if (typeof onOpenTrailerCallback === 'function') {
                        onOpenTrailerCallback(item, index);
                    }
                });
                trailersContainer.appendChild(button);
            });
            trailersSection.hidden = false;
        } else {
            trailersSection.hidden = true;
        }
    }

    // 外部链接
    const linksContainer = document.getElementById('dossier-links-container');
    if (linksContainer) {
        linksContainer.replaceChildren();
        const linkBuilders = [];
        if (item.doubanVerified && item.doubanLink) {
            linkBuilders.push(() => createExternalLink({
                href: item.doubanLink,
                label: '豆瓣',
                title: '打开豆瓣详情'
            }));
        }
        if (item.tmdbUrl) {
            linkBuilders.push(() => createExternalLink({
                href: item.tmdbUrl,
                label: 'TMDB',
                title: '打开 TMDB 详情'
            }));
        } else if (item.tmdbSearchUrl) {
            linkBuilders.push(() => createExternalLink({
                href: item.tmdbSearchUrl,
                label: '搜索',
                title: '在 TMDB 搜索'
            }));
        }
        if (item.imdbUrl) {
            linkBuilders.push(() => createExternalLink({
                href: item.imdbUrl,
                label: 'IMDb',
                title: '打开 IMDb 详情'
            }));
        }
        if (linkBuilders.length > 0) {
            linkBuilders.forEach((build) => linksContainer.appendChild(build()));
        } else {
            const empty = document.createElement('span');
            empty.className = 'dossier-subtext';
            empty.textContent = '暂无外部链接';
            linksContainer.appendChild(empty);
        }
    }

    // 打开动画
    dossierOverlay.setAttribute('aria-hidden', 'false');
    dossierDrawer.removeAttribute('inert');
    dossierDrawer.setAttribute('aria-hidden', 'false');
    dossierOverlay.classList.add('active');
    dossierDrawer.classList.add('active');
    document.body.classList.add('modal-open');
    focusModal(dossierDrawer, '#close-dossier-btn');
}

/**
 * 关闭详情面板
 */
export function closeIntelDossier() {
    const dossierOverlay = document.getElementById('intel-dossier-overlay');
    const dossierDrawer = document.getElementById('intel-dossier');
    if (!dossierOverlay || !dossierDrawer) return;

    dossierOverlay.setAttribute('aria-hidden', 'true');
    dossierDrawer.setAttribute('aria-hidden', 'true');
    dossierDrawer.setAttribute('inert', '');
    dossierOverlay.classList.remove('active');
    dossierDrawer.classList.remove('active');
    dossierDrawer.classList.remove('swiping-close');
    dossierDrawer.style.removeProperty('--swipe-close-translate');
    currentDossierItem = null;
    syncBodyModalState();
    restoreModalFocus(dossierReturnFocus);
    dossierReturnFocus = null;
}

/**
 * 获取当前详情项目
 */
export function getCurrentDossierItem() {
    return currentDossierItem;
}

/**
 * 设置滑动手势关闭
 */
export function setupDossierSwipeClose() {
    const dossierDrawer = document.getElementById('intel-dossier');
    if (!dossierDrawer) return;

    const isMobile = () => window.innerWidth <= 900;

    let startX = 0;
    let startY = 0;
    let currentX = 0;
    let currentY = 0;
    let isTracking = false;
    let isSwiping = false;

    const resetSwipeState = () => {
        isTracking = false;
        isSwiping = false;
        dossierDrawer.classList.remove('swiping-close');
        dossierDrawer.style.removeProperty('--swipe-close-translate');
    };

    dossierDrawer.addEventListener('touchstart', (event) => {
        if (!isMobile() || !dossierDrawer.classList.contains('active')) return;
        const touch = event.touches?.[0];
        if (!touch) return;

        startX = touch.clientX;
        startY = touch.clientY;
        currentX = startX;
        currentY = startY;
        isTracking = true;
        isSwiping = false;
    }, { passive: true });

    dossierDrawer.addEventListener('touchmove', (event) => {
        if (!isTracking) return;
        const touch = event.touches?.[0];
        if (!touch) return;

        currentX = touch.clientX;
        currentY = touch.clientY;
        const deltaX = currentX - startX;
        const deltaY = currentY - startY;

        if (deltaX > 12 && Math.abs(deltaY) < Math.abs(deltaX) * 0.8) {
            isSwiping = true;
            dossierDrawer.classList.add('swiping-close');
            dossierDrawer.style.setProperty('--swipe-close-translate', `${Math.max(0, deltaX)}px`);
        }

        if (isSwiping) {
            event.preventDefault();
        }
    }, { passive: false });

    dossierDrawer.addEventListener('touchend', () => {
        if (!isTracking) return;
        const deltaX = currentX - startX;
        const deltaY = Math.abs(currentY - startY);
        const shouldClose = isSwiping && deltaX > 80 && deltaX > deltaY * 1.25;
        resetSwipeState();
        if (shouldClose) closeIntelDossier();
    }, { passive: true });

    dossierDrawer.addEventListener('touchcancel', resetSwipeState, { passive: true });
}

/**
 * 初始化详情面板事件
 */
export function initDossierEvents(onShare, onOpenTrailer) {
    const closeDossierBtn = document.getElementById('close-dossier-btn');
    const shareDossierBtn = document.getElementById('share-dossier-btn');
    const dossierOverlay = document.getElementById('intel-dossier-overlay');
    const dossierDrawer = document.getElementById('intel-dossier');
    onOpenTrailerCallback = typeof onOpenTrailer === 'function' ? onOpenTrailer : null;

    if (closeDossierBtn) closeDossierBtn.addEventListener('click', closeIntelDossier);
    if (dossierOverlay) dossierOverlay.addEventListener('click', closeIntelDossier);

    if (shareDossierBtn && onShare) {
        shareDossierBtn.addEventListener('click', async () => {
            shareDossierBtn.disabled = true;
            try {
                await onShare(currentDossierItem);
            } catch (error) {
                console.error('Share failed:', error);
            } finally {
                shareDossierBtn.disabled = false;
            }
        });
    }

    setupDossierSwipeClose();

    document.addEventListener('keydown', (e) => {
        if (!dossierDrawer?.classList.contains('active')) return;
        if (e.key === 'Escape') {
            closeIntelDossier();
            return;
        }
        trapFocus(e, dossierDrawer);
    });
}
