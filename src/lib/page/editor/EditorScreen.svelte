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
	import { detectFormat, formatById } from '#lib/data/standardFormats';
	import ThemeToggle from '#lib/components/ui/ThemeToggle.svelte';
	import StudioFrame from '#lib/components/ui/StudioFrame.svelte';
	import type { PhotoFrame } from '#lib/types';

	let canvas: HTMLCanvasElement;

	$: theme = $session.theme;
	$: photos = $stripPhotos;
	$: photoCount = $session.photoCount;
	$: formatId = $session.formatId;
	$: activeFrame = $session.activeFrame;
	$: caption = $session.caption;
	$: showDate = $session.showDate;

	$: activeTemplate = activeFrame ? frameToTemplate(activeFrame) : $session.selectedTemplate;

	// ── Panel kanan: hanya template yang persis cocok format + jumlah foto ──
	let savedFramesList: PhotoFrame[] = [];

	function frameMatchesSession(
		frame: PhotoFrame,
		targetFormatId: string,
		targetPhotoCount: number
	): boolean {
		if (frame.enabled === false) return false;
		if (frame.slotCount !== targetPhotoCount) return false;
		const resolvedFormatId =
			frame.formatId ?? detectFormat(frame.designWidth, frame.designHeight)?.id ?? null;
		return resolvedFormatId === targetFormatId;
	}

	$: matchingFrames = savedFramesList.filter((frame) =>
		frameMatchesSession(frame, formatId, photoCount)
	);

	// Jika activeFrame tidak cocok dengan format/jumlah foto sesi saat ini, kembalikan ke bawaan.
	$: if (activeFrame && !frameMatchesSession(activeFrame, formatId, photoCount)) {
		setActiveFrame(null);
	}

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
		if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
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
		const id = frame.formatId ?? detectFormat(frame.designWidth, frame.designHeight)?.id;
		return id ? shortFormatLabel(id) : 'KUSTOM';
	}

	let isPanelCollapsed = false;

	function togglePanel(): void {
		isPanelCollapsed = !isPanelCollapsed;
	}

	// ── Modal zoom foto ──
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
	<StudioFrame />

	<div class="frame-inner">
		<header class="top-bar">
			<div class="bar-left">
				<button
					type="button"
					class="back-pill"
					on:click={() => goTo('review')}
					aria-label="Kembali ke review foto"
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
					Review
				</button>
			</div>

			<h1 class="screen-title">DESAIN STRIP</h1>

			<div class="bar-right">
				<ThemeToggle inline />
			</div>
		</header>

		<div class="header-divider" aria-hidden="true"></div>

		<!-- Panggung utama 3 kolom -->
		<div class="editor-stage" class:is-collapsed={isPanelCollapsed}>
			<!-- 1. KOLOM KIRI: Urutan Foto (drag & drop + tombol tukar) -->
			<aside class="panel photos-panel" aria-label="Urutan foto sesi">
				<div class="panel-head">
					<span class="panel-eyebrow">URUTAN FOTO</span>
				</div>

				<div class="photos-scroll" role="list">
					{#each photos as photo, i}
						<div
							class="photo-item"
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
								class="photo-hit"
								on:click={() => openPhotoPreview(photo, i)}
								aria-label="Perbesar foto nomor {i + 1}"
							>
								<img src={photo} alt="Foto {i + 1}" class="photo-img" draggable="false" />
							</button>

							<span class="photo-num" aria-hidden="true">{i + 1}</span>

							<div class="swap-tools">
								<button
									type="button"
									class="swap-btn"
									disabled={i === 0}
									on:click={() => swapPhotos(i, i - 1)}
									aria-label="Geser foto {i + 1} ke urutan {i}"
								>
									<svg
										width="13"
										height="13"
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
									on:click={() => swapPhotos(i, i + 1)}
									aria-label="Geser foto {i + 1} ke urutan {i + 2}"
								>
									<svg
										width="13"
										height="13"
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

			<!-- 2. KOLOM TENGAH: Pratinjau Kanvas Strip -->
			<main class="preview-stage" aria-label="Pratinjau strip foto">
				<div class="canvas-viewport">
					<div class="canvas-zoom-layer" style="transform: scale({canvasZoom});">
						<canvas
							bind:this={canvas}
							class="strip-canvas"
							width="300"
							height="900"
							aria-label="Kanvas pratinjau strip foto"
						></canvas>
					</div>
				</div>

				<!-- Kontrol melayang: nomor slot · zoom -->
				<div class="canvas-toolbar" role="group" aria-label="Kontrol kanvas">
					<button
						type="button"
						class="tool-btn"
						class:is-active={showSlotNumbers}
						on:click={() => (showSlotNumbers = !showSlotNumbers)}
						aria-pressed={showSlotNumbers ? 'true' : 'false'}
						aria-label="Tampilkan nomor slot di kanvas"
					>
						123
					</button>
					<span class="tool-sep" aria-hidden="true"></span>
					<button
						type="button"
						class="tool-btn"
						on:click={zoomOut}
						aria-label="Perkecil kanvas"
						disabled={canvasZoom <= ZOOM_MIN}>−</button
					>
					<button
						type="button"
						class="tool-btn tool-level"
						on:click={zoomFit}
						aria-label="Kembalikan kanvas ke ukuran pas"
					>
						{Math.round(canvasZoom * 100)}%
					</button>
					<button
						type="button"
						class="tool-btn"
						on:click={zoomIn}
						aria-label="Perbesar kanvas"
						disabled={canvasZoom >= ZOOM_MAX}>+</button
					>
				</div>

				<!-- Tombol sembunyikan / tampilkan panel kanan -->
				<button
					type="button"
					class="panel-toggle-btn"
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
						stroke-width="2.4"
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

			<!-- 3. KOLOM KANAN: Katalog Template & Lanjut -->
			{#if !isPanelCollapsed}
				<aside class="panel templates-panel" aria-label="Katalog template">
					<div class="templates-head">
						<div class="panel-head is-inline">
							<span class="panel-eyebrow">TEMPLATE</span>
							<span class="templates-spec">{shortFormatLabel(formatId)} · {photoCount} Foto</span>
						</div>
					</div>

					<div
						class="templates-scroll"
						id="template-panel"
						role="region"
						aria-label="Daftar template"
					>
						<div class="template-grid" role="group" aria-label="Daftar template strip">
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
								<span class="template-thumb is-builtin">
									<span class="builtin-label">Classic</span>
									{#if $session.activeFrame === null && $session.selectedTemplate === 'classic'}
										<span class="selected-mark" aria-hidden="true">✓</span>
									{/if}
								</span>
								<span class="template-name">Classic (Bawaan)</span>
								<span class="template-sub">Kertas booth</span>
							</button>

							{#each matchingFrames as frame (frame.id)}
								<button
									type="button"
									class="template-card"
									class:is-selected={$session.activeFrame?.id === frame.id}
									on:click={() => selectSavedFrame(frame)}
									aria-pressed={$session.activeFrame?.id === frame.id ? 'true' : 'false'}
									aria-label={frame.name}
								>
									<span class="template-thumb">
										<img
											src={frame.artworkDataUrl}
											alt=""
											class="template-thumb-img"
											draggable="false"
										/>
										{#if $session.activeFrame?.id === frame.id}
											<span class="selected-mark" aria-hidden="true">✓</span>
										{/if}
									</span>
									<span class="template-name">{frame.name}</span>
									<span class="template-sub">{formatOf(frame)} · {frame.slotCount} Foto</span>
								</button>
							{/each}
						</div>
					</div>

					<footer class="templates-footer">
						<button type="button" id="btn-next" class="btn-next" on:click={handleNext}>
							Lanjut Edit
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
			{/if}
		</div>
	</div>
</section>

<!-- Modal zoom foto — native dialog (showModal) dengan token tema mandiri -->
<!-- svelte-ignore a11y-click-events-have-key-events a11y-no-noninteractive-element-interactions -->
<dialog
	bind:this={zoomDialogEl}
	class="zoom-dialog"
	class:theme-light={theme === 'light'}
	aria-label="Perbesar foto"
	on:close={handleZoomClosed}
	on:click={handleZoomBackdrop}
>
	<div class="zoom-box">
		<div class="zoom-head">
			<span class="zoom-title">Foto {(previewPhotoIndex ?? 0) + 1}</span>
			<form method="dialog">
				<button type="submit" class="zoom-close" aria-label="Tutup pratinjau">
					<svg
						viewBox="0 0 24 24"
						width="16"
						height="16"
						fill="none"
						stroke="currentColor"
						stroke-width="2.4"
						stroke-linecap="round"
						aria-hidden="true"
					>
						<path d="M6 6l12 12M18 6L6 18" />
					</svg>
				</button>
			</form>
		</div>
		<div class="zoom-media">
			{#if previewPhotoUrl}
				<img src={previewPhotoUrl} alt="Foto {(previewPhotoIndex ?? 0) + 1}" class="zoom-img" />
			{/if}
		</div>
	</div>
</dialog>

<style>
	@import './_EditorScreen.css';
</style>
