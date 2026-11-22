<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { session } from '#lib/stores/session';
	import {
		loadGallerySession,
		fetchSessionCloudSync,
		buildAnimatedGif
	} from '#lib/services/gallery';
	import { playGrekSound } from '#lib/utils/audio';
	import { getProductForCount } from '#lib/utils/canvas';
	import StudioFrame from '#lib/components/ui/StudioFrame.svelte';
	import ThemeToggle from '#lib/components/ui/ThemeToggle.svelte';
	import type { GallerySession } from '#lib/types';

	export let sessionId: string = '';

	$: theme = $session.theme;

	let galleryData: GallerySession | null = null;
	let loading = true;
	let error: string | null = null;

	// Deck state
	let activeCardIndex = 0;

	// GIF file state
	let gifDataUrl: string | null = null;
	let gifGenerating = false;
	let gifError: string | null = null;

	// Video file state
	let videoError = false;

	// Live Looping Frame Player state (for GIF card)
	let currentLoopFrame = 0;
	let isLoopPlaying = true;
	let loopIntervalMs = 1000; // 1 second per frame (pindah-pindah frame)
	let loopTimer: ReturnType<typeof setInterval> | null = null;

	let downloadingAll = false;
	let driveFolderUrl: string | null = null;
	let drivePollTimer: ReturnType<typeof setTimeout> | null = null;
	let destroyed = false;

	// Touch & Pointer gesture tracking for smooth swiping
	let pointerStartX = 0;
	let pointerStartY = 0;
	let pointerDeltaX = 0;
	let isDragging = false;

	interface GalleryCard {
		id: string;
		type: 'strip' | 'photo' | 'gif' | 'video';
		badge: string;
		title: string;
		subtitle: string;
		imageUrl: string;
		downloadAction: () => void;
		btnLabel: string;
		photoIndex?: number;
	}

	/** Produk strip sesuai jumlah foto galeri (ukuran cetak nyata). */
	$: produk = galleryData
		? getProductForCount(galleryData.photos.length, galleryData.formatId ?? '2x6')
		: getProductForCount(4, '2x6');
	$: produkCm = produk.cm.includes('cm') ? produk.cm : `${produk.cm} cm`;

	$: cardItems = galleryData
		? ([
				{
					id: 'strip',
					type: 'strip',
					badge: 'HASIL STRIP 4R',
					title: `Photo Strip (${produk.nama})`,
					subtitle: `${produk.nama} ${produkCm}: ${produk.copySheet === 2 ? '2 salinan berdampingan' : '1 salinan'} siap cetak`,
					imageUrl: galleryData.stripDataUrl,
					downloadAction: downloadStrip,
					btnLabel: 'Unduh Strip 4R'
				},
				...galleryData.photos.map((photo: string, i: number, semua: string[]): GalleryCard => ({
					id: `photo-${i}`,
					type: 'photo',
					badge: `FOTO #${i + 1} DARI ${semua.length}`,
					title: `Foto Jepretan #${i + 1}`,
					subtitle: 'Foto asli kamera resolusi tinggi',
					imageUrl: photo,
					downloadAction: () => downloadPhoto(photo, i),
					btnLabel: `Unduh Foto #${i + 1}`,
					photoIndex: i
				})),
				{
					id: 'gif',
					type: 'gif',
					badge: 'ANIMASI LOOPING',
					title: 'Animasi Looping (GIF)',
					subtitle: 'Berpindah frame otomatis (minimal 5 detik)',
					imageUrl: '',
					downloadAction: downloadGif,
					btnLabel: 'Unduh File GIF'
				},
				...(galleryData.videoDataUrl
					? ([
							{
								id: 'video',
								type: 'video',
								badge: 'VIDEO TIMELAPSE',
								title: 'Video Timelapse (MP4)',
								subtitle: 'Video timelapse dari sesi foto',
								imageUrl: galleryData.videoDataUrl,
								downloadAction: downloadVideo,
								btnLabel: 'Unduh Video MP4'
							}
						] as GalleryCard[])
					: [])
			] as GalleryCard[])
		: ([] as GalleryCard[]);

	function startLoopTimer(): void {
		stopLoopTimer();
		if (!isLoopPlaying || !galleryData || !galleryData.photos || galleryData.photos.length === 0)
			return;
		const photos = galleryData.photos;
		loopTimer = setInterval(() => {
			currentLoopFrame = (currentLoopFrame + 1) % photos.length;
		}, loopIntervalMs);
	}

	function stopLoopTimer(): void {
		if (loopTimer) {
			clearInterval(loopTimer);
			loopTimer = null;
		}
	}

	function togglePlayPause(): void {
		isLoopPlaying = !isLoopPlaying;
		if (isLoopPlaying) {
			startLoopTimer();
		} else {
			stopLoopTimer();
		}
	}

	function setLoopSpeed(ms: number): void {
		loopIntervalMs = ms;
		if (isLoopPlaying) {
			startLoopTimer();
		}
	}

	// ─── Deck Navigation & Sound ────────────────────────────────────────────────

	function getCircularDiff(index: number, activeIndex: number, total: number): number {
		if (total <= 1) return 0;
		let diff = (index - activeIndex) % total;
		if (diff > total / 2) {
			diff -= total;
		} else if (diff < -total / 2) {
			diff += total;
		}
		return diff;
	}

	function goToCard(index: number): void {
		if (index === activeCardIndex || index < 0 || index >= cardItems.length) return;
		activeCardIndex = index;
		playGrekSound();
	}

	function nextCard(): void {
		if (!cardItems || cardItems.length <= 1) return;
		activeCardIndex = (activeCardIndex + 1) % cardItems.length;
		playGrekSound();
	}

	function prevCard(): void {
		if (!cardItems || cardItems.length <= 1) return;
		activeCardIndex = (activeCardIndex - 1 + cardItems.length) % cardItems.length;
		playGrekSound();
	}

	// ─── Swipe & Drag Handlers ──────────────────────────────────────────────────

	type PointerOrTouchEvent = PointerEvent & { touches?: TouchList };

	function handlePointerDown(e: PointerOrTouchEvent): void {
		pointerStartX = e.clientX ?? (e.touches && e.touches[0].clientX) ?? 0;
		pointerStartY = e.clientY ?? (e.touches && e.touches[0].clientY) ?? 0;
		pointerDeltaX = 0;
		isDragging = true;
	}

	function handlePointerMove(e: PointerOrTouchEvent): void {
		if (!isDragging) return;
		const currentX = e.clientX ?? (e.touches && e.touches[0].clientX) ?? 0;
		const currentY = e.clientY ?? (e.touches && e.touches[0].clientY) ?? 0;
		const deltaX = currentX - pointerStartX;
		const deltaY = currentY - pointerStartY;

		// If mostly horizontal, prevent vertical interference
		if (Math.abs(deltaX) > Math.abs(deltaY)) {
			pointerDeltaX = deltaX;
		}
	}

	function handlePointerUp(): void {
		if (!isDragging) return;
		isDragging = false;
		const threshold = 40; // minimum swipe distance
		if (pointerDeltaX < -threshold) {
			nextCard();
		} else if (pointerDeltaX > threshold) {
			prevCard();
		}
		pointerDeltaX = 0;
	}

	function handleKeyDown(e: KeyboardEvent): void {
		if (e.key === 'ArrowRight') {
			nextCard();
		} else if (e.key === 'ArrowLeft') {
			prevCard();
		}
	}

	async function loadDriveLink(id: string): Promise<void> {
		const startedAt = Date.now();
		const MAX_WAIT_MS = 30000;

		const poll = async (): Promise<void> => {
			if (destroyed) return;
			const sync = await fetchSessionCloudSync(id);
			if (destroyed) return;

			if (sync?.isPublic && sync.driveFolderUrl) {
				driveFolderUrl = sync.driveFolderUrl;
				return;
			}

			if (
				!sync ||
				sync.status === 'done' ||
				sync.status === 'failed' ||
				sync.status === 'disabled' ||
				Date.now() - startedAt >= MAX_WAIT_MS
			) {
				return;
			}

			drivePollTimer = setTimeout(() => {
				void poll();
			}, 2500);
		};

		await poll();
	}

	onMount(async () => {
		window.addEventListener('keydown', handleKeyDown);

		if (!sessionId) {
			error = 'Session ID tidak ditemukan.';
			loading = false;
			return;
		}
		void loadDriveLink(sessionId);
		try {
			galleryData = await loadGallerySession(sessionId);
			if (!galleryData) {
				error = 'Sesi foto tidak ditemukan atau sudah kadaluarsa.';
			} else {
				videoError = false;
				// Start live frame looper immediately
				startLoopTimer();

				// If GIF was already generated, use it immediately
				if (galleryData.gifDataUrl) {
					gifDataUrl = galleryData.gifDataUrl;
				} else if (galleryData.photos && galleryData.photos.length > 0) {
					// Auto-generate GIF file with gifenc
					generateGif();
				}
			}
		} catch (e) {
			error = 'Gagal memuat galeri foto.';
			console.error(e);
		}
		loading = false;
	});

	onDestroy(() => {
		destroyed = true;
		if (drivePollTimer) clearTimeout(drivePollTimer);
		if (typeof window !== 'undefined') {
			window.removeEventListener('keydown', handleKeyDown);
		}
		stopLoopTimer();
	});

	async function generateGif(): Promise<void> {
		if (!galleryData || gifGenerating) return;
		gifGenerating = true;
		gifError = null;
		try {
			gifDataUrl = await buildAnimatedGif(galleryData.photos, {
				width: 480,
				height: 360,
				delayMs: 1000 // 1.0s per frame, at least 5s total loop
			});
		} catch (e) {
			gifError = 'Gagal membuat file GIF. Silakan coba lagi.';
			console.error(e);
		}
		gifGenerating = false;
	}

	function downloadDataUrl(dataUrl: string, filename: string): void {
		const a = document.createElement('a');
		a.href = dataUrl;
		a.download = filename;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
	}

	function downloadPhoto(url: string, index: number): void {
		downloadDataUrl(url, `distudio-photo-${index + 1}.png`);
	}

	function downloadStrip(): void {
		if (galleryData?.stripDataUrl) {
			downloadDataUrl(galleryData.stripDataUrl, 'distudio-photo-strip.png');
		}
	}

	function downloadGif(): void {
		if (gifDataUrl) {
			downloadDataUrl(gifDataUrl, 'distudio-animated.gif');
		}
	}

	function downloadVideo(): void {
		if (galleryData?.videoDataUrl) {
			downloadDataUrl(galleryData.videoDataUrl, 'distudio-timelapse.mp4');
		}
	}

	async function downloadAll(): Promise<void> {
		if (!galleryData || downloadingAll) return;
		downloadingAll = true;

		// 1. Download photo strip
		downloadStrip();
		await new Promise((r) => setTimeout(r, 350));

		// 2. Download all individual photos
		for (let i = 0; i < galleryData.photos.length; i++) {
			downloadPhoto(galleryData.photos[i], i);
			await new Promise((r) => setTimeout(r, 350));
		}

		// 3. Download GIF
		if (gifDataUrl) {
			downloadGif();
			await new Promise((r) => setTimeout(r, 350));
		}

		// 4. Download video
		if (galleryData.videoDataUrl) {
			downloadVideo();
		}

		downloadingAll = false;
	}

	function formatDate(iso: string): string {
		if (!iso) return '';
		return new Date(iso).toLocaleString('id-ID', {
			day: 'numeric',
			month: 'long',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}
</script>

<section
	class="gallery-screen kiosk-scope"
	class:theme-light={theme === 'light'}
	aria-label="Galeri foto DISTUDIO"
>
	<StudioFrame />

	<div class="frame-inner">
		{#if loading}
			<header class="gallery-header">
				<div class="gallery-brand-row">
					<img
						class="brand-logo"
						src="/landingPage/logo.svg"
						alt="DI'STUDIO"
						width="217"
						height="81"
						draggable="false"
					/>
				</div>
				<div class="header-actions">
					<ThemeToggle inline />
				</div>
			</header>
			<div class="header-divider" aria-hidden="true"></div>
			<div class="gallery-loader">
				<div class="loader-spinner"></div>
				<p>Memuat koleksi foto kamu…</p>
			</div>
		{:else if error}
			<header class="gallery-header">
				<div class="gallery-brand-row">
					<img
						class="brand-logo"
						src="/landingPage/logo.svg"
						alt="DI'STUDIO"
						width="217"
						height="81"
						draggable="false"
					/>
				</div>
				<div class="header-actions">
					<ThemeToggle inline />
				</div>
			</header>
			<div class="header-divider" aria-hidden="true"></div>
			<div class="gallery-error">
				<div class="error-icon">
					<svg
						width="44"
						height="44"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="1.8"
						stroke-linecap="round"
						stroke-linejoin="round"
						aria-hidden="true"
					>
						<circle cx="12" cy="12" r="10" />
						<line x1="12" y1="8" x2="12" y2="12" />
						<line x1="12" y1="16" x2="12.01" y2="16" />
					</svg>
				</div>
				<h2>Sesi Tidak Ditemukan</h2>
				<p>{error}</p>
				<p class="error-hint">Scan kembali QR code di photobooth untuk membuka tautan terbaru.</p>
			</div>
		{:else if galleryData}
			<!-- Top Header Bar -->
			<header class="gallery-header">
				<div class="gallery-brand-row">
					<img
						class="brand-logo"
						src="/landingPage/logo.svg"
						alt="DI'STUDIO"
						width="217"
						height="81"
						draggable="false"
					/>
					<span class="brand-sep" aria-hidden="true"></span>
					<div class="brand-meta">
						<span class="brand-tag">GALERI SESI</span>
						<time class="gallery-date" datetime={galleryData.createdAt}
							>{formatDate(galleryData.createdAt)}</time
						>
					</div>
				</div>

				<div class="header-actions">
					{#if driveFolderUrl}
						<a
							href={driveFolderUrl}
							target="_blank"
							rel="noopener noreferrer"
							class="drive-pill-btn"
							aria-label="Buka folder sesi di Google Drive"
						>
							<svg
								width="15"
								height="15"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2.2"
								stroke-linecap="round"
								stroke-linejoin="round"
								aria-hidden="true"
							>
								<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
							</svg>
							<span class="drive-btn-text">Google Drive</span>
						</a>
					{/if}

					<!-- Quick Download All Button -->
					<button
						type="button"
						class="dl-all-pill-btn"
						on:click={downloadAll}
						disabled={downloadingAll}
						aria-label="Unduh semua file sekaligus"
					>
						{#if downloadingAll}
							<div class="btn-spinner" aria-hidden="true"></div>
							<span>Mengunduh…</span>
						{:else}
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
								<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
								<polyline points="7 10 12 15 17 10" />
								<line x1="12" y1="15" x2="12" y2="3" />
							</svg>
							<span class="dl-all-text">Unduh Semua ({cardItems.length})</span>
						{/if}
					</button>

					<ThemeToggle inline />
				</div>
			</header>

			<div class="header-divider" aria-hidden="true"></div>

			<!-- Main Deck Experience -->
			<main class="deck-main">
				<!-- Side Navigation Arrow Left (Mid-Screen) -->
				<button class="side-nav-btn prev" on:click={prevCard} aria-label="Kartu sebelumnya">
					<svg
						width="22"
						height="22"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2.5"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<polyline points="15 18 9 12 15 6" />
					</svg>
				</button>

				<!-- Side Navigation Arrow Right (Mid-Screen) -->
				<button class="side-nav-btn next" on:click={nextCard} aria-label="Kartu berikutnya">
					<svg
						width="22"
						height="22"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2.5"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<polyline points="9 18 15 12 9 6" />
					</svg>
				</button>

				<!-- Card Stage Container -->
				<div class="deck-wrapper">
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div
						class="deck-stage"
						on:pointerdown={handlePointerDown}
						on:pointermove={handlePointerMove}
						on:pointerup={handlePointerUp}
						on:pointercancel={handlePointerUp}
					>
						{#each cardItems as card, index (card.id)}
							{@const diff = getCircularDiff(index, activeCardIndex, cardItems.length)}
							{@const isVisible = Math.abs(diff) <= 2}
							{#if isVisible}
								<!-- svelte-ignore a11y_click_events_have_key_events -->
								<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
								<article
									class="deck-card"
									class:active={diff === 0}
									class:prev={diff === -1}
									class:next={diff === 1}
									class:far-prev={diff <= -2}
									class:far-next={diff >= 2}
									style="--diff: {diff}; --drag-offset: {diff === 0 && isDragging
										? pointerDeltaX
										: 0}px;"
									on:click={() => {
										if (diff !== 0) goToCard(index);
									}}
								>
									<!-- Card Header Top Pill -->
									<div class="card-top-bar">
										<span class="card-badge">
											{#if card.type === 'strip'}
												<svg
													width="12"
													height="12"
													viewBox="0 0 24 24"
													fill="none"
													stroke="currentColor"
													stroke-width="2.5"
													stroke-linecap="round"
													stroke-linejoin="round"
													aria-hidden="true"
												>
													<rect x="5" y="2" width="14" height="20" rx="2" />
													<line x1="5" y1="8" x2="19" y2="8" />
													<line x1="5" y1="14" x2="19" y2="14" />
												</svg>
											{:else if card.type === 'photo'}
												<svg
													width="12"
													height="12"
													viewBox="0 0 24 24"
													fill="none"
													stroke="currentColor"
													stroke-width="2.5"
													stroke-linecap="round"
													stroke-linejoin="round"
													aria-hidden="true"
												>
													<rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
													<circle cx="8.5" cy="8.5" r="1.5" />
													<polyline points="21 15 16 10 5 21" />
												</svg>
											{:else if card.type === 'gif' || card.type === 'video'}
												<svg
													width="12"
													height="12"
													viewBox="0 0 24 24"
													fill="none"
													stroke="currentColor"
													stroke-width="2.5"
													stroke-linecap="round"
													stroke-linejoin="round"
													aria-hidden="true"
												>
													<circle cx="12" cy="12" r="10" />
													<polygon points="10 8 16 12 10 16 10 8" fill="currentColor" />
												</svg>
											{/if}
											<span>{card.badge}</span>
										</span>
										<span class="card-count-pill">{index + 1} / {cardItems.length}</span>
									</div>

									<!-- Card Visual Media Area -->
									<div class="card-media-wrap">
										{#if card.type === 'strip'}
											<!-- svelte-ignore a11y_img_redundant_alt -->
											<img
												src={card.imageUrl}
												alt="Photo strip 4R sheet"
												class="card-img strip-img-fit"
											/>
										{:else if card.type === 'photo'}
											<img src={card.imageUrl} alt={card.title} class="card-img photo-img-fit" />
										{:else if card.type === 'gif'}
											<!-- Live Interactive Looper Slideshow Inside the Card -->
											<div class="looper-embed">
												{#if galleryData.photos && galleryData.photos.length > 0}
													<img
														src={galleryData.photos[currentLoopFrame]}
														alt="Loop frame {currentLoopFrame + 1}"
														class="card-img looper-img-fit"
													/>
													<div class="looper-badge">
														Frame {currentLoopFrame + 1} / {galleryData.photos.length}
													</div>
												{/if}
											</div>
										{:else if card.type === 'video' && card.imageUrl}
											<!-- svelte-ignore a11y_media_has_caption -->
											{#if videoError}
												<img
													src={galleryData.gifDataUrl || galleryData.photos?.[0] || ''}
													alt="Animasi looping dari GIF"
													class="card-img photo-img-fit"
												/>
											{:else}
												<video
													src={card.imageUrl}
													class="card-img photo-img-fit"
													autoplay
													loop
													muted
													playsinline
													controls
													on:error={() => (videoError = true)}
												></video>
											{/if}
										{/if}
									</div>

									<!-- Clean Lightweight Bottom Card Container -->
									<div class="card-bottom-bar">
										<div class="card-info-text">
											<h3 class="card-title">{card.title}</h3>
											<p class="card-sub">{card.subtitle}</p>
										</div>

										<!-- Mini Looper Controls if GIF card -->
										{#if card.type === 'gif'}
											<div class="looper-compact-controls">
												<button
													class="looper-play-pill"
													on:click|stopPropagation={togglePlayPause}
													aria-label={isLoopPlaying ? 'Pause' : 'Play'}
												>
													{#if isLoopPlaying}
														<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
															<rect x="6" y="4" width="4" height="16" rx="1" />
															<rect x="14" y="4" width="4" height="16" rx="1" />
														</svg>
														<span>Pause</span>
													{:else}
														<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
															<polygon points="5 3 19 12 5 21 5 3" />
														</svg>
														<span>Play</span>
													{/if}
												</button>

												<div class="looper-speed-pills">
													<button
														class="speed-pill"
														class:active={loopIntervalMs === 800}
														on:click|stopPropagation={() => setLoopSpeed(800)}>0.8s</button
													>
													<button
														class="speed-pill"
														class:active={loopIntervalMs === 1000}
														on:click|stopPropagation={() => setLoopSpeed(1000)}>1.0s</button
													>
													<button
														class="speed-pill"
														class:active={loopIntervalMs === 1500}
														on:click|stopPropagation={() => setLoopSpeed(1500)}>1.5s</button
													>
												</div>
											</div>
										{/if}

										<!-- Clean Action Button -->
										<div class="card-action-row">
											{#if card.type === 'gif' && gifGenerating}
												<button class="card-action-btn disabled" disabled>
													<div class="btn-spinner" aria-hidden="true"></div>
													<span>Memproses GIF…</span>
												</button>
											{:else}
												<button
													class="card-action-btn"
													on:click|stopPropagation={card.downloadAction}
													aria-label={card.btnLabel}
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
														class="dl-icon"
													>
														<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
														<polyline points="7 10 12 15 17 10" />
														<line x1="12" y1="15" x2="12" y2="3" />
													</svg>
													<span>{card.btnLabel}</span>
												</button>
											{/if}
										</div>
									</div>
								</article>
							{/if}
						{/each}
					</div>
				</div>

				<!-- Clean Minimal Footer (No dots) -->
				<footer class="deck-footer">
					<p class="swipe-hint">
						<span>Geser layar atau tekan tombol kiri/kanan di tepi</span>
					</p>
				</footer>
			</main>
		{/if}
	</div>
</section>

<style>
	.gallery-screen {
		--page-bg: #0b0a09;
		--divider-bg: rgba(251, 247, 240, 0.08);
		--card-bg: #141210;
		--card-surface: #1b1815;
		--card-border: rgba(251, 247, 240, 0.14);
		--card-border-strong: rgba(251, 247, 240, 0.3);
		--media-bg: #100e0c;
		--strip-bg: #191613;
		--pill-bg: rgba(18, 16, 15, 0.88);
		--title-ink: #fbf7f0;
		--muted-ink: #a8a29e;
		--cta-bg: #fbf7f0;
		--cta-ink: #0b0a09;
		--cta-bg-hover: #efe8dc;
		--btn-bg: rgba(251, 247, 240, 0.05);
		--btn-border: rgba(251, 247, 240, 0.22);
		--card-shadow: 0 20px 44px rgba(0, 0, 0, 0.5);
		--nav-shadow: 0 8px 22px rgba(0, 0, 0, 0.42);
		--stage-dot: rgba(251, 247, 240, 0.055);
		--spinner-track: rgba(251, 247, 240, 0.18);
		--btn-spinner-track: rgba(11, 10, 9, 0.25);

		min-height: 100dvh;
		min-height: 100vh;
		width: 100%;
		background-color: var(--page-bg);
		background-image: radial-gradient(var(--stage-dot) 1.1px, transparent 1.1px);
		background-size: 20px 20px;
		color: var(--title-ink);
		display: flex;
		flex-direction: column;
		align-items: center;
		position: relative;
		user-select: none;
		-webkit-user-select: none;
		overflow-x: hidden;
		transition:
			background-color 220ms ease,
			color 220ms ease;
	}

	.gallery-screen.theme-light {
		--page-bg: #ffffff;
		--divider-bg: #f1f3f5;
		--card-bg: #ffffff;
		--card-surface: #f8fafc;
		--card-border: #e5e7eb;
		--card-border-strong: #cbd5e1;
		--media-bg: #f1f5f9;
		--strip-bg: #f4f1ec;
		--pill-bg: rgba(255, 255, 255, 0.92);
		--title-ink: #0f172a;
		--muted-ink: #64748b;
		--cta-bg: #0f172a;
		--cta-ink: #ffffff;
		--cta-bg-hover: #1e293b;
		--btn-bg: #ffffff;
		--btn-border: #cbd5e1;
		--card-shadow: 0 14px 32px rgba(15, 23, 42, 0.1);
		--nav-shadow: 0 6px 18px rgba(15, 23, 42, 0.08);
		--stage-dot: rgba(15, 23, 42, 0.055);
		--spinner-track: rgba(15, 23, 42, 0.14);
		--btn-spinner-track: rgba(255, 255, 255, 0.35);
	}

	/* ── Area isi di dalam StudioFrame ── */
	.frame-inner {
		position: relative;
		z-index: 1;
		flex: 1;
		width: 100%;
		max-width: 1160px;
		margin: 0 auto;
		padding: clamp(22px, 3dvh, 36px) clamp(24px, 4vw, 56px) clamp(20px, 2.8dvh, 30px);
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: clamp(10px, 1.4dvh, 14px);
	}

	/* ── Header ── */
	.gallery-header {
		width: 100%;
		min-height: 48px;
		padding: 4px 0;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 14px;
		z-index: 50;
		flex-shrink: 0;
	}

	.gallery-brand-row {
		display: flex;
		align-items: center;
		gap: 12px;
		min-width: 0;
	}

	.brand-logo {
		width: clamp(86px, 10.5vw, 128px);
		height: auto;
		flex-shrink: 0;
		filter: invert(1);
		transition: filter 220ms ease;
	}

	.theme-light .brand-logo {
		filter: none;
	}

	.brand-sep {
		width: 1px;
		height: 24px;
		background: var(--card-border-strong);
		flex-shrink: 0;
	}

	.brand-meta {
		display: flex;
		flex-direction: column;
		gap: 1px;
		min-width: 0;
	}

	.brand-tag {
		font-family: var(--font-body);
		font-size: 0.64rem;
		font-weight: 800;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--title-ink);
		line-height: 1.2;
	}

	.gallery-date {
		font-size: 0.72rem;
		color: var(--muted-ink);
		margin: 0;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.header-actions {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-shrink: 0;
	}

	.header-divider {
		width: 100%;
		height: 4px;
		border-radius: 999px;
		background: var(--divider-bg);
		flex-shrink: 0;
	}

	.dl-all-pill-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		min-height: 40px;
		background: var(--cta-bg);
		color: var(--cta-ink);
		border: 1px solid transparent;
		border-radius: var(--radius-full, 9999px);
		padding: 0 18px;
		font-family: var(--font-body);
		font-size: 0.78rem;
		font-weight: 700;
		letter-spacing: 0.01em;
		cursor: pointer;
		box-shadow: var(--nav-shadow);
		transition:
			background-color 180ms ease,
			transform 180ms ease,
			opacity 180ms ease;
		white-space: nowrap;
	}

	.dl-all-pill-btn:hover:not(:disabled) {
		background: var(--cta-bg-hover);
		transform: translateY(-1px);
	}

	.dl-all-pill-btn:active:not(:disabled) {
		transform: scale(0.98);
	}

	.dl-all-pill-btn:disabled {
		opacity: 0.55;
		cursor: not-allowed;
	}

	.drive-pill-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 7px;
		min-height: 40px;
		padding: 0 15px;
		border: 1px solid var(--btn-border);
		border-radius: var(--radius-full, 9999px);
		background: var(--card-bg);
		color: var(--title-ink);
		font-family: var(--font-body);
		font-size: 0.78rem;
		font-weight: 700;
		letter-spacing: 0.01em;
		text-decoration: none;
		white-space: nowrap;
		box-shadow: var(--nav-shadow);
		transition:
			background-color 180ms ease,
			border-color 180ms ease,
			transform 180ms ease;
	}

	.drive-pill-btn:hover {
		background: var(--divider-bg);
		transform: translateY(-1px);
	}

	.drive-pill-btn:active {
		transform: scale(0.98);
	}

	/* ── Deck Main Layout ── */
	.deck-main {
		flex: 1;
		width: 100%;
		max-width: 960px;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 10px 8px 12px;
		position: relative;
	}

	/* ── Side Navigation Arrows (Vertically Centered in Screen/Viewport) ── */
	.side-nav-btn {
		position: fixed;
		top: 50%;
		transform: translateY(-50%);
		width: 46px;
		height: 46px;
		border-radius: 50%;
		background: var(--pill-bg);
		border: 1px solid var(--btn-border);
		color: var(--title-ink);
		backdrop-filter: blur(10px);
		-webkit-backdrop-filter: blur(10px);
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		z-index: 60;
		box-shadow: var(--nav-shadow);
		transition:
			background-color 180ms ease,
			border-color 180ms ease,
			color 180ms ease,
			transform 180ms ease;
	}

	.side-nav-btn.prev {
		left: 24px;
	}

	.side-nav-btn.next {
		right: 24px;
	}

	.side-nav-btn:hover:not(:disabled) {
		background: var(--cta-bg);
		border-color: var(--cta-bg);
		color: var(--cta-ink);
		transform: translateY(-50%) scale(1.06);
	}

	.side-nav-btn:disabled {
		opacity: 0.25;
		cursor: not-allowed;
		pointer-events: none;
	}

	/* ── Deck Wrapper & Stage ── */
	.deck-wrapper {
		position: relative;
		width: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		margin: auto 0;
	}

	.deck-stage {
		position: relative;
		width: 100%;
		max-width: 440px;
		height: clamp(520px, 72vh, 640px);
		display: flex;
		align-items: center;
		justify-content: center;
		touch-action: pan-y;
		cursor: grab;
	}

	.deck-stage:active {
		cursor: grabbing;
	}

	/* ── Cards (Lightweight & High Performance) ── */
	.deck-card {
		position: absolute;
		width: 100%;
		height: 100%;
		max-width: 420px;
		border-radius: var(--radius-xl, 26px);
		background: var(--card-bg);
		border: 1px solid var(--card-border);
		box-shadow: var(--card-shadow);
		overflow: hidden;
		display: flex;
		flex-direction: column;
		transition:
			transform 0.32s cubic-bezier(0.22, 1, 0.36, 1),
			opacity 0.32s cubic-bezier(0.22, 1, 0.36, 1),
			background-color 220ms ease,
			border-color 220ms ease;
		will-change: transform, opacity;
	}

	/* Active card */
	.deck-card.active {
		transform: translate3d(var(--drag-offset, 0px), 0, 0) scale(1);
		opacity: 1;
		z-index: 25;
		pointer-events: auto;
	}

	/* Previous peek */
	.deck-card.prev {
		transform: translate3d(calc(-72% + var(--drag-offset, 0px)), 0, 0) scale(0.88);
		opacity: 0.32;
		z-index: 10;
		cursor: pointer;
	}

	/* Next peek */
	.deck-card.next {
		transform: translate3d(calc(72% + var(--drag-offset, 0px)), 0, 0) scale(0.88);
		opacity: 0.32;
		z-index: 10;
		cursor: pointer;
	}

	.deck-card.far-prev {
		transform: translate3d(-110%, 0, 0) scale(0.75);
		opacity: 0;
		pointer-events: none;
		z-index: 5;
	}

	.deck-card.far-next {
		transform: translate3d(110%, 0, 0) scale(0.75);
		opacity: 0;
		pointer-events: none;
		z-index: 5;
	}

	/* ── Card Header Top Pill ── */
	.card-top-bar {
		position: absolute;
		top: 14px;
		left: 14px;
		right: 14px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		z-index: 20;
		pointer-events: none;
	}

	.card-badge {
		background: var(--pill-bg);
		border: 1px solid var(--card-border);
		color: var(--title-ink);
		backdrop-filter: blur(10px);
		-webkit-backdrop-filter: blur(10px);
		font-size: 0.68rem;
		font-weight: 800;
		letter-spacing: 0.08em;
		padding: 5px 12px;
		border-radius: var(--radius-full, 9999px);
		display: inline-flex;
		align-items: center;
		gap: 6px;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.14);
	}

	.card-count-pill {
		background: var(--pill-bg);
		border: 1px solid var(--card-border);
		color: var(--muted-ink);
		backdrop-filter: blur(10px);
		-webkit-backdrop-filter: blur(10px);
		font-size: 0.7rem;
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums;
		font-weight: 700;
		padding: 5px 10px;
		border-radius: var(--radius-full, 9999px);
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.14);
	}

	/* ── Card Media Area ── */
	.card-media-wrap {
		flex: 1;
		width: 100%;
		position: relative;
		background: var(--media-bg);
		display: flex;
		align-items: center;
		justify-content: center;
		overflow: hidden;
	}

	.card-img {
		width: 100%;
		height: 100%;
		display: block;
		user-select: none;
		pointer-events: none;
	}

	.strip-img-fit {
		object-fit: contain;
		padding: 14px;
		background: var(--strip-bg);
	}

	.photo-img-fit {
		object-fit: cover;
	}

	.looper-embed {
		width: 100%;
		height: 100%;
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		background: #0b0a09;
	}

	.looper-img-fit {
		object-fit: cover;
	}

	.looper-badge {
		position: absolute;
		bottom: 12px;
		right: 14px;
		background: rgba(11, 10, 9, 0.82);
		color: #fbf7f0;
		backdrop-filter: blur(8px);
		-webkit-backdrop-filter: blur(8px);
		font-size: 0.7rem;
		font-variant-numeric: tabular-nums;
		font-weight: 700;
		padding: 4px 10px;
		border-radius: var(--radius-full, 9999px);
		border: 1px solid rgba(251, 247, 240, 0.18);
	}

	/* ── Clean Lightweight Bottom Container ── */
	.card-bottom-bar {
		background: var(--card-bg);
		border-top: 1px solid var(--card-border);
		padding: 16px 18px 18px;
		display: flex;
		flex-direction: column;
		gap: 12px;
		z-index: 10;
	}

	.card-info-text {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.card-title {
		font-size: 1rem;
		font-weight: 800;
		letter-spacing: -0.01em;
		margin: 0;
		color: var(--title-ink);
	}

	.card-sub {
		font-size: 0.75rem;
		color: var(--muted-ink);
		margin: 0;
	}

	/* Looper mini player */
	.looper-compact-controls {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		padding: 6px 8px;
		background: var(--card-surface);
		border: 1px solid var(--card-border);
		border-radius: 10px;
	}

	.looper-play-pill {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		background: var(--card-bg);
		border: 1px solid var(--card-border);
		color: var(--title-ink);
		padding: 4px 10px;
		border-radius: 7px;
		font-size: 0.72rem;
		font-weight: 700;
		cursor: pointer;
		transition:
			border-color 150ms ease,
			background-color 150ms ease;
	}

	.looper-play-pill:hover {
		border-color: var(--title-ink);
	}

	.looper-speed-pills {
		display: flex;
		align-items: center;
		gap: 4px;
	}

	.speed-pill {
		background: transparent;
		border: 1px solid var(--card-border);
		color: var(--muted-ink);
		padding: 3px 8px;
		border-radius: 7px;
		font-size: 0.69rem;
		font-variant-numeric: tabular-nums;
		font-weight: 700;
		cursor: pointer;
		transition:
			background-color 150ms ease,
			border-color 150ms ease,
			color 150ms ease;
	}

	.speed-pill:hover:not(.active) {
		color: var(--title-ink);
		border-color: var(--card-border-strong);
	}

	.speed-pill.active {
		background: var(--cta-bg);
		color: var(--cta-ink);
		border-color: var(--cta-bg);
	}

	/* Clean Action Button — Studio Monochrome */
	.card-action-row {
		width: 100%;
	}

	.card-action-btn {
		width: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		min-height: 44px;
		padding: 11px 18px;
		border-radius: 12px;
		background: var(--cta-bg);
		border: 1px solid transparent;
		color: var(--cta-ink);
		font-family: var(--font-body);
		font-size: 0.86rem;
		font-weight: 800;
		letter-spacing: 0.01em;
		cursor: pointer;
		transition:
			background-color 180ms ease,
			transform 150ms ease,
			opacity 180ms ease;
	}

	.card-action-btn:hover:not(:disabled) {
		background: var(--cta-bg-hover);
		transform: translateY(-1px);
	}

	.card-action-btn:active:not(:disabled) {
		transform: scale(0.985);
	}

	.card-action-btn.disabled,
	.card-action-btn:disabled {
		opacity: 0.55;
		cursor: not-allowed;
		background: var(--card-surface);
		border-color: var(--card-border);
		color: var(--muted-ink);
	}

	.dl-icon {
		flex-shrink: 0;
	}

	/* ── Deck Footer ── */
	.deck-footer {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 6px;
		margin-top: 12px;
		z-index: 20;
	}

	.swipe-hint {
		font-size: 0.72rem;
		letter-spacing: 0.02em;
		color: var(--muted-ink);
		margin: 0;
		display: flex;
		align-items: center;
		gap: 6px;
		text-align: center;
	}

	/* ── Loader & Error States ── */
	.gallery-loader {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 16px;
		color: var(--muted-ink);
		font-size: 0.88rem;
		font-weight: 600;
	}

	.loader-spinner {
		width: 36px;
		height: 36px;
		border: 2.5px solid var(--spinner-track);
		border-top-color: var(--title-ink);
		border-radius: 50%;
		animation: spin 0.75s linear infinite;
	}

	.btn-spinner {
		width: 14px;
		height: 14px;
		border: 2px solid var(--btn-spinner-track);
		border-top-color: currentColor;
		border-radius: 50%;
		animation: spin 0.7s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.gallery-error {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 12px;
		text-align: center;
		padding: 40px 20px;
	}

	.error-icon {
		width: 68px;
		height: 68px;
		border-radius: 50%;
		background: var(--card-bg);
		border: 1px solid var(--card-border);
		color: var(--title-ink);
		display: grid;
		place-items: center;
	}

	.gallery-error h2 {
		font-family: var(--font-display);
		font-size: 1.5rem;
		font-weight: 700;
		color: var(--title-ink);
		margin: 4px 0 0;
	}

	.gallery-error p {
		color: var(--muted-ink);
		max-width: 320px;
		line-height: 1.55;
		margin: 0;
		font-size: 0.86rem;
	}

	.error-hint {
		font-size: 0.78rem;
		opacity: 0.78;
	}

	/* ── Mobile Optimization ── */
	@media (max-width: 680px) {
		.frame-inner {
			padding: 18px 18px 20px;
			gap: 10px;
		}

		.gallery-header {
			gap: 8px;
		}

		.brand-logo {
			width: 80px;
		}

		.brand-sep {
			height: 20px;
		}

		.brand-tag {
			font-size: 0.58rem;
		}

		.gallery-date {
			font-size: 0.66rem;
		}

		.dl-all-pill-btn,
		.drive-pill-btn {
			min-height: 38px;
			padding: 0 12px;
			font-size: 0.72rem;
		}

		.side-nav-btn {
			width: 40px;
			height: 40px;
		}

		.side-nav-btn.prev {
			left: 10px;
		}

		.side-nav-btn.next {
			right: 10px;
		}

		.deck-stage {
			max-width: 330px;
			height: clamp(480px, 68vh, 560px);
		}

		.deck-card {
			max-width: 320px;
			border-radius: var(--radius-lg, 20px);
		}

		.deck-card.prev {
			transform: translate3d(calc(-74% + var(--drag-offset, 0px)), 0, 0) scale(0.86);
		}

		.deck-card.next {
			transform: translate3d(calc(74% + var(--drag-offset, 0px)), 0, 0) scale(0.86);
		}

		.card-title {
			font-size: 0.96rem;
		}

		.card-sub {
			font-size: 0.72rem;
		}

		.card-action-btn {
			padding: 11px 16px;
			font-size: 0.84rem;
		}
	}

	@media (max-width: 460px) {
		.brand-sep,
		.brand-meta {
			display: none;
		}
	}
</style>
