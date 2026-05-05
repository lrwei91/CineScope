import test from 'node:test';
import assert from 'node:assert/strict';

import { buildRenderedItemsSignature } from '../js/modules/render-signature.js';

function createItem(extra = {}) {
    return {
        id: 1,
        date: '2026-05-05',
        title: '测试片名',
        subtitle: '',
        doubanRating: '8.0',
        doubanCollectionStatus: null,
        posterPath: '/poster.jpg',
        ...extra
    };
}

test('render signature changes when realtime box office is merged after first render', () => {
    const before = buildRenderedItemsSignature([createItem()]);
    const after = buildRenderedItemsSignature([
        createItem({
            boxOffice: {
                rank: 1,
                realTimeBoxOffice: '536.55万',
                boxOfficeRate: '90.2%'
            }
        })
    ]);

    assert.notEqual(after, before);
});

test('render signature changes when realtime TV heat is merged after first render', () => {
    const before = buildRenderedItemsSignature([createItem()]);
    const after = buildRenderedItemsSignature([
        createItem({
            tvHeat: {
                rank: 1,
                currHeat: '1890.44',
                currHeatDesc: '1890.44'
            }
        })
    ]);

    assert.notEqual(after, before);
});
