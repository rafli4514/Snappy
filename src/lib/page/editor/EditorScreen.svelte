<script lang="ts">
	import { onMount } from 'svelte';
	import {
		session,
		goTo,
		swapPhotos,
		movePhoto,
		stripPhotos,
		setActiveFrame,
		selectBuiltinTemplate
	} from '#lib/stores/session';
	import { PRODUK, renderStripPreview, getProductForCount } from '#lib/utils/canvas';
	import { frameToTemplate, listFrames } from '#lib/utils/frameStorage';
	import { formatById } from '#lib/data/standardFormats';
	import type { PhotoFrame } from '#lib/types';

	let canvas: HTMLCanvasElement;

	$: theme = $session.theme;
	$: photos = $stripPhotos;
	$: photoCount = $session.photoCount;
	$: activeFrame = $session.activeFrame;
	$: caption = $session.caption;
	$: showDate = $session.showDate;

	$: activeTemplate = activeFrame ? frameToTemplate(activeFrame) : $session.selectedTemplate;
	$: product = getProductForCount(photoCount, $session.formatId) || PRODUK[4];

	// ── Panel kanan: hanya template admin (frame tersimpan) ──
	let savedFramesList: PhotoFrame[] = [];
	$: savedFrames = savedFramesList.map((frame) => ({
		frame,
		matched: frame.slotCount === photoCount
	}));

	// ── Preferensi workspace ──
	let showSlotNumbers = true;
	let canvasZoom = 1;
	const ZOOM_MIN = 0.5;
	const ZOOM_MAX = 2.5;

	function zoomIn(): void {
		canvasZoom = Math.min(ZOOM_MAX, Math.round(canvasZoom * 1.2 * 100) / 100);
	}
	function zoomOut(): void {
		canvasZoom = Math.max(ZOOM_MIN, Math.round((canvasZoom / 1.2) * 100) / 100);
	}
	function zoomFit(): void {
		canvasZoom = 1;
	}

	// ── Drag & drop reorder (fallback sentuh: tombol ▲▼) ──
	let draggedIdx: number | null = null;
	let dropTargetIdx: number | null = null;
	let dropAfter = false;

	function handleDragStart(e: DragEvent, index: number): void {
		draggedIdx = index;
		if (e.dataTransfer) {
			e.dataTransfer.effectAllowed = 'move';
			e.dataTransfer.setData('text/plain', String(index));
		}
	}

	function handleDragOver(e: DragEvent, index: number): void {
		if (draggedIdx === null) return;
		e.preventDefault();
		e.dataTransfer && (e.dataTransfer.dropEffect = 'move');
		dropTargetIdx = index;
		const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
		dropAfter = e.clientY > rect.top + rect.height / 2;
	}

	function handleDragLeave(index: number): void {
		if (dropTargetIdx === index) dropTargetIdx = null;
	}

	function handleDrop(e: DragEvent, index: number): void {
		e.preventDefault();
		if (draggedIdx !== null && draggedIdx !== index) {
			let toIdx = dropAfter ? index + 1 : index;
			if (draggedIdx < toIdx) toIdx -= 1;
			movePhoto(draggedIdx, toIdx);
		}
		draggedIdx = null;
		dropTargetIdx = null;
	}

	function handleDragEnd(): void {
		draggedIdx = null;
		dropTargetIdx = null;
	}

	// ── Render pratinjau strip ──
	// Satu jalur reaktif + pengaman anti-race: render yang tertinggal (usang)
	// dibuang setelah load gambar agar tak pernah menimpa render terbaru.
	let renderSeq = 0;

	// Satu jalur reaktif: setiap nilai yang memengaruhi kanvas ada di sini.
	// Urutan foto ikut jadi dependensi (array baru saat tukar/geser).
	$: (caption,
		showDate,
		showSlotNumbers,
		photos,
		canvas && photos.length && activeTemplate && renderPreview());

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
			{ caption, showDate, showSlotNumbers, formatId: $session.formatId },
			isStale
		);
	}

	onMount(async () => {
		await refreshSavedFrames();
		await renderPreview();
	});

	async function refreshSavedFrames(): Promise<void> {
		try {
			savedFramesList = await listFrames();
		} catch (e) {
			console.error('Error refreshing saved frames:', e);
		}
	}

	function selectSavedFrame(frame: PhotoFrame): void {
		setActiveFrame(frame);
	}

	function shortFormatLabel(formatId: string | null | undefined): string {
		return formatById(formatId).label.split('·')[0].trim();
	}

	function formatOf(frame: PhotoFrame): string {
		return frame.formatId ? shortFormatLabel(frame.formatId) : 'KUSTOM';
	}

	// ── Filter format: chip hanya muncul untuk format yang benar-benar ada ──
	let formatFilter: string | null = null;

	$: formatLabel = shortFormatLabel($session.formatId);

	$: formatOptions = savedFrames.reduce<{ id: string; label: string }[]>((acc, item) => {
		const id = item.frame.formatId;
		if (!id || acc.some((option) => option.id === id)) return acc;
		acc.push({ id, label: shortFormatLabel(id) });
		return acc;
	}, []);

	$: visibleFrames = formatFilter
		? savedFrames.filter((item) => item.frame.formatId === formatFilter)
		: savedFrames;

	function togglePanel(): void {
		isPanelCollapsed = !isPanelCollapsed;
	}

	let isPanelCollapsed = false;

	// Photo zoom modal — dialog native modal (showModal) agar terpusat,
	// punya backdrop, dan Escape bekerja (R-32)
	let previewPhotoUrl: string | null = null;
	let previewPhotoIndex: number | null = null;
	let zoomDialogEl: HTMLDialogElement | null = null;
	let zoomOpener: HTMLElement | null = null;

	function openPhotoPreview(url: string, index: number): void {
		previewPhotoUrl = url;
		previewPhotoIndex = index;
		zoomOpener = document.activeElement as HTMLElement | null;
		zoomDialogEl?.showModal();
	}

	function handleZoomClosed(): void {
		previewPhotoUrl = null;
		previewPhotoIndex = null;
		zoomOpener?.focus();
		zoomOpener = null;
	}

	function handleZoomBackdrop(e: MouseEvent): void {
		if (e.target === zoomDialogEl) zoomDialogEl?.close();
	}

	function handleNext(): void {
		goTo('edit');
	}
