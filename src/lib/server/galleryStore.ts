import fs from 'node:fs';
import path from 'node:path';
import type { GallerySession } from '#lib/types';
import { CACHE_DIR, ensureCacheDir } from './cacheDir';

/**
 * Server-side Gallery Session Storage
 * Persists session JSONs in memory and locally in .gallery_cache/
 * so mobile devices connecting over Wi-Fi can retrieve them.
 */

ensureCacheDir();

const inMemorySessions = new Map<string, GallerySession>();

/** Save a session to server storage */
export function setServerSession(session: GallerySession): void {
	if (!session || !session.id) return;
	inMemorySessions.set(session.id, session);

	try {
		ensureCacheDir();
		const filePath = path.join(CACHE_DIR, `${session.id}.json`);
		fs.writeFileSync(filePath, JSON.stringify(session), 'utf8');
	} catch (err: unknown) {
		console.error('Failed to write session to disk cache:', err);
	}
}

interface GallerySessionSummary {
	id: string;
	createdAt: string;
	photoCount: number;
	templateKey: string;
	formatId?: string;
	hasGif: boolean;
	hasVideo: boolean;
}

export function countGallerySessions(): number {
	try {
		return fs.readdirSync(CACHE_DIR).filter((f) => f.endsWith('.json') && !f.startsWith('_'))
			.length;
	} catch {
		return 0;
	}
}

/** Daftar sesi dari .gallery_cache, terurut terbaru pertama (metadata saja). */
export function listServerSessions(limit = 50): GallerySessionSummary[] {
	let files: string[] = [];
	try {
		files = fs.readdirSync(CACHE_DIR).filter((f) => f.endsWith('.json') && !f.startsWith('_'));
	} catch {
		return [];
	}

	const sessions: GallerySessionSummary[] = [];
	for (const file of files) {
		try {
			const id = file.replace(/\.json$/i, '');
			const raw = fs.readFileSync(path.join(CACHE_DIR, file), 'utf8');
			const data = JSON.parse(raw) as GallerySession;
			if (!data?.id) continue;
			sessions.push({
				id: data.id || id,
				createdAt: data.createdAt ?? new Date().toISOString(),
				photoCount: Array.isArray(data.photos) ? data.photos.filter(Boolean).length : 0,
				templateKey: data.templateKey ?? '',
				formatId: data.formatId,
				hasGif: !!data.gifDataUrl,
				hasVideo: !!data.videoDataUrl
			});
		} catch {
			// skip broken cache files
		}
	}

	return sessions
		.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
		.slice(0, Math.max(1, limit));
}

export function getServerSession(id: string): GallerySession | null {
	if (!id) return null;
	if (inMemorySessions.has(id)) {
		return inMemorySessions.get(id) ?? null;
	}

	try {
		const filePath = path.join(CACHE_DIR, `${id}.json`);
		if (fs.existsSync(filePath)) {
			const raw = fs.readFileSync(filePath, 'utf8');
			const data = JSON.parse(raw) as GallerySession;
			inMemorySessions.set(id, data);
			return data;
		}
	} catch (err: unknown) {
		console.error('Failed to read session from disk cache:', err);
	}

	return null;
}
