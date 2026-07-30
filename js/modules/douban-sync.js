/**
 * 豆瓣数据同步模块
 * 负责豆瓣状态数据的加载和同步
 */

import { DOUBAN_STATUS_URL } from './config.js';
import { buildFreshUrl, formatUpdateTimestamp } from './data-loader.js';

let doubanStatuses = {};
let doubanStatusesMetadata = null;
let buildReportDoubanStatus = null;
let isDoubanSyncing = false;
let onHydratedCallback = () => {};

export function configureDoubanSync({ onHydrated = () => {} } = {}) {
    onHydratedCallback = onHydrated;
}

/**
 * 获取相对时间描述
 */
function getRelativeTimeDesc(timestamp) {
    if (!timestamp) return '';
    const diffMs = Date.now() - new Date(timestamp).getTime();
    if (diffMs < 0) return '刚刚';
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays <= 0) {
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        if (diffHours <= 0) {
            const diffMinutes = Math.floor(diffMs / (1000 * 60));
            if (diffMinutes <= 0) {
                return '刚刚';
            }
            return `${diffMinutes}分钟前`;
        }
        return `${diffHours}小时前`;
    }
    return `${diffDays}天前`;
}

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
        // 1. 获取豆瓣本身的用户收藏状态
        const response = await fetch(buildFreshUrl(DOUBAN_STATUS_URL), { cache: 'no-store' });
        if (!response.ok) {
            throw new Error(`Could not load ${DOUBAN_STATUS_URL}`);
        }
        const payload = await response.json();
        doubanStatuses = payload.statuses || {};
        doubanStatusesMetadata = payload.metadata || null;

        // 2. 尝试获取构建报告，检测豆瓣定时任务的最近同步状态
        try {
            const reportResponse = await fetch(buildFreshUrl('json/build_report.json'), { cache: 'no-store' });
            if (reportResponse.ok) {
                const reportPayload = await reportResponse.json();
                buildReportDoubanStatus = reportPayload.douban_statuses || null;
            }
        } catch (reportError) {
            console.warn('Failed to load build report:', reportError);
            buildReportDoubanStatus = null;
        }

    } catch (error) {
        console.error('Failed to hydrate Douban statuses:', error);
        doubanStatuses = {};
        doubanStatusesMetadata = null;
    } finally {
        isDoubanSyncing = false;
        updateDoubanAuthUI();
        
        // 数据同步完毕后，由应用层决定是否重绘当前分类。
        onHydratedCallback();
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
    let statusState = 'ready';
    if (isDoubanSyncing) {
        statusText = '正在读取豆瓣收藏状态';
        statusState = 'loading';
    } else {
        const lastUpdated = doubanStatusesMetadata?.last_updated;
        const isFailed = buildReportDoubanStatus?.status === 'failed';
        const isSkipped = buildReportDoubanStatus?.status === 'skipped';

        if (isFailed) {
            statusState = 'warning';
            if (lastUpdated) {
                statusText = `同步失败，正在使用 ${getRelativeTimeDesc(lastUpdated)}的数据`;
            } else {
                statusText = '同步失败，暂无可用数据';
            }
        } else if (isSkipped) {
            statusState = 'muted';
            if (lastUpdated) {
                statusText = `本次同步跳过，使用 ${getRelativeTimeDesc(lastUpdated)}的数据`;
            } else {
                statusText = '本次同步跳过，暂无可用数据';
            }
        } else if (lastUpdated) {
            statusText = `最近同步：${formatUpdateTimestamp(lastUpdated)}`;
        } else {
            statusText = '同步状态已就绪';
        }
    }

    doubanAuthStatus.textContent = statusText;
    doubanAuthStatus.dataset.state = statusState;

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
