<script lang="ts">
	import { onMount } from 'svelte';
	import {
		session,
		goTo,
		setCustomTemplate,
		selectBuiltinTemplate,
		swapPhotos,
		movePhoto,
		stripPhotos
	} from '#lib/stores/session';
	import { PRODUK, TEMPLATES, renderStripPreview } from '#lib/utils/canvas';
	import { frameToTemplate } from '#lib/utils/frameStorage';
	import TemplateThumb from '#lib/features/editor/TemplateThumb.svelte';
	import CustomTemplateBuilder from '#lib/features/editor/CustomTemplateBuilder.svelte';
	import TemplateLibraryModal from '#lib/features/editor/TemplateLibraryModal.svelte';
	import { getAllCustomTemplates } from '#lib/utils/customTemplateStorage';
	import type { CustomTemplate } from '#lib/types';

	let canvas: HTMLCanvasElement;

	$: theme = $session.theme;
	$: photos = $stripPhotos;
	$: photoCount = $session.photoCount;
	$: activeFrame = $session.activeFrame;
	$: customTemplateData = $session.customTemplateData;
	$: caption = $session.caption;
	$: showDate = $session.showDate;

	$: activeTemplate = activeFrame
		? frameToTemplate(activeFrame)
		: customTemplateData || $session.selectedTemplate;
	$: product = PRODUK[photoCount] || PRODUK[4];

	// ── Panel kanan: preset kertas bawaan · template buatan sendiri ──
	type PanelTab = 'preset' | 'mine';
	let activeTab: PanelTab = 'preset';

	$: presets = Object.values(TEMPLATES).map((t) => ({ key: t.id, label: t.label }));

	let customTemplatesList: CustomTemplate[] = [];
	$: userTemplates = customTemplatesList.map((template) => {
		const slotCount = (template.slots || []).length;
		return { template, slotCount, matched: slotCount === photoCount };
	});

	function isPresetSelected(key: string): boolean {
		return !customTemplateData && $session.selectedTemplate === key;
	}

	function isCustomSelected(template: CustomTemplate): boolean {
		return customTemplateData?.id === template.id;
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
		const p = PRODUK[$session.photoCount] || PRODUK[4];
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
			{ caption, showDate, showSlotNumbers },
			isStale
		);
	}

	onMount(async () => {
		await refreshCustomTemplates();
		// Pilihan lama bisa menunjuk preset katalog yang sudah dihapus.
		if (!customTemplateData && !TEMPLATES[$session.selectedTemplate]) {
			selectBuiltinTemplate('classic');
		}
		await renderPreview();
	});

	async function refreshCustomTemplates(): Promise<void> {
		try {
			customTemplatesList = await getAllCustomTemplates();
		} catch (e) {
			console.error('Error refreshing custom templates:', e);
		}
	}

	function selectPreset(key: string): void {
		selectBuiltinTemplate(key);
	}

	function selectCustom(template: CustomTemplate): void {
		setCustomTemplate(template);
	}

	function togglePanel(): void {
		isPanelCollapsed = !isPanelCollapsed;
	}

	let isPanelCollapsed = false;

	// Custom template modal states
	let showBuilderModal = false;
	let builderEditingTemplate: CustomTemplate | null = null;
	let showLibraryModal = false;

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
		goTo('print');
	}

	function handleCustomTemplateSaved(savedTemplate: CustomTemplate): void {
		showBuilderModal = false;
		setCustomTemplate(savedTemplate);
		refreshCustomTemplates();
	}

	function handleSelectLibraryCustom(tmpl: CustomTemplate): void {
		setCustomTemplate(tmpl);
		showLibraryModal = false;
		refreshCustomTemplates();
	}

	function openCreateCustomTemplate(): void {
		builderEditingTemplate = null;
		showBuilderModal = true;
		showLibraryModal = false;
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
			<aside class="templates-column" aria-label="Pilih desain strip">
				{#if activeFrame}
					<div class="frame-panel">
						<p class="frame-panel-label font-mono">FRAME AKTIF</p>
						<p class="frame-panel-name">{activeFrame.name}</p>
						<p class="frame-panel-note font-mono">
							{photoCount} slot foto · {product.cm} cm
						</p>
						<p class="frame-panel-hint">
							Artwork frame dipakai apa adanya. Foto diisi otomatis ke lubang yang terdeteksi.
						</p>
						<button
							type="button"
							class="create-template-btn font-mono"
							on:click={() => goTo('strip')}
						>
							Ganti Frame
						</button>
					</div>
				{:else}
					<div class="panel-head">
						<div class="categories-header" role="tablist" aria-label="Jenis template">
							<button
								type="button"
								id="tab-preset"
								class="category-pill font-mono"
								class:is-active={activeTab === 'preset'}
								on:click={() => (activeTab = 'preset')}
								role="tab"
								aria-selected={activeTab === 'preset' ? 'true' : 'false'}
								aria-controls="template-panel"
							>
								Preset
							</button>
							<button
								type="button"
								id="tab-mine"
								class="category-pill font-mono"
								class:is-active={activeTab === 'mine'}
								on:click={() => (activeTab = 'mine')}
								role="tab"
								aria-selected={activeTab === 'mine' ? 'true' : 'false'}
								aria-controls="template-panel"
							>
								Template Saya ({userTemplates.length})
							</button>
						</div>
						<p class="product-note font-mono">
							{product.cm} cm · {photoCount} foto
						</p>
					</div>

					<div
						class="templates-grid-scroll"
						id="template-panel"
						role="tabpanel"
						aria-labelledby={activeTab === 'preset' ? 'tab-preset' : 'tab-mine'}
					>
						{#if activeTab === 'preset'}
							<div class="preset-grid" role="group" aria-label="Preset kertas">
								{#each presets as preset (preset.key)}
									<button
										type="button"
										class="template-card"
										class:is-selected={isPresetSelected(preset.key)}
										on:click={() => selectPreset(preset.key)}
										aria-pressed={isPresetSelected(preset.key) ? 'true' : 'false'}
									>
										<span class="template-thumb">
											<TemplateThumb template={preset.key} count={photoCount} />
											{#if isPresetSelected(preset.key)}
												<span class="selected-mark" aria-hidden="true">✓</span>
											{/if}
										</span>
										<span class="template-name">{preset.label}</span>
									</button>
								{/each}
							</div>
						{:else if userTemplates.length === 0}
							<p class="empty-catalog font-mono">
								Belum ada template buatanmu. Template baru mengikuti jumlah foto sesi ini.
							</p>
						{:else}
							<div class="preset-grid" role="group" aria-label="Template buatan sendiri">
								{#each userTemplates as item (item.template.id)}
									<button
										type="button"
										class="template-card"
										class:is-selected={isCustomSelected(item.template)}
										class:is-locked={!item.matched}
										on:click={() => selectCustom(item.template)}
										disabled={!item.matched}
										aria-pressed={isCustomSelected(item.template) ? 'true' : 'false'}
										aria-label="{item.template.name}{item.matched
											? ''
											: ` — butuh ${item.slotCount} foto`}"
									>
										<span class="template-thumb">
											<TemplateThumb template={item.template} count={item.slotCount} />
											{#if isCustomSelected(item.template)}
												<span class="selected-mark" aria-hidden="true">✓</span>
											{/if}
										</span>
										<span class="template-name">{item.template.name}</span>
										{#if !item.matched}
											<span class="template-note font-mono">{item.slotCount} foto</span>
										{/if}
									</button>
								{/each}
							</div>
						{/if}
					</div>

					<div class="templates-actions">
						<button
							type="button"
							class="create-template-btn font-mono"
							on:click={openCreateCustomTemplate}
						>
							+ Buat Template
						</button>
						<button
							type="button"
							class="library-btn font-mono"
							on:click={() => (showLibraryModal = true)}
							aria-label="Kelola template tersimpan"
						>
							Kelola
						</button>
					</div>
				{/if}

				<!-- Bottom Action Button: LANJUT CETAK -->
				<footer class="templates-footer">
					<button type="button" class="editor-detail-btn font-mono" on:click={() => goTo('edit')}>
						✎ Edit Detail
					</button>
					<button type="button" id="btn-next" class="capsule-cta font-mono" on:click={handleNext}>
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

<!-- Custom Template Builder Modal -->
{#if showBuilderModal}
	<CustomTemplateBuilder
		initialTemplate={builderEditingTemplate}
		initialSlotCount={photoCount}
		onClose={() => {
			showBuilderModal = false;
		}}
		onSaveAndApply={handleCustomTemplateSaved}
	/>
{/if}

<!-- Custom Template Library Modal -->
{#if showLibraryModal}
	<TemplateLibraryModal
		onClose={() => {
			showLibraryModal = false;
		}}
		onSelectTemplate={handleSelectLibraryCustom}
		onEditTemplate={(tmpl) => {
			builderEditingTemplate = tmpl;
			showLibraryModal = false;
			showBuilderModal = true;
		}}
		onCreateNew={openCreateCustomTemplate}
	/>
{/if}

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
		grid-template-columns: 200px 1fr 370px;
		height: calc(100vh - 52px);
		height: calc(100dvh - 52px);
		overflow: hidden;
		transition: grid-template-columns 220ms ease;
	}

	.editor-stage.is-collapsed {
		grid-template-columns: 200px 1fr 0px;
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
		object-fit: contain;
	}

	.theme-light .strip-canvas {
		box-shadow:
			0 10px 26px rgba(28, 25, 23, 0.14),
			0 0 0 1px var(--ring-line);
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

	.panel-head {
		flex-shrink: 0;
		border-bottom: 1px solid var(--ring-line);
	}

	/* Mode frame: panel template diganti ringkasan frame aktif */
	.frame-panel {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 10px;
		padding: 20px 16px;
		overflow-y: auto;
		min-height: 0;
	}

	.frame-panel-label {
		margin: 0;
		font-size: 0.58rem;
		font-weight: 800;
		letter-spacing: 0.24em;
		color: var(--fg-dim);
	}

	.frame-panel-name {
		margin: 0;
		font-size: 1.1rem;
		font-weight: 650;
		line-height: 1.25;
		color: var(--fg);
	}

	.frame-panel-note {
		margin: 0;
		font-size: 0.62rem;
		letter-spacing: 0.14em;
		color: var(--fg-dim);
	}

	.frame-panel-hint {
		margin: 0;
		font-size: 0.72rem;
		line-height: 1.55;
		color: var(--fg-dim);
	}

	.frame-panel .create-template-btn {
		width: 100%;
		margin-top: 4px;
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

	.product-note {
		margin: 0;
		padding: 0 12px 10px;
		font-size: 0.6rem;
		letter-spacing: 0.12em;
		color: var(--fg-dim);
	}

	.templates-actions {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: 8px;
		padding: 10px;
		border-top: 1px solid var(--ring-line);
		flex-shrink: 0;
	}

	.create-template-btn,
	.library-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		min-height: 44px;
		padding: 0 14px;
		border: 1px solid var(--hairline);
		border-radius: 8px;
		background: transparent;
		color: var(--fg-dim);
		font-size: 0.6rem;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		cursor: pointer;
		transition:
			color 160ms ease,
			border-color 160ms ease,
			background-color 160ms ease;
	}

	.create-template-btn:hover,
	.library-btn:hover {
		color: var(--fg);
		border-color: var(--fg);
		background: var(--ring-line);
	}

	.create-template-btn:focus-visible,
	.library-btn:focus-visible {
		outline: 2.5px solid var(--focus);
		outline-offset: 3px;
	}

	/* Template Grid */
	.templates-grid-scroll {
		flex: 1;
		overflow-y: auto;
		padding: 12px 10px;
		min-height: 0;
	}

	.preset-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 10px;
	}

	.template-card {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: stretch;
		gap: 6px;
		width: 100%;
		padding: 10px 8px 8px;
		border: 2px solid var(--ring-line);
		border-radius: 10px;
		background: transparent;
		color: inherit;
		font-family: inherit;
		font-size: inherit;
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
	}

	/* Template yang butuh jumlah foto berbeda — tak bisa dipakai */
	.template-card.is-locked {
		opacity: 0.45;
		cursor: not-allowed;
	}

	.template-card:focus-visible {
		outline: 2.5px solid var(--focus);
		outline-offset: 2px;
	}

	.template-thumb {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		height: clamp(104px, 19vh, 168px);
	}

	.selected-mark {
		position: absolute;
		top: -8px;
		right: -8px;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 20px;
		height: 20px;
		border-radius: 50%;
		background: var(--fg);
		color: var(--bg);
		font-size: 0.62rem;
		font-weight: 800;
	}

	.template-name {
		font-size: 0.7rem;
		font-weight: 600;
		line-height: 1.2;
		text-align: center;
		color: var(--fg);
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
		font-size: 0.64rem;
		line-height: 1.6;
		color: var(--fg-dim);
		padding: 22px 16px;
	}

	.editor-detail-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		width: 100%;
		min-height: 44px;
		padding: 0 24px;
		margin-bottom: 10px;
		border: 1px solid var(--hairline);
		border-radius: 999px;
		background: transparent;
		color: var(--fg);
		font-size: 0.6rem;
		font-weight: 800;
		letter-spacing: 0.22em;
		text-transform: uppercase;
		cursor: pointer;
		transition:
			border-color 160ms ease,
			background-color 160ms ease;
	}

	.editor-detail-btn:hover {
		border-color: var(--fg);
		background: var(--ring-line);
	}

	.editor-detail-btn:focus-visible {
		outline: 2.5px solid var(--focus);
		outline-offset: 4px;
	}

	/* Bottom Actions LANJUT CETAK button */
	.templates-footer {
		padding: 12px 14px 16px;
		border-top: 1px solid var(--ring-line);
		background: var(--bg);
		flex-shrink: 0;
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
