import { CATEGORY_CONFIG, DEFAULT_CATEGORY_ID } from '../../js/modules/config.js';

const EDITORIAL_ROUTES = [
    {
        id: 'news',
        outputPath: 'news/index.html',
        title: '影讯',
        kicker: '正在发生',
        description: '追踪真实片单中的定档、上映与内容动态，点击条目可查看对应作品详情。',
        metaDescription: 'CineScope 影讯：来自真实片单的定档与上映动态。',
        content: '<div id="editorial-news" class="news-grid route-news-grid" aria-live="polite"></div>'
    },
    {
        id: 'reviews',
        outputPath: 'reviews/index.html',
        title: '影评',
        kicker: '编辑札记',
        description: '从作品本身出发记录观看线索，不虚构评论量、评分或用户身份。',
        metaDescription: 'CineScope 影评：关联真实作品的编辑札记。',
        content: '<div id="editorial-reviews" class="review-list route-review-list" aria-live="polite"></div>'
    },
    {
        id: 'about',
        outputPath: 'about/index.html',
        title: '关于本站',
        kicker: '项目说明',
        description: '了解 CineScope 的内容范围、数据来源与静态站点边界。',
        metaDescription: '关于 CineScope 影视内容聚合展示站。',
        content: `
            <article class="about-route-card">
                <p id="about-main-description">CineScope 是一个无后端的影视内容聚合展示站。</p>
                <dl class="about-facts">
                    <div><dt>架构</dt><dd>静态 HTML、原生 ES Modules 与生成 JSON</dd></div>
                    <div><dt>内容</dt><dd>国产剧、院线电影、综艺、海外剧集与豆瓣 Top250</dd></div>
                    <div><dt>边界</dt><dd>不提供评论系统，不在浏览器中伪造订阅或收藏数据</dd></div>
                </dl>
                <div class="about-route-actions">
                    <a href="https://github.com/lrwei91/CineScope" target="_blank" rel="noopener noreferrer">查看项目仓库</a>
                    <a href="https://github.com/lrwei91/CineScope/issues" target="_blank" rel="noopener noreferrer">提交反馈</a>
                </div>
            </article>
        `
    }
];

function activeClass(routeId, expectedId) {
    return routeId === expectedId ? 'active' : '';
}

function currentAttribute(routeId, expectedId) {
    return routeId === expectedId ? 'aria-current="page"' : '';
}

export function createSiteRoutePlan(categoryConfig = CATEGORY_CONFIG) {
    const routes = [
        {
            id: 'home',
            kind: 'home',
            sourcePath: 'index.html',
            outputPath: 'index.html',
            basePath: './',
            replacements: {}
        }
    ];

    EDITORIAL_ROUTES.forEach((route) => {
        routes.push({
            id: route.id,
            kind: 'editorial',
            sourcePath: 'pages/editorial.html',
            outputPath: route.outputPath,
            basePath: '../',
            replacements: {
                BASE_PATH: '../',
                PAGE_ID: route.id,
                META_DESCRIPTION: route.metaDescription,
                DOCUMENT_TITLE: `${route.title}｜CineScope`,
                PAGE_TITLE: route.title,
                PAGE_KICKER: route.kicker,
                PAGE_DESCRIPTION: route.description,
                PAGE_CONTENT: route.content.trim(),
                HOME_ACTIVE: '',
                NEWS_ACTIVE: activeClass(route.id, 'news'),
                NEWS_CURRENT: currentAttribute(route.id, 'news'),
                REVIEWS_ACTIVE: activeClass(route.id, 'reviews'),
                REVIEWS_CURRENT: currentAttribute(route.id, 'reviews'),
                ABOUT_ACTIVE: activeClass(route.id, 'about'),
                ABOUT_CURRENT: currentAttribute(route.id, 'about')
            }
        });
    });

    const defaultCategory = categoryConfig[DEFAULT_CATEGORY_ID];
    routes.push({
        id: 'catalog',
        kind: 'catalog',
        sourcePath: 'pages/catalog.html',
        outputPath: 'catalog/index.html',
        basePath: '../',
        categoryId: DEFAULT_CATEGORY_ID,
        replacements: {
            BASE_PATH: '../',
            CATEGORY_ID: DEFAULT_CATEGORY_ID,
            CATEGORY_LABEL: defaultCategory.label
        }
    });

    Object.values(categoryConfig).forEach((category) => {
        routes.push({
            id: `catalog-${category.id}`,
            kind: 'catalog-category',
            sourcePath: 'pages/catalog.html',
            outputPath: `catalog/${category.id}/index.html`,
            basePath: '../../',
            categoryId: category.id,
            replacements: {
                BASE_PATH: '../../',
                CATEGORY_ID: category.id,
                CATEGORY_LABEL: category.label
            }
        });
    });

    return routes;
}

export function renderRouteTemplate(template, replacements = {}) {
    const rendered = Object.entries(replacements).reduce(
        (content, [key, value]) => content.replaceAll(`{{${key}}}`, String(value)),
        template
    );
    const unresolved = rendered.match(/\{\{[A-Z0-9_]+\}\}/g);
    if (unresolved) {
        throw new Error(`Unresolved route template placeholders: ${[...new Set(unresolved)].join(', ')}`);
    }
    return rendered;
}
