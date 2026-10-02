import test from 'node:test';
import assert from 'node:assert/strict';

import { createCategorySpecs, isVarietyTv } from '../scripts/catalog/category-specs.mjs';

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
    assert.deepEqual(tvCn.doubanSources.map((source) => source.slug), ['tv_domestic', 'tv_hot', 'tv_real_time_hotest']);
    const realtimeSource = tvCn.doubanSources.find((source) => source.slug === 'tv_real_time_hotest');
    assert.equal(realtimeSource.includeItem({ card_subtitle: '2026 / 中国大陆 / 剧情 悬疑' }), true);
    assert.equal(realtimeSource.includeItem({ card_subtitle: '2026 / 韩国 / 剧情' }), false);
    assert.equal(tvCn.tmdb.params['first_air_date.lte'], '2026-12-31');
    assert.equal(tvCn.trailerSource.searchFromCatalog, true);

    const movieCn = specs.find((spec) => spec.id === 'movie_cn');
    assert.equal(movieCn.tmdb.params.with_release_type, '2|3');
    assert.equal(movieCn.latestCount, 24);

    const variety = specs.find((spec) => spec.id === 'tv_cn_variety');
    assert.equal(variety.tmdb.params.with_genres, '10764|10767');
});

test('domestic drama sources reject variety while variety sources collect it', () => {
    const specs = createCategorySpecs({ endOfCurrentYear: '2026-12-31' });
    const drama = specs.find((spec) => spec.id === 'tv_cn');
    const variety = specs.find((spec) => spec.id === 'tv_cn_variety');
    const item = { title: '花儿与少年 第八季', card_subtitle: '2026 / 中国大陆 / 真人秀' };
    assert.equal(drama.doubanSources.every((source) => !source.includeItem(item)), true);
    assert.equal(variety.doubanSources.find((source) => source.slug === 'tv_real_time_hotest').includeItem(item), true);
    assert.equal(drama.includeCatalogItem({ genres: [{ id: 1, name: '真人秀' }] }), false);
    assert.equal(drama.includeCatalogItem({ genres: [{ id: 10764, name: 'Reality' }] }), false);
    assert.equal(drama.includeCatalogItem({ genres: [{ id: 18, name: '剧情' }] }), true);
    assert.equal(isVarietyTv({ genres: ['脱口秀'] }), true);
});
