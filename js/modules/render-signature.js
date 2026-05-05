function normalizeRealtimeMetricSignature(value) {
    if (!value || typeof value !== 'object') return '';
    return JSON.stringify(value);
}

export function buildRenderedItemKey(item) {
    return [
        item.id,
        item.date,
        item.title,
        item.subtitle,
        item.doubanRating,
        item.doubanCollectionStatus,
        item.posterPath,
        normalizeRealtimeMetricSignature(item.boxOffice),
        normalizeRealtimeMetricSignature(item.tvHeat)
    ].join('|');
}

export function buildRenderedItemsSignature(items) {
    return items.map(buildRenderedItemKey).join('||');
}
