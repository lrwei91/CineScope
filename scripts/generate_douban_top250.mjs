#!/usr/bin/env node

/**
 * 豆瓣电影 Top 250 爬虫脚本
 * 抓取 https://movie.douban.com/top250 全部 10 页数据
 * 输出为项目标准的 movies JSON 格式
 *
 * 参考: https://github.com/chenzihao981-wq/douban-spider-refactor-demo
 */

import { access, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const OUTPUT_ROOT = path.resolve(process.env.CINESCOPE_OUTPUT_ROOT || ROOT_DIR);

const OUTPUT_PATH = 'json/douban_top250.json';
const TOTAL_PAGES = 10;
const ITEMS_PER_PAGE = 25;
const REQUEST_DELAY_MS = 2000;

const HEADERS = {
    Referer: 'https://movie.douban.com/',
    'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
    Accept: 'text/html,application/xhtml+xml'
};

// =====================================================
// HTML 解析
// =====================================================

/**
 * 抓取单页 Top 250 数据
 */
async function fetchPage(pageIndex) {
    const start = pageIndex * ITEMS_PER_PAGE;
    const url = `https://movie.douban.com/top250?start=${start}&filter=`;
    console.log(`正在爬取第 ${pageIndex + 1} 页 (start=${start})...`);

    const response = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(15000) });
    if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${url}`);
    }

    const html = await response.text();
    return parsePageItems(html, pageIndex);
}

/**
 * 从 HTML 中解析电影列表
 */
function parsePageItems(html, pageIndex) {
    const movies = [];

    // 匹配每个 <div class="item"> 块（包含 pic + info）
    const itemPattern = /<div class="item">[\s\S]*?<\/li>/g;
    const items = html.match(itemPattern) || [];

    items.forEach((block, index) => {
        try {
            const movie = parseMovieBlock(block, pageIndex * ITEMS_PER_PAGE + index + 1);
            if (movie) {
                movies.push(movie);
            }
        } catch (error) {
            console.warn(`  解析第 ${pageIndex * ITEMS_PER_PAGE + index + 1} 条失败: ${error.message}`);
        }
    });

    return movies;
}

/**
 * 解析单个电影块
 */
function parseMovieBlock(block, globalRank) {
    // 排名
    const rankMatch = block.match(/<em[^>]*>(\d+)<\/em>/);
    const rank = rankMatch ? Number(rankMatch[1]) : globalRank;

    // 豆瓣链接和 subject ID
    const linkMatch = block.match(/href="(https?:\/\/movie\.douban\.com\/subject\/(\d+)\/?)"/);
    const doubanLink = linkMatch ? linkMatch[1] : null;
    const subjectId = linkMatch ? Number(linkMatch[2]) : null;

    // 标题（中文，第一个 title span）
    const titleMatch = block.match(/<span class="title">([^<]+)<\/span>/);
    const title = titleMatch ? decodeHtmlEntities(titleMatch[1].trim()) : '未命名';

    // 原标题（第二个 title span，以 &nbsp;/&nbsp; 开头）
    const allTitleMatches = [...block.matchAll(/<span class="title">([^<]+)<\/span>/g)];
    let originalTitle = title;
    if (allTitleMatches.length >= 2) {
        const rawOriginal = allTitleMatches[1][1].trim();
        // 去掉开头的 "&nbsp;/&nbsp;" 或 "/ "
        originalTitle = decodeHtmlEntities(rawOriginal.replace(/^\s*&nbsp;\s*\/\s*&nbsp;\s*/, '').replace(/^\/\s*/, '').trim()) || title;
    }

    // 别名
    const otherMatch = block.match(/<span class="other">([^<]+)<\/span>/);
    const aka = otherMatch
        ? otherMatch[1]
              .split(/\s*\/\s*/)
              .map((name) => decodeHtmlEntities(name.replace(/&nbsp;/g, ' ').trim()))
              .filter(Boolean)
        : [];

    // 评分
    const ratingMatch = block.match(/<span class="rating_num"[^>]*>([\d.]+)<\/span>/);
    const rating = ratingMatch ? ratingMatch[1] : null;

    // 评价人数
    const peopleMatch = block.match(/<span>(\d+)人评价<\/span>/);
    const ratingCount = peopleMatch ? Number(peopleMatch[1]) : null;

    // 一句话评价（在 <p class="quote"><span> 中）
    const quoteMatch = block.match(/<p class="quote">\s*<span[^>]*>([^<]+)<\/span>/) || block.match(/<span class="inq">([^<]+)<\/span>/);
    const quote = quoteMatch ? decodeHtmlEntities(quoteMatch[1].trim()) : '';

    // 海报图
    const posterMatch = block.match(/<img[^>]+src="([^"]+)"/);
    const posterUrl = posterMatch ? posterMatch[1] : null;

    // 详情文本 (导演 / 主演 / 年份 / 国家 / 类型)
    const infoMatch = block.match(/<div class="bd">\s*<p[^>]*>\s*([\s\S]*?)\s*<\/p>/);
    const infoText = infoMatch ? infoMatch[1].replace(/<br\s*\/?>/g, '\n').replace(/<[^>]+>/g, '').trim() : '';

    const { directors, actors, year, countries, genres } = parseInfoText(infoText);

    // 构建标准日期（Top250 只有年份，补为 01-01）
    const releaseDate = year ? `${year}-01-01` : '1900-01-01';

    console.log(`  #${rank} ${title} (${year || '?'}) ★${rating || '?'}`);

    return {
        id: subjectId || rank,
        title,
        original_title: originalTitle,
        release_date: releaseDate,
        genres: genres.map((name, idx) => ({ id: idx + 1, name })),
        directors: directors.map((name, idx) => ({ id: idx + 1, name })),
        actors: actors.map((name, idx) => ({ id: idx + 1, name })),
        countries,
        languages: [],
        aka,
        imdb_id: null,
        poster_path: posterUrl,
        douban_rating: rating,
        douban_link_google: doubanLink,
        douban_link_verified: true,
        overview: quote,
        durations: [],
        release_windows: [],
        rating_count: ratingCount,
        rating_star_count: null,
        type: 'movie',
        // Top 250 专属字段
        top250_rank: rank,
        top250_quote: quote
    };
}

