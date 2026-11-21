/**
 * Shared domain types for the DISTUDIO Photobooth app.
 * One source of truth: session state, custom templates,
 * print products, render options, and gallery sessions live here.
 */

// ─── App shell ────────────────────────────────────────────────────────────────

export type Screen =
	'start' | 'strip' | 'camera' | 'review' | 'editor' | 'edit' | 'decorate' | 'timelapse' | 'print';

export type KioskTheme = 'dark' | 'light';

// ─── Camera screen settings ──────────────────────────────────────────────────

export type CameraTheme = 'clean' | 'croc' | 'polaroid' | 'film';

export type TimerDuration = 0 | 3 | 5 | 10;

export type FlashMode = 'off' | 'on' | 'auto';

export type CameraFilter = 'none' | 'grayscale' | 'sepia' | 'high-contrast' | 'warm' | 'cool';

export type GridOverlay = 'none' | 'thirds';

/** Preferensi timelapse/video (dipakai di /timelapse). */
export interface TimelapseSettings {
	/** Auto-generate saat buka /timelapse dan saat pengaturan berubah (debounce). */
	auto: boolean;
	speedMul: TimelapseSpeedMul;
	transition: 'none' | 'crossfade';
	/** Buat video MP4 selain GIF. */
	makeVideo: boolean;
}

export interface CameraSettings {
	theme: CameraTheme;
	timer: TimerDuration;
	flash: FlashMode;
	filter: CameraFilter;
	grid: GridOverlay;
	timelapse: TimelapseSettings;
}

export interface SessionState {
	screen: Screen;
	/** Captured photos as data URLs, in capture order. */
	photos: string[];
	retakeIndex: number | null;
	selectedTemplate: string;
	caption: string;
	showDate: boolean;
	cameraError: string | null;
	isCapturing: boolean;
	captureProgress: number;
	/** Foto yang dipakai strip (= jumlah slot frame aktif). */
	photoCount: number;
	/** Format standard yang dipilih tamu (mis. '2x6'). */
	formatId: string;
	/** Frame unggahan yang aktif; null = pakai template klasik. */
	activeFrame: PhotoFrame | null;
	/** Index foto yang dipakai (urut kronologis = urutan strip). Panjang = photoCount. */
	selectedPhotoIndices: number[];
	theme: KioskTheme;
	cameraSettings: CameraSettings;
	/** Per-photo edit transforms (rotation / flip / zoom) for the edit screen. */
	photoTransforms: (PhotoTransform | null)[];
	/** Sticker layers placed on the strip (editor edit screen). */
	stickers: StickerLayer[];
	/** Active color filter for the strip (editor edit screen). */
	photoFilter: string | null;
	/** GIF timelapse dari foto sesi (halaman timelapse). */
	timelapseDataUrl: string | null;
	/** Video MP4 (data URL) untuk unduh/unggah galeri; bisa besar. */
	timelapseVideoDataUrl: string | null;
	/** Metadata hasil timelapse terakhir (untuk deteksi perubahan pengaturan). */
	timelapseMeta: TimelapseMeta | null;
	/** Mirror horizontal preview — default ON per booth spec. */
	flipHorizontal: boolean;
}

// ─── Uploaded photo frames (Canva artwork + detected holes) ──────────────────

export interface PhotoFrame {
	id: string;
	name: string;
	/** Jumlah lubang foto; juga menentukan PRODUK cetak. */
	slotCount: number;
	/** Ukuran canvas asli artwork (px). */
	designWidth: number;
	designHeight: number;
	/** PNG atau SVG data URL. */
	artworkDataUrl: string;
	/** Slot ternormalisasi 0..1 hasil deteksi. */
	slots: CustomSlot[];
	/** Titik fokus crop default untuk slot portrait. */
	focal: 'center' | 'top';
	source: 'upload' | 'seed';
	/** Kategori format standard (mis. '2x6'); null = frame kustom (Frame Studio). */
	formatId?: string | null;
	/** Nonaktif = tidak tampil di kios (toggle admin). */
	enabled?: boolean;
	createdAt: number;
	updatedAt: number;
}

// ─── Custom templates (IndexedDB / localStorage persisted) ───────────────────

/** 0..1 normalized 2D point used for polygon slot geometry. */
export interface SlotPoint {
	x: number;
	y: number;
}

export interface CustomSlot {
	id: string;
	name: string;
	type: 'rect' | 'polygon' | 'circle';
	/** 0..1 normalized left. */
	x: number;
	/** 0..1 normalized top. */
	y: number;
	/** 0..1 normalized width. */
	width: number;
	/** 0..1 normalized height. */
	height: number;
	/** Degrees; rect slots only. */
	borderRadius?: number;
	/** Slot rotation in degrees (default 0). */
	rotation?: number;
	/** Normalized coordinates for polygon slots (3+ points). */
	points?: SlotPoint[];
	/** 0, 1, 2, 3… or null when the slot is empty. */
	assignedPhotoIndex: number | null;
	/** Zoom factor (default 1.0). */
	scale: number;
	/** Pan X in % of slot width (-0.5 .. 0.5). */
	offsetX: number;
	/** Pan Y in % of slot height (-0.5 .. 0.5). */
	offsetY: number;
}

