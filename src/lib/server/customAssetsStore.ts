import fs from 'node:fs';
import path from 'node:path';
import type { PhotoFilter } from '#lib/data/filters';
import type { StickerAsset } from '#lib/data/stickers';
import { CACHE_DIR, ensureCacheDir, readCacheJson, writeCacheJson } from './cacheDir';

const ASSETS_DIR = path.join(CACHE_DIR, 'custom-assets');
const STICKERS_DIR = path.join(ASSETS_DIR, 'stickers');
const AR_DIR = path.join(ASSETS_DIR, 'ar');
const STICKERS_META = path.join(CACHE_DIR, '_custom_stickers.json');
const FILTERS_META = path.join(CACHE_DIR, '_custom_filters.json');
const AR_META = path.join(CACHE_DIR, '_custom_ar.json');

interface CustomSticker extends StickerAsset {
	source: 'custom';
	url: string;
	enabled: boolean;
	createdAt: string;
	updatedAt: string;
}

interface CustomFilter extends PhotoFilter {
	source: 'custom';
	enabled: boolean;
	createdAt: string;
	updatedAt: string;
}

export interface CustomArAsset {
	id: string;
	name: string;
	file: string;
	url: string;
	mime: string;
	width?: number;
	height?: number;
	enabled: boolean;
	createdAt: string;
	updatedAt: string;
}

function ensureDirs(): void {
	ensureCacheDir(CACHE_DIR, ASSETS_DIR, STICKERS_DIR, AR_DIR);
}

function readJson<T>(file: string, fallback: T): T {
	return readCacheJson(file, fallback, [CACHE_DIR, ASSETS_DIR, STICKERS_DIR, AR_DIR]);
}

function writeJson(file: string, data: unknown): void {
	writeCacheJson(file, data, [CACHE_DIR, ASSETS_DIR, STICKERS_DIR, AR_DIR]);
}

function safeName(name: string): string {
	const base = path
		.basename(name)
		.replace(/[^a-zA-Z0-9._-]+/g, '-')
		.replace(/^-+|-+$/g, '');
	return base || `asset-${Date.now()}`;
}

