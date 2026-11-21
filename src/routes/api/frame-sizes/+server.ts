import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { STANDARD_FORMATS } from '#lib/data/standardFormats';
import {
	deleteCustomFrameSize,
	getCustomFrameSize,
	listCustomFrameSizes,
	upsertCustomFrameSize,
	type CustomFrameSize
} from '#lib/server/frameSizesStore';

const BUILTIN_IDS = new Set(STANDARD_FORMATS.map((f) => f.id));

function sanitize(input: Partial<CustomFrameSize> | null): Partial<CustomFrameSize> | null {
	if (!input || typeof input !== 'object') return null;
	const id = String(input.id ?? '')
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9_-]+/g, '-')
		.replace(/^-+|-+$/g, '');
	if (!id) return null;
	const pxW = Math.max(100, Math.min(12000, Math.round(Number(input.pxW) || 0)));
	const pxH = Math.max(100, Math.min(12000, Math.round(Number(input.pxH) || 0)));
	const photosRaw = Array.isArray(input.photos) ? input.photos : [];
	const photos = [
		...new Set(photosRaw.map((n) => Math.round(Number(n))).filter((n) => n >= 1 && n <= 12))
	].sort((a, b) => a - b);
	if (photos.length === 0) return null;
	const defaultCount = photos.includes(Number(input.defaultCount))
		? Number(input.defaultCount)
		: photos[0];
	const kind = input.kind === 'digital' ? 'digital' : 'print';
	const label =
		String(input.label ?? id)
			.trim()
			.slice(0, 80) || id;
	const cm = String(input.cm ?? `${(pxW / 118.11).toFixed(2)} × ${(pxH / 118.11).toFixed(2)} cm`)
		.trim()
		.slice(0, 80);
	return { id, label, kind, pxW, pxH, cm, ratio: pxW / pxH, photos, defaultCount };
}

export const GET: RequestHandler = () => {
	return json({ ok: true, custom: listCustomFrameSizes() });
};

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = (await request.json()) as Partial<CustomFrameSize> | null;
		const clean = sanitize(body);
		if (!clean?.id)
			return json({ ok: false, error: 'Data frame size tidak valid.' }, { status: 400 });
		if (BUILTIN_IDS.has(clean.id)) {
			return json(
				{ ok: false, error: 'ID bentrok dengan format bawaan (terkunci).' },
				{ status: 400 }
			);
		}
		if (getCustomFrameSize(clean.id)) {
			return json({ ok: false, error: 'ID sudah ada. Gunakan edit.' }, { status: 409 });
		}
		const saved = upsertCustomFrameSize(clean as CustomFrameSize);
		return json({ ok: true, item: saved });
	} catch {
		return json({ ok: false, error: 'Gagal menyimpan frame size.' }, { status: 500 });
	}
};

export const PUT: RequestHandler = async ({ request }) => {
	try {
		const body = (await request.json()) as Partial<CustomFrameSize> | null;
		const clean = sanitize(body);
		if (!clean?.id)
			return json({ ok: false, error: 'Data frame size tidak valid.' }, { status: 400 });
		if (BUILTIN_IDS.has(clean.id)) {
			return json({ ok: false, error: 'Format bawaan tidak bisa diedit.' }, { status: 400 });
		}
		if (!getCustomFrameSize(clean.id)) {
			return json({ ok: false, error: 'Frame size custom tidak ditemukan.' }, { status: 404 });
		}
		const saved = upsertCustomFrameSize(clean as CustomFrameSize);
		return json({ ok: true, item: saved });
	} catch {
		return json({ ok: false, error: 'Gagal memperbarui frame size.' }, { status: 500 });
	}
};

export const DELETE: RequestHandler = async ({ request }) => {
	try {
		const body = (await request.json()) as { id?: string } | null;
		const id = String(body?.id ?? '').trim();
		if (!id) return json({ ok: false, error: 'ID diperlukan.' }, { status: 400 });
		if (BUILTIN_IDS.has(id)) {
			return json({ ok: false, error: 'Format bawaan tidak bisa dihapus.' }, { status: 400 });
		}
		const ok = deleteCustomFrameSize(id);
		return json({ ok, error: ok ? undefined : 'Tidak ditemukan.' }, { status: ok ? 200 : 404 });
	} catch {
		return json({ ok: false, error: 'Gagal menghapus frame size.' }, { status: 500 });
	}
};
