<script lang="ts">
	import { onMount } from 'svelte';
	import {
		session,
		goTo,
		setPhotoFilter,
		addSticker,
		moveSticker,
		removeSticker,
		moveStickerLayer,
		updateSticker,
		updatePhotoTransform,
		stripPhotos
	} from '#lib/stores/session';
	import { PRODUK, renderStripPreview, getProductForCount } from '#lib/utils/canvas';
	import { frameToTemplate } from '#lib/utils/frameStorage';
	import {
		findStickerByDbId,
		getStickerCategories,
		getStickersByCategory,
		stickerSrc,
		type StickerAsset
	} from '#lib/data/stickers';
	import { findPhotoFilter, getFilterGroups } from '#lib/data/filters';
	import { customFiltersStore, customStickersStore } from '#lib/services/customAssets';
	import ThemeToggle from '#lib/components/ui/ThemeToggle.svelte';
	import StudioFrame from '#lib/components/ui/StudioFrame.svelte';
	import type { PhotoTransform, StickerLayer } from '#lib/types';

	let canvas: HTMLCanvasElement;
	let canvasWrap: HTMLDivElement;
	let dragLayerId: string | null = null;
	let selectedPhoto = 0;

	$: theme = $session.theme;
	$: photos = $stripPhotos;
	$: photoCount = $session.photoCount;
	$: activeFrame = $session.activeFrame;
	$: caption = $session.caption;
	$: showDate = $session.showDate;
	$: photoTransforms = $session.photoTransforms;
	$: stickers = $session.stickers;
	$: photoFilter = $session.photoFilter;
	$: product = getProductForCount(photoCount, $session.formatId) || PRODUK[4];
	$: isLandscapeSheet = product.pxW >= product.pxH;
	$: photoFilterCss =
		(void $customFiltersStore,
		photoFilter ? (findPhotoFilter(photoFilter)?.cssFilter ?? 'none') : 'none');

	$: stickerCategories = (void $customStickersStore, getStickerCategories());
	$: if (
		stickerCategories.length &&
		!stickerCategories.some((c) => c.key === selectedStickerCategory)
	) {
		selectedStickerCategory = stickerCategories[0].key;
	}
	$: stickerList = (void $customStickersStore, getStickersByCategory(selectedStickerCategory));
	$: if (selectedStickerId && !stickers.some((s) => s.id === selectedStickerId)) {
		selectedStickerId = null;
	}
	$: selectedSticker = selectedStickerId
		? (stickers.find((s) => s.id === selectedStickerId) ?? null)
		: null;
	$: stickerOpacityPct = Math.round((selectedSticker?.opacity ?? 1) * 100);
	$: activeTemplate = activeFrame ? frameToTemplate(activeFrame) : $session.selectedTemplate;

	// Nilai transform foto terpilih
	$: selectedTransform = photoTransforms[selectedPhoto] ?? null;
	$: rotationValue = selectedTransform?.rotation ?? 0;
	$: zoomValue = Math.round((selectedTransform?.scale ?? 1) * 100);
	$: posXValue = Math.round((selectedTransform?.offsetX ?? 0) * 100);
	$: posYValue = Math.round((selectedTransform?.offsetY ?? 0) * 100);
	$: zoomAtDefault = (selectedTransform?.scale ?? 1) === 1;
	$: posXAtDefault = (selectedTransform?.offsetX ?? 0) === 0;
	$: posYAtDefault = (selectedTransform?.offsetY ?? 0) === 0;

	type LeftTab = 'foto' | 'layer';
	let leftTab: LeftTab = 'foto';

	type RightTab = 'foto' | 'filter' | 'stiker';
	const RIGHT_TABS: { id: RightTab; label: string }[] = [
		{ id: 'foto', label: 'Foto' },
		{ id: 'filter', label: 'Filter' },
		{ id: 'stiker', label: 'Stiker' }
	];
	let activeTab: RightTab = 'foto';

	let selectedStickerCategory = 'Vintage';
	let selectedStickerId: string | null = null;
	let showSlotNumbers = true;
	let canvasZoom = 1;
	const ZOOM_MIN = 0.5;
	const ZOOM_MAX = 2.5;
	let renderSeq = 0;

	function zoomIn(): void {
		canvasZoom = Math.min(ZOOM_MAX, Math.round(canvasZoom * 1.2 * 100) / 100);
	}

	function zoomOut(): void {
		canvasZoom = Math.max(ZOOM_MIN, Math.round((canvasZoom / 1.2) * 100) / 100);
	}

	function zoomFit(): void {
		canvasZoom = 1;
	}

	const FILTER_LABELS: Record<string, string> = {
		Essential: 'Essential',
		Retro: 'Retro',
		Fun: 'Fun',
		Distort: 'Distort',
		'Black & White': 'B&W',
		Custom: 'Custom'
	};

	$: filterGroups =
		(void $customFiltersStore,
		(() => {
			const groups = getFilterGroups();
			const order = ['Essential', 'Retro', 'Fun', 'Distort', 'Black & White'];
			const keys = [
				...order.filter((k) => groups[k]?.length),
				...Object.keys(groups).filter((k) => !order.includes(k) && groups[k]?.length)
			];
			return keys.map((k) => ({
				key: k,
				label: FILTER_LABELS[k] || k,
				filters: groups[k]
			}));
		})());

	async function renderPreview(): Promise<void> {
		if (!canvas) return;
		const seq = ++renderSeq;
		const isStale = (): boolean => seq !== renderSeq;
		const p = getProductForCount($session.photoCount, $session.formatId) || PRODUK[4];
		canvas.width = Math.round(p.pxW / 2);
		canvas.height = Math.round(p.pxH / 2);
		await renderStripPreview(
			canvas,
			photos,
			activeTemplate,
			{
				caption,
				showDate,
				showSlotNumbers,
				photoTransforms,
				stickers,
				photoFilter: photoFilterCss,
				selectedSlot: selectedStickerId ? undefined : selectedPhoto,
				formatId: $session.formatId
			},
			isStale
		);
	}

	// Satu jalur reaktif + guard renderSeq/isStale
	$: (caption,
		showDate,
		showSlotNumbers,
		photos,
		photoTransforms,
		stickers,
		photoFilter,
		selectedPhoto,
		selectedStickerId,
		canvas && photos.length && activeTemplate && renderPreview());

	onMount(() => {
		void renderPreview();
	});

	// ── Kontrol transform foto ──
	function transformFor(index: number): PhotoTransform | null {
		return photoTransforms[index] ?? null;
	}

	function rotatePhoto(index: number, direction: 1 | -1): void {
		const t = transformFor(index) ?? {};
		const base = typeof t.rotation === 'number' ? t.rotation : 0;
		const next = Math.round((((base + direction * 90) % 360) + 360) % 360);
		updatePhotoTransform(index, { ...t, rotation: next });
	}

	function flipPhoto(index: number): void {
		const t = transformFor(index) ?? {};
		updatePhotoTransform(index, { ...t, flipH: !t.flipH });
	}

	function setZoom(index: number, scale: number): void {
		const t = transformFor(index) ?? {};
		updatePhotoTransform(index, { ...t, scale });
	}

	function handleZoom(e: Event & { currentTarget: HTMLInputElement }): void {
		setZoom(selectedPhoto, Number(e.currentTarget.value) / 100);
	}

	function handleRotation(e: Event & { currentTarget: HTMLInputElement }): void {
		const t = transformFor(selectedPhoto) ?? {};
		updatePhotoTransform(selectedPhoto, { ...t, rotation: Number(e.currentTarget.value) });
	}

	function handleOffsetSlider(
		axis: 'x' | 'y',
		e: Event & { currentTarget: HTMLInputElement }
	): void {
		const t = transformFor(selectedPhoto) ?? {};
		const v = Number(e.currentTarget.value) / 100;
		if (axis === 'x') updatePhotoTransform(selectedPhoto, { ...t, offsetX: v });
		else updatePhotoTransform(selectedPhoto, { ...t, offsetY: v });
	}

	type ResettableField = 'rotation' | 'scale' | 'offsetX' | 'offsetY';

	function resetTransformField(field: ResettableField): void {
		const next: PhotoTransform = { ...(transformFor(selectedPhoto) ?? {}) };
		switch (field) {
			case 'rotation':
				next.rotation = 0;
				break;
			case 'scale':
				next.scale = 1;
				break;
			case 'offsetX':
				next.offsetX = 0;
				break;
			case 'offsetY':
				next.offsetY = 0;
				break;
		}
		updatePhotoTransform(selectedPhoto, next);
	}

	// ── Stiker & Canva-style Transform Guide (Move, Scale 4 sudut, Rotate) ──
	type TransformMode = 'move' | 'scale' | 'rotate';

	let activeTransform: {
		mode: TransformMode;
		id: string;
		rect: DOMRect;
		startClientX: number;
		startClientY: number;
		startX: number;
		startY: number;
		startW: number;
		startH: number;
		centerX: number;
		centerY: number;
		startDist: number;
		startAngle: number;
		startRotation: number;
	} | null = null;

	let snapCenterX = false;
	let snapCenterY = false;

	function startStickerTransform(mode: TransformMode, st: StickerLayer, e: PointerEvent): void {
		if (!canvasWrap) return;
		e.stopPropagation();
		e.preventDefault();
		selectedStickerId = st.id;
		const rect = canvasWrap.getBoundingClientRect();
		if (!rect.width || !rect.height) return;
		const centerX = rect.left + st.x * rect.width;
		const centerY = rect.top + st.y * rect.height;
		const startDist = Math.max(12, Math.hypot(e.clientX - centerX, e.clientY - centerY));
		const startAngle = (Math.atan2(e.clientY - centerY, e.clientX - centerX) * 180) / Math.PI;
		activeTransform = {
			mode,
			id: st.id,
			rect,
			startClientX: e.clientX,
			startClientY: e.clientY,
			startX: st.x,
			startY: st.y,
			startW: st.w,
			startH: st.h,
			centerX,
			centerY,
			startDist,
			startAngle,
			startRotation: st.rotation ?? 0
		};
		try {
			(e.currentTarget as HTMLElement)?.setPointerCapture(e.pointerId);
		} catch {
			/* ignore */
		}
	}

	function handleWindowPointerMove(e: PointerEvent): void {
		if (!activeTransform) return;
		const tr = activeTransform;
		if (tr.mode === 'move') {
			let nx = tr.startX + (e.clientX - tr.startClientX) / tr.rect.width;
			let ny = tr.startY + (e.clientY - tr.startClientY) / tr.rect.height;
			if (Math.abs(nx - 0.5) < 0.018) {
				nx = 0.5;
				snapCenterX = true;
			} else {
				snapCenterX = false;
			}
			if (Math.abs(ny - 0.5) < 0.014) {
				ny = 0.5;
				snapCenterY = true;
			} else {
				snapCenterY = false;
			}
			moveSticker(tr.id, Math.max(-0.2, Math.min(1.2, nx)), Math.max(-0.2, Math.min(1.2, ny)));
		} else if (tr.mode === 'scale') {
			const curDist = Math.max(12, Math.hypot(e.clientX - tr.centerX, e.clientY - tr.centerY));
			const factor = curDist / tr.startDist;
			const nextW = Math.max(0.06, Math.min(1.4, tr.startW * factor));
			const ratio = nextW / tr.startW;
			const nextH = tr.startH * ratio;
			updateSticker(tr.id, { w: nextW, h: nextH });
		} else if (tr.mode === 'rotate') {
			const curAngle = (Math.atan2(e.clientY - tr.centerY, e.clientX - tr.centerX) * 180) / Math.PI;
			let deg = Math.round(tr.startRotation + (curAngle - tr.startAngle));
			deg = ((((deg + 180) % 360) + 360) % 360) - 180;
			// Snap lembut di kelipatan 90° (±3°)
			for (const snap of [-180, -90, 0, 90, 180]) {
				if (Math.abs(deg - snap) <= 3) {
					deg = snap === -180 ? 180 : snap;
					break;
				}
			}
			updateSticker(tr.id, { rotation: deg });
		}
	}

	function handleWindowPointerUp(): void {
		if (!activeTransform) return;
		activeTransform = null;
		snapCenterX = false;
		snapCenterY = false;
	}

	function handleKeyDown(e: KeyboardEvent): void {
		if (!selectedStickerId) return;
		const tag = (e.target as HTMLElement | null)?.tagName;
		if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
		if (e.key === 'Delete' || e.key === 'Backspace') {
			e.preventDefault();
			handleRemoveSticker(selectedStickerId);
		} else if (e.key === 'Escape') {
			selectedStickerId = null;
		}
	}

	function stickerHitAtPoint(clientX: number, clientY: number): StickerLayer | null {
		const target = canvas;
		if (!target) return null;
		const rect = target.getBoundingClientRect();
		if (!rect.width || !rect.height) return null;
		const fx = (clientX - rect.left) / rect.width;
		const fy = (clientY - rect.top) / rect.height;
		const px = fx * target.width;
		const py = fy * target.height;
		for (let i = stickers.length - 1; i >= 0; i--) {
			const st = stickers[i];
			const sw = st.w * target.width;
			const sh = st.h * target.height;
			const cx = st.x * target.width;
			const cy = st.y * target.height;
			const dx = px - cx;
			const dy = py - cy;
			const ang = -((st.rotation || 0) * Math.PI) / 180;
			const cos = Math.cos(ang);
			const sin = Math.sin(ang);
			const lx = dx * cos - dy * sin;
			const ly = dx * sin + dy * cos;
			if (lx >= -sw / 2 && lx <= sw / 2 && ly >= -sh / 2 && ly <= sh / 2) return st;
		}
		return null;
	}

	function preloadPanImages(list: string[]): void {
		for (const src of list) {
			if (src) panImage(src);
		}
	}

	$: preloadPanImages(photos || []);

	function handleAddSticker(sticker: StickerAsset): void {
		const p = getProductForCount(photoCount, $session.formatId) || PRODUK[4];
		const aspect = (sticker.size?.w || 200) / Math.max(1, sticker.size?.h || 200);
		const w = p.pxW >= p.pxH ? 0.24 : 0.38;
		const h = Math.min(0.6, Math.max(0.05, (w * p.pxW) / (aspect * p.pxH)));
		const layer: StickerLayer = {
			id: `sticker-${sticker.dbId}-${Date.now()}`,
			stickerId: `sticker-${sticker.dbId}`,
			src: stickerSrc(sticker),
			x: 0.5,
			y: 0.35,
			w,
			h,
			rotation: 0,
			opacity: 1
		};
		addSticker(layer);
		selectedStickerId = layer.id;
	}

	function handleRemoveSticker(id: string): void {
		removeSticker(id);
		if (selectedStickerId === id) selectedStickerId = null;
	}

	function placedStickerName(id: string): string {
		const dbId = Number(id.replace(/^sticker-/, ''));
		const asset = Number.isFinite(dbId) ? findStickerByDbId(dbId) : undefined;
		return asset ? asset.name : id;
	}

	function stickerThumbSrc(l: StickerLayer): string {
		return l.src ?? '';
	}

	function handleStickerOpacity(e: Event & { currentTarget: HTMLInputElement }): void {
		if (!selectedStickerId) return;
		updateSticker(selectedStickerId, { opacity: Number(e.currentTarget.value) / 100 });
	}

	function toggleStickerFlip(axis: 'h' | 'v'): void {
		if (!selectedStickerId || !selectedSticker) return;
		if (axis === 'h') updateSticker(selectedStickerId, { flipH: !selectedSticker.flipH });
		else updateSticker(selectedStickerId, { flipV: !selectedSticker.flipV });
	}

	function resetSelectedSticker(): void {
		if (!selectedStickerId || !selectedSticker) return;
		const p = getProductForCount(photoCount, $session.formatId) || PRODUK[4];
		const aspect = (selectedSticker.w * p.pxW) / Math.max(1, selectedSticker.h * p.pxH);
		const w = p.pxW >= p.pxH ? 0.24 : 0.38;
		const h = (w * p.pxW) / (aspect * p.pxH);
		updateSticker(selectedStickerId, {
			x: 0.5,
			y: 0.35,
			w,
			h,
			rotation: 0,
			opacity: 1,
			flipH: false,
			flipV: false
		});
	}

	function onLayerDragStart(id: string, e: DragEvent): void {
		dragLayerId = id;
		selectedStickerId = id;
		if (e.dataTransfer) {
			e.dataTransfer.effectAllowed = 'move';
			e.dataTransfer.setData('text/plain', id);
		}
	}

	function onLayerDragOver(targetId: string, e: DragEvent): void {
		e.preventDefault();
		if (!dragLayerId || dragLayerId === targetId) return;
		if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
		moveStickerLayer(dragLayerId, targetId);
	}

	function onLayerDragEnd(): void {
		dragLayerId = null;
	}

	function handleNext(): void {
		goTo('timelapse');
	}

	// ── Pan & pilih foto langsung di kanvas ──
	interface PhotoHit {
		photoIndex: number;
		slotX: number;
		slotY: number;
		slotW: number;
		slotH: number;
		slotScale: number;
	}

	function photoHitAtPoint(clientX: number, clientY: number): PhotoHit | null {
		const target = canvas;
		if (!target) return null;
		const rect = target.getBoundingClientRect();
		if (!rect.width || !rect.height) return null;
		const fx = (clientX - rect.left) / rect.width;
		const fy = (clientY - rect.top) / rect.height;
		const px = fx * target.width;
		const py = fy * target.height;
		const p = getProductForCount(photoCount, $session.formatId) || PRODUK[4];

		const custom = typeof activeTemplate === 'string' ? null : activeTemplate;
		if (custom) {
			const slots = custom.slots || [];
			for (let i = 0; i < slots.length; i++) {
				const s = slots[i];
				const sx = s.x * target.width;
				const sy = s.y * target.height;
				const sw = s.width * target.width;
				const sh = s.height * target.height;
				const slotRotation = ((s.rotation || 0) * Math.PI) / 180;
				let testX = px;
				let testY = py;
				if (slotRotation) {
					const cx = sx + sw / 2;
					const cy = sy + sh / 2;
					const dx = px - cx;
					const dy = py - cy;
					const cos = Math.cos(slotRotation);
					const sin = Math.sin(slotRotation);
					testX = cx + dx * cos + dy * sin;
					testY = cy - dx * sin + dy * cos;
				}
				if (testX >= sx && testX <= sx + sw && testY >= sy && testY <= sy + sh) {
					return {
						photoIndex: s.assignedPhotoIndex ?? i,
						slotX: sx,
						slotY: sy,
						slotW: sw,
						slotH: sh,
						slotScale: s.scale ?? 1
					};
				}
			}
			return null;
		}

		const k = target.width / p.pxW;
		const ky = target.height / p.pxH;
		const areaY = p.margin * ky;
		const footerH = p.footer * ky;
		const footerY = target.height - footerH;
		const areaH = footerY - areaY - p.margin * ky;
		const usedH = p.rows.reduce((a, r) => a + r.h, 0) * ky + (p.rows.length - 1) * p.gap * ky;
		let cursorY = areaY + (areaH - usedH) / 2;
		const mirrorDoubleStrip =
			p.cutLine === 'vertical' &&
			p.rows.length > 0 &&
			p.rows.every((r) => r.cells.length === 2) &&
			photoCount <= p.rows.length;
		let slotIdx = 0;
		for (let rowIndex = 0; rowIndex < p.rows.length; rowIndex++) {
			const row = p.rows[rowIndex];
			const rowH = row.h * ky;
			const rowW = row.cells.reduce((a, c) => a + c.w, 0) * k + (row.cells.length - 1) * p.gap * k;
			let cursorX = (target.width - rowW) / 2;
			for (const cell of row.cells) {
				const w = cell.w * k;
				if (px >= cursorX && px <= cursorX + w && py >= cursorY && py <= cursorY + rowH) {
					return {
						photoIndex: mirrorDoubleStrip ? rowIndex : slotIdx,
						slotX: cursorX,
						slotY: cursorY,
						slotW: w,
						slotH: rowH,
						slotScale: 1
					};
				}
				slotIdx += 1;
				cursorX += w + p.gap * k;
			}
			cursorY += rowH + p.gap * ky;
		}
		return null;
	}

	const panImageCache = new Map<string, HTMLImageElement>();

	function panImage(src: string | undefined): HTMLImageElement | null {
		if (!src) return null;
		let img = panImageCache.get(src);
		if (!img) {
			img = new Image();
			img.src = src;
			panImageCache.set(src, img);
		}
		return img;
	}

	function panBounds(
		img: HTMLImageElement,
		slotW: number,
		slotH: number,
		scale: number
	): { maxShiftX: number; maxShiftY: number } {
		const cover = Math.max(slotW / img.naturalWidth, slotH / img.naturalHeight);
		const zoom = Math.max(0.5, Math.min(4, scale));
		const drawW = img.naturalWidth * cover * zoom;
		const drawH = img.naturalHeight * cover * zoom;
		return {
			maxShiftX: Math.abs(drawW - slotW) / 2,
			maxShiftY: Math.abs(drawH - slotH) / 2
		};
	}

	let photoDrag: {
		photoIndex: number;
		slotW: number;
		slotH: number;
		baseScale: number;
		startX: number;
		startY: number;
		startOffsetX: number;
		startOffsetY: number;
		moved: boolean;
	} | null = null;

	function handleCanvasPointerDown(e: PointerEvent): void {
		const stickerHit = stickerHitAtPoint(e.clientX, e.clientY);
		if (stickerHit) {
			photoDrag = null;
			startStickerTransform('move', stickerHit, e);
			return;
		}
		selectedStickerId = null;
		const hit = photoHitAtPoint(e.clientX, e.clientY);
		if (!hit) {
			photoDrag = null;
			return;
		}
		const t = photoTransforms[hit.photoIndex] ?? {};
		photoDrag = {
			photoIndex: hit.photoIndex,
			slotW: hit.slotW,
			slotH: hit.slotH,
			baseScale: typeof t.scale === 'number' ? t.scale : hit.slotScale,
			startX: e.clientX,
			startY: e.clientY,
			startOffsetX: typeof t.offsetX === 'number' ? t.offsetX : 0,
			startOffsetY: typeof t.offsetY === 'number' ? t.offsetY : 0,
			moved: false
		};
		try {
			canvas.setPointerCapture(e.pointerId);
		} catch {
			/* ignore */
		}
	}

	let panRaf: number | null = null;
	let panPending: {
		photoIndex: number;
		offsetX: number;
		offsetY: number;
	} | null = null;

	function flushPan(): void {
		panRaf = null;
		if (!panPending) return;
		const { photoIndex, offsetX, offsetY } = panPending;
		const t = photoTransforms[photoIndex] ?? {};
		updatePhotoTransform(photoIndex, { ...t, offsetX, offsetY });
		panPending = null;
	}

	function handleCanvasPointerMove(e: PointerEvent): void {
		if (!photoDrag || !canvas) return;
		const img = panImage(photos[photoDrag.photoIndex]);
		if (!img || !img.complete || !img.naturalWidth) return;
		const { maxShiftX, maxShiftY } = panBounds(
			img,
			photoDrag.slotW,
			photoDrag.slotH,
			photoDrag.baseScale
		);
		const rect = canvas.getBoundingClientRect();
		const cssPerImage = rect.width / canvas.width;
		const dxCss = e.clientX - photoDrag.startX;
		const dyCss = e.clientY - photoDrag.startY;
		if (!photoDrag.moved && Math.hypot(dxCss, dyCss) < 5) return;
		photoDrag.moved = true;
		const dxCanvas = cssPerImage > 0 ? dxCss / cssPerImage : 0;
		const dyCanvas = cssPerImage > 0 ? dyCss / cssPerImage : 0;
		const offsetX =
			maxShiftX > 0 ? photoDrag.startOffsetX - dxCanvas / maxShiftX : photoDrag.startOffsetX;
		const offsetY =
			maxShiftY > 0 ? photoDrag.startOffsetY - dyCanvas / maxShiftY : photoDrag.startOffsetY;
		panPending = {
			photoIndex: photoDrag.photoIndex,
			offsetX: Math.max(-1, Math.min(1, offsetX)),
			offsetY: Math.max(-1, Math.min(1, offsetY))
		};
		if (panRaf === null) panRaf = requestAnimationFrame(flushPan);
	}

	function handleCanvasPointerUp(e: PointerEvent): void {
		if (photoDrag) {
			if (!photoDrag.moved) selectedPhoto = photoDrag.photoIndex;
			if (panRaf !== null) {
				cancelAnimationFrame(panRaf);
				panRaf = null;
			}
			flushPan();
			try {
				if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
			} catch {
				/* ignore */
			}
			photoDrag = null;
		}
	}
