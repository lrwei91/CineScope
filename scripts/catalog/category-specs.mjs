import {
    DEFAULT_BILIBILI_TV_TRAILER_CACHE_PATH,
    DEFAULT_BILIBILI_TV_TRAILER_OVERRIDES_PATH,
    DEFAULT_BILIBILI_TV_TRAILER_SEARCH_SUFFIX,
    DEFAULT_BILIBILI_TV_TRAILER_UP_MID
} from '../lib/bilibili-trailers.mjs';

function hasRegion(item, region) {
    const subtitle = item?.card_subtitle || item?.info || '';
    return subtitle.includes(region);
}

export function createCategorySpecs({ endOfCurrentYear, minDate = '2025-01-01' }) {
    const createTvSpec = ({ id, doubanSlug, region, country, extraTmdbParams = {} }) => ({
        id,
        kind: 'tv',
        latestCount: 18,
        latestSelectionMode: 'current_quarter_all',
        minDate,
        latestPath: `json/${id}_latest.json`,
        completePath: `json/${id}_complete.json`,
        doubanSources: [{ slug: doubanSlug, includeItem: (item) => hasRegion(item, region) }],
        tmdb: {
            discoverPath: '/discover/tv',
            detailPath: '/tv',
            params: {
                language: 'zh-CN',
                sort_by: 'first_air_date.desc',
                'first_air_date.gte': minDate,
                'first_air_date.lte': endOfCurrentYear,
                with_origin_country: country,
                include_null_first_air_dates: 'false',
                'vote_count.gte': '5',
                ...extraTmdbParams
            }
        }
    });

    const tvCn = createTvSpec({
        id: 'tv_cn',
        doubanSlug: 'tv_domestic',
        region: '中国大陆',
        country: 'CN',
        extraTmdbParams: { with_original_language: 'zh' }
    });
    tvCn.doubanSources.push({ slug: 'tv_hot', includeItem: (item) => hasRegion(item, '中国大陆') });
    tvCn.trailerSource = {
        mid: DEFAULT_BILIBILI_TV_TRAILER_UP_MID,
        cacheRelativePath: DEFAULT_BILIBILI_TV_TRAILER_CACHE_PATH,
        overridesRelativePath: DEFAULT_BILIBILI_TV_TRAILER_OVERRIDES_PATH,
        searchSuffix: DEFAULT_BILIBILI_TV_TRAILER_SEARCH_SUFFIX,
        sourceSlug: `bilibili_up_${DEFAULT_BILIBILI_TV_TRAILER_UP_MID}`,
        searchFromCatalog: true,
        searchFromCatalogCacheRelativePath: '.cache/bilibili/tv-cn-search-from-catalog.json'
    };

    const movieCn = {
        id: 'movie_cn',
        kind: 'movie',
        latestCount: 24,
        minDate,
        latestPath: 'json/movie_cn_latest.json',
        completePath: 'json/movie_cn_complete.json',
        doubanSources: [
            { slug: 'movie_showing' },
            { slug: 'movie_soon' },
            { slug: 'movie_latest', totalLimit: 200 }
        ],
        trailerSource: {
            mid: '8465957',
            cacheRelativePath: '.cache/bilibili/up-8465957-videos.json',
            overridesRelativePath: 'scripts/data/movie_cn_trailer_overrides.json',
            searchSuffix: '乌鸦预告片',
            sourceSlug: 'bilibili_up_8465957'
        },
        tmdb: {
            discoverPath: '/discover/movie',
            detailPath: '/movie',
            params: {
                language: 'zh-CN',
                sort_by: 'primary_release_date.desc',
                'release_date.gte': minDate,
                'release_date.lte': endOfCurrentYear,
                region: 'CN',
                with_release_type: '2|3',
                include_adult: 'false',
                include_video: 'false',
                'vote_count.gte': '5'
            }
        }
    };

    const varietyCn = createTvSpec({
        id: 'tv_cn_variety',
        doubanSlug: 'tv_variety_show',
        region: '中国大陆',
        country: 'CN',
        extraTmdbParams: {
            with_original_language: 'zh',
            with_genres: '10764|10767'
        }
    });

    return [
        tvCn,
        createTvSpec({ id: 'tv_kr', doubanSlug: 'tv_korean', region: '韩国', country: 'KR' }),
        createTvSpec({ id: 'tv_jp', doubanSlug: 'tv_japanese', region: '日本', country: 'JP' }),
        movieCn,
        varietyCn,
        createTvSpec({ id: 'tv_us', doubanSlug: 'tv_american', region: '美国', country: 'US' })
    ];
}
