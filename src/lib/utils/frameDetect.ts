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

export interface WandSlot extends DetectedBox {
	/** Pusat visual (0..1) untuk meletakkan nomor slot tepat di tengah area terlihat. */
	cx: number;
	cy: number;
	/** Titik awal flood-fill (0..1) bila dipilih menggunakan Magic Wand. */
	seedX?: number;
	seedY?: number;
	tolerance?: number;
	/** True bila area sudah transparan sejak awal sehingga tidak perlu dilubangi ulang. */
	alreadyTransparent?: boolean;
	/** PNG transparan berisi sorotan & garis kontur persis mengikuti bentuk lubang/stiker. */
	maskDataUrl?: string;
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

export function isJpegFile(file: File): boolean {
	return file.type === 'image/jpeg' || /\.jpe?g$/i.test(file.name);
}

export function isWebpFile(file: File): boolean {
	return file.type === 'image/webp' || /\.webp$/i.test(file.name);
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

/**
 * Hapus wilayah terpilih jadi transparan ("magic wand + delete") dan
 * mengembalikan PNG data URL baru. Dipakai saat menyimpan frame yang
 * punya slot terhapus, supaya artwork tidak lagi menampilkan kotaknya.
 */
export async function eraseRegions(dataUrl: string, boxes: DetectedBox[]): Promise<string> {
	const img = await loadImageElement(dataUrl);
	const canvas = document.createElement('canvas');
	canvas.width = img.naturalWidth;
	canvas.height = img.naturalHeight;
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('Kanvas tidak tersedia');
	ctx.drawImage(img, 0, 0);
	for (const box of boxes) {
		// Melebar 1px supaya tidak ada garis sisa di tepi kandidat.
		const x = Math.max(0, Math.floor(box.x * canvas.width) - 1);
		const y = Math.max(0, Math.floor(box.y * canvas.height) - 1);
		const w = Math.min(canvas.width - x, Math.ceil(box.width * canvas.width) + 2);
		const h = Math.min(canvas.height - y, Math.ceil(box.height * canvas.height) + 2);
		ctx.clearRect(x, y, w, h);
	}
	return canvas.toDataURL('image/png');
}

export interface TrimResult {
	dataUrl: string;
	width: number;
	height: number;
	trimmed: boolean;
}

/**
 * Potong margin transparan berlebih di sekeliling artwork (misalnya strip 2×6
 * yang diekspor pada kanvas 1:1) agar rasio dan dimensi akurat.
 */
export async function trimTransparentBounds(dataUrl: string): Promise<TrimResult> {
	const img = await loadImageElement(dataUrl);
	const origW = img.naturalWidth;
	const origH = img.naturalHeight;
	if (!origW || !origH) return { dataUrl, width: origW, height: origH, trimmed: false };

	const canvas = document.createElement('canvas');
	canvas.width = origW;
	canvas.height = origH;
	const ctx = canvas.getContext('2d');
	if (!ctx) return { dataUrl, width: origW, height: origH, trimmed: false };

	ctx.drawImage(img, 0, 0);
	const { data } = ctx.getImageData(0, 0, origW, origH);

	let minX = origW;
	let minY = origH;
	let maxX = -1;
	let maxY = -1;

	for (let y = 0; y < origH; y++) {
		const row = y * origW * 4;
		for (let x = 0; x < origW; x++) {
			if (data[row + x * 4 + 3] > 12) {
				if (x < minX) minX = x;
				if (x > maxX) maxX = x;
				if (y < minY) minY = y;
				if (y > maxY) maxY = y;
			}
		}
	}

	if (maxX <= minX || maxY <= minY) {
		return { dataUrl, width: origW, height: origH, trimmed: false };
	}

	const trimW = maxX - minX + 1;
	const trimH = maxY - minY + 1;

	// Hanya potong bila memang ada margin transparan signifikan (> 3% di salah satu sumbu).
	if (trimW >= origW * 0.97 && trimH >= origH * 0.97) {
		return { dataUrl, width: origW, height: origH, trimmed: false };
	}

	const out = document.createElement('canvas');
	out.width = trimW;
	out.height = trimH;
	const outCtx = out.getContext('2d');
	if (!outCtx) return { dataUrl, width: origW, height: origH, trimmed: false };

	outCtx.drawImage(canvas, minX, minY, trimW, trimH, 0, 0, trimW, trimH);
	return {
		dataUrl: out.toDataURL('image/png'),
		width: trimW,
		height: trimH,
		trimmed: true
	};
}

/**
 * Bangun gambar overlay sorotan biru + kontur 1px yang mengikuti bentuk persis
 * (sudut membulat, kelopak bunga, pita, atau stiker yang menutupi sebagian slot).
 */
function buildMaskOverlayDataUrl(visited: Uint8Array, w: number, h: number): string {
	const canvas = document.createElement('canvas');
	canvas.width = w;
	canvas.height = h;
	const ctx = canvas.getContext('2d');
	if (!ctx) return '';

	const imgData = ctx.createImageData(w, h);
	const out = imgData.data;

	for (let py = 0; py < h; py++) {
		const row = py * w;
		for (let px = 0; px < w; px++) {
			const idx = row + px;
			if (!visited[idx]) continue;

			const isEdge =
				px === 0 ||
				px === w - 1 ||
				py === 0 ||
				py === h - 1 ||
				!visited[idx - 1] ||
				!visited[idx + 1] ||
				!visited[idx - w] ||
				!visited[idx + w];

			const o = idx * 4;
			out[o] = 37; // #2563eb
			out[o + 1] = 99;
			out[o + 2] = 235;
			out[o + 3] = isEdge ? 245 : 78;
		}
	}

	ctx.putImageData(imgData, 0, 0);
	return canvas.toDataURL('image/png');
}

/**
 * Magic Wand (flood-fill cepat berbasis TypedArray) dari titik klik ternormalisasi (0..1).
 * Mengikuti sudut membulat (rounded) maupun stiker/ornamen yang menimpa tepi kotak foto.
 */
export async function magicWandSelect(
	dataUrl: string,
	normX: number,
	normY: number,
	tolerance = 32
): Promise<WandSlot | null> {
	const img = await loadImageElement(dataUrl);
	const scale = Math.min(1, MAX_DETECT_SIZE / Math.max(img.naturalWidth, img.naturalHeight));
	const w = Math.max(1, Math.round(img.naturalWidth * scale));
	const h = Math.max(1, Math.round(img.naturalHeight * scale));

	const canvas = document.createElement('canvas');
	canvas.width = w;
	canvas.height = h;
	const ctx = canvas.getContext('2d');
	if (!ctx) return null;

	ctx.drawImage(img, 0, 0, w, h);
	const data = ctx.getImageData(0, 0, w, h).data;

	const sx = Math.max(0, Math.min(w - 1, Math.round(normX * (w - 1))));
	const sy = Math.max(0, Math.min(h - 1, Math.round(normY * (h - 1))));
	const startIdx = sy * w + sx;
	const so = startIdx * 4;
	const sr = data[so];
	const sg = data[so + 1];
	const sb = data[so + 2];
	const sa = data[so + 3];
	const isTransparentSeed = sa < ALPHA_THRESHOLD;
	const tolSq = tolerance * tolerance;

	const total = w * h;
	const visited = new Uint8Array(total);
	const stack = new Int32Array(total);
	let top = 0;
	stack[top++] = startIdx;
	visited[startIdx] = 1;

	let minX = sx;
	let maxX = sx;
	let minY = sy;
	let maxY = sy;
	let sumX = 0;
	let sumY = 0;
	let area = 0;

	const matches = (idx: number): boolean => {
		const o = idx * 4;
		const a = data[o + 3];
		if (isTransparentSeed) return a < ALPHA_THRESHOLD;
		if (a < ALPHA_THRESHOLD) return false;
		const dr = data[o] - sr;
		const dg = data[o + 1] - sg;
		const db = data[o + 2] - sb;
		return dr * dr + dg * dg + db * db <= tolSq;
	};

	while (top > 0) {
		const idx = stack[--top];
		const px = idx % w;
		const py = (idx - px) / w;
		area++;
		sumX += px;
		sumY += py;
		if (px < minX) minX = px;
		if (px > maxX) maxX = px;
		if (py < minY) minY = py;
		if (py > maxY) maxY = py;

		if (px > 0 && !visited[idx - 1] && matches(idx - 1)) {
			visited[idx - 1] = 1;
			stack[top++] = idx - 1;
		}
		if (px < w - 1 && !visited[idx + 1] && matches(idx + 1)) {
			visited[idx + 1] = 1;
			stack[top++] = idx + 1;
		}
		if (py > 0 && !visited[idx - w] && matches(idx - w)) {
			visited[idx - w] = 1;
			stack[top++] = idx - w;
		}
		if (py < h - 1 && !visited[idx + w] && matches(idx + w)) {
			visited[idx + w] = 1;
			stack[top++] = idx + w;
		}
	}

	if (area < Math.max(20, total * 0.002) || area > total * 0.85) {
		return null;
	}

	return {
		x: minX / w,
		y: minY / h,
		width: (maxX - minX + 1) / w,
		height: (maxY - minY + 1) / h,
		cx: sumX / area / w,
		cy: sumY / area / h,
		seedX: normX,
		seedY: normY,
		tolerance,
		alreadyTransparent: isTransparentSeed,
		maskDataUrl: buildMaskOverlayDataUrl(visited, w, h)
	};
}

/**
 * Hapus piksel persis mengikuti bentuk Magic Wand (pixel-exact flood-fill pada resolusi penuh),
 * termasuk pelembutan tepi anti-alias 1px. Sudut membulat (rounded) maupun stiker/ornamen
 * yang menimpa kotak foto tetap utuh di atas foto tamu.
 */
export async function eraseWandRegions(dataUrl: string, slots: WandSlot[]): Promise<string> {
	const needErase = slots.filter((s) => !s.alreadyTransparent);
	if (needErase.length === 0) return dataUrl;

	const img = await loadImageElement(dataUrl);
	const w = img.naturalWidth;
	const h = img.naturalHeight;
	const canvas = document.createElement('canvas');
	canvas.width = w;
	canvas.height = h;
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('Kanvas tidak tersedia');

	ctx.drawImage(img, 0, 0);
	const imgData = ctx.getImageData(0, 0, w, h);
	const data = imgData.data;
	const total = w * h;
	const stack = new Int32Array(total);

	for (const slot of needErase) {
		if (slot.seedX === undefined || slot.seedY === undefined) {
			// Fallback persegi hanya bila slot tidak memiliki titik seed
			const rx = Math.max(0, Math.floor(slot.x * w));
			const ry = Math.max(0, Math.floor(slot.y * h));
			const rw = Math.min(w - rx, Math.ceil(slot.width * w));
			const rh = Math.min(h - ry, Math.ceil(slot.height * h));
			for (let py = ry; py < ry + rh; py++) {
				for (let px = rx; px < rx + rw; px++) {
					data[(py * w + px) * 4 + 3] = 0;
				}
			}
			continue;
		}

		const tol = slot.tolerance ?? 32;
		const tolSq = tol * tol;
		const softTol = tol * 1.65;
		const softTolSq = softTol * softTol;

		const sx = Math.max(0, Math.min(w - 1, Math.round(slot.seedX * (w - 1))));
		const sy = Math.max(0, Math.min(h - 1, Math.round(slot.seedY * (h - 1))));
		const startIdx = sy * w + sx;
		const so = startIdx * 4;
		if (data[so + 3] < ALPHA_THRESHOLD) continue;

		const sr = data[so];
		const sg = data[so + 1];
		const sb = data[so + 2];

		const visited = new Uint8Array(total);
		let top = 0;
		stack[top++] = startIdx;
		visited[startIdx] = 1;

		const matches = (idx: number): boolean => {
			const o = idx * 4;
			if (data[o + 3] < ALPHA_THRESHOLD) return false;
			const dr = data[o] - sr;
			const dg = data[o + 1] - sg;
			const db = data[o + 2] - sb;
			return dr * dr + dg * dg + db * db <= tolSq;
		};

		while (top > 0) {
			const idx = stack[--top];
			const px = idx % w;
			const py = (idx - px) / w;

			if (px > 0 && !visited[idx - 1] && matches(idx - 1)) {
				visited[idx - 1] = 1;
				stack[top++] = idx - 1;
			}
			if (px < w - 1 && !visited[idx + 1] && matches(idx + 1)) {
				visited[idx + 1] = 1;
				stack[top++] = idx + 1;
			}
			if (py > 0 && !visited[idx - w] && matches(idx - w)) {
				visited[idx - w] = 1;
				stack[top++] = idx - w;
			}
			if (py < h - 1 && !visited[idx + w] && matches(idx + w)) {
				visited[idx + w] = 1;
				stack[top++] = idx + w;
			}
		}

		// Hapus piksel interior menjadi transparan penuh + haluskan tepi anti-alias 1px
		for (let i = 0; i < total; i++) {
			if (visited[i]) {
				data[i * 4 + 3] = 0;
			}
		}

		for (let py = 1; py < h - 1; py++) {
			const row = py * w;
			for (let px = 1; px < w - 1; px++) {
				const idx = row + px;
				if (visited[idx]) continue;
				if (!visited[idx - 1] && !visited[idx + 1] && !visited[idx - w] && !visited[idx + w]) {
					continue;
				}
				const o = idx * 4;
				const a = data[o + 3];
				if (a === 0) continue;
				const dr = data[o] - sr;
				const dg = data[o + 1] - sg;
				const db = data[o + 2] - sb;
				const dSq = dr * dr + dg * dg + db * db;
				if (dSq <= softTolSq) {
					const dist = Math.sqrt(dSq);
					const ratio = Math.max(0, Math.min(1, (dist - tol) / Math.max(1, softTol - tol)));
					data[o + 3] = Math.round(a * ratio);
				}
			}
		}
	}

	ctx.putImageData(imgData, 0, 0);
	return canvas.toDataURL('image/png');
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