</script>

<section
	class="editor-screen screen-enter kiosk-scope"
	class:theme-light={theme === 'light'}
	aria-label="Desain Strip Foto"
>
	<!-- Top Navigation Header — minimal -->
	<header class="editor-head">
		<button
			type="button"
			class="head-back-btn"
			on:click={() => goTo('review')}
			aria-label="Kembali ke review foto"
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

		<h1 class="editor-head-title font-display">Desain Strip</h1>

		<span class="head-balance" aria-hidden="true"></span>
	</header>

	<!-- Main 3-Column Stage -->
	<div class="editor-stage" class:is-collapsed={isPanelCollapsed}>
		<!-- 1. LEFT COLUMN: Captured Photos Sidebar — drag & drop reorder -->
		<aside class="photos-column" aria-label="Koleksi foto sesi">
			<div class="photos-scroll" role="list">
				{#each photos as photo, i}
					<div
						class="photo-cell"
						class:is-dragging={draggedIdx === i}
						class:drop-above={dropTargetIdx === i && !dropAfter}
						class:drop-below={dropTargetIdx === i && dropAfter}
						draggable="true"
						on:dragstart={(e) => handleDragStart(e, i)}
						on:dragover={(e) => handleDragOver(e, i)}
						on:dragleave={() => handleDragLeave(i)}
						on:drop={(e) => handleDrop(e, i)}
						on:dragend={handleDragEnd}
						role="listitem"
					>
						<button
							type="button"
							class="photo-cell-btn"
							on:click={() => openPhotoPreview(photo, i)}
							aria-label="Perbesar foto nomor {i + 1}"
						>
							<img src={photo} alt="Foto {i + 1}" class="photo-cell-img" />
							<span class="photo-tag font-mono">#{i + 1}</span>
						</button>

						<!-- Overlay kios layar sentuh: tukar posisi tanpa drag -->
						<div class="photo-cell-tools">
							<button
								type="button"
								class="swap-btn"
								disabled={i === 0}
								on:click={() => {
									swapPhotos(i, i - 1);
								}}
								aria-label="Geser foto {i + 1} ke urutan {i}"
							>
								<svg
									width="14"
									height="14"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2.5"
									stroke-linecap="round"
									stroke-linejoin="round"
									aria-hidden="true"
								>
									<polyline points="18 15 12 9 6 15" />
								</svg>
							</button>
							<button
								type="button"
								class="swap-btn"
								disabled={i === photos.length - 1}
								on:click={() => {
									swapPhotos(i, i + 1);
								}}
								aria-label="Geser foto {i + 1} ke urutan {i + 2}"
							>
								<svg
									width="14"
									height="14"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2.5"
									stroke-linecap="round"
									stroke-linejoin="round"
									aria-hidden="true"
								>
									<polyline points="6 9 12 15 18 9" />
								</svg>
							</button>
						</div>
					</div>
				{/each}
			</div>
		</aside>

		<!-- 2. CENTER COLUMN: Big Strip Canvas Preview -->
		<main class="strip-column" aria-label="Pratinjau strip foto">
			<div class="strip-center-box">
				<div class="strip-paper-frame">
					<div class="strip-canvas-zoom" style="transform: scale({canvasZoom});">
						<canvas
							bind:this={canvas}
							class="strip-canvas"
							width="300"
							height="900"
							aria-label="Photo strip canvas"
						></canvas>
					</div>
				</div>
			</div>

			<!-- Pill melayang: nomor slot · zoom -->
			<div class="canvas-fab" role="group" aria-label="Kontrol kanvas">
				<button
					type="button"
					class="fab-btn font-mono"
					class:is-active={showSlotNumbers}
					on:click={() => {
						showSlotNumbers = !showSlotNumbers;
					}}
					aria-pressed={showSlotNumbers ? 'true' : 'false'}
					aria-label="Tampilkan nomor slot di kanvas"
				>
					123
				</button>
				<span class="fab-sep" aria-hidden="true"></span>
				<button
					type="button"
					class="fab-btn"
					on:click={zoomOut}
					aria-label="Perkecil kanvas"
					disabled={canvasZoom <= ZOOM_MIN}>−</button
				>
				<button
					type="button"
					class="fab-btn fab-level font-mono"
					on:click={zoomFit}
					aria-label="Kembalikan kanvas ke ukuran pas"
				>
					{Math.round(canvasZoom * 100)}%
				</button>
				<button
					type="button"
					class="fab-btn"
					on:click={zoomIn}
					aria-label="Perbesar kanvas"
					disabled={canvasZoom >= ZOOM_MAX}>+</button
				>
			</div>

			<!-- Collapse / Expand chevron button on boundary -->
			<button
				type="button"
				class="stage-chevron-btn"
				on:click={togglePanel}
				aria-label={isPanelCollapsed ? 'Tampilkan panel template' : 'Sembunyikan panel template'}
				title={isPanelCollapsed ? 'Tampilkan Template' : 'Sembunyikan Panel'}
			>
				<svg
					width="14"
					height="14"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2.5"
					stroke-linecap="round"
					stroke-linejoin="round"
					aria-hidden="true"
				>
					{#if isPanelCollapsed}
						<polyline points="15 18 9 12 15 6" />
					{:else}
						<polyline points="9 18 15 12 9 6" />
					{/if}
				</svg>
			</button>
		</main>

		<!-- 3. RIGHT COLUMN: Template Inspector & NEXT -->
		{#if !isPanelCollapsed}
			<aside class="templates-column" aria-label="Pilih template">
				<div class="filter-head">
					<span id="filter-title" class="filter-title font-mono">Filter</span>
					<div class="filter-chips" role="group" aria-labelledby="filter-title">
						<button
							type="button"
							class="filter-chip font-mono"
							class:is-active={formatFilter === null}
							on:click={() => (formatFilter = null)}
							aria-pressed={formatFilter === null ? 'true' : 'false'}
						>
							Semua
						</button>
						{#each formatOptions as option (option.id)}
							<button
								type="button"
								class="filter-chip font-mono"
								class:is-active={formatFilter === option.id}
								on:click={() => (formatFilter = option.id)}
								aria-pressed={formatFilter === option.id ? 'true' : 'false'}
							>
								{option.label}
							</button>
						{/each}
					</div>
				</div>

				<div
					class="templates-grid-scroll"
					id="template-panel"
					role="region"
					aria-label="Daftar template"
				>
					{#if savedFrames.length === 0}
						<div class="empty-catalog">
							<div class="empty-catalog-icon" aria-hidden="true">
								<svg
									viewBox="0 0 24 24"
									width="28"
									height="28"
									fill="none"
									stroke="currentColor"
									stroke-width="1.8"
									stroke-linecap="round"
									stroke-linejoin="round"
								>
									<path
										d="M4 8h2l1.5-2h9L18 8h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2z"
									/>
									<circle cx="12" cy="13" r="3.5" />
								</svg>
							</div>
							<p class="empty-catalog-title font-display">Belum ada template</p>
							<p class="empty-catalog-body font-mono">Admin bisa menambahkan lewat Frame Studio.</p>
							<a class="empty-catalog-link font-mono" href="/admin/frames">Buka Frame Studio</a>
						</div>
					{:else if visibleFrames.length === 0}
						<p class="filter-empty font-mono">Tidak ada template untuk filter ini.</p>
					{:else}
						<div class="preset-grid" role="group" aria-label="Template admin">
							{#if formatFilter === null}
								<button
									type="button"
									class="template-card"
									class:is-selected={$session.activeFrame === null &&
										$session.selectedTemplate === 'classic'}
									on:click={() => {
										setActiveFrame(null);
										selectBuiltinTemplate('classic');
									}}
									aria-pressed={$session.activeFrame === null &&
									$session.selectedTemplate === 'classic'
										? 'true'
										: 'false'}
									aria-label="Classic bawaan"
								>
									<span class="template-thumb design-thumb--builtin">
										<span>Classic</span>
										{#if $session.activeFrame === null && $session.selectedTemplate === 'classic'}
											<span class="selected-mark" aria-hidden="true">✓</span>
										{/if}
									</span>
									<span class="template-name">Classic (bawaan)</span>
									<span class="template-badge font-mono">Kertas booth</span>
								</button>
							{/if}
							{#each visibleFrames as item (item.frame.id)}
								<button
									type="button"
									class="template-card"
									class:is-selected={$session.activeFrame?.id === item.frame.id}
									class:is-locked={!item.matched}
									on:click={() => selectSavedFrame(item.frame)}
									disabled={!item.matched}
									aria-pressed={$session.activeFrame?.id === item.frame.id ? 'true' : 'false'}
									aria-label="{item.frame.name}{item.matched
										? ''
										: `: butuh ${item.frame.slotCount} foto`}"
								>
									<span class="template-thumb">
										<img src={item.frame.artworkDataUrl} alt="" class="template-thumb-img" />
										{#if $session.activeFrame?.id === item.frame.id}
											<span class="selected-mark" aria-hidden="true">✓</span>
										{/if}
									</span>
									<span class="template-name">
										{item.frame.name}
									</span>
									<span class="template-badge font-mono">
										{formatOf(item.frame)}
									</span>
									{#if !item.matched}
										<span class="template-note font-mono">Butuh {item.frame.slotCount} foto</span>
									{/if}
								</button>
							{/each}
						</div>
					{/if}
				</div>

				<footer class="templates-footer">
					<p class="footer-meta font-mono">
						{product.cm} · {photoCount} foto · {formatLabel}
					</p>
					<button type="button" id="btn-next" class="capsule-cta font-mono" on:click={handleNext}>
						SELANJUTNYA
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
				</footer>
			</aside>
		{/if}
	</div>
</section>

<!-- Photo Zoom Modal — native dialog (showModal): terpusat + backdrop + Escape -->
<!-- svelte-ignore a11y-click-events-have-key-events a11y-no-noninteractive-element-interactions -->
<dialog
	bind:this={zoomDialogEl}
	class="zoom-dialog"
	aria-label="Perbesar foto"
	on:close={handleZoomClosed}
	on:click={handleZoomBackdrop}
>
	<div class="zoom-box">
		<div class="zoom-box-head font-mono">
			<span>FOTO #{(previewPhotoIndex ?? 0) + 1}</span>
			<form method="dialog">
				<button type="submit" class="zoom-close-btn" aria-label="Tutup pratinjau"> ✕ </button>
			</form>
		</div>
		<div class="zoom-box-img">
			{#if previewPhotoUrl}
				<img src={previewPhotoUrl} alt="Foto #{(previewPhotoIndex ?? 0) + 1}" class="zoom-img" />
			{/if}
		</div>
	</div>
</dialog>

<style>
	/* ==========================================================================
     Editor Screen — Snappy / DiStudio Kiosk Theme Integration
     Uses --bg, --fg, --fg-dim, --hairline, --ring-line, --focus tokens.
     ========================================================================== */

	.editor-screen {
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

	/* ── Header ── */
	.editor-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		height: 52px;
		padding: 0 18px;
		border-bottom: 1px solid var(--ring-line);
		background: var(--bg);
		flex-shrink: 0;
		z-index: 20;
		transition:
			background-color 220ms ease,
			border-color 220ms ease;
	}

	.editor-head-title {
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

	/* ── Capsule CTA (Identitas Kios Snappy) ── */
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

	/* ── 3-Column Kiosk Stage ── */
	.editor-stage {
		flex: 1;
		display: grid;
		grid-template-columns: 220px 1fr 420px;
		height: calc(100vh - 52px);
		height: calc(100dvh - 52px);
		overflow: hidden;
		transition: grid-template-columns 220ms ease;
	}

	.editor-stage.is-collapsed {
		grid-template-columns: 220px 1fr 0px;
	}

	/* ── 1. KOLOM KIRI: Foto Sesi (drag & drop reorder) ── */
	.photos-column {
		background: var(--bg);
		border-right: 1px solid var(--ring-line);
		overflow-y: auto;
		padding: 12px 12px;
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
		cursor: grab;
	}

	.photo-cell.is-dragging {
		opacity: 0.55;
	}

	.photo-cell.drop-above {
		box-shadow: 0 -3px 0 0 var(--fg);
	}

	.photo-cell.drop-below {
		box-shadow: 0 3px 0 0 var(--fg);
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
			transform 160ms ease,
			opacity 160ms ease;
	}

	.photo-cell-btn:hover {
		border-color: var(--fg);
		transform: scale(1.02);
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

	/* Overlay tukar posisi — kaca tipis di atas thumbnail, target sentuh 44px */
	.photo-cell-tools {
		position: absolute;
		right: 6px;
		bottom: 6px;
		display: flex;
		gap: 4px;
		z-index: 2;
	}

	.swap-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 44px;
		height: 44px;
		padding: 0;
		border: 1px solid var(--ring-line);
		border-radius: 8px;
		background: color-mix(in srgb, var(--bg) 72%, transparent);
		backdrop-filter: blur(6px);
		-webkit-backdrop-filter: blur(6px);
		color: var(--fg);
		cursor: pointer;
		transition:
			color 160ms ease,
			border-color 160ms ease,
			background-color 160ms ease;
	}

	.swap-btn:hover:not(:disabled) {
		border-color: var(--fg);
		background: color-mix(in srgb, var(--bg) 90%, transparent);
	}

	.swap-btn:disabled {
		opacity: 0.3;
		cursor: default;
	}

	.swap-btn:focus-visible {
		outline: 2.5px solid var(--focus);
		outline-offset: 2px;
	}

	/* ── 2. KOLOM TENGAH: Preview Strip ── */
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

	/* ── Pill melayang kanvas: nomor slot · zoom ── */
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

	.fab-btn:hover:not(:disabled) {
		color: var(--fg);
		background: var(--ring-line);
	}

	.fab-btn:disabled {
		opacity: 0.3;
		cursor: default;
	}

	.fab-btn:focus-visible {
		outline: 2.5px solid var(--focus);
		outline-offset: 2px;
	}

	.fab-btn.is-active {
		background: var(--fg);
		color: var(--bg);
	}

	.fab-btn.is-active:hover {
		background: var(--fg);
		color: var(--bg);
	}

	.fab-level {
		font-size: 0.64rem;
		letter-spacing: 0.08em;
		color: var(--fg);
	}

	.fab-sep {
		width: 1px;
		height: 20px;
		background: var(--hairline);
		margin: 0 2px;
		flex-shrink: 0;
	}

	.strip-center-box {
		display: flex;
		align-items: center;
		justify-content: center;
		flex: 1;
		width: 100%;
		min-height: 0;
		padding: 8px 12px;
	}

	.strip-paper-frame {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		height: 100%;
		min-height: 0;
	}

	.strip-canvas-zoom {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		height: 100%;
		min-height: 0;
		transition: transform 180ms ease;
	}

	/* Kanvas mengikuti rasio format (portrait / landscape / square) lewat
	   object-fit; kotak elemen penuh, isi strip selalu utuh tanpa distorsi. */
	.strip-canvas {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: contain;
		filter: drop-shadow(0 12px 28px rgba(11, 10, 9, 0.32)) drop-shadow(0 0 1px var(--ring-line));
	}

	.theme-light .strip-canvas {
		filter: drop-shadow(0 12px 28px rgba(28, 25, 23, 0.18)) drop-shadow(0 0 1px var(--ring-line));
	}

	.stage-chevron-btn {
		position: absolute;
		right: 12px;
		top: 50%;
		transform: translateY(-50%);
		width: 44px;
		height: 44px;
		border-radius: 50%;
		background: var(--bg);
		border: 1px solid var(--hairline);
		color: var(--fg-dim);
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		backdrop-filter: blur(8px);
		transition:
			color 160ms ease,
			border-color 160ms ease,
			transform 160ms ease;
		z-index: 10;
	}

	.stage-chevron-btn:hover {
		color: var(--fg);
		border-color: var(--fg);
		transform: translateY(-50%) scale(1.08);
	}

	.stage-chevron-btn:focus-visible {
		outline: 2.5px solid var(--focus);
		outline-offset: 3px;
	}

	/* ── 3. KOLOM KANAN: Template Inspector & LANJUT CETAK ── */
	.templates-column {
		background: var(--bg);
		border-left: 1px solid var(--ring-line);
		display: flex;
		flex-direction: column;
		overflow: hidden;
		min-height: 0;
	}

	/* ── Filter format di kepala panel ── */
	.filter-head {
		flex-shrink: 0;
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 12px 14px 10px;
		border-bottom: 1px solid var(--ring-line);
	}

	.filter-title {
		font-size: 0.58rem;
		font-weight: 700;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--fg-dim);
	}

	.filter-chips {
		display: flex;
		gap: 8px;
		overflow-x: auto;
		padding-bottom: 2px;
		scrollbar-width: none;
	}

	.filter-chips::-webkit-scrollbar {
		display: none;
	}

	.filter-chip {
		flex: 0 0 auto;
		min-height: 44px;
		padding: 0 14px;
		border: 1px solid var(--hairline);
		border-radius: 10px;
		background: transparent;
		color: var(--fg-dim);
		font-size: 0.62rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		cursor: pointer;
		transition:
			color 160ms ease,
			border-color 160ms ease,
			background-color 160ms ease;
	}

	.filter-chip:hover {
		color: var(--fg);
		border-color: var(--fg);
	}

	.filter-chip.is-active {
		background: var(--fg);
		border-color: var(--fg);
		color: var(--bg);
	}

	.filter-chip:focus-visible {
		outline: 2.5px solid var(--focus);
		outline-offset: 2px;
	}

	/* ── Grid template ── */
	.templates-grid-scroll {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		overscroll-behavior: contain;
		padding: 12px 14px;
	}

	.preset-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
		gap: 10px;
	}

	.template-card {
		display: flex;
		flex-direction: column;
		gap: 6px;
		width: 100%;
		min-width: 0;
		padding: 8px;
		border: 2px solid var(--ring-line);
		border-radius: 12px;
		background: transparent;
		color: inherit;
		font-family: inherit;
		cursor: pointer;
		transition:
			border-color 160ms ease,
			background-color 160ms ease,
			opacity 160ms ease;
	}

	.template-card:hover:not(:disabled) {
		border-color: var(--hairline);
		background: var(--ring-line);
	}

	.template-card.is-selected {
		border-color: var(--fg);
		box-shadow: 0 0 0 3px var(--halo);
	}

	.template-card.is-locked {
		opacity: 0.45;
		cursor: not-allowed;
	}

	.template-card:focus-visible {
		outline: 2.5px solid var(--focus);
		outline-offset: 2px;
	}

	.filter-empty {
		margin: 0;
		padding: 28px 16px;
		text-align: center;
		font-size: 0.68rem;
		line-height: 1.6;
		color: var(--fg-dim);
	}

	.template-thumb {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		height: clamp(140px, 24vh, 220px);
		border-radius: 8px;
		overflow: hidden;
		background: var(--veil-edge);
	}

	.template-thumb-img {
		width: 100%;
		height: 100%;
		object-fit: contain;
		display: block;
	}

	/* Classic tidak punya artwork: tampilkan kertas booth sebagai penanda. */
	.design-thumb--builtin {
		background: #fbf7f0;
		color: #1c1917;
		font-family: 'Playfair Display', Georgia, serif;
		font-size: 1.5rem;
		letter-spacing: 0.04em;
		box-shadow: inset 0 0 0 1px rgba(28, 25, 23, 0.12);
	}

	.selected-mark {
		position: absolute;
		top: 6px;
		right: 6px;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
		border-radius: 50%;
		background: var(--fg);
		color: var(--bg);
		font-size: 0.72rem;
		font-weight: 800;
		box-shadow: 0 2px 8px rgba(11, 10, 9, 0.35);
	}

	.template-name {
		font-size: 0.72rem;
		font-weight: 600;
		line-height: 1.25;
		text-align: center;
		color: var(--fg);
		display: -webkit-box;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
		line-clamp: 2;
		overflow: hidden;
	}

	.template-badge {
		font-size: 0.56rem;
		font-weight: 700;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--fg-dim);
		text-align: center;
		opacity: 0.8;
	}

	.template-note {
		font-size: 0.55rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		text-align: center;
		color: var(--fg-dim);
	}

	.empty-catalog {
		margin: 0;
		text-align: center;
		font-size: 0.72rem;
		line-height: 1.6;
		color: var(--fg-dim);
		padding: 28px 16px;
	}

	.empty-catalog-title {
		margin: 0 0 6px;
		font-size: 1.05rem;
		font-weight: 500;
		color: var(--fg);
	}

	.empty-catalog-body {
		margin: 0 0 14px;
		font-size: 0.62rem;
		letter-spacing: 0.1em;
		color: var(--fg-dim);
	}

	.empty-catalog-link {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-height: 36px;
		padding: 0 16px;
		border: 1px solid var(--hairline);
		border-radius: 999px;
		background: transparent;
		color: var(--fg-dim);
		font-size: 0.6rem;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		text-decoration: none;
		transition:
			color 160ms ease,
			border-color 160ms ease;
	}

	.empty-catalog-link:hover {
		color: var(--fg);
		border-color: var(--fg);
	}
	/* Bottom Actions SELANJUTNYA button */
	.templates-footer {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 12px 14px 16px;
		border-top: 1px solid var(--ring-line);
		background: var(--bg);
		flex-shrink: 0;
	}

	.footer-meta {
		margin: 0;
		text-align: center;
		font-size: 0.58rem;
		letter-spacing: 0.06em;
		color: var(--fg-dim);
	}

	/* ── Zoom Dialog ── */
	.zoom-dialog {
		border: none;
		padding: 0;
		background: transparent;
		max-width: 100vw;
		max-height: 100dvh;
		margin: auto;
	}

	.zoom-dialog::backdrop {
		background: var(--veil-mid, rgba(11, 10, 9, 0.85));
	}

	.zoom-box {
		width: min(90vw, 560px);
		background: var(--bg);
		border: 1px solid var(--hairline);
		border-radius: 14px;
		overflow: hidden;
		box-shadow: 0 24px 60px rgba(11, 10, 9, 0.5);
	}

	.zoom-box-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 10px 16px;
		font-size: 0.68rem;
		font-weight: 700;
		letter-spacing: 0.18em;
		color: var(--fg);
		border-bottom: 1px solid var(--ring-line);
	}

	.zoom-close-btn {
		min-width: 44px;
		min-height: 44px;
		border-radius: 50%;
		background: transparent;
		border: 1px solid var(--hairline);
		color: var(--fg-dim);
		font-size: 11px;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition:
			color 140ms ease,
			border-color 140ms ease;
	}

	.zoom-close-btn:hover {
		color: var(--fg);
		border-color: var(--fg);
	}

	.zoom-box-img {
		background: #000;
	}

	.zoom-img {
		width: 100%;
		max-height: 72vh;
		object-fit: contain;
		display: block;
	}

	/* ── Responsive Mobile / Small Screen ── */
	@media (max-width: 860px) {
		.editor-stage {
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

		.template-thumb {
			height: 128px;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.editor-screen,
		.fab-btn,
		.capsule-cta,
		.template-card,
		.photo-cell-btn,
		.strip-canvas-zoom {
			transition: none;
		}
	}
</style>
