<script lang="ts">
	import { onDestroy, onMount, tick } from 'svelte';
	import { session, goTo, resetSession, stripPhotos } from '#lib/stores/session';
	import { getProductForCount, renderExportCanvas } from '#lib/utils/canvas';
	import { frameToTemplate } from '#lib/utils/frameStorage';
	import { formatById } from '#lib/data/standardFormats';
	import { downloadStripPNG, printStrip } from '#lib/utils/export';
	import {
		saveGallerySession,
		buildQRCodeDataUrl,
		resolveGalleryUrl,
		generateId
	} from '#lib/services/gallery';

	let previewCanvas: HTMLCanvasElement;

	let isPrinting = false;
	let isDownloading = false;
	let downloadDone = false;
	let actionError: string | null = null;
	let copyTimer: ReturnType<typeof setTimeout> | null = null;

	let qrImageUrl: string | null = null;
	let galleryUrl: string | null = null;
	let galleryReady = false;
	let galleryError: string | null = null;
	let copiedUrl = false;

	/** Ukuran px hasil render, diambil dari kanvas ekspor (bukan angka hafalan). */
	let sheetPx = { w: 0, h: 0 };

	$: theme = $session.theme;
	$: photos = $stripPhotos;
	$: templateKey = $session.selectedTemplate;
	$: activeFrame = $session.activeFrame;
	$: caption = $session.caption;
	$: showDate = $session.showDate;
	$: photoTransforms = $session.photoTransforms;
	$: stickers = $session.stickers;
	$: photoFilter = $session.photoFilter;

	$: activeTemplate = activeFrame ? frameToTemplate(activeFrame) : templateKey;
	$: printFormat = formatById($session.formatId);
	$: isDigital = printFormat.kind === 'digital';

	$: produk = getProductForCount($session.photoCount, $session.formatId);
	$: sheetLandscape = produk.sheetOrient === 'landscape';
	$: sizeLabel = produk.cm.includes('cm') ? produk.cm : `${produk.cm} cm`;

	// Two up adalah satu-satunya produk dua salinan; sisanya tetap 1.
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
				photoFilter
			});
			sheetPx = { w: full.width, h: full.height };
			// Jaga rasio asli: menarik kanvas ke 400 × 600 membuat strip gepeng.
			// Bitmap 1200 px supaya tetap tajam saat kotak kertas membesar.
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
			qrImageUrl = await buildQRCodeDataUrl(galleryUrl, 360);
			galleryReady = true;

			// Simpan sesi di latar belakang: QR sudah tampil lebih dulu.
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
							photoFilter
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
			galleryError =
				'QR gagal dibuat. Strip tetap bisa dicetak atau diunduh lewat tombol di samping.';
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
				photoFilter
			});
		} catch (err) {
			console.error('Cetak gagal:', err);
			actionError = 'Dialog cetak gagal dibuka. Unduh PNG lalu cetak dari galeri perangkat.';
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
				photoFilter
			});
			downloadDone = true;
			if (copyTimer) clearTimeout(copyTimer);
			copyTimer = setTimeout(() => (downloadDone = false), 4000);
		} catch (err) {
			console.error('Unduh PNG gagal:', err);
			actionError = 'PNG gagal dibuat. Coba lagi, atau pakai QR untuk membuka galeri.';
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
				actionError = 'Link tidak bisa disalin otomatis. Buka galeri lalu salin dari bilah alamat.';
			});
	}
</script>

<section
	class="print-screen screen-enter kiosk-scope"
	class:theme-light={theme === 'light'}
	aria-label="Cetak dan bagikan"
