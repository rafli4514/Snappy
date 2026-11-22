/**
 * Gallery Utility
 *
 * Stores session results on server API and IndexedDB so they can be retrieved via
 * a QR-code-linked gallery page (/gallery/SESSION_ID) on any device connected to the network.
 *
 * Also provides animated GIF generation from individual photo frames.
 */

import QRCodePkg from 'qrcode';
import { GIFEncoder, quantize, applyPalette } from 'gifenc';
import type { GallerySession } from '#lib/types';

// ─── IndexedDB helpers (offline client fallback) ────────────────────────────

const DB_NAME = 'distudio-gallery';
const DB_VERSION = 1;
const STORE_NAME = 'sessions';

function openDB(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		if (typeof indexedDB === 'undefined') {
			return reject(new Error('IndexedDB not supported'));
		}
		const req = indexedDB.open(DB_NAME, DB_VERSION);
		req.onupgradeneeded = (e: IDBVersionChangeEvent) => {
			const db = e.target ? (e.target as IDBOpenDBRequest).result : null;
			if (db && !db.objectStoreNames.contains(STORE_NAME)) {
				db.createObjectStore(STORE_NAME, { keyPath: 'id' });
			}
		};
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});
}

interface SaveGallerySessionInput {
	id?: string | null;
	photos: string[];
	stripDataUrl: string;
	templateKey: string;
	formatId?: string;
	gifDataUrl?: string | null;
	videoDataUrl?: string | null;
}

export type CloudQrMode = 'smart' | 'gallery' | 'local';

export interface SaveGallerySessionResult {
	id: string;
	qrMode: CloudQrMode;
	cloudEligible: boolean;
}

export interface SessionCloudSyncStatus {
	ok: boolean;
	sessionId: string;
	qrMode: CloudQrMode;
	publicBaseUrl?: string | null;
	cloudEligible: boolean;
	status: 'pending' | 'processing' | 'done' | 'failed' | 'disabled' | string;
	isPublic: boolean;
	driveFolderUrl?: string | null;
	uploadedCount: number;
	totalFiles: number;
	error?: string | null;
}

const MAX_GALLERY_VIDEO_BYTES = 12 * 1024 * 1024; // ~9MB binary guard for data URL

/** Save a gallery session and return its ID plus Smart Cloud QR metadata. */
export async function saveGallerySessionWithStatus({
	id = null,
	photos,
	stripDataUrl,
	templateKey,
	formatId,
	gifDataUrl = null,
	videoDataUrl = null
}: SaveGallerySessionInput): Promise<SaveGallerySessionResult> {
	const finalId = id || generateId();
	let safeVideo: string | null = videoDataUrl || null;
	if (safeVideo && safeVideo.length > MAX_GALLERY_VIDEO_BYTES * 1.37) {
		console.warn('Video timelapse terlalu besar untuk galeri, diunggah tanpa video.');
		safeVideo = null;
	}
	const sess: GallerySession = {
		id: finalId,
		createdAt: new Date().toISOString(),
		photos: (photos || []).filter(Boolean),
		stripDataUrl: stripDataUrl || '',
		templateKey: typeof templateKey === 'string' ? templateKey : 'custom',
		...(formatId ? { formatId } : {}),
		gifDataUrl: gifDataUrl || null,
		videoDataUrl: safeVideo
	};

	let cloudEligible = false;
	let qrMode: CloudQrMode = 'smart';

	// 1. Save to server API
	try {
		const res = await fetch('/api/gallery', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(sess)
		});
		if (res.ok) {
			const data = (await res.json().catch(() => null)) as {
				cloudEligible?: boolean;
				qrMode?: CloudQrMode;
			} | null;
			cloudEligible = data?.cloudEligible === true;
			if (data?.qrMode === 'gallery' || data?.qrMode === 'local' || data?.qrMode === 'smart') {
				qrMode = data.qrMode;
			}
		} else {
			console.warn('Server gallery API returned status:', res.status);
		}
	} catch (err: unknown) {
		console.warn('Could not save session to server API:', err);
	}

	// 2. Save to local IndexedDB as backup
	try {
		const db = await openDB();
		await new Promise<string>((resolve, reject) => {
			const tx = db.transaction(STORE_NAME, 'readwrite');
			tx.objectStore(STORE_NAME).put(sess);
			tx.oncomplete = () => resolve(finalId);
			tx.onerror = () => reject(tx.error);
		});
	} catch (err: unknown) {
		console.warn('Could not save session to IndexedDB:', err);
	}

	return { id: finalId, qrMode, cloudEligible };
}