/**
 * 解析详情文本行
 * 格式通常为:
 *   导演: xxx   主演: xxx
 *   2024 / 中国大陆 / 剧情 喜剧
 */
function parseInfoText(infoText) {
    // 先把 &nbsp; 替换为普通空格
    const cleanText = infoText.replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
    const lines = cleanText.split('\n').map((line) => line.trim()).filter(Boolean);

    // 如果只有一行，尝试用 <br> 分割的方式（有些情况下换行已被清除）
    // 重新用原文本按行拆分
    const rawLines = infoText.replace(/&nbsp;/g, ' ').split(/\n/).map((line) => line.trim()).filter(Boolean);

    let directors = [];
    let actors = [];
    let year = '';
    let countries = [];
    let genres = [];

    const allLines = rawLines.length >= 2 ? rawLines : lines;

    // 第一行: 导演和主演
    if (allLines[0]) {
        const line1 = allLines[0];
        const directorMatch = line1.match(/导演:\s*([^主]+)/);
        if (directorMatch) {
            directors = directorMatch[1]
                .split(/\s*\/\s*/)
                .map((name) => name.replace(/\.\.\.$/, '').trim())
                .filter(Boolean);
        }

        const actorMatch = line1.match(/主演:\s*(.*)/);
        if (actorMatch) {
            actors = actorMatch[1]
                .split(/\s*\/\s*/)
                .map((name) => name.replace(/\.\.\.$/, '').trim())
                .filter(Boolean);
        }
    }

    // 第二行: 年份 / 国家 / 类型
    const yearLine = allLines.length >= 2 ? allLines[1] : allLines[0];
    if (yearLine) {
        // 尝试匹配 "年份 / 国家 / 类型" 格式
        const yearLineMatch = yearLine.match(/(\d{4})/);
        if (yearLineMatch) {
            year = yearLineMatch[1];
            // 从年份行中提取国家和类型
            const afterYear = yearLine.substring(yearLine.indexOf(year) + 4);
            const segments = afterYear.split(/\s*\/\s*/).map((s) => s.trim()).filter(Boolean);
            if (segments[0]) {
                countries = segments[0].split(/\s+/).filter(Boolean);
            }
            if (segments[1]) {
                genres = segments[1].split(/\s+/).filter(Boolean);
            }
        }
    }

    return { directors, actors, year, countries, genres };
}

