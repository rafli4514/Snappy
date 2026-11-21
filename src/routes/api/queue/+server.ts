import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { countGallerySessions } from '#lib/server/galleryStore';
import { listCustomAr, listCustomFilters, listCustomStickers } from '#lib/server/customAssetsStore';
import {
	clearQueue,
	enqueue,
	listQueue,
	removeQueue,
	summarizeQueue,
	updateQueue,
	type QueueStatus,
	type QueueType
} from '#lib/server/queueStore';

const TYPES = new Set<QueueType>(['cloud-sync', 'print', 'upload']);
const STATUSES = new Set<QueueStatus>(['pending', 'processing', 'done', 'failed', 'skipped']);

function asType(v: unknown): QueueType | undefined {
	return typeof v === 'string' && TYPES.has(v as QueueType) ? (v as QueueType) : undefined;
}

export const GET: RequestHandler = ({ url }) => {
	try {
		const type = asType(url.searchParams.get('type'));
		const limit = Math.max(1, Math.min(200, Number(url.searchParams.get('limit')) || 80));
		const items = listQueue(type).slice(0, limit);
		return json({
			ok: true,
			items,
			summary: summarizeQueue(),
			context: {
				gallerySessions: countGallerySessions(),
				customAssets:
					listCustomStickers().length + listCustomFilters().length + listCustomAr().length
			}
		});
	} catch (e) {
		return json(
			{ ok: false, error: e instanceof Error ? e.message : 'Gagal memuat antrian.', items: [] },
			{ status: 500 }
		);
	}
};

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = (await request.json()) as Record<string, unknown>;
		const type = asType(body.type);
		if (!type) return json({ ok: false, error: 'Tipe antrian tidak valid.' }, { status: 400 });
		const status =
			typeof body.status === 'string' && STATUSES.has(body.status as QueueStatus)
				? (body.status as QueueStatus)
				: undefined;
		const item = enqueue({
			type,
			status,
			title: String(body.title ?? type),
			ref: typeof body.ref === 'string' ? body.ref : undefined,
			detail: typeof body.detail === 'string' ? body.detail : undefined,
			source: typeof body.source === 'string' ? body.source : 'dashboard'
		});
		return json({ ok: true, item, summary: summarizeQueue() });
	} catch {
		return json({ ok: false, error: 'Gagal menambah antrian.' }, { status: 500 });
	}
};

export const PATCH: RequestHandler = async ({ request }) => {
	try {
		const body = (await request.json()) as Record<string, unknown>;
		const id = String(body.id ?? '');
		if (!id) return json({ ok: false, error: 'id diperlukan.' }, { status: 400 });
		const status =
			typeof body.status === 'string' && STATUSES.has(body.status as QueueStatus)
				? (body.status as QueueStatus)
				: undefined;
		const item = updateQueue(id, {
			...(status ? { status } : {}),
			...(typeof body.detail === 'string' ? { detail: body.detail } : {}),
			...(typeof body.title === 'string' ? { title: body.title } : {})
		});
		if (!item) return json({ ok: false, error: 'Item tidak ditemukan.' }, { status: 404 });
		return json({ ok: true, item, summary: summarizeQueue() });
	} catch {
		return json({ ok: false, error: 'Gagal memperbarui antrian.' }, { status: 500 });
	}
};

export const DELETE: RequestHandler = async ({ request }) => {
	try {
		const body = (await request.json()) as { id?: string; type?: string; all?: boolean };
		if (body.id) {
			const ok = removeQueue(body.id);
			return json({ ok, summary: summarizeQueue() }, { status: ok ? 200 : 404 });
		}
		const type = body.all ? 'all' : asType(body.type);
		if (!type) return json({ ok: false, error: 'id atau type/all diperlukan.' }, { status: 400 });
		const removed = clearQueue(type);
		return json({ ok: true, removed, summary: summarizeQueue() });
	} catch {
		return json({ ok: false, error: 'Gagal menghapus antrian.' }, { status: 500 });
	}
};