/** Save a gallery session and return its ID. */
export async function saveGallerySession(input: SaveGallerySessionInput): Promise<string> {
	const res = await saveGallerySessionWithStatus(input);
	return res.id;
}

/** Query the Google Drive sync & public-folder state for a single gallery session. */
export async function fetchSessionCloudSync(
	sessionId: string
): Promise<SessionCloudSyncStatus | null> {
	if (!sessionId) return null;
	try {
		const res = await fetch(`/api/cloud/sync/${encodeURIComponent(sessionId)}`);
		if (!res.ok) return null;
		const data = (await res.json()) as SessionCloudSyncStatus | null;
		return data && data.ok ? data : null;
	} catch {
		return null;
	}
}

/** Load a gallery session by ID. First tries server API, then falls back to IndexedDB. */
export async function loadGallerySession(id: string): Promise<GallerySession | null> {
	if (!id) return null;

	// 1. Try server API first
	try {
		const res = await fetch(`/api/gallery/${id}`);
		if (res.ok) {
			const data = (await res.json()) as GallerySession | null;
			if (data && data.id) {
				return data;
			}
		}
	} catch (err: unknown) {
		console.warn('Failed to load session from server API, trying IndexedDB:', err);
	}

	// 2. Fall back to IndexedDB
	try {
		const db = await openDB();
		return await new Promise<GallerySession | null>((resolve, reject) => {
			const tx = db.transaction(STORE_NAME, 'readonly');
			const req = tx.objectStore(STORE_NAME).get(id);
			req.onsuccess = () => resolve((req.result as GallerySession | null) || null);
			req.onerror = () => reject(req.error);
		});
	} catch (err: unknown) {
		console.warn('Failed to load session from IndexedDB:', err);
	}

	return null;
}

// ─── ID generation ──────────────────────────────────────────────────────────

export function generateId(): string {
	const chars = 'abcdefghijkmnpqrstuvwxyz23456789';
	let id = '';
	for (let i = 0; i < 8; i++) {
		id += chars[Math.floor(Math.random() * chars.length)];
	}
	return id;
}

// ─── QR Code generation ─────────────────────────────────────────────────────

/** Build a QR code data-URL / fallback URL for the given gallery link, offline first. */
export async function buildQRCodeDataUrl(galleryUrl: string, size = 300): Promise<string> {
	try {
		return await QRCodePkg.toDataURL(galleryUrl, {
			width: size,
			margin: 2,
			errorCorrectionLevel: 'M',
			color: {
				dark: '#1C1917',
				light: '#FFFFFF'
			}
		});
	} catch (err: unknown) {
		console.warn('QRCode.toDataURL failed, attempting SVG fallback:', err);
	}

	// Fallback 1: Local QRCode.toString generating clean offline SVG
	try {
		const svg = await QRCodePkg.toString(galleryUrl, { type: 'svg', width: size, margin: 2 });
		return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
	} catch (e2: unknown) {
		console.warn('QRCode.toString SVG fallback failed:', e2);
	}

	// Fallback 2: Reliable active public QR code API (https://api.qrserver.com)
	const encoded = encodeURIComponent(galleryUrl);
	return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encoded}`;
}

/**
 * Resolve the scannable gallery URL for a session.
 * Prefers configured publicBaseUrl (e.g. Cloudflare Tunnel / studio domain) when set.
 * Otherwise swaps localhost for the host machine's LAN IP while preserving active protocol (http/https).
 */
export async function resolveGalleryUrl(sessionId: string): Promise<string> {
	if (typeof window === 'undefined') return '';

	try {
		const cloudRes = await fetch('/api/cloud/google/status');
		if (cloudRes.ok) {
			const cloudData = (await cloudRes.json()) as { publicBaseUrl?: string | null };
			const pub = cloudData?.publicBaseUrl?.trim().replace(/\/+$/, '');
			if (pub && /^https?:\/\//i.test(pub)) {
				return `${pub}/gallery/${sessionId}`;
			}
		}
	} catch {
		// abaikan — lanjut pakai origin / LAN IP
	}

	const currentHost = window.location.hostname;
	const isLocalhost =
		currentHost === 'localhost' || currentHost === '127.0.0.1' || currentHost === '::1';

	if (isLocalhost) {
		try {
			const res = await fetch('/api/network-ip');
			if (res.ok) {
				const { ip } = (await res.json()) as { ip?: string | null };
				if (ip) {
					const proto = window.location.protocol === 'https:' ? 'https:' : 'http:';
					const port = window.location.port ? `:${window.location.port}` : '';
					return `${proto}//${ip}${port}/gallery/${sessionId}`;
				}
			}
		} catch (e: unknown) {
			console.warn('Could not resolve LAN IP:', e);
		}
	}

	return `${window.location.origin}/gallery/${sessionId}`;
}

