/**
 * 手机端壳层模块（2026-10-03 改版）
 *
 * 职责：底栏四模块（发现 / 我的 / 关于 / 搜索）、发现页顶栏与分类面板、
 * 我的页统计、搜索页筛选面板。
 *
 * 设计约束（见 docs/DESIGN_BRIEF.md 与通用设计规范）：
 * - 固定浅色，不引入深色模式。
 * - 详情、预告片、分享复用既有实现（dossier.js / trailer-modal.js / share.js），
 *   本模块不复制这些能力，只负责导航与页面组织。
 * - 分类 ID、Hash 路由、JSON 结构与筛选语义保持不变。
 */

import { CATEGORY_CONFIG, DOUBAN_STATUS_URL, DOUBAN_STATUS_LABELS } from './config.js';
import { formatUpdateTimestamp } from './data-loader.js?v=20260811b';
import { getModalHistory } from './modal-history.js?v=20261003g';
import { getDoubanStatuses, getDoubanStatusesMetadata } from './douban-sync.js?v=20261002c';
import { getGenreDisplayName } from './filters.js';

import { focusModal, syncBodyModalState, trapFocus } from './modal-state.js?v=20261003g';


const VIEWS = ['discover', 'me', 'about', 'search'];

let hooks = {};
let activeView = 'discover';
let catMenuOpen = false;
let filterMenuOpen = false;
let shellReady = false;
let viewSequence = 0;
let viewHistoryId = null;
let filterCategory = null;
let searchSignature = null;

// 搜索页筛选状态：沿用现有筛选语义，仅承载入口
const searchFilters = {
    genre: '不限',
    rating: '不限',
    year: '不限',
    kind: '不限'
};

// 我的页缓存，避免重复计算
let meCache = null;
let meLoading = false;

/**
 * 「我的」统计需要跨分类匹配豆瓣状态，因此要确保各分类数据已加载。
 * 这里按需补齐 complete 数据，复用 data-loader 的缓存与并发去重。
 */
async function ensureAllCategoriesLoaded() {
    if (meLoading) return;
    meLoading = true;
    try {
        await Promise.all(CATEGORY_ORDER.map((id) => hooks.ensureCategoryLoaded?.(id)));
    } finally {
        meLoading = false;
    }
}

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]
));

const CATEGORY_ORDER = ['tv_cn', 'tv_kr', 'tv_jp', 'tv_us', 'movie_cn', 'douban_top250', 'tv_cn_variety'];

/* =====================================================
   豆瓣状态关联
   ===================================================== */

/**
 * 取条目的豆瓣 subject id。
 *
 * 数据现状：剧集条目规范化后 id 为「季 id」，而豆瓣 subject id 记录在季级
 * douban_link_google 上；若该链接缺失，show.id 才是 subject id。
 * 因此按 季链接 → 条目 id → 原始 show id 顺序尝试，兼容三种情况。
 */
function resolveSubjectId(item) {
    if (!item) return null;
    if (item.doubanSubjectId) return String(item.doubanSubjectId);
    const link = item.doubanLink || item.douban_link_google || '';
    const matched = String(link).match(/subject\/(\d+)/);
    if (matched) return matched[1];
    // 季 id 形如 "<showId>-<season>-<date>" 时，回退取 show id
    const id = String(item.id || '');
    const showId = id.split('-')[0];
    return showId || null;
}

function collectCollectionItems() {
    const statuses = getDoubanStatuses();
    const buckets = { wishlist: [], watching: [], watched: [] };
    if (!statuses || typeof statuses !== 'object') return buckets;

    // 我的页需要跨分类统计，收集全部已加载条目
    const allItems = hooks.getAllItems?.() || [];
    const seen = new Set();
    for (const item of allItems) {
        const subjectId = resolveSubjectId(item);
        if (!subjectId) continue;
        const status = statuses[subjectId]?.status;
        if (!status || !buckets[status]) continue;
        // 同一部作品可能同时存在于多个分类（如院线电影与豆瓣Top250），
        // 按 subject id 去重，避免重复计入统计。
        if (seen.has(subjectId)) continue;
        seen.add(subjectId);

        const genres = (item.genres || [])
            .map((genre) => getGenreDisplayName(genre))
            .filter(Boolean);

        buckets[status].push({
            title: item.title || '未命名',
            categoryId: item.categoryId || '',
            // 电影条目规范化后 categoryId 为空，按 kind 兜底为「院线电影」
            categoryLabel: CATEGORY_CONFIG[item.categoryId]?.label
                || (item.kind === 'movie' ? '电影' : ''),
            kind: item.kind || 'tv',
            posterPath: item.posterPath || '',
            rating: item.doubanRating || item.rating || null,
            date: item.date || '',
            // 豆瓣标记时间：代表「什么时候看的」，比上映年份更贴近统计语义
            markedAt: statuses[subjectId]?.updatedAt || '',
            genres: genres.slice(0, 3),
            primaryGenre: genres[0] || '未分类',
            subjectId
        });
    }

    buckets.watched.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
    return buckets;
}

