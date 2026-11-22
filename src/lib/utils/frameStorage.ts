/**
 * Penyimpanan frame unggahan.
 *
 * Utama: API server `/api/assets/frames` (SQLite + file artwork biner di disk).
 * Cadangan & migrasi otomatis: IndexedDB lokal browser (`distudio-frames`).
 */

import type { CustomTemplate, PhotoFrame } from '#lib/types';

const DB_NAME = 'distudio-frames';
const DB_VERSION = 1;
const STORE = 'frames';
const MIGRATED_KEY = 'distudio-frames-migrated-v1';

let _migrating: Promise<PhotoFrame[]> | null = null;

function openDB(): Promise<IDBDatabase | null> {
	return new Promise((resolve) => {
		if (typeof window === 'undefined' || !window.indexedDB) {
			resolve(null);
			return;
		}
		const req = indexedDB.open(DB_NAME, DB_VERSION);
		req.onupgradeneeded = (event: IDBVersionChangeEvent) => {
			const db = (event.target as IDBOpenDBRequest).result;
			if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
		};
		req.onsuccess = (event) => resolve((event.target as IDBOpenDBRequest).result);
		req.onerror = () => {
			console.warn('IndexedDB frame tidak bisa dibuka');
			resolve(null);
		};
	});
}

async function readLocalFrames(): Promise<PhotoFrame[]> {
	const db = await openDB();
	if (!db) return [];
	return new Promise((resolve) => {
		const tx = db.transaction(STORE, 'readonly');
		const req = tx.objectStore(STORE).getAll();
		req.onsuccess = () => {
			const frames = (req.result as PhotoFrame[]) || [];
			resolve(frames.sort((a, b) => b.updatedAt - a.updatedAt));
		};
		req.onerror = () => resolve([]);
	});
}

async function putLocalFrame(frame: PhotoFrame): Promise<void> {
	const db = await openDB();
	if (!db) return;
	return new Promise((resolve, reject) => {
		const tx = db.transaction(STORE, 'readwrite');
		const req = tx.objectStore(STORE).put(frame);
		req.onsuccess = () => resolve();
		req.onerror = () => reject(new Error('Gagal menyimpan frame'));
	});
}

async function removeLocalFrame(id: string): Promise<void> {
	const db = await openDB();
	if (!db) return;
	return new Promise((resolve) => {
		const tx = db.transaction(STORE, 'readwrite');
		const req = tx.objectStore(STORE).delete(id);
		req.onsuccess = () => resolve();
		req.onerror = () => resolve();
	});
}

async function migrateLocalFramesIfNeeded(serverFrames: PhotoFrame[]): Promise<PhotoFrame[]> {
	if (typeof window === 'undefined') return serverFrames;
	try {
		if (window.localStorage.getItem(MIGRATED_KEY) === '1') {
			return serverFrames;
		}
	} catch {
		// Abaikan bila localStorage tidak tersedia
	}

	if (!_migrating) {
		_migrating = (async () => {
			const local = await readLocalFrames();
			if (local.length === 0) {
				try {
					window.localStorage.setItem(MIGRATED_KEY, '1');
				} catch {
					// ignore
				}
				return serverFrames;
			}

			const serverIds = new Set(serverFrames.map((f) => f.id));
			const uploaded: PhotoFrame[] = [];
			let allOk = true;

			for (const frame of local) {
				if (!frame?.id || serverIds.has(frame.id)) continue;
				try {
					const res = await fetch('/api/assets/frames', {
						method: 'POST',
						headers: { 'content-type': 'application/json' },
						body: JSON.stringify(frame)
					});
					const data = (await res.json().catch(() => null)) as {
						ok?: boolean;
						item?: PhotoFrame;
					} | null;
					if (res.ok && data?.ok && data.item) {
						uploaded.push(data.item);
						serverIds.add(data.item.id);
					} else {
						allOk = false;
					}
				} catch {
					allOk = false;
				}
			}

			if (allOk) {
				try {
					window.localStorage.setItem(MIGRATED_KEY, '1');
				} catch {
					// ignore
				}
			}

			return [...uploaded, ...serverFrames].sort((a, b) => b.updatedAt - a.updatedAt);
		})().finally(() => {
			_migrating = null;
		});
	}

	return _migrating;
}

