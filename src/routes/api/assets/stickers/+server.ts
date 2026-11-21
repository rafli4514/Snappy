import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	deleteCustomSticker,
	listCustomStickers,
	saveStickerFile,
	upsertCustomSticker
} from '#lib/server/customAssetsStore';

const IMAGE_RE = /\.(png|webp|gif|svg|jpe?g)$/i;

export const GET: RequestHandler = () => json({ ok: true, items: listCustomStickers() });

export const POST: RequestHandler = async ({ request }) => {
	try {
		const form = await request.formData();
		const file = form.get('file');
		if (!(file instanceof File)) {
			return json({ ok: false, error: 'File sticker diperlukan.' }, { status: 400 });
		}
		if (!IMAGE_RE.test(file.name)) {
			return json(
				{ ok: false, error: 'Format file harus gambar (PNG/WebP/GIF/SVG/JPG).' },
				{ status: 400 }
			);
		}
		const buf = Buffer.from(await file.arrayBuffer());
		if (buf.length > 4 * 1024 * 1024) {
			return json({ ok: false, error: 'Ukuran sticker maksimal 4 MB.' }, { status: 413 });
		}
		const stored = saveStickerFile(file.name, buf);
		const name = String(form.get('name') || file.name.replace(/\.[^.]+$/, '')).slice(0, 80);
		const category = String(form.get('category') || 'Custom').slice(0, 40) || 'Custom';
		const w = Math.max(1, Math.min(8000, Math.round(Number(form.get('width')) || 200)));
		const h = Math.max(1, Math.min(8000, Math.round(Number(form.get('height')) || 200)));
		const item = upsertCustomSticker({
			name,
			file: stored,
			category,
			size: { w, h },
			active: true,
			enabled: true
		});
		return json({ ok: true, item });
	} catch (e) {
		return json(
			{ ok: false, error: e instanceof Error ? e.message : 'Gagal upload sticker.' },
			{ status: 500 }
		);
	}
};

export const PUT: RequestHandler = async ({ request }) => {
	try {
		const body = (await request.json()) as Record<string, unknown>;
		const dbId = Number(body.dbId);
		if (!Number.isFinite(dbId))
			return json({ ok: false, error: 'dbId diperlukan.' }, { status: 400 });
		const existing = listCustomStickers().find((x) => x.dbId === dbId);
		if (!existing)
			return json({ ok: false, error: 'Sticker custom tidak ditemukan.' }, { status: 404 });
		const item = upsertCustomSticker({
			...existing,
			name: typeof body.name === 'string' ? body.name : existing.name,
			category: typeof body.category === 'string' ? body.category : existing.category,
			active: typeof body.active === 'boolean' ? body.active : existing.active,
			enabled: typeof body.enabled === 'boolean' ? body.enabled : existing.enabled
		});
		return json({ ok: true, item });
	} catch {
		return json({ ok: false, error: 'Gagal memperbarui sticker.' }, { status: 500 });
	}
};

export const DELETE: RequestHandler = async ({ request }) => {
	try {
		const body = (await request.json()) as { dbId?: number };
		const dbId = Number(body.dbId);
		if (!Number.isFinite(dbId))
			return json({ ok: false, error: 'dbId diperlukan.' }, { status: 400 });
		const ok = deleteCustomSticker(dbId);
		return json({ ok, error: ok ? undefined : 'Tidak ditemukan.' }, { status: ok ? 200 : 404 });
	} catch {
		return json({ ok: false, error: 'Gagal menghapus sticker.' }, { status: 500 });
	}
};
