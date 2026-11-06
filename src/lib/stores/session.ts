/**
 * Session Store — Central application state
 * All photo session data lives here.
 * Data is cleared on reset or page reload (no persistence).
 * Kios theme is persisted separately (localStorage) so a kiosk restart remembers it.
 */

import { writable, derived, get } from 'svelte/store';
import { goto } from '$app/navigation';
import type {
	CameraSettings,
	CustomTemplate,
	KioskTheme,
	PhotoFrame,
	PhotoTransform,
	Screen,
	SessionState,
	StickerLayer
} from '#lib/types';

/** Theme persistence key: the kios choice survives page reloads via localStorage */
const THEME_KEY = 'distudio-theme';
const CAMERA_SETTINGS_KEY = 'distudio-camera-settings';

const DEFAULT_CAMERA_SETTINGS: CameraSettings = {
	theme: 'clean',
	timer: 3, // PhotoDefaultIntervalCapture = 3 seconds
	flash: 'off',
	filter: 'none',
	grid: 'none'
};

function initialCameraSettings(): CameraSettings {
	if (typeof window === 'undefined') return { ...DEFAULT_CAMERA_SETTINGS };
	try {
		const saved = localStorage.getItem(CAMERA_SETTINGS_KEY);
		if (saved) return { ...DEFAULT_CAMERA_SETTINGS, ...JSON.parse(saved) };
	} catch {
		/* proceed with defaults */
	}
	return { ...DEFAULT_CAMERA_SETTINGS };
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
	photoCount: 4, // jumlah slot strip (1–6)
	activeFrame: null,
	selectedPhotoIndices: [],
	customTemplateData: null,
	theme: initialTheme(),
	cameraSettings: initialCameraSettings(),
	photoTransforms: [],
	stickers: [],
	photoFilter: 'none',
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

/** Update camera settings (partial merge); persisted to localStorage */
export function setCameraSettings(partial: Partial<CameraSettings>): void {
	session.update((s) => {
		const cameraSettings = { ...s.cameraSettings, ...partial };
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
	session.update((s) => ({
		...s,
		isCapturing: false,
		retakeIndex: null,
		selectedPhotoIndices:
			s.selectedPhotoIndices.length === s.photoCount
				? s.selectedPhotoIndices
				: evenIndices(s.photos.length, s.photoCount),
		screen: 'review'
	}));
	void goto(SCREEN_PATH.review);
}

/** Pilih preset kertas bawaan; template custom yang aktif ikut dilepas */
export function selectBuiltinTemplate(key: string): void {
	session.update((s) => ({ ...s, selectedTemplate: key, customTemplateData: null }));
}

/** Update caption text */
export function setCaption(text: string): void {
	session.update((s) => ({ ...s, caption: text }));
}

/** Toggle date stamp */
export function toggleDate(): void {
	session.update((s) => ({ ...s, showDate: !s.showDate }));
}

/** Set photo count (1–6) — ranges outside are guarded */
export function setPhotoCount(count: number): void {
	const safe = Math.min(6, Math.max(1, Math.round(count)));
	session.update((s) => ({
		...s,
		photoCount: safe,
		selectedPhotoIndices: s.selectedPhotoIndices.slice(0, safe)
	}));
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
			customTemplateData: null,
			selectedPhotoIndices
		};
	});
}

/** Pilih ulang foto otomatis (jarak merata) dari foto yang tersedia. */
export function autoSelectPhotos(): void {
	session.update((s) => ({
		...s,
		selectedPhotoIndices: evenIndices(s.photos.length, s.photoCount)
	}));
}

/** Tambah/lepas satu foto dari pilihan; batas = photoCount. */
export function toggleSelectedPhoto(index: number): void {
	session.update((s) => {
		const current = s.selectedPhotoIndices;
		if (current.includes(index)) {
			return { ...s, selectedPhotoIndices: current.filter((i) => i !== index) };
		}
		if (current.length >= s.photoCount) return s;
		return {
			...s,
			selectedPhotoIndices: [...current, index].sort((a, b) => a - b)
		};
	});
}

export function clearSelectedPhotos(): void {
	session.update((s) => ({ ...s, selectedPhotoIndices: [] }));
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

/** Remove a sticker layer (edit screen) */
export function removeSticker(id: string): void {
	session.update((s) => ({ ...s, stickers: (s.stickers || []).filter((l) => l.id !== id) }));
}

/** Set the strip color filter key (edit screen) */
export function setPhotoFilter(filter: string | null): void {
	session.update((s) => ({ ...s, photoFilter: filter }));
}

/** Set active custom template object */
export function setCustomTemplate(template: CustomTemplate | null): void {
	session.update((s) => ({
		...s,
		selectedTemplate: template ? template.id : 'classic',
		customTemplateData: template || null
	}));
}

/** Update photo assignment for a specific slot in the active custom template */
export function updateSlotAssignment(slotId: string, photoIndex: number | null): void {
	session.update((s) => {
		if (!s.customTemplateData || !s.customTemplateData.slots) return s;
		const slots = s.customTemplateData.slots.map((slot) => {
			if (slot.id === slotId) {
				return { ...slot, assignedPhotoIndex: photoIndex };
			}
			return slot;
		});
		return {
			...s,
			customTemplateData: {
				...s.customTemplateData,
				slots
			}
		};
	});
}

export interface SlotTransform {
	scale?: number;
	offsetX?: number;
	offsetY?: number;
}

/** Update crop scale and pan offsets for a specific slot */
export function updateSlotTransform(
	slotId: string,
	{ scale, offsetX, offsetY }: SlotTransform
): void {
	session.update((s) => {
		if (!s.customTemplateData || !s.customTemplateData.slots) return s;
		const slots = s.customTemplateData.slots.map((slot) => {
			if (slot.id === slotId) {
				return {
					...slot,
					scale: scale !== undefined ? scale : slot.scale,
					offsetX: offsetX !== undefined ? offsetX : slot.offsetX,
					offsetY: offsetY !== undefined ? offsetY : slot.offsetY
				};
			}
			return slot;
		});
		return {
			...s,
			customTemplateData: {
				...s.customTemplateData,
				slots
			}
		};
	});
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
		activeFrame: null,
		selectedPhotoIndices: [],
		customTemplateData: null,
		theme: currentTheme || 'light',
		cameraSettings: currentCameraSettings || { ...DEFAULT_CAMERA_SETTINGS },
		photoTransforms: [],
		stickers: [],
		photoFilter: 'none',
		flipHorizontal: true
	});
	void goto(SCREEN_PATH.start);
}
