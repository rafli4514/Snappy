import fs from 'node:fs';
import path from 'node:path';

/** Shared `.gallery_cache` folder used by server-side JSON stores and uploaded assets. */
export const CACHE_DIR = path.resolve('.gallery_cache');

/** Ensure `.gallery_cache` (or given subdirectories) exists before reading/writing. */
export function ensureCacheDir(...dirs: string[]): void {
	const targets = dirs.length > 0 ? dirs : [CACHE_DIR];
	for (const dir of targets) {
		try {
			if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
		} catch {
			// Ignore — disk may be read-only on some hosts
		}
	}
}

/** Read a JSON file inside `.gallery_cache`, returning `fallback` if missing or corrupt. */
export function readCacheJson<T>(file: string, fallback: T, dirs: string[] = []): T {
	ensureCacheDir(...dirs);
	try {
		if (!fs.existsSync(file)) return fallback;
		return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
	} catch {
		return fallback;
	}
}

/** Write formatted JSON to a file inside `.gallery_cache`. */
export function writeCacheJson(file: string, data: unknown, dirs: string[] = []): void {
	ensureCacheDir(...dirs);
	fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}