/* =====================================================
   发现页：顶栏与分类面板
   ===================================================== */

function categoryCounts() {
    const counts = {};
    for (const id of CATEGORY_ORDER) counts[id] = 0;
    // 按分类桶直接统计：电影条目在规范化时 categoryId 为空，
    // 只能从「哪个分类的数据已加载」判断其条目数。
    for (const id of CATEGORY_ORDER) {
        const catState = hooks.getCategoryState?.(id);
        if (!catState) continue;
        const items = catState.items || [];
        if (items.length) counts[id] = items.length;
    }
    return counts;
}

function renderCategoryPanel() {
    const host = $('#mobile-cat-list');
    if (!host) return;
    const counts = categoryCounts();
    const current = hooks.getCategoryId?.() || 'tv_cn';

    host.innerHTML = CATEGORY_ORDER.map((id) => {
        const config = CATEGORY_CONFIG[id];
        if (!config) return '';
        const selected = id === current;
        return `<button class="mobile-cat-item" type="button" role="option"
            data-category="${esc(id)}" aria-selected="${selected}">
            <span class="mobile-cat-name">${esc(config.label)}</span>
            <span class="mobile-cat-count">${counts[id] || 0}</span>
        </button>`;
    }).join('');
}

function setCategoryMenu(open) {
    const menu = $('#mobile-cat-menu');
    const toggle = $('#mobile-cat-toggle');
    if (!menu || !toggle) return;
    catMenuOpen = open;
    menu.classList.toggle('active', open);
    menu.setAttribute('aria-hidden', String(!open));
    toggle.setAttribute('aria-expanded', String(open));
    if (!open) return;
    renderCategoryPanel();
    // 分类数量依赖各自数据，未加载时先补齐再刷新计数
    const pending = CATEGORY_ORDER.filter((id) => !hooks.getCategoryState?.(id)?.completeLoaded
        && !hooks.getCategoryState?.(id)?.latestLoaded);
    if (!pending.length) return;
    Promise.all(pending.map((id) => hooks.ensureCategoryLoaded?.(id)))
        .then(() => { if (catMenuOpen) renderCategoryPanel(); })
        .catch(() => {});
}

function closeCategoryMenu({ restoreFocus = false } = {}) {
    if (!catMenuOpen) return;
    setCategoryMenu(false);
    if (restoreFocus) $('#mobile-cat-toggle')?.focus({ preventScroll: true });
}

function updateDiscoverHeader() {
    const categoryId = hooks.getCategoryId?.() || 'tv_cn';
    const label = CATEGORY_CONFIG[categoryId]?.label || '片单';
    const title = $('#mobile-view-title');
    if (title) title.textContent = label;
    $('#mobile-search-input')?.setAttribute('aria-label', `搜索${label}片单`);
    if ($('#mobile-search-input')) $('#mobile-search-input').placeholder = `搜索${label}片名、别名或关键词`;
    $('#mobile-view-discover')?.setAttribute('aria-label', `${label}片单`);
}

/* =====================================================
   我的页
   ===================================================== */

