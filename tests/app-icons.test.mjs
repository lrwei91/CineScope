#!/usr/bin/env node
// 平台图标与安装元数据门禁：安装链路与标签页链路是两条独立交付路径，
// 任何一环缺失都会让主屏图标退化为页面截图，因此在这里固定下来。

import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const INDEX_HTML = path.join(ROOT_DIR, 'index.html');
const MANIFEST = path.join(ROOT_DIR, 'manifest.webmanifest');
const VERCEL_JSON = path.join(ROOT_DIR, 'vercel.json');
const BUILD_SCRIPT = path.join(ROOT_DIR, 'scripts', 'build-site.mjs');

const ICON_DIR = path.join(ROOT_DIR, 'assets', 'icons');
const REQUIRED_ICONS = [
    'icon-any-32.png',
    'icon-any-180.png',
    'icon-any-192.png',
    'icon-any-512.png',
    'icon-maskable-192.png',
    'icon-maskable-512.png',
    'app-icon.svg',
    'app-icon-maskable.svg'
];

async function readPngHeader(file) {
    const buffer = await readFile(file);
    assert.equal(buffer.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', `${file} 不是合法 PNG`);
    // IHDR：宽度、高度、位深、颜色类型。颜色类型 6 表示带 alpha 通道，2 表示纯 RGB 不透明。
    return {
        width: buffer.readUInt32BE(16),
        height: buffer.readUInt32BE(20),
        bitDepth: buffer[24],
        colorType: buffer[25]
    };
}

test('安装图标资源齐备且为不透明正方形位图', async () => {
    for (const name of REQUIRED_ICONS) {
        const file = path.join(ICON_DIR, name);
        const info = await stat(file);
        assert.ok(info.size > 0, `${name} 为空文件`);
        if (!name.endsWith('.png')) continue;

        const header = await readPngHeader(file);
        assert.equal(header.width, header.height, `${name} 不是正方形`);
        assert.notEqual(header.colorType, 6, `${name} 带 alpha 通道，安装图标必须完全不透明`);
        assert.notEqual(header.colorType, 4, `${name} 带灰度 alpha 通道，安装图标必须完全不透明`);
    }
});

test('安装图标尺寸满足各平台实际显示要求', async () => {
    const expected = {
        'icon-any-32.png': 32,
        'icon-any-180.png': 180,
        'icon-any-192.png': 192,
        'icon-any-512.png': 512,
        'icon-maskable-192.png': 192,
        'icon-maskable-512.png': 512
    };
    for (const [name, size] of Object.entries(expected)) {
        const header = await readPngHeader(path.join(ICON_DIR, name));
        assert.equal(header.width, size, `${name} 宽度不符`);
        assert.equal(header.height, size, `${name} 高度不符`);
    }
});

test('安装元数据在首屏标记中声明且不依赖客户端脚本注入', async () => {
    const html = await readFile(INDEX_HTML, 'utf8');
    const head = html.slice(0, html.indexOf('</head>'));
    assert.ok(head.length > 0, 'index.html 缺少 head 区域');

    const required = [
        /<link[^>]+rel="apple-touch-icon"[^>]+href="\/assets\/icons\/icon-any-180\.png[^"]*"/,
        /<link[^>]+rel="manifest"[^>]+href="\/manifest\.webmanifest[^"]*"/,
        /<meta[^>]+name="apple-mobile-web-app-capable"[^>]+content="yes"/,
        /<meta[^>]+name="apple-mobile-web-app-title"[^>]+content="CineScope"/,
        /<meta[^>]+name="application-name"[^>]+content="CineScope"/,
        /<meta[^>]+name="theme-color"[^>]+content="#FFFFFF"/
    ];
    for (const pattern of required) {
        assert.match(head, pattern, `首屏缺少安装声明：${pattern}`);
    }
});

test('安装名称长度在平台可显示范围内，且与页面标题职责分离', async () => {
    const html = await readFile(INDEX_HTML, 'utf8');
    const title = html.match(/<title>([^<]+)<\/title>/)?.[1] ?? '';
    const manifest = JSON.parse(await readFile(MANIFEST, 'utf8'));

    assert.ok(title.includes('CineScope'), '页面标题应保留站点标识');
    assert.notEqual(manifest.short_name, title, '安装名称应独立声明，不直接复用页面标题');
    // short_name 用于主屏图标下方，平台会在约 12 个字符后截断；name 仅出现在安装提示中，要求更宽松。
    assert.ok(manifest.short_name.length > 0, 'manifest.short_name 不能为空');
    assert.ok(manifest.short_name.length <= 12, `manifest.short_name 过长，主屏名称会被截断：${manifest.short_name}`);
    assert.ok(manifest.name.length <= 30, `manifest.name 过长，安装提示会被截断：${manifest.name}`);
});

test('安装清单声明完整且图标可公开直达', async () => {
    const manifest = JSON.parse(await readFile(MANIFEST, 'utf8'));
    for (const key of ['name', 'short_name', 'start_url', 'scope', 'display', 'background_color', 'theme_color', 'icons']) {
        assert.ok(manifest[key], `manifest 缺少 ${key}`);
    }
    assert.ok(Array.isArray(manifest.icons) && manifest.icons.length >= 2, 'manifest 至少需要两个尺寸的图标');

    const purposes = new Set();
    for (const icon of manifest.icons) {
        assert.ok(icon.src.startsWith('/'), `图标应使用根相对路径：${icon.src}`);
        assert.ok(icon.sizes && icon.type, `图标缺少 sizes 或 type：${icon.src}`);
        const file = path.join(ROOT_DIR, icon.src.replace(/^\//, ''));
        const info = await stat(file);
        assert.ok(info.size > 0, `图标资源缺失：${icon.src}`);
        const header = await readPngHeader(file);
        const [declaredWidth] = icon.sizes.split('x');
        assert.equal(header.width, Number(declaredWidth), `图标实际尺寸与声明不符：${icon.src}`);
        purposes.add(icon.purpose);
    }
    assert.ok(purposes.has('maskable'), '可遮罩平台需要 maskable 变体');
});

test('构建产物包含安装资源，部署层声明正确的清单内容类型', async () => {
    const buildScript = await readFile(BUILD_SCRIPT, 'utf8');
    assert.match(buildScript, /'manifest\.webmanifest'/, '静态构建必须复制 manifest');
    assert.match(buildScript, /'assets'/, '静态构建必须复制 assets 目录');

    const vercel = JSON.parse(await readFile(VERCEL_JSON, 'utf8'));
    const manifestRule = vercel.headers?.find((rule) => rule.source === '/manifest.webmanifest');
    assert.ok(manifestRule, '缺少 manifest 的响应头规则');
    const contentType = manifestRule.headers.find((header) => header.key === 'Content-Type');
    assert.match(
        contentType?.value ?? '',
        /application\/manifest\+json/,
        'manifest 必须以 manifest+json 返回，否则安装流程会拒绝解析'
    );
});
