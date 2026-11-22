<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { session, setTheme, setCameraSettings } from '#lib/stores/session';
	import type {
		CameraFilter,
		CameraTheme,
		FlashMode,
		GridOverlay,
		TimelapseSpeedMul,
		TimerDuration
	} from '#lib/types';
	import { Sun, Moon, Check, RotateCcw, Printer, RefreshCw } from '@lucide/svelte';

	type PrintMode = 'browser' | 'direct';
	type PrintLayoutMode = 'fit' | 'fill' | 'stretch';
	type PrintSplitMode = 'none' | '2-strip';

	interface PrintConfig {
		printMode: PrintMode;
		printerName: string;
		layoutMode: PrintLayoutMode;
		splitMode: PrintSplitMode;
		autoRotate: boolean;
		copies: number;
		fallbackToBrowser: boolean;
		updatedAt: string;
	}

	interface DetectedPrinter {
		name: string;
		isDefault: boolean;
		status: 'online' | 'offline' | 'error';
	}

	const DEFAULT_PRINT: PrintConfig = {
		printMode: 'browser',
		printerName: '',
		layoutMode: 'fit',
		splitMode: 'none',
		autoRotate: true,
		copies: 1,
		fallbackToBrowser: true,
		updatedAt: ''
	};

	const CAM_THEME_OPTS: { v: CameraTheme; l: string }[] = [
		{ v: 'clean', l: 'Clean' },
		{ v: 'croc', l: 'Croc' },
		{ v: 'polaroid', l: 'Polaroid' },
		{ v: 'film', l: 'Film' }
	];
	const TIMER_OPTS: { v: TimerDuration; l: string }[] = [
		{ v: 0, l: 'Instan' },
		{ v: 3, l: '3 dtk' },
		{ v: 5, l: '5 dtk' },
		{ v: 10, l: '10 dtk' }
	];
	const FLASH_OPTS: { v: FlashMode; l: string }[] = [
		{ v: 'off', l: 'Mati' },
		{ v: 'auto', l: 'Otomatis' },
		{ v: 'on', l: 'Aktif' }
	];
	const FILTER_OPTS: { v: CameraFilter; l: string }[] = [
		{ v: 'none', l: 'Normal' },
		{ v: 'grayscale', l: 'Hitam Putih' },
		{ v: 'sepia', l: 'Sepia' },
		{ v: 'high-contrast', l: 'Kontras' },
		{ v: 'warm', l: 'Hangat' },
		{ v: 'cool', l: 'Dingin' }
	];
	const GRID_OPTS: { v: GridOverlay; l: string }[] = [
		{ v: 'none', l: 'Mati' },
		{ v: 'thirds', l: '3×3' }
	];
	const SPEED_OPTS: TimelapseSpeedMul[] = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
	const LAYOUT_OPTS: { v: PrintLayoutMode; l: string }[] = [
		{ v: 'fit', l: 'Fit' },
		{ v: 'fill', l: 'Fill' },
		{ v: 'stretch', l: 'Stretch' }
	];
	const SPLIT_OPTS: { v: PrintSplitMode; l: string }[] = [
		{ v: 'none', l: 'Normal' },
		{ v: '2-strip', l: '2-Strip' }
	];
	const COPY_OPTS = [1, 2, 3, 4];

	let savedFlash = $state(false);
	let confirmReset = $state(false);
	let savedTimer: ReturnType<typeof setTimeout> | null = null;

	let printCfg = $state<PrintConfig>({ ...DEFAULT_PRINT });
	let printers = $state<DetectedPrinter[]>([]);
	let printersSupported = $state(true);
	let loadingPrint = $state(true);
	let detectingPrinters = $state(false);
	let testingPrint = $state(false);
	let printError = $state<string | null>(null);
	let printNotice = $state<string | null>(null);

	const theme = $derived($session.theme);
	const cam = $derived($session.cameraSettings);
	const tl = $derived(cam.timelapse);

	const selectedPrinterObj = $derived(
		printers.find((p) => p.name === printCfg.printerName) ?? null
	);
	const customPrinterMissing = $derived(
		Boolean(printCfg.printerName) && !printers.some((p) => p.name === printCfg.printerName)
	);

	function pingSaved(): void {
		savedFlash = true;
		if (savedTimer) clearTimeout(savedTimer);
		savedTimer = setTimeout(() => (savedFlash = false), 1800);
	}

	function updateTheme(next: 'light' | 'dark'): void {
		setTheme(next);
		pingSaved();
	}

	function updateCam(patch: Parameters<typeof setCameraSettings>[0]): void {
		setCameraSettings(patch);
		pingSaved();
	}

	async function loadDeviceConfig(): Promise<void> {
		try {
			const res = await fetch('/api/settings/device');
			if (!res.ok) return;
			const data = (await res.json()) as { ok?: boolean; config?: PrintConfig };
			if (data?.ok && data.config) {
				printCfg = data.config;
			}
		} catch {
			// biarkan nilai default
		} finally {
			loadingPrint = false;
		}
	}

	async function detectPrinters(): Promise<void> {
		detectingPrinters = true;
		printError = null;
		try {
			const res = await fetch('/api/printers');
			const data = (await res.json()) as {
				ok?: boolean;
				supported?: boolean;
				printers?: DetectedPrinter[];
				error?: string;
			};
			printersSupported = data.supported !== false;
			printers = Array.isArray(data.printers) ? data.printers : [];
			if (data.error) {
				printError = data.error;
			}
		} catch {
			printError = 'Gagal memeriksa daftar printer Windows.';
		} finally {
			detectingPrinters = false;
		}
	}

	async function updatePrint(patch: Partial<PrintConfig>): Promise<void> {
		printCfg = { ...printCfg, ...patch };
		printError = null;
		printNotice = null;
		try {
			const res = await fetch('/api/settings/device', {
				method: 'PUT',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(patch)
			});
			const data = (await res.json()) as { ok?: boolean; config?: PrintConfig; error?: string };
			if (!res.ok || !data.ok) {
				printError = data.error || 'Gagal menyimpan pengaturan printer.';
				return;
			}
			if (data.config) {
				printCfg = data.config;
			}
			pingSaved();
		} catch {
			printError = 'Tidak dapat terhubung ke server untuk menyimpan pengaturan printer.';
		}
	}

	function buildTestPrintDataUrl(): string {
		const canvas = document.createElement('canvas');
		canvas.width = 1200;
		canvas.height = 1800;
		const ctx = canvas.getContext('2d');
		if (!ctx) return '';

		ctx.fillStyle = '#ffffff';
		ctx.fillRect(0, 0, canvas.width, canvas.height);

		// Bingkai uji margin 4R
		ctx.strokeStyle = '#0f172a';
		ctx.lineWidth = 8;
		ctx.strokeRect(48, 48, canvas.width - 96, canvas.height - 96);

		ctx.strokeStyle = '#94a3b8';
		ctx.lineWidth = 2;
		ctx.setLineDash([14, 10]);
		ctx.strokeRect(96, 96, canvas.width - 192, canvas.height - 192);
		ctx.setLineDash([]);

		// Header
		ctx.fillStyle = '#0f172a';
		ctx.textAlign = 'center';
		ctx.font = '800 56px system-ui, sans-serif';
		ctx.fillText('DISTUDIO PHOTOBOOTH', canvas.width / 2, 260);

		ctx.fillStyle = '#475569';
		ctx.font = '600 32px system-ui, sans-serif';
		ctx.fillText('HALAMAN UJI CETAK · 4R (4 × 6 INCI)', canvas.width / 2, 325);

		// Palet uji warna
		const swatches = ['#0f172a', '#334155', '#64748b', '#ef4444', '#f59e0b', '#10b981', '#3b82f6'];
		const swW = 120;
		const swGap = 18;
		const swTotal = swatches.length * swW + (swatches.length - 1) * swGap;
		const swStart = (canvas.width - swTotal) / 2;
		swatches.forEach((hex, idx) => {
			ctx.fillStyle = hex;
			ctx.fillRect(swStart + idx * (swW + swGap), 430, swW, 120);
		});

		// Info konfigurasi
		const lines = [
			`Mode: ${printCfg.printMode === 'direct' ? 'Cetak Langsung Windows' : 'Dialog Browser'}`,
			`Printer: ${printCfg.printerName || 'Default Browser'}`,
			`Layout: ${printCfg.layoutMode.toUpperCase()}  ·  Strip: ${printCfg.splitMode === '2-strip' ? '2-Strip' : 'Normal'}`,
			`Putar Otomatis: ${printCfg.autoRotate ? 'Aktif' : 'Mati'}  ·  Salinan: ${printCfg.copies}`,
			`Waktu: ${new Date().toLocaleString('id-ID')}`
		];

		ctx.fillStyle = '#f8fafc';
		ctx.fillRect(140, 660, canvas.width - 280, 420);
		ctx.strokeStyle = '#cbd5e1';
		ctx.lineWidth = 3;
		ctx.strokeRect(140, 660, canvas.width - 280, 420);

		ctx.textAlign = 'left';
		ctx.fillStyle = '#0f172a';
		ctx.font = '600 30px system-ui, sans-serif';
		lines.forEach((line, idx) => {
			ctx.fillText(line, 190, 745 + idx * 70);
		});

		ctx.textAlign = 'center';
		ctx.fillStyle = '#64748b';
		ctx.font = '500 26px system-ui, sans-serif';
		ctx.fillText(
			'Pastikan bingkai hitam terpotong rata di keempat sisi kertas.',
			canvas.width / 2,
			1640
		);

		return canvas.toDataURL('image/png');
	}

	async function runTestPrint(): Promise<void> {
		testingPrint = true;
		printError = null;
		printNotice = null;
		try {
			const dataUrl = buildTestPrintDataUrl();
			if (!dataUrl) throw new Error('Gagal membuat kanvas uji cetak.');

			if (printCfg.printMode === 'direct') {
				if (!printCfg.printerName.trim()) {
					printError = 'Pilih printer Windows terlebih dahulu sebelum uji cetak langsung.';
					return;
				}
				const res = await fetch('/api/print', {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({
						image: dataUrl,
						printerName: printCfg.printerName,
						layoutMode: printCfg.layoutMode,
						splitMode: printCfg.splitMode,
						autoRotate: printCfg.autoRotate,
						copies: 1,
						title: 'Uji Cetak Printer'
					})
				});
				const out = (await res.json().catch(() => ({}))) as {
					success?: boolean;
					error?: string;
				};
				if (!res.ok || !out.success) {
					printError = out.error || 'Gagal mengirim halaman uji ke printer.';
					return;
				}
				printNotice = `Halaman uji berhasil dikirim ke ${printCfg.printerName}.`;
			} else {
				const printLayout = document.getElementById('print-layout');
				if (!printLayout) throw new Error('Elemen cetak tidak ditemukan.');
				printLayout.style.setProperty('--print-w', '4.000in');
				printLayout.style.setProperty('--print-h', '6.000in');
				let pageSizeStyle = document.getElementById('print-run-size') as HTMLStyleElement | null;
				if (!pageSizeStyle) {
					pageSizeStyle = document.createElement('style');
					pageSizeStyle.id = 'print-run-size';
					document.head.appendChild(pageSizeStyle);
				}
				pageSizeStyle.textContent = '@page { size: 4.000in 6.000in; margin: 0; }';
				const img = printLayout.querySelector('img');
				if (img) img.src = dataUrl;
				await new Promise((r) => setTimeout(r, 100));
				window.print();
				printNotice = 'Dialog cetak browser dibuka untuk halaman uji.';
			}
		} catch (err) {
			printError = err instanceof Error ? err.message : 'Gagal menjalankan uji cetak.';
		} finally {
			testingPrint = false;
		}
	}

	function printerStatusLabel(status: DetectedPrinter['status']): string {
		if (status === 'online') return 'Siap';
		if (status === 'offline') return 'Offline';
		return 'Bermasalah';
	}

	function resetDefaults(): void {
		setTheme('light');
		setCameraSettings({
			theme: 'clean',
			timer: 3,
			flash: 'off',
			filter: 'none',
			grid: 'none',
			timelapse: {
				auto: true,
				speedMul: 1,
				transition: 'none',
				makeVideo: true
			}
		});
		void updatePrint({
			printMode: 'browser',
			printerName: '',
			layoutMode: 'fit',
			splitMode: 'none',
			autoRotate: true,
			copies: 1,
			fallbackToBrowser: true
		});
		confirmReset = false;
		pingSaved();
	}

	onMount(() => {
		void Promise.all([loadDeviceConfig(), detectPrinters()]);
	});

	onDestroy(() => {
		if (savedTimer) clearTimeout(savedTimer);
	});
