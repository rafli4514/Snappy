/**
 * Katalog Standard Photobooth — 11 format cetak/digital 300 DPI.
 *
 * Satu sumber kebenaran untuk:
 *  - /admin/standar   (katalog & kelola frame)
 *  - /strip           (tamu pilih format + jumlah foto)
 *  - print            (@page ukuran cetak mengikuti format)
 *
 * Ukuran px = cm ÷ 2,54 × 300 (300 DPI), dibulatkan genap.
 * Story/Screen = digital only (tanpa cetak).
 */

import type { ProductSpec, Products } from '#lib/types';

export type FormatKind = 'print' | 'digital';

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
}

export const STANDARD_FORMATS: StandardFormat[] = [
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
		photos: [4, 5, 6],
		defaultCount: 6
	},
	{
		id: '4r-double',
		label: '4R · Double Strip',
		kind: 'print',
		pxW: 1200,
		pxH: 1800,
		cm: '10,16 × 15,24 cm (dipotong jadi dua strip)',
		ratio: 1200 / 1800,
		photos: [6],
		defaultCount: 6
	},
	{
		id: '4r-landscape',
		label: '4R · Landscape',
		kind: 'print',
		pxW: 1800,
		pxH: 1200,
		cm: '15,24 × 10,16 cm',
		ratio: 1800 / 1200,
		photos: [1, 2],
		defaultCount: 1
	},
	{
		id: '3r',
		label: '3R · Portrait',
		kind: 'print',
		pxW: 1050,
		pxH: 1500,
		cm: '8,89 × 12,7 cm',
		ratio: 1050 / 1500,
		photos: [1, 2, 3],
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
		photos: [2, 3, 4],
		defaultCount: 3
	},
	{
		id: 'square',
		label: 'Square · 1:1',
		kind: 'print',
		pxW: 1200,
		pxH: 1200,
		cm: '10,16 × 10,16 cm',
		ratio: 1,
		photos: [1, 2, 3, 4],
		defaultCount: 4
	},
	{
		id: 'instax-mini',
		label: 'Instax Mini',
		kind: 'print',
		pxW: 638,
		pxH: 1016,
		cm: '5,4 × 8,6 cm',
		ratio: 638 / 1016,
		photos: [1, 2],
		defaultCount: 1
	},
	{
		id: 'polaroid',
		label: 'Polaroid Classic',
		kind: 'print',
		pxW: 1039,
		pxH: 1276,
		cm: '8,8 × 10,8 cm',
		ratio: 1039 / 1276,
		photos: [1, 2],
		defaultCount: 1
	},
	{
		id: 'story',
		label: 'Story · 9:16',
		kind: 'digital',
		pxW: 1080,
		pxH: 1920,
		cm: '9:16 · digital',
		ratio: 1080 / 1920,
		photos: [1, 2, 3, 4],
		defaultCount: 3
	},
	{
		id: 'screen',
		label: 'Screen · 16:9',
		kind: 'digital',
		pxW: 1920,
		pxH: 1080,
		cm: '16:9 · digital',
		ratio: 1920 / 1080,
		photos: [1, 2, 3, 4],
		defaultCount: 2
	}
];

export const DEFAULT_FORMAT_ID = '2x6';

export function formatById(id: string | null | undefined): StandardFormat {
	return STANDARD_FORMATS.find((f) => f.id === id) ?? STANDARD_FORMATS[0];
}

