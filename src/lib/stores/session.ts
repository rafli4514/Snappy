/**
 * Session Store — Central application state
 * All photo session data lives here.
 * Data is cleared on reset or page reload (no persistence).
 * Kios theme is persisted separately (localStorage) so a kiosk restart remembers it.
 */

import { writable, derived, get } from 'svelte/store';
import { goto } from '$app/navigation';
import { DEFAULT_FORMAT_ID, formatById } from '#lib/data/standardFormats';
import type {
	CameraSettings,
	KioskTheme,
	PhotoFrame,
	PhotoTransform,
	Screen,
	SessionState,
	StickerLayer,
	TimelapseMeta,
	TimelapseSettings
} from '#lib/types';

/** Theme persistence key: the kios choice survives page reloads via localStorage */
const THEME_KEY = 'distudio-theme';
const CAMERA_SETTINGS_KEY = 'distudio-camera-settings';

const DEFAULT_TIMELAPSE_SETTINGS: TimelapseSettings = {
	auto: true,
	speedMul: 1,
	transition: 'none',
	makeVideo: true
};

const DEFAULT_CAMERA_SETTINGS: CameraSettings = {
	theme: 'clean',
	timer: 3, // PhotoDefaultIntervalCapture = 3 seconds
	flash: 'off',
	filter: 'none',
	grid: 'none',
	timelapse: { ...DEFAULT_TIMELAPSE_SETTINGS }
};

function mergeCameraSettings(saved: Partial<CameraSettings> | null | undefined): CameraSettings {
	const s = saved || {};
	return {
		...DEFAULT_CAMERA_SETTINGS,
		...s,
		timelapse: { ...DEFAULT_TIMELAPSE_SETTINGS, ...(s.timelapse || {}) }
	};
}

function initialCameraSettings(): CameraSettings {
	if (typeof window === 'undefined') return mergeCameraSettings(null);
	try {
		const saved = localStorage.getItem(CAMERA_SETTINGS_KEY);
		if (saved) return mergeCameraSettings(JSON.parse(saved) as Partial<CameraSettings>);
	} catch {
		/* proceed with defaults */
	}
	return mergeCameraSettings(null);
}

function initialTheme(): KioskTheme {
	if (typeof window === 'undefined') return 'light';
	try {
		// Default light; pilihan user yang tersimpan selalu menang
		return localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light';
	} catch {
		return 'light';
	}
}

export const session = writable<SessionState>({
	screen: 'start',
	photos: [],
	retakeIndex: null,
	selectedTemplate: 'classic',
	caption: '',
	showDate: true,
	cameraError: null,
	isCapturing: false,
	captureProgress: 0,
	photoCount: 4, // jumlah foto strip aktif (dibatasi rentang format)
	formatId: DEFAULT_FORMAT_ID,
	activeFrame: null,
	selectedPhotoIndices: [],
	theme: initialTheme(),
	cameraSettings: initialCameraSettings(),
	photoTransforms: [],
	stickers: [],
	photoFilter: 'none',
	timelapseDataUrl: null,
	timelapseVideoDataUrl: null,
	timelapseMeta: null,
	flipHorizontal: true // PhotoDefaultFlipHorizontal = 1
});

/** Derived: is a photo set complete? */
export const isPhotoSetComplete = derived(
	session,
	($s) =>
		$s.photos.length >= $s.photoCount &&
		$s.selectedPhotoIndices.length === $s.photoCount &&
		$s.photos.every(Boolean)
);

/**
 * Foto yang masuk strip: pilihan tamu bila ada, kalau belum
 * jatuh ke N foto pertama supaya preview tetap terisi.
 */
export const stripPhotos = derived(session, ($s) => {
	const picked = $s.selectedPhotoIndices
		.map((i) => $s.photos[i])
		.filter((p): p is string => Boolean(p));
	if (picked.length) return picked;
	return $s.photos.slice(0, $s.photoCount);
});

// ─── Action Functions ───────────────────────────────────────────────────────

/** Path rute untuk tiap layar kios — satu-satunya pemetaan nama → URL */
const SCREEN_PATH: Record<Screen, string> = {
	start: '/',
	strip: '/strip',
	camera: '/camera',
	review: '/review',
	editor: '/editor',
	edit: '/edit',
	decorate: '/decorate',
	timelapse: '/timelapse',
	print: '/print'
};

/** Set the kios theme ('dark' | 'light'); persisted for the next kiosk boot */
export function setTheme(theme: KioskTheme): void {
	session.update((s) => ({ ...s, theme }));
	if (typeof window !== 'undefined') {
		try {
			localStorage.setItem(THEME_KEY, theme);
		} catch {
			/* storage unavailable — theme lasts for this session only */
		}
	}
}

type CameraSettingsPatch = Partial<Omit<CameraSettings, 'timelapse'>> & {
	timelapse?: Partial<TimelapseSettings>;
};

