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

export function isAnyModalOpen() {
    return MODAL_IDS.some((id) => document.getElementById(id)?.classList.contains('active'));
}

export function syncBodyModalState() {
    document.body.classList.toggle('modal-open', isAnyModalOpen());
}
