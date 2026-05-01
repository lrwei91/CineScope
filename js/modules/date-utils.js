/**
 * 日期工具模块
 * 统一按本地日历日解析 YYYY-MM-DD，避免 UTC 解析导致的边界误判
 */

/**
 * 将 YYYY-MM-DD 解析为本地时区当天零点
 */
export function parseDateStringAsLocalDate(value) {
    if (value instanceof Date) {
        const date = new Date(value.getTime());
        date.setHours(0, 0, 0, 0);
        return date;
    }

    const normalized = String(value || '').trim();
    const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);

    if (match) {
        const [, year, month, day] = match;
        return new Date(Number(year), Number(month) - 1, Number(day));
    }

    const fallback = new Date(normalized);
    if (Number.isNaN(fallback.getTime())) {
        return fallback;
    }

    fallback.setHours(0, 0, 0, 0);
    return fallback;
}

/**
 * 判断项目日期是否晚于今天
 */
export function isDateAfterToday(value, today = new Date()) {
    const itemDate = parseDateStringAsLocalDate(value);
    if (Number.isNaN(itemDate.getTime())) return false;

    const todayStart = new Date(today.getTime());
    todayStart.setHours(0, 0, 0, 0);
    return itemDate > todayStart;
}
