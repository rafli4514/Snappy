import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	deleteCustomAr,
	listCustomAr,
	saveArFile,
	upsertCustomAr
} from '#lib/server/customAssetsStore';

const IMAGE_RE = /\.(png|webp|gif|svg)$/i;

export const GET: RequestHandler = () => json({ ok: true, items: listCustomAr() });

export const POST: RequestHandler = async ({ request }) => {
	try {
		const form = await request.formData();
		const file = form.get('file');
		if (!(file instanceof File)) {
			return json({ ok: false, error: 'File overlay AR diperlukan.' }, { status: 400 });
		}
		if (!IMAGE_RE.test(file.name)) {
			return json(
				{ ok: false, error: 'Format harus gambar transparan (PNG/WebP/GIF/SVG).' },
				{ status: 400 }
			);
		}
		const buf = Buffer.from(await file.arrayBuffer());
		if (buf.length > 6 * 1024 * 1024) {
			return json({ ok: false, error: 'Ukuran overlay maksimal 6 MB.' }, { status: 413 });
		}
		const w = Math.round(Number(form.get('width')) || 0);
		const h = Math.round(Number(form.get('height')) || 0);
		if (w > 0 && h > 0 && (Math.min(w, h) < 64 || Math.max(w, h) < 100)) {
			return json(
				{
					ok: false,
					error: `Resolusi overlay terlalu kecil (${w} × ${h} px). Minimal 100 px (sisi terpendek ≥ 64 px).`
				},
				{ status: 400 }
			);
		}
		const stored = saveArFile(file.name, buf);
		const name = String(form.get('name') || file.name.replace(/\.[^.]+$/, '')).slice(0, 80);
		const item = upsertCustomAr({
			name,
			file: stored,
			mime: file.type || 'image/png',
			...(w > 0 && h > 0 ? { width: Math.min(8000, w), height: Math.min(8000, h) } : {}),
			enabled: true
		});
		return json({ ok: true, item });
	} catch (e) {
		return json(
			{ ok: false, error: e instanceof Error ? e.message : 'Gagal upload overlay AR.' },
			{ status: 500 }
		);
	}
};

export const PUT: RequestHandler = async ({ request }) => {
	try {
		const body = (await request.json()) as Record<string, unknown>;
		const id = String(body.id ?? '').trim();
		if (!id) return json({ ok: false, error: 'id diperlukan.' }, { status: 400 });
		const existing = listCustomAr().find((x) => x.id === id);
		if (!existing) return json({ ok: false, error: 'Aset AR tidak ditemukan.' }, { status: 404 });
		const item = upsertCustomAr({
			...existing,
			name: typeof body.name === 'string' ? body.name : existing.name,
			enabled: typeof body.enabled === 'boolean' ? body.enabled : existing.enabled
		});
		return json({ ok: true, item });
	} catch {
		return json({ ok: false, error: 'Gagal memperbarui aset AR.' }, { status: 500 });
	}
};

export const DELETE: RequestHandler = async ({ request }) => {
	try {
		const body = (await request.json()) as { id?: string };
		const id = String(body.id ?? '').trim();
		if (!id) return json({ ok: false, error: 'id diperlukan.' }, { status: 400 });
		const ok = deleteCustomAr(id);
		return json({ ok, error: ok ? undefined : 'Tidak ditemukan.' }, { status: ok ? 200 : 404 });
	} catch {
		return json({ ok: false, error: 'Gagal menghapus aset AR.' }, { status: 500 });
	}
};