/** Update camera settings (partial merge, termasuk timelapse); persisted to localStorage */
export function setCameraSettings(partial: CameraSettingsPatch): void {
	session.update((s) => {
		const cameraSettings = mergeCameraSettings({
			...s.cameraSettings,
			...partial,
			timelapse: partial.timelapse
				? { ...s.cameraSettings.timelapse, ...partial.timelapse }
				: s.cameraSettings.timelapse
		});
		if (typeof window !== 'undefined') {
			try {
				localStorage.setItem(CAMERA_SETTINGS_KEY, JSON.stringify(cameraSettings));
			} catch {
				/* storage unavailable */
			}
		}
		return { ...s, cameraSettings };
	});
}

/** Navigate to a specific screen — navigasi sungguhan via rute SvelteKit */
export function goTo(screen: Screen): void {
	session.update((s) => (s.screen === screen ? s : { ...s, screen }));
	void goto(SCREEN_PATH[screen]);
}

/** Set camera error string, or null to clear */
export function setCameraError(error: string | null): void {
	session.update((s) => ({ ...s, cameraError: error }));
}

/** Begin a fresh capture session */
export function beginCapture(): void {
	session.update((s) => ({
		...s,
		photos: [],
		selectedPhotoIndices: [],
		retakeIndex: null,
		isCapturing: true,
		captureProgress: 0,
		cameraError: null,
		screen: 'camera'
	}));
	void goto(SCREEN_PATH.camera);
}

/** Add a captured photo (data URL) to the session */
export function addPhoto(dataUrl: string): void {
	session.update((s) => {
		const photos = [...s.photos];
		if (s.retakeIndex !== null) {
			photos[s.retakeIndex] = dataUrl;
			return { ...s, photos, captureProgress: s.captureProgress };
		}
		photos.push(dataUrl);
		// Kamera jalan sekali per slot — slot yang sudah terisi langsung dipilih.
		const selectedPhotoIndices = Array.from(
			{ length: Math.min(photos.length, s.photoCount) },
			(_, i) => i
		);
		return {
			...s,
			photos,
			selectedPhotoIndices,
			captureProgress: photos.length
		};
	});
}

/**
 * Urutan strip = `selectedPhotoIndices`. Reorder mengubah larik itu supaya
 * foto yang tampil di editor benar-benar bertukar tempat; tanpa pilihan
 * (sesi lama) jatuh ke larik `photos`.
 */
function reorderStrip(
	s: SessionState,
	mutate: (order: (number | string)[]) => (number | string)[]
): SessionState {
	if (s.selectedPhotoIndices.length > 1) {
		const order = mutate([...s.selectedPhotoIndices]) as number[];
		return { ...s, selectedPhotoIndices: order };
	}
	const photos = [...s.photos];
	mutate(photos);
	return { ...s, photos };
}

/** Swap position of two photos in the strip order */
export function swapPhotos(index1: number, index2: number): void {
	session.update((s) =>
		reorderStrip(s, (order) => {
			if (index1 >= 0 && index1 < order.length && index2 >= 0 && index2 < order.length) {
				[order[index1], order[index2]] = [order[index2], order[index1]];
			}
			return order;
		})
	);
}

/** Move a photo from one position to another (drag and drop reordering) */
export function movePhoto(fromIndex: number, toIndex: number): void {
	session.update((s) =>
		reorderStrip(s, (order) => {
			if (
				fromIndex >= 0 &&
				fromIndex < order.length &&
				toIndex >= 0 &&
				toIndex < order.length &&
				fromIndex !== toIndex
			) {
				const [moved] = order.splice(fromIndex, 1);
				order.splice(toIndex, 0, moved);
			}
			return order;
		})
	);
}

/** Mark a specific photo slot for retake */
export function setRetakeIndex(index: number | null): void {
	session.update((s) => ({ ...s, retakeIndex: index }));
}

/** Mark capturing as done, transition to review */
export function finishCapture(): void {
	const current = get(session);
	const hasSet =
		current.photos.length > 0 && current.selectedPhotoIndices.length === current.photoCount;
	session.update((s) => ({
		...s,
		isCapturing: false,
		retakeIndex: null,
		selectedPhotoIndices:
			s.selectedPhotoIndices.length === s.photoCount
				? s.selectedPhotoIndices
				: evenIndices(s.photos.length, s.photoCount),
		screen: hasSet ? 'review' : 'start'
	}));
	void goto(SCREEN_PATH[hasSet ? 'review' : 'start']);
}

/** Pilih preset kertas bawaan; template custom yang aktif ikut dilepas */
export function selectBuiltinTemplate(key: string): void {
	session.update((s) => ({ ...s, selectedTemplate: key }));
}

/** Pilih format standard; jumlah foto menyesuaikan default format. */
export function setFormat(formatId: string): void {
	session.update((s) => {
		const format = formatById(formatId);
		const photoCount = format.photos.includes(s.photoCount) ? s.photoCount : format.defaultCount;
		return {
			...s,
			formatId: format.id,
			photoCount,
			selectedPhotoIndices: []
		};
	});
}

