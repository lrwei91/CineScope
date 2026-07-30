#!/usr/bin/env node

import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const DEFAULT_ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CATEGORY_SPECS = [
    { id: 'tv_cn', kind: 'tv', key: 'shows' },
    { id: 'movie_cn', kind: 'movie', key: 'movies' },
    { id: 'tv_cn_variety', kind: 'tv', key: 'shows' },
    { id: 'tv_kr', kind: 'tv', key: 'shows' },
    { id: 'tv_jp', kind: 'tv', key: 'shows' },
    { id: 'tv_us', kind: 'tv', key: 'shows' }
];
const REQUIRED_AUXILIARY_FILES = [
    'json/douban_top250.json',
    'json/douban_statuses.json',
    'json/maoyan_box_office.json',
    'json/maoyan_tv_heat.json',
    'json/build_report.json'
];
const EDITORIAL_PATH = 'content/editorial.json';
const DROP_FAILURE_THRESHOLD = 0.2;
const QUALITY_WARNING_THRESHOLD = 0.1;
const FUTURE_DATE_WARNING_DAYS = 550;
const DOUBAN_SUBJECT_URL_PATTERN = /^https:\/\/(?:movie\.douban\.com|m\.douban\.com\/movie)\/subject\/\d+\/?(?:[?#].*)?$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function parseArguments(argv) {
    const options = {
        rootDir: DEFAULT_ROOT_DIR,
        posterRoot: null,
        baselineRoot: null,
        baselineRef: 'HEAD',
        allowLargeDrop: false
    };

    for (let index = 0; index < argv.length; index += 1) {
        const argument = argv[index];
        if (argument === '--root') options.rootDir = path.resolve(argv[++index]);
        else if (argument === '--poster-root') options.posterRoot = path.resolve(argv[++index]);
        else if (argument === '--baseline-root') options.baselineRoot = path.resolve(argv[++index]);
        else if (argument === '--baseline-ref') options.baselineRef = argv[++index];
        else if (argument === '--allow-large-drop') options.allowLargeDrop = true;
        else throw new Error(`Unknown argument: ${argument}`);
    }

    return options;
}

async function readJsonFile(rootDir, relativePath) {
    const text = await readFile(path.join(rootDir, relativePath), 'utf8');
    try {
        return JSON.parse(text);
    } catch (error) {
        throw new Error(`${relativePath}: invalid JSON (${error.message})`);
    }
}

function readBaselineJson(rootDir, baselineRef, relativePath) {
    if (!baselineRef) return null;
    const result = spawnSync('git', ['show', `${baselineRef}:${relativePath}`], {
        cwd: rootDir,
        encoding: 'utf8'
    });
    if (result.status !== 0) return null;
    try {
        return JSON.parse(result.stdout);
    } catch {
        return null;
    }
}

function getItemId(item) {
    if (item?.id === undefined || item?.id === null || String(item.id).trim() === '') return '';
    return String(item.id);
}

function getPosterPath(kind, item) {
    return kind === 'tv' ? item?.seasons?.[0]?.poster_path || item?.poster_path || '' : item?.poster_path || '';
}

function getRating(kind, item) {
    return kind === 'tv' ? item?.seasons?.[0]?.douban_rating || item?.douban_rating : item?.douban_rating;
}

function getDoubanLink(kind, item) {
    return kind === 'tv'
        ? item?.seasons?.[0]?.douban_link_google || item?.douban_link_google
        : item?.douban_link_google;
}

function getDoubanLinkVerified(kind, item) {
    return kind === 'tv'
        ? Boolean(item?.seasons?.[0]?.douban_link_verified || item?.douban_link_verified)
        : Boolean(item?.douban_link_verified);
}

function getItemDate(kind, item) {
    return kind === 'tv' ? item?.first_air_date || item?.seasons?.[0]?.air_date || '' : item?.release_date || '';
}

function formatItemReference(item) {
    return `${getItemId(item)} (${item?.title || item?.name || 'untitled'})`;
}

function validateVerifiedDoubanLinks(spec, items, errors) {
    for (const item of items) {
        if (!getDoubanLinkVerified(spec.kind, item)) continue;
        const link = String(getDoubanLink(spec.kind, item) || '').trim();
        if (!DOUBAN_SUBJECT_URL_PATTERN.test(link)) {
            errors.push(`${spec.id}: verified Douban link is invalid for ${formatItemReference(item)}`);
        }
    }
}

function validateFutureDates(spec, items, warnings, now) {
    const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    for (const item of items) {
        const value = String(getItemDate(spec.kind, item) || '');
        const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (!match) continue;
        const releaseUtc = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
        const daysAhead = Math.floor((releaseUtc - todayUtc) / 86_400_000);
        if (daysAhead > FUTURE_DATE_WARNING_DAYS) {
            warnings.push(`${spec.id}: unusually distant release date for ${formatItemReference(item)}: ${value} (${daysAhead} days ahead)`);
        }
    }
}

function computeQuality(kind, items) {
    const total = items.length || 1;
    const missingRating = items.filter((item) => !getRating(kind, item)).length;
    const missingDoubanLink = items.filter((item) => !getDoubanLink(kind, item)).length;
    return {
        rating: missingRating / total,
        douban_link: missingDoubanLink / total
    };
}

function validateUniqueIds(spec, level, items, errors) {
    const seen = new Set();
    for (const item of items) {
        const id = getItemId(item);
        if (!id) {
            errors.push(`${spec.id}/${level}: item is missing id`);
            continue;
        }
        if (seen.has(id)) errors.push(`${spec.id}/${level}: duplicate id ${id}`);
        seen.add(id);
    }
    return seen;
}

async function validatePosterPaths(rootDir, posterRoot, spec, items, errors) {
    for (const item of items) {
        const posterPath = String(getPosterPath(spec.kind, item) || '').trim();
        if (!posterPath || /^https?:\/\//.test(posterPath) || posterPath.startsWith('/')) continue;
        if (!posterPath.startsWith('posters/')) continue;

        const absolutePath = path.resolve(rootDir, posterPath);
        const postersRoot = path.resolve(rootDir, 'posters');
        if (absolutePath !== postersRoot && !absolutePath.startsWith(`${postersRoot}${path.sep}`)) {
            errors.push(`${spec.id}: poster path escapes posters/: ${posterPath}`);
            continue;
        }
        let found = false;
        for (const candidateRoot of [rootDir, posterRoot].filter(Boolean)) {
            try {
                await access(path.resolve(candidateRoot, posterPath));
                found = true;
                break;
            } catch {
                // Try the next root.
            }
        }
        if (!found) errors.push(`${spec.id}: missing local poster ${posterPath}`);
    }
}

function isValidDateString(value) {
    if (!DATE_PATTERN.test(String(value || ''))) return false;
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

async function validateEditorialAsset(rootDir, relativePath, fieldName, errors) {
    const value = String(relativePath || '').trim();
    if (!value) {
        errors.push(`${EDITORIAL_PATH}: ${fieldName} is required`);
        return;
    }
    if (/^https?:\/\//i.test(value)) {
        errors.push(`${EDITORIAL_PATH}: ${fieldName} must reference a local project asset`);
        return;
    }

    const absolutePath = path.resolve(rootDir, value);
    if (absolutePath !== rootDir && !absolutePath.startsWith(`${rootDir}${path.sep}`)) {
        errors.push(`${EDITORIAL_PATH}: ${fieldName} escapes the project root`);
        return;
    }
    try {
        await access(absolutePath);
    } catch {
        errors.push(`${EDITORIAL_PATH}: missing ${fieldName} asset ${value}`);
    }
}

function itemCollectionHasId(items, itemId) {
    const normalizedId = String(itemId || '');
    return items.some((item) => {
        if (String(item?.id || '') === normalizedId) return true;
        return Array.isArray(item?.seasons) &&
            item.seasons.some((season) => String(season?.id || '') === normalizedId);
    });
}

export async function validateEditorialContent(rootDir, categoryItems, errors) {
    const editorial = await readJsonFile(rootDir, EDITORIAL_PATH);
    const metadata = editorial?.metadata;
    const hero = editorial?.hero;
    const about = editorial?.about;
    const subscription = editorial?.subscription;

    if (!metadata || typeof metadata !== 'object') errors.push(`${EDITORIAL_PATH}: metadata is required`);
    if (!Number.isInteger(metadata?.schemaVersion) || metadata.schemaVersion < 1) {
        errors.push(`${EDITORIAL_PATH}: metadata.schemaVersion must be a positive integer`);
    }
    if (!String(metadata?.title || '').trim()) {
        errors.push(`${EDITORIAL_PATH}: metadata.title is required`);
    }
    if (!isValidDateString(metadata?.updatedAt)) {
        errors.push(`${EDITORIAL_PATH}: metadata.updatedAt must be a valid YYYY-MM-DD date`);
    }

    for (const field of ['eyebrow', 'title', 'accent', 'description', 'ctaLabel']) {
        if (!String(hero?.[field] || '').trim()) errors.push(`${EDITORIAL_PATH}: hero.${field} is required`);
    }
    await validateEditorialAsset(rootDir, hero?.image, 'hero.image', errors);

    for (const field of ['title', 'description', 'repositoryUrl', 'feedbackUrl']) {
        if (!String(about?.[field] || '').trim()) errors.push(`${EDITORIAL_PATH}: about.${field} is required`);
    }
    for (const field of ['repositoryUrl', 'feedbackUrl']) {
        const value = String(about?.[field] || '');
        if (value && !value.startsWith('https://')) {
            errors.push(`${EDITORIAL_PATH}: about.${field} must use HTTPS`);
        }
    }

    if (!subscription || typeof subscription !== 'object') {
        errors.push(`${EDITORIAL_PATH}: subscription is required`);
    } else {
        const formAction = String(subscription.formAction || '').trim();
        if (formAction && !formAction.startsWith('https://')) {
            errors.push(`${EDITORIAL_PATH}: subscription.formAction must use HTTPS`);
        }
        if (subscription.enabled === true && !formAction) {
            errors.push(`${EDITORIAL_PATH}: enabled subscription requires an HTTPS formAction`);
        }
        if (typeof subscription.enabled !== 'boolean') {
            errors.push(`${EDITORIAL_PATH}: subscription.enabled must be boolean`);
        }
        if (subscription.enabled === false && !String(subscription.disabledMessage || '').trim()) {
            errors.push(`${EDITORIAL_PATH}: disabled subscription requires disabledMessage`);
        }
    }

    const seenIds = new Set();
    for (const collectionName of ['news', 'reviews']) {
        const entries = editorial?.[collectionName];
        if (!Array.isArray(entries)) {
            errors.push(`${EDITORIAL_PATH}: ${collectionName} must be an array`);
            continue;
        }

        for (const entry of entries) {
            const id = String(entry?.id || '').trim();
            if (!id) errors.push(`${EDITORIAL_PATH}: ${collectionName} entry id is required`);
            else if (seenIds.has(id)) errors.push(`${EDITORIAL_PATH}: duplicate editorial id ${id}`);
            else seenIds.add(id);

            for (const field of ['label', 'title', 'summary', 'categoryId', 'itemId']) {
                if (!String(entry?.[field] || '').trim()) {
                    errors.push(`${EDITORIAL_PATH}: ${collectionName}.${id || 'unknown'}.${field} is required`);
                }
            }
            if (!isValidDateString(entry?.publishedAt)) {
                errors.push(`${EDITORIAL_PATH}: ${collectionName}.${id || 'unknown'}.publishedAt is invalid`);
            }
            if (collectionName === 'reviews' && !String(entry?.byline || '').trim()) {
                errors.push(`${EDITORIAL_PATH}: reviews.${id || 'unknown'}.byline is required`);
            }

            await validateEditorialAsset(rootDir, entry?.image, `${collectionName}.${id || 'unknown'}.image`, errors);
            const items = categoryItems.get(entry?.categoryId);
            if (!items) {
                errors.push(`${EDITORIAL_PATH}: ${collectionName}.${id || 'unknown'} references unknown category ${entry?.categoryId}`);
            } else if (!itemCollectionHasId(items, entry?.itemId)) {
                errors.push(`${EDITORIAL_PATH}: ${collectionName}.${id || 'unknown'} references missing item ${entry?.itemId}`);
            }
        }
    }
}

export async function validateData(options = {}) {
    const rootDir = path.resolve(options.rootDir || DEFAULT_ROOT_DIR);
    const baselineRef = options.baselineRef === undefined ? 'HEAD' : options.baselineRef;
    const posterRoot = options.posterRoot ? path.resolve(options.posterRoot) : null;
    const baselineRoot = options.baselineRoot ? path.resolve(options.baselineRoot) : posterRoot || rootDir;
    const allowLargeDrop = Boolean(options.allowLargeDrop);
    const now = options.now ? new Date(options.now) : new Date();
    const errors = [];
    const warnings = [];
    const categories = [];
    const categoryCounts = new Map();
    const categoryItems = new Map();

    for (const spec of CATEGORY_SPECS) {
        const latestPath = `json/${spec.id}_latest.json`;
        const completePath = `json/${spec.id}_complete.json`;
        const latestPayload = await readJsonFile(rootDir, latestPath);
        const completePayload = await readJsonFile(rootDir, completePath);
        const latestItems = latestPayload?.[spec.key];
        const completeItems = completePayload?.[spec.key];

        if (!Array.isArray(latestItems)) errors.push(`${latestPath}: missing ${spec.key} array`);
        if (!Array.isArray(completeItems)) errors.push(`${completePath}: missing ${spec.key} array`);
        if (!Array.isArray(latestItems) || !Array.isArray(completeItems)) continue;
        if (latestItems.length === 0) errors.push(`${latestPath}: collection is empty`);
        if (completeItems.length === 0) errors.push(`${completePath}: collection is empty`);

        const latestIds = validateUniqueIds(spec, 'latest', latestItems, errors);
        const completeIds = validateUniqueIds(spec, 'complete', completeItems, errors);
        for (const id of latestIds) {
            if (!completeIds.has(id)) errors.push(`${spec.id}: latest id ${id} is missing from complete`);
        }

        await validatePosterPaths(rootDir, posterRoot, spec, completeItems, errors);
        validateVerifiedDoubanLinks(spec, completeItems, errors);
        validateFutureDates(spec, completeItems, warnings, now);

        const baselinePayload = readBaselineJson(baselineRoot, baselineRef, completePath);
        const baselineItems = Array.isArray(baselinePayload?.[spec.key]) ? baselinePayload[spec.key] : null;
        if (baselineItems?.length) {
            const dropRate = (baselineItems.length - completeItems.length) / baselineItems.length;
            if (dropRate > DROP_FAILURE_THRESHOLD && !allowLargeDrop) {
                errors.push(
                    `${spec.id}: complete count dropped ${(dropRate * 100).toFixed(1)}% ` +
                        `(${baselineItems.length} -> ${completeItems.length})`
                );
            }

            const currentQuality = computeQuality(spec.kind, completeItems);
            const baselineQuality = computeQuality(spec.kind, baselineItems);
            for (const field of ['rating', 'douban_link']) {
                const increase = currentQuality[field] - baselineQuality[field];
                if (increase > QUALITY_WARNING_THRESHOLD) {
                    warnings.push(`${spec.id}: missing ${field} increased ${(increase * 100).toFixed(1)} percentage points`);
                }
            }
        }

        categories.push({ id: spec.id, latest: latestItems.length, complete: completeItems.length });
        categoryCounts.set(spec.id, { latest: latestItems.length, complete: completeItems.length });
        categoryItems.set(spec.id, completeItems);
    }

    for (const relativePath of REQUIRED_AUXILIARY_FILES) {
        const payload = await readJsonFile(rootDir, relativePath);
        if (!payload || typeof payload !== 'object') errors.push(`${relativePath}: expected an object payload`);
    }

    const top250 = await readJsonFile(rootDir, 'json/douban_top250.json');
    if (!Array.isArray(top250.movies) || top250.movies.length === 0) errors.push('douban_top250: movies collection is empty');
    if (Array.isArray(top250.movies)) categoryItems.set('douban_top250', top250.movies);

    // Staged data runs only copy json/; their --poster-root points back to the project
    // and therefore remains the source of truth for hand-maintained content and assets.
    const editorialRoot = posterRoot || rootDir;
    await validateEditorialContent(editorialRoot, categoryItems, errors);

    const statuses = await readJsonFile(rootDir, 'json/douban_statuses.json');
    if (!statuses.statuses || typeof statuses.statuses !== 'object') errors.push('douban_statuses: missing statuses object');

    const buildReport = await readJsonFile(rootDir, 'json/build_report.json');
    if (!Array.isArray(buildReport.categories)) errors.push('build_report: categories must be an array');
    if (buildReport.schema_version !== 2) errors.push('build_report: schema_version must be 2');
    if (!buildReport.latest_run || typeof buildReport.latest_run !== 'object') {
        errors.push('build_report: missing latest_run object');
    }
    if (!buildReport.task_statuses || typeof buildReport.task_statuses !== 'object') {
        errors.push('build_report: missing task_statuses object');
    }
    const reportCategoryIds = new Set((buildReport.categories || []).map((entry) => entry?.id));
    for (const spec of CATEGORY_SPECS) {
        if (!reportCategoryIds.has(spec.id)) errors.push(`build_report: missing category ${spec.id}`);
        const reportEntry = (buildReport.categories || []).find((entry) => entry?.id === spec.id);
        const expectedCounts = categoryCounts.get(spec.id);
        if (!reportEntry || !expectedCounts) continue;
        if (reportEntry.counts?.latest !== expectedCounts.latest) {
            errors.push(`build_report: ${spec.id} latest count is stale`);
        }
        if (reportEntry.counts?.complete !== expectedCounts.complete) {
            errors.push(`build_report: ${spec.id} complete count is stale`);
        }
        if (reportEntry.quality?.total_items !== expectedCounts.complete) {
            errors.push(`build_report: ${spec.id} quality total is stale`);
        }
    }

    return { errors, warnings, categories };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const options = parseArguments(process.argv.slice(2));
    const result = await validateData(options);
    for (const warning of result.warnings) console.warn(`WARNING: ${warning}`);
    for (const error of result.errors) console.error(`ERROR: ${error}`);
    for (const category of result.categories) {
        console.log(`${category.id}: latest=${category.latest} complete=${category.complete}`);
    }
    if (result.errors.length > 0) process.exitCode = 1;
    else console.log(`Data validation passed (${result.warnings.length} warnings).`);
}