function ticketMarkup(item) {
    const poster = item.posterPath
        ? `<img loading="lazy" decoding="async" src="${esc(item.posterPath)}" alt=""
             onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'poster-fallback',textContent:'暂无'}))">`
        : '<span class="poster-fallback">暂无</span>';
    const meta = [
        item.categoryLabel,
        item.date ? `${item.date} 上映` : '',
        item.genres.length ? item.genres.join(' ') : ''
    ].filter(Boolean);
    return `<div class="mobile-ticket">
        <div class="mobile-ticket-poster">${poster}</div>
        <div class="mobile-ticket-body">
            <h3>${esc(item.title)}</h3>
            <p class="mobile-ticket-meta">${esc(meta.join(' · '))}</p>
            <p class="mobile-ticket-score">${item.rating ? `豆瓣 ${Number(item.rating).toFixed(1)}` : '暂无评分'}</p>
        </div>
        <div class="mobile-ticket-barcode" aria-hidden="true"></div>
    </div>`;
}

function statMarkup(value, label, items) {
    const mini = items.slice(0, 3).map((item) => (item.posterPath
        ? `<img loading="lazy" decoding="async" src="${esc(item.posterPath)}" alt="" onerror="this.remove()">`
        : '')).join('');
    return `<div class="mobile-stat">
        <div>
            <div class="mobile-stat-value">${value}</div>
            <div class="mobile-stat-label">${esc(label)}</div>
        </div>
        <div class="mobile-stat-mini">${mini}</div>
    </div>`;
}

function yearChartMarkup(watched) {
    const buckets = new Map();
    for (const item of watched) {
        // 优先用豆瓣标记年份；缺失时回退上映年份
        const marked = String(item.markedAt || '').slice(0, 4);
        const fallback = String(item.date || '').slice(0, 4);
        const year = /^\d{4}$/.test(marked) ? marked : fallback;
        if (!/^\d{4}$/.test(year)) continue;
        buckets.set(year, (buckets.get(year) || 0) + 1);
    }
    // 只显示条目数 >= 2 的年份，避免长尾单条柱状图难以阅读
    const rows = [...buckets.entries()]
        .filter(([, count]) => count >= 2)
        .sort((a, b) => b[0].localeCompare(a[0]));
    if (!rows.length) return '<p class="mobile-empty">暂无时间数据</p>';
    const max = Math.max(...rows.map((row) => row[1]));
    return rows.map(([year, count]) => `<div class="mobile-year-col">
        <span class="mobile-year-count">${count}</span>
        <span class="mobile-year-bar" style="height:${Math.max(6, Math.round((count / max) * 56))}px"></span>
        <span class="mobile-year-label">${esc(year)}</span>
    </div>`).join('');
}

function genreSectionMarkup(watched) {
    const counts = new Map();
    for (const item of watched) {
        const genre = item.primaryGenre || '未分类';
        counts.set(genre, (counts.get(genre) || 0) + 1);
    }
    const dist = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    if (!dist.length) return '<p class="mobile-empty">暂无类型数据</p>';

    const total = watched.length || 1;
    const top = dist.slice(0, 5);
    const ramp = ['#FFE28A', '#F0C868', '#D9A441', '#A9761B', '#6B4A0E'];

    const bar = top.map(([, count], index) =>
        `<i style="width:${(count / total) * 100}%;background:${ramp[index]}"></i>`).join('');

    // 图例同时给出名称、条形与百分比，不依赖颜色单独传达信息
    const legend = dist.slice(0, 8).map(([genre, count], index) => `<div class="mobile-legend-row">
        <span class="mobile-legend-swatch" style="background:${index < 5 ? ramp[index] : '#1A1A1A'}"></span>
        <span class="mobile-legend-name">${esc(genre)}</span>
        <span class="mobile-legend-bar"><i style="width:${(count / top[0][1]) * 100}%"></i></span>
        <span class="mobile-legend-pct">${Math.round((count / total) * 100)}%</span>
    </div>`).join('');

    return `<div class="mobile-genre-bar" role="img" aria-label="看过作品类型占比">${bar}</div>
        <div class="mobile-legend">${legend}</div>`;
}

