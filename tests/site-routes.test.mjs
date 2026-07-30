import assert from 'node:assert/strict';
import test from 'node:test';

import { CATEGORY_CONFIG, DEFAULT_CATEGORY_ID } from '../js/modules/config.js';
import {
    createSiteRoutePlan,
    renderRouteTemplate
} from '../scripts/lib/site-routes.mjs';

test('site route plan creates standalone pages and one child route per catalog category', () => {
    const routes = createSiteRoutePlan();
    const outputPaths = routes.map((route) => route.outputPath);

    assert.equal(new Set(outputPaths).size, outputPaths.length);
    assert.ok(outputPaths.includes('index.html'));
    assert.ok(outputPaths.includes('news/index.html'));
    assert.ok(outputPaths.includes('reviews/index.html'));
    assert.ok(outputPaths.includes('about/index.html'));
    assert.ok(outputPaths.includes('catalog/index.html'));

    Object.keys(CATEGORY_CONFIG).forEach((categoryId) => {
        assert.ok(outputPaths.includes(`catalog/${categoryId}/index.html`));
    });
});

test('catalog root uses the default category and child routes use the correct base depth', () => {
    const routes = createSiteRoutePlan();
    const catalogRoot = routes.find((route) => route.outputPath === 'catalog/index.html');
    const categoryRoute = routes.find(
        (route) => route.outputPath === 'catalog/douban_top250/index.html'
    );

    assert.equal(catalogRoot.categoryId, DEFAULT_CATEGORY_ID);
    assert.equal(catalogRoot.basePath, '../');
    assert.equal(categoryRoute.categoryId, 'douban_top250');
    assert.equal(categoryRoute.basePath, '../../');
});

test('route template rendering replaces every declared placeholder and rejects missing values', () => {
    assert.equal(
        renderRouteTemplate('<base href="{{BASE_PATH}}"><h1>{{TITLE}}</h1>', {
            BASE_PATH: '../',
            TITLE: '片单'
        }),
        '<base href="../"><h1>片单</h1>'
    );
    assert.throws(
        () => renderRouteTemplate('<h1>{{TITLE}}</h1>', {}),
        /Unresolved route template placeholders/
    );
});
