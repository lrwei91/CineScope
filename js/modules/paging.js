function getMonthKey(item) {
    return String(item?.date || '').trim().slice(0, 7);
}

export function getPageEndIndex(items, startIndex, pageSize, options = {}) {
    const { keepMonthIntact = false } = options;
    const safeItems = Array.isArray(items) ? items : [];
    const safeStartIndex = Math.max(0, Number(startIndex) || 0);
    const safePageSize = Math.max(0, Number(pageSize) || 0);
    const minimumEndIndex = Math.min(safeItems.length, safeStartIndex + safePageSize);

    if (!keepMonthIntact || minimumEndIndex === 0 || minimumEndIndex >= safeItems.length) {
        return minimumEndIndex;
    }

    const trailingMonthKey = getMonthKey(safeItems[minimumEndIndex - 1]);
    if (!trailingMonthKey) {
        return minimumEndIndex;
    }

    let endIndex = minimumEndIndex;
    while (endIndex < safeItems.length && getMonthKey(safeItems[endIndex]) === trailingMonthKey) {
        endIndex += 1;
    }

    return endIndex;
}

export function getNextPageRange(items, renderedItemCount, pageSize, options = {}) {
    const safeItems = Array.isArray(items) ? items : [];
    const startIndex = Math.min(
        safeItems.length,
        Math.max(0, Number(renderedItemCount) || 0)
    );

    return {
        startIndex,
        endIndex: getPageEndIndex(safeItems, startIndex, pageSize, options)
    };
}
