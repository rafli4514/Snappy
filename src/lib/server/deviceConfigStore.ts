import path from 'node:path';
import { CACHE_DIR, readCacheJson, writeCacheJson } from './cacheDir';

export type PrintMode = 'browser' | 'direct';
export type PrintLayoutMode = 'fit' | 'fill' | 'stretch';
export type PrintSplitMode = 'none' | '2-strip';

export interface PrintDeviceConfig {
	printMode: PrintMode;
	printerName: string;
	layoutMode: PrintLayoutMode;
	splitMode: PrintSplitMode;
	autoRotate: boolean;
	copies: number;
	fallbackToBrowser: boolean;
	updatedAt: string;
}

const FILE = path.join(CACHE_DIR, '_device_config.json');

export const DEFAULT_PRINT_CONFIG: PrintDeviceConfig = {
	printMode: 'browser',
	printerName: '',
	layoutMode: 'fit',
	splitMode: 'none',
	autoRotate: true,
	copies: 1,
	fallbackToBrowser: true,
	updatedAt: ''
};

export function sanitizePrintConfig(
	input: Partial<PrintDeviceConfig> | null | undefined,
	base: PrintDeviceConfig = DEFAULT_PRINT_CONFIG
): PrintDeviceConfig {
	const raw = input && typeof input === 'object' ? input : {};
	const printMode: PrintMode =
		raw.printMode === 'direct' || raw.printMode === 'browser' ? raw.printMode : base.printMode;
	const layoutMode: PrintLayoutMode =
		raw.layoutMode === 'fit' || raw.layoutMode === 'fill' || raw.layoutMode === 'stretch'
			? raw.layoutMode
			: base.layoutMode;
	const splitMode: PrintSplitMode =
		raw.splitMode === 'none' || raw.splitMode === '2-strip' ? raw.splitMode : base.splitMode;
	const printerName =
		typeof raw.printerName === 'string' ? raw.printerName.trim().slice(0, 140) : base.printerName;
	const copiesNum = Number(raw.copies);
	const copies = Number.isFinite(copiesNum)
		? Math.max(1, Math.min(10, Math.round(copiesNum)))
		: base.copies;

	return {
		printMode,
		printerName,
		layoutMode,
		splitMode,
		autoRotate: typeof raw.autoRotate === 'boolean' ? raw.autoRotate : base.autoRotate,
		copies,
		fallbackToBrowser:
			typeof raw.fallbackToBrowser === 'boolean' ? raw.fallbackToBrowser : base.fallbackToBrowser,
		updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : base.updatedAt
	};
}

export function getDeviceConfig(): PrintDeviceConfig {
	const saved = readCacheJson<Partial<PrintDeviceConfig> | null>(FILE, null);
	return sanitizePrintConfig(saved, DEFAULT_PRINT_CONFIG);
}

export function saveDeviceConfig(patch: Partial<PrintDeviceConfig>): PrintDeviceConfig {
	const current = getDeviceConfig();
	const next = sanitizePrintConfig({ ...patch, updatedAt: new Date().toISOString() }, current);
	writeCacheJson(FILE, next);
	return next;
}