function renderMe() {
    const body = $('#mobile-me-body');
    const loading = $('#mobile-me-loading');
    if (!body || !loading) return;

    const buckets = collectCollectionItems();
    meCache = buckets;
    const { wishlist, watching, watched } = buckets;

    loading.hidden = true;
    body.hidden = false;

    // 票根：1 张平铺，2 张以上堆叠
    const host = $('#mobile-wish-tickets');
    if (!wishlist.length) {
        host.className = 'mobile-tickets';
        host.innerHTML = '<p class="mobile-empty">还没有标记「想看」的作品</p>';
    } else {
        const shown = wishlist.slice(0, 3);
        host.className = wishlist.length > 1 ? 'mobile-tickets is-stacked' : 'mobile-tickets';
        host.innerHTML = shown.map(ticketMarkup).join('')
            + (wishlist.length > shown.length ? `<span class="mobile-ticket-more">+${wishlist.length - shown.length}</span>` : '');
        if (wishlist.length > 1) {
            // 票根高度随标题换行变化，按实际高度补足叠放空间，避免裁切
            requestAnimationFrame(() => {
                const first = host.querySelector('.mobile-ticket');
                if (!first) return;
                host.style.minHeight = `${Math.ceil(first.getBoundingClientRect().height) + 26}px`;
            });
        }
    }
    $('#mobile-wish-count').textContent = String(wishlist.length);
    $('#mobile-wish-total').textContent = wishlist.length > 3 ? `共 ${wishlist.length} 部` : '';

    $('#mobile-me-stats').innerHTML = [
        statMarkup(wishlist.length, DOUBAN_STATUS_LABELS.wishlist, wishlist),
        statMarkup(watching.length, DOUBAN_STATUS_LABELS.watching, watching),
        statMarkup(watched.length, DOUBAN_STATUS_LABELS.watched, watched)
    ].join('');

    $('#mobile-year-total').textContent = `${watched.length} 部`;
    $('#mobile-year-chart').innerHTML = yearChartMarkup(watched);
    $('#mobile-genre-total').textContent = `${watched.length} 部`;
    $('#mobile-genre-chart').innerHTML = genreSectionMarkup(watched);

    const meta = getDoubanStatusesMetadata();
    const updatedAt = meta?.last_updated ? formatUpdateTimestamp(meta.last_updated) : '未知';
    const total = hooks.getAllItems?.()?.length || 0;
    const matched = wishlist.length + watching.length + watched.length;
    $('#mobile-me-note').textContent =
        `数据来源：豆瓣收藏状态（${meta?.user_id || '当前用户'}），最近同步 ${updatedAt}。`
        + `统计口径为片单中能匹配到豆瓣条目 ID 的作品，共 ${matched} 部；`
        + `片单总条目 ${total} 部，未标记状态的不计入。`;

    const syncBadge = $('#mobile-me-sync');
    if (syncBadge) syncBadge.textContent = meta?.last_updated ? `${updatedAt}` : '—';
}

/* =====================================================
   搜索页筛选
   ===================================================== */

function currentCategoryItems() {
    const categoryId = hooks.getCategoryId?.() || 'tv_cn';
    const state = hooks.getCategoryState?.(categoryId);
    if (!state) return [];
    return state.completeLoaded ? state.items : (state.latestLoaded ? state.items : []);
}

function buildFilterOptions() {
    const items = currentCategoryItems();
    const genres = new Set();
    const years = new Set();
    for (const item of items) {
        for (const genre of item.genres || []) genres.add(getGenreDisplayName(genre));
        const year = String(item.date || '').slice(0, 4);
        if (/^\d{4}$/.test(year)) years.add(year);
    }
    return {
        genre: ['不限', ...[...genres].sort((a, b) => a.localeCompare(b, 'zh-CN'))],
        rating: ['不限', '> 9 分', '> 8 分', '> 7 分'],
        year: ['不限', ...[...years].sort((a, b) => b.localeCompare(a))],
        kind: ['不限', ...new Set(items.map((item) => (item.kind === 'tv' ? '剧集' : '电影')))]
    };
}

function renderFilterChips() {
    const category = hooks.getCategoryId?.();
    if (filterCategory !== category) {
        for (const key of Object.keys(searchFilters)) searchFilters[key] = '不限';
        filterCategory = category;
    }
    const host = $('#mobile-filter-chips');
    if (!host) return;
    const labels = { genre: '类型', rating: '评分', year: '年份', kind: '形式' };
    host.innerHTML = Object.keys(labels).map((key) => `<button class="mobile-filter-chip" type="button"
        data-filter="${key}" aria-haspopup="dialog" aria-expanded="false">
        <span class="mobile-filter-chip-label">${labels[key]}:</span>
        <span class="mobile-filter-chip-value">${esc(searchFilters[key])}</span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"
             stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
    </button>`).join('');
}

