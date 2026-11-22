/**
 * Katalog Standard Photobooth — 6 format cetak 300 DPI aktif (sesuai pilihan di /strip).
 *
 * Satu sumber kebenaran untuk:
 *  - /dashboard/assets/frame-sizes (katalog & kelola ukuran frame)
 *  - /strip                        (tamu pilih format + jumlah foto)
 *  - print                         (@page ukuran cetak mengikuti format)
 *
 * Ukuran px = cm ÷ 2,54 × 300 (300 DPI), dibulatkan genap.
 */

import type { ProductSpec, Products } from '#lib/types';

type FormatKind = 'print' | 'digital';

export interface StandardFormat {
	id: string;
	/** Nama lengkap untuk judul katalog & footer cetak. */
	label: string;
	kind: FormatKind;
	pxW: number;
	pxH: number;
	cm: string;
	/** Lebar / tinggi — dipakai deteksi kategori saat upload. */
	ratio: number;
	/** Jumlah foto yang boleh dipilih tamu. */
	photos: number[];
	defaultCount: number;
	/** Thumbnail contoh kustom (data URL PNG/WebP/JPEG) yang diunggah admin. */
	thumbnail?: string;
}

export const BUILTIN_FORMATS: StandardFormat[] = [
	{
		id: '2x6',
		label: '2×6 · Single Strip',
		kind: 'print',
		pxW: 600,
		pxH: 1800,
		cm: '5,08 × 15,24 cm',
		ratio: 600 / 1800,
		photos: [3, 4],
		defaultCount: 4
	},
	{
		id: '2x8',
		label: '2×8 · Tall Strip',
		kind: 'print',
		pxW: 600,
		pxH: 2400,
		cm: '5,08 × 20,32 cm',
		ratio: 600 / 2400,
		photos: [4, 5],
		defaultCount: 4
	},
	{
		id: '4r-double',
		label: '4R · Double Strip',
		kind: 'print',
		pxW: 1200,
		pxH: 1800,
		cm: '10,16 × 15,24 cm (dipotong jadi dua strip)',
		ratio: 1200 / 1800,
		photos: [4, 6],
		defaultCount: 4
	},
	{
		id: '3r',
		label: '3R · Portrait',
		kind: 'print',
		pxW: 1050,
		pxH: 1500,
		cm: '8,89 × 12,7 cm',
		ratio: 1050 / 1500,
		photos: [3],
		defaultCount: 3
	},
	{
		id: '5r',
		label: '5R · Portrait',
		kind: 'print',
		pxW: 1500,
		pxH: 2100,
		cm: '12,7 × 17,78 cm',
		ratio: 1500 / 2100,
		photos: [4],
		defaultCount: 4
	},
	{
		id: 'square',
		label: 'Square · 1:1',
		kind: 'print',
		pxW: 1200,
		pxH: 1200,
		cm: '10,16 × 10,16 cm',
		ratio: 1,
		photos: [4],
		defaultCount: 4
	}
];

/** Back-compat alias. */
export const STANDARD_FORMATS: StandardFormat[] = BUILTIN_FORMATS;

/** Custom frame sizes (runtime). Built-in IDs are never overridden. */
let _customFormats: StandardFormat[] = [];
export function setCustomFormats(formats: StandardFormat[]): void {
	const builtin = new Set(BUILTIN_FORMATS.map((f) => f.id));
	_customFormats = (formats || []).filter((f) => f && f.id && !builtin.has(f.id));
}
export function allFormats(): StandardFormat[] {
	return [...BUILTIN_FORMATS, ..._customFormats];
}

export const DEFAULT_FORMAT_ID = '2x6';

export function formatById(id: string | null | undefined): StandardFormat {
	const all = allFormats();
	return all.find((f) => f.id === id) ?? BUILTIN_FORMATS[0];
}

