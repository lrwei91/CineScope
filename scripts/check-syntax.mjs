#!/usr/bin/env node

import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOT_FILES = ['app.js', 'share.js'];
const SOURCE_DIRS = ['js', 'scripts'];

async function collectJavaScriptFiles(relativeDir) {
    const absoluteDir = path.join(ROOT_DIR, relativeDir);
    const entries = await readdir(absoluteDir, { withFileTypes: true });
    const files = [];

    for (const entry of entries) {
        const relativePath = path.join(relativeDir, entry.name);
        if (entry.isDirectory()) {
            files.push(...(await collectJavaScriptFiles(relativePath)));
        } else if (entry.isFile() && /\.(?:js|mjs)$/.test(entry.name)) {
            files.push(relativePath);
        }
    }

    return files;
}

const sourceGroups = await Promise.all(SOURCE_DIRS.map(collectJavaScriptFiles));
const files = [...ROOT_FILES, ...sourceGroups.flat()].sort();

for (const file of files) {
    const result = spawnSync(process.execPath, ['--check', file], {
        cwd: ROOT_DIR,
        encoding: 'utf8'
    });
    if (result.status !== 0) {
        process.stderr.write(result.stderr || result.stdout || `Syntax check failed: ${file}\n`);
        process.exit(result.status || 1);
    }
}

console.log(`Syntax check passed (${files.length} files).`);