</script>

<div class="pg-page">
	<header class="pg-head">
		<div class="pg-head-copy">
			<h1 class="pg-title">Pengaturan</h1>
			<p class="pg-sub">
				Konfigurasi default tema, kamera, timelapse, dan printer untuk perangkat ini. Perubahan
				tersimpan otomatis.
			</p>
		</div>

		<div class="pg-head-actions">
			{#if savedFlash}
				<span class="pg-saved-pill" role="status">
					<Check size={13} />
					Tersimpan
				</span>
			{/if}

			{#if confirmReset}
				<div class="pg-confirm-bar" role="group" aria-label="Konfirmasi reset pengaturan">
					<span>Reset ke default?</span>
					<button type="button" class="pg-sm-btn is-primary" onclick={resetDefaults}>
						Ya, Reset
					</button>
					<button type="button" class="pg-sm-btn" onclick={() => (confirmReset = false)}>
						Batal
					</button>
				</div>
			{:else}
				<button type="button" class="pg-btn" onclick={() => (confirmReset = true)}>
					<RotateCcw size={13} />
					Reset Default
				</button>
			{/if}
		</div>
	</header>

	<!-- 1. Tampilan -->
	<section class="pg-section" aria-labelledby="sec-theme">
		<div class="pg-sec-meta">
			<h2 id="sec-theme" class="pg-sec-title">Tampilan</h2>
			<p class="pg-sec-desc">Tema antarmuka Photobooth dan Dashboard pada perangkat ini.</p>
		</div>

		<div class="d-card pg-card">
			<div class="pg-theme-grid">
				<button
					type="button"
					class="pg-theme-card"
					class:is-active={theme === 'light'}
					aria-pressed={theme === 'light'}
					onclick={() => updateTheme('light')}
				>
					<div class="pg-theme-mock is-light" aria-hidden="true">
						<span class="mock-bar"></span>
						<span class="mock-box"></span>
						<span class="mock-icon"><Sun size={14} /></span>
					</div>
					<div class="pg-theme-foot">
						<div>
							<strong>Mode Terang</strong>
							<span>Bersih &amp; cerah</span>
						</div>
						{#if theme === 'light'}
							<span class="pg-check-dot" aria-hidden="true"><Check size={12} /></span>
						{/if}
					</div>
				</button>

				<button
					type="button"
					class="pg-theme-card"
					class:is-active={theme === 'dark'}
					aria-pressed={theme === 'dark'}
					onclick={() => updateTheme('dark')}
				>
					<div class="pg-theme-mock is-dark" aria-hidden="true">
						<span class="mock-bar"></span>
						<span class="mock-box"></span>
						<span class="mock-icon"><Moon size={14} /></span>
					</div>
					<div class="pg-theme-foot">
						<div>
							<strong>Mode Gelap</strong>
							<span>Nyaman di ruangan redup</span>
						</div>
						{#if theme === 'dark'}
							<span class="pg-check-dot" aria-hidden="true"><Check size={12} /></span>
						{/if}
					</div>
				</button>
			</div>
		</div>
	</section>

	<!-- 2. Kamera -->
	<section class="pg-section" aria-labelledby="sec-cam">
		<div class="pg-sec-meta">
			<h2 id="sec-cam" class="pg-sec-title">Kamera</h2>
			<p class="pg-sec-desc">
				Pengaturan awal saat layar kamera dibuka — tamu tetap bisa menyesuaikannya saat sesi.
			</p>
		</div>

		<div class="d-card pg-card is-list">
			<div class="pg-row">
				<div class="pg-row-copy">
					<span class="pg-row-label">Tema Bingkai Kamera</span>
					<span class="pg-row-hint">Gaya tampilan jendela pratinjau saat memotret.</span>
				</div>
				<div class="pg-seg" role="group" aria-label="Tema bingkai kamera">
					{#each CAM_THEME_OPTS as opt (opt.v)}
						<button
							type="button"
							class="pg-seg-btn"
							class:is-active={cam.theme === opt.v}
							aria-pressed={cam.theme === opt.v}
							onclick={() => updateCam({ theme: opt.v })}
						>
							{opt.l}
						</button>
					{/each}
				</div>
			</div>

			<div class="pg-row">
				<div class="pg-row-copy">
					<span class="pg-row-label">Timer Hitung Mundur</span>
					<span class="pg-row-hint">Jeda waktu sebelum tiap jepretan diambil.</span>
				</div>
				<div class="pg-seg" role="group" aria-label="Timer hitung mundur">
					{#each TIMER_OPTS as opt (opt.v)}
						<button
							type="button"
							class="pg-seg-btn d-num"
							class:is-active={cam.timer === opt.v}
							aria-pressed={cam.timer === opt.v}
							onclick={() => updateCam({ timer: opt.v })}
						>
							{opt.l}
						</button>
					{/each}
				</div>
			</div>

			<div class="pg-row">
				<div class="pg-row-copy">
					<span class="pg-row-label">Mode Flash Layar</span>
					<span class="pg-row-hint">Kilatan putih layar untuk menerangi wajah.</span>
				</div>
				<div class="pg-seg" role="group" aria-label="Mode flash layar">
					{#each FLASH_OPTS as opt (opt.v)}
						<button
							type="button"
							class="pg-seg-btn"
							class:is-active={cam.flash === opt.v}
							aria-pressed={cam.flash === opt.v}
							onclick={() => updateCam({ flash: opt.v })}
						>
							{opt.l}
						</button>
					{/each}
				</div>
			</div>

			<div class="pg-row">
				<div class="pg-row-copy">
					<span class="pg-row-label">Grid Komposisi</span>
					<span class="pg-row-hint">Garis bantu sepertiga untuk meratakan posisi subjek.</span>
				</div>
				<div class="pg-seg" role="group" aria-label="Grid komposisi">
					{#each GRID_OPTS as opt (opt.v)}
						<button
							type="button"
							class="pg-seg-btn"
							class:is-active={cam.grid === opt.v}
							aria-pressed={cam.grid === opt.v}
							onclick={() => updateCam({ grid: opt.v })}
						>
							{opt.l}
						</button>
					{/each}
				</div>
			</div>

			<div class="pg-row is-stack">
				<div class="pg-row-copy">
					<span class="pg-row-label">Filter Live Kamera</span>
					<span class="pg-row-hint">Efek warna default yang langsung diterapkan saat memotret.</span
					>
				</div>
				<div class="pg-chips" role="group" aria-label="Filter live kamera">
					{#each FILTER_OPTS as opt (opt.v)}
						<button
							type="button"
							class="pg-chip"
							class:is-active={cam.filter === opt.v}
							aria-pressed={cam.filter === opt.v}
							onclick={() => updateCam({ filter: opt.v })}
						>
							{opt.l}
						</button>
					{/each}
				</div>
			</div>
		</div>
	</section>

	<!-- 3. Timelapse -->
	<section class="pg-section" aria-labelledby="sec-tl">
		<div class="pg-sec-meta">
			<h2 id="sec-tl" class="pg-sec-title">Timelapse</h2>
			<p class="pg-sec-desc">Perilaku render GIF dan video MP4 setelah sesi foto selesai.</p>
		</div>

		<div class="d-card pg-card is-list">
			<label class="pg-row is-clickable">
				<span class="pg-row-copy">
					<span class="pg-row-label">Auto-generate Timelapse</span>
					<span class="pg-row-hint">Langsung merender GIF/video otomatis tanpa tombol manual.</span>
				</span>
				<input
					type="checkbox"
					class="toggle toggle-sm"
					checked={tl.auto}
					onchange={(e) =>
						updateCam({
							timelapse: { ...tl, auto: (e.currentTarget as HTMLInputElement).checked }
						})}
				/>
			</label>

			<label class="pg-row is-clickable">
				<span class="pg-row-copy">
					<span class="pg-row-label">Sertakan Video MP4</span>
					<span class="pg-row-hint">Buat file MP4 selain animasi GIF untuk diunduh di HP tamu.</span
					>
				</span>
				<input
					type="checkbox"
					class="toggle toggle-sm"
					checked={tl.makeVideo}
					onchange={(e) =>
						updateCam({
							timelapse: { ...tl, makeVideo: (e.currentTarget as HTMLInputElement).checked }
						})}
				/>
			</label>

			<div class="pg-row">
				<div class="pg-row-copy">
					<span class="pg-row-label">Transisi Antar Foto</span>
					<span class="pg-row-hint">Peralihan antar bingkai pada animasi timelapse.</span>
				</div>
				<div class="pg-seg" role="group" aria-label="Transisi antar foto">
					<button
						type="button"
						class="pg-seg-btn"
						class:is-active={tl.transition === 'none'}
						aria-pressed={tl.transition === 'none'}
						onclick={() => updateCam({ timelapse: { ...tl, transition: 'none' } })}
					>
						Tanpa Transisi
					</button>
					<button
						type="button"
						class="pg-seg-btn"
						class:is-active={tl.transition === 'crossfade'}
						aria-pressed={tl.transition === 'crossfade'}
						onclick={() => updateCam({ timelapse: { ...tl, transition: 'crossfade' } })}
					>
						Crossfade
					</button>
				</div>
			</div>

			<div class="pg-row is-stack">
				<div class="pg-row-copy">
					<span class="pg-row-label">Kecepatan Putar Default</span>
					<span class="pg-row-hint">Tempo pemutaran bingkai timelapse.</span>
				</div>
				<div class="pg-chips" role="group" aria-label="Kecepatan putar timelapse">
					{#each SPEED_OPTS as s (s)}
						<button
							type="button"
							class="pg-chip d-num"
							class:is-active={tl.speedMul === s}
							aria-pressed={tl.speedMul === s}
							onclick={() => updateCam({ timelapse: { ...tl, speedMul: s } })}
						>
							{s}×
						</button>
					{/each}
				</div>
			</div>
		</div>
	</section>

	<!-- 4. Printer & Cetak -->
	<section class="pg-section" aria-labelledby="sec-print">
		<div class="pg-sec-meta">
			<h2 id="sec-print" class="pg-sec-title">Printer &amp; Cetak</h2>
			<p class="pg-sec-desc">
				Deteksi printer Windows, mode cetak langsung, tata letak kertas, dan uji cetak.
			</p>
		</div>

		<div class="d-card pg-card is-list">
			<div class="pg-row">
				<div class="pg-row-copy">
					<span class="pg-row-label">Mode Cetak</span>
					<span class="pg-row-hint">
						Cetak langsung mengirim foto ke printer Windows tanpa membuka dialog browser.
					</span>
				</div>
				<div class="pg-seg" role="group" aria-label="Mode cetak">
					<button
						type="button"
						class="pg-seg-btn"
						class:is-active={printCfg.printMode === 'browser'}
						aria-pressed={printCfg.printMode === 'browser'}
						disabled={loadingPrint}
						onclick={() => updatePrint({ printMode: 'browser' })}
					>
						Dialog Browser
					</button>
					<button
						type="button"
						class="pg-seg-btn"
						class:is-active={printCfg.printMode === 'direct'}
						aria-pressed={printCfg.printMode === 'direct'}
						disabled={loadingPrint || !printersSupported}
						onclick={() => updatePrint({ printMode: 'direct' })}
					>
						Cetak Langsung
					</button>
				</div>
			</div>

			<div class="pg-row is-stack">
				<div class="pg-row-head">
					<div class="pg-row-copy">
						<span class="pg-row-label">Printer Windows</span>
						<span class="pg-row-hint">
							{#if !printersSupported}
								Deteksi printer langsung hanya tersedia di sistem operasi Windows.
							{:else if printers.length > 0}
								{printers.length} printer terdeteksi pada perangkat ini.
							{:else}
								Belum ada printer terdeteksi. Pastikan printer menyala lalu tekan Deteksi.
							{/if}
						</span>
					</div>
					{#if selectedPrinterObj}
						<span
							class="pg-status-pill"
							class:is-ok={selectedPrinterObj.status === 'online'}
							class:is-warn={selectedPrinterObj.status === 'offline'}
							class:is-err={selectedPrinterObj.status === 'error'}
						>
							<span class="pg-status-dot" aria-hidden="true"></span>
							{printerStatusLabel(selectedPrinterObj.status)}
						</span>
					{/if}
				</div>

				<div class="pg-printer-bar">
					{#if printers.length > 0}
						<select
							class="pg-select"
							aria-label="Pilih printer Windows"
							value={printCfg.printerName}
							disabled={loadingPrint}
							onchange={(e) =>
								updatePrint({ printerName: (e.currentTarget as HTMLSelectElement).value })}
						>
							<option value="">— Pilih printer Windows —</option>
							{#if customPrinterMissing}
								<option value={printCfg.printerName}>
									{printCfg.printerName} (Tidak terdeteksi)
								</option>
							{/if}
							{#each printers as p (p.name)}
								<option value={p.name}>
									{p.name}{p.isDefault ? ' (Default)' : ''} · {printerStatusLabel(p.status)}
								</option>
							{/each}
						</select>
					{:else}
						<input
							type="text"
							class="pg-input"
							placeholder="Nama printer Windows (opsional)..."
							value={printCfg.printerName}
							disabled={loadingPrint || !printersSupported}
							onchange={(e) =>
								updatePrint({ printerName: (e.currentTarget as HTMLInputElement).value.trim() })}
						/>
					{/if}

					<button
						type="button"
						class="pg-btn"
						disabled={detectingPrinters || !printersSupported}
						onclick={detectPrinters}
					>
						<RefreshCw size={13} class={detectingPrinters ? 'pg-spin' : ''} />
						{detectingPrinters ? 'Mendeteksi...' : 'Deteksi'}
					</button>
				</div>
			</div>

			<div class="pg-row">
				<div class="pg-row-copy">
					<span class="pg-row-label">Mode Layout</span>
					<span class="pg-row-hint">
						Fit menjaga foto utuh, Fill mengisi penuh kertas, Stretch meregangkan penuh.
					</span>
				</div>
				<div class="pg-seg" role="group" aria-label="Mode layout cetak">
					{#each LAYOUT_OPTS as opt (opt.v)}
						<button
							type="button"
							class="pg-seg-btn"
							class:is-active={printCfg.layoutMode === opt.v}
							aria-pressed={printCfg.layoutMode === opt.v}
							disabled={loadingPrint}
							onclick={() => updatePrint({ layoutMode: opt.v })}
						>
							{opt.l}
						</button>
					{/each}
				</div>
			</div>

			<div class="pg-row">
				<div class="pg-row-copy">
					<span class="pg-row-label">Mode Strip</span>
					<span class="pg-row-hint">
						Cetak satu lembar utuh atau gandakan 2 strip berdampingan di satu kertas.
					</span>
				</div>
				<div class="pg-seg" role="group" aria-label="Mode pemisahan strip">
					{#each SPLIT_OPTS as opt (opt.v)}
						<button
							type="button"
							class="pg-seg-btn"
							class:is-active={printCfg.splitMode === opt.v}
							aria-pressed={printCfg.splitMode === opt.v}
							disabled={loadingPrint}
							onclick={() => updatePrint({ splitMode: opt.v })}
						>
							{opt.l}
						</button>
					{/each}
				</div>
			</div>

			<div class="pg-row">
				<div class="pg-row-copy">
					<span class="pg-row-label">Jumlah Salinan Default</span>
					<span class="pg-row-hint">Banyak lembar yang dicetak otomatis saat cetak langsung.</span>
				</div>
				<div class="pg-chips" role="group" aria-label="Jumlah salinan cetak">
					{#each COPY_OPTS as n (n)}
						<button
							type="button"
							class="pg-chip d-num"
							class:is-active={printCfg.copies === n}
							aria-pressed={printCfg.copies === n}
							disabled={loadingPrint}
							onclick={() => updatePrint({ copies: n })}
						>
							{n}×
						</button>
					{/each}
				</div>
			</div>

			<label class="pg-row is-clickable">
				<span class="pg-row-copy">
					<span class="pg-row-label">Putar Otomatis Orientasi</span>
					<span class="pg-row-hint">
						Sesuaikan potret/lanskap gambar agar cocok dengan orientasi kertas printer.
					</span>
				</span>
				<input
					type="checkbox"
					class="toggle toggle-sm"
					checked={printCfg.autoRotate}
					disabled={loadingPrint}
					onchange={(e) =>
						updatePrint({ autoRotate: (e.currentTarget as HTMLInputElement).checked })}
				/>
			</label>

			{#if printCfg.printMode === 'direct'}
				<label class="pg-row is-clickable">
					<span class="pg-row-copy">
						<span class="pg-row-label">Fallback ke Dialog Browser</span>
						<span class="pg-row-hint">
							Buka dialog cetak browser otomatis jika cetak langsung gagal atau printer offline.
						</span>
					</span>
					<input
						type="checkbox"
						class="toggle toggle-sm"
						checked={printCfg.fallbackToBrowser}
						disabled={loadingPrint}
						onchange={(e) =>
							updatePrint({ fallbackToBrowser: (e.currentTarget as HTMLInputElement).checked })}
					/>
				</label>
			{/if}

			<div class="pg-row">
				<div class="pg-row-copy">
					<span class="pg-row-label">Uji Cetak</span>
					<span class="pg-row-hint">
						Cetak halaman uji 4R untuk memastikan koneksi, warna, dan margin kertas pas.
					</span>
					{#if printError}
						<span class="pg-feedback is-err" role="alert">{printError}</span>
					{:else if printNotice}
						<span class="pg-feedback is-ok" role="status">{printNotice}</span>
					{/if}
				</div>
				<button
					type="button"
					class="pg-btn is-primary"
					disabled={testingPrint ||
						loadingPrint ||
						(printCfg.printMode === 'direct' && !printCfg.printerName.trim())}
					onclick={runTestPrint}
				>
					<Printer size={13} />
					{testingPrint ? 'Mencetak...' : 'Uji Cetak'}
				</button>
			</div>
		</div>
	</section>
</div>

<style>
	.pg-page {
		display: flex;
		flex-direction: column;
		gap: 24px;
	}

	/* ── Header Minimalis ── */
	.pg-head {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		justify-content: space-between;
		gap: 12px 18px;
		padding-bottom: 16px;
		border-bottom: 1px solid var(--d-border);
	}

	.pg-head-copy {
		min-width: 0;
		flex: 1 1 240px;
	}

	.pg-title {
		margin: 0;
		font-size: clamp(1.4rem, 2vw, 1.7rem);
		font-weight: 800;
		letter-spacing: -0.025em;
		line-height: 1.15;
		color: var(--d-ink);
	}

	.pg-sub {
		margin: 4px 0 0;
		font-size: 0.82rem;
		color: var(--d-muted);
	}

	.pg-head-actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
	}

	.pg-saved-pill {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		height: 30px;
		padding: 0 10px;
		border-radius: 999px;
		background: var(--d-ok-soft);
		color: var(--d-ok);
		font-size: 0.72rem;
		font-weight: 700;
	}

	.pg-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		height: 34px;
		padding: 0 12px;
		border: 1px solid var(--d-border);
		border-radius: 9px;
		background: var(--d-surface);
		color: var(--d-ink);
		font-family: var(--font-body);
		font-size: 0.75rem;
		font-weight: 700;
		cursor: pointer;
		white-space: nowrap;
	}

	.pg-btn:hover:not(:disabled) {
		background: var(--d-surface-2);
		border-color: var(--d-border-strong);
	}

	.pg-btn.is-primary {
		border-color: var(--d-ink);
		background: var(--d-ink);
		color: var(--d-bg);
	}

	.pg-btn.is-primary:hover:not(:disabled) {
		opacity: 0.9;
		background: var(--d-ink);
		border-color: var(--d-ink);
	}

	.pg-btn:disabled,
	.pg-seg-btn:disabled,
	.pg-chip:disabled,
	.pg-select:disabled,
	.pg-input:disabled {
		opacity: 0.48;
		cursor: not-allowed;
	}

	.pg-confirm-bar {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		height: 34px;
		padding: 0 6px 0 11px;
		border: 1px solid var(--d-border-strong);
		border-radius: 9px;
		background: var(--d-surface-2);
		color: var(--d-ink);
		font-size: 0.73rem;
		font-weight: 700;
	}

	.pg-sm-btn {
		height: 24px;
		padding: 0 8px;
		border: 1px solid var(--d-border);
		border-radius: 6px;
		background: var(--d-surface);
		color: var(--d-ink);
		font-family: var(--font-body);
		font-size: 0.69rem;
		font-weight: 700;
		cursor: pointer;
	}

	.pg-sm-btn.is-primary {
		border-color: var(--d-ink);
		background: var(--d-ink);
		color: var(--d-bg);
	}

	/* ── Layout 2-Kolom Editorial ── */
	.pg-section {
		display: grid;
		grid-template-columns: 230px minmax(0, 1fr);
		gap: 16px 24px;
		align-items: start;
	}

	.pg-sec-meta {
		padding-top: 4px;
	}

	.pg-sec-title {
		margin: 0;
		font-size: 0.92rem;
		font-weight: 800;
		color: var(--d-ink);
	}

	.pg-sec-desc {
		margin: 4px 0 0;
		font-size: 0.76rem;
		line-height: 1.5;
		color: var(--d-muted);
	}

	.pg-card {
		padding: 14px;
		overflow: hidden;
	}

	.pg-card.is-list {
		padding: 0;
	}

	/* ── Pemilih Tema dengan Mini Mockup ── */
	.pg-theme-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 12px;
	}

	.pg-theme-card {
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding: 10px;
		border: 1.5px solid var(--d-border);
		border-radius: 12px;
		background: var(--d-bg);
		color: var(--d-ink);
		text-align: left;
		cursor: pointer;
		transition:
			border-color 140ms ease,
			background-color 140ms ease;
	}

	.pg-theme-card:hover {
		border-color: var(--d-border-strong);
	}

	.pg-theme-card.is-active {
		border-color: var(--d-ink);
	}

	.pg-theme-mock {
		position: relative;
		height: 76px;
		padding: 10px;
		border-radius: 8px;
		border: 1px solid var(--d-border);
		display: flex;
		flex-direction: column;
		gap: 7px;
		overflow: hidden;
	}

	.pg-theme-mock.is-light {
		background: #f8fafc;
		color: #0f172a;
	}

	.pg-theme-mock.is-dark {
		background: #0d0d10;
		color: #f8fafc;
	}

	.mock-bar {
		width: 44%;
		height: 7px;
		border-radius: 999px;
		background: currentColor;
		opacity: 0.22;
	}

	.mock-box {
		flex: 1;
		border-radius: 6px;
		background: currentColor;
		opacity: 0.08;
	}

	.mock-icon {
		position: absolute;
		top: 8px;
		right: 8px;
		width: 24px;
		height: 24px;
		border-radius: 7px;
		display: grid;
		place-items: center;
		background: color-mix(in srgb, currentColor 10%, transparent);
	}

	.pg-theme-foot {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		padding: 0 2px;
	}

	.pg-theme-foot strong {
		display: block;
		font-size: 0.82rem;
		font-weight: 800;
	}

	.pg-theme-foot span {
		font-size: 0.71rem;
		color: var(--d-muted);
	}

	.pg-check-dot {
		width: 22px;
		height: 22px;
		border-radius: 999px;
		background: var(--d-ink);
		color: var(--d-bg);
		display: grid;
		place-items: center;
		flex-shrink: 0;
	}

	/* ── Baris Pengaturan Hairline ── */
	.pg-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 10px 16px;
		padding: 14px 16px;
		border-bottom: 1px solid var(--d-border);
	}

	.pg-row:last-child {
		border-bottom: none;
	}

	.pg-row.is-stack {
		flex-direction: column;
		align-items: stretch;
	}

	.pg-row.is-clickable {
		cursor: pointer;
	}

	.pg-row.is-clickable:hover {
		background: var(--d-surface-2);
	}

	.pg-row-copy {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
		flex: 1 1 200px;
	}

	.pg-row-label {
		font-size: 0.82rem;
		font-weight: 800;
		color: var(--d-ink);
	}

	.pg-row-hint {
		font-size: 0.73rem;
		color: var(--d-muted);
		line-height: 1.4;
	}

	/* ── Kontrol Segmented & Chips ── */
	.pg-seg {
		display: inline-flex;
		flex-wrap: wrap;
		padding: 3px;
		border: 1px solid var(--d-border);
		border-radius: 9px;
		background: var(--d-bg);
		gap: 2px;
	}

	.pg-seg-btn {
		height: 28px;
		padding: 0 10px;
		border: none;
		border-radius: 6px;
		background: transparent;
		color: var(--d-muted);
		font-family: var(--font-body);
		font-size: 0.73rem;
		font-weight: 700;
		cursor: pointer;
		white-space: nowrap;
		transition:
			background-color 130ms ease,
			color 130ms ease;
	}

	.pg-seg-btn:hover:not(.is-active) {
		color: var(--d-ink);
	}

	.pg-seg-btn.is-active {
		background: var(--d-ink);
		color: var(--d-bg);
	}

	.pg-chips {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}

	.pg-chip {
		height: 30px;
		min-width: 46px;
		padding: 0 11px;
		border: 1px solid var(--d-border);
		border-radius: 8px;
		background: var(--d-bg);
		color: var(--d-muted);
		font-family: var(--font-body);
		font-size: 0.73rem;
		font-weight: 700;
		cursor: pointer;
		transition:
			background-color 130ms ease,
			border-color 130ms ease,
			color 130ms ease;
	}

	.pg-chip:hover:not(.is-active) {
		color: var(--d-ink);
		border-color: var(--d-border-strong);
	}

	.pg-chip.is-active {
		border-color: var(--d-ink);
		background: var(--d-ink);
		color: var(--d-bg);
	}

	/* ── Kontrol Printer & Status ── */
	.pg-row-head {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-start;
		justify-content: space-between;
		gap: 8px 14px;
	}

	.pg-printer-bar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
	}

	.pg-select,
	.pg-input {
		flex: 1 1 220px;
		min-width: 0;
		height: 34px;
		padding: 0 11px;
		border: 1px solid var(--d-border);
		border-radius: 9px;
		background: var(--d-bg);
		color: var(--d-ink);
		font-family: var(--font-body);
		font-size: 0.78rem;
		font-weight: 600;
		outline: none;
	}

	.pg-select:focus,
	.pg-input:focus {
		border-color: var(--d-ink);
	}

	.pg-status-pill {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		height: 24px;
		padding: 0 9px;
		border-radius: 999px;
		font-size: 0.69rem;
		font-weight: 700;
		white-space: nowrap;
	}

	.pg-status-pill.is-ok {
		background: var(--d-ok-soft);
		color: var(--d-ok);
	}

	.pg-status-pill.is-warn {
		background: var(--d-warn-soft);
		color: var(--d-warn);
	}

	.pg-status-pill.is-err {
		background: var(--d-err-soft);
		color: var(--d-err);
	}

	.pg-status-dot {
		width: 6px;
		height: 6px;
		border-radius: 999px;
		background: currentColor;
	}

	.pg-feedback {
		margin-top: 4px;
		font-size: 0.72rem;
		font-weight: 600;
		line-height: 1.4;
	}

	.pg-feedback.is-ok {
		color: var(--d-ok);
	}

	.pg-feedback.is-err {
		color: var(--d-err);
	}

	:global(.pg-spin) {
		animation: pgSpin 850ms linear infinite;
	}

	@keyframes pgSpin {
		from {
			transform: rotate(0deg);
		}
		to {
			transform: rotate(360deg);
		}
	}

	@media (max-width: 820px) {
		.pg-section {
			grid-template-columns: minmax(0, 1fr);
			gap: 10px;
		}
	}

	@media (max-width: 520px) {
		.pg-theme-grid {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
