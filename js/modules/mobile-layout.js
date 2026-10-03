import { closeMobileFilterSheet } from './mobile-sheet.js?v=20261003e';

const sections = {
    series: { label: '剧集', categories: ['tv_cn', 'tv_kr', 'tv_jp', 'tv_us'] },
    movies: { label: '电影', categories: ['movie_cn', 'douban_top250'] },
    variety: { label: '综艺', categories: ['tv_cn_variety'] }
};
let syncCategory = () => {};
export function syncMobileCategory(categoryId) { syncCategory(categoryId); }

// Reuse the existing controls and preserve their listeners and desktop placement.
export function initMobileLayout() {
    const media = matchMedia('(max-width: 760px)');
    const categories = document.querySelector('.category-navigation');
    const categoryButtons = [...document.querySelectorAll('[data-category]')];
    const hero = document.querySelector('.hero-header');
    const brand = document.querySelector('.mobile-brand');
    const filter = document.getElementById('mobile-filter-fab');
    const share = document.getElementById('share-dossier-btn');
    const back = document.getElementById('close-dossier-btn');
    const nav = document.getElementById('mobile-bottom-nav');
    const about = document.getElementById('mobile-about');
    const input = document.getElementById('radar-search');
    const title = document.getElementById('mobile-current-category');
    const catalog = [document.getElementById('catalog-controls'), document.getElementById('main-content'), document.querySelector('.file-loader')];
    let categoryId = document.getElementById('results-container').dataset.category || 'tv_cn';
    let view = history.state?.mobileView || 'catalog';
    const viewOwner = `mobile-${Date.now()}`;
    const sectionFor = id => Object.keys(sections).find(key => sections[key].categories.includes(id)) || 'series';
    const movable = [hero, brand, filter, share, back].map(node => {
        const marker = document.createComment('desktop placement');
        node.before(marker);
        return { node, marker };
    });

    function render() {
        const mobile = media.matches;
        const section = sectionFor(categoryId);
        const isAbout = mobile && view === 'about';
        about.hidden = !isAbout;
        catalog.forEach(node => { node.hidden = isAbout; });
        categories.hidden = mobile && (view !== 'catalog' || sections[section].categories.length < 2);
        categoryButtons.forEach(button => { button.hidden = mobile && !sections[section].categories.includes(button.dataset.category); });
        document.body.classList.toggle('mobile-search-active', mobile && view === 'search');
        filter.hidden = isAbout;
        title.textContent = view === 'about' ? '关于' : view === 'search' ? '搜索' : sections[section].label;
        const label = categoryButtons.find(button => button.dataset.category === categoryId)?.textContent;
        input.placeholder = mobile ? `搜索${label}片名、别名或关键词` : '搜索片名、别名或关键词';
        input.setAttribute('aria-label', mobile ? `搜索${label}片单` : '搜索片单');
        const active = view === 'catalog' ? section : view;
        nav.querySelectorAll('button').forEach(button => {
            if (button.dataset.mobileSection === active) button.setAttribute('aria-current', 'page');
            else button.removeAttribute('aria-current');
        });
    }
    function changeView(next, push = true) {
        if (next === view) { if (next === 'search') input.focus(); return; }
        if (push) history.replaceState({ ...history.state, mobileScroll: window.scrollY }, '', location.href);
        view = next;
        if (push) history.pushState({ ...history.state, mobileView: next, mobileViewOwner: viewOwner }, '', location.href);
        render();
        window.scrollTo({ top: 0 });
        if (next === 'search') input.focus({ preventScroll: true });
    }
    function clearSearch() {
        if (!input.value) return;
        input.value = '';
        input.dispatchEvent(new InputEvent('input'));
    }
    syncCategory = id => { categoryId = id; render(); };
    nav.addEventListener('click', event => {
        const button = event.target.closest('[data-mobile-section]');
        if (!button) return;
        const next = button.dataset.mobileSection;
        if (sections[next]) {
            if (view === 'catalog' && sectionFor(categoryId) === next) { window.scrollTo({ top: 0 }); return; }
            clearSearch();
            view = 'catalog';
            const target = sections[next].categories[0];
            categoryId = target;
            if (location.hash !== `#${target}`) location.hash = target;
            else history.replaceState({ ...history.state, mobileView: 'catalog' }, '', location.href);
            render();
            window.scrollTo({ top: 0 });
        } else changeView(next);
    });
    document.getElementById('close-mobile-search').addEventListener('click', () => {
        clearSearch();
        if (history.state?.mobileViewOwner === viewOwner && history.state?.mobileView === 'search') history.back();
        else { changeView('catalog', false); history.replaceState({ ...history.state, mobileView: 'catalog' }, '', location.href); }
        nav.querySelector(`[data-mobile-section="${sectionFor(categoryId)}"]`).focus({ preventScroll: true });
    });
    window.addEventListener('popstate', () => {
        const previousView = view;
        view = history.state?.mobileView || 'catalog';
        if (media.matches && view !== 'search') clearSearch();
        render();
        if (media.matches && previousView !== view && view === 'catalog') requestAnimationFrame(() => window.scrollTo({ top: history.state?.mobileScroll || 0, behavior: 'instant' }));
    });
    window.addEventListener('hashchange', () => {
        view = 'catalog';
        const route = location.hash.slice(1);
        if (categoryButtons.some(button => button.dataset.category === route)) categoryId = route;
        render();
    });

    function layout() {
        if (media.matches) {
            document.getElementById('mobile-about-content').append(brand, hero);
            brand.removeAttribute('href');
            document.getElementById('mobile-filter-slot').append(filter);
            document.getElementById('dossier-mobile-toolbar').append(back, share);
        } else {
            closeMobileFilterSheet();
            brand.setAttribute('href', '#page-top');
            for (const { node, marker } of movable) marker.after(node);
        }
        render();
    }
    media.addEventListener('change', layout);
    layout();
    const updateNavHeight = () => {
        const height = nav.getBoundingClientRect().height;
        if (height) document.documentElement.style.setProperty('--mobile-bottom-height', `${height}px`);
    };
    new ResizeObserver(updateNavHeight).observe(nav);
    const viewport = window.visualViewport;
    const resizeViewport = () => {
        const editing = document.activeElement?.matches('input,textarea,[contenteditable="true"]');
        document.body.classList.toggle('mobile-keyboard-open', media.matches && editing && (viewport?.scale || 1) === 1 && innerHeight - (viewport?.height || innerHeight) > 100);
        document.documentElement.style.setProperty('--visible-height', `${viewport?.height || innerHeight}px`);
        document.documentElement.style.setProperty('--viewport-top', `${viewport?.offsetTop || 0}px`);
    };
    document.addEventListener('focusin', resizeViewport);
    document.addEventListener('focusout', resizeViewport);
    viewport?.addEventListener('resize', resizeViewport, { passive: true });
    viewport?.addEventListener('scroll', resizeViewport, { passive: true });
    window.addEventListener('resize', resizeViewport, { passive: true });
    resizeViewport();
}
