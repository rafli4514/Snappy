import { getServerSession } from '#lib/server/galleryStore';
import type { RequestHandler } from './$types';

const DATA_URL_RE = /^data:(image\/(?:png|jpeg|jpg|webp));base64,(.+)$/i;

export const GET: RequestHandler = ({ params }) => {
	const id = params.id;
	if (!id) {
		return new Response('Missing session ID', { status: 400 });
	}

	const session = getServerSession(id);
	if (!session) {
		return new Response('Session not found', { status: 404 });
	}

	const raw = session.stripDataUrl || session.photos?.[0] || '';
	const match = DATA_URL_RE.exec(raw);
	if (!match) {
		return new Response('Image unavailable', { status: 404 });
	}

	const mime = match[1].toLowerCase() === 'image/jpg' ? 'image/jpeg' : match[1].toLowerCase();
	const bytes = Buffer.from(match[2], 'base64');

	return new Response(bytes, {
		status: 200,
		headers: {
			'Content-Type': mime,
			'Cache-Control': 'private, max-age=3600'
		}
	});
};
