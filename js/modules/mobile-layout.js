/**
 * 移动端布局模块（2026-10-03 改版）
 *
 * 职责收敛为「桌面 ↔ 手机 的节点搬运 + 视口切换」：
 * - 手机端把品牌与题头搬进「关于」视图，把筛选按钮搬进顶栏。
 * - 视图切换、分类面板、搜索筛选由 mobile-shell.js 负责，本模块不再重复实现。
 */

import { closeMobileFilterSheet } from './mobile-sheet.js?v=20261003e';

let syncCategory = () => {};
let syncShell = () => {};
export function syncMobileCategory(categoryId) { syncCategory(categoryId); }
export function syncMobileShell() { syncShell(); }

export function initMobileLayout(options = {}) {
    const media = matchMedia('(max-width: 760px)');
    const categories = document.querySelector('.category-navigation');
    const categoryButtons = [...document.querySelectorAll('[data-category]')];
    const hero = document.querySelector('.hero-header');
    const filter = document.getElementById('mobile-filter-fab');
    const share = document.getElementById('share-dossier-btn');
    const back = document.getElementById('close-dossier-btn');
    const input = document.getElementById('radar-search');
    const nav = document.getElementById('mobile-bottom-nav');
    const catalog = [document.getElementById('catalog-controls'), document.getElementById('main-content'), document.querySelector('.file-loader')];
    const aboutContent = document.getElementById('mobile-about-content');

    let categoryId = document.getElementById('results-container')?.dataset.category || 'tv_cn';
    const viewOwner = `mobile-${Date.now()}`;

    // 需要在手机顶栏与关于页之间搬运的节点
    const movable = [hero, filter, share, back]
        .filter(Boolean)
        .map((node) => {
            const marker = document.createComment('desktop placement');
            node.before(marker);
            return { node, marker };
        });

    function render() {
        const mobile = media.matches;
        // 分类切换收进「发现」页右上角面板，桌面端横向分类保持原样
        if (categories) categories.hidden = mobile;
        document.body.classList.toggle('mobile-shell-active', mobile);
        // 筛选入口在搜索页，目录页不再常驻筛选按钮
        if (filter) filter.hidden = mobile;

        if (mobile && input) {
            const label = categoryButtons.find((button) => button.dataset.category === categoryId)?.textContent;
            input.placeholder = `搜索${label || ''}片名、别名或关键词`;
            input.setAttribute('aria-label', `搜索${label || ''}片单`);
        }
    }

    function layout() {
        if (media.matches) {
            // 题头进入「关于」视图；筛选按钮进入顶栏插槽
            if (aboutContent && hero) aboutContent.prepend(hero);
            document.getElementById('dossier-mobile-toolbar')?.append(back, share);
        } else {
            closeMobileFilterSheet();
            for (const { node, marker } of movable) marker.after(node);
            if (filter) filter.hidden = false;
        }
        render();
    }

    syncCategory = (id) => { categoryId = id; render(); };
    syncShell = () => render();

    // 底栏由 mobile-shell 处理，这里只监听视口变化做重排
    if (nav) nav.dataset.layoutManaged = 'true';

    media.addEventListener('change', layout);
    layout();

    // 底栏高度同步为 CSS 变量，供内容区留白与返回顶部定位使用
    const updateNavHeight = () => {
        if (!nav) return;
        const height = nav.getBoundingClientRect().height;
        if (height) document.documentElement.style.setProperty('--mobile-bottom-height', `${height}px`);
    };
    if (nav) new ResizeObserver(updateNavHeight).observe(nav);

    // 软键盘与可视区域变化
    const viewport = window.visualViewport;
    const resizeViewport = () => {
        const editing = document.activeElement?.matches('input,textarea,[contenteditable="true"]');
        document.body.classList.toggle('mobile-keyboard-open',
            media.matches && editing && (viewport?.scale || 1) === 1
            && innerHeight - (viewport?.height || innerHeight) > 100);
        document.documentElement.style.setProperty('--visible-height', `${viewport?.height || innerHeight}px`);
        document.documentElement.style.setProperty('--viewport-top', `${viewport?.offsetTop || 0}px`);
    };
    document.addEventListener('focusin', resizeViewport);
    document.addEventListener('focusout', resizeViewport);
    viewport?.addEventListener('resize', resizeViewport, { passive: true });
    viewport?.addEventListener('scroll', resizeViewport, { passive: true });
    window.addEventListener('resize', resizeViewport, { passive: true });
    resizeViewport();

    // 记录视图归属，避免多实例互相影响返回语义
    history.replaceState({ ...history.state, mobileViewOwner: viewOwner }, '', location.href);
}