>
	<header class="print-head">
		<button
			type="button"
			class="icon-btn"
			on:click={() => goTo('timelapse')}
			aria-label="Kembali ke timelapse"
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
		<div class="head-title">
			<h1 class="font-display">Cetak &amp; Bagikan</h1>
			<p class="head-sub font-mono">{printFormat.label}</p>
		</div>
	</header>

	<div class="print-body">
		<!-- Kiri: hasil strip siap cetak -->
		<section class="panel panel-sheet" aria-labelledby="sheet-title">
			<div class="panel-head">
				<h2 id="sheet-title" class="panel-title font-mono">Hasil strip</h2>
				<span class="panel-meta font-mono">{copies === 2 ? '2 salinan' : '1 salinan'}</span>
			</div>

			<div class="sheet-well">
				<canvas
					bind:this={previewCanvas}
					width={sheetLandscape ? 600 : 400}
					height={sheetLandscape ? 400 : 600}
					class="sheet-canvas"
					aria-label="Pratinjau lembar cetak"
				></canvas>
			</div>

			<p class="sheet-size font-mono">{produk.nama} · {sizeLabel}</p>

			{#if produk.copySheet > 1}
				<div class="copies" role="group" aria-label="Jumlah salinan cetak">
					<span class="copies-label font-mono">Salinan</span>
					<div class="copies-buttons">
						<button
							type="button"
							class="copies-btn font-mono"
							class:is-active={copies === 1}
							on:click={() => setCopies(1)}
							aria-pressed={copies === 1}>1 salinan</button
						>
						<button
							type="button"
							class="copies-btn font-mono"
							class:is-active={copies === 2}
							on:click={() => setCopies(2)}
							aria-pressed={copies === 2}>2 salinan</button
						>
					</div>
				</div>
			{/if}

			<p class="panel-hint">
				{copies === 2
					? 'Dua salinan di satu lembar. Potong mengikuti garis putus-putus di tengah.'
					: 'Satu salinan utuh di tengah lembar.'}
			</p>
		</section>

		<!-- Tengah atas: foto yang dipakai sesi -->
		<section class="panel panel-photos" aria-labelledby="photos-title">
			<div class="panel-head">
				<h2 id="photos-title" class="panel-title font-mono">Foto sesi</h2>
				<span class="panel-meta font-mono">{photos.length} foto</span>
			</div>

			{#if photos.length}
				<ul class="photo-grid">
					{#each photos as photo, i (i)}
						<li class="photo-cell">
							<img src={photo} alt="Foto {i + 1} pada strip" />
							<span class="photo-index font-mono" aria-hidden="true">{i + 1}</span>
						</li>
					{/each}
				</ul>
			{:else}
				<p class="empty-note">Belum ada foto di sesi ini.</p>
			{/if}
		</section>

		<!-- Tengah bawah: timelapse -->
		<section class="panel panel-video" aria-labelledby="video-title">
			<div class="panel-head">
				<h2 id="video-title" class="panel-title font-mono">Timelapse</h2>
				<span class="panel-meta font-mono">{videoUrl ? 'MP4' : gifUrl ? 'GIF' : 'belum ada'}</span>
			</div>

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
				<p class="panel-hint">
					Video MP4 tidak tersedia di browser ini. GIF tetap ikut terkirim ke galeri.
				</p>
			{:else}
				<div class="empty-box">
					<p>Timelapse belum dibuat untuk sesi ini.</p>
					<button type="button" class="ghost-btn font-mono" on:click={() => goTo('timelapse')}>
						Buka halaman timelapse
					</button>
				</div>
			{/if}
		</section>

		<!-- Kanan: QR galeri lalu aksi cetak -->
		<aside class="rail" aria-label="Bagikan dan cetak">
			<section class="panel panel-qr" aria-labelledby="qr-title">
				<h2 id="qr-title" class="panel-title font-mono">Buka di HP</h2>

				{#if galleryReady && qrImageUrl && galleryUrl}
					<div class="qr-box">
						<img src={qrImageUrl} alt="QR code galeri foto sesi" />
					</div>
					<p class="qr-hint">Pindai QR untuk membuka strip, GIF, dan video di ponsel.</p>
					<div class="qr-link">
						<span class="qr-url font-mono" title={galleryUrl}>{galleryUrl}</span>
						<button type="button" class="qr-btn font-mono" on:click={copyGalleryUrl}>
							{copiedUrl ? 'Tersalin' : 'Salin'}
						</button>
						<a class="qr-btn font-mono" href={galleryUrl} target="_blank" rel="noopener noreferrer"
							>Buka</a
						>
					</div>
				{:else if galleryError}
					<p class="error-note" role="alert">{galleryError}</p>
				{:else}
					<div class="qr-box qr-loading" role="status">
						<span class="spinner" aria-hidden="true"></span>
						<span class="font-mono">Menyiapkan QR…</span>
					</div>
				{/if}
			</section>

			<section class="panel panel-actions" aria-labelledby="actions-title">
				<h2 id="actions-title" class="panel-title font-mono">Cetak &amp; unduh</h2>

				{#if actionError}
					<p class="error-note" role="alert">{actionError}</p>
				{/if}
				{#if downloadDone}
					<p class="ok-note" role="status">Strip PNG tersimpan.</p>
				{/if}

				{#if !isDigital}
					<button
						type="button"
						id="btn-print"
						class="capsule-cta font-mono"
						on:click={handlePrint}
						disabled={isPrinting}
					>
						{#if isPrinting}
							<span class="spinner" aria-hidden="true"></span>
							Menyiapkan cetak…
						{:else}
							Cetak foto
						{/if}
					</button>
				{:else}
					<p class="panel-hint">Format ini hanya digital, jadi tidak ada lembar cetak.</p>
				{/if}

				<button
					type="button"
					id="btn-download-png"
					class="ghost-btn font-mono"
					on:click={handleDownload}
					disabled={isDownloading}
				>
					{isDownloading ? 'Menyiapkan PNG…' : 'Unduh PNG'}
				</button>

				<button type="button" class="ghost-btn font-mono" on:click={handleNewSession}>
					Sesi Baru
				</button>

				{#if sheetPx.w > 0}
					<p class="panel-hint font-mono">{sheetPx.w} × {sheetPx.h} px · 300 DPI</p>
				{/if}
			</section>
		</aside>
	</div>
</section>

<style>
	.print-screen {
		--paper: #e7e2d9;
		height: 100dvh;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		background: var(--bg);
		color: var(--fg);
		user-select: none;
		transition:
			background-color 220ms ease,
			color 220ms ease;
	}

	/* Layar sempit: biarkan mengalir, tinggi panel mengikuti isi. */
	@media (max-width: 759px) {
		.print-screen {
			height: auto;
			min-height: 100dvh;
			overflow: visible;
		}
	}

	/* ── Header ─────────────────────────────────────────────── */
	.print-head {
		display: flex;
		align-items: center;
		gap: 10px;
		min-height: 60px;
		padding: 6px 16px;
		border-bottom: 1px solid var(--ring-line);
		background: var(--bg);
		position: sticky;
		top: 0;
		z-index: 20;
		flex-shrink: 0;
	}
	.head-title {
		flex: 1;
		min-width: 0;
	}
	.head-title h1 {
		margin: 0;
		font-size: 1.1rem;
		font-weight: 500;
		letter-spacing: 0.01em;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.head-sub {
		margin: 2px 0 0;
		font-size: 0.56rem;
		font-weight: 700;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--fg-dim);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.icon-btn {
		display: inline-flex;
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
		flex-shrink: 0;
	}
	.icon-btn:hover {
		color: var(--fg);
		background: var(--ring-line);
	}

	/* ── Grid: 1 kolom, 2 kolom, lalu 3 kolom ───────────────── */
	.print-body {
		flex: 1;
		min-height: 0;
		width: 100%;
		max-width: 1600px;
		margin: 0 auto;
		box-sizing: border-box;
		padding: 14px;
		display: grid;
		gap: 12px;
		grid-template-columns: minmax(0, 1fr);
		grid-template-areas:
			'sheet'
			'photos'
			'video'
			'rail';
		align-content: start;
	}
	.panel-sheet {
		grid-area: sheet;
	}
	.panel-photos {
		grid-area: photos;
	}
	.panel-video {
		grid-area: video;
	}
	.rail {
		grid-area: rail;
		display: flex;
		flex-direction: column;
		gap: 12px;
		min-width: 0;
	}

	/* ── Panel bersama ──────────────────────────────────────── */
	.panel {
		display: flex;
		flex-direction: column;
		gap: 10px;
		min-width: 0;
		box-sizing: border-box;
		padding: 12px;
		border: 1px solid var(--hairline);
		border-radius: 12px;
		background: var(--bg);
	}
	.panel-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 10px;
	}
	.panel-title {
		margin: 0;
		font-size: 0.6rem;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--fg);
	}
	.panel-meta {
		font-size: 0.56rem;
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--fg-dim);
		white-space: nowrap;
	}
	.panel-hint {
		margin: 0;
		font-size: 0.62rem;
		line-height: 1.45;
		color: var(--fg-dim);
	}

	/* ── Lembar strip ───────────────────────────────────────── */
	.sheet-well {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 180px;
		padding: 10px;
		border-radius: 8px;
		background: var(--paper);
		box-shadow: 0 8px 20px rgba(11, 10, 9, 0.16);
	}
	.sheet-canvas {
		display: block;
		width: auto;
		height: auto;
		max-width: 100%;
		max-height: 56vh;
	}
	.sheet-size {
		margin: 0;
		font-size: 0.58rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--fg-dim);
	}
	.copies {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.copies-label {
		font-size: 0.56rem;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--fg-dim);
	}
	.copies-buttons {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 6px;
	}
	.copies-btn {
		min-height: 44px;
		padding: 0 10px;
		border: 1px solid var(--hairline);
		border-radius: 8px;
		background: transparent;
		color: var(--fg);
		font-size: 0.6rem;
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		cursor: pointer;
	}
	.copies-btn:hover {
		border-color: var(--fg);
	}
	.copies-btn.is-active {
		background: var(--fg);
		border-color: var(--fg);
		color: var(--bg);
	}

	/* ── Foto sesi ──────────────────────────────────────────── */
	.photo-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(84px, 1fr));
		gap: 8px;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.photo-cell {
		position: relative;
		overflow: hidden;
		border: 1px solid var(--ring-line);
		border-radius: 6px;
		background: var(--veil-edge);
	}
	.photo-cell img {
		display: block;
		width: 100%;
		aspect-ratio: 2 / 3;
		object-fit: cover;
	}
	.photo-index {
		position: absolute;
		left: 6px;
		bottom: 6px;
		padding: 2px 6px;
		border-radius: 999px;
		background: rgba(11, 10, 9, 0.72);
		color: #fbf7f0;
		font-size: 0.54rem;
		line-height: 1.2;
	}
	.empty-note {
		margin: 0;
		font-size: 0.66rem;
		line-height: 1.45;
		color: var(--fg-dim);
	}

	/* ── Video / GIF ────────────────────────────────────────── */
	.video-frame {
		display: flex;
		align-items: center;
		justify-content: center;
		overflow: hidden;
		border-radius: 8px;
		background: #000;
	}
	.video-frame video,
	.video-frame img {
		display: block;
		width: 100%;
		max-height: 30vh;
		object-fit: contain;
		background: #000;
	}
	.empty-box {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 10px;
		padding: 12px;
		border: 1px dashed var(--hairline);
		border-radius: 8px;
	}
	.empty-box p {
		margin: 0;
		font-size: 0.66rem;
		line-height: 1.45;
		color: var(--fg-dim);
	}

	/* ── QR ─────────────────────────────────────────────────── */
	.qr-box {
		display: flex;
		align-items: center;
		justify-content: center;
		aspect-ratio: 1 / 1;
		padding: 10px;
		border: 1px solid var(--ring-line);
		border-radius: 10px;
		background: #fff;
		box-sizing: border-box;
	}
	.qr-box img {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: contain;
	}
	.qr-loading {
		flex-direction: column;
		gap: 10px;
		border-style: dashed;
		background: var(--paper);
		color: #1c1917;
		font-size: 0.6rem;
	}
	.qr-hint {
		margin: 0;
		font-size: 0.62rem;
		line-height: 1.45;
		color: var(--fg-dim);
	}
	.qr-link {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 4px 4px 4px 12px;
		border: 1px solid var(--ring-line);
		border-radius: 999px;
	}
	.qr-url {
		flex: 1;
		min-width: 0;
		font-size: 0.54rem;
		color: var(--fg-dim);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.qr-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-height: 44px;
		padding: 0 12px;
		border: 1px solid transparent;
		border-radius: 999px;
		background: transparent;
		color: var(--fg);
		font-size: 0.56rem;
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		text-decoration: none;
		cursor: pointer;
		flex-shrink: 0;
	}
	.qr-btn:hover {
		border-color: var(--fg);
		background: var(--ring-line);
	}

	/* ── Aksi ───────────────────────────────────────────────── */
	.panel-actions {
		gap: 8px;
	}
	.capsule-cta {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 10px;
		width: 100%;
		min-height: 48px;
		padding: 0 20px;
		border: none;
		border-radius: 999px;
		background: var(--fg);
		color: var(--bg);
		font-size: 0.68rem;
		font-weight: 800;
		letter-spacing: 0.2em;
		text-transform: uppercase;
		cursor: pointer;
		transition:
			background-color 200ms ease,
			color 200ms ease,
			box-shadow 200ms ease;
	}
	.capsule-cta:hover:not(:disabled) {
		background: transparent;
		color: var(--fg);
		box-shadow: inset 0 0 0 2px var(--fg);
	}
	.capsule-cta:disabled {
		opacity: 0.55;
		cursor: progress;
	}
	.ghost-btn {
		width: 100%;
		min-height: 44px;
		padding: 0 14px;
		border: 1px solid var(--hairline);
		border-radius: 8px;
		background: transparent;
		color: var(--fg);
		font-size: 0.6rem;
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		cursor: pointer;
	}
	.ghost-btn:hover:not(:disabled) {
		border-color: var(--fg);
		background: var(--ring-line);
	}
	.ghost-btn:disabled {
		opacity: 0.55;
		cursor: progress;
	}

	.error-note {
		margin: 0;
		padding: 8px 10px;
		border: 1px solid #b42318;
		border-radius: 8px;
		background: rgba(180, 35, 24, 0.08);
		color: #b42318;
		font-size: 0.64rem;
		line-height: 1.45;
	}
	.print-screen:not(.theme-light) .error-note {
		border-color: #e8837a;
		background: rgba(232, 131, 122, 0.1);
		color: #f0a49c;
	}
	.ok-note {
		margin: 0;
		padding: 8px 10px;
		border: 1px solid #0f6b3d;
		border-radius: 8px;
		background: rgba(15, 107, 61, 0.08);
		color: #0f6b3d;
		font-size: 0.64rem;
		line-height: 1.45;
	}
	.print-screen:not(.theme-light) .ok-note {
		border-color: #7ee2a8;
		background: rgba(126, 226, 168, 0.1);
		color: #7ee2a8;
	}

	.spinner {
		width: 14px;
		height: 14px;
		border: 2px solid currentColor;
		border-right-color: transparent;
		border-radius: 50%;
		animation: spin 0.7s linear infinite;
		flex-shrink: 0;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	/* ── Isi satu layar: panel meregang mengisi sel grid ────── */
	@media (min-width: 760px) {
		.print-body {
			grid-template-columns: minmax(0, 1fr) 292px;
			grid-template-areas:
				'sheet rail'
				'photos rail'
				'video rail';
			grid-template-rows: minmax(0, 1.6fr) auto minmax(0, 1fr);
			align-content: stretch;
			padding: 18px;
			gap: 14px;
		}

		.panel {
			min-height: 0;
		}
		.panel-sheet,
		.panel-video,
		.panel-qr {
			overflow: hidden;
		}
		.sheet-well {
			flex: 1;
			min-height: 0;
		}
		/* Kanvas mengisi kotak kertas; contain menjaga rasio strip. */
		.sheet-canvas {
			width: 100%;
			height: 100%;
			max-width: 100%;
			max-height: 100%;
			object-fit: contain;
		}

		/* Foto jadi satu baris filmstrip yang mengisi lebar panel. */
		.photo-grid {
			display: flex;
			gap: 8px;
			height: 132px;
		}
		.photo-cell {
			flex: 1 1 0;
			min-width: 0;
			max-width: 240px;
		}
		.photo-cell img {
			width: 100%;
			height: 100%;
			aspect-ratio: auto;
		}

		.video-frame {
			flex: 1;
			min-height: 0;
		}
		.video-frame video,
		.video-frame img {
			height: 100%;
			max-height: none;
		}
		.empty-box {
			flex: 1;
			justify-content: center;
		}

		.panel-qr {
			flex: 1;
		}
		.panel-qr .qr-box {
			flex: 1;
			min-height: 0;
			aspect-ratio: auto;
		}
		.panel-qr .qr-box img {
			width: 100%;
			height: 100%;
			object-fit: contain;
		}
	}

	@media (min-width: 1120px) {
		.print-body {
			grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.15fr) 312px;
			grid-template-areas:
				'sheet photos rail'
				'sheet video rail';
			grid-template-rows: auto minmax(0, 1fr);
			align-items: stretch;
			padding: 20px;
			gap: 16px;
		}
	}

	/* ── Fokus & gerak ──────────────────────────────────────── */
	.print-screen button:focus-visible,
	.print-screen a:focus-visible {
		outline: 2.5px solid var(--focus);
		outline-offset: 3px;
	}
	@media (prefers-reduced-motion: reduce) {
		.spinner {
			animation-duration: 2.4s;
		}
	}
</style>