function setFilterMenu(open) {
    const sheet = $('#mobile-filter-menu');
    if (!sheet) return;
    filterMenuOpen = open;
    sheet.classList.toggle('active', open);
    sheet.setAttribute('aria-hidden', String(!open));
    $$('#mobile-filter-chips .mobile-filter-chip').forEach((chip) => {
        chip.setAttribute('aria-expanded', String(open && chip.dataset.filter === sheet.dataset.filter));
    });
    if (open) renderFilterOptions();
    $('#mobile-filter-panel').hidden = !open;
    syncBodyModalState();
    if (open) {
        $('#mobile-filter-panel').getBoundingClientRect();
        focusModal($('#mobile-filter-panel'), '#mobile-filter-close');
        // 等背景 inert 与面板可见性完成更新，再进入焦点。
        setTimeout(() => { if (filterMenuOpen) $('#mobile-filter-close')?.focus({ preventScroll: true }); }, 240);
    }
}

function renderFilterOptions() {
    const sheet = $('#mobile-filter-menu');
    const host = $('#mobile-filter-options');
    if (!sheet || !host) return;
    const key = sheet.dataset.filter;
    const options = buildFilterOptions()[key] || ['不限'];
    const labels = { genre: '类型', rating: '评分', year: '年份', kind: '形式' };
    $('#mobile-filter-menu-title').textContent = labels[key] || '筛选';
    host.innerHTML = options.map((value) => `<button class="mobile-filter-option" type="button"
        data-value="${esc(value)}" aria-pressed="${searchFilters[key] === value}">${esc(value)}</button>`).join('');
}

function closeFilterMenu({ restoreFocus = false, fromHistory = false } = {}) {
    if (!filterMenuOpen) return;
    if (!fromHistory && getModalHistory().close('search-filter')) return;
    setFilterMenu(false);
    if (restoreFocus) {
        $(`#mobile-filter-chips [data-filter="${$('#mobile-filter-menu').dataset.filter}"]`)?.focus({ preventScroll: true });
    }
}

function applySearchFilters() {
    const items = currentCategoryItems();
    const keyword = String($('#mobile-search-input')?.value || '').trim().toLowerCase();

    const genreMap = { '不限': null, '剧集': 'tv', '电影': 'movie' };
    const ratingFloor = { '不限': null, '> 9 分': 9, '> 8 分': 8, '> 7 分': 7 };

    return items.filter((item) => {
        if (keyword) {
            const haystack = [item.title, item.subtitle, ...(item.genres || []), item.overview || '']
                .join(' ').toLowerCase();
            if (!haystack.includes(keyword)) return false;
        }
        if (searchFilters.genre !== '不限') {
        // 类型筛选按作品自身类型匹配
        const hasGenre = (item.genres || []).some((genre) => getGenreDisplayName(genre) === searchFilters.genre);
        if (!hasGenre) return false;
    }
        if (searchFilters.rating !== '不限') {
            const floor = ratingFloor[searchFilters.rating];
            const rating = Number(item.doubanRating || 0);
            if (!floor || !(rating > floor)) return false;
        }
        if (searchFilters.year !== '不限') {
            if (String(item.date || '').slice(0, 4) !== searchFilters.year) return false;
        }
        if (searchFilters.kind !== '不限') {
            const wanted = genreMap[searchFilters.kind];
            if (wanted && item.kind !== wanted) return false;
        }
        return true;
    });
}

