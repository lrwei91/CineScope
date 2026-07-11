import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '../..');
const OUTPUT_ROOT = path.resolve(process.env.CINESCOPE_OUTPUT_ROOT || ROOT_DIR);

export async function writeJson(relativePath, payload) {
    const targetPath = path.resolve(OUTPUT_ROOT, relativePath);
    await mkdir(path.dirname(targetPath), { recursive: true });
    await writeFile(targetPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

export async function readJson(relativePath, fallbackValue = null) {
    const targetPath = path.resolve(OUTPUT_ROOT, relativePath);

    try {
        return JSON.parse(await readFile(targetPath, 'utf8'));
    } catch (error) {
        if (error?.code === 'ENOENT' && OUTPUT_ROOT !== ROOT_DIR) {
            try {
                return JSON.parse(await readFile(path.resolve(ROOT_DIR, relativePath), 'utf8'));
            } catch (fallbackError) {
                if (fallbackError?.code !== 'ENOENT') throw fallbackError;
            }
        }
        if (error?.code === 'ENOENT') return fallbackValue;

        throw error;
    }
}