</script>

<svelte:window
	on:pointermove={handleWindowPointerMove}
	on:pointerup={handleWindowPointerUp}
	on:pointercancel={handleWindowPointerUp}
	on:keydown={handleKeyDown}
/>

<section
	class="edit-screen screen-enter kiosk-scope"
	class:theme-light={theme === 'light'}
	aria-label="Edit dan dekorasi strip"
>
	<StudioFrame />

	<div class="frame-inner">
		<header class="top-bar">
			<div class="bar-left">
				<button
					type="button"
					class="back-pill"
					on:click={() => goTo('editor')}
					aria-label="Kembali ke desain strip"
				>
					<svg
						width="15"
						height="15"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2.4"
						stroke-linecap="round"
						stroke-linejoin="round"
						aria-hidden="true"
					>
						<path d="M15 18l-6-6 6-6" />
					</svg>
					Desain Strip
				</button>
			</div>

			<h1 class="screen-title">EDIT &amp; DEKORASI</h1>

			<div class="bar-right">
				<ThemeToggle inline />
			</div>
		</header>

		<div class="header-divider" aria-hidden="true"></div>

		<div class="edit-stage">
			<!-- 1. KOLOM KIRI: Foto & Layer Stiker -->
			<aside class="panel left-panel" aria-label="Foto dan layer stiker">
				<div class="left-tabs" role="tablist" aria-label="Panel kiri">
					<button
						type="button"
						class="tab-pill"
						class:is-active={leftTab === 'foto'}
						on:click={() => (leftTab = 'foto')}
						role="tab"
						aria-selected={leftTab === 'foto'}
					>
						Foto
					</button>
					<button
						type="button"
						class="tab-pill"
						class:is-active={leftTab === 'layer'}
						on:click={() => (leftTab = 'layer')}
						role="tab"
						aria-selected={leftTab === 'layer'}
					>
						Layer
					</button>
				</div>

				{#if leftTab === 'foto'}
					<div class="photos-scroll" role="list">
						{#each photos as photo, i}
							<button
								type="button"
								class="photo-item"
								class:is-selected={!selectedStickerId && selectedPhoto === i}
								on:click={() => {
									selectedStickerId = null;
									selectedPhoto = i;
								}}
								aria-label="Pilih foto nomor {i + 1}"
								aria-pressed={!selectedStickerId && selectedPhoto === i ? 'true' : 'false'}
							>
								<img src={photo} alt="Foto {i + 1}" class="photo-img" draggable="false" />
								<span class="photo-num" aria-hidden="true">{i + 1}</span>
							</button>
						{/each}
					</div>
				{:else}
					<div class="layers-scroll">
						{#if stickers.length === 0}
							<p class="empty-note">
								Belum ada layer stiker. Tambahkan stiker lewat tab <strong>Stiker</strong> di kanan.
							</p>
						{:else}
							<div class="layer-list">
								{#each stickers as l (l.id)}
									<div
										class="layer-item"
										class:is-selected={selectedStickerId === l.id}
										class:is-dragging={dragLayerId === l.id}
										role="button"
										tabindex="0"
										draggable="true"
										on:click={() => (selectedStickerId = l.id)}
										on:keydown={(e) => {
											if (e.key === 'Enter' || e.key === ' ') {
												e.preventDefault();
												selectedStickerId = l.id;
											}
										}}
										on:dragstart={(e) => onLayerDragStart(l.id, e)}
										on:dragover={(e) => onLayerDragOver(l.id, e)}
										on:dragend={onLayerDragEnd}
										aria-pressed={selectedStickerId === l.id}
										aria-label="Layer {placedStickerName(l.stickerId)}, seret untuk urutkan"
									>
										<span class="drag-handle" aria-hidden="true">⋮⋮</span>
										{#if stickerThumbSrc(l)}
											<img
												class="layer-thumb"
												src={stickerThumbSrc(l)}
												alt=""
												loading="lazy"
												draggable="false"
											/>
										{:else}
											<span class="layer-thumb" aria-hidden="true"></span>
										{/if}
										<span class="layer-name">{placedStickerName(l.stickerId)}</span>
										<button
											type="button"
											class="mini-btn"
											on:click|stopPropagation={() => handleRemoveSticker(l.id)}
											aria-label="Hapus stiker"
										>
											✕
										</button>
									</div>
								{/each}
							</div>
						{/if}

						{#if selectedSticker}
							<div class="layer-inspector" aria-label="Atur stiker terpilih">
								<div class="slider-card">
									<div class="slider-head">
										<label class="slider-label" for="ly-opacity">Opacity</label>
										<span class="slider-val">{stickerOpacityPct}%</span>
									</div>
									<input
										id="ly-opacity"
										class="range-input"
										type="range"
										min={10}
										max={100}
										value={stickerOpacityPct}
										on:input={handleStickerOpacity}
									/>
								</div>

								<div class="quick-actions">
									<button
										type="button"
										class="action-btn"
										class:is-active={selectedSticker.flipH}
										on:click={() => toggleStickerFlip('h')}
										aria-pressed={selectedSticker.flipH}
										aria-label="Flip horizontal stiker"
									>
										⇋ H
									</button>
									<button
										type="button"
										class="action-btn"
										class:is-active={selectedSticker.flipV}
										on:click={() => toggleStickerFlip('v')}
										aria-pressed={selectedSticker.flipV}
										aria-label="Flip vertikal stiker"
									>
										⇅ V
									</button>
								</div>

								<button
									type="button"
									class="action-btn full-btn"
									on:click={resetSelectedSticker}
									aria-label="Reset stiker"
								>
									Reset Stiker
								</button>
							</div>
						{/if}
					</div>
				{/if}
			</aside>

			<!-- 2. KOLOM TENGAH: Pratinjau Kanvas + Guide Transform ala Canva -->
			<!-- svelte-ignore a11y-click-events-have-key-events a11y-no-noninteractive-element-interactions -->
			<main
				class="preview-stage"
				aria-label="Pratinjau strip foto"
				on:click={(e) => {
					if (e.target === e.currentTarget) selectedStickerId = null;
				}}
			>
				<div class="canvas-viewport">
					<div class="canvas-zoom-layer" style="transform: scale({canvasZoom});">
						<div
							bind:this={canvasWrap}
							class="canvas-wrap"
							class:is-landscape={isLandscapeSheet}
							style="aspect-ratio: {product.pxW} / {product.pxH};"
						>
							<canvas
								bind:this={canvas}
								class="strip-canvas"
								width="300"
								height="900"
								aria-label="Kanvas pratinjau strip foto"
								title="Klik untuk pilih foto atau stiker · geser untuk atur posisi"
								on:pointerdown={handleCanvasPointerDown}
								on:pointermove={handleCanvasPointerMove}
								on:pointerup={handleCanvasPointerUp}
								on:pointercancel={handleCanvasPointerUp}
							></canvas>

							<!-- Overlay guide transform ala Canva untuk setiap stiker -->
							<div class="sticker-overlay">
								{#if snapCenterX}
									<div class="snap-line snap-v" aria-hidden="true"></div>
								{/if}
								{#if snapCenterY}
									<div class="snap-line snap-h" aria-hidden="true"></div>
								{/if}

								{#each stickers as st (st.id)}
									{@const isSel = selectedStickerId === st.id}
									<!-- svelte-ignore a11y-no-static-element-interactions -->
									<div
										class="sticker-guide"
										class:is-selected={isSel}
										style="left: {st.x * 100}%; top: {st.y * 100}%; width: {st.w *
											100}%; height: {st.h *
											100}%; transform: translate(-50%, -50%) rotate({st.rotation ?? 0}deg);"
										on:pointerdown={(e) => startStickerTransform('move', st, e)}
									>
										{#if isSel}
											<!-- 4 sudut handle scale ala Canva -->
											<button
												type="button"
												class="scale-handle handle-nw"
												aria-label="Ubah ukuran stiker dari sudut kiri atas"
												on:pointerdown={(e) => startStickerTransform('scale', st, e)}
											></button>
											<button
												type="button"
												class="scale-handle handle-ne"
												aria-label="Ubah ukuran stiker dari sudut kanan atas"
												on:pointerdown={(e) => startStickerTransform('scale', st, e)}
											></button>
											<button
												type="button"
												class="scale-handle handle-sw"
												aria-label="Ubah ukuran stiker dari sudut kiri bawah"
												on:pointerdown={(e) => startStickerTransform('scale', st, e)}
											></button>
											<button
												type="button"
												class="scale-handle handle-se"
												aria-label="Ubah ukuran stiker dari sudut kanan bawah"
												on:pointerdown={(e) => startStickerTransform('scale', st, e)}
											></button>

											<!-- Tombol hapus cepat di pojok atas -->
											<button
												type="button"
												class="guide-delete"
												aria-label="Hapus stiker terpilih"
												title="Hapus stiker"
												on:pointerdown|stopPropagation
												on:click|stopPropagation={() => handleRemoveSticker(st.id)}
											>
												✕
											</button>

											<!-- Handle putar di bawah tengah -->
											<div class="rotate-stem" aria-hidden="true"></div>
											<button
												type="button"
												class="rotate-handle"
												aria-label="Putar stiker"
												title="Seret untuk memutar"
												on:pointerdown={(e) => startStickerTransform('rotate', st, e)}
											>
												<svg
													viewBox="0 0 24 24"
													width="12"
													height="12"
													fill="none"
													stroke="currentColor"
													stroke-width="2.4"
													stroke-linecap="round"
													stroke-linejoin="round"
													aria-hidden="true"
												>
													<path d="M21 12a9 9 0 1 1-3-6.7L21 8" />
													<path d="M21 3v5h-5" />
												</svg>
											</button>

											{#if activeTransform?.mode === 'rotate'}
												<span class="angle-pill">{Math.round(st.rotation ?? 0)}°</span>
											{/if}
										{/if}
									</div>
								{/each}
							</div>
						</div>
					</div>
				</div>

				<div class="canvas-toolbar" role="group" aria-label="Kontrol kanvas">
					<button
						type="button"
						class="tool-btn"
						on:click={zoomIn}
						aria-label="Perbesar kanvas"
						title="Perbesar"
						disabled={canvasZoom >= ZOOM_MAX}
					>
						+
					</button>
					<button
						type="button"
						class="tool-btn tool-level"
						on:click={zoomFit}
						aria-label="Kembalikan kanvas ke ukuran pas"
						title="Ukuran pas"
					>
						{Math.round(canvasZoom * 100)}%
					</button>
					<button
						type="button"
						class="tool-btn"
						on:click={zoomOut}
						aria-label="Perkecil kanvas"
						title="Perkecil"
						disabled={canvasZoom <= ZOOM_MIN}
					>
						−
					</button>
					<span class="tool-sep" aria-hidden="true"></span>
					<button
						type="button"
						class="tool-btn"
						class:is-active={showSlotNumbers}
						on:click={() => (showSlotNumbers = !showSlotNumbers)}
						aria-pressed={showSlotNumbers}
						aria-label="Tampilkan nomor slot di kanvas"
						title="Nomor slot"
					>
						123
					</button>
				</div>
			</main>

			<!-- 3. KOLOM KANAN: Foto · Filter · Stiker -->
			<aside class="panel tools-panel" aria-label="Alat edit dan dekorasi strip">
				<div class="tools-tabs" role="tablist" aria-label="Kategori alat edit dan dekorasi">
					{#each RIGHT_TABS as tab (tab.id)}
						<button
							type="button"
							class="tab-pill"
							class:is-active={activeTab === tab.id}
							on:click={() => (activeTab = tab.id)}
							role="tab"
							aria-selected={activeTab === tab.id}
						>
							{tab.label}
						</button>
					{/each}
				</div>

				{#if activeTab === 'foto'}
					<div class="tools-scroll">
						<span class="group-eyebrow">FOTO {selectedPhoto + 1}</span>
						<div class="quick-actions">
							<button
								type="button"
								class="action-btn"
								on:click={() => rotatePhoto(selectedPhoto, -1)}
								aria-label="Putar kiri"
							>
								⟲ Putar
							</button>
							<button
								type="button"
								class="action-btn"
								on:click={() => rotatePhoto(selectedPhoto, 1)}
								aria-label="Putar kanan"
							>
								⟳ Putar
							</button>
							<button
								type="button"
								class="action-btn"
								class:is-active={Boolean(selectedTransform?.flipH)}
								on:click={() => flipPhoto(selectedPhoto)}
								aria-pressed={Boolean(selectedTransform?.flipH)}
								aria-label="Flip horizontal"
							>
								⇋ Flip
							</button>
						</div>

						<div class="slider-card">
							<div class="slider-head">
								<label class="slider-label" for="tf-rotation">Putar</label>
								<div class="slider-meta">
									<span class="slider-val">{rotationValue}°</span>
									<button
										type="button"
										class="reset-btn"
										on:click={() => resetTransformField('rotation')}
										disabled={rotationValue === 0}
										aria-label="Reset putaran foto {selectedPhoto + 1}"
									>
										Reset
									</button>
								</div>
							</div>
							<input
								id="tf-rotation"
								class="range-input"
								type="range"
								min={0}
								max={359}
								value={rotationValue}
								on:input={handleRotation}
							/>
						</div>

						<div class="slider-card">
							<div class="slider-head">
								<label class="slider-label" for="tf-zoom">Zoom</label>
								<div class="slider-meta">
									<span class="slider-val">{zoomValue}%</span>
									<button
										type="button"
										class="reset-btn"
										on:click={() => resetTransformField('scale')}
										disabled={zoomAtDefault}
										aria-label="Reset zoom foto {selectedPhoto + 1}"
									>
										Reset
									</button>
								</div>
							</div>
							<input
								id="tf-zoom"
								class="range-input"
								type="range"
								min={50}
								max={200}
								value={zoomValue}
								on:input={handleZoom}
							/>
						</div>

						<div class="slider-card">
							<div class="slider-head">
								<label class="slider-label" for="tf-offset-x">Posisi X</label>
								<div class="slider-meta">
									<span class="slider-val">{posXValue}</span>
									<button
										type="button"
										class="reset-btn"
										on:click={() => resetTransformField('offsetX')}
										disabled={posXAtDefault}
										aria-label="Reset posisi X foto {selectedPhoto + 1}"
									>
										Reset
									</button>
								</div>
							</div>
							<input
								id="tf-offset-x"
								class="range-input"
								type="range"
								min={-100}
								max={100}
								value={posXValue}
								on:input={(e) => handleOffsetSlider('x', e)}
							/>
						</div>

						<div class="slider-card">
							<div class="slider-head">
								<label class="slider-label" for="tf-offset-y">Posisi Y</label>
								<div class="slider-meta">
									<span class="slider-val">{posYValue}</span>
									<button
										type="button"
										class="reset-btn"
										on:click={() => resetTransformField('offsetY')}
										disabled={posYAtDefault}
										aria-label="Reset posisi Y foto {selectedPhoto + 1}"
									>
										Reset
									</button>
								</div>
							</div>
							<input
								id="tf-offset-y"
								class="range-input"
								type="range"
								min={-100}
								max={100}
								value={posYValue}
								on:input={(e) => handleOffsetSlider('y', e)}
							/>
						</div>
					</div>
				{:else if activeTab === 'filter'}
					<div class="tools-scroll">
						<div class="filter-groups">
							{#each filterGroups as group (group.key)}
								<section class="filter-group" aria-label="Filter {group.label}">
									<span class="group-eyebrow">{group.label}</span>
									<div class="filter-grid">
										{#each group.filters as f (f.key)}
											<button
												type="button"
												class="filter-tile"
												class:is-active={photoFilter === f.key}
												on:click={() => setPhotoFilter(f.key)}
												aria-pressed={photoFilter === f.key}
												aria-label="Filter {f.name}, foto {selectedPhoto + 1}"
											>
												{#if photos[selectedPhoto]}
													<img
														class="filter-thumb"
														src={photos[selectedPhoto]}
														alt=""
														style:filter={f.cssFilter || 'none'}
														draggable="false"
													/>
												{:else}
													<span class="filter-empty-thumb" aria-hidden="true"></span>
												{/if}
												<span class="filter-name">{f.name}</span>
											</button>
										{/each}
									</div>
								</section>
							{/each}
						</div>
					</div>
				{:else if activeTab === 'stiker'}
					<div class="tools-scroll">
						<div class="sticker-categories" role="group" aria-label="Kategori stiker">
							{#each stickerCategories as c (c.key)}
								<button
									type="button"
									class="category-chip"
									class:is-active={selectedStickerCategory === c.key}
									on:click={() => (selectedStickerCategory = c.key)}
									aria-pressed={selectedStickerCategory === c.key}
								>
									{c.label}
								</button>
							{/each}
						</div>

						<div class="sticker-grid">
							{#each stickerList as s (s.dbId)}
								<button
									type="button"
									class="sticker-tile"
									on:click={() => handleAddSticker(s)}
									aria-label="Tambah stiker {s.name}"
								>
									<img
										class="sticker-img"
										src={stickerSrc(s)}
										alt={s.name}
										loading="lazy"
										draggable="false"
									/>
									<span class="sticker-name">{s.name}</span>
								</button>
							{/each}
						</div>
					</div>
				{/if}

				<footer class="tools-footer">
					<button type="button" id="btn-next-edit" class="btn-next" on:click={handleNext}>
						Lanjut
						<svg
							viewBox="0 0 24 24"
							width="15"
							height="15"
							fill="none"
							stroke="currentColor"
							stroke-width="2.4"
							stroke-linecap="round"
							aria-hidden="true"
						>
							<polyline points="9 18 15 12 9 6" />
						</svg>
					</button>
				</footer>
			</aside>
		</div>
	</div>
</section>

<style>
	@import './_EditScreen.css';
</style>