function renderSearchResults() {
    const host = $('#mobile-search-results');
    const countLabel = $('#mobile-search-count');
    if (!host) return;

    const signature = JSON.stringify([hooks.getCategoryId?.(), $('#mobile-search-input')?.value, searchFilters]);
    if (signature !== searchSignature) $('#mobile-search-scroll')?.scrollTo({ top: 0, behavior: 'instant' });
    searchSignature = signature;
    const results = applySearchFilters();
    const hasFilter = Object.values(searchFilters).some((value) => value !== '不限');
    const keyword = String($('#mobile-search-input')?.value || '').trim();

    if (countLabel) countLabel.textContent = results.length ? `${results.length} 条` : '';
    if (!results.length) {
        host.innerHTML = `<div class="mobile-empty">
            <p>${keyword || hasFilter ? '没有符合条件的内容' : '输入关键词或选择筛选条件'}</p>
        </div>`;
        return;
    }

    const posterCell = (item) => (item.posterPath
        ? `<img loading="lazy" decoding="async" src="${esc(item.posterPath)}" alt="" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'poster-fallback',textContent:'暂无'}))">`
        : '<span class="poster-fallback">暂无</span>');

    host.innerHTML = results.map((item) => {
        const rating = item.doubanRating ? ` · 豆瓣 ${Number(item.doubanRating).toFixed(1)}` : '';
        const genres = (item.genres || []).slice(0, 3).join(' ');
        return `<button type="button" class="mobile-result-row" data-item-id="${esc(item.id)}">
            <div class="mobile-result-poster">${posterCell(item)}</div>
            <div class="mobile-result-body">
                <h3>${esc(item.title)}</h3>
                <p class="mobile-result-meta">${esc([
                    CATEGORY_CONFIG[item.categoryId]?.label || '',
                    item.kind === 'tv' ? '剧集' : '电影',
                    genres
                ].filter(Boolean).join(' · '))}</p>
                ${rating ? `<p class="mobile-result-score">${esc(rating.replace(/^ · /, ''))}</p>` : ''}
                ${item.overview ? `<p class="mobile-result-overview">${esc(item.overview)}</p>` : ''}
            </div>
        </button>`;
    }).join('');
}

/* =====================================================
   视图切换
   ===================================================== */

function setShellInert(inert) {
    const nav = $('#mobile-bottom-nav');
    if (nav) nav.inert = inert;
}

function switchView(name, options = {}) {
    if (!VIEWS.includes(name)) name = 'discover';
    if (name === activeView && shellReady) {
        if (name === 'search') $('#mobile-search-input')?.focus({ preventScroll: true });
        return;
    }
    $('#mobile-search-input')?.blur();
    activeView = name;
    closeCategoryMenu();
    closeFilterMenu();

    for (const view of VIEWS) {
        const node = $(`#mobile-view-${view}`);
        if (node) node.hidden = view !== name;
    }
    $$('#mobile-bottom-nav [data-mobile-view]').forEach((button) => {
        if (button.dataset.mobileView === name) button.setAttribute('aria-current', 'page');
        else button.removeAttribute('aria-current');
    });

    if (name === 'me') {
        renderMe();
        // 统计依赖跨分类数据，先渲染当前已加载部分，再补齐后重算
        ensureAllCategoriesLoaded().then(() => {
            if (activeView === 'me') renderMe();
        }).catch(() => {});
    }
    if (name === 'search') {
        renderFilterChips();
        renderSearchResults();
        $('#mobile-search-input')?.focus({ preventScroll: true });
    }
    if (name === 'discover') updateDiscoverHeader();

    hooks.onViewChange?.(name);
}

/* =====================================================
   初始化
   ===================================================== */

