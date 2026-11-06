/**
 * Funcam Booth — Sticker Seed (13 Pixel stickers)
 * Exact IDs, names and pixel dimensions from the binary seed table.
 * Numbers 2, 4, 5, 7, 8, 9 are absent — do not invent.
 */

export interface FuncamSticker {
	/** Internal DB id (from seed). */
	dbId: number;
	/** Display name. */
	name: string;
	/** File base name under static/stickers/Pixel/. */
	file: string;
	/** Pixel width × height (height is always ~200). */
	size: { w: number; h: number };
	/** Whether this sticker is active. */ active: boolean;
}

export const FUNCAM_STICKERS: FuncamSticker[] = [
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

/** Return only active stickers. */
export function getActiveStickers() {
	return FUNCAM_STICKERS.filter((s) => s.active);
}

/** Get a sticker by display name. */
export function findStickerByName(name: string): FuncamSticker | undefined {
	return FUNCAM_STICKERS.find((s) => s.name === name);
}
