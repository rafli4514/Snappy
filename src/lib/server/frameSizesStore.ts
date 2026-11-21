import path from 'node:path';
import type { StandardFormat } from '#lib/data/standardFormats';
import { CACHE_DIR, readCacheJson, writeCacheJson } from './cacheDir';

const FILE = path.join(CACHE_DIR, '_custom_frame_sizes.json');

export interface CustomFrameSize extends StandardFormat {
	source: 'custom';
	editable: true;
	createdAt: string;
	updatedAt: string;
}

function readAll(): CustomFrameSize[] {
	const data = readCacheJson<unknown>(FILE, []);
	return Array.isArray(data) ? (data as CustomFrameSize[]) : [];
}

function writeAll(items: CustomFrameSize[]): void {
	writeCacheJson(FILE, items);
}

export function listCustomFrameSizes(): CustomFrameSize[] {
	return readAll().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function getCustomFrameSize(id: string): CustomFrameSize | null {
	return readAll().find((x) => x.id === id) ?? null;
}

export function upsertCustomFrameSize(
	input: Omit<CustomFrameSize, 'source' | 'editable' | 'createdAt' | 'updatedAt'> & {
		createdAt?: string;
	}
): CustomFrameSize {
	const now = new Date().toISOString();
	const items = readAll();
	const idx = items.findIndex((x) => x.id === input.id);
	const prev = idx >= 0 ? items[idx] : null;
	const next: CustomFrameSize = {
		...input,
		ratio: input.ratio ?? (input.pxW > 0 && input.pxH > 0 ? input.pxW / input.pxH : 1),
		source: 'custom',
		editable: true,
		createdAt: prev?.createdAt ?? input.createdAt ?? now,
		updatedAt: now
	};
	if (idx >= 0) items[idx] = next;
	else items.push(next);
	writeAll(items);
	return next;
}

export function deleteCustomFrameSize(id: string): boolean {
	const items = readAll();
	const next = items.filter((x) => x.id !== id);
	if (next.length === items.length) return false;
	writeAll(next);
	return true;
}
