import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { listCustomAr, listCustomFilters, listCustomStickers } from '#lib/server/customAssetsStore';

export const GET: RequestHandler = () => {
	try {
		return json({
			ok: true,
			stickers: listCustomStickers(),
			filters: listCustomFilters(),
			ar: listCustomAr()
		});
	} catch {
		return json({ ok: false, stickers: [], filters: [], ar: [] });
	}
};
