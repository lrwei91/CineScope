const DEFAULT_MAOYAN_API_URL = 'https://60s.viki.moe/v2/maoyan/realtime/movie';

export function normalizeBoxOfficeTitle(value) {
    return String(value || '')
        .toLowerCase()
        .replace(/[\u0000-\u001f\u007f-\u009f\u200b\u200c\u200d\ufeff]/g, '')
        .replace(/[\s:：·•'"’“”.,，、!！?？\-—–_()（）\[\]【】《》]/g, '')
        .trim();
}

export function normalizeBoxOfficeRows(rows, updatedAt = new Date().toISOString()) {
    if (!Array.isArray(rows)) {
        return [];
    }

    return rows
        .map((row, index) => {
            const movieName = String(row?.movieName || row?.movie_name || '').trim();
            const titleKey = normalizeBoxOfficeTitle(movieName);
            if (!movieName || !titleKey) {
                return null;
            }

            return {
                source: 'maoyan',
                updated_at: updatedAt,
                rank: normalizePositiveInteger(row.top ?? row.rank ?? index + 1),
                maoyan_movie_id: normalizePositiveInteger(row.movieId ?? row.movie_id),
                movie_name: movieName,
                release_info: stringifyValue(row.releaseInfo ?? row.release_info ?? row.releaseDay),
                real_time_box_office: stringifyValue(row.box_office_desc),
                cumulative_box_office: stringifyValue(row.sumBoxDesc ?? row.sum_box_desc),
                split_cumulative_box_office: stringifyValue(row.sumSplitBoxDesc ?? row.sum_split_box_desc),
                box_office_rate: stringifyValue(row.boxRate ?? row.box_office_rate),
                split_box_office_rate: stringifyValue(row.splitBoxRate ?? row.split_box_office_rate),
                show_count: normalizePositiveInteger(row.showCount ?? row.show_count),
                show_count_rate: stringifyValue(row.showCountRate ?? row.show_count_rate),
                seat_occupancy: stringifyValue(row.avgSeatView ?? row.avg_seat_view),
                avg_show_view: stringifyValue(row.avgShowView ?? row.avg_show_view),
                title_key: titleKey
            };
        })
        .filter(Boolean);
}

export function mergeBoxOfficeIntoMovies(movies, boxOfficeRows) {
    if (!Array.isArray(movies) || !Array.isArray(boxOfficeRows) || boxOfficeRows.length === 0) {
        return Array.isArray(movies) ? movies : [];
    }

    const rowByTitleKey = new Map();
    boxOfficeRows.forEach((row) => {
        const titleKey = row?.title_key || normalizeBoxOfficeTitle(row?.movie_name);
        if (titleKey && !rowByTitleKey.has(titleKey)) {
            rowByTitleKey.set(titleKey, row);
        }
    });

    return movies.map((movie) => {
        const row = findBoxOfficeRow(movie, rowByTitleKey);
        if (!row) {
            return movie;
        }

        const { title_key, ...boxOffice } = row;
        return {
            ...movie,
            box_office: boxOffice
        };
    });
}

export function createBoxOfficePayload(rows, options = {}) {
    const {
        updatedAt = new Date().toISOString(),
        sourceUrl = DEFAULT_MAOYAN_API_URL,
        status = 'ok',
        message = '',
        market = null
    } = options;
    const normalizedRows = normalizeBoxOfficeRows(rows, updatedAt);

    return {
        metadata: {
            last_updated: updatedAt,
            source: 'maoyan',
            source_url: sourceUrl,
            status,
            message,
            market,
            total_items: normalizedRows.length
        },
        movies: normalizedRows.map(({ title_key, ...row }) => row)
    };
}

export async function fetchMaoyanBoxOfficePayload({ apiUrl = DEFAULT_MAOYAN_API_URL, fetchImpl = fetch } = {}) {
    const response = await fetchImpl(apiUrl, {
        headers: {
            Accept: 'application/json',
            'User-Agent':
                'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'
        }
    });
    if (!response.ok) {
        throw new Error(`Maoyan box office request failed (${response.status})`);
    }

    const payload = await response.json();
    const data = payload?.data;
    const rows = Array.isArray(data?.list) ? data.list : Array.isArray(payload?.data) ? payload.data : [];
    if (Number(payload?.code) !== 200 || !Array.isArray(rows)) {
        throw new Error(payload?.message || 'Maoyan box office response is invalid.');
    }

    const updatedAt = data?.updated_at ? new Date(data.updated_at).toISOString() : new Date().toISOString();
    const market = data
        ? {
              title: data.title || '',
              show_count_desc: data.show_count_desc || '',
              view_count_desc: data.view_count_desc || '',
              box_office: data.box_office || '',
              box_office_unit: data.box_office_unit || '',
              split_box_office: data.split_box_office || '',
              split_box_office_unit: data.split_box_office_unit || '',
              update_gap_second: data.update_gap_second || null,
              updated: data.updated || '',
              updated_at: data.updated_at || null
          }
        : null;

    return createBoxOfficePayload(rows, {
        sourceUrl: apiUrl,
        updatedAt,
        message: payload.message || '',
        market
    });
}

function findBoxOfficeRow(movie, rowByTitleKey) {
    const keys = [
        movie?.title,
        movie?.original_title,
        ...(Array.isArray(movie?.aka) ? movie.aka : [])
    ]
        .map(normalizeBoxOfficeTitle)
        .filter(Boolean);

    for (const key of keys) {
        const row = rowByTitleKey.get(key);
        if (row) {
            return row;
        }
    }

    return null;
}

function normalizePositiveInteger(value) {
    const numericValue = Number(value);
    return Number.isInteger(numericValue) && numericValue > 0 ? numericValue : null;
}

function stringifyValue(value) {
    const text = String(value ?? '').trim();
    return text || null;
}