/** Rasio cocok ±1% — sama seperti validasi Frame Studio. */
export function detectFormat(width: number, height: number): StandardFormat | null {
	if (width <= 0 || height <= 0) return null;
	const actual = width / height;
	return allFormats().find((f) => Math.abs(actual / f.ratio - 1) <= 0.01) ?? null;
}

/** Generate a default ProductSpec layout for any format + photo count (used for custom sizes). */
export function generateCustomSpec(format: StandardFormat, count: number): ProductSpec {
	const W = Math.max(200, Math.round(format.pxW));
	const H = Math.max(200, Math.round(format.pxH));
	const landscape = W >= H;
	const margin = Math.max(16, Math.round(Math.min(W, H) * 0.03));
	const hairline = Math.max(6, Math.round(Math.min(W, H) * 0.01));
	const gap = Math.max(8, Math.round(Math.min(W, H) * 0.015));
	const footer = Math.max(60, Math.round(H * 0.08));
	const innerW = Math.max(40, W - margin * 2);
	const innerH = Math.max(40, H - margin * 2 - footer);
	let rows: ProductSpec['rows'];
	if (count <= 1) {
		rows = [{ h: innerH, cells: [{ w: innerW }] }];
	} else if (landscape) {
		const cellW = Math.max(20, Math.floor((innerW - gap * (count - 1)) / count));
		rows = [{ h: innerH, cells: Array.from({ length: count }, () => ({ w: cellW })) }];
	} else if (count === 2) {
		const rowH = Math.max(20, Math.floor((innerH - gap) / 2));
		rows = [
			{ h: rowH, cells: [{ w: innerW }] },
			{ h: rowH, cells: [{ w: innerW }] }
		];
	} else if (count === 4 && W / H > 0.55) {
		const rowH = Math.max(20, Math.floor((innerH - gap) / 2));
		const colW = Math.max(20, Math.floor((innerW - gap) / 2));
		rows = [
			{ h: rowH, cells: [{ w: colW }, { w: colW }] },
			{ h: rowH, cells: [{ w: colW }, { w: colW }] }
		];
	} else {
		const rowH = Math.max(20, Math.floor((innerH - gap * (count - 1)) / count));
		rows = Array.from({ length: count }, () => ({ h: rowH, cells: [{ w: innerW }] }));
	}
	return {
		nama: format.label.split('·')[0].trim() || format.label,
		cm: format.cm,
		pxW: W,
		pxH: H,
		margin,
		hairline,
		gap,
		footer,
		copySheet: 1,
		sheetOrient: landscape ? 'landscape' : 'portrait',
		rows
	};
}

