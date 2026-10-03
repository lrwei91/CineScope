/**
 * 模态状态模块
 * 统一管理 body.modal-open —— 任何模态打开时由调用方 add/remove，
 * 但关闭时为避免遗漏，统一走 syncBodyModalState() 检查所有已知模态的 active 状态。
 */

const MODAL_IDS = [
    'intel-dossier',
    'intel-dossier-overlay',
    'trailer-modal',
    'trailer-modal-overlay',
    'mobile-filter-sheet',
    'mobile-sheet-overlay',
    'share-preview',
    'mobile-filter-menu'
];

const FOCUSABLE_SELECTOR = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])'
].join(',');

export function isAnyModalOpen() {
    return MODAL_IDS.some((id) => document.getElementById(id)?.classList.contains('active'));
}

let lockedScrollY = null;
export function syncBodyModalState() {
    const open = isAnyModalOpen();
    if (open && lockedScrollY === null) {
        lockedScrollY = window.scrollY;
        document.body.style.position = 'fixed';
        document.body.style.top = `-${lockedScrollY}px`;
        document.body.style.width = '100%';
    } else if (!open && lockedScrollY !== null) {
        const position = lockedScrollY;
        lockedScrollY = null;
        for (const property of ['position', 'top', 'width']) document.body.style.removeProperty(property);
        window.scrollTo({ top: position, behavior: 'instant' });
    }
    const bottomNav = document.getElementById('mobile-bottom-nav');
    if (bottomNav) { bottomNav.inert = open; bottomNav.hidden = open; }
    document.body.classList.toggle('modal-open', open);
    const page = document.querySelector('.page-shell');
    if (page) page.inert = open;
    const shell = document.getElementById('mobile-shell');
    if (shell) {
        const filterOpen = document.getElementById('mobile-filter-menu')?.classList.contains('active');
        shell.inert = open && !filterOpen;
        shell.querySelectorAll('.mobile-view').forEach(view => { view.inert = open; });
    }
    const dossier = document.getElementById('intel-dossier');
    if (dossier?.classList.contains('active')) {
        dossier.inert = Boolean(document.getElementById('trailer-modal')?.classList.contains('active') || document.getElementById('share-preview'));
    }
}

export function focusModal(container, preferredSelector = 'button') {
    if (!container) return;

    const target = container.querySelector(preferredSelector) || container.querySelector(FOCUSABLE_SELECTOR);
    target?.focus({ preventScroll: true });

    requestAnimationFrame(() => {
        target?.focus({ preventScroll: true });
    });
}

export function restoreModalFocus(element) {
    if (isAnyModalOpen() && (!(element instanceof HTMLElement) || !element.closest('[role="dialog"].active') || element.closest('[inert]'))) return;
    if (element instanceof HTMLElement && document.contains(element)) {
        element.focus({ preventScroll: true });
    }
}

export function trapFocus(event, container) {
    if (event.key !== 'Tab' || !container) return;

    const focusable = [...container.querySelectorAll(FOCUSABLE_SELECTOR)]
        .filter((element) => !element.hidden && element.getAttribute('aria-hidden') !== 'true' && element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden');

    if (focusable.length === 0) {
        event.preventDefault();
        return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
    }
}
