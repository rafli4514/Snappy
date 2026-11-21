import { writable } from 'svelte/store';
import { setCustomFormats, type StandardFormat } from '#lib/data/standardFormats';

let _loaded = false;
let _loading: Promise<void> | null = null;

export const customFrameSizes = writable<StandardFormat[]>([]);

export async function loadCustomFrameSizes(force = false): Promise<StandardFormat[]> {
	if (_loaded && !force) return [];
	if (_loading && !force) {
		await _loading;
		return [];
	}
	_loading = (async () => {
		try {
			const res = await fetch('/api/frame-sizes');
			if (!res.ok) return;
			const data = (await res.json()) as { ok?: boolean; custom?: StandardFormat[] };
			const custom = data?.ok && Array.isArray(data.custom) ? data.custom : [];
			setCustomFormats(custom);
			customFrameSizes.set(custom);
			_loaded = true;
		} catch {
			// API not available (static/serverless) — keep built-ins only.
		} finally {
			_loading = null;
		}
	})();
	await _loading;
	return [];
}