/** Set photo count — dibatasi rentang jumlah foto format yang dipilih. */
export function setPhotoCount(count: number): void {
	session.update((s) => {
		const format = formatById(s.formatId);
		const allowed = format.photos;
		const clamped = Math.min(Math.max(Math.round(count), allowed[0]), allowed[allowed.length - 1]);
		const safe = allowed.includes(clamped)
			? clamped
			: allowed.reduce((a, b) => (Math.abs(b - clamped) < Math.abs(a - clamped) ? b : a));
		return {
			...s,
			photoCount: safe,
			selectedPhotoIndices: s.selectedPhotoIndices.slice(0, safe)
		};
	});
}

/** Pilih N index foto dengan jarak merata (0, 3, 6, 9 untuk 4 dari 10). */
function evenIndices(total: number, take: number): number[] {
	if (total <= 0 || take <= 0) return [];
	const n = Math.min(take, total);
	if (n === 1) return [Math.floor((total - 1) / 2)];
	return Array.from({ length: n }, (_, i) => Math.round((i * (total - 1)) / (n - 1)));
}

/** Pasang frame aktif; jumlah slot menentukan photoCount. */
export function setActiveFrame(frame: PhotoFrame | null): void {
	session.update((s) => {
		if (!frame) {
			return { ...s, activeFrame: null, selectedPhotoIndices: [] };
		}
		const slotCount = Math.min(6, Math.max(1, frame.slots.length));
		const selectedPhotoIndices = s.photos.length ? evenIndices(s.photos.length, slotCount) : [];
		return {
			...s,
			activeFrame: frame,
			photoCount: slotCount,
			selectedPhotoIndices
		};
	});
}

/** Set per-photo edit transform (rotation / flip / zoom) — edit screen */
export function updatePhotoTransform(index: number, transform: PhotoTransform | null): void {
	session.update((s) => {
		const photoTransforms = [...(s.photoTransforms || [])];
		while (photoTransforms.length < (s.photos || []).length) photoTransforms.push(null);
		const i = Math.min(index, photoTransforms.length - 1);
		photoTransforms[i] = transform;
		return { ...s, photoTransforms };
	});
}

/** Add a sticker layer onto the strip (edit screen) */
export function addSticker(layer: StickerLayer): void {
	session.update((s) => ({ ...s, stickers: [...(s.stickers || []), layer] }));
}

/** Move a sticker layer (drag-geser di preview edit screen) */
export function moveSticker(id: string, x: number, y: number): void {
	session.update((s) => ({
		...s,
		stickers: (s.stickers || []).map((l) => (l.id === id ? { ...l, x, y } : l))
	}));
}

/** Update sticker layer properties (size/rotation/opacity/pos) — edit screen */
export function updateSticker(id: string, patch: Partial<StickerLayer>): void {
	session.update((s) => ({
		...s,
		stickers: (s.stickers || []).map((l) => (l.id === id ? { ...l, ...patch } : l))
	}));
}

/** Pindahkan layer stiker ke posisi layer lain (drag reorder). */
export function moveStickerLayer(fromId: string, toId: string): void {
	if (fromId === toId) return;
	session.update((s) => {
		const list = [...(s.stickers || [])];
		const from = list.findIndex((l) => l.id === fromId);
		const to = list.findIndex((l) => l.id === toId);
		if (from < 0 || to < 0) return s;
		const [moved] = list.splice(from, 1);
		list.splice(to, 0, moved);
		return { ...s, stickers: list };
	});
}

/** Remove a sticker layer (edit screen) */
export function removeSticker(id: string): void {
	session.update((s) => ({ ...s, stickers: (s.stickers || []).filter((l) => l.id !== id) }));
}

/** Set the strip color filter key (edit screen) */
export function setPhotoFilter(filter: string | null): void {
	session.update((s) => ({ ...s, photoFilter: filter }));
}

/** Simpan GIF + video timelapse + metadata (halaman timelapse). */
export function setTimelapseResult(
	dataUrl: string | null,
	videoDataUrl: string | null,
	meta: TimelapseMeta | null
): void {
	session.update((s) => ({
		...s,
		timelapseDataUrl: dataUrl,
		timelapseVideoDataUrl: videoDataUrl,
		timelapseMeta: meta
	}));
}

/** Full session reset — clears all photos and returns to start (keeps kios theme + camera settings) */
export function resetSession(): void {
	const currentTheme = get(session).theme;
	const currentCameraSettings = get(session).cameraSettings;
	session.set({
		screen: 'start',
		photos: [],
		retakeIndex: null,
		selectedTemplate: 'classic',
		caption: '',
		showDate: true,
		cameraError: null,
		isCapturing: false,
		captureProgress: 0,
		photoCount: 4,
		formatId: DEFAULT_FORMAT_ID,
		activeFrame: null,
		selectedPhotoIndices: [],
		theme: currentTheme || 'light',
		cameraSettings: mergeCameraSettings(currentCameraSettings),
		photoTransforms: [],
		stickers: [],
		photoFilter: 'none',
		timelapseDataUrl: null,
		timelapseVideoDataUrl: null,
		timelapseMeta: null,
		flipHorizontal: true
	});
	void goto(SCREEN_PATH.start);
}
