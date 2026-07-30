/**
 * 向需要交互的页面注入共享浮层。
 * 页面主体保持静态 HTML，详情、预告片与移动端筛选只维护一份结构。
 */

function appendMarkupOnce(id, markup) {
    if (document.getElementById(id)) return;
    document.body.insertAdjacentHTML('beforeend', markup);
}

export function ensureCommonControls() {
    appendMarkupOnce('back-to-top', `
        <button id="back-to-top" class="back-to-top-btn" type="button" aria-label="返回顶部" hidden>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M18 15l-6-6-6 6"></path>
            </svg>
        </button>
    `);
    appendMarkupOnce('loading-overlay', '<div id="loading-overlay" class="loading-overlay"><div class="loader"></div></div>');
    appendMarkupOnce('toast-notification', '<div id="toast-notification" class="toast-notification"></div>');
    appendMarkupOnce('crt-overlay', '<div id="crt-overlay"></div>');
}

export function ensureMediaOverlays() {
    ensureCommonControls();
    appendMarkupOnce('intel-dossier-overlay', '<div id="intel-dossier-overlay" class="dossier-overlay" aria-hidden="true"></div>');
    appendMarkupOnce('intel-dossier', `
        <aside id="intel-dossier" class="dossier-drawer" role="dialog" aria-modal="true" aria-labelledby="dossier-title" aria-hidden="true" inert>
            <button id="close-dossier-btn" class="close-btn" type="button" aria-label="关闭面板">&times;</button>
            <div class="dossier-content">
                <div class="dossier-visual">
                    <div class="dossier-poster-container">
                        <img id="dossier-poster" src="" alt="详情海报">
                        <div id="dossier-status-badge" hidden></div>
                    </div>
                </div>
                <div class="dossier-data">
                    <p class="dossier-subtext">片单编号 <span id="dossier-id"></span></p>
                    <div class="dossier-header-main">
                        <h2 id="dossier-title"></h2>
                        <button id="share-dossier-btn" class="dossier-inline-share-btn" type="button" title="分享影视档案" aria-label="分享影视档案">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                                <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path>
                                <polyline points="16 6 12 2 8 6"></polyline>
                                <line x1="12" y1="2" x2="12" y2="15"></line>
                            </svg>
                        </button>
                    </div>
                    <h3 id="dossier-subtitle"></h3>
                    <div class="dossier-metrics">
                        <div class="metric-box">
                            <span class="metric-label">豆瓣评分</span>
                            <span id="dossier-rating" class="metric-value"></span>
                        </div>
                        <div class="metric-box">
                            <span class="metric-label">上映日期</span>
                            <span id="dossier-date" class="metric-value"></span>
                        </div>
                    </div>
                    <div class="dossier-facts-section">
                        <p class="dossier-section-title">核心信息</p>
                        <div class="dossier-facts-list">
                            <div id="dossier-directors-row" class="dossier-fact-row" hidden>
                                <span class="dossier-fact-label">导演</span>
                                <span id="dossier-directors" class="dossier-fact-value"></span>
                            </div>
                            <div id="dossier-actors-row" class="dossier-fact-row" hidden>
                                <span class="dossier-fact-label">主演</span>
                                <span id="dossier-actors" class="dossier-fact-value"></span>
                            </div>
                        </div>
                    </div>
                    <div id="dossier-overview-section" class="dossier-overview-section" hidden>
                        <p class="dossier-section-title">剧情简介</p>
                        <p id="dossier-overview" class="dossier-overview-text"></p>
                    </div>
                    <div class="dossier-tags-section">
                        <p class="dossier-section-title">分类标签</p>
                        <div id="dossier-tags" class="dossier-tag-row"></div>
                    </div>
                    <div class="dossier-tags-section">
                        <p class="dossier-section-title">播出平台</p>
                        <div id="dossier-networks" class="dossier-tag-row"></div>
                    </div>
                    <div id="dossier-trailers-section" class="dossier-tags-section" hidden>
                        <p class="dossier-section-title">预告片</p>
                        <div id="dossier-trailers" class="dossier-trailer-row"></div>
                    </div>
                    <div class="dossier-actions">
                        <p class="dossier-section-title">外部链接</p>
                        <div class="dossier-share-row" style="display: none;"></div>
                        <div id="dossier-links-container" class="dossier-links-row"></div>
                    </div>
                </div>
            </div>
        </aside>
    `);
    appendMarkupOnce('trailer-modal-overlay', '<div id="trailer-modal-overlay" class="trailer-modal-overlay" aria-hidden="true"></div>');
    appendMarkupOnce('trailer-modal', `
        <section id="trailer-modal" class="trailer-modal" role="dialog" aria-modal="true" aria-labelledby="trailer-modal-title" aria-hidden="true" inert>
            <button id="close-trailer-modal-btn" class="close-btn" type="button" aria-label="关闭预告片弹层">&times;</button>
            <div class="trailer-modal-content">
                <div class="trailer-player-shell">
                    <iframe
                        id="trailer-modal-frame"
                        class="trailer-modal-frame"
                        src=""
                        title="预告片播放器"
                        loading="lazy"
                        allowfullscreen
                        referrerpolicy="no-referrer"
                    ></iframe>
                </div>
                <div class="trailer-modal-meta">
                    <p class="dossier-subtext">Bilibili 预告片</p>
                    <h2 id="trailer-modal-title" class="trailer-modal-title"></h2>
                    <p id="trailer-modal-subtitle" class="trailer-modal-subtitle"></p>
                    <div id="trailer-modal-list" class="trailer-list-row"></div>
                    <a id="trailer-modal-link" class="trailer-modal-link" href="" target="_blank" rel="noopener noreferrer">前往 B 站播放</a>
                </div>
            </div>
        </section>
    `);
}