// ─── Animated GIF creation (using gifenc) ───────────────────────────────────

interface AnimatedGifOptions {
	width?: number;
	height?: number;
	delayMs?: number;
}

/**
 * Convert a list of photo data-URLs into a looping animated GIF data-URL.
 * Switches between frames cleanly and ensures at least 5-6 seconds of playback.
 */
export async function buildAnimatedGif(
	photoUrls: string[],
	opts: AnimatedGifOptions = {}
): Promise<string> {
	const cleanUrls = photoUrls.filter(Boolean);
	if (cleanUrls.length === 0) throw new Error('No photos to encode');

	const W = opts.width || 480;
	const H = opts.height || 360;
	// Frame delay in milliseconds: default 1000ms (1.0s per frame)
	const delayMs = opts.delayMs || 1000;

	// Load and render all frames onto canvas to get RGBA ImageData
	const frames: ImageData[] = [];
	for (const url of cleanUrls) {
		const imgData = await drawToCanvas(url, W, H);
		frames.push(imgData);
	}

	// Ensure total animation duration is at least 5 seconds by repeating cycles
	// e.g. 3 photos * 1.0s = 3s -> 2 cycles = 6 seconds
	const singleCycleDuration = frames.length * delayMs;
	const minDurationMs = 5000;
	const cycleCount = Math.max(1, Math.ceil(minDurationMs / singleCycleDuration));

	const gif = GIFEncoder();

	for (let c = 0; c < cycleCount; c++) {
		for (const frame of frames) {
			const palette = quantize(frame.data, 256);
			const index = applyPalette(frame.data, palette);
			gif.writeFrame(index, W, H, { palette, delay: delayMs });
		}
	}

	gif.finish();
	const bytes = gif.bytes();
	const base64 = bytesToBase64(bytes);
	return `data:image/gif;base64,${base64}`;
}

async function drawToCanvas(url: string, w: number, h: number): Promise<ImageData> {
	const img = await loadImgElement(url);
	const canvas = document.createElement('canvas');
	canvas.width = w;
	canvas.height = h;
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('Canvas 2D context unavailable');

	const srcAspect = img.naturalWidth / img.naturalHeight;
	const dstAspect = w / h;
	let sw, sh, sx, sy;
	if (srcAspect > dstAspect) {
		sh = img.naturalHeight;
		sw = sh * dstAspect;
		sx = (img.naturalWidth - sw) / 2;
		sy = 0;
	} else {
		sw = img.naturalWidth;
		sh = sw / dstAspect;
		sx = 0;
		sy = (img.naturalHeight - sh) / 2;
	}
	ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
	return ctx.getImageData(0, 0, w, h);
}

function loadImgElement(url: string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const img = new Image();
		img.crossOrigin = 'anonymous';
		img.onload = () => resolve(img);
		img.onerror = reject;
		img.src = url;
	});
}

function bytesToBase64(bytes: Uint8Array): string {
	let binary = '';
	const len = bytes.byteLength;
	const chunkSize = 8192;
	for (let i = 0; i < len; i += chunkSize) {
		const chunk = bytes.subarray(i, Math.min(i + chunkSize, len));
		binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
	}
	return btoa(binary);
}
