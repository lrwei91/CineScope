import test from 'node:test';
import assert from 'node:assert/strict';

import { createCategorySpecs } from '../scripts/catalog/category-specs.mjs';

test('category specs preserve catalog ids, source rules and TMDB windows', () => {
    const specs = createCategorySpecs({ endOfCurrentYear: '2026-12-31' });
    assert.deepEqual(specs.map((spec) => spec.id), [
        'tv_cn',
        'tv_kr',
        'tv_jp',
        'movie_cn',
        'tv_cn_variety',
        'tv_us'
    ]);

    const tvCn = specs.find((spec) => spec.id === 'tv_cn');
    assert.deepEqual(tvCn.doubanSources.map((source) => source.slug), ['tv_domestic', 'tv_hot']);
    assert.equal(tvCn.tmdb.params['first_air_date.lte'], '2026-12-31');
    assert.equal(tvCn.trailerSource.searchFromCatalog, true);

    const movieCn = specs.find((spec) => spec.id === 'movie_cn');
    assert.equal(movieCn.tmdb.params.with_release_type, '2|3');
    assert.equal(movieCn.latestCount, 24);

    const variety = specs.find((spec) => spec.id === 'tv_cn_variety');
    assert.equal(variety.tmdb.params.with_genres, '10764|10767');
});