export function ensureCatalogMobileControls() {
    appendMarkupOnce('mobile-category-overlay', '<div class="mobile-category-overlay" id="mobile-category-overlay"></div>');
    appendMarkupOnce('mobile-category-sheet', `
        <div class="mobile-category-sheet" id="mobile-category-sheet" role="dialog" aria-modal="true" aria-labelledby="mobile-category-sheet-title" aria-hidden="true" inert>
            <div class="sheet-header">
                <span class="sheet-title" id="mobile-category-sheet-title">浏览分类</span>
                <button class="sheet-close-btn" id="close-category-sheet" type="button" aria-label="关闭分类面板">&times;</button>
            </div>
            <div id="mobile-category-pills" class="mobile-category-pills"></div>
        </div>
    `);
    appendMarkupOnce('mobile-filter-fab', `
        <button id="mobile-filter-fab" class="mobile-filter-fab" type="button" aria-label="打开筛选">
            <span class="fab-icon" aria-hidden="true">☰</span>
            <span class="fab-text">筛选片单</span>
            <span id="fab-active-badge" class="fab-badge" hidden></span>
        </button>
    `);
    appendMarkupOnce('mobile-sheet-overlay', '<div class="mobile-sheet-overlay" id="mobile-sheet-overlay"></div>');
    appendMarkupOnce('mobile-filter-sheet', `
        <div class="mobile-filter-sheet" id="mobile-filter-sheet" role="dialog" aria-modal="true" aria-labelledby="mobile-filter-sheet-title" aria-hidden="true" inert>
            <div class="sheet-drag-handle"></div>
            <div class="sheet-header">
                <span class="sheet-title" id="mobile-filter-sheet-title">筛选片单</span>
                <button class="sheet-close-btn" id="close-filter-sheet" type="button" aria-label="关闭筛选面板">&times;</button>
            </div>
            <div class="sheet-content">
                <div class="sheet-search-container">
                    <input type="search" id="mobile-sheet-search" placeholder="搜索片名、别名或关键词" autocomplete="off" aria-label="搜索片单">
                </div>
                <div class="sheet-section">
                    <p class="sheet-section-label">评分</p>
                    <div id="mobile-rating-mirror" class="sheet-pills-row"></div>
                </div>
                <div class="sheet-section">
                    <p class="sheet-section-label">类型</p>
                    <div id="mobile-genre-mirror" class="sheet-pills-row"></div>
                </div>
            </div>
            <div class="sheet-footer">
                <span class="sheet-footer-label">豆瓣同步</span>
                <span id="mobile-douban-status" class="sheet-footer-status">加载中...</span>
            </div>
        </div>
    `);
}