function uid(prefix: string): string {
	return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function listCustomStickers(): CustomSticker[] {
	return readJson<CustomSticker[]>(STICKERS_META, []).sort((a, b) =>
		(b.updatedAt || '').localeCompare(a.updatedAt || '')
	);
}
export function upsertCustomSticker(
	input: Partial<CustomSticker> & { name?: string; file?: string }
): CustomSticker {
	const now = new Date().toISOString();
	const items = readJson<CustomSticker[]>(STICKERS_META, []);
	const id =
		typeof input.dbId === 'number' && input.dbId >= 100000
			? input.dbId
			: 100000 + Math.floor(Math.random() * 900000);
	const file = safeName(input.file || input.name || `sticker-${id}.png`);
	const prev = items.find((x) => x.dbId === id || x.file === file);
	const next: CustomSticker = {
		dbId: prev?.dbId ?? id,
		name: (input.name || prev?.name || file).slice(0, 80),
		file,
		size: input.size ?? prev?.size ?? { w: 200, h: 200 },
		active: input.active ?? prev?.active ?? true,
		category: input.category || 'Custom',
		source: 'custom',
		url: `/api/assets/stickers/${encodeURIComponent(file)}`,
		enabled: input.enabled ?? prev?.enabled ?? true,
		createdAt: prev?.createdAt ?? now,
		updatedAt: now
	};
	const idx = items.findIndex((x) => x.dbId === next.dbId);
	if (idx >= 0) items[idx] = next;
	else items.push(next);
	writeJson(STICKERS_META, items);
	return next;
}
export function deleteCustomSticker(dbId: number): boolean {
	const items = readJson<CustomSticker[]>(STICKERS_META, []);
	const item = items.find((x) => x.dbId === dbId);
	const next = items.filter((x) => x.dbId !== dbId);
	if (next.length === items.length) return false;
	writeJson(STICKERS_META, next);
	if (item?.file) {
		try {
			const p = path.join(STICKERS_DIR, path.basename(item.file));
			if (fs.existsSync(p)) fs.unlinkSync(p);
		} catch {
			// ignore
		}
	}
	return true;
}
export function saveStickerFile(fileName: string, data: Buffer): string {
	ensureDirs();
	const name = safeName(fileName);
	fs.writeFileSync(path.join(STICKERS_DIR, name), data);
	return name;
}

export function listCustomFilters(): CustomFilter[] {
	return readJson<CustomFilter[]>(FILTERS_META, []).sort((a, b) =>
		(b.updatedAt || '').localeCompare(a.updatedAt || '')
	);
}
export function upsertCustomFilter(input: Partial<CustomFilter> & { key?: string }): CustomFilter {
	const now = new Date().toISOString();
	const items = readJson<CustomFilter[]>(FILTERS_META, []);
	const key =
		(input.key || '')
			.trim()
			.toLowerCase()
			.replace(/[^a-z0-9_-]+/g, '-') || uid('filter');
	const prev = items.find((x) => x.key === key);
	const next: CustomFilter = {
		key,
		name: (input.name || prev?.name || key).slice(0, 80),
		category: (input.category as CustomFilter['category']) || prev?.category || 'Fun',
		cssFilter: input.cssFilter ?? prev?.cssFilter ?? '',
		ffmpeg: input.ffmpeg ?? prev?.ffmpeg ?? '',
		source: 'custom',
		enabled: input.enabled ?? prev?.enabled ?? true,
		createdAt: prev?.createdAt ?? now,
		updatedAt: now
	};
	const idx = items.findIndex((x) => x.key === next.key);
	if (idx >= 0) items[idx] = next;
	else items.push(next);
	writeJson(FILTERS_META, items);
	return next;
}
export function deleteCustomFilter(key: string): boolean {
	const items = readJson<CustomFilter[]>(FILTERS_META, []);
	const next = items.filter((x) => x.key !== key);
	if (next.length === items.length) return false;
	writeJson(FILTERS_META, next);
	return true;
}

export function listCustomAr(): CustomArAsset[] {
	return readJson<CustomArAsset[]>(AR_META, []).sort((a, b) =>
		(b.updatedAt || '').localeCompare(a.updatedAt || '')
	);
}
export function upsertCustomAr(
	input: Partial<CustomArAsset> & { name?: string; file?: string }
): CustomArAsset {
	const now = new Date().toISOString();
	const items = readJson<CustomArAsset[]>(AR_META, []);
	const file = safeName(input.file || input.name || `ar-${Date.now()}.png`);
	const prev = items.find((x) => x.id === input.id || x.file === file);
	const id = prev?.id || input.id || uid('ar');
	const next: CustomArAsset = {
		id,
		name: (input.name || prev?.name || file).slice(0, 80),
		file,
		url: `/api/assets/ar/${encodeURIComponent(file)}`,
		mime: input.mime || prev?.mime || 'image/png',
		width: input.width ?? prev?.width,
		height: input.height ?? prev?.height,
		enabled: input.enabled ?? prev?.enabled ?? true,
		createdAt: prev?.createdAt ?? now,
		updatedAt: now
	};
	const idx = items.findIndex((x) => x.id === next.id);
	if (idx >= 0) items[idx] = next;
	else items.push(next);
	writeJson(AR_META, items);
	return next;
}
export function deleteCustomAr(id: string): boolean {
	const items = readJson<CustomArAsset[]>(AR_META, []);
	const item = items.find((x) => x.id === id);
	const next = items.filter((x) => x.id !== id);
	if (next.length === items.length) return false;
	writeJson(AR_META, next);
	if (item?.file) {
		try {
			const p = path.join(AR_DIR, path.basename(item.file));
			if (fs.existsSync(p)) fs.unlinkSync(p);
		} catch {
			// ignore
		}
	}
	return true;
}
export function saveArFile(fileName: string, data: Buffer): string {
	ensureDirs();
	const name = safeName(fileName);
	fs.writeFileSync(path.join(AR_DIR, name), data);
	return name;
}

export function resolveAssetPath(kind: 'stickers' | 'ar', file: string): string | null {
	const base = kind === 'stickers' ? STICKERS_DIR : AR_DIR;
	const name = path.basename(file);
	const full = path.join(base, name);
	if (!full.startsWith(base)) return null;
	return full;
}