function bindEvents() {
    // 底栏
    $('#mobile-bottom-nav')?.addEventListener('click', (event) => {
        const button = event.target.closest('[data-mobile-view]');
        if (!button) return;
        const name = button.dataset.mobileView;
        if (name === activeView) {
            const host = name === 'discover' ? $('#main-content') : $(`#mobile-view-${name} .mobile-view-scroll`);
            host?.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
            return;
        }
        const previous = activeView;
        const previousId = viewHistoryId;
        const id = `view:${++viewSequence}`;
        getModalHistory().open(id,
            () => { viewHistoryId = previousId; switchView(previous); },
            () => { viewHistoryId = id; switchView(name); });
        viewHistoryId = id;
        switchView(name);
        window.scrollTo({ top: 0 });
    });

    $$('.mobile-view-back').forEach(button => button.addEventListener('click', () => {
        if (!viewHistoryId || !getModalHistory().close(viewHistoryId)) switchView('discover');
    }));

    // 分类面板
    $('#mobile-cat-toggle')?.addEventListener('click', (event) => {
        event.stopPropagation();
        setCategoryMenu(!catMenuOpen);
    });
    $('#mobile-cat-list')?.addEventListener('click', (event) => {
        const button = event.target.closest('[data-category]');
        if (!button) return;
        const categoryId = button.dataset.category;
        closeCategoryMenu();
        if (categoryId !== hooks.getCategoryId?.()) {
            hooks.onCategorySelect?.(categoryId);
        }
        $('#mobile-cat-toggle')?.focus({ preventScroll: true });
    });

    // 搜索页筛选
    $('#mobile-filter-chips')?.addEventListener('click', (event) => {
        const chip = event.target.closest('[data-filter]');
        if (!chip) return;
        const menu = $('#mobile-filter-menu');
        const key = chip.dataset.filter;
        if (filterMenuOpen && menu?.dataset.filter === key) {
            closeFilterMenu({ restoreFocus: true });
            return;
        }
        if (menu) menu.dataset.filter = key;
        getModalHistory().open('search-filter',
            () => closeFilterMenu({ restoreFocus: true, fromHistory: true }),
            () => setFilterMenu(true));
        setFilterMenu(true);
    });
    $('#mobile-filter-options')?.addEventListener('click', (event) => {
        const option = event.target.closest('[data-value]');
        const menu = $('#mobile-filter-menu');
        if (!option || !menu) return;
        searchFilters[menu.dataset.filter] = option.dataset.value;
        renderFilterChips();
        closeFilterMenu({ restoreFocus: true });
        renderSearchResults();
    });
    $('#mobile-filter-reset')?.addEventListener('click', () => {
        for (const key of Object.keys(searchFilters)) searchFilters[key] = '不限';
        renderFilterChips();
        renderSearchResults();
        closeFilterMenu({ restoreFocus: true });
    });
    $('#mobile-filter-close')?.addEventListener('click', () => closeFilterMenu({ restoreFocus: true }));

    let searchTimer = 0;
    let composing = false;
    $('#mobile-search-input')?.addEventListener('compositionstart', () => { composing = true; clearTimeout(searchTimer); });
    $('#mobile-search-input')?.addEventListener('compositionend', () => { composing = false; renderSearchResults(); });
    $('#mobile-search-input')?.addEventListener('input', () => {
        clearTimeout(searchTimer);
        if (composing) return;
        searchTimer = window.setTimeout(renderSearchResults, 160);
    });

    // 搜索结果行进入既有详情面板
    $('#mobile-search-results')?.addEventListener('click', (event) => {
        const row = event.target.closest('[data-item-id]');
        if (!row) return;
        hooks.onItemOpen?.(row.dataset.itemId);
    });

    // 点击外部关闭浮层
    document.addEventListener('click', (event) => {
        if (!event.target.closest('#mobile-cat-menu') && !event.target.closest('#mobile-cat-toggle')) {
            closeCategoryMenu();
        }
    });

    document.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape') return;
        if (filterMenuOpen) { closeFilterMenu({ restoreFocus: true }); return; }
        if (catMenuOpen) { closeCategoryMenu({ restoreFocus: true }); }
    });

    $('#mobile-filter-menu')?.addEventListener('click', (event) => {
        if (event.target.id === 'mobile-filter-menu') closeFilterMenu({ restoreFocus: true });
    });
    $('#mobile-filter-panel')?.addEventListener('keydown', (event) => trapFocus(event, $('#mobile-filter-panel')));

    const media = window.matchMedia('(max-width: 760px)');
    const onModeChange = () => {
        if (!media.matches) {
            closeCategoryMenu();
            closeFilterMenu();
        }
    };
    media.addEventListener('change', onModeChange);
    window.addEventListener('resize', () => {
        if (!media.matches) onModeChange();
    });
}

export function initMobileShell(options = {}) {
    hooks = options;
    if (!$('#mobile-bottom-nav')) return;

    bindEvents();
    shellReady = true;
    switchView('discover');
    updateDiscoverHeader();
    setShellInert(false);
}

export function syncMobileShell() {
    if (!shellReady) return;
    updateDiscoverHeader();
    if (activeView === 'discover') renderCategoryPanel();
    if (activeView === 'search') { renderFilterChips(); renderSearchResults(); }
    if (activeView === 'me') {
        meCache = null;
        meLoading = false;
        renderMe();
    }
}

export function isShellInert() {
    return $('#mobile-bottom-nav')?.inert === true;
}

export function setMobileShellInert(inert) {
    setShellInert(inert);
}

export function resetMobileMeCache() {
    meCache = null;
}
