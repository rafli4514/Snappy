/**
 * Frame detection — membaca lubang transparan pada artwork frame (PNG/SVG)
 * dan mengubahnya menjadi slot ternormalisasi 0..1.
 *
 * Dipakai halaman admin upload frame dan template builder lama.
 */

import type { CustomSlot } from '#lib/types';

export interface DetectedBox {
	/** 0..1 relatif terhadap artwork. */
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface DetectOptions {
	mode?: 'transparent' | 'key';
	/** Hex color, dipakai saat mode = 'key'. */
	keyColor?: string;
	/** Ikutkan area transparan yang menyentuh tepi artwork. */
	includeEdges?: boolean;
	/** Sisi terpanjang saat rasterisasi (default 720). */
	maxSize?: number;
}

export interface DetectResult {
	boxes: DetectedBox[];
	width: number;
	height: number;
}

const MAX_DETECT_SIZE = 720;
const ALPHA_THRESHOLD = 48;
const KEY_TOLERANCE = 80;
const MIN_AREA_RATIO = 0.004;
const MAX_AREA_RATIO = 0.85;

/** Baca file sebagai data URL. */
export function fileToDataUrl(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = (e) => resolve((e.target as FileReader | null)?.result as string);
		reader.onerror = () => reject(new Error('Gagal membaca file'));
		reader.readAsDataURL(file);
	});
}

export function isSvgFile(file: File): boolean {
	return file.type === 'image/svg+xml' || /\.svg$/i.test(file.name);
}

export function isPngFile(file: File): boolean {
	return file.type === 'image/png' || /\.png$/i.test(file.name);
}

/** Buang script, event handler, dan referensi eksternal dari SVG. */
export function sanitizeSvg(svg: string): string {
	return svg
		.replace(/<script[\s\S]*?<\/script>/gi, '')
		.replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, '')
		.replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, '')
		.replace(/\son[a-z]+\s*=\s*'[^']*'/gi, '')
		.replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, '')
		.replace(/\s(href|xlink:href)\s*=\s*"(?!#|data:)[^"]*"/gi, '')
		.replace(/\s(href|xlink:href)\s*=\s*'(?!#|data:)[^']*'/gi, '');
}

