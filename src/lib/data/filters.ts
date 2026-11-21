/**
 * Resep filter foto
 * Kategori: Essential / Retro / Fun / Distort / Black & White
 * Nilai filter FFmpeg untuk render final, plus CSS filter untuk pratinjau.
 * Filter default = 'original' (tanpa filter).
 */

export type FilterCategory = 'Essential' | 'Retro' | 'Fun' | 'Distort' | 'Black & White';

export interface PhotoFilter {
	/** Filter key used as the store value (matches PhotoDefaultFilter). */
	key: string;
	/** Human-readable label. */
	name: string;
	/** Category grouping. */
	category: FilterCategory | 'Custom' | (string & {});
	/**
	 * CSS-compatible filter string for the live preview canvas.
	 * When set to '' the preview shows no filter.
	 */
	cssFilter: string;
	/**
	 * FFmpeg filtergraph segment for final render.
	 * Empty string means "no filter" — passes video through.
	 */
	ffmpeg: string;
	source?: 'builtin' | 'custom';
	enabled?: boolean;
}

export const PHOTO_FILTERS: PhotoFilter[] = [
	// ─── Essential ───────────────────────────────────────────────
	{
		key: 'original',
		name: 'Original',
		category: 'Essential',
		cssFilter: '',
		ffmpeg: ''
	},
	{
		key: 'soft',
		name: 'Soft',
		category: 'Essential',
		cssFilter: 'blur(1px)',
		ffmpeg: 'boxblur=3:1'
	},

	// ─── Retro ───────────────────────────────────────────────────
	{
		key: 'sepia',
		name: 'Sepia',
		category: 'Retro',
		cssFilter: 'sepia(0.8)',
		ffmpeg: 'colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131:0'
	},
	{
		key: 'warm',
		name: 'Warm',
		category: 'Retro',
		cssFilter: '',
		ffmpeg: 'colorbalance=rs=0.1:gs=0.02:bs=-0.1'
	},
	{
		key: 'cool',
		name: 'Cool',
		category: 'Retro',
		cssFilter: '',
		ffmpeg: 'colorbalance=rs=-0.08:gs=0.02:bs=0.1'
	},

	// ─── Fun ─────────────────────────────────────────────────────
	{
		key: 'bright',
		name: 'Bright',
		category: 'Fun',
		cssFilter: 'brightness(1.12)',
		ffmpeg: 'eq=brightness=0.06:contrast=1.05'
	},
	{
		key: 'dark',
		name: 'Dark',
		category: 'Fun',
		cssFilter: 'brightness(0.88)',
		ffmpeg: 'eq=brightness=-0.06:contrast=1.05'
	},
	{
		key: 'warm-tones',
		name: 'Warm Tones',
		category: 'Fun',
		cssFilter: '',
		ffmpeg: 'colorchannelmixer=.85:.1:.1:0:.1:.8:.1:0:.1:.1:.7:0'
	},

	// ─── Distort ─────────────────────────────────────────────────
	{
		key: 'negate',
		name: 'Negate',
		category: 'Distort',
		cssFilter: 'invert(1)',
		ffmpeg: 'negate'
	},
	{
		key: 'blur',
		name: 'Blur',
		category: 'Distort',
		cssFilter: 'blur(4px)',
		ffmpeg: 'boxblur=10:2'
	},

	// ─── Black & White ───────────────────────────────────────────
	{
		key: 'grayscale',
		name: 'Grayscale',
		category: 'Black & White',
		cssFilter: 'grayscale(1)',
		ffmpeg: 'hue=s=0'
	},
	{
		key: 'high-contrast-bw',
		name: 'High Contrast BW',
		category: 'Black & White',
		cssFilter: 'grayscale(1) contrast(1.5)',
		ffmpeg: 'hue=s=0,eq=contrast=1.5'
	}
];

/** Custom filters (runtime, dari dashboard). */
let _customFilters: PhotoFilter[] = [];
export function setCustomFilters(items: PhotoFilter[]): void {
	_customFilters = Array.isArray(items) ? items : [];
}
export function allPhotoFilters(): PhotoFilter[] {
	const customs = _customFilters.filter((f) => f.enabled !== false);
	return [...PHOTO_FILTERS, ...customs];
}
export function findPhotoFilter(key: string): PhotoFilter | undefined {
	return allPhotoFilters().find((f) => f.key === key);
}

/** Group filters by category for display. */
export function getFilterGroups(): Record<string, PhotoFilter[]> {
	const groups: Record<string, PhotoFilter[]> = {
		Essential: [],
		Retro: [],
		Fun: [],
		Distort: [],
		'Black & White': []
	};
	for (const f of allPhotoFilters()) {
		const cat = f.category || 'Custom';
		(groups[cat] ??= []).push(f);
	}
	return groups;
}
