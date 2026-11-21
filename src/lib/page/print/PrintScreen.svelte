<script lang="ts">
	import { onDestroy, onMount, tick } from 'svelte';
	import { session, goTo, resetSession, stripPhotos } from '#lib/stores/session';
	import { getProductForCount, renderExportCanvas } from '#lib/utils/canvas';
	import { frameToTemplate } from '#lib/utils/frameStorage';
	import { formatById } from '#lib/data/standardFormats';
	import { findPhotoFilter } from '#lib/data/filters';
	import { customFiltersStore } from '#lib/services/customAssets';
	import { downloadStripPNG, printStrip } from '#lib/utils/export';
	import {
		saveGallerySession,
		buildQRCodeDataUrl,
		resolveGalleryUrl,
		generateId
	} from '#lib/services/gallery';
	import ThemeToggle from '#lib/components/ui/ThemeToggle.svelte';

	type PreviewTab = 'strip' | 'photos' | 'timelapse';

	let previewCanvas: HTMLCanvasElement;
	let activeTab: PreviewTab = 'strip';

	let isPrinting = false;
	let isDownloading = false;
	let downloadDone = false;
	let actionError: string | null = null;
	let copyTimer: ReturnType<typeof setTimeout> | null = null;
	let downloadTimer: ReturnType<typeof setTimeout> | null = null;

	let qrImageUrl: string | null = null;
	let galleryUrl: string | null = null;
	let galleryReady = false;
	let galleryError: string | null = null;
	let copiedUrl = false;

	$: theme = $session.theme;
	$: photos = $stripPhotos;
	$: templateKey = $session.selectedTemplate;
	$: activeFrame = $session.activeFrame;
	$: caption = $session.caption;
	$: showDate = $session.showDate;
	$: photoTransforms = $session.photoTransforms;
	$: stickers = $session.stickers;
	$: photoFilter = $session.photoFilter;
	$: photoFilterCss =
		(void $customFiltersStore,
		photoFilter ? (findPhotoFilter(photoFilter)?.cssFilter ?? 'none') : 'none');

	$: activeTemplate = activeFrame ? frameToTemplate(activeFrame) : templateKey;
	$: printFormat = formatById($session.formatId);
	$: isDigital = printFormat.kind === 'digital';

	$: produk = getProductForCount($session.photoCount, $session.formatId);
	$: sheetLandscape = produk.sheetOrient === 'landscape';

	let copiesChoice: number | null = null;
	$: copies = Math.min(copiesChoice ?? produk.copySheet, produk.copySheet);

	$: videoUrl = $session.timelapseVideoDataUrl;
	$: gifUrl = $session.timelapseDataUrl;

	onMount(async () => {
		void generateGalleryQR();
		await drawSheetPreview();
	});

	onDestroy(() => {
		if (copyTimer) clearTimeout(copyTimer);
		if (downloadTimer) clearTimeout(downloadTimer);
	});

	async function drawSheetPreview(): Promise<void> {
		if (!previewCanvas) return;
		try {
			const full = await renderExportCanvas(photos, activeTemplate, {
				caption,
				showDate,
				copies,
				formatId: $session.formatId,
				photoTransforms,
				stickers,
				photoFilter: photoFilterCss
			});
			const scale = Math.min(1200 / full.width, 1200 / full.height);
			previewCanvas.width = Math.max(1, Math.round(full.width * scale));
			previewCanvas.height = Math.max(1, Math.round(full.height * scale));
			const ctx = previewCanvas.getContext('2d');
			if (!ctx) return;
			ctx.imageSmoothingEnabled = true;
			ctx.imageSmoothingQuality = 'high';
			ctx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
			ctx.drawImage(full, 0, 0, previewCanvas.width, previewCanvas.height);
		} catch (e) {
			console.error('Render pratinjau strip gagal:', e);
			actionError = 'Pratinjau strip gagal dibuat. Coba muat ulang halaman.';
		}
	}

	async function setCopies(n: number): Promise<void> {
		if (n === copies) return;
		copiesChoice = n;
		await tick();
		await drawSheetPreview();
	}

	async function generateGalleryQR(): Promise<void> {
		try {
			const sessionId = generateId();
			galleryUrl = await resolveGalleryUrl(sessionId);
			qrImageUrl = await buildQRCodeDataUrl(galleryUrl, 512);
			galleryReady = true;

			void (async () => {
				try {
					let stripDataUrl = '';
					try {
						const full = await renderExportCanvas(photos, activeTemplate, {
							caption,
							showDate,
							copies,
							formatId: $session.formatId,
							photoTransforms,
							stickers,
							photoFilter: photoFilterCss
						});
						stripDataUrl = full.toDataURL('image/png');
					} catch (ce) {
						console.warn('Ekspor strip untuk galeri gagal:', ce);
					}

					await saveGallerySession({
						id: sessionId,
						photos: (photos || []).filter(Boolean),
						stripDataUrl,
						templateKey: typeof activeTemplate === 'string' ? activeTemplate : 'custom',
						gifDataUrl: gifUrl ?? null,
						videoDataUrl: videoUrl ?? null
					});
				} catch (saveErr) {
					console.warn('Simpan sesi galeri gagal:', saveErr);
				}
			})();
		} catch (e) {
			console.error('QR galeri gagal dibuat:', e);
			galleryError = 'QR gagal dibuat. Strip tetap bisa dicetak atau diunduh.';
		}
	}

	async function handlePrint(): Promise<void> {
		if (isPrinting) return;
		isPrinting = true;
		actionError = null;
		try {
			await printStrip(photos, activeTemplate, {
				caption,
				showDate,
				copies,
				formatId: $session.formatId,
				photoTransforms,
				stickers,
				photoFilter: photoFilterCss
			});
		} catch (err) {
			console.error('Cetak gagal:', err);
			actionError = 'Dialog cetak gagal dibuka. Unduh PNG lalu cetak dari perangkat.';
		} finally {
			isPrinting = false;
		}
	}

	async function handleDownload(): Promise<void> {
		if (isDownloading) return;
		isDownloading = true;
		actionError = null;
		try {
			await downloadStripPNG(photos, activeTemplate, {
				caption,
				showDate,
				copies,
				formatId: $session.formatId,
				photoTransforms,
				stickers,
				photoFilter: photoFilterCss
			});
			downloadDone = true;
			if (downloadTimer) clearTimeout(downloadTimer);
			downloadTimer = setTimeout(() => (downloadDone = false), 4000);
		} catch (err) {
			console.error('Unduh PNG gagal:', err);
			actionError = 'PNG gagal dibuat. Coba lagi atau pindai QR untuk membuka galeri.';
		} finally {
			isDownloading = false;
		}
	}

	function handleNewSession(): void {
		resetSession();
	}

	function copyGalleryUrl(): void {
		if (!galleryUrl) return;
		navigator.clipboard
			.writeText(galleryUrl)
			.then(() => {
				copiedUrl = true;
				if (copyTimer) clearTimeout(copyTimer);
				copyTimer = setTimeout(() => (copiedUrl = false), 2500);
			})
			.catch(() => {
				actionError = 'Link tidak bisa disalin otomatis.';
			});
	}
