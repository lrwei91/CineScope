function mergeUniqueValues(...lists) {
    const seen = new Set();
    return lists
        .flat()
        .filter((value) => value !== undefined && value !== null && String(value).trim() !== '')
        .filter((value) => {
            const key =
                typeof value === 'object'
                    ? value.id !== undefined && value.id !== null
                        ? `object-id:${value.id}:${value.name || ''}`
                        : `object:${JSON.stringify(value)}`
                    : `primitive:${String(value)}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
}

function trailerKey(trailer) {
    return String(trailer?.bvid || trailer?.url || `${trailer?.title || ''}:${trailer?.publishedAt || ''}`).trim();
}

function mergeTrailers(primary = [], secondary = []) {
    const seen = new Set();
    return [...primary, ...secondary].filter((trailer) => {
        const key = trailerKey(trailer);
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function scoreItem(kind, item) {
    const doubanLink =
        kind === 'tv'
            ? item?.seasons?.[0]?.douban_link_google || item?.douban_link_google
            : item?.douban_link_google;
    const rating = kind === 'tv' ? item?.seasons?.[0]?.douban_rating || item?.douban_rating : item?.douban_rating;
    const poster = kind === 'tv' ? item?.seasons?.[0]?.poster_path || item?.poster_path : item?.poster_path;
    return (
        (doubanLink ? 100 : 0) +
        (rating ? 40 : 0) +
        (poster ? 20 : 0) +
        (String(item?.overview || item?.seasons?.[0]?.overview || '').trim() ? 10 : 0) +
        (Array.isArray(item?.trailers) ? item.trailers.length : 0)
    );
}

function mergeSeasons(primary = [], secondary = []) {
    if (!Array.isArray(primary) || primary.length === 0) return Array.isArray(secondary) ? secondary : [];
    if (!Array.isArray(secondary) || secondary.length === 0) return primary;

    const result = primary.map((season) => ({ ...season }));
    secondary.forEach((season, index) => {
        const seasonNumber = season?.season_number;
        const targetIndex = result.findIndex((candidate, candidateIndex) =>
            seasonNumber !== undefined && seasonNumber !== null
                ? candidate?.season_number === seasonNumber
                : candidateIndex === index
        );
        if (targetIndex === -1) result.push(season);
        else result[targetIndex] = { ...season, ...result[targetIndex] };
    });
    return result;
}

function mergeDuplicate(kind, left, right) {
    const [primary, secondary] = scoreItem(kind, right) > scoreItem(kind, left) ? [right, left] : [left, right];
    const secondaryTitle = kind === 'tv' ? secondary.name : secondary.title;
    const secondaryOriginalTitle = kind === 'tv' ? secondary.original_name : secondary.original_title;

    return {
        ...secondary,
        ...primary,
        aka: mergeUniqueValues(primary.aka || [], secondary.aka || [], [secondaryTitle, secondaryOriginalTitle]),
        directors: mergeUniqueValues(primary.directors || [], secondary.directors || []),
        actors: mergeUniqueValues(primary.actors || [], secondary.actors || []),
        networks: mergeUniqueValues(primary.networks || [], secondary.networks || []),
        ...(Array.isArray(primary.trailers) || Array.isArray(secondary.trailers)
            ? { trailers: mergeTrailers(primary.trailers || [], secondary.trailers || []) }
            : {}),
        ...(kind === 'tv' ? { seasons: mergeSeasons(primary.seasons, secondary.seasons) } : {})
    };
}

function normalizeCollections(item) {
    const normalized = { ...item };
    for (const field of ['aka', 'directors', 'actors', 'networks']) {
        if (Array.isArray(item?.[field])) normalized[field] = mergeUniqueValues(item[field]);
    }
    if (Array.isArray(item?.trailers)) normalized.trailers = mergeTrailers(item.trailers);
    return normalized;
}

export function dedupeCatalogByStableId(kind, items) {
    const result = [];
    const indexById = new Map();

    for (const item of Array.isArray(items) ? items : []) {
        const normalizedItem = normalizeCollections(item);
        const id = item?.id === undefined || item?.id === null ? '' : String(item.id);
        if (!id) {
            result.push(normalizedItem);
            continue;
        }

        if (!indexById.has(id)) {
            indexById.set(id, result.length);
            result.push(normalizedItem);
            continue;
        }

        const index = indexById.get(id);
        result[index] = mergeDuplicate(kind, result[index], normalizedItem);
    }

    return result;
}
