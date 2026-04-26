/**
 * 详情面板模块 (Intel Dossier)
 * 负责滑动详情面板的展示和控制
 */

import { DOUBAN_STATUS_LABELS, HIDDEN_GENRES, GENRE_PRIORITY } from './config.js';
import { resolvePosterUrl } from './renderer.js';
import { getGenreDisplayName } from './filters.js';

let currentDossierItem = null;

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

/**
 * 打开详情面板
 */
export function openIntelDossier(item) {
    const dossierOverlay = document.getElementById('intel-dossier-overlay');
    const dossierDrawer = document.getElementById('intel-dossier');
    if (!dossierOverlay || !dossierDrawer) return;

    dossierDrawer.scrollTop = 0;
    dossierDrawer.classList.remove('swiping-close');
    dossierDrawer.style.removeProperty('--swipe-close-translate');
    currentDossierItem = item;

    // 填充数据
    const posterEl = document.getElementById('dossier-poster');
    if (posterEl) posterEl.src = resolvePosterUrl(item.posterPath);

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
    if (reportIdSpan) reportIdSpan.textContent = generateIdFromTitle(item.title || 'UNKNOWN');

    // 标题
    const titleSpan = document.getElementById('dossier-title');
    if (titleSpan) titleSpan.textContent = item.dossierTitle || item.title || '未命名';

    // 副标题
    const subtitleSpan = document.getElementById('dossier-subtitle');
    if (subtitleSpan) subtitleSpan.textContent = item.dossierSubtitle || item.subtitle || '';

    // 评分
    const ratingSpan = document.getElementById('dossier-rating');
    if (ratingSpan) {
        ratingSpan.textContent = (item.doubanVerified && item.doubanRating) ? item.doubanRating.toString() : 'N/A';
    }

    // 日期
    const dateSpan = document.getElementById('dossier-date');
    if (dateSpan) dateSpan.textContent = item.date || 'UNKNOWN';

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
        const visibleGenres = (item.genres || []).filter((genreName) => {
            const displayName = getGenreDisplayName(genreName);
            return !HIDDEN_GENRES.has(displayName) && !HIDDEN_GENRES.has(genreName);
        });
        // 按优先级排序
        const sortedGenres = sortGenresByPriority(visibleGenres);
        if (sortedGenres.length > 0) {
            sortedGenres.forEach((g) => {
                const tag = document.createElement('span');
                tag.className = 'dossier-tag-item';
                tag.textContent = getGenreDisplayName(g);
                tagsContainer.appendChild(tag);
            });
        } else {
            tagsContainer.innerHTML = '<span class="dossier-tag-item">NO_DATA</span>';
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
            networksContainer.innerHTML = '<span class="dossier-tag-item">NO_DATA</span>';
        }
    }

    // 外部链接
    const linksContainer = document.getElementById('dossier-links-container');
    if (linksContainer) {
        linksContainer.innerHTML = '';
        const links = [];
        if (item.doubanVerified && item.doubanLink) {
            links.push(`<a href="${item.doubanLink}" class="dossier-external-btn" target="_blank" rel="noopener noreferrer">> EXEC_UPLINK: DOUBAN_DATABASE</a>`);
        }
        if (item.tmdbUrl) {
            links.push(`<a href="${item.tmdbUrl}" class="dossier-external-btn" target="_blank" rel="noopener noreferrer">> EXEC_UPLINK: TMDB_DATABASE</a>`);
        } else if (item.tmdbSearchUrl) {
            links.push(`<a href="${item.tmdbSearchUrl}" class="dossier-external-btn" target="_blank" rel="noopener noreferrer">> EXEC_UPLINK: TMDB_SEARCH</a>`);
        }
        if (item.imdbUrl) {
            links.push(`<a href="${item.imdbUrl}" class="dossier-external-btn" target="_blank" rel="noopener noreferrer">> EXEC_UPLINK: IMDB_DATABASE</a>`);
        }
        if (links.length > 0) {
            linksContainer.innerHTML = links.join('');
        } else {
            linksContainer.innerHTML = '<span class="dossier-subtext">NO EXTERNAL UPLINKS FOUND</span>';
        }
    }

    // 打开动画
    dossierOverlay.classList.add('active');
    dossierDrawer.classList.add('active');
    document.body.classList.add('modal-open');
}

/**
 * 关闭详情面板
 */
export function closeIntelDossier() {
    const dossierOverlay = document.getElementById('intel-dossier-overlay');
    const dossierDrawer = document.getElementById('intel-dossier');
    if (!dossierOverlay || !dossierDrawer) return;

    dossierOverlay.classList.remove('active');
    dossierDrawer.classList.remove('active');
    dossierDrawer.classList.remove('swiping-close');
    dossierDrawer.style.removeProperty('--swipe-close-translate');
    document.body.classList.remove('modal-open');
    currentDossierItem = null;
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
export function initDossierEvents(onShare) {
    const closeDossierBtn = document.getElementById('close-dossier-btn');
    const shareDossierBtn = document.getElementById('share-dossier-btn');
    const dossierOverlay = document.getElementById('intel-dossier-overlay');
    const dossierDrawer = document.getElementById('intel-dossier');

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
        if (e.key === 'Escape' && dossierDrawer && dossierDrawer.classList.contains('active')) {
            closeIntelDossier();
        }
    });

    // 导出到全局供 share.js 使用
    window.openIntelDossier = openIntelDossier;
    window.getCurrentDossierItem = getCurrentDossierItem;
}