</script>

<section
	class="print-screen screen-enter kiosk-scope"
	class:theme-light={theme === 'light'}
	aria-label="Cetak dan bagikan"
>
	<img
		class="bg-frame"
		src="/strip-select/bg-frame.png"
		alt=""
		aria-hidden="true"
		draggable="false"
	/>

	<div class="frame-inner">
		<header class="top-bar">
			<div class="bar-left">
				<button
					type="button"
					class="back-pill"
					on:click={() => goTo('timelapse')}
					aria-label="Kembali ke timelapse"
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
					Timelapse
				</button>
			</div>

			<h1 class="screen-title">CETAK &amp; BAGIKAN</h1>

			<div class="bar-right">
				<ThemeToggle inline />
			</div>
		</header>

		<div class="header-divider" aria-hidden="true"></div>

		<div class="print-stage">
			<!-- KIRI: Panggung Pratinjau Utama (Strip / Foto Sesi / Timelapse) -->
			<main class="showcase-stage" aria-label="Pratinjau hasil sesi">
				<div class="stage-tabs" role="tablist" aria-label="Pilih pratinjau">
					<button
						type="button"
						role="tab"
						class="tab-pill"
						class:is-active={activeTab === 'strip'}
						aria-selected={activeTab === 'strip'}
						on:click={() => (activeTab = 'strip')}
					>
						<svg
							width="14"
							height="14"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2.2"
							stroke-linecap="round"
							stroke-linejoin="round"
							aria-hidden="true"
						>
							<rect x="6" y="2" width="12" height="20" rx="2" />
							<line x1="6" y1="8" x2="18" y2="8" />
							<line x1="6" y1="14" x2="18" y2="14" />
						</svg>
						Hasil Strip
					</button>

					<button
						type="button"
						role="tab"
						class="tab-pill"
						class:is-active={activeTab === 'photos'}
						aria-selected={activeTab === 'photos'}
						on:click={() => (activeTab = 'photos')}
					>
						<svg
							width="14"
							height="14"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2.2"
							stroke-linecap="round"
							stroke-linejoin="round"
							aria-hidden="true"
						>
							<rect x="3" y="3" width="7" height="7" rx="1.5" />
							<rect x="14" y="3" width="7" height="7" rx="1.5" />
							<rect x="3" y="14" width="7" height="7" rx="1.5" />
							<rect x="14" y="14" width="7" height="7" rx="1.5" />
						</svg>
						Foto Sesi
					</button>

					<button
						type="button"
						role="tab"
						class="tab-pill"
						class:is-active={activeTab === 'timelapse'}
						aria-selected={activeTab === 'timelapse'}
						on:click={() => (activeTab = 'timelapse')}
					>
						<svg
							width="14"
							height="14"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2.2"
							stroke-linecap="round"
							stroke-linejoin="round"
							aria-hidden="true"
						>
							<polygon points="6 4 20 12 6 20 6 4" />
						</svg>
						Timelapse
					</button>
				</div>

				<div class="stage-viewport">
					<!-- Tab 1: Hasil Strip (tetap terpasang agar bitmap kanvas tidak hilang) -->
					<div class="strip-view" role="tabpanel" hidden={activeTab !== 'strip'}>
						<canvas
							bind:this={previewCanvas}
							width={sheetLandscape ? 600 : 400}
							height={sheetLandscape ? 400 : 600}
							class="sheet-canvas"
							aria-label="Pratinjau lembar cetak"
						></canvas>
					</div>

					<!-- Tab 2: Foto Sesi -->
					{#if activeTab === 'photos'}
						<div class="photos-view" role="tabpanel">
							{#if photos.length}
								<ul class="photo-grid" data-count={photos.length}>
									{#each photos as photo, i (i)}
										<li class="photo-tile">
											<img src={photo} alt="Foto {i + 1} pada strip" draggable="false" />
											<span class="photo-num" aria-hidden="true">{i + 1}</span>
										</li>
									{/each}
								</ul>
							{:else}
								<p class="empty-note">Belum ada foto di sesi ini.</p>
							{/if}
						</div>
					{/if}

					<!-- Tab 3: Timelapse -->
					{#if activeTab === 'timelapse'}
						<div class="video-view" role="tabpanel">
							{#if videoUrl}
								<div class="video-frame">
									<!-- svelte-ignore a11y_media_has_caption -->
									<video
										src={videoUrl}
										controls
										loop
										muted
										playsinline
										autoplay
										aria-label="Video timelapse sesi"
									></video>
								</div>
							{:else if gifUrl}
								<div class="video-frame">
									<img src={gifUrl} alt="GIF timelapse sesi" />
								</div>
							{:else}
								<div class="empty-box">
									<p class="empty-title">Belum ada timelapse</p>
									<p class="empty-note">Buat video singkat dari rangkaian foto sesi ini.</p>
									<button
										type="button"
										class="is-compact btn-outline"
										on:click={() => goTo('timelapse')}
									>
										Buat Timelapse
									</button>
								</div>
							{/if}
						</div>
					{/if}
				</div>

				{#if activeTab === 'strip' && produk.copySheet > 1}
					<div class="copies-pill" role="group" aria-label="Jumlah salinan cetak">
						<button
							type="button"
							class="copy-opt"
							class:is-active={copies === 1}
							on:click={() => setCopies(1)}
							aria-pressed={copies === 1}
						>
							1 Salinan
						</button>
						<button
							type="button"
							class="copy-opt"
							class:is-active={copies === 2}
							on:click={() => setCopies(2)}
							aria-pressed={copies === 2}
						>
							2 Salinan
						</button>
					</div>
				{/if}
			</main>

			<!-- KANAN: Panel QR Galeri & Aksi Cetak -->
			<aside class="panel action-panel" aria-label="Bagikan dan cetak">
				<div class="panel-body">
					<section class="qr-card" aria-labelledby="qr-title">
						<div class="qr-head">
							<h2 id="qr-title" class="group-eyebrow">GALERI HP</h2>
							<p class="qr-sub">Pindai QR untuk simpan strip, foto &amp; timelapse</p>
						</div>

						{#if galleryReady && qrImageUrl && galleryUrl}
							<div class="qr-wrap">
								<div class="qr-box">
									<img src={qrImageUrl} alt="QR code galeri foto sesi" draggable="false" />
								</div>
							</div>

							<div class="qr-link-bar">
								<span class="qr-url" title={galleryUrl}>{galleryUrl}</span>
								<button type="button" class="qr-chip" on:click={copyGalleryUrl}>
									{copiedUrl ? 'Tersalin' : 'Salin'}
								</button>
								<a class="qr-chip" href={galleryUrl} target="_blank" rel="noopener noreferrer">
									Buka
								</a>
							</div>
						{:else if galleryError}
							<p class="error-note" role="alert">{galleryError}</p>
						{:else}
							<div class="qr-wrap">
								<div class="qr-box qr-loading" role="status">
									<span class="spinner" aria-hidden="true"></span>
									<span>Menyiapkan QR…</span>
								</div>
							</div>
						{/if}
					</section>

					{#if actionError}
						<p class="error-note" role="alert">{actionError}</p>
					{/if}
					{#if downloadDone}
						<p class="ok-note" role="status">Strip PNG berhasil disimpan.</p>
					{/if}
				</div>

				<footer class="panel-footer">
					{#if !isDigital}
						<button
							type="button"
							id="btn-print"
							class="btn-solid"
							on:click={handlePrint}
							disabled={isPrinting}
						>
							{#if isPrinting}
								<span class="spinner is-btn" aria-hidden="true"></span>
								Menyiapkan Cetak…
							{:else}
								<svg
									viewBox="0 0 24 24"
									width="17"
									height="17"
									fill="none"
									stroke="currentColor"
									stroke-width="2.2"
									stroke-linecap="round"
									stroke-linejoin="round"
									aria-hidden="true"
								>
									<path d="M6 9V2h12v7" />
									<path
										d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"
									/>
									<rect x="6" y="14" width="12" height="8" />
								</svg>
								Cetak Foto
							{/if}
						</button>
					{:else}
						<p class="digital-note">Format ini khusus digital tanpa lembar cetak.</p>
					{/if}

					<div class="secondary-actions">
						<button
							type="button"
							id="btn-download-png"
							class="btn-outline"
							on:click={handleDownload}
							disabled={isDownloading}
						>
							<svg
								viewBox="0 0 24 24"
								width="15"
								height="15"
								fill="none"
								stroke="currentColor"
								stroke-width="2.2"
								stroke-linecap="round"
								stroke-linejoin="round"
								aria-hidden="true"
							>
								<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
								<polyline points="7 10 12 15 17 10" />
								<line x1="12" y1="15" x2="12" y2="3" />
							</svg>
							{isDownloading ? 'Menyiapkan…' : 'Unduh PNG'}
						</button>

						<button type="button" class="btn-outline" on:click={handleNewSession}>
							<svg
								viewBox="0 0 24 24"
								width="15"
								height="15"
								fill="none"
								stroke="currentColor"
								stroke-width="2.2"
								stroke-linecap="round"
								stroke-linejoin="round"
								aria-hidden="true"
							>
								<path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
								<path d="M3 3v5h5" />
							</svg>
							Sesi Baru
						</button>
					</div>
				</footer>
			</aside>
		</div>
	</div>
</section>

<style>
	@import './_PrintScreen.css';
</style>
