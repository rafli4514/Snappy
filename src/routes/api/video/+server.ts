/**
 * Video generation endpoint
 * Spawns FFmpeg to produce _result-video.mp4 from captured photos + frame overlay.
 *
 * POST /api/video
 * Body: { photos: string[], template, stickers, filter }
 * Returns: { url: string, filename: string }
 */

import { json } from '@sveltejs/kit';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { mkdtemp, writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const execFileAsync = promisify(execFile);

interface VideoRequest {
	photos: string[];
	template: import('#lib/types').CustomTemplate;
	stickers?: import('#lib/types').StickerLayer[];
	filter?: string | null;
}

export async function POST({ request }: { request: Request }) {
	try {
		const body: VideoRequest = await request.json();
		const { photos, template, stickers = [], filter = 'none' } = body;

		if (!photos.length) {
			return json({ error: 'No photos provided' }, { status: 400 });
		}

		const tmpDir = await mkdtemp(join(tmpdir(), 'distudio-video-'));
		const outputName = `_result-video-${randomUUID()}.mp4`;
		const outputPath = join(tmpDir, outputName);

		// Write photo frames as sequential PNGs
		const photoPaths: string[] = [];
		for (let i = 0; i < photos.length; i++) {
			const dataUrl = photos[i];
			if (!dataUrl) continue;
			const [, base64] = dataUrl.split(',');
			if (!base64) continue;
			const pngPath = join(tmpDir, `frame-${i}.png`);
			await writeFile(pngPath, Buffer.from(base64, 'utf-8'));
			photoPaths.push(pngPath);
		}

		if (!photoPaths.length) {
			return json({ error: 'No valid photos in request' }, { status: 400 });
		}

		// Build FFmpeg filtergraph for frame video
		const filterComplex = buildFilterComplex(photoPaths.length, filter ?? 'none');
		const args = [
			'-y', // overwrite
			'-f',
			'concat',
			'-safe',
			'0',
			'-i',
			'-', // input list from stdin
			'-vf',
			filterComplex,
			'-c:v',
			'libx264',
			'-preset',
			'veryfast',
			'-crf',
			'23',
			'-pix_fmt',
			'yuv420p',
			'-movflags',
			'+faststart',
			'-color_primaries',
			'bt709',
			'-r',
			'30',
			outputPath
		];

		try {
			await execFileAsync('ffmpeg', args, { maxBuffer: 50 * 1024 * 1024 });
		} catch (err: unknown) {
			const msg = err instanceof Error ? err.message : String(err);
			return json({ error: `FFmpeg failed: ${msg}` }, { status: 500 });
		}

		const url = `/results/resultvideos/${outputName}`;
		return json({ url, filename: outputName });
	} catch (err: unknown) {
		const msg = err instanceof Error ? err.message : 'Unknown error';
		return json({ error: msg }, { status: 500 });
	}
}

function buildFilterComplex(photoCount: number, filter: string): string {
	// Simplified: concat photos as slideshow + apply filter if needed
	const filterStr = filter && filter !== 'none' ? `,${filter}` : '';
	return `concat=n=${photoCount}:v=1:a=0[outv];[outv]format=yuv420p${filterStr}`;
}
