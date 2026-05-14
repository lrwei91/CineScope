function normalizeRealtimeMetricSignature(value) {
    if (!value || typeof value !== 'object') return '';
    return JSON.stringify(value);
}

function normalizeTrailerSignature(value) {
    if (!Array.isArray(value) || value.length === 0) return '';
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
        item.posterStatusLabel,
        item.posterPath,
        normalizeRealtimeMetricSignature(item.boxOffice),
        normalizeRealtimeMetricSignature(item.tvHeat),
        normalizeTrailerSignature(item.trailers)
    ].join('|');
}

export function buildRenderedItemsSignature(items) {
    return items.map(buildRenderedItemKey).join('||');
}
