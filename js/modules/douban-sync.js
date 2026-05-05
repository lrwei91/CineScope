/**
 * 豆瓣数据同步模块
 * 负责豆瓣状态数据的加载和同步
 */

import { DOUBAN_STATUS_URL } from './config.js';
import { buildFreshUrl, formatUpdateTimestamp } from './data-loader.js';

let doubanStatuses = {};
let doubanStatusesMetadata = null;
let isDoubanSyncing = false;

/**
 * 获取豆瓣状态数据
 */
export function getDoubanStatuses() {
    return doubanStatuses;
}

/**
 * 获取豆瓣状态元数据
 */
export function getDoubanStatusesMetadata() {
    return doubanStatusesMetadata;
}

/**
 * 检查是否正在同步
 */
export function isSyncing() {
    return isDoubanSyncing;
}

/**
 * 为项目附加豆瓣状态
 */
export function attachDoubanStatus(item) {
    if (!item?.doubanSubjectId) {
        return { ...item, doubanCollectionStatus: null };
    }
    const status = doubanStatuses[item.doubanSubjectId]?.status || null;
    return { ...item, doubanCollectionStatus: status };
}

/**
 * 同步所有项目状态
 */
export function syncAllItems(items) {
    return items.map(attachDoubanStatus);
}

/**
 * 获取项目的收藏状态
 */
export function getCollectionStatusForItem(item) {
    if (!item?.doubanSubjectId) return null;
    return doubanStatuses[item.doubanSubjectId]?.status || null;
}

/**
 * 水合豆瓣状态数据
 */
export async function hydrateDoubanStatuses() {
    isDoubanSyncing = true;
    updateDoubanAuthUI();

    try {
        const response = await fetch(buildFreshUrl(DOUBAN_STATUS_URL), { cache: 'no-store' });
        if (!response.ok) {
            throw new Error(`Could not load ${DOUBAN_STATUS_URL}`);
        }
        const payload = await response.json();
        doubanStatuses = payload.statuses || {};
        doubanStatusesMetadata = payload.metadata || null;
    } catch (error) {
        console.error('Failed to hydrate Douban statuses:', error);
        doubanStatuses = {};
        doubanStatusesMetadata = null;
    } finally {
        isDoubanSyncing = false;
        updateDoubanAuthUI();
    }
}

/**
 * 更新豆瓣认证 UI
 */
function updateDoubanAuthUI() {
    const doubanAuthStatus = document.getElementById('douban-auth-status');
    if (!doubanAuthStatus) return;

    const mobileDoubanStatus = document.getElementById('mobile-douban-status');

    let statusText = '';
    if (isDoubanSyncing) {
        statusText = '> 正在同步数据...';
    } else {
        const lastUpdated = doubanStatusesMetadata?.last_updated;
        if (lastUpdated) {
            statusText = `> 已同步 ${formatUpdateTimestamp(lastUpdated)}`;
        } else {
            statusText = '> 同步完成';
        }
    }

    // 使用 typewriter 效果更新文本
    if (window.typeWriterEffect) {
        window.typeWriterEffect(doubanAuthStatus, statusText);
    } else {
        doubanAuthStatus.textContent = statusText;
    }

    if (mobileDoubanStatus) {
        mobileDoubanStatus.textContent = doubanAuthStatus.textContent;
    }
}

/**
 * 手动触发 UI 更新
 */
export function updateUI() {
    updateDoubanAuthUI();
}
