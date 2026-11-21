import fs from 'node:fs';
import path from 'node:path';
import type { RequestHandler } from './$types';
import { resolveAssetPath } from '#lib/server/customAssetsStore';

const MIME: Record<string, string> = {
	'.png': 'image/png',
	'.webp': 'image/webp',
	'.gif': 'image/gif',
	'.svg': 'image/svg+xml',
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg'
};

export const GET: RequestHandler = async ({ params }) => {
	const file = params.file || '';
	const full = resolveAssetPath('stickers', file);
	if (!full || !fs.existsSync(full)) return new Response('Not found', { status: 404 });
	const ext = path.extname(full).toLowerCase();
	const mime = MIME[ext] || 'application/octet-stream';
	const data = await fs.promises.readFile(full);
	return new Response(new Uint8Array(data), {
		headers: {
			'content-type': mime,
			'cache-control': 'public, max-age=3600'
		}
	});
};
