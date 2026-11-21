/**
 * Penyimpanan frame unggahan.
 *
 * IndexedDB terpisah dari template klasik supaya artwork besar (PNG Canva
 * beberapa MB) tidak ikut tersalin ke localStorage.
 */

import type { CustomTemplate, PhotoFrame } from '#lib/types';

const DB_NAME = 'distudio-frames';
const DB_VERSION = 1;
const STORE = 'frames';

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

export async function listFrames(): Promise<PhotoFrame[]> {
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

export async function saveFrame(frame: PhotoFrame): Promise<void> {
	const db = await openDB();
	if (!db) throw new Error('Penyimpanan frame tidak tersedia');
	return new Promise((resolve, reject) => {
		const tx = db.transaction(STORE, 'readwrite');
		const req = tx.objectStore(STORE).put(frame);
		req.onsuccess = () => resolve();
		req.onerror = () => reject(new Error('Gagal menyimpan frame'));
	});
}

export async function deleteFrame(id: string): Promise<void> {
	const db = await openDB();
	if (!db) return;
	return new Promise((resolve) => {
		const tx = db.transaction(STORE, 'readwrite');
		const req = tx.objectStore(STORE).delete(id);
		req.onsuccess = () => resolve();
		req.onerror = () => resolve();
	});
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
