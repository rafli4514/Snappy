/**
 * Seed aset stiker (13 aset pixel)
 * ID, nama, dan dimensi px dari tabel seed.
 * Angka 2, 4, 5, 7, 8, 9 tidak ada — jangan dibuat.
 */

export interface StickerAsset {
	/** Internal DB id (from seed). */
	dbId: number;
	/** Display name. */
	name: string;
	/** File base name under static/stickers/Pixel/. */
	file: string;
	/** Pixel width × height (height is always ~200). */
	size: { w: number; h: number };
	/** Whether this sticker is active. */
	active: boolean;
	/** Kategori sticker (mis. 'Vintage') untuk tab pemilihan. */
	category?: string;
}

export const STICKER_ASSETS: StickerAsset[] = [
	{ dbId: 10, name: 'Sticker 1', file: 'Sticker 1.webp', size: { w: 212, h: 200 }, active: true },
	{ dbId: 12, name: 'Sticker 3', file: '3.webp', size: { w: 202, h: 200 }, active: true },
	{ dbId: 15, name: 'Sticker 6', file: '6.webp', size: { w: 202, h: 200 }, active: true },
	{ dbId: 28, name: 'Sticker 10', file: '10.webp', size: { w: 224, h: 200 }, active: true },
	{ dbId: 29, name: 'Sticker 11', file: '11.webp', size: { w: 206, h: 200 }, active: true },
	{ dbId: 30, name: 'Sticker 12', file: '12.webp', size: { w: 249, h: 200 }, active: true },
	{ dbId: 31, name: 'Sticker 13', file: '13.webp', size: { w: 203, h: 200 }, active: true },
	{ dbId: 32, name: 'Sticker 14', file: '14.webp', size: { w: 211, h: 200 }, active: true },
	{ dbId: 33, name: 'Sticker 15', file: '15.webp', size: { w: 200, h: 204 }, active: true },
	{ dbId: 34, name: 'Sticker 16', file: '16.webp', size: { w: 234, h: 200 }, active: true },
	{ dbId: 35, name: 'Sticker 17', file: '17.webp', size: { w: 280, h: 200 }, active: true },
	{ dbId: 36, name: 'Sticker 18', file: '18.webp', size: { w: 257, h: 200 }, active: true },
	{ dbId: 37, name: 'Sticker 19', file: '19.webp', size: { w: 217, h: 200 }, active: true }
];

/** Aset stiker pack Vintage dari folder VINTAGE STICKER PACK. */
export const VINTAGE_STICKER_ASSETS: StickerAsset[] = [
	{
		dbId: 101,
		name: 'Vintage Sticker 10',
		file: 'vintage-sticker-10.png',
		size: { w: 736, h: 673 },
		active: true,
		category: 'Vintage'
	},
	{
		dbId: 102,
		name: 'Vintage Sticker 11',
		file: 'vintage-sticker-11.png',
		size: { w: 600, h: 600 },
		active: true,
		category: 'Vintage'
	},
	{
		dbId: 103,
		name: 'Vintage Sticker 12',
		file: 'vintage-sticker-12.png',
		size: { w: 650, h: 882 },
		active: true,
		category: 'Vintage'
	},
	{
		dbId: 104,
		name: 'Vintage Sticker 13',
		file: 'vintage-sticker-13.png',
		size: { w: 600, h: 600 },
		active: true,
		category: 'Vintage'
	},
	{
		dbId: 105,
		name: 'Vintage Sticker 14',
		file: 'vintage-sticker-14.png',
		size: { w: 600, h: 600 },
		active: true,
		category: 'Vintage'
	},
	{
		dbId: 106,
		name: 'Vintage Sticker 20',
		file: 'vintage-sticker-20.png',
		size: { w: 2100, h: 1500 },
		active: true,
		category: 'Vintage'
	},
	{
		dbId: 107,
		name: 'Vintage Sticker 21',
		file: 'vintage-sticker-21.png',
		size: { w: 1000, h: 931 },
		active: true,
		category: 'Vintage'
	},
	{
		dbId: 108,
		name: 'Vintage Sticker 22',
		file: 'vintage-sticker-22.png',
		size: { w: 269, h: 267 },
		active: true,
		category: 'Vintage'
	},
	{
		dbId: 109,
		name: 'Vintage Sticker 23',
		file: 'vintage-sticker-23.png',
		size: { w: 1671, h: 1671 },
		active: true,
		category: 'Vintage'
	},
	{
		dbId: 110,
		name: 'Vintage Sticker 24',
		file: 'vintage-sticker-24.png',
		size: { w: 2095, h: 1780 },
		active: true,
		category: 'Vintage'
	},
	{
		dbId: 111,
		name: 'Vintage Sticker 31',
		file: 'vintage-sticker-31.png',
		size: { w: 423, h: 590 },
		active: true,
		category: 'Vintage'
	},
	{
		dbId: 112,
		name: 'Vintage Sticker 32',
		file: 'vintage-sticker-32.png',
		size: { w: 5116, h: 3600 },
		active: true,
		category: 'Vintage'
	},
	{
		dbId: 113,
		name: 'Vintage Sticker 33',
		file: 'vintage-sticker-33.png',
		size: { w: 1500, h: 493 },
		active: true,
		category: 'Vintage'
	},
	{
		dbId: 114,
		name: 'Vintage Sticker 34',
		file: 'vintage-sticker-34.png',
		size: { w: 503, h: 2200 },
		active: true,
		category: 'Vintage'
	}
];

/** Kategori sticker yang tersedia untuk dipilih di tab alat. */
export const STICKER_CATEGORIES: { key: string; label: string }[] = [
	{ key: 'Vintage', label: 'Vintage' }
];

/** Stiker aktif per kategori. */
export function getStickersByCategory(category: string): StickerAsset[] {
	return STICKER_ASSETS.concat(VINTAGE_STICKER_ASSETS).filter(
		(s) => s.active && s.category === category
	);
}

/** Return only active stickers. */
export function getActiveStickers() {
	return STICKER_ASSETS.filter((s) => s.active);
}

/** Get a sticker by display name. */
export function findStickerByName(name: string): StickerAsset | undefined {
	return STICKER_ASSETS.find((s) => s.name === name);
}