export async function listFrames(): Promise<PhotoFrame[]> {
	if (typeof window === 'undefined') return [];

	try {
		const res = await fetch('/api/assets/frames');
		if (res.ok) {
			const data = (await res.json()) as { ok?: boolean; items?: PhotoFrame[] };
			if (data?.ok && Array.isArray(data.items)) {
				const synced = await migrateLocalFramesIfNeeded(data.items);
				return synced.sort((a, b) => b.updatedAt - a.updatedAt);
			}
		}
	} catch {
		// Server tidak tersedia — lanjut fallback IndexedDB lokal
	}

	return readLocalFrames();
}

export async function saveFrame(frame: PhotoFrame): Promise<void> {
	if (typeof window === 'undefined') return;

	try {
		const res = await fetch('/api/assets/frames', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(frame)
		});
		const data = (await res.json().catch(() => null)) as {
			ok?: boolean;
			item?: PhotoFrame;
			error?: string;
		} | null;

		if (res.ok && data?.ok) {
			await putLocalFrame(data.item ?? frame).catch(() => undefined);
			return;
		}
		if (res.status >= 400 && res.status < 500) {
			throw new Error(data?.error || 'Gagal menyimpan frame');
		}
	} catch (err) {
		if (err instanceof Error && err.message !== 'Failed to fetch') {
			// Bila error validasi eksplisit dari server, lempar; jika jaringan gagal, fallback ke IndexedDB
			if (err.name !== 'TypeError') throw err;
		}
	}

	await putLocalFrame(frame);
}

export async function deleteFrame(id: string): Promise<void> {
	if (typeof window === 'undefined') return;

	try {
		await fetch('/api/assets/frames', {
			method: 'DELETE',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ id })
		});
	} catch {
		// Abaikan jika backend offline; tetap hapus dari IndexedDB lokal
	}

	await removeLocalFrame(id);
}

/** Bungkus frame jadi template yang bisa dirender `renderStripPreview`. */
export function frameToTemplate(frame: PhotoFrame): CustomTemplate {
	const focalOffsetY = frame.focal === 'top' ? -0.05 : 0;
	return {
		id: `frame-${frame.id}`,
		name: frame.name,
		isCustom: true,
		artworkLayer: 'overlay',
		artworkDataUrl: frame.artworkDataUrl,
		backgroundColor: '#FFFFFF',
		width: frame.designWidth,
		height: frame.designHeight,
		slots: frame.slots.map((slot, i) => ({
			...slot,
			id: slot.id || `slot-${i}`,
			name: slot.name || `${i + 1}`,
			assignedPhotoIndex: i,
			scale: slot.scale ?? 1,
			offsetX: slot.offsetX ?? 0,
			offsetY: (slot.offsetY ?? 0) + focalOffsetY
		}))
	};
}

/** Ukuran canvas yang dibutuhkan untuk jumlah slot tertentu. */
interface FrameSizeGuide {
	slotCount: number;
	width: number;
	height: number;
	cm: string;
}

export const FRAME_SIZE_GUIDES: FrameSizeGuide[] = [
	{ slotCount: 1, width: 1536, height: 828, cm: '13 × 7 cm' },
	{ slotCount: 2, width: 591, height: 1772, cm: '15 × 5 cm' },
	{ slotCount: 3, width: 709, height: 1772, cm: '15 × 6 cm' },
	{ slotCount: 4, width: 1181, height: 1772, cm: '10 × 15 cm' },
	{ slotCount: 5, width: 1181, height: 1772, cm: '10 × 15 cm' },
	{ slotCount: 6, width: 1181, height: 1772, cm: '10 × 15 cm' }
];

export function sizeGuideFor(slotCount: number): FrameSizeGuide | null {
	return FRAME_SIZE_GUIDES.find((g) => g.slotCount === slotCount) ?? null;
}

/** Selisih rasio > 1% dianggap tidak cocok. */
export function ratioMatches(width: number, height: number, slotCount: number): boolean {
	const guide = sizeGuideFor(slotCount);
	if (!guide || width <= 0 || height <= 0) return false;
	const actual = width / height;
	const expected = guide.width / guide.height;
	return Math.abs(actual / expected - 1) <= 0.01;
}