/** Spec layout slot untuk tiap format & jumlah foto yang diizinkan. */
export const STANDARD_SPECS: Record<string, Products> = {
	'2x6': {
		3: {
			nama: '2×6',
			cm: '5,08 × 15,24 cm',
			pxW: 600,
			pxH: 1800,
			margin: 24,
			hairline: 10,
			gap: 14,
			footer: 120,
			copySheet: 1,
			sheetOrient: 'portrait',
			rows: [
				{ h: 534, cells: [{ w: 552 }] },
				{ h: 534, cells: [{ w: 552 }] },
				{ h: 534, cells: [{ w: 552 }] }
			]
		},
		4: {
			nama: '2×6',
			cm: '5,08 × 15,24 cm',
			pxW: 600,
			pxH: 1800,
			margin: 24,
			hairline: 10,
			gap: 14,
			footer: 120,
			copySheet: 1,
			sheetOrient: 'portrait',
			rows: [
				{ h: 397, cells: [{ w: 552 }] },
				{ h: 397, cells: [{ w: 552 }] },
				{ h: 397, cells: [{ w: 552 }] },
				{ h: 397, cells: [{ w: 552 }] }
			]
		}
	},
	'2x8': {
		4: {
			nama: '2×8',
			cm: '5,08 × 20,32 cm',
			pxW: 600,
			pxH: 2400,
			margin: 24,
			hairline: 10,
			gap: 14,
			footer: 120,
			copySheet: 1,
			sheetOrient: 'portrait',
			rows: [
				{ h: 547, cells: [{ w: 552 }] },
				{ h: 547, cells: [{ w: 552 }] },
				{ h: 547, cells: [{ w: 552 }] },
				{ h: 547, cells: [{ w: 552 }] }
			]
		},
		5: {
			nama: '2×8',
			cm: '5,08 × 20,32 cm',
			pxW: 600,
			pxH: 2400,
			margin: 24,
			hairline: 10,
			gap: 14,
			footer: 120,
			copySheet: 1,
			sheetOrient: 'portrait',
			rows: [
				{ h: 435, cells: [{ w: 552 }] },
				{ h: 435, cells: [{ w: 552 }] },
				{ h: 435, cells: [{ w: 552 }] },
				{ h: 435, cells: [{ w: 552 }] },
				{ h: 435, cells: [{ w: 552 }] }
			]
		},
		6: {
			nama: '2×8',
			cm: '5,08 × 20,32 cm',
			pxW: 600,
			pxH: 2400,
			margin: 24,
			hairline: 10,
			gap: 14,
			footer: 120,
			copySheet: 1,
			sheetOrient: 'portrait',
			rows: [
				{ h: 360, cells: [{ w: 552 }] },
				{ h: 360, cells: [{ w: 552 }] },
				{ h: 360, cells: [{ w: 552 }] },
				{ h: 360, cells: [{ w: 552 }] },
				{ h: 360, cells: [{ w: 552 }] },
				{ h: 360, cells: [{ w: 552 }] }
			]
		}
	},
	'4r-double': {
		4: {
			nama: '4R',
			cm: '10,16 × 15,24 cm',
			pxW: 1200,
			pxH: 1800,
			margin: 24,
			hairline: 12,
			gap: 16,
			footer: 120,
			copySheet: 1,
			sheetOrient: 'portrait',
			cutLine: 'vertical',
			rows: [
				{ h: 396, cells: [{ w: 568 }, { w: 568 }] },
				{ h: 396, cells: [{ w: 568 }, { w: 568 }] },
				{ h: 396, cells: [{ w: 568 }, { w: 568 }] },
				{ h: 396, cells: [{ w: 568 }, { w: 568 }] }
			]
		},
		6: {
			nama: '4R',
			cm: '10,16 × 15,24 cm',
			pxW: 1200,
			pxH: 1800,
			margin: 24,
			hairline: 12,
			gap: 16,
			footer: 120,
			copySheet: 1,
			sheetOrient: 'portrait',
			rows: [
				{ h: 533, cells: [{ w: 568 }, { w: 568 }] },
				{ h: 533, cells: [{ w: 568 }, { w: 568 }] },
				{ h: 533, cells: [{ w: 568 }, { w: 568 }] }
			]
		}
	},
	'3r': {
		1: {
			nama: '3R',
			cm: '8,89 × 12,7 cm',
			pxW: 1050,
			pxH: 1500,
			margin: 26,
			hairline: 10,
			gap: 14,
			footer: 120,
			copySheet: 1,
			sheetOrient: 'portrait',
			rows: [{ h: 1328, cells: [{ w: 998 }] }]
		},
		2: {
			nama: '3R',
			cm: '8,89 × 12,7 cm',
			pxW: 1050,
			pxH: 1500,
			margin: 26,
			hairline: 10,
			gap: 14,
			footer: 120,
			copySheet: 1,
			sheetOrient: 'portrait',
			rows: [
				{ h: 657, cells: [{ w: 998 }] },
				{ h: 657, cells: [{ w: 998 }] }
			]
		},
		3: {
			nama: '3R',
			cm: '8,89 × 12,7 cm',
			pxW: 1050,
			pxH: 1500,
			margin: 26,
			hairline: 10,
			gap: 14,
			footer: 120,
			copySheet: 1,
			sheetOrient: 'portrait',
			rows: [
				{ h: 657, cells: [{ w: 998 }] },
				{ h: 657, cells: [{ w: 492 }, { w: 492 }] }
			]
		}
	},
	'5r': {
		2: {
			nama: '5R',
			cm: '12,7 × 17,78 cm',
			pxW: 1500,
			pxH: 2100,
			margin: 32,
			hairline: 12,
			gap: 16,
			footer: 150,
			copySheet: 1,
			sheetOrient: 'portrait',
			rows: [
				{ h: 935, cells: [{ w: 1436 }] },
				{ h: 935, cells: [{ w: 1436 }] }
			]
		},
		3: {
			nama: '5R',
			cm: '12,7 × 17,78 cm',
			pxW: 1500,
			pxH: 2100,
			margin: 32,
			hairline: 12,
			gap: 16,
			footer: 150,
			copySheet: 1,
			sheetOrient: 'portrait',
			rows: [
				{ h: 618, cells: [{ w: 1436 }] },
				{ h: 618, cells: [{ w: 1436 }] },
				{ h: 618, cells: [{ w: 1436 }] }
			]
		},
		4: {
			nama: '5R',
			cm: '12,7 × 17,78 cm',
			pxW: 1500,
			pxH: 2100,
			margin: 32,
			hairline: 12,
			gap: 16,
			footer: 150,
			copySheet: 1,
			sheetOrient: 'portrait',
			rows: [
				{ h: 935, cells: [{ w: 710 }, { w: 710 }] },
				{ h: 935, cells: [{ w: 710 }, { w: 710 }] }
			]
		}
	},
	square: {
		1: {
			nama: 'Square',
			cm: '10,16 × 10,16 cm',
			pxW: 1200,
			pxH: 1200,
			margin: 28,
			hairline: 10,
			gap: 14,
			footer: 110,
			copySheet: 1,
			sheetOrient: 'portrait',
			rows: [{ h: 1034, cells: [{ w: 1144 }] }]
		},
		2: {
			nama: 'Square',
			cm: '10,16 × 10,16 cm',
			pxW: 1200,
			pxH: 1200,
			margin: 28,
			hairline: 10,
			gap: 14,
			footer: 110,
			copySheet: 1,
			sheetOrient: 'portrait',
			rows: [{ h: 1034, cells: [{ w: 565 }, { w: 565 }] }]
		},
		3: {
			nama: 'Square',
			cm: '10,16 × 10,16 cm',
			pxW: 1200,
			pxH: 1200,
			margin: 28,
			hairline: 10,
			gap: 14,
			footer: 110,
			copySheet: 1,
			sheetOrient: 'portrait',
			rows: [
				{ h: 335, cells: [{ w: 1144 }] },
				{ h: 335, cells: [{ w: 1144 }] },
				{ h: 335, cells: [{ w: 1144 }] }
			]
		},
		4: {
			nama: 'Square',
			cm: '10,16 × 10,16 cm',
			pxW: 1200,
			pxH: 1200,
			margin: 28,
			hairline: 10,
			gap: 14,
			footer: 110,
			copySheet: 1,
			sheetOrient: 'portrait',
			rows: [
				{ h: 510, cells: [{ w: 565 }, { w: 565 }] },
				{ h: 510, cells: [{ w: 565 }, { w: 565 }] }
			]
		}
	}
};

/** Spec layout untuk format + jumlah foto. */
export function specFor(formatId: string, count: number): ProductSpec {
	const spec = STANDARD_SPECS[formatId]?.[count];
	if (spec) return spec;
	const fmt = formatById(formatId);
	// Custom format (or unknown): generate a default layout dynamically.
	const builtin = new Set(BUILTIN_FORMATS.map((f) => f.id));
	if (!builtin.has(fmt.id) || !STANDARD_SPECS[fmt.id]) {
		const c = fmt.photos.includes(count) ? count : fmt.defaultCount;
		return generateCustomSpec(fmt, c);
	}
	return STANDARD_SPECS[fmt.id][fmt.defaultCount] ?? generateCustomSpec(fmt, fmt.defaultCount);
}