export interface CustomTemplate {
	id: string;
	name: string;
	/** PNG or SVG data URL. */
	artworkDataUrl?: string;
	/** Whether artwork is drawn over the photo slots or under them. */
	artworkLayer?: 'overlay' | 'underlay';
	/** Hex or CSS color. */
	backgroundColor: string;
	/** Target strip width in px at 300 DPI (default 600). */
	width?: number;
	/** Target strip height in px at 300 DPI (default 1800). */
	height?: number;
	slots: CustomSlot[];
	isCustom: boolean;
	createdAt?: number;
	updatedAt?: number;
}

/** Per-photo edit transform: rotation (0/90/180/270), mirror, zoom. */
export interface PhotoTransform {
	rotation?: number;
	flipH?: boolean;
	scale?: number;
	/** Pan sumbu X (−1..1, fraksi dari ruang crop tersedia) — drag foto */
	offsetX?: number;
	/** Pan sumbu Y (−1..1, fraksi dari ruang crop tersedia) — drag foto */
	offsetY?: number;
}

/** Sticker placed on the strip; x/y/w/h are normalized 0..1 of the strip. */
export interface StickerLayer {
	id: string;
	stickerId: string;
	/** Gambar stiker (path) — fallback ke SVG builtin bila tidak ada. */
	src?: string;
	x: number;
	y: number;
	w: number;
	h: number;
	rotation?: number;
	opacity?: number;
	flipH?: boolean;
	flipV?: boolean;
}

// ─── Built-in strip presets ──────────────────────────────────────────────────

export interface BuiltinTemplate {
	id: string;
	label: string;
	bg: string;
	ink: string;
	accent: string;
	hairline: string;
	checkerA: string;
	checkerB: string;
	slotLine: string;
	/** Never set on built-in presets; widened only so unions can be tested truthily. */
	isCustom?: false;
}

export type ResolvedTemplate = CustomTemplate | BuiltinTemplate;

/** A resolved template is custom once it carries slots (storage guarantees that). */
export function isCustomTemplate(template: ResolvedTemplate): template is CustomTemplate {
	return template.isCustom || 'slots' in template;
}

// ─── Print products ──────────────────────────────────────────────────────────

interface ProductRow {
	h: number;
	cells: { w: number }[];
}

/** One photo-count product: true print size at 300 DPI, slot rows, paper copy count. */
export interface ProductSpec {
	/** Judul bawaan footer; footnote jumlah tiap strip. */
	nama: string;
	cm: string;
	pxW: number;
	pxH: number;
	margin: number;
	hairline: number;
	gap: number;
	footer: number;
	copySheet: 1 | 2;
	sheetOrient: 'portrait' | 'landscape';
	rows: ProductRow[];
	/** Garis potong putus-putus; hanya 2-strip side by side (4R Double). */
	cutLine?: 'vertical';
}

/** Photo count (1–6) → product. Unknown counts are guarded at read sites. */
export type Products = Record<number, ProductSpec>;

// ─── Canvas render options ───────────────────────────────────────────────────

export interface RenderOptions {
	/** Footer caption; empty string falls back to the product name. */
	caption?: string;
	showDate?: boolean;
	/** Draw the caption/date band on custom templates too. */
	renderCaptionOnCustom?: boolean;
	/** Draw slot number badges (1, 2, 3...) on preview slots. Defaults to true in editor. */
	showSlotNumbers?: boolean;
	/** Per-photo rotation / flip / zoom applied on top of the slot layout. */
	photoTransforms?: (PhotoTransform | null)[];
	/** Stickers placed on the strip (edit screen). */
	stickers?: StickerLayer[];
	/** Color filter key while rendering photos ('none' = plain). */
	photoFilter?: string | null;
	/** Index slot yang sedang terpilih di strip (indikator edit screen). */
	selectedSlot?: number | null;
	/** Jumlah salinan di lembar cetak; default mengikuti `PRODUK[n].copySheet`. */
	copies?: number;
	/** Format standard aktif (mis. '2x6'); dipakai produk cetak. */
	formatId?: string | null;
}

// ─── Timelapse (halaman timelapse) ──────────────────────────────────────────

export type TimelapseSpeedMul = 0.25 | 0.5 | 0.75 | 1 | 1.25 | 1.5 | 1.75 | 2;

export interface TimelapseMeta {
	speedMul: TimelapseSpeedMul;
	transition: 'none' | 'crossfade';
	hasVideo: boolean;
}

// ─── Gallery sessions ────────────────────────────────────────────────────────

export interface GallerySession {
	id: string;
	createdAt: string;
	photos: string[];
	stripDataUrl: string;
	templateKey: string;
	formatId?: string;
	gifDataUrl?: string | null;
	/** Video MP4 timelapse (data URL); opsional, bisa besar. */
	videoDataUrl?: string | null;
}