/** Rasio cocok ±1% — sama seperti validasi Frame Studio. */
export function detectFormat(width: number, height: number): StandardFormat | null {
	if (width <= 0 || height <= 0) return null;
	const actual = width / height;
	return STANDARD_FORMATS.find((f) => Math.abs(actual / f.ratio - 1) <= 0.01) ?? null;
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
			cutLine: 'vertical',
			rows: [
				{ h: 533, cells: [{ w: 568 }, { w: 568 }] },
				{ h: 533, cells: [{ w: 568 }, { w: 568 }] },
				{ h: 533, cells: [{ w: 568 }, { w: 568 }] }
			]
		}
	},
	'4r-landscape': {
		1: {
			nama: '4R',
			cm: '15,24 × 10,16 cm',
			pxW: 1800,
			pxH: 1200,
			margin: 32,
			hairline: 14,
			gap: 16,
			footer: 130,
			copySheet: 1,
			sheetOrient: 'landscape',
			rows: [{ h: 1006, cells: [{ w: 1736 }] }]
		},
		2: {
			nama: '4R',
			cm: '15,24 × 10,16 cm',
			pxW: 1800,
			pxH: 1200,
			margin: 32,
			hairline: 14,
			gap: 16,
			footer: 130,
			copySheet: 1,
			sheetOrient: 'landscape',
			rows: [{ h: 1006, cells: [{ w: 860 }, { w: 860 }] }]
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
				{ h: 433, cells: [{ w: 998 }] },
				{ h: 433, cells: [{ w: 998 }] },
				{ h: 433, cells: [{ w: 998 }] }
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
	},
	'instax-mini': {
		1: {
			nama: 'Instax Mini',
			cm: '5,4 × 8,6 cm',
			pxW: 638,
			pxH: 1016,
			margin: 30,
			hairline: 8,
			gap: 12,
			footer: 96,
			copySheet: 1,
			sheetOrient: 'portrait',
			rows: [{ h: 860, cells: [{ w: 578 }] }]
		},
		2: {
			nama: 'Instax Mini',
			cm: '5,4 × 8,6 cm',
			pxW: 638,
			pxH: 1016,
			margin: 30,
			hairline: 8,
			gap: 12,
			footer: 96,
			copySheet: 1,
			sheetOrient: 'portrait',
			rows: [
				{ h: 424, cells: [{ w: 578 }] },
				{ h: 424, cells: [{ w: 578 }] }
			]
		}
	},
	polaroid: {
		1: {
			nama: 'Polaroid',
			cm: '8,8 × 10,8 cm',
			pxW: 1039,
			pxH: 1276,
			margin: 36,
			hairline: 10,
			gap: 16,
			footer: 170,
			copySheet: 1,
			sheetOrient: 'portrait',
			rows: [{ h: 1034, cells: [{ w: 967 }] }]
		},
		2: {
			nama: 'Polaroid',
			cm: '8,8 × 10,8 cm',
			pxW: 1039,
			pxH: 1276,
			margin: 36,
			hairline: 10,
			gap: 16,
			footer: 170,
			copySheet: 1,
			sheetOrient: 'portrait',
			rows: [
				{ h: 509, cells: [{ w: 967 }] },
				{ h: 509, cells: [{ w: 967 }] }
			]
		}
	},
	story: {
		1: {
			nama: 'Story',
			cm: '9:16 · digital',
			pxW: 1080,
			pxH: 1920,
			margin: 34,
			hairline: 12,
			gap: 14,
			footer: 150,
			copySheet: 1,
			sheetOrient: 'portrait',
			rows: [{ h: 1702, cells: [{ w: 1012 }] }]
		},
		2: {
			nama: 'Story',
			cm: '9:16 · digital',
			pxW: 1080,
			pxH: 1920,
			margin: 34,
			hairline: 12,
			gap: 14,
			footer: 150,
			copySheet: 1,
			sheetOrient: 'portrait',
			rows: [
				{ h: 844, cells: [{ w: 1012 }] },
				{ h: 844, cells: [{ w: 1012 }] }
			]
		},
		3: {
			nama: 'Story',
			cm: '9:16 · digital',
			pxW: 1080,
			pxH: 1920,
			margin: 34,
			hairline: 12,
			gap: 14,
			footer: 150,
			copySheet: 1,
			sheetOrient: 'portrait',
			rows: [
				{ h: 558, cells: [{ w: 1012 }] },
				{ h: 558, cells: [{ w: 1012 }] },
				{ h: 558, cells: [{ w: 1012 }] }
			]
		},
		4: {
			nama: 'Story',
			cm: '9:16 · digital',
			pxW: 1080,
			pxH: 1920,
			margin: 34,
			hairline: 12,
			gap: 14,
			footer: 150,
			copySheet: 1,
			sheetOrient: 'portrait',
			rows: [
				{ h: 415, cells: [{ w: 1012 }] },
				{ h: 415, cells: [{ w: 1012 }] },
				{ h: 415, cells: [{ w: 1012 }] },
				{ h: 415, cells: [{ w: 1012 }] }
			]
		}
	},
	screen: {
		1: {
			nama: 'Screen',
			cm: '16:9 · digital',
			pxW: 1920,
			pxH: 1080,
			margin: 34,
			hairline: 12,
			gap: 14,
			footer: 120,
			copySheet: 1,
			sheetOrient: 'landscape',
			rows: [{ h: 892, cells: [{ w: 1852 }] }]
		},
		2: {
			nama: 'Screen',
			cm: '16:9 · digital',
			pxW: 1920,
			pxH: 1080,
			margin: 34,
			hairline: 12,
			gap: 14,
			footer: 120,
			copySheet: 1,
			sheetOrient: 'landscape',
			rows: [{ h: 892, cells: [{ w: 919 }, { w: 919 }] }]
		},
		3: {
			nama: 'Screen',
			cm: '16:9 · digital',
			pxW: 1920,
			pxH: 1080,
			margin: 34,
			hairline: 12,
			gap: 14,
			footer: 120,
			copySheet: 1,
			sheetOrient: 'landscape',
			rows: [{ h: 892, cells: [{ w: 608 }, { w: 608 }, { w: 608 }] }]
		},
		4: {
			nama: 'Screen',
			cm: '16:9 · digital',
			pxW: 1920,
			pxH: 1080,
			margin: 34,
			hairline: 12,
			gap: 14,
			footer: 120,
			copySheet: 1,
			sheetOrient: 'landscape',
			rows: [{ h: 892, cells: [{ w: 452 }, { w: 452 }, { w: 452 }, { w: 452 }] }]
		}
	}
};

/** Spec layout untuk format + jumlah foto. */
export function specFor(formatId: string, count: number): ProductSpec {
	const spec = STANDARD_SPECS[formatId]?.[count];
	if (!spec) {
		const fallback = formatById(formatId);
		return STANDARD_SPECS[fallback.id][fallback.defaultCount];
	}
	return spec;
}