/** Data URL aman untuk SVG yang sudah disanitasi. */
export function svgToDataUrl(svg: string): string {
	return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(sanitizeSvg(svg))}`;
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const img = new Image();
		img.crossOrigin = 'anonymous';
		img.onload = () => resolve(img);
		img.onerror = () => reject(new Error('Gagal memuat artwork'));
		img.src = src;
	});
}

/**
 * Deteksi lubang foto dari artwork.
 * Mengembalikan box ternormalisasi, urut atas→bawah lalu kiri→kanan.
 */
export async function detectFrameSlots(
	dataUrl: string,
	options: DetectOptions = {}
): Promise<DetectResult> {
	const mode = options.mode ?? 'transparent';
	const includeEdges = options.includeEdges ?? false;
	const maxSize = options.maxSize ?? MAX_DETECT_SIZE;
	const img = await loadImageElement(dataUrl);

	const scale = Math.min(1, maxSize / Math.max(img.naturalWidth, img.naturalHeight));
	const w = Math.max(1, Math.round(img.naturalWidth * scale));
	const h = Math.max(1, Math.round(img.naturalHeight * scale));

	const canvas = document.createElement('canvas');
	canvas.width = w;
	canvas.height = h;
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('Kanvas tidak tersedia');

	ctx.drawImage(img, 0, 0, w, h);
	const data = ctx.getImageData(0, 0, w, h).data;

	const n = w * h;
	const cls = new Uint8Array(n); // 0 = bukan lubang, 1 = lubang, 2 = luar
	const key = parseHexColor(options.keyColor ?? '#ff00ff');

	for (let i = 0; i < n; i++) {
		const o = i * 4;
		const a = data[o + 3];
		if (mode === 'transparent') {
			cls[i] = a < ALPHA_THRESHOLD ? 1 : 0;
		} else if (key) {
			const dr = data[o] - key.r;
			const dg = data[o + 1] - key.g;
			const db = data[o + 2] - key.b;
			cls[i] = Math.sqrt(dr * dr + dg * dg + db * db) < KEY_TOLERANCE && a > 40 ? 1 : 0;
		}
	}

	if (!includeEdges) markOuterArea(cls, w, h);
	const grown = dilate(cls, w, h);
	const boxes = collectBoxes(grown, w, h, MIN_AREA_RATIO, MAX_AREA_RATIO);

	return {
		boxes: boxes.sort((a, b) => a.y - b.y || a.x - b.x),
		width: img.naturalWidth,
		height: img.naturalHeight
	};
}

/** Ubah hasil deteksi menjadi slot siap render. */
export function boxesToSlots(boxes: DetectedBox[]): CustomSlot[] {
	const stamp = Date.now();
	return boxes.map((box, i) => ({
		id: `slot-${stamp}-${i}`,
		name: `${i + 1}`,
		type: 'rect' as const,
		x: box.x,
		y: box.y,
		width: box.width,
		height: box.height,
		rotation: 0,
		borderRadius: 0,
		assignedPhotoIndex: i,
		scale: 1.0,
		offsetX: 0,
		offsetY: 0
	}));
}

function parseHexColor(hex: string): { r: number; g: number; b: number } | null {
	const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
	if (!m) return null;
	const v = parseInt(m[1], 16);
	return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 };
}

/** Tandai area lubang yang tersambung tepi sebagai area luar (2). */
function markOuterArea(cls: Uint8Array, w: number, h: number): void {
	const stack: number[] = [];
	const push = (idx: number): void => {
		if (cls[idx] === 1) {
			cls[idx] = 2;
			stack.push(idx);
		}
	};
	for (let x = 0; x < w; x++) {
		push(x);
		push((h - 1) * w + x);
	}
	for (let y = 0; y < h; y++) {
		push(y * w);
		push(y * w + w - 1);
	}
	while (stack.length) {
		const idx = stack.pop() as number;
		const px = idx % w;
		if (px > 0) push(idx - 1);
		if (px < w - 1) push(idx + 1);
		if (idx >= w) push(idx - w);
		if (idx < w * h - w) push(idx + w);
	}
}

/** Dilatasi 1px supaya lubang yang terpotong garis tipis menyatu. */
function dilate(cls: Uint8Array, w: number, h: number): Uint8Array {
	const out = new Uint8Array(cls.length);
	for (let i = 0; i < cls.length; i++) {
		if (cls[i] !== 1) continue;
		const px = i % w;
		const py = (i - px) / w;
		out[i] = 1;
		if (px > 0) out[i - 1] = 1;
		if (px < w - 1) out[i + 1] = 1;
		if (py > 0) out[i - w] = 1;
		if (py < h - 1) out[i + w] = 1;
	}
	return out;
}

/** Connected component → bounding box (dikembalikan ke ukuran asli). */
function collectBoxes(
	mask: Uint8Array,
	w: number,
	h: number,
	minAreaRatio: number,
	maxAreaRatio: number
): DetectedBox[] {
	const total = w * h;
	const minArea = Math.max(24, Math.round(total * minAreaRatio));
	const maxArea = Math.round(total * maxAreaRatio);
	const visited = new Uint8Array(mask.length);
	const boxes: DetectedBox[] = [];

	for (let i = 0; i < mask.length; i++) {
		if (mask[i] !== 1 || visited[i]) continue;
		let minX = w;
		let minY = h;
		let maxX = -1;
		let maxY = -1;
		let area = 0;
		visited[i] = 1;
		const stack = [i];

		while (stack.length) {
			const idx = stack.pop() as number;
			const px = idx % w;
			const py = (idx - px) / w;
			area++;
			if (px < minX) minX = px;
			if (px > maxX) maxX = px;
			if (py < minY) minY = py;
			if (py > maxY) maxY = py;

			if (px > 0) pushNeighbor(mask, visited, stack, idx - 1);
			if (px < w - 1) pushNeighbor(mask, visited, stack, idx + 1);
			if (idx >= w) pushNeighbor(mask, visited, stack, idx - w);
			if (idx < mask.length - w) pushNeighbor(mask, visited, stack, idx + w);
		}

		if (area < minArea || area > maxArea) continue;

		// Kompensasi dilatasi 1px di tiap sisi.
		const x = Math.max(0, minX + 1);
		const y = Math.max(0, minY + 1);
		const right = Math.min(w - 1, maxX - 1);
		const bottom = Math.min(h - 1, maxY - 1);
		if (right <= x || bottom <= y) continue;

		boxes.push({
			x: x / w,
			y: y / h,
			width: (right - x + 1) / w,
			height: (bottom - y + 1) / h
		});
	}

	return boxes;
}

function pushNeighbor(mask: Uint8Array, visited: Uint8Array, stack: number[], idx: number): void {
	if (mask[idx] === 1 && !visited[idx]) {
		visited[idx] = 1;
		stack.push(idx);
	}
}
