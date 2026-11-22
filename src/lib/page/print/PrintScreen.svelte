<script lang="ts">
	import { onDestroy, onMount, tick } from 'svelte';
	import { cubicOut } from 'svelte/easing';
	import type { TransitionConfig } from 'svelte/transition';
	import { session, goTo, resetSession, stripPhotos } from '#lib/stores/session';
	import { getProductForCount, renderExportCanvas } from '#lib/utils/canvas';
	import { frameToTemplate } from '#lib/utils/frameStorage';
	import { formatById } from '#lib/data/standardFormats';
	import { findPhotoFilter } from '#lib/data/filters';
	import { customFiltersStore } from '#lib/services/customAssets';
	import { downloadStripPNG, printStrip } from '#lib/utils/export';
	import {
		saveGallerySessionWithStatus,
		fetchSessionCloudSync,
		buildQRCodeDataUrl,
		resolveGalleryUrl,
		generateId
	} from '#lib/services/gallery';
	import ThemeToggle from '#lib/components/ui/ThemeToggle.svelte';
	import StudioFrame from '#lib/components/ui/StudioFrame.svelte';

	type PreviewTab = 'strip' | 'photos' | 'timelapse';
	type QrSource = 'drive' | 'local';
	type CloudQrState = 'idle' | 'waiting' | 'uploading' | 'done' | 'fallback' | 'failed';

	const AUTO_SLIDE_MS = 3000;
	const CLOUD_INITIAL_TIMEOUT_MS = 8000;
	const CLOUD_INITIAL_POLL_MS = 650;
	const CLOUD_BG_POLL_MS = 1500;
	const CLOUD_MAX_POLL_MS = 90000;

	let previewCanvas: HTMLCanvasElement;
	let activeTab: PreviewTab = 'strip';
	let destroyed = false;

	// State slide untuk tab Foto Sesi
	let activePhotoIndex = 0;
	let slideDir: 1 | -1 = 1;
	let photoAspect = 4 / 3;
	let slideProgressKey = 0;
	let slideTimer: ReturnType<typeof setInterval> | null = null;
	let swipeStartX: number | null = null;
	let swipeStartY: number | null = null;

	let isPrinting = false;
	let isDownloading = false;
	let downloadDone = false;
	let actionError: string | null = null;
	let copyTimer: ReturnType<typeof setTimeout> | null = null;
	let downloadTimer: ReturnType<typeof setTimeout> | null = null;
	let cloudPollTimer: ReturnType<typeof setTimeout> | null = null;

	let localGalleryUrl: string | null = null;
	let localQrImageUrl: string | null = null;
	let driveFolderUrl: string | null = null;
	let driveQrImageUrl: string | null = null;
	let activeQrSource: QrSource = 'local';
	let activeQrMode: 'smart' | 'gallery' | 'local' = 'smart';
	let qrLoadingLabel = 'Menyiapkan QR…';
	let cloudState: CloudQrState = 'idle';
	let cloudUploadedCount = 0;
	let cloudTotalFiles = 0;
	let cloudFallbackNote: string | null = null;
	let galleryReady = false;
	let galleryError: string | null = null;
	let copiedUrl = false;

	$: galleryUrl = activeQrSource === 'drive' && driveFolderUrl ? driveFolderUrl : localGalleryUrl;
	$: qrImageUrl = activeQrSource === 'drive' && driveQrImageUrl ? driveQrImageUrl : localQrImageUrl;
	$: hasDriveQr = Boolean(driveFolderUrl && driveQrImageUrl);
	$: hasBothQr = Boolean(hasDriveQr && localGalleryUrl && localQrImageUrl);
	$: localLabel =
		activeQrMode === 'gallery' || (localGalleryUrl ? /^https:\/\//i.test(localGalleryUrl) : false)
			? 'Galeri Web'
			: 'Wi-Fi Lokal';

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

	$: if (photos.length === 0) {
		activePhotoIndex = 0;
	} else if (activePhotoIndex >= photos.length) {
		activePhotoIndex = photos.length - 1;
	}

	$: activeSlidePhoto = photos[activePhotoIndex] ?? null;
	$: shouldAutoSlide = activeTab === 'photos' && photos.length > 1;
	$: syncSlideTimer(shouldAutoSlide);

	function stopSlideTimer(): void {
		if (slideTimer) {
			clearInterval(slideTimer);
			slideTimer = null;
		}
	}

	function startSlideTimer(): void {
		stopSlideTimer();
		if (typeof window === 'undefined' || activeTab !== 'photos' || photos.length <= 1) return;
		slideTimer = setInterval(() => {
			if (swipeStartX !== null) return;
			slideDir = 1;
			activePhotoIndex = (activePhotoIndex + 1) % photos.length;
			slideProgressKey += 1;
		}, AUTO_SLIDE_MS);
	}

	function syncSlideTimer(running: boolean): void {
		if (running) {
			slideProgressKey += 1;
			startSlideTimer();
		} else {
			stopSlideTimer();
		}
	}

	function handleSlideImgLoad(e: Event): void {
		const img = e.currentTarget as HTMLImageElement;
		if (img.naturalWidth > 0 && img.naturalHeight > 0) {
			photoAspect = img.naturalWidth / img.naturalHeight;
		}
	}

	function slidePhoto(
		_node: Element,
		{ dir, kind }: { dir: 1 | -1; kind: 'in' | 'out' }
	): TransitionConfig {
		const reduced =
			typeof window !== 'undefined' &&
			window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		if (reduced) {
			return { duration: 0 };
		}
		return {
			duration: kind === 'in' ? 320 : 280,
			easing: cubicOut,
			css: (t, u) => {
				const shift = kind === 'in' ? dir * u * 26 : -dir * u * 26;
				const scale = 0.96 + 0.04 * t;
				return `transform: translate3d(${shift}%, 0, 0) scale(${scale}); opacity: ${t};`;
			}
		};
	}

	function selectSlidePhoto(index: number): void {
		if (index < 0 || index >= photos.length || index === activePhotoIndex) return;
		slideDir = index > activePhotoIndex ? 1 : -1;
		activePhotoIndex = index;
		slideProgressKey += 1;
		startSlideTimer();
	}

	function prevSlidePhoto(): void {
		if (photos.length <= 1) return;
		slideDir = -1;
		activePhotoIndex = (activePhotoIndex - 1 + photos.length) % photos.length;
		slideProgressKey += 1;
		startSlideTimer();
	}

	function nextSlidePhoto(): void {
		if (photos.length <= 1) return;
		slideDir = 1;
		activePhotoIndex = (activePhotoIndex + 1) % photos.length;
		slideProgressKey += 1;
		startSlideTimer();
	}

	function handleSlidePointerDown(e: PointerEvent): void {
		if (photos.length <= 1 || e.button !== 0) return;
		swipeStartX = e.clientX;
		swipeStartY = e.clientY;
	}

	function handleSlidePointerUp(e: PointerEvent): void {
		if (swipeStartX === null || swipeStartY === null) return;
		const dx = e.clientX - swipeStartX;
		const dy = e.clientY - swipeStartY;
		swipeStartX = null;
		swipeStartY = null;

		if (Math.abs(dx) >= 48 && Math.abs(dx) > Math.abs(dy) * 1.2) {
			if (dx < 0) nextSlidePhoto();
			else prevSlidePhoto();
		}
	}

	function handleWindowKeyDown(e: KeyboardEvent): void {
		if (activeTab !== 'photos' || photos.length <= 1) return;
		if (e.key === 'ArrowLeft') {
			e.preventDefault();
			prevSlidePhoto();
		} else if (e.key === 'ArrowRight') {
			e.preventDefault();
			nextSlidePhoto();
		}
	}

	onMount(async () => {
		void generateGalleryQR();
		await drawSheetPreview();
	});

	onDestroy(() => {
		destroyed = true;
		if (copyTimer) clearTimeout(copyTimer);
		if (downloadTimer) clearTimeout(downloadTimer);
		if (cloudPollTimer) clearTimeout(cloudPollTimer);
		stopSlideTimer();
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

	function switchQrSource(next: QrSource): void {
		if (next === 'drive' && !hasDriveQr) return;
		if (next === 'local' && !localQrImageUrl) return;
		activeQrSource = next;
		copiedUrl = false;
	}

	async function pollCloudSyncForQR(sessionId: string): Promise<void> {
		const startedAt = Date.now();

		const step = async (): Promise<void> => {
			if (destroyed) return;
			const sync = await fetchSessionCloudSync(sessionId);
			if (destroyed) return;

			const elapsed = Date.now() - startedAt;

			if (sync) {
				cloudUploadedCount = sync.uploadedCount;
				cloudTotalFiles = sync.totalFiles;

				if (sync.isPublic && sync.driveFolderUrl) {
					if (!driveQrImageUrl || driveFolderUrl !== sync.driveFolderUrl) {
						try {
							const qr = await buildQRCodeDataUrl(sync.driveFolderUrl, 512);
							if (destroyed) return;
							driveFolderUrl = sync.driveFolderUrl;
							driveQrImageUrl = qr;
						} catch (qrErr) {
							console.warn('Gagal membuat QR Google Drive:', qrErr);
						}
					}

					// Jika masih menunggu di fase awal, langsung tampilkan QR Drive.
					// Jika sebelumnya sudah fallback ke LAN, JANGAN ganti otomatis di tengah scan;
					// cukup tampilkan tombol alih Google Drive agar tamu tidak salah pindai.
					if (driveQrImageUrl && !galleryReady) {
						activeQrSource = 'drive';
						galleryReady = true;
						cloudFallbackNote = null;
					}

					if (sync.status === 'done') {
						cloudState = 'done';
						return;
					}
					if (sync.status === 'failed') {
						cloudState = 'failed';
						return;
					}
					cloudState = 'uploading';
				} else if (
					sync.status === 'failed' ||
					sync.status === 'disabled' ||
					(sync.status === 'done' && !sync.isPublic)
				) {
					if (!galleryReady) {
						activeQrSource = 'local';
						galleryReady = true;
					}
					cloudState = 'fallback';
					cloudFallbackNote =
						sync.status === 'done' && !sync.isPublic
							? 'Folder Drive privat — menggunakan QR Wi-Fi Lokal'
							: 'Google Drive tidak terjangkau — menggunakan QR Wi-Fi Lokal';
					return;
				}
			}

			if (!galleryReady && elapsed >= CLOUD_INITIAL_TIMEOUT_MS) {
				activeQrSource = 'local';
				galleryReady = true;
				cloudState = 'fallback';
				cloudFallbackNote = 'Koneksi Drive lambat — menggunakan QR Wi-Fi Lokal';
			}

			if (elapsed >= CLOUD_MAX_POLL_MS) {
				if (!galleryReady) {
					activeQrSource = 'local';
					galleryReady = true;
					cloudState = 'fallback';
				}
				return;
			}

			const delay = galleryReady ? CLOUD_BG_POLL_MS : CLOUD_INITIAL_POLL_MS;
			cloudPollTimer = setTimeout(() => {
				void step();
			}, delay);
		};

		await step();
	}

	async function generateGalleryQR(): Promise<void> {
		try {
			const sessionId = generateId();
			qrLoadingLabel = 'Menyiapkan galeri & QR…';

			// Siapkan URL LAN lokal + QR fallback paralel sambil merender strip 300 DPI
			const localUrlPromise = resolveGalleryUrl(sessionId);
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

			const resolvedLocal = await localUrlPromise;
			if (destroyed) return;
			localGalleryUrl = resolvedLocal;
			localQrImageUrl = await buildQRCodeDataUrl(resolvedLocal, 512);
			if (destroyed) return;

			qrLoadingLabel = 'Menyiapkan QR Google Drive…';

			let cloudEligible = false;
			let qrMode: 'smart' | 'gallery' | 'local' = 'smart';
			try {
				const saved = await saveGallerySessionWithStatus({
					id: sessionId,
					photos: (photos || []).filter(Boolean),
					stripDataUrl,
					templateKey: typeof activeTemplate === 'string' ? activeTemplate : 'custom',
					formatId: $session.formatId,
					gifDataUrl: gifUrl ?? null,
					videoDataUrl: videoUrl ?? null
				});
				cloudEligible = saved.cloudEligible;
				qrMode = saved.qrMode;
				activeQrMode = qrMode;
			} catch (saveErr) {
				console.warn('Simpan sesi galeri gagal:', saveErr);
			}
			if (destroyed) return;

			if (!cloudEligible) {
				activeQrSource = 'local';
				cloudState = 'idle';
				galleryReady = true;
				if (qrMode === 'gallery') {
					// Tetap pantau sinkronisasi Drive di latar belakang agar tombol alih & status Drive muncul
					void pollCloudSyncForQR(sessionId);
				}
				return;
			}

			cloudState = 'waiting';
			void pollCloudSyncForQR(sessionId);
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

<svelte:window on:keydown={handleWindowKeyDown} />

<section
	class="print-screen screen-enter kiosk-scope"
	class:theme-light={theme === 'light'}
	aria-label="Cetak dan bagikan"
>
	<StudioFrame />

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

					<!-- Tab 2: Foto Sesi (Spotlight Slide) -->
					{#if activeTab === 'photos'}
						<div class="photos-spotlight" role="tabpanel">
							{#if photos.length && activeSlidePhoto}
								<div class="slide-stage">
									{#if photos.length > 1}
										<button
											type="button"
											class="slide-arrow is-prev"
											on:click={prevSlidePhoto}
											aria-label="Foto sebelumnya"
										>
											<svg
												viewBox="0 0 24 24"
												width="18"
												height="18"
												fill="none"
												stroke="currentColor"
												stroke-width="2.4"
												stroke-linecap="round"
												stroke-linejoin="round"
												aria-hidden="true"
											>
												<path d="M15 18l-6-6 6-6" />
											</svg>
										</button>
									{/if}

									<div class="slide-slot">
										<div
											class="slide-card"
											style="--photo-ar: {photoAspect};"
											role="region"
											aria-roledescription="carousel"
											aria-label="Slide foto sesi"
											on:pointerdown={handleSlidePointerDown}
											on:pointerup={handleSlidePointerUp}
											on:pointercancel={() => {
												swipeStartX = null;
												swipeStartY = null;
											}}
										>
											{#key activePhotoIndex}
												<div
													class="slide-frame"
													in:slidePhoto={{ dir: slideDir, kind: 'in' }}
													out:slidePhoto={{ dir: slideDir, kind: 'out' }}
												>
													<img
														src={activeSlidePhoto}
														alt="Foto {activePhotoIndex + 1} pada strip"
														class="slide-img"
														on:load={handleSlideImgLoad}
														draggable="false"
													/>
												</div>
											{/key}

											<span class="slide-counter" aria-live="polite">
												Foto {activePhotoIndex + 1} / {photos.length}
											</span>

											{#if photos.length > 1}
												<div class="slide-auto-bar" aria-hidden="true">
													{#key slideProgressKey}
														<span
															class="slide-auto-fill"
															style="animation-duration: {AUTO_SLIDE_MS}ms;"
														></span>
													{/key}
												</div>
											{/if}
										</div>
									</div>

									{#if photos.length > 1}
										<button
											type="button"
											class="slide-arrow is-next"
											on:click={nextSlidePhoto}
											aria-label="Foto berikutnya"
										>
											<svg
												viewBox="0 0 24 24"
												width="18"
												height="18"
												fill="none"
												stroke="currentColor"
												stroke-width="2.4"
												stroke-linecap="round"
												stroke-linejoin="round"
												aria-hidden="true"
											>
												<path d="M9 18l6-6-6-6" />
											</svg>
										</button>
									{/if}
								</div>

								{#if photos.length > 1}
									<div class="slide-thumbs" role="tablist" aria-label="Pilih foto sesi">
										{#each photos as photo, i (i)}
											<button
												type="button"
												role="tab"
												class="slide-thumb"
												class:is-active={i === activePhotoIndex}
												aria-selected={i === activePhotoIndex}
												aria-label="Lihat foto {i + 1}"
												on:click={() => selectSlidePhoto(i)}
											>
												<img src={photo} alt="" draggable="false" />
												<span class="slide-thumb-num" aria-hidden="true">{i + 1}</span>
											</button>
										{/each}
									</div>
								{/if}
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
							<h2 id="qr-title" class="group-eyebrow">
								{activeQrSource === 'drive' ? 'GALERI GOOGLE DRIVE' : 'GALERI HP'}
							</h2>
							<p class="qr-sub">
								{#if activeQrSource === 'drive'}
									Pindai pakai kuota HP untuk unduh strip, foto &amp; timelapse
								{:else}
									Pindai QR untuk simpan strip, foto &amp; timelapse
								{/if}
							</p>
						</div>

						{#if galleryReady && qrImageUrl && galleryUrl}
							<div class="qr-wrap">
								<div class="qr-box">
									<img src={qrImageUrl} alt="QR code galeri foto sesi" draggable="false" />
								</div>
							</div>

							{#if hasBothQr}
								<div class="qr-source-pill" role="group" aria-label="Pilih sumber QR">
									<button
										type="button"
										class="qr-source-opt"
										class:is-active={activeQrSource === 'drive'}
										aria-pressed={activeQrSource === 'drive'}
										on:click={() => switchQrSource('drive')}
									>
										Google Drive
									</button>
									<button
										type="button"
										class="qr-source-opt"
										class:is-active={activeQrSource === 'local'}
										aria-pressed={activeQrSource === 'local'}
										on:click={() => switchQrSource('local')}
									>
										{localLabel}
									</button>
								</div>
							{/if}

							{#if cloudState === 'uploading'}
								<div class="qr-cloud-status is-syncing" role="status" aria-live="polite">
									<span class="qr-status-dot is-pulse" aria-hidden="true"></span>
									<span>
										{cloudTotalFiles > 0
											? `Mengunggah ke Drive (${cloudUploadedCount}/${cloudTotalFiles} berkas)…`
											: 'Mengunggah berkas ke Google Drive…'}
									</span>
								</div>
							{:else if cloudState === 'done' && activeQrSource === 'drive'}
								<div class="qr-cloud-status is-done" role="status">
									<span class="qr-status-dot" aria-hidden="true"></span>
									<span>Siap di Google Drive · bisa dibuka pakai kuota HP</span>
								</div>
							{:else if cloudState === 'done' && hasDriveQr && activeQrSource === 'local'}
								<div class="qr-cloud-status is-done" role="status">
									<span class="qr-status-dot" aria-hidden="true"></span>
									<span>Google Drive siap · pilih Google Drive untuk kuota HP</span>
								</div>
							{:else if cloudState === 'failed' && hasDriveQr}
								<div class="qr-cloud-status is-warn" role="status">
									<span class="qr-status-dot" aria-hidden="true"></span>
									<span>Sebagian gagal unggah · gunakan Wi-Fi Lokal bila perlu</span>
								</div>
							{:else if cloudState === 'fallback' && cloudFallbackNote}
								<div class="qr-cloud-status is-muted" role="status">
									<span class="qr-status-dot" aria-hidden="true"></span>
									<span>{cloudFallbackNote}</span>
								</div>
							{/if}

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
									<span>{qrLoadingLabel}</span>
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
