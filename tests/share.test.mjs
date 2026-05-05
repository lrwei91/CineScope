import test from 'node:test';
import assert from 'node:assert/strict';

import { getQrCodeUrl, getShareBaseUrl, getShareQrCodeUrl, getShareRealtimeMetrics } from '../share.js';

test('getShareBaseUrl removes query and hash while preserving deployed path', () => {
    const shareUrl = getShareBaseUrl({
        href: 'https://latesttv.lrwei.com/?category=movie_cn#share'
    });

    assert.equal(shareUrl, 'https://latesttv.lrwei.com/');
});

test('getShareBaseUrl preserves nested path deployments', () => {
    const shareUrl = getShareBaseUrl({
        href: 'https://example.com/latest_tv/index.html?foo=bar#baz'
    });

    assert.equal(shareUrl, 'https://example.com/latest_tv/index.html');
});

test('getShareQrCodeUrl points QR generation at the normalized share URL', () => {
    const qrUrl = new URL(
        getShareQrCodeUrl({ href: 'https://latesttv.lrwei.com/?foo=bar#section' }, 180)
    );

    assert.equal(qrUrl.origin + qrUrl.pathname, 'https://api.qrserver.com/v1/create-qr-code/');
    assert.equal(qrUrl.searchParams.get('size'), '180x180');
    assert.equal(qrUrl.searchParams.get('margin'), '0');
    assert.equal(qrUrl.searchParams.get('data'), 'https://latesttv.lrwei.com/');
});

test('getQrCodeUrl supports arbitrary targets such as Douban links', () => {
    const qrUrl = new URL(
        getQrCodeUrl('https://movie.douban.com/subject/1234567/', 144)
    );

    assert.equal(qrUrl.origin + qrUrl.pathname, 'https://api.qrserver.com/v1/create-qr-code/');
    assert.equal(qrUrl.searchParams.get('size'), '144x144');
    assert.equal(qrUrl.searchParams.get('margin'), '0');
    assert.equal(qrUrl.searchParams.get('data'), 'https://movie.douban.com/subject/1234567/');
});

test('getShareRealtimeMetrics formats cached box office data for movie share images', () => {
    const metrics = getShareRealtimeMetrics({
        kind: 'movie',
        boxOffice: {
            rank: 3,
            realTimeBoxOffice: '536.55万',
            boxOfficeRate: '12.3%',
            showCountRate: '8.1%'
        }
    });

    assert.deepEqual(metrics, [
        {
            label: '票房 #3',
            value: '536.55万',
            detail: '占比 12.3% · 排片 8.1%'
        }
    ]);
});

test('getShareRealtimeMetrics formats cached TV heat data for series share images', () => {
    const metrics = getShareRealtimeMetrics({
        kind: 'tv',
        tvHeat: {
            rank: 1,
            currHeatDesc: '1890.44',
            platformDesc: '多平台播放',
            releaseInfo: '上线8天'
        }
    });

    assert.deepEqual(metrics, [
        {
            label: '热度 #1',
            value: '1890.44',
            detail: '多平台播放 · 上线8天'
        }
    ]);
});
