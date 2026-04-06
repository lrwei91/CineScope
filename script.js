document.addEventListener('DOMContentLoaded', () => {
    const TMDB_IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/w300';
    const DEFAULT_TITLE = '🐟鲤鱼·环球片单';
    const DEFAULT_CATEGORY_ID = 'tv_cn';
    const ITEMS_PER_PAGE = 18;
    const FUTURE_TAG = '即将上映';

    const CATEGORY_CONFIG = {
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
        movie_cn: {
            id: 'movie_cn',
            label: '院线电影',
            kind: 'movie',
            latestUrl: 'json/movie_cn_latest.json',
            completeUrl: 'json/movie_cn_complete.json',
            showNetworkFilter: false
        }
    };

    const DEFAULT_RATING_CONFIG = {
        thresholds: [
            { label: '全部', value: 0 },
            { label: '> 9分', value: 9 },
            { label: '> 8分', value: 8 },
            { label: '> 7分', value: 7 }
        ],
        special: {
            label: '近2年高分',
            value: 'recent_high_score',
            years: 2,
            minRating: 0
        }
    };

    const CATEGORY_RATING_CONFIG = {
        tv_cn: {
            thresholds: [
                { label: '全部', value: 0 },
                { label: '> 8分', value: 8 },
                { label: '> 7分', value: 7 },
                { label: '> 6分', value: 6 }
            ],
            special: {
                label: '近2年高分',
                value: 'recent_high_score',
                years: 2,
                minRating: 7
            }
        },
        tv_kr: {
            thresholds: [
                { label: '全部', value: 0 },
                { label: '> 8分', value: 8 },
                { label: '> 7分', value: 7 },
                { label: '> 6分', value: 6 }
            ],
            special: {
                label: '近2年高分',
                value: 'recent_high_score',
                years: 2,
                minRating: 7
            }
        },
        tv_jp: {
            thresholds: [
                { label: '全部', value: 0 },
                { label: '> 8分', value: 8 },
                { label: '> 7分', value: 7 },
                { label: '> 6分', value: 6 }
            ],
            special: {
                label: '近2年高分',
                value: 'recent_high_score',
                years: 2,
                minRating: 7
            }
        }
    };

    const GENRE_DISPLAY_MAP = {
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
        'Sci-Fi & Fantasy': '科幻|奇幻',
        'Science Fiction': '科幻',
        Soap: '肥皂剧',
        Talk: '脱口秀',
        Thriller: '惊悚',
        'TV Movie': '电视电影',
        War: '战争',
        'War & Politics': '战争政治',
        Western: '西部'
    };

    const GENRE_PRIORITY = [
        '剧情',
        '喜剧',
        '悬疑',
        '犯罪',
        '动作冒险',
        '动作',
        '科幻|奇幻',
        '科幻',
        '动画',
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
        '电视电影'
    ];

    const NETWORK_PRIORITY = [
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
        '芒果TV',
        '哔哩哔哩',
        'CCTV',
        '湖南卫视',
        '东方卫视',
        '江苏卫视',
        '浙江卫视'
    ];

    const categoryState = Object.fromEntries(
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

    function buildTmdbSearchUrl(title, date) {
        const year = date ? String(date).slice(0, 4) : '';
        const query = encodeURIComponent(`${title} ${year}`.trim());
        return `https://www.themoviedb.org/search?query=${query}`;
    }

    let allItems = [];
    let filteredPastAndPresentItems = [];
    let currentCategoryId = DEFAULT_CATEGORY_ID;
    let specialFilterMode = null;
    let selectedGenres = [];
    let selectedNetworks = [];
    let selectedRating = '全部';

    let currentPage = 1;
    let isLoading = false;
    let lastRenderedMonth = null;
    let allAvailableYears = [];
    let currentActiveYear = null;
    let visibleYearCount = 3;
    let isScrollingProgrammatically = false;
    let genreFiltersExpanded = false;
    let networkFiltersExpanded = false;

    const pageTitleText = document.getElementById('page-title-text');
    const mainTitle = document.querySelector('h1');
    const categoryFilterContainer = document.getElementById('category-filter-container');
    const ratingFilterContainer = document.getElementById('rating-filter-container');
    const genreFilterContainer = document.getElementById('genre-filter-container');
    const genreFilterToggle = document.getElementById('genre-filter-toggle');
    const networkFilterContainer = document.getElementById('network-filter-container');
    const networkFilterToggle = document.getElementById('network-filter-toggle');
    const loadingOverlay = document.getElementById('loading-overlay');
    const comingSoonContainer = document.getElementById('coming-soon-container');
    const interactiveTimeline = document.getElementById('interactive-timeline');
    const yearList = document.getElementById('year-list');
    const statusMessage = document.getElementById('status-message');
    const fileInput = document.getElementById('file-input');
    const resultsContainer = document.getElementById('results-container');
    const noResultsMessage = document.getElementById('no-results');
    const loader = document.getElementById('loader');
    const skeletonContainer = document.getElementById('skeleton-container');

    document.title = DEFAULT_TITLE;
    if (pageTitleText) {
        pageTitleText.textContent = DEFAULT_TITLE;
    }
    setCurrentCategory(DEFAULT_CATEGORY_ID);

    function getCurrentCategoryConfig() {
        return CATEGORY_CONFIG[currentCategoryId];
    }

    function getCurrentCategoryState() {
        return categoryState[currentCategoryId];
    }

    async function initialize() {
        populateRatingFilters();
        populateGenreFilters([]);
        showSkeletonLoader();

        try {
            await ensureCategoryLoaded(DEFAULT_CATEGORY_ID);
        } catch (error) {
            statusMessage.textContent = '加载数据失败或文件格式无效。';
            statusMessage.style.color = '#F44336';
            console.error('Initialize failed:', error);
            if (skeletonContainer) {
                skeletonContainer.style.display = 'none';
            }
            comingSoonContainer.style.display = 'none';
        }
    }

    function resetFilterState() {
        specialFilterMode = null;
        selectedRating = '全部';
        selectedGenres = [];
        selectedNetworks = [];
        genreFiltersExpanded = false;
        networkFiltersExpanded = false;
    }

    function getCurrentRatingConfig() {
        return CATEGORY_RATING_CONFIG[currentCategoryId] || DEFAULT_RATING_CONFIG;
    }

    function setCurrentCategory(categoryId) {
        if (!CATEGORY_CONFIG[categoryId]) {
            return;
        }

        currentCategoryId = categoryId;
        categoryFilterContainer.querySelectorAll('.genre-tag').forEach((tag) => {
            tag.classList.toggle('active', tag.dataset.category === categoryId);
        });
    }

    async function switchCategory(categoryId) {
        if (categoryId === currentCategoryId || !CATEGORY_CONFIG[categoryId]) {
            return;
        }

        setCurrentCategory(categoryId);
        resetFilterState();
        populateRatingFilters();

        const state = categoryState[categoryId];
        if (state.latestLoaded || state.completeLoaded) {
            syncCurrentCategoryData();
            if (!state.completeLoaded) {
                loadCategoryData(categoryId, 'complete');
            }
            return;
        }

        populateGenreFilters([]);
        showSkeletonLoader();
        await ensureCategoryLoaded(categoryId);
    }

    async function ensureCategoryLoaded(categoryId) {
        const state = categoryState[categoryId];

        if (state.completeLoaded || state.latestLoaded) {
            if (categoryId === currentCategoryId) {
                syncCurrentCategoryData();
            }
            if (!state.completeLoaded) {
                loadCategoryData(categoryId, 'complete');
            }
            return;
        }

        const latestLoaded = await loadCategoryData(categoryId, 'latest');
        if (!latestLoaded) {
            await loadCategoryData(categoryId, 'complete');
            return;
        }

        loadCategoryData(categoryId, 'complete');
    }

    async function loadCategoryData(categoryId, level) {
        const config = CATEGORY_CONFIG[categoryId];
        const state = categoryState[categoryId];
        const promiseKey = level === 'latest' ? 'latestPromise' : 'completePromise';
        const loadedKey = level === 'latest' ? 'latestLoaded' : 'completeLoaded';
        const url = level === 'latest' ? config.latestUrl : config.completeUrl;

        if (state[loadedKey]) {
            return true;
        }

        if (state[promiseKey]) {
            return state[promiseKey];
        }

        state[promiseKey] = (async () => {
            try {
                const response = await fetch(url);
                if (!response.ok) {
                    if (level === 'latest') {
                        console.warn(`Could not load ${url}, will fall back to complete data.`);
                        return false;
                    }
                    throw new Error(`Could not load ${url}`);
                }

                const data = await response.json();
                ingestCategoryData(categoryId, data, level);

                if (level === 'complete' && categoryId === currentCategoryId) {
                    showToast('已加载全部内容');
                }

                return true;
            } catch (error) {
                console.error(`Failed to load ${level} data for ${categoryId}:`, error);
                if (level === 'complete' && categoryId === currentCategoryId && !state.latestLoaded) {
                    statusMessage.textContent = '加载数据失败或文件格式无效。';
                    statusMessage.style.color = '#F44336';
                    comingSoonContainer.style.display = 'none';
                    if (skeletonContainer) {
                        skeletonContainer.style.display = 'none';
                    }
                }
                return false;
            } finally {
                state[promiseKey] = null;
            }
        })();

        return state[promiseKey];
    }

    function ingestCategoryData(categoryId, data, level) {
        const config = CATEGORY_CONFIG[categoryId];
        const state = categoryState[categoryId];

        if (level === 'latest' && state.completeLoaded) {
            return;
        }

        const normalizedItems = normalizePayload(data, config);
        state.items = normalizedItems;
        state.updateDate = data.metadata && data.metadata.last_updated ? data.metadata.last_updated : '';
        state.latestLoaded = state.latestLoaded || level === 'latest';
        state.completeLoaded = state.completeLoaded || level === 'complete';

        if (categoryId === currentCategoryId) {
            syncCurrentCategoryData();
        }
    }

    function normalizePayload(data, config) {
        if (!data || typeof data !== 'object') {
            throw new Error('Data payload is not a valid object.');
        }

        if (config.kind === 'tv') {
            if (!Array.isArray(data.shows)) {
                throw new Error('TV payload must contain a "shows" array.');
            }
            return dedupeCatalogItems('tv', normalizeTvItems(data.shows));
        }

        if (!Array.isArray(data.movies)) {
            throw new Error('Movie payload must contain a "movies" array.');
        }

        return dedupeCatalogItems('movie', normalizeMovieItems(data.movies));
    }

    function normalizeTvItems(shows) {
        const normalizedItems = [];

        shows.forEach((show) => {
            const seasons = Array.isArray(show.seasons) ? show.seasons : [];
            const title = buildLocalizedTitle(show.name, show.original_name);
            const genres = normalizeNameList(show.genres);
            const networks = normalizeNameList(show.networks);
            // tmdb_id 字段存在且为数字时表示数据来自 TMDB
            const tmdbId = typeof show.tmdb_id === 'number' ? show.tmdb_id : null;

            seasons.forEach((season) => {
                if (!season.air_date) {
                    return;
                }

                normalizedItems.push({
                    kind: 'tv',
                    id: season.id || `${show.id}-${season.season_number}-${season.air_date}`,
                    date: season.air_date,
                    title,
                    subtitle: season.name || '',
                    posterPath: season.poster_path || show.poster_path || null,
                    genres,
                    networks,
                    doubanRating: season.douban_rating || null,
                    doubanLink: season.douban_link_google || null,
                    doubanVerified: Boolean(season.douban_link_verified),
                    tmdbUrl: tmdbId ? `https://www.themoviedb.org/tv/${tmdbId}` : null,
                    tmdbSearchUrl: buildTmdbSearchUrl(title, season.air_date),
                    imdbUrl: show.imdb_id ? `https://www.imdb.com/title/${show.imdb_id}/` : null
                });
            });
        });

        return normalizedItems;
    }

    function normalizeMovieItems(movies) {
        return movies.reduce((normalizedItems, movie) => {
            const releaseDate = movie.release_date || movie.air_date || movie.first_air_date;
            if (!releaseDate) {
                return normalizedItems;
            }

            const primaryTitle =
                movie.title ||
                movie.name ||
                movie.original_title ||
                movie.original_name ||
                '未命名';
            const originalTitle = movie.original_title || movie.original_name || primaryTitle;
            // tmdb_id 字段存在且为数字时表示数据来自 TMDB
            const tmdbId = typeof movie.tmdb_id === 'number' ? movie.tmdb_id : null;

            normalizedItems.push({
                kind: 'movie',
                id: movie.id || `${primaryTitle}-${releaseDate}`,
                date: releaseDate,
                title: primaryTitle,
                subtitle: primaryTitle !== originalTitle ? originalTitle : '',
                posterPath: movie.poster_path || null,
                genres: normalizeNameList(movie.genres),
                networks: [],
                doubanRating: movie.douban_rating || null,
                doubanLink: movie.douban_link_google || null,
                doubanVerified: Boolean(movie.douban_link_verified),
                tmdbUrl: tmdbId ? `https://www.themoviedb.org/movie/${tmdbId}` : null,
                tmdbSearchUrl: buildTmdbSearchUrl(primaryTitle, releaseDate),
                imdbUrl: movie.imdb_id ? `https://www.imdb.com/title/${movie.imdb_id}/` : null
            });

            return normalizedItems;
        }, []);
    }

    function dedupeCatalogItems(kind, items) {
        const dedupedItems = [];
        const itemIndexByKey = new Map();

        items.forEach((item) => {
            const dedupeKey = createCatalogDedupeKey(kind, item);
            const existingIndex = itemIndexByKey.get(dedupeKey);

            if (existingIndex === undefined) {
                itemIndexByKey.set(dedupeKey, dedupedItems.length);
                dedupedItems.push(item);
                return;
            }

            dedupedItems[existingIndex] = mergeCatalogItems(dedupedItems[existingIndex], item);
        });

        return dedupedItems;
    }

    function createCatalogDedupeKey(kind, item) {
        const normalizedTitle = normalizeCatalogText(item.title || item.name || '');
        const normalizedSubtitle = normalizeCatalogText(item.subtitle || '');
        const date = item.date || '';

        if (kind === 'movie') {
            return `movie::${normalizedTitle}::${date.slice(0, 7)}`;
        }

        return `tv::${normalizedTitle}::${normalizedSubtitle}::${date}`;
    }

    function normalizeCatalogText(value) {
        return String(value || '')
            .toLowerCase()
            .replace(/[\s:：·•'".,，、!！?？\-—_()（）\[\]【】]/g, '')
            .trim();
    }

    function mergeCatalogItems(leftItem, rightItem) {
        const preferredItem = scoreCatalogItem(rightItem) > scoreCatalogItem(leftItem) ? rightItem : leftItem;
        const secondaryItem = preferredItem === rightItem ? leftItem : rightItem;

        return {
            ...secondaryItem,
            ...preferredItem,
            title: preferredItem.title || secondaryItem.title,
            subtitle: preferredItem.subtitle || secondaryItem.subtitle,
            posterPath: preferredItem.posterPath || secondaryItem.posterPath,
            doubanRating: preferredItem.doubanRating || secondaryItem.doubanRating,
            doubanLink: preferredItem.doubanLink || secondaryItem.doubanLink,
            doubanVerified: preferredItem.doubanVerified || secondaryItem.doubanVerified,
            tmdbUrl: preferredItem.tmdbUrl || secondaryItem.tmdbUrl,
            imdbUrl: preferredItem.imdbUrl || secondaryItem.imdbUrl,
            genres: mergeUniqueStrings(preferredItem.genres, secondaryItem.genres),
            networks: mergeUniqueStrings(preferredItem.networks, secondaryItem.networks)
        };
    }

    function scoreCatalogItem(item) {
        let score = 0;

        if (item.doubanVerified) score += 4;
        if (item.doubanRating) score += 3;
        if (item.doubanLink) score += 2;
        if (item.tmdbUrl) score += 1;
        if (item.imdbUrl) score += 1;
        if (item.posterPath) score += 1;
        if (item.subtitle) score += 1;
        score += (item.genres || []).length * 0.1;
        score += (item.networks || []).length * 0.1;

        return score;
    }

    function mergeUniqueStrings(primaryList = [], secondaryList = []) {
        return [...new Set([...(primaryList || []), ...(secondaryList || [])].filter(Boolean))];
    }

    function normalizeNameList(list) {
        if (!Array.isArray(list)) {
            return [];
        }

        return list
            .map((item) => {
                if (typeof item === 'string') {
                    return item.trim();
                }
                if (item && typeof item.name === 'string') {
                    return item.name.trim();
                }
                return '';
            })
            .filter(Boolean);
    }

    function buildLocalizedTitle(name, originalName) {
        if (!name && !originalName) {
            return '未命名';
        }

        if (!name) {
            return originalName;
        }

        if (!originalName || name === originalName) {
            return name;
        }

        return `${name} (${originalName})`;
    }

    function syncCurrentCategoryData() {
        const state = getCurrentCategoryState();
        allItems = [...state.items];

        updateSubtitleText();
        populateGenreFilters(allItems);
        filterAndRenderItems();
    }

    function updateSubtitleText() {
        const updateDateElement = mainTitle.querySelector('.update-date');
        if (!updateDateElement) {
            return;
        }

        const updateDate = getCurrentCategoryState().updateDate;
        if (updateDate) {
            updateDateElement.textContent = `数据更新于：${updateDate.substring(0, 10)}`;
            updateDateElement.classList.remove('skeleton');
        } else {
            updateDateElement.textContent = '';
            updateDateElement.classList.add('skeleton');
        }
    }

    function populateRatingFilters() {
        ratingFilterContainer.innerHTML = '';
        const ratingConfig = getCurrentRatingConfig();
        const ratingOptions = [...ratingConfig.thresholds, ratingConfig.special];

        ratingOptions.forEach(({ label, value }) => {
            const tag = document.createElement('div');
            tag.className = 'genre-tag';
            tag.textContent = label;
            tag.dataset.rating = value;

            if (specialFilterMode === 'recent_high_score' && value === 'recent_high_score') {
                tag.classList.add('active');
            } else if (!specialFilterMode && label === selectedRating) {
                tag.classList.add('active');
            }

            tag.addEventListener('click', () => {
                if (tag.classList.contains('active')) {
                    return;
                }

                if (value === 'recent_high_score') {
                    specialFilterMode = 'recent_high_score';
                } else {
                    specialFilterMode = null;
                    selectedRating = label;
                }

                populateRatingFilters();
                filterAndRenderItems();
            });

            ratingFilterContainer.appendChild(tag);
        });
    }

    function populateGenreFilters(items) {
        const availableGenres = getSortedGenres(items);
        selectedGenres = selectedGenres.filter((genre) => availableGenres.includes(genre));

        genreFilterContainer.innerHTML = '';

        const allTag = createGenreTag('全部', '全部');
        if (selectedGenres.length === 0) {
            allTag.classList.add('active');
        }
        genreFilterContainer.appendChild(allTag);

        availableGenres.forEach((genreName) => {
            const tag = createGenreTag(getGenreDisplayName(genreName), genreName);
            if (selectedGenres.includes(genreName)) {
                tag.classList.add('active', 'multiselect-tick');
            }
            genreFilterContainer.appendChild(tag);
        });

        requestAnimationFrame(updateGenreFilterCollapse);
    }

    function createGenreTag(displayName, actualValue) {
        const tag = document.createElement('div');
        tag.className = 'genre-tag';
        tag.textContent = displayName;
        tag.dataset.genre = actualValue;

        tag.addEventListener('click', () => {
            const isActive = tag.classList.contains('active');

            if (actualValue === '全部') {
                if (isActive) {
                    return;
                }
                selectedGenres = [];
            } else if (isActive) {
                selectedGenres = selectedGenres.filter((genre) => genre !== actualValue);
            } else {
                selectedGenres.push(actualValue);
            }

            populateGenreFilters(allItems);
            filterAndRenderItems();

            if (window.innerWidth <= 900) {
                tag.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
            }
        });

        return tag;
    }

    function populateNetworkFilters(items) {
        if (!networkFilterContainer) {
            selectedNetworks = [];
            return;
        }

        const config = getCurrentCategoryConfig();
        const networkFilterSection = networkFilterContainer.closest('.filter-block-network');

        selectedNetworks = config.showNetworkFilter ? selectedNetworks : [];
        networkFilterContainer.innerHTML = '';

        if (!config.showNetworkFilter) {
            if (networkFilterSection) {
                networkFilterSection.style.display = 'none';
            }
            networkFilterContainer.style.display = 'none';
            if (networkFilterToggle) {
                networkFilterToggle.hidden = true;
            }
            return;
        }

        if (networkFilterSection) {
            networkFilterSection.style.display = '';
        }
        networkFilterContainer.style.display = '';

        const availableNetworks = getSortedNetworks(items);
        selectedNetworks = selectedNetworks.filter((network) => availableNetworks.includes(network));

        const allTag = createNetworkTag('全部');
        if (selectedNetworks.length === 0) {
            allTag.classList.add('active');
        }
        networkFilterContainer.appendChild(allTag);

        availableNetworks.forEach((networkName) => {
            const tag = createNetworkTag(networkName);
            if (selectedNetworks.includes(networkName)) {
                tag.classList.add('active', 'multiselect-tick');
            }
            networkFilterContainer.appendChild(tag);
        });

        requestAnimationFrame(updateNetworkFilterCollapse);
    }

    function createNetworkTag(networkName) {
        const tag = document.createElement('div');
        tag.className = 'genre-tag';
        tag.textContent = networkName;
        tag.dataset.network = networkName;

        tag.addEventListener('click', () => {
            const isActive = tag.classList.contains('active');

            if (networkName === '全部') {
                if (isActive) {
                    return;
                }
                selectedNetworks = [];
            } else if (isActive) {
                selectedNetworks = selectedNetworks.filter((network) => network !== networkName);
            } else {
                selectedNetworks.push(networkName);
            }

            populateNetworkFilters(allItems);
            filterAndRenderItems();

            if (window.innerWidth <= 900) {
                tag.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
            }
        });

        return tag;
    }

    function getSortedGenres(items) {
        const uniqueGenres = [...new Set(items.flatMap((item) => item.genres))];

        return uniqueGenres.sort((left, right) => {
            const leftPriority = GENRE_PRIORITY.indexOf(getGenreDisplayName(left));
            const rightPriority = GENRE_PRIORITY.indexOf(getGenreDisplayName(right));

            if (leftPriority !== -1 || rightPriority !== -1) {
                if (leftPriority === -1) {
                    return 1;
                }
                if (rightPriority === -1) {
                    return -1;
                }
                return leftPriority - rightPriority;
            }

            return getGenreDisplayName(left).localeCompare(getGenreDisplayName(right), 'zh-CN');
        });
    }

    function getSortedNetworks(items) {
        const uniqueNetworks = [...new Set(items.flatMap((item) => item.networks))];

        return uniqueNetworks.sort((left, right) => {
            const leftPriority = NETWORK_PRIORITY.findIndex((name) => name.toLowerCase() === left.toLowerCase());
            const rightPriority = NETWORK_PRIORITY.findIndex((name) => name.toLowerCase() === right.toLowerCase());

            if (leftPriority !== -1 || rightPriority !== -1) {
                if (leftPriority === -1) {
                    return 1;
                }
                if (rightPriority === -1) {
                    return -1;
                }
                return leftPriority - rightPriority;
            }

            return left.localeCompare(right, 'zh-CN');
        });
    }

    function getGenreDisplayName(genreName) {
        return GENRE_DISPLAY_MAP[genreName] || genreName;
    }

    function applyFilters() {
        let sourceItems = [...allItems];

        if (specialFilterMode === 'recent_high_score') {
            const specialConfig = getCurrentRatingConfig().special;
            const sinceDate = new Date();
            sinceDate.setFullYear(sinceDate.getFullYear() - specialConfig.years);

            sourceItems = sourceItems.filter((item) => {
                const itemDate = new Date(item.date);
                const rating = parseFloat(item.doubanRating) || 0;
                return itemDate >= sinceDate && rating >= specialConfig.minRating;
            });
        }

        const ratingThresholdMap = Object.fromEntries(
            getCurrentRatingConfig().thresholds.map(({ label, value }) => [label, value])
        );

        const ratingFiltered =
            selectedRating === '全部' || specialFilterMode === 'recent_high_score'
                ? sourceItems
                : sourceItems.filter((item) => {
                      const rating = parseFloat(item.doubanRating) || 0;
                      return rating >= (ratingThresholdMap[selectedRating] || 0);
                  });

        const genreFiltered =
            selectedGenres.length === 0
                ? ratingFiltered
                : ratingFiltered.filter((item) =>
                      item.genres.some((genre) => selectedGenres.includes(genre))
                  );

        const filteredNoRatingAnime = genreFiltered.filter((item) => {
            const isAnimation = item.genres.includes('动画');
            const hasRating = item.doubanRating && Number(item.doubanRating) > 0;
            return !(isAnimation && !hasRating);
        });

        const networkFiltered =
            selectedNetworks.length === 0
                ? filteredNoRatingAnime
                : filteredNoRatingAnime.filter((item) =>
                      item.networks.some((network) =>
                          selectedNetworks.some(
                              (selectedNetwork) => selectedNetwork.toLowerCase() === network.toLowerCase()
                          )
                      )
                  );

        const now = new Date();
        now.setHours(0, 0, 0, 0);

        const futureItems =
            specialFilterMode === 'recent_high_score'
                ? []
                : networkFiltered
                      .filter((item) => new Date(item.date) > now)
                      .sort((left, right) => new Date(left.date) - new Date(right.date));

        const pastAndPresentItems =
            specialFilterMode === 'recent_high_score'
                ? networkFiltered
                : networkFiltered.filter((item) => new Date(item.date) <= now);

        const sortedItems = pastAndPresentItems.sort((left, right) => {
            if (specialFilterMode === 'recent_high_score') {
                const leftRating = parseFloat(left.doubanRating) || 0;
                const rightRating = parseFloat(right.doubanRating) || 0;
                if (leftRating !== rightRating) {
                    return rightRating - leftRating;
                }
                return right.date.localeCompare(left.date);
            }

            const leftMonth = left.date.substring(0, 7);
            const rightMonth = right.date.substring(0, 7);
            if (leftMonth !== rightMonth) {
                return rightMonth.localeCompare(leftMonth);
            }

            const leftRating = parseFloat(left.doubanRating) || 0;
            const rightRating = parseFloat(right.doubanRating) || 0;
            if (leftRating !== rightRating) {
                return rightRating - leftRating;
            }

            return right.date.localeCompare(left.date);
        });

        return {
            futureItems,
            filteredPastAndPresentItems: sortedItems
        };
    }

    function filterAndRenderItems() {
        const { futureItems, filteredPastAndPresentItems: filteredItems } = applyFilters();
        filteredPastAndPresentItems = filteredItems;

        comingSoonContainer.style.display = 'none';
        renderComingSoon(futureItems);
        startRendering();
    }

    function showSkeletonLoader() {
        resultsContainer.innerHTML = '';
        noResultsMessage.style.display = 'none';

        comingSoonContainer.innerHTML = `
            <h2 class="month-group-header skeleton">即将上映</h2>
            <div class="scroller-wrapper">
                <div class="scroller-container">
                    <div class="horizontal-scroller">
                        <div class="show-card skeleton"></div>
                        <div class="show-card skeleton"></div>
                        <div class="show-card skeleton"></div>
                        <div class="show-card skeleton"></div>
                        <div class="show-card skeleton"></div>
                        <div class="show-card skeleton"></div>
                    </div>
                </div>
            </div>
        `;
        comingSoonContainer.style.display = 'block';

        if (skeletonContainer) {
            skeletonContainer.style.display = 'block';
            resultsContainer.appendChild(skeletonContainer);
        }

        loader.style.display = 'none';
        updateGenreFilterCollapse();
        updateNetworkFilterCollapse();
    }

    function renderComingSoon(futureItems) {
        comingSoonContainer.innerHTML = '';
        if (futureItems.length === 0) {
            comingSoonContainer.style.display = 'none';
            return;
        }

        const cardsHTML = futureItems.map((item) => createCatalogCard(item).outerHTML).join('');

        comingSoonContainer.innerHTML = `<h2 class="month-group-header">即将上映</h2><div class="scroller-wrapper"><button class="scroller-arrow left" aria-label="Scroll left">‹</button><div class="scroller-container"><div class="horizontal-scroller">${cardsHTML}</div></div><button class="scroller-arrow right" aria-label="Scroll right">›</button></div>`;
        comingSoonContainer.style.display = 'block';
        setupHorizontalScroller(comingSoonContainer);
    }

    function setupHorizontalScroller(container) {
        const scroller = container.querySelector('.scroller-container');
        const arrowLeft = container.querySelector('.scroller-arrow.left');
        const arrowRight = container.querySelector('.scroller-arrow.right');

        if (!scroller || !arrowLeft || !arrowRight) {
            return;
        }

        function updateArrowVisibility() {
            const scrollLeft = scroller.scrollLeft;
            const scrollWidth = scroller.scrollWidth;
            const clientWidth = scroller.clientWidth;

            arrowLeft.style.display = 'block';
            arrowRight.style.display = 'block';
            arrowLeft.disabled = scrollLeft < 10;
            arrowRight.disabled = scrollWidth - scrollLeft - clientWidth < 10;
        }

        arrowLeft.addEventListener('click', () => {
            scroller.scrollBy({ left: -scroller.clientWidth * 0.8, behavior: 'smooth' });
        });

        arrowRight.addEventListener('click', () => {
            scroller.scrollBy({ left: scroller.clientWidth * 0.8, behavior: 'smooth' });
        });

        scroller.addEventListener('scroll', updateArrowVisibility);
        setTimeout(updateArrowVisibility, 100);
    }

    function startRendering() {
        if (skeletonContainer) {
            skeletonContainer.style.display = 'none';
        }

        resultsContainer.innerHTML = '';
        noResultsMessage.style.display = 'none';

        if (specialFilterMode === 'recent_high_score') {
            interactiveTimeline.classList.remove('visible');
            comingSoonContainer.style.display = 'none';
        } else {
            interactiveTimeline.classList.add('visible');
        }

        currentPage = 1;
        lastRenderedMonth = null;

        allAvailableYears = [...new Set(filteredPastAndPresentItems.map((item) => item.date.substring(0, 4)))];
        if (comingSoonContainer.style.display === 'block') {
            allAvailableYears.unshift(FUTURE_TAG);
        }

        visibleYearCount = Math.min(3, allAvailableYears.length);
        currentActiveYear = null;

        if (filteredPastAndPresentItems.length === 0 && comingSoonContainer.style.display === 'none') {
            noResultsMessage.style.display = 'block';
        }

        if (allAvailableYears.length > 0 || specialFilterMode === 'recent_high_score') {
            if (specialFilterMode !== 'recent_high_score') {
                renderTimeline(allAvailableYears[0]);
            }
            loadMoreItems();
        } else {
            yearList.innerHTML = '';
            loader.style.display = 'none';
            interactiveTimeline.classList.remove('visible');
        }
    }

    function loadMoreItems() {
        if (isLoading) {
            return;
        }

        isLoading = true;

        if (!loadingOverlay.classList.contains('visible') && !isScrollingProgrammatically) {
            loader.style.display = 'block';
        }

        const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
        const endIndex = startIndex + ITEMS_PER_PAGE;
        const itemsToRender = filteredPastAndPresentItems.slice(startIndex, endIndex);

        if (itemsToRender.length > 0) {
            appendItems(itemsToRender);
            currentPage += 1;
        }

        isLoading = false;
        loader.style.display = 'none';

        if (specialFilterMode !== 'recent_high_score') {
            updateActiveTimeline();
        }
    }

    function appendItems(itemsToRender) {
        let currentGrid;

        if (specialFilterMode === 'recent_high_score' && !resultsContainer.querySelector('.month-grid')) {
            currentGrid = document.createElement('div');
            currentGrid.className = 'month-grid';
            resultsContainer.appendChild(currentGrid);
        } else {
            currentGrid = resultsContainer.querySelector('.month-grid:last-of-type');
        }

        itemsToRender.forEach((item) => {
            if (specialFilterMode !== 'recent_high_score') {
                const monthKey = item.date.substring(0, 7);

                if (monthKey !== lastRenderedMonth) {
                    lastRenderedMonth = monthKey;
                    const header = document.createElement('h2');
                    header.className = 'month-group-header';
                    header.id = `month-${monthKey}`;
                    const date = new Date(`${monthKey}-01`);
                    header.textContent = `${date.getFullYear()}年 ${date.getMonth() + 1}月`;
                    resultsContainer.appendChild(header);

                    currentGrid = document.createElement('div');
                    currentGrid.className = 'month-grid';
                    resultsContainer.appendChild(currentGrid);
                }
            }

            const card = createCatalogCard(item);
            if (!currentGrid) {
                currentGrid = document.createElement('div');
                currentGrid.className = 'month-grid';
                resultsContainer.appendChild(currentGrid);
            }
            currentGrid.appendChild(card);
        });
    }

    function getCardChipLabels(item) {
        const chips = [];

        if (item.genres && item.genres.length > 0) {
            chips.push(getGenreDisplayName(item.genres[0]));
        }

        return chips.slice(0, 2);
    }

    function createCatalogCard(item) {
        const posterUrl = resolvePosterUrl(item.posterPath);
        const titleText = item.title || '未命名';
        const subtitleHtml = item.subtitle
            ? `<p class="card-subtitle" title="${item.subtitle}">${item.subtitle}</p>`
            : '';
        const chipLabels = getCardChipLabels(item);
        const chipHtml = chipLabels.length > 0
            ? `<div class="card-chip-row">${chipLabels.map((label) => `<span class="card-chip">${label}</span>`).join('')}</div>`
            : '';

        let ratingElementHTML = '';
        if (item.doubanVerified && item.doubanRating) {
            ratingElementHTML = `<div class="card-rating"><span class="rating-star">★</span><span class="rating-label">豆瓣</span><span class="rating-value">${item.doubanRating}</span></div>`;
        } else {
            ratingElementHTML = `<div class="card-rating"><span class="rating-star">★</span><span class="rating-label">豆瓣</span><span class="rating-empty">暂无评分</span></div>`;
        }

        const airDateInfo = item.date ? `<p class="card-meta-info">上映日期：${item.date}</p>` : '';
        const imageHTML = `<img src="${posterUrl}" alt="${titleText}" class="poster" loading="lazy" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='https://via.placeholder.com/500x750.png?text=No+Image';">`;
        const posterContainerClass = item.doubanVerified && item.doubanLink
            ? 'card-poster-container clickable'
            : 'card-poster-container';
        const posterHTML = item.doubanVerified && item.doubanLink
            ? `<a href="${item.doubanLink}" target="_blank" rel="noopener noreferrer" class="poster-link">${imageHTML}</a>`
            : imageHTML;

        const links = [];
        if (item.doubanVerified && item.doubanLink) {
            links.push(`<a href="${item.doubanLink}" class="card-link" target="_blank" rel="noopener noreferrer">豆瓣</a>`);
        }
        if (item.tmdbUrl) {
            links.push(`<a href="${item.tmdbUrl}" class="card-link" target="_blank" rel="noopener noreferrer">TMDb</a>`);
        } else if (item.tmdbSearchUrl) {
            links.push(`<a href="${item.tmdbSearchUrl}" class="card-link" target="_blank" rel="noopener noreferrer">TMDb 搜索</a>`);
        }
        if (item.imdbUrl) {
            links.push(`<a href="${item.imdbUrl}" class="card-link" target="_blank" rel="noopener noreferrer">IMDb</a>`);
        }

        const card = document.createElement('div');
        card.className = 'show-card';
        card.innerHTML = `<div class="${posterContainerClass}">${posterHTML}</div><div class="card-content">${ratingElementHTML}<h3 class="card-title" title="${titleText}">${titleText}</h3>${subtitleHtml}${airDateInfo}${chipHtml}${links.length ? `<div class="card-links">${links.join('')}</div>` : ''}</div>`;
        return card;
    }

    function resolvePosterUrl(posterPath) {
        if (!posterPath) {
            return 'https://via.placeholder.com/500x750.png?text=No+Image';
        }

        if (/^https?:\/\//i.test(posterPath)) {
            return posterPath;
        }

        return posterPath.startsWith('/') ? `${TMDB_IMAGE_BASE_URL}${posterPath}` : posterPath;
    }

    function updateGenreFilterCollapse() {
        updateFilterCollapse(genreFilterContainer, genreFilterToggle, genreFiltersExpanded);
    }

    function updateNetworkFilterCollapse() {
        updateFilterCollapse(
            networkFilterContainer,
            networkFilterToggle,
            networkFiltersExpanded,
            getCurrentCategoryConfig().showNetworkFilter
        );
    }

    function updateFilterCollapse(container, toggleButton, isExpanded, enabled = true) {
        if (!container || !toggleButton) {
            return;
        }

        container.classList.remove('collapsed');
        container.style.removeProperty('--collapsed-height');
        toggleButton.hidden = true;

        if (!enabled || window.innerWidth <= 900) {
            return;
        }

        const tags = [...container.querySelectorAll('.genre-tag')];
        if (tags.length === 0) {
            return;
        }

        const rowTops = [...new Set(tags.map((tag) => tag.offsetTop))].sort((left, right) => left - right);
        if (rowTops.length <= 2) {
            return;
        }

        const visibleRows = new Set(rowTops.slice(0, 2));
        const collapsedHeight = Math.max(
            ...tags
                .filter((tag) => visibleRows.has(tag.offsetTop))
                .map((tag) => tag.offsetTop + tag.offsetHeight)
        );

        container.style.setProperty('--collapsed-height', `${collapsedHeight}px`);
        container.classList.toggle('collapsed', !isExpanded);
        toggleButton.hidden = false;
        toggleButton.textContent = isExpanded ? '收起' : '展开';
    }

    function renderTimeline(activeYear) {
        yearList.innerHTML = '';

        const yearsToShow = allAvailableYears.slice(0, visibleYearCount);
        yearsToShow.forEach((year, index) => {
            const item = document.createElement('li');
            item.className = 'year-item';
            if (year === activeYear) {
                item.classList.add('active');
            }
            item.dataset.year = year;
            item.innerHTML = `<span class="dot"></span><span class="year-text">${year}</span>`;
            item.addEventListener('click', (event) => {
                event.stopPropagation();
                const isLastItem = index === yearsToShow.length - 1;
                handleYearClick(year, isLastItem);
            });
            yearList.appendChild(item);
        });
    }

    function handleYearClick(year, isLastItem) {
        if (isLastItem && visibleYearCount < allAvailableYears.length) {
            visibleYearCount = Math.min(allAvailableYears.length, visibleYearCount + 2);
        }
        scrollToYear(year);
    }

    function updateActiveTimeline() {
        if (isScrollingProgrammatically) {
            return;
        }

        let topVisibleYear = null;
        const comingSoonRect = comingSoonContainer.getBoundingClientRect();

        if (comingSoonContainer.style.display === 'block' && comingSoonRect.top >= 0 && comingSoonRect.top < window.innerHeight * 0.4) {
            topVisibleYear = FUTURE_TAG;
        } else {
            const headers = document.querySelectorAll('#results-container .month-group-header');
            if (headers.length > 0) {
                headers.forEach((header) => {
                    if (header.getBoundingClientRect().top < window.innerHeight * 0.4) {
                        topVisibleYear = header.id.substring(6, 10);
                    }
                });
                if (!topVisibleYear) {
                    topVisibleYear = allAvailableYears.find((year) => year !== FUTURE_TAG) || null;
                }
            } else if (allAvailableYears.includes(FUTURE_TAG)) {
                topVisibleYear = FUTURE_TAG;
            }
        }

        if (topVisibleYear && topVisibleYear !== currentActiveYear) {
            currentActiveYear = topVisibleYear;
            const currentIndex = allAvailableYears.indexOf(currentActiveYear);
            if (currentIndex >= visibleYearCount - 1 && visibleYearCount < allAvailableYears.length) {
                visibleYearCount = Math.min(allAvailableYears.length, currentIndex + 2);
            }
            renderTimeline(currentActiveYear);
        }
    }

    async function scrollToYear(year) {
        isScrollingProgrammatically = true;
        renderTimeline(year);
        currentActiveYear = year;

        const currentYearIndex = allAvailableYears.indexOf(year);
        const nextYearToPreload = allAvailableYears[currentYearIndex + 1];

        const mainTask = ensureYearIsLoadedAndScroll(year, false);
        if (nextYearToPreload) {
            ensureYearIsLoadedAndScroll(nextYearToPreload, true);
        }
        await mainTask;

        setTimeout(() => {
            isScrollingProgrammatically = false;
        }, 1000);
    }

    async function ensureYearIsLoadedAndScroll(year, preloadOnly = false) {
        let targetElement;
        if (year === FUTURE_TAG) {
            targetElement = document.body;
        } else {
            targetElement = document.querySelector(`#results-container .month-group-header[id^="month-${year}"]`);
        }

        if (!targetElement && year !== FUTURE_TAG) {
            if (!preloadOnly) {
                loadingOverlay.classList.add('visible');
            }

            while (!targetElement && (currentPage - 1) * ITEMS_PER_PAGE < filteredPastAndPresentItems.length) {
                await loadMoreItemsAsync();
                targetElement = document.querySelector(`#results-container .month-group-header[id^="month-${year}"]`);
            }

            if (!preloadOnly) {
                loadingOverlay.classList.remove('visible');
            }
        }

        if (targetElement && !preloadOnly) {
            setTimeout(() => {
                targetElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 50);
        }
    }

    function loadMoreItemsAsync() {
        return new Promise((resolve) => {
            if (isLoading) {
                resolve();
                return;
            }

            isLoading = true;
            const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
            const endIndex = startIndex + ITEMS_PER_PAGE;
            const itemsToRender = filteredPastAndPresentItems.slice(startIndex, endIndex);

            if (itemsToRender.length > 0) {
                appendItems(itemsToRender);
                currentPage += 1;
            }

            isLoading = false;
            setTimeout(resolve, 50);
        });
    }

    function setupEventListeners() {
        categoryFilterContainer.addEventListener('click', (event) => {
            const target = event.target.closest('.genre-tag');
            if (!target || !target.dataset.category) {
                return;
            }

            void switchCategory(target.dataset.category);
        });

        fileInput.addEventListener('change', (event) => {
            const file = event.target.files && event.target.files[0];
            if (!file) {
                return;
            }

            const reader = new FileReader();
            reader.onload = (readerEvent) => {
                try {
                    const data = JSON.parse(readerEvent.target.result);
                    const state = getCurrentCategoryState();
                    ingestCategoryData(currentCategoryId, data, 'complete');
                    state.latestLoaded = true;
                    state.completeLoaded = true;
                    statusMessage.textContent = `已加载文件: ${file.name}`;
                    statusMessage.style.color = 'green';
                } catch (error) {
                    statusMessage.textContent = `文件 "${file.name}" 不是有效的当前分类 JSON 格式。`;
                    statusMessage.style.color = 'red';
                }
            };
            reader.readAsText(file);
        });

        let scrollTimeout;
        window.addEventListener('scroll', () => {
            clearTimeout(scrollTimeout);
            scrollTimeout = setTimeout(() => {
                updateActiveTimeline();
                if (!isLoading && window.innerHeight + window.scrollY >= document.body.offsetHeight - 500) {
                    loadMoreItems();
                }
            }, 50);
        });

        genreFilterToggle?.addEventListener('click', () => {
            genreFiltersExpanded = !genreFiltersExpanded;
            updateGenreFilterCollapse();
        });

        networkFilterToggle?.addEventListener('click', () => {
            networkFiltersExpanded = !networkFiltersExpanded;
            updateNetworkFilterCollapse();
        });

        window.addEventListener('resize', () => {
            requestAnimationFrame(updateGenreFilterCollapse);
            requestAnimationFrame(updateNetworkFilterCollapse);
        });
    }

    function showToast(message) {
        const toast = document.getElementById('toast-notification');
        if (!toast) {
            return;
        }

        toast.textContent = message;
        toast.classList.add('show');
        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    }

    function setupScrollFade(container) {
        if (!container) {
            return;
        }

        function updateFade() {
            const isAtEnd = container.scrollLeft + container.clientWidth >= container.scrollWidth - 5;
            container.classList.toggle('scrolled-to-end', isAtEnd);
        }

        setTimeout(updateFade, 100);
        container.addEventListener('scroll', updateFade, { passive: true });
        window.addEventListener(
            'resize',
            () => {
                setTimeout(updateFade, 100);
            },
            { passive: true }
        );
    }

    setupEventListeners();
    initialize();
    setupScrollFade(ratingFilterContainer);
    setupScrollFade(genreFilterContainer);
    setupScrollFade(networkFilterContainer);
});
