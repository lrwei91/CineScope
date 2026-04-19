/**
 * 配置常量模块
 * 包含应用的所有配置：分类、评分、类型映射、优先级等
 */

export const TMDB_IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/w300';
export const DEFAULT_TITLE = '🐟鲤鱼·环球片单';
export const DEFAULT_CATEGORY_ID = 'tv_cn';
export const ITEMS_PER_PAGE = 18;
export const FUTURE_TAG = '即将上映';
export const DOUBAN_STATUS_URL = 'json/douban_statuses.json';

export const DOUBAN_STATUS_LABELS = {
    watching: '在看',
    watched: '看过',
    wishlist: '想看'
};

export const CATEGORY_CONFIG = {
    tv_us: {
        id: 'tv_us',
        label: '美剧',
        kind: 'tv',
        latestUrl: 'json/tv_us_latest.json',
        completeUrl: 'json/tv_us_complete.json',
        showNetworkFilter: true
    },
    tv_gb: {
        id: 'tv_gb',
        label: '英剧',
        kind: 'tv',
        latestUrl: 'json/tv_gb_latest.json',
        completeUrl: 'json/tv_gb_complete.json',
        showNetworkFilter: true
    },
    tv_cn: {
        id: 'tv_cn',
        label: '国产剧',
        kind: 'tv',
        latestUrl: 'json/tv_cn_latest.json',
        completeUrl: 'json/tv_cn_complete.json',
        showNetworkFilter: true
    },
    tv_kr: {
        id: 'tv_kr',
        label: '韩剧',
        kind: 'tv',
        latestUrl: 'json/tv_kr_latest.json',
        completeUrl: 'json/tv_kr_complete.json',
        showNetworkFilter: true
    },
    tv_jp: {
        id: 'tv_jp',
        label: '日剧',
        kind: 'tv',
        latestUrl: 'json/tv_jp_latest.json',
        completeUrl: 'json/tv_jp_complete.json',
        showNetworkFilter: true
    },
    tv_jp_anime: {
        id: 'tv_jp_anime',
        label: '日漫',
        kind: 'tv',
        latestUrl: 'json/tv_jp_anime_latest.json',
        completeUrl: 'json/tv_jp_anime_complete.json',
        showNetworkFilter: true,
        allowUnratedAnimation: true
    },
    movie_cn: {
        id: 'movie_cn',
        label: '院线电影',
        kind: 'movie',
        latestUrl: 'json/movie_cn_latest.json',
        completeUrl: 'json/movie_cn_complete.json',
        showNetworkFilter: false
    }
};

export const DEFAULT_RATING_CONFIG = {
    thresholds: [
        { label: '全部', value: 0 },
        { label: '> 9 分', value: 9 },
        { label: '> 8 分', value: 8 },
        { label: '> 7 分', value: 7 }
    ],
    special: {
        label: '近 2 年高分',
        value: 'recent_high_score',
        years: 2,
        minRating: 0
    }
};

export const CATEGORY_RATING_CONFIG = {
    tv_cn: {
        thresholds: [
            { label: '全部', value: 0 },
            { label: '> 8 分', value: 8 },
            { label: '> 7 分', value: 7 },
            { label: '> 6 分', value: 6 }
        ],
        special: {
            label: '近 2 年高分',
            value: 'recent_high_score',
            years: 2,
            minRating: 7
        }
    },
    tv_kr: {
        thresholds: [
            { label: '全部', value: 0 },
            { label: '> 8 分', value: 8 },
            { label: '> 7 分', value: 7 },
            { label: '> 6 分', value: 6 }
        ],
        special: {
            label: '近 2 年高分',
            value: 'recent_high_score',
            years: 2,
            minRating: 7
        }
    },
    tv_jp: {
        thresholds: [
            { label: '全部', value: 0 },
            { label: '> 8 分', value: 8 },
            { label: '> 7 分', value: 7 },
            { label: '> 6 分', value: 6 }
        ],
        special: {
            label: '近 2 年高分',
            value: 'recent_high_score',
            years: 2,
            minRating: 7
        }
    },
    tv_jp_anime: {
        thresholds: [
            { label: '全部', value: 0 },
            { label: '> 8 分', value: 8 },
            { label: '> 7 分', value: 7 },
            { label: '> 6 分', value: 6 }
        ],
        special: {
            label: '近 2 年高分',
            value: 'recent_high_score',
            years: 2,
            minRating: 7
        }
    }
};

export const GENRE_DISPLAY_MAP = {
    Action: '动作',
    Adventure: '冒险',
    'Action & Adventure': '动作冒险',
    Animation: '动画',
    Comedy: '喜剧',
    Crime: '犯罪',
    Documentary: '纪录片',
    Drama: '剧情',
    Family: '家庭',
    Fantasy: '奇幻',
    History: '历史',
    Horror: '恐怖',
    Kids: '儿童',
    Music: '音乐',
    Mystery: '悬疑',
    Romance: '爱情',
    'Reality TV': '真人秀',
    Reality: '真人秀',
    'Sci-Fi & Fantasy': '科幻 | 奇幻',
    'Science Fiction': '科幻',
    Soap: '肥皂剧',
    Talk: '脱口秀',
    Thriller: '惊悚',
    'TV Movie': '电视电影',
    War: '战争',
    'War & Politics': '战争政治',
    Western: '西部'
};

export const HIDDEN_GENRES = new Set();

export const GENRE_PRIORITY = [
    '喜剧',
    '悬疑',
    '犯罪',
    '动作冒险',
    '动作',
    '科幻 | 奇幻',
    '科幻',
    '家庭',
    '爱情',
    '历史',
    '惊悚',
    '恐怖',
    '纪录片',
    '真人秀',
    '战争',
    '战争政治',
    '音乐',
    '儿童',
    '冒险',
    '西部',
    '脱口秀',
    '肥皂剧',
    '电视电影',
    '剧情',
    '动画'
];

export const NETWORK_PRIORITY = [
    'Netflix',
    'Apple TV',
    'Prime Video',
    'Disney',
    'Disney+',
    'Max',
    'HBO',
    'Hulu',
    'Paramount',
    'BBC',
    'BBC One',
    'BBC Two',
    'Sky',
    'ITV',
    'Channel 4',
    '腾讯视频',
    '爱奇艺',
    '优酷',
    '芒果 TV',
    '哔哩哔哩',
    'CCTV',
    '湖南卫视',
    '东方卫视',
    '江苏卫视',
    '浙江卫视'
];

export function createCategoryState() {
    return Object.fromEntries(
        Object.keys(CATEGORY_CONFIG).map((categoryId) => [
            categoryId,
            {
                items: [],
                updateDate: '',
                latestLoaded: false,
                completeLoaded: false,
                latestPromise: null,
                completePromise: null
            }
        ])
    );
}
