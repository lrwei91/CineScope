import { focusModal, restoreModalFocus, syncBodyModalState, trapFocus } from './modal-state.js?v=20261003b';
import { getModalHistory } from './modal-history.js';
import { closeMobileFilterSheet } from './mobile-sheet.js?v=20261003b';

// Move the existing controls, preserving their IDs, listeners and filter state.
export function initMobileLayout() {
    const media = matchMedia('(max-width: 760px)');
    const drawer = document.getElementById('mobile-category-drawer');
    const overlay = document.getElementById('mobile-category-overlay');
    const trigger = document.getElementById('open-category-drawer');
    const categories = document.querySelector('.category-navigation');
    const categoryButtons = document.getElementById('category-filter-container');
    const hero = document.querySelector('.hero-header');
    const filter = document.getElementById('mobile-filter-fab');
    const share = document.getElementById('share-dossier-btn');
    const back = document.getElementById('close-dossier-btn');
    let returnFocus;
    let pendingCategory;
    const movable = [categories, hero, filter, share, back].map(node => {
        const marker = document.createComment('desktop placement');
        node.before(marker);
        return { node, marker };
    });

    function close(fromHistory = false) {
        if (!drawer.classList.contains('active')) return;
        if (!fromHistory && getModalHistory().close('category')) return;
        drawer.classList.remove('active');
        drawer.setAttribute('aria-hidden', 'true');
        drawer.inert = true;
        overlay.classList.remove('active');
        trigger.setAttribute('aria-expanded', 'false');
        syncBodyModalState();
        restoreModalFocus(returnFocus);
        // Close the modal history entry before changing the category hash.
        if (pendingCategory) {
            const category = pendingCategory;
            pendingCategory = null;
            location.hash = category;
        }
    }

    trigger.addEventListener('click', () => {
        returnFocus = trigger;
        drawer.inert = false;
        drawer.setAttribute('aria-hidden', 'false');
        drawer.classList.add('active');
        overlay.classList.add('active');
        trigger.setAttribute('aria-expanded', 'true');
        syncBodyModalState();
        getModalHistory().open('category', () => close(true));
        focusModal(drawer, '#close-category-drawer');
    });
    document.getElementById('close-category-drawer').addEventListener('click', () => close());
    overlay.addEventListener('click', () => close());
    categoryButtons.addEventListener('click', event => {
        if (!media.matches) return;
        const button = event.target.closest('[data-category]');
        if (!button) return;
        event.stopImmediatePropagation();
        pendingCategory = button.dataset.category;
        close();
    }, true);
    document.addEventListener('keydown', event => {
        if (!drawer.classList.contains('active')) return;
        if (event.key === 'Escape') close();
        else trapFocus(event, drawer);
    });

    function layout() {
        if (media.matches) {
            document.getElementById('mobile-category-slot').append(categories);
            document.getElementById('mobile-about-slot').append(hero);
            document.getElementById('mobile-filter-slot').append(filter);
            document.getElementById('dossier-mobile-toolbar').append(back, share);
        } else {
            pendingCategory = null;
            close();
            closeMobileFilterSheet();
            for (const { node, marker } of movable) marker.after(node);
        }
    }
    media.addEventListener('change', layout);
    layout();

    // dvh follows most keyboards; visualViewport handles overlays on browsers
    // that leave the layout viewport unchanged. This changes sizing, not scroll.
    const viewport = window.visualViewport;
    const resizeViewport = () => {
        document.documentElement.style.setProperty('--visible-height', `${viewport?.height || innerHeight}px`);
        document.documentElement.style.setProperty('--viewport-top', `${viewport?.offsetTop || 0}px`);
    };
    viewport?.addEventListener('resize', resizeViewport, { passive: true });
    viewport?.addEventListener('scroll', resizeViewport, { passive: true });
    window.addEventListener('resize', resizeViewport, { passive: true });
    resizeViewport();
}
