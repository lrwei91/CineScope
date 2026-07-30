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
    'mobile-category-sheet',
    'mobile-category-overlay'
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

export function syncBodyModalState() {
    document.body.classList.toggle('modal-open', isAnyModalOpen());
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
    if (isAnyModalOpen()) return;
    if (element instanceof HTMLElement && document.contains(element)) {
        element.focus();
    }
}

export function trapFocus(event, container) {
    if (event.key !== 'Tab' || !container) return;

    const focusable = [...container.querySelectorAll(FOCUSABLE_SELECTOR)]
        .filter((element) => !element.hidden && element.getAttribute('aria-hidden') !== 'true');

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