/**
 * 解码 HTML 实体
 */
function decodeHtmlEntities(text) {
    return text
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, ' ')
        .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

// =====================================================
// 海报下载
// =====================================================

/**
 * 下载海报图片到本地
 */
async function downloadPoster(subjectId, remoteUrl) {
    if (!remoteUrl || !/^https?:\/\//i.test(remoteUrl)) {
        return remoteUrl;
    }

    const relativePath = `posters/douban/douban_top250/${subjectId}.jpg`;
    try {
        await access(path.resolve(ROOT_DIR, relativePath));
        return relativePath;
    } catch {
        // Download into the current run's output root.
    }

    try {
        const response = await fetch(remoteUrl, {
            headers: {
                Referer: 'https://movie.douban.com/',
                'User-Agent': HEADERS['User-Agent']
            },
            signal: AbortSignal.timeout(10000)
        });

        if (!response.ok) {
            console.warn(`  海报下载失败 (${response.status}): ${subjectId}`);
            return remoteUrl;
        }

        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        if (buffer.length === 0) {
            return remoteUrl;
        }

        const targetPath = path.resolve(OUTPUT_ROOT, relativePath);
        await mkdir(path.dirname(targetPath), { recursive: true });
        await writeFile(targetPath, buffer);
        return relativePath;
    } catch (error) {
        console.warn(`  海报下载跳过 ${subjectId}: ${error.message}`);
        return remoteUrl;
    }
}

// =====================================================
// 主流程
// =====================================================

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(options = {}) {
    if (!options.silent) {
        console.log('=== 豆瓣电影 Top 250 爬虫 ===\n');
    }

    const allMovies = [];

    for (let page = 0; page < TOTAL_PAGES; page++) {
        try {
            const movies = await fetchPage(page);
            allMovies.push(...movies);
        } catch (error) {
            console.error(`第 ${page + 1} 页爬取失败: ${error.message}`);
        }

        if (page < TOTAL_PAGES - 1) {
            await sleep(REQUEST_DELAY_MS);
        }
    }

    if (!options.silent) {
        console.log(`\n爬取完成！共 ${allMovies.length} 部电影`);
    }

    // 下载海报
    if (!options.silent) {
        console.log('\n开始下载海报...');
    }
    for (let i = 0; i < allMovies.length; i++) {
        const movie = allMovies[i];
        if (movie.poster_path && movie.poster_path.startsWith('http')) {
            movie.poster_path = await downloadPoster(movie.id, movie.poster_path);
            // 每下载 5 张海报暂停一下
            if ((i + 1) % 5 === 0) {
                await sleep(500);
            }
        }
    }

    // 生成 JSON 文件
    const payload = {
        metadata: {
            last_updated: new Date().toISOString(),
            version: '2.0.0',
            update_log: [
                {
                    time: new Date().toISOString(),
                    summary: `已同步豆瓣Top250数据：${allMovies.length} 条`
                }
            ],
            source: 'douban-top250',
            source_collections: [
                {
                    slug: 'douban_top250',
                    source: 'douban',
                    count: allMovies.length,
                    fetch_error: null
                }
            ],
            total_items: allMovies.length
        },
        movies: allMovies
    };

    const targetPath = path.resolve(OUTPUT_ROOT, OUTPUT_PATH);
    await mkdir(path.dirname(targetPath), { recursive: true });
    await writeFile(targetPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

    if (!options.silent) {
        console.log(`\n数据已保存到 ${OUTPUT_PATH}`);
        console.log(`共 ${allMovies.length} 部电影`);
    }

    return {
        total_items: allMovies.length,
        last_updated: payload.metadata.last_updated
    };
}

export async function generateDoubanTop250(options = {}) {
    return main(options);
}

if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch((error) => {
        console.error('爬虫执行失败:', error);
        process.exit(1);
    });
}
