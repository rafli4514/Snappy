<script lang="ts">
	import { onMount } from 'svelte';
	import {
		session,
		goTo,
		setPhotoFilter,
		addSticker,
		moveSticker,
		removeSticker,
		updatePhotoTransform,
		stripPhotos
	} from '#lib/stores/session';
	import { PRODUK, renderStripPreview, getProductForCount } from '#lib/utils/canvas';
	import { frameToTemplate } from '#lib/utils/frameStorage';
	import { BUILTIN_STICKERS } from '#lib/utils/customTemplateStorage';
	import { STICKER_ASSETS, type StickerAsset } from '#lib/data/stickers';
	import { PHOTO_FILTERS } from '#lib/data/filters';
	import type { BuiltinSticker, PhotoTransform, StickerLayer } from '#lib/types';

	let canvas: HTMLCanvasElement;
	let dragStickerId: string | null = null;
	let selectedPhoto = 0;

	$: theme = $session.theme;
	$: photos = $stripPhotos;
	$: photoCount = $session.photoCount;
	$: activeFrame = $session.activeFrame;
	$: customTemplateData = $session.customTemplateData;
	$: caption = $session.caption;
	$: showDate = $session.showDate;
	$: photoTransforms = $session.photoTransforms;
	$: stickers = $session.stickers;
	$: photoFilter = $session.photoFilter;

	$: activeTemplate = activeFrame
		? frameToTemplate(activeFrame)
		: customTemplateData || $session.selectedTemplate;
	// Nilai transform foto terpilih — dipakai reaktif di template (label & slider)
	$: selectedTransform = photoTransforms[selectedPhoto] ?? null;
	$: rotationValue = selectedTransform?.rotation ?? 0;
	$: zoomValue = Math.round((selectedTransform?.scale ?? 1) * 100);
	$: posXValue = Math.round((selectedTransform?.offsetX ?? 0) * 100);
	$: posYValue = Math.round((selectedTransform?.offsetY ?? 0) * 100);
	$: zoomAtDefault = (selectedTransform?.scale ?? 1) === 1;
	$: posXAtDefault = (selectedTransform?.offsetX ?? 0) === 0;
	$: posYAtDefault = (selectedTransform?.offsetY ?? 0) === 0;

	type PanelTab = 'foto' | 'filter' | 'sticker';
	let activeTab: PanelTab = 'foto';

	let showSlotNumbers = true;
	let renderSeq = 0;

	// Filter foto: 5 kategori.
	const FILTER_GROUPS = [
		{
			label: 'Essential',
			key: 'essential',
			filters: PHOTO_FILTERS.filter((f) => f.category === 'Essential')
		},
		{ label: 'Retro', key: 'retro', filters: PHOTO_FILTERS.filter((f) => f.category === 'Retro') },
		{ label: 'Fun', key: 'fun', filters: PHOTO_FILTERS.filter((f) => f.category === 'Fun') },
		{
			label: 'Distort',
			key: 'distort',
			filters: PHOTO_FILTERS.filter((f) => f.category === 'Distort')
		},
		{
			label: 'B&W',
			key: 'bw',
			filters: PHOTO_FILTERS.filter((f) => f.category === 'Black & White')
		}
	];

	async function renderPreview(): Promise<void> {
		if (!canvas) return;
		const seq = ++renderSeq;
		const isStale = (): boolean => seq !== renderSeq;
		const p = getProductForCount($session.photoCount, $session.formatId) || PRODUK[4];
		canvas.width = Math.round(p.pxW / 2);
		canvas.height = Math.round(p.pxH / 2);
		canvas.style.aspectRatio = `${p.pxW} / ${p.pxH}`;
		if (p.sheetOrient === 'landscape') {
			canvas.style.height = 'clamp(230px, 30vh, 320px)';
		} else {
			canvas.style.height = '';
		}
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
				photoFilter,
				selectedSlot: selectedPhoto,
				formatId: $session.formatId
			},
			isStale
		);
	}

	$: (caption,
		showDate,
		showSlotNumbers,
		photos,
		photoTransforms,
		stickers,
		photoFilter,
		selectedPhoto,
		canvas && photos.length && activeTemplate && renderPreview());

	onMount(() => {
		void renderPreview();
	});

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
		// Geser posisi tidak boleh menyentuh zoom: nilai Zoom milik user.
		if (axis === 'x') updatePhotoTransform(selectedPhoto, { ...t, offsetX: v });
		else updatePhotoTransform(selectedPhoto, { ...t, offsetY: v });
	}

	/** Reset satu field transform foto terpilih; field lain tetap seperti semula. */
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

	function startStickerDrag(id: string): void {
		dragStickerId = id;
	}

	function preloadPanImages(list: string[]): void {
		for (const src of list) {
			if (src) panImage(src);
		}
	}

	$: preloadPanImages(photos || []);

	function handleStickerMove(e: PointerEvent): void {
		if (!dragStickerId || !canvas) return;
		const layer = stickers.find((l) => l.id === dragStickerId);
		if (!layer) return;
		const rect = canvas.getBoundingClientRect();
		if (!rect.width || !rect.height) return;
		const fx = (e.clientX - rect.left) / rect.width;
		const fy = (e.clientY - rect.top) / rect.height;
		const x = Math.max(0, Math.min(1 - layer.w, fx - layer.w / 2));
		const y = Math.max(0, Math.min(1 - layer.h, fy - layer.h / 2));
		moveSticker(layer.id, x, y);
	}

	function endStickerDrag(): void {
		dragStickerId = null;
	}

	function handleAddSticker(sticker: StickerAsset): void {
		// Build a placeholder SVG sticker from the StickerAsset metadata
		// Real WebP assets will be dropped in static/stickers/Pixel/ later
		const layer: StickerLayer = {
			id: `sticker-${sticker.dbId}-${Date.now()}`,
			stickerId: `sticker-${sticker.dbId}`,
			x: Math.max(0, 0.5 - 0.25),
			y: 0.1,
			w: sticker.size.w / 600,
			h: sticker.size.h / 1800,
			rotation: 0,
			opacity: 1
		};
		addSticker(layer);
		startStickerDrag(layer.id);
	}

	function handleRemoveSticker(id: string): void {
		removeSticker(id);
		if (dragStickerId === id) endStickerDrag();
	}

	function handleNext(): void {
		goTo('print');
	}

	/** Peta koordinat kanvas → slot foto (index + rect slot dalam px kanvas). */
	interface PhotoHit {
		photoIndex: number;
		slotX: number;
		slotY: number;
		slotW: number;
		slotH: number;
		/** Zoom bawaan slot (custom template) — dasar hitung ruang pan. */
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
				// Slot berputar: putar titik klik balik ke ruang slot
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
		let slotIdx = 0;
		for (const row of p.rows) {
			const rowH = row.h * ky;
			const rowW = row.cells.reduce((a, c) => a + c.w, 0) * k + (row.cells.length - 1) * p.gap * k;
			let cursorX = (target.width - rowW) / 2;
			for (const cell of row.cells) {
				const w = cell.w * k;
				if (px >= cursorX && px <= cursorX + w && py >= cursorY && py <= cursorY + rowH) {
					return {
						photoIndex: slotIdx,
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

	// ── Drag foto di strip = pindah crop (pan) di dalam slot ──
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
		// Sama dengan model render: foto di-cover ke slot lalu diskalakan zoom.
		const cover = Math.max(slotW / img.naturalWidth, slotH / img.naturalHeight);
		const zoom = Math.max(0.5, Math.min(4, scale));
		const drawW = img.naturalWidth * cover * zoom;
		const drawH = img.naturalHeight * cover * zoom;
		// Saat foto lebih kecil dari slot (zoom out), ruang kosongnya tetap bisa digeser.
		return {
			maxShiftX: Math.abs(drawW - slotW) / 2,
			maxShiftY: Math.abs(drawH - slotH) / 2
		};
	}

	let photoDrag: {
		photoIndex: number;
		slotW: number;
		slotH: number;
		/** Zoom dasar saat gesture mulai — dipakai hitung ruang pan, tidak diubah. */
		baseScale: number;
		startX: number;
		startY: number;
		startOffsetX: number;
		startOffsetY: number;
		moved: boolean;
	} | null = null;

	function handleCanvasPointerDown(e: PointerEvent): void {
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
			/* event sintetis / browser tanpa capture aktif */
		}
	}

	// Seret foto ke mana pun di slot (drag = geser, bukan klik).
	// Update store di-throttle ke 1 per frame agar render tidak stuttering.
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
		// Drag kanan = foto ikut kanan. Konversi CSS → px kanvas supaya gerak 1:1,
		// termasuk saat zoom out (foto lebih kecil dari slot).
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
			// Klik (tanpa geser) memilih foto; drag hanya menggeser crop foto itu,
			// jadi nilai Zoom di panel tidak ikut berpindah.
			if (!photoDrag.moved) selectedPhoto = photoDrag.photoIndex;
			// Terapkan sisa pan yang belum sempat di-flush rAF
			if (panRaf !== null) {
				cancelAnimationFrame(panRaf);
				panRaf = null;
			}
			flushPan();
			try {
				if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
			} catch {
				/* sudah dilepas */
			}
			photoDrag = null;
		}
	}
</script>

<section
	class="edit-screen screen-enter kiosk-scope"
	class:theme-light={theme === 'light'}
	aria-label="Edit Strip"
>
	<header class="edit-head">
		<button
			type="button"
			class="head-back-btn"
			on:click={() => goTo('editor')}
			aria-label="Kembali ke desain strip"
		>
			<svg
				width="16"
				height="16"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2.5"
				stroke-linecap="round"
				stroke-linejoin="round"
				aria-hidden="true"
			>
				<path d="M15 18l-6-6 6-6" />
			</svg>
		</button>
		<h1 class="edit-head-title font-display">Edit Strip</h1>
		<span class="head-balance" aria-hidden="true"></span>
	</header>

	<div class="edit-stage">
		<aside class="photos-column" aria-label="Koleksi foto sesi">
			<div class="photos-scroll" role="list">
				{#each photos as photo, i}
					<div class="photo-cell" class:is-selected={selectedPhoto === i}>
						<button
							type="button"
							class="photo-cell-btn"
							class:is-selected={selectedPhoto === i}
							on:click={() => (selectedPhoto = i)}
							aria-label="Pilih foto nomor {i + 1}"
							aria-pressed={selectedPhoto === i ? 'true' : 'false'}
						>
							<img src={photo} alt="Foto {i + 1}" class="photo-cell-img" />
							<span class="photo-tag font-mono">#{i + 1}</span>
						</button>
					</div>
				{/each}
			</div>
		</aside>

		<main
			class="strip-column"
			aria-label="Pratinjau strip foto"
			on:pointermove={handleStickerMove}
			on:pointerup={endStickerDrag}
			on:pointerleave={endStickerDrag}
		>
			<div class="strip-center-box">
				<div class="strip-paper-frame">
					<div class="strip-canvas-zoom">
						<canvas
							bind:this={canvas}
							class="strip-canvas"
							width="300"
							height="900"
							aria-label="Photo strip canvas"
							title="Klik = pilih foto · geser = atur posisi foto"
							on:pointerdown={handleCanvasPointerDown}
							on:pointermove={handleCanvasPointerMove}
							on:pointerup={handleCanvasPointerUp}
							on:pointercancel={handleCanvasPointerUp}
						></canvas>
					</div>
				</div>
			</div>
			<div class="canvas-fab" role="group" aria-label="Kontrol kanvas">
				<button
					type="button"
					class="fab-btn font-mono"
					class:is-active={showSlotNumbers}
					on:click={() => (showSlotNumbers = !showSlotNumbers)}
					aria-pressed={showSlotNumbers}
					aria-label="Tampilkan nomor slot di kanvas"
				>
					123
				</button>
			</div>
		</main>

		<aside class="templates-column" aria-label="Alat edit strip">
			<div class="categories-header" role="tablist" aria-label="Kategori alat edit">
				<button
					type="button"
					class="category-pill font-mono"
					class:is-active={activeTab === 'foto'}
					on:click={() => (activeTab = 'foto')}
					role="tab"
					aria-selected={activeTab === 'foto'}
				>
					Foto
				</button>
				<button
					type="button"
					class="category-pill font-mono"
					class:is-active={activeTab === 'filter'}
					on:click={() => (activeTab = 'filter')}
					role="tab"
					aria-selected={activeTab === 'filter'}
				>
					Filter
				</button>
				<button
					type="button"
					class="category-pill font-mono"
					class:is-active={activeTab === 'sticker'}
					on:click={() => (activeTab = 'sticker')}
					role="tab"
					aria-selected={activeTab === 'sticker'}
				>
					Sticker
				</button>
			</div>

			{#if activeTab === 'foto'}
				<div class="tab-panel">
					<div class="tab-actions">
						<button
							type="button"
							class="tab-action-btn font-mono"
							on:click={() => rotatePhoto(selectedPhoto, -1)}
							aria-label="Putar kiri">⟲ Putar</button
						>
						<button
							type="button"
							class="tab-action-btn font-mono"
							on:click={() => rotatePhoto(selectedPhoto, 1)}
							aria-label="Putar kanan">⟳ Putar</button
						>
						<button
							type="button"
							class="tab-action-btn font-mono"
							on:click={() => flipPhoto(selectedPhoto)}
							aria-label="Flip horizontal">⇋ Flip</button
						>
					</div>
					<div class="transform-row">
						<label class="tab-slider" for="tf-rotation">
							<span class="font-mono">Putar</span>
							<input
								id="tf-rotation"
								type="range"
								min={0}
								max={359}
								value={rotationValue}
								on:input={handleRotation}
							/>
							<span class="font-mono">{rotationValue}°</span>
						</label>
						<button
							type="button"
							class="tab-reset-btn font-mono"
							on:click={() => resetTransformField('rotation')}
							disabled={rotationValue === 0}
							aria-label="Reset putaran foto {selectedPhoto + 1}">Reset</button
						>
					</div>
					<div class="transform-row">
						<label class="tab-slider" for="tf-zoom">
							<span class="font-mono">Zoom</span>
							<input
								id="tf-zoom"
								type="range"
								min={50}
								max={200}
								value={zoomValue}
								on:input={handleZoom}
							/>
							<span class="font-mono">{zoomValue}%</span>
						</label>
						<button
							type="button"
							class="tab-reset-btn font-mono"
							on:click={() => resetTransformField('scale')}
							disabled={zoomAtDefault}
							aria-label="Reset zoom foto {selectedPhoto + 1}">Reset</button
						>
					</div>
					<div class="transform-row">
						<label class="tab-slider" for="tf-offset-x">
							<span class="font-mono">Posisi X</span>
							<input
								id="tf-offset-x"
								type="range"
								min={-100}
								max={100}
								value={posXValue}
								on:input={(e) => handleOffsetSlider('x', e)}
							/>
							<span class="font-mono">{posXValue}</span>
						</label>
						<button
							type="button"
							class="tab-reset-btn font-mono"
							on:click={() => resetTransformField('offsetX')}
							disabled={posXAtDefault}
							aria-label="Reset posisi X foto {selectedPhoto + 1}">Reset</button
						>
					</div>
					<div class="transform-row">
						<label class="tab-slider" for="tf-offset-y">
							<span class="font-mono">Posisi Y</span>
							<input
								id="tf-offset-y"
								type="range"
								min={-100}
								max={100}
								value={posYValue}
								on:input={(e) => handleOffsetSlider('y', e)}
							/>
							<span class="font-mono">{posYValue}</span>
						</label>
						<button
							type="button"
							class="tab-reset-btn font-mono"
							on:click={() => resetTransformField('offsetY')}
							disabled={posYAtDefault}
							aria-label="Reset posisi Y foto {selectedPhoto + 1}">Reset</button
						>
					</div>
				</div>
			{:else if activeTab === 'filter'}
				<div class="tab-panel">
					<div class="tab-photo-list">
						{#each FILTER_GROUPS as group}
							<div class="filter-group">
								<span class="filter-group-label">{group.label}</span>
								{#each group.filters as f (f.key)}
									<button
										type="button"
										class="tab-action-btn font-mono"
										class:is-active={photoFilter === f.key}
										on:click={() => setPhotoFilter(f.key)}
									>
										{f.name}
									</button>
								{/each}
							</div>
						{/each}
					</div>
				</div>
			{:else}
				<div class="tab-panel">
					<div class="tab-photo-list">
						{#each STICKER_ASSETS as s (s.dbId)}
							<button
								type="button"
								class="tab-action-btn font-mono"
								on:click={() => handleAddSticker(s)}
							>
								✦ {s.name}
							</button>
						{/each}
					</div>
					{#if stickers.length > 0}
						<div class="tab-sticker-list">
							{#each stickers as l (l.id)}
								<div class="tab-sticker-item">
									<span class="font-mono"
										>{BUILTIN_STICKERS.find((s) => s.id === l.stickerId)?.name ?? l.stickerId}</span
									>
									<button
										type="button"
										class="tab-mini-btn font-mono"
										on:click={() => startStickerDrag(l.id)}
										aria-label="Geser sticker">⇲</button
									>
									<button
										type="button"
										class="tab-mini-btn font-mono"
										on:click={() => handleRemoveSticker(l.id)}
										aria-label="Hapus sticker">✕</button
									>
								</div>
							{/each}
						</div>
					{/if}
				</div>
			{/if}

			<div class="templates-footer">
				<button
					type="button"
					id="btn-next-edit"
					class="capsule-cta font-mono"
					on:click={handleNext}
				>
					LANJUT CETAK
					<svg
						viewBox="0 0 24 24"
						width="14"
						height="14"
						fill="none"
						stroke="currentColor"
						stroke-width="2.5"
						stroke-linecap="round"
						aria-hidden="true"
					>
						<polyline points="9 18 15 12 9 6" />
					</svg>
				</button>
			</div>
		</aside>
	</div>
</section>

<style>
	.edit-screen {
		position: relative;
		height: 100dvh;
		height: 100vh;
		display: flex;
		flex-direction: column;
		background: var(--bg);
		color: var(--fg);
		overflow: hidden;
		user-select: none;
		transition:
			background-color 220ms ease,
			color 220ms ease;
	}

	.edit-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		height: 52px;
		padding: 0 18px;
		border-bottom: 1px solid var(--ring-line);
		background: var(--bg);
		flex-shrink: 0;
		z-index: 20;
	}

	.edit-head-title {
		margin: 0;
		font-size: 1.15rem;
		font-weight: 500;
		color: var(--fg);
		letter-spacing: 0.01em;
	}

	.head-back-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 44px;
		height: 44px;
		padding: 0;
		border: none;
		border-radius: 999px;
		background: transparent;
		color: var(--fg-dim);
		cursor: pointer;
		transition:
			color 140ms ease,
			background-color 140ms ease;
	}

	.head-back-btn:hover {
		color: var(--fg);
		background: var(--ring-line);
	}

	.head-back-btn:focus-visible {
		outline: 2.5px solid var(--focus);
		outline-offset: 2px;
	}

	.head-balance {
		width: 44px;
		height: 44px;
		flex-shrink: 0;
	}

	.edit-stage {
		flex: 1;
		display: grid;
		grid-template-columns: 200px 1fr 370px;
		height: calc(100vh - 52px);
		height: calc(100dvh - 52px);
		overflow: hidden;
	}

	.photos-column {
		background: var(--bg);
		border-right: 1px solid var(--ring-line);
		overflow-y: auto;
		padding: 12px;
		display: flex;
		flex-direction: column;
		min-height: 0;
	}

	.photos-scroll {
		display: flex;
		flex-direction: column;
		gap: 10px;
		overflow-y: auto;
	}

	.photo-cell {
		position: relative;
		width: 100%;
		cursor: pointer;
	}

	.photo-cell-btn {
		position: relative;
		width: 100%;
		aspect-ratio: 4 / 3;
		padding: 0;
		border: 1.5px solid var(--hairline);
		border-radius: 10px;
		overflow: hidden;
		background: var(--veil-edge);
		cursor: pointer;
		display: block;
		transition:
			border-color 160ms ease,
			transform 160ms ease;
	}

	.photo-cell-btn:hover {
		border-color: var(--fg);
		transform: scale(1.02);
	}

	.photo-cell-btn.is-selected {
		border-color: #2563eb;
		box-shadow:
			0 0 0 2.5px #2563eb,
			0 6px 16px rgba(37, 99, 235, 0.3);
		transform: scale(1.02);
	}

	.photo-cell-btn.is-selected .photo-tag {
		background: #2563eb;
		border-color: #2563eb;
		color: #ffffff;
	}

	.photo-cell-btn:focus-visible {
		outline: 2.5px solid var(--focus);
		outline-offset: 2px;
	}

	.photo-cell-img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}

	.photo-tag {
		position: absolute;
		top: 6px;
		left: 6px;
		background: var(--bg);
		color: var(--fg);
		border: 1px solid var(--hairline);
		border-radius: 4px;
		font-size: 0.62rem;
		font-weight: 800;
		padding: 1px 6px;
		pointer-events: none;
	}

	.strip-column {
		position: relative;
		background: var(--bg);
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		overflow: hidden;
		padding: 18px;
		min-height: 0;
	}

	.strip-center-box {
		display: flex;
		align-items: center;
		justify-content: center;
		flex: 1;
		width: 100%;
		min-height: 0;
	}

	.strip-paper-frame {
		position: relative;
		height: clamp(360px, 78dvh, 760px);
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.strip-canvas-zoom {
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: transform 180ms ease;
	}

	.strip-canvas {
		height: 100%;
		width: auto;
		aspect-ratio: 1 / 3;
		border-radius: 8px;
		box-shadow:
			0 10px 26px rgba(11, 10, 9, 0.3),
			0 0 0 1px var(--ring-line);
		display: block;
		touch-action: none;
		cursor: grab;
	}

	.strip-canvas:active {
		cursor: grabbing;
	}

	.theme-light .strip-canvas {
		box-shadow:
			0 10px 26px rgba(28, 25, 23, 0.14),
			0 0 0 1px var(--ring-line);
	}

	.canvas-fab {
		position: absolute;
		right: 20px;
		bottom: 20px;
		display: flex;
		align-items: center;
		gap: 2px;
		padding: 4px;
		border-radius: 999px;
		border: 1px solid var(--hairline);
		background: var(--bg);
		box-shadow: 0 12px 32px rgba(11, 10, 9, 0.28);
		z-index: 12;
	}

	.theme-light .canvas-fab {
		box-shadow: 0 12px 32px rgba(28, 25, 23, 0.14);
	}

	.fab-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		min-width: 44px;
		min-height: 44px;
		padding: 0 10px;
		border: none;
		border-radius: 999px;
		background: transparent;
		color: var(--fg-dim);
		font-size: 0.82rem;
		font-weight: 800;
		cursor: pointer;
		transition:
			color 140ms ease,
			background-color 140ms ease;
	}

	.fab-btn:hover {
		color: var(--fg);
		background: var(--ring-line);
	}

	.fab-btn.is-active {
		background: var(--fg);
		color: var(--bg);
	}

	.templates-column {
		background: var(--bg);
		border-left: 1px solid var(--ring-line);
		display: flex;
		flex-direction: column;
		overflow: hidden;
		min-height: 0;
	}

	.categories-header {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 4px;
		padding: 8px 10px 6px;
	}

	.category-pill {
		min-height: 44px;
		padding: 6px 10px;
		border-radius: 999px;
		background: transparent;
		border: 1px solid var(--ring-line);
		color: var(--fg-dim);
		font-size: 0.62rem;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		cursor: pointer;
		white-space: nowrap;
		transition:
			color 160ms ease,
			background-color 160ms ease,
			border-color 160ms ease;
	}

	.category-pill:hover {
		color: var(--fg);
		border-color: var(--hairline);
	}

	.category-pill.is-active {
		background: var(--fg);
		color: var(--bg);
		border-color: var(--fg);
	}

	.category-pill:focus-visible {
		outline: 2.5px solid var(--focus);
		outline-offset: 2px;
	}

	.tab-panel {
		flex: 1;
		overflow-y: auto;
		padding: 12px;
		min-height: 0;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.tab-actions {
		display: flex;
		gap: 8px;
	}

	.tab-action-btn {
		flex: 1;
		min-height: 44px;
		padding: 0 10px;
		border: 1px solid var(--hairline);
		border-radius: 8px;
		background: transparent;
		color: var(--fg);
		font-size: 0.62rem;
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		cursor: pointer;
		transition:
			border-color 160ms ease,
			background-color 160ms ease;
	}

	.tab-action-btn:hover {
		border-color: var(--fg);
		background: var(--ring-line);
	}

	.tab-action-btn.is-active {
		border-color: var(--fg);
		background: var(--ring-line);
	}

	.tab-action-btn:focus-visible {
		outline: 2.5px solid var(--focus);
		outline-offset: 2px;
	}

	.tab-slider {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 10px;
		border: 1px solid var(--hairline);
		border-radius: 8px;
		min-height: 44px;
		box-sizing: border-box;
	}

	.tab-slider input[type='range'] {
		flex: 1;
		min-width: 0;
		accent-color: var(--fg);
	}

	.tab-slider input[type='range']:focus-visible {
		outline: 2.5px solid var(--focus);
		outline-offset: 2px;
	}

	.transform-row {
		display: flex;
		align-items: stretch;
		gap: 8px;
	}

	.transform-row .tab-slider {
		flex: 1;
		min-width: 0;
	}

	.tab-reset-btn {
		flex-shrink: 0;
		min-width: 52px;
		min-height: 44px;
		padding: 0 8px;
		border: 1px solid var(--hairline);
		border-radius: 8px;
		background: transparent;
		color: var(--fg-dim);
		font-size: 0.58rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		cursor: pointer;
		transition:
			color 160ms ease,
			border-color 160ms ease,
			background-color 160ms ease,
			opacity 160ms ease;
	}

	.tab-reset-btn:hover:not(:disabled) {
		color: var(--fg);
		border-color: var(--fg);
		background: var(--ring-line);
	}

	.tab-reset-btn:focus-visible {
		outline: 2.5px solid var(--focus);
		outline-offset: 2px;
	}

	.tab-reset-btn:disabled {
		opacity: 0.35;
		cursor: not-allowed;
	}

	.tab-photo-list {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}

	.tab-sticker-list {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.tab-sticker-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		padding: 8px 10px;
		border: 1px solid var(--hairline);
		border-radius: 8px;
	}

	.tab-mini-btn {
		min-width: 44px;
		min-height: 44px;
		padding: 0 10px;
		border: 1px solid var(--hairline);
		border-radius: 8px;
		background: transparent;
		color: var(--fg);
		font-size: 0.7rem;
		cursor: pointer;
	}

	.templates-footer {
		padding: 12px 14px 16px;
		border-top: 1px solid var(--ring-line);
		background: var(--bg);
		flex-shrink: 0;
	}

	.capsule-cta {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 10px;
		width: 100%;
		min-height: 44px;
		padding: 0 24px;
		border: none;
		border-radius: 999px;
		background: var(--fg);
		color: var(--bg);
		font-size: 0.72rem;
		font-weight: 800;
		letter-spacing: 0.22em;
		text-transform: uppercase;
		cursor: pointer;
		transition:
			background-color 200ms ease,
			color 200ms ease,
			box-shadow 200ms ease,
			transform 160ms ease;
	}

	.capsule-cta:hover {
		background: transparent;
		color: var(--fg);
		box-shadow:
			inset 0 0 0 2px var(--fg),
			0 0 0 5px var(--halo-h);
		transform: translateY(-2px);
	}

	.capsule-cta:active {
		transform: translateY(0) scale(0.98);
	}

	.capsule-cta:focus-visible {
		outline: 2.5px solid var(--focus);
		outline-offset: 4px;
	}

	@media (max-width: 860px) {
		.edit-stage {
			display: flex;
			flex-direction: column;
			height: auto;
			overflow-y: auto;
		}

		.photos-column {
			width: 100%;
			height: auto;
			overflow-x: auto;
			flex-direction: row;
			border-right: none;
			border-bottom: 1px solid var(--ring-line);
		}

		.photos-scroll {
			flex-direction: row;
			width: max-content;
		}

		.photo-cell {
			width: 120px;
			flex-shrink: 0;
		}

		.strip-column {
			height: 56vh;
			padding: 10px;
		}

		.canvas-fab {
			right: 10px;
			bottom: 10px;
		}

		.templates-column {
			height: 460px;
			border-left: none;
			border-top: 1px solid var(--ring-line);
		}
	}
</style>
