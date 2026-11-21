import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	deleteCustomFilter,
	listCustomFilters,
	upsertCustomFilter
} from '#lib/server/customAssetsStore';

export const GET: RequestHandler = () => json({ ok: true, items: listCustomFilters() });

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = (await request.json()) as Record<string, unknown>;
		const name = String(body.name ?? '').trim();
		if (!name) return json({ ok: false, error: 'Nama filter diperlukan.' }, { status: 400 });
		const keyRaw = String(body.key ?? name).trim();
		const item = upsertCustomFilter({
			key: keyRaw,
			name,
			category: (String(body.category || 'Fun') as never) || ('Fun' as never),
			cssFilter: String(body.cssFilter ?? ''),
			ffmpeg: String(body.ffmpeg ?? ''),
			enabled: body.enabled !== false
		});
		return json({ ok: true, item });
	} catch {
		return json({ ok: false, error: 'Gagal menyimpan filter.' }, { status: 500 });
	}
};

export const PUT: RequestHandler = async ({ request }) => {
	try {
		const body = (await request.json()) as Record<string, unknown>;
		const key = String(body.key ?? '').trim();
		if (!key) return json({ ok: false, error: 'key diperlukan.' }, { status: 400 });
		const existing = listCustomFilters().find((x) => x.key === key);
		if (!existing)
			return json({ ok: false, error: 'Filter custom tidak ditemukan.' }, { status: 404 });
		const item = upsertCustomFilter({
			...existing,
			name: typeof body.name === 'string' ? body.name : existing.name,
			category: (typeof body.category === 'string' ? body.category : existing.category) as never,
			cssFilter: typeof body.cssFilter === 'string' ? body.cssFilter : existing.cssFilter,
			ffmpeg: typeof body.ffmpeg === 'string' ? body.ffmpeg : existing.ffmpeg,
			enabled: typeof body.enabled === 'boolean' ? body.enabled : existing.enabled
		});
		return json({ ok: true, item });
	} catch {
		return json({ ok: false, error: 'Gagal memperbarui filter.' }, { status: 500 });
	}
};

export const DELETE: RequestHandler = async ({ request }) => {
	try {
		const body = (await request.json()) as { key?: string };
		const key = String(body.key ?? '').trim();
		if (!key) return json({ ok: false, error: 'key diperlukan.' }, { status: 400 });
		const ok = deleteCustomFilter(key);
		return json({ ok, error: ok ? undefined : 'Tidak ditemukan.' }, { status: ok ? 200 : 404 });
	} catch {
		return json({ ok: false, error: 'Gagal menghapus filter.' }, { status: 500 });
	}
};
