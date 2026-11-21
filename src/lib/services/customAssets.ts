import { writable } from 'svelte/store';
import { setCustomFilters, type PhotoFilter } from '#lib/data/filters';
import { setCustomStickers, type StickerAsset } from '#lib/data/stickers';

export interface CustomArAsset {
	id: string;
	name: string;
	file: string;
	url: string;
	mime?: string;
	width?: number;
	height?: number;
	enabled: boolean;
	createdAt?: string;
	updatedAt?: string;
}

export const customStickersStore = writable<StickerAsset[]>([]);
export const customFiltersStore = writable<PhotoFilter[]>([]);
export const customArStore = writable<CustomArAsset[]>([]);

let _loaded = false;
let _loading: Promise<void> | null = null;

export async function loadCustomAssets(force = false): Promise<void> {
	if (_loaded && !force) return;
	if (_loading && !force) {
		await _loading;
		return;
	}
	_loading = (async () => {
		try {
			const res = await fetch('/api/assets');
			if (!res.ok) return;
			const data = (await res.json()) as {
				ok?: boolean;
				stickers?: StickerAsset[];
				filters?: PhotoFilter[];
				ar?: CustomArAsset[];
			};
			if (!data?.ok) return;
			const stickers = Array.isArray(data.stickers) ? data.stickers : [];
			const filters = Array.isArray(data.filters) ? data.filters : [];
			const ar = Array.isArray(data.ar) ? data.ar : [];
			setCustomStickers(stickers);
			setCustomFilters(filters);
			customStickersStore.set(stickers);
			customFiltersStore.set(filters);
			customArStore.set(ar);
			_loaded = true;
		} catch {
			// API not available — keep built-ins only.
		} finally {
			_loading = null;
		}
	})();
	await _loading;
}
