import { json } from '@sveltejs/kit';
import { deleteServerSession, getServerSession } from '#lib/server/galleryStore';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ params }) => {
	const { id } = params;
	if (!id) {
		return json({ error: 'Missing session ID' }, { status: 400 });
	}

	const session = getServerSession(id);
	if (!session) {
		return json({ error: 'Session not found' }, { status: 404 });
	}

	return json(session);
};

export const DELETE: RequestHandler = ({ params }) => {
	const { id } = params;
	if (!id) {
		return json({ ok: false, error: 'ID sesi diperlukan.' }, { status: 400 });
	}

	const removed = deleteServerSession(id);
	if (!removed) {
		return json({ ok: false, error: 'Sesi tidak ditemukan.' }, { status: 404 });
	}

	return json({ ok: true, id });
};
