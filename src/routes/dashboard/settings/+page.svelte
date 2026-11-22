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
	import {
		Sun,
		Moon,
		Check,
		RotateCcw,
		Printer,
		RefreshCw,
		Cloud,
		Copy,
		ExternalLink,
		Upload,
		Camera,
		SlidersHorizontal,
		Eye,
		EyeOff
	} from '@lucide/svelte';

	type SettingsTab = 'umum' | 'kamera' | 'printer' | 'cloud';
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

	type CloudQrMode = 'smart' | 'gallery' | 'local';

	interface CloudUploadTypes {
		strip: boolean;
		photos: boolean;
		gif: boolean;
		video: boolean;
	}

	interface CloudStatus {
		configured: boolean;
		clientId: string;
		hasClientId: boolean;
		hasClientSecret: boolean;
		usingEnvCredentials: boolean;
		connected: boolean;
		needsReconnect: boolean;
		email: string | null;
		rootFolderId: string | null;
		rootFolderName: string;
		autoSync: boolean;
		publicShare: boolean;
		qrMode: CloudQrMode;
		publicBaseUrl: string | null;
		uploadTypes: CloudUploadTypes;
		lastSyncAt?: string;
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

	const DEFAULT_CLOUD: CloudStatus = {
		configured: false,
		clientId: '',
		hasClientId: false,
		hasClientSecret: false,
		usingEnvCredentials: false,
		connected: false,
		needsReconnect: false,
		email: null,
		rootFolderId: null,
		rootFolderName: 'DISTUDIO Photobooth',
		autoSync: true,
		publicShare: true,
		qrMode: 'smart',
		publicBaseUrl: null,
		uploadTypes: { strip: true, photos: true, gif: true, video: true }
	};

	const TABS: { id: SettingsTab; label: string }[] = [
		{ id: 'umum', label: 'Umum & Tampilan' },
		{ id: 'kamera', label: 'Kamera & Timelapse' },
		{ id: 'printer', label: 'Printer & Cetak' },
		{ id: 'cloud', label: 'Google Drive' }
	];

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

	let activeTab = $state<SettingsTab>('umum');
	let savedFlash = $state(false);
	let confirmReset = $state(false);
	let savedTimer: ReturnType<typeof setTimeout> | null = null;

	// ── Printer ──
	let printCfg = $state<PrintConfig>({ ...DEFAULT_PRINT });
	let printers = $state<DetectedPrinter[]>([]);
	let printersSupported = $state(true);
	let loadingPrint = $state(true);
	let detectingPrinters = $state(false);
	let testingPrint = $state(false);
	let printError = $state<string | null>(null);
	let printNotice = $state<string | null>(null);

	// ── Google Drive Cloud Sync ──
	let cloud = $state<CloudStatus>({ ...DEFAULT_CLOUD });
	let loadingCloud = $state(true);
	let savingCloud = $state(false);
	let syncingCloud = $state(false);
	let confirmDisconnect = $state(false);
	let copiedRedirect = $state(false);
	let showSecret = $state(false);
	let draftClientId = $state('');
	let draftClientSecret = $state('');
	let draftRootFolder = $state('DISTUDIO Photobooth');
	let draftPublicBaseUrl = $state('');
	let cloudError = $state<string | null>(null);
	let cloudNotice = $state<string | null>(null);
	let redirectUri = $state('http://localhost:5173/api/cloud/google/callback');

	const theme = $derived($session.theme);
	const cam = $derived($session.cameraSettings);
	const tl = $derived(cam.timelapse);

	const selectedPrinterObj = $derived(
		printers.find((p) => p.name === printCfg.printerName) ?? null
	);
	const customPrinterMissing = $derived(
		Boolean(printCfg.printerName) && !printers.some((p) => p.name === printCfg.printerName)
	);

	function selectTab(tab: SettingsTab): void {
		activeTab = tab;
		if (typeof window !== 'undefined') {
			const url = new URL(window.location.href);
			url.searchParams.set('tab', tab);
			url.hash = '';
			window.history.replaceState({}, '', url.pathname + url.search);
		}
	}

	function handleTabKeydown(e: KeyboardEvent, idx: number): void {
		if (e.key === 'ArrowRight') {
			e.preventDefault();
			selectTab(TABS[(idx + 1) % TABS.length].id);
		} else if (e.key === 'ArrowLeft') {
			e.preventDefault();
			selectTab(TABS[(idx - 1 + TABS.length) % TABS.length].id);
		}
	}

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

		ctx.strokeStyle = '#0f172a';
		ctx.lineWidth = 8;
		ctx.strokeRect(48, 48, canvas.width - 96, canvas.height - 96);

		ctx.strokeStyle = '#94a3b8';
		ctx.lineWidth = 2;
		ctx.setLineDash([14, 10]);
		ctx.strokeRect(96, 96, canvas.width - 192, canvas.height - 192);
		ctx.setLineDash([]);

		ctx.fillStyle = '#0f172a';
		ctx.textAlign = 'center';
		ctx.font = '800 56px system-ui, sans-serif';
		ctx.fillText('DISTUDIO PHOTOBOOTH', canvas.width / 2, 260);

		ctx.fillStyle = '#475569';
		ctx.font = '600 32px system-ui, sans-serif';
		ctx.fillText('HALAMAN UJI CETAK · 4R (4 × 6 INCI)', canvas.width / 2, 325);

		const swatches = ['#0f172a', '#334155', '#64748b', '#ef4444', '#f59e0b', '#10b981', '#3b82f6'];
		const swW = 120;
		const swGap = 18;
		const swTotal = swatches.length * swW + (swatches.length - 1) * swGap;
		const swStart = (canvas.width - swTotal) / 2;
		swatches.forEach((hex, idx) => {
			ctx.fillStyle = hex;
			ctx.fillRect(swStart + idx * (swW + swGap), 430, swW, 120);
		});

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
			'Pastikan seluruh garis tepi tercetak rapi tanpa terpotong.',
			canvas.width / 2,
			1620
		);

		return canvas.toDataURL('image/png');
	}

	async function runTestPrint(): Promise<void> {
		testingPrint = true;
		printError = null;
		printNotice = null;
		try {
			const dataUrl = buildTestPrintDataUrl();
			if (!dataUrl) throw new Error('Gagal membuat gambar uji cetak.');

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
						title: `Uji Cetak (${printCfg.printerName})`
					})
				});
				const out = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string };
				if (!res.ok || !out.success) {
					printError = out.error || 'Uji cetak ke printer Windows gagal.';
					return;
				}
				printNotice = `Halaman uji terkirim ke printer "${printCfg.printerName}".`;
				return;
			}

			const printLayout = document.getElementById('print-layout');
			if (!printLayout) throw new Error('Elemen cetak tidak ditemukan di halaman.');
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

			await new Promise((r) => setTimeout(r, 120));
			window.print();
			printNotice = 'Dialog cetak browser dibuka untuk halaman uji 4R.';
		} catch (err) {
			printError = err instanceof Error ? err.message : 'Uji cetak gagal dijalankan.';
		} finally {
			testingPrint = false;
		}
	}

	function printerStatusLabel(status: DetectedPrinter['status']): string {
		if (status === 'online') return 'Siap';
		if (status === 'offline') return 'Offline';
		return 'Bermasalah';
	}

	async function loadCloudStatus(): Promise<void> {
		loadingCloud = true;
		try {
			const res = await fetch('/api/cloud/google/status');
			if (!res.ok) return;
			const data = (await res.json()) as CloudStatus & { ok?: boolean };
			if (data?.ok) {
				cloud = data;
				draftClientId = data.clientId || '';
				draftRootFolder = data.rootFolderName || 'DISTUDIO Photobooth';
				draftPublicBaseUrl = data.publicBaseUrl || '';
			}
		} catch {
			// biarkan nilai default
		} finally {
			loadingCloud = false;
		}
	}

	async function saveCloudCredentials(e: SubmitEvent): Promise<void> {
		e.preventDefault();
		savingCloud = true;
		cloudError = null;
		cloudNotice = null;
		try {
			const body: Record<string, unknown> = {
				clientId: draftClientId.trim(),
				rootFolderName: draftRootFolder.trim() || 'DISTUDIO Photobooth',
				publicBaseUrl: draftPublicBaseUrl.trim()
			};
			if (draftClientSecret.trim()) {
				body.clientSecret = draftClientSecret.trim();
			}
			const res = await fetch('/api/cloud/google/config', {
				method: 'PUT',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(body)
			});
			const data = (await res.json()) as CloudStatus & { ok?: boolean; error?: string };
			if (!res.ok || !data.ok) {
				cloudError = data.error || 'Gagal menyimpan konfigurasi Google Drive.';
				return;
			}
			cloud = data;
			draftClientSecret = '';
			cloudNotice = 'Konfigurasi Google Drive tersimpan.';
			pingSaved();
		} catch {
			cloudError = 'Tidak dapat terhubung ke server untuk menyimpan konfigurasi Google Drive.';
		} finally {
			savingCloud = false;
		}
	}

	async function updateCloudPrefs(patch: {
		autoSync?: boolean;
		publicShare?: boolean;
		qrMode?: CloudQrMode;
		uploadTypes?: Partial<CloudUploadTypes>;
	}): Promise<void> {
		cloudError = null;
		cloudNotice = null;
		try {
			const res = await fetch('/api/cloud/google/config', {
				method: 'PUT',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(patch)
			});
			const data = (await res.json()) as CloudStatus & { ok?: boolean; error?: string };
			if (!res.ok || !data.ok) {
				cloudError = data.error || 'Gagal memperbarui preferensi sinkronisasi.';
				return;
			}
			cloud = data;
			pingSaved();
		} catch {
			cloudError = 'Tidak dapat terhubung ke server.';
		}
	}

	async function disconnectGoogleDrive(): Promise<void> {
		savingCloud = true;
		cloudError = null;
		cloudNotice = null;
		try {
			const res = await fetch('/api/cloud/google/disconnect', { method: 'POST' });
			const data = (await res.json()) as CloudStatus & { ok?: boolean; error?: string };
			if (!res.ok || !data.ok) {
				cloudError = data.error || 'Gagal memutuskan koneksi Google Drive.';
				return;
			}
			cloud = data;
			confirmDisconnect = false;
			cloudNotice = 'Koneksi Google Drive diputus.';
		} catch {
			cloudError = 'Gagal menghubungi server.';
		} finally {
			savingCloud = false;
		}
	}

	async function triggerSyncAll(): Promise<void> {
		syncingCloud = true;
		cloudError = null;
		cloudNotice = null;
		try {
			const res = await fetch('/api/cloud/sync', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ allPending: true })
			});
			const data = (await res.json()) as {
				ok?: boolean;
				results?: { status: string; error?: string }[];
				error?: string;
			};
			if (!res.ok || !data.ok) {
				cloudError = data.error || 'Gagal menyinkronkan sesi ke Google Drive.';
				return;
			}
			const list = data.results || [];
			if (list.length === 0) {
				cloudNotice = 'Semua sesi lokal sudah tersinkron ke Google Drive.';
			} else {
				const doneCount = list.filter((r) => r.status === 'done').length;
				const failCount = list.filter((r) => r.status === 'failed').length;
				if (failCount > 0) {
					const firstErr = list.find((r) => r.error)?.error;
					cloudError = `${doneCount} sesi berhasil, ${failCount} gagal${firstErr ? `: ${firstErr}` : '.'}`;
				} else {
					cloudNotice = `${doneCount} sesi berhasil diunggah ke Google Drive.`;
				}
			}
			await loadCloudStatus();
		} catch {
			cloudError = 'Gagal menghubungi server saat sinkronisasi.';
		} finally {
			syncingCloud = false;
		}
	}

	async function copyRedirectUri(): Promise<void> {
		try {
			await navigator.clipboard.writeText(redirectUri);
			copiedRedirect = true;
			setTimeout(() => (copiedRedirect = false), 1800);
		} catch {
			// abaikan
		}
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
		if (typeof window !== 'undefined') {
			redirectUri = `${window.location.origin}/api/cloud/google/callback`;
			const params = new URLSearchParams(window.location.search);
			const tabParam = params.get('tab');
			const cloudFlag = params.get('cloud');

			if (cloudFlag === 'connected') {
				activeTab = 'cloud';
				cloudNotice = 'Google Drive berhasil terhubung!';
				window.history.replaceState({}, '', `${window.location.pathname}?tab=cloud`);
			} else if (cloudFlag === 'error') {
				activeTab = 'cloud';
				const reason = params.get('reason');
				cloudError = reason
					? `Gagal menghubungkan Google Drive: ${reason}`
					: 'Gagal menghubungkan Google Drive.';
				window.history.replaceState({}, '', `${window.location.pathname}?tab=cloud`);
			} else if (
				window.location.hash === '#sec-cloud' ||
				tabParam === 'cloud' ||
				tabParam === 'device'
			) {
				activeTab = 'cloud';
			} else if (tabParam === 'kamera' || tabParam === 'printer' || tabParam === 'umum') {
				activeTab = tabParam;
			}
		}
		void Promise.all([loadDeviceConfig(), detectPrinters(), loadCloudStatus()]);
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
				Kelola tampilan, kamera, printer, dan koneksi Google Drive perangkat ini. Perubahan
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

	<!-- Navigasi Tab (daisyUI tabs-box disesuaikan dengan token Dashboard) -->
	<div role="tablist" aria-label="Kategori pengaturan" class="pg-tabs tabs tabs-box">
		{#each TABS as tab, idx (tab.id)}
			<button
				type="button"
				role="tab"
				id={`tab-${tab.id}`}
				aria-selected={activeTab === tab.id}
				aria-controls={`panel-${tab.id}`}
				class="pg-tab tab"
				class:tab-active={activeTab === tab.id}
				onclick={() => selectTab(tab.id)}
				onkeydown={(e) => handleTabKeydown(e, idx)}
			>
				{#if tab.id === 'umum'}
					<SlidersHorizontal size={14} />
				{:else if tab.id === 'kamera'}
					<Camera size={14} />
				{:else if tab.id === 'printer'}
					<Printer size={14} />
				{:else}
					<Cloud size={14} />
				{/if}
				<span>{tab.label}</span>
				{#if tab.id === 'cloud' && !loadingCloud}
					<span
						class="pg-tab-dot"
						class:is-ok={cloud.connected && !cloud.needsReconnect}
						class:is-warn={!cloud.connected && cloud.configured}
						class:is-err={cloud.needsReconnect}
						aria-hidden="true"
					></span>
				{:else if tab.id === 'printer' && selectedPrinterObj}
					<span
						class="pg-tab-dot"
						class:is-ok={selectedPrinterObj.status === 'online'}
						class:is-warn={selectedPrinterObj.status === 'offline'}
						class:is-err={selectedPrinterObj.status === 'error'}
						aria-hidden="true"
					></span>
				{/if}
			</button>
		{/each}
	</div>

	<!-- TAB 1: Umum & Tampilan -->
	{#if activeTab === 'umum'}
		<div
			id="panel-umum"
			role="tabpanel"
			aria-labelledby="tab-umum"
			class="pg-panel pg-panel-single"
		>
			<div class="d-card pg-card">
				<div class="d-card-head">
					<div>
						<h2 class="d-card-title">Tema Antarmuka</h2>
						<p class="d-card-sub">
							Pilih tampilan terang atau gelap untuk layar Photobooth dan Dashboard pada perangkat
							ini.
						</p>
					</div>
				</div>

				<div class="pg-card-pad">
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
									<span>Bersih &amp; cerah untuk ruangan terang</span>
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
									<span>Nyaman di ruangan studio redup</span>
								</div>
								{#if theme === 'dark'}
									<span class="pg-check-dot" aria-hidden="true"><Check size={12} /></span>
								{/if}
							</div>
						</button>
					</div>
				</div>
			</div>
		</div>
	{/if}

	<!-- TAB 2: Kamera & Timelapse -->
	{#if activeTab === 'kamera'}
		<div id="panel-kamera" role="tabpanel" aria-labelledby="tab-kamera" class="pg-panel pg-two-col">
			<!-- Kartu Kamera -->
			<div class="d-card pg-card">
				<div class="d-card-head">
					<div>
						<h2 class="d-card-title">Kamera Default</h2>
						<p class="d-card-sub">
							Nilai awal saat layar kamera dibuka — tamu tetap bisa mengubahnya saat sesi.
						</p>
					</div>
				</div>

				<div class="pg-list">
					<div class="pg-row">
						<div class="pg-row-copy">
							<span class="pg-row-label">Tema Bingkai Kamera</span>
							<span class="pg-row-hint">Gaya jendela pratinjau saat memotret.</span>
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
							<span class="pg-row-hint">Jeda sebelum tiap jepretan diambil.</span>
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
							<span class="pg-row-hint">Garis bantu sepertiga di layar pratinjau.</span>
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
							<span class="pg-row-hint">Efek warna default saat sesi dimulai.</span>
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
			</div>

			<!-- Kartu Timelapse -->
			<div class="d-card pg-card">
				<div class="d-card-head">
					<div>
						<h2 class="d-card-title">Timelapse &amp; Video</h2>
						<p class="d-card-sub">
							Perilaku pembuatan animasi GIF dan video MP4 setelah sesi foto selesai.
						</p>
					</div>
				</div>

				<div class="pg-list">
					<label class="pg-row is-clickable">
						<span class="pg-row-copy">
							<span class="pg-row-label">Auto-generate Timelapse</span>
							<span class="pg-row-hint"
								>Langsung merender GIF/video otomatis tanpa tombol manual.</span
							>
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
							<span class="pg-row-hint">Buat file MP4 selain GIF untuk diunduh di HP tamu.</span>
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
							<span class="pg-row-hint">Peralihan antar bingkai animasi.</span>
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
			</div>
		</div>
	{/if}

	<!-- TAB 3: Printer & Cetak -->
	{#if activeTab === 'printer'}
		<div
			id="panel-printer"
			role="tabpanel"
			aria-labelledby="tab-printer"
			class="pg-panel pg-two-col"
		>
			<!-- Kartu Perangkat Printer -->
			<div class="d-card pg-card">
				<div class="d-card-head">
					<div>
						<h2 class="d-card-title">Perangkat Printer</h2>
						<p class="d-card-sub">
							Pilih mode cetak dan deteksi printer yang terpasang di Windows.
						</p>
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

				<div class="pg-list">
					<div class="pg-row">
						<div class="pg-row-copy">
							<span class="pg-row-label">Mode Cetak</span>
							<span class="pg-row-hint">
								Cetak langsung mengirim foto tanpa membuka dialog browser.
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
						<div class="pg-row-copy">
							<span class="pg-row-label">Printer Windows</span>
							<span class="pg-row-hint">
								{#if !printersSupported}
									Deteksi printer langsung hanya tersedia di Windows.
								{:else if printers.length > 0}
									{printers.length} printer terdeteksi pada perangkat ini.
								{:else}
									Belum ada printer terdeteksi. Pastikan printer menyala lalu tekan Deteksi.
								{/if}
							</span>
						</div>

						<div class="pg-inline-bar">
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
										updatePrint({
											printerName: (e.currentTarget as HTMLInputElement).value.trim()
										})}
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

					{#if printCfg.printMode === 'direct'}
						<label class="pg-row is-clickable">
							<span class="pg-row-copy">
								<span class="pg-row-label">Fallback ke Dialog Browser</span>
								<span class="pg-row-hint">
									Buka dialog cetak otomatis jika cetak langsung gagal atau printer offline.
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
							<span class="pg-row-label">Uji Cetak 4R</span>
							<span class="pg-row-hint">
								Cetak halaman uji untuk cek koneksi, warna, dan margin kertas.
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
			</div>

			<!-- Kartu Tata Letak Kertas -->
			<div class="d-card pg-card">
				<div class="d-card-head">
					<div>
						<h2 class="d-card-title">Tata Letak &amp; Salinan</h2>
						<p class="d-card-sub">Atur skala foto, pemisahan 2-strip, dan jumlah lembar cetak.</p>
					</div>
				</div>

				<div class="pg-list">
					<div class="pg-row">
						<div class="pg-row-copy">
							<span class="pg-row-label">Mode Layout</span>
							<span class="pg-row-hint">
								Fit menjaga foto utuh, Fill mengisi kertas, Stretch meregangkan penuh.
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
								Satu lembar utuh atau gandakan 2 strip berdampingan di satu kertas.
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
							<span class="pg-row-hint">Lembar dicetak otomatis saat cetak langsung.</span>
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
								Sesuaikan potret/lanskap gambar agar cocok dengan kertas printer.
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
				</div>
			</div>
		</div>
	{/if}

	<!-- TAB 4: Google Drive -->
	{#if activeTab === 'cloud'}
		<div id="panel-cloud" role="tabpanel" aria-labelledby="tab-cloud" class="pg-panel">
			<!-- Status Bar Ringkas -->
			<div class="d-card pg-cloud-banner">
				<div class="pg-cloud-banner-copy">
					<div class="pg-cloud-banner-top">
						<span class="pg-row-label">Status Koneksi Google Drive</span>
						<span
							class="pg-status-pill"
							class:is-ok={cloud.connected && !cloud.needsReconnect}
							class:is-warn={(!cloud.connected && cloud.configured) || loadingCloud}
							class:is-err={cloud.needsReconnect || (!cloud.connected && !cloud.configured)}
						>
							<span class="pg-status-dot" aria-hidden="true"></span>
							{#if cloud.connected && cloud.needsReconnect}
								Perlu Hubungkan Ulang
							{:else if cloud.connected}
								Terhubung
							{:else if cloud.configured}
								Siap Dihubungkan
							{:else}
								Belum Terhubung
							{/if}
						</span>
					</div>
					<p class="pg-row-hint">
						{#if loadingCloud}
							Memeriksa status integrasi cloud...
						{:else if cloud.connected && cloud.needsReconnect}
							Token akses kedaluwarsa. Klik Hubungkan Ulang untuk menyegarkan izin Google Drive.
						{:else if cloud.connected}
							Terhubung ke <strong>{cloud.email || 'akun Google Drive'}</strong> · Folder root:
							<strong>{cloud.rootFolderName}</strong>
						{:else if cloud.configured}
							Kredensial OAuth sudah tersimpan. Klik <strong>Hubungkan Google Drive</strong> untuk otorisasi
							akun Gmail Anda.
						{:else}
							Tempel <strong>Client ID</strong> dan <strong>Client Secret</strong> di kartu Kredensial
							OAuth, lalu simpan dan hubungkan.
						{/if}
					</p>
					{#if cloudError}
						<span class="pg-feedback is-err" role="alert">{cloudError}</span>
					{:else if cloudNotice}
						<span class="pg-feedback is-ok" role="status">{cloudNotice}</span>
					{/if}
				</div>

				<div class="pg-cloud-actions">
					{#if cloud.configured && (!cloud.connected || cloud.needsReconnect)}
						<a href="/api/cloud/google/auth" class="pg-btn is-primary pg-link-btn">
							<Cloud size={14} />
							{cloud.needsReconnect ? 'Hubungkan Ulang' : 'Hubungkan Google Drive'}
						</a>
					{/if}

					{#if cloud.connected && !cloud.needsReconnect}
						<button
							type="button"
							class="pg-btn is-primary"
							disabled={syncingCloud}
							onclick={triggerSyncAll}
						>
							<Upload size={13} />
							{syncingCloud ? 'Menyinkronkan...' : 'Sinkronkan Semua Sesi'}
						</button>

						{#if cloud.rootFolderId}
							<a
								href={`https://drive.google.com/drive/folders/${cloud.rootFolderId}`}
								target="_blank"
								rel="noopener noreferrer"
								class="pg-btn pg-link-btn"
							>
								<ExternalLink size={13} />
								Buka Drive
							</a>
						{/if}

						{#if confirmDisconnect}
							<div class="pg-confirm-bar" role="group" aria-label="Konfirmasi putus koneksi">
								<span>Putuskan?</span>
								<button
									type="button"
									class="pg-sm-btn is-primary"
									disabled={savingCloud}
									onclick={disconnectGoogleDrive}
								>
									Ya
								</button>
								<button type="button" class="pg-sm-btn" onclick={() => (confirmDisconnect = false)}>
									Batal
								</button>
							</div>
						{:else}
							<button
								type="button"
								class="pg-btn"
								disabled={savingCloud}
								onclick={() => (confirmDisconnect = true)}
							>
								Putuskan
							</button>
						{/if}
					{/if}
				</div>
			</div>

			<!-- 2 Kartu Sejajar: Kredensial OAuth + Preferensi Sync -->
			<div class="pg-two-col">
				<!-- Kiri: Kredensial OAuth -->
				<form class="d-card pg-card" onsubmit={saveCloudCredentials}>
					<div class="d-card-head">
						<div>
							<h2 class="d-card-title">Kredensial OAuth 2.0</h2>
							<p class="d-card-sub">
								Disimpan di SQLite lokal. Client Secret tidak pernah dikirim ulang ke browser.
							</p>
						</div>
					</div>

					<div class="pg-form-body">
						<label class="pg-field">
							<span class="pg-field-label">Client ID</span>
							<input
								type="text"
								class="pg-input"
								placeholder="xxxx.apps.googleusercontent.com"
								bind:value={draftClientId}
								autocomplete="off"
							/>
						</label>

						<label class="pg-field">
							<span class="pg-field-label">
								Client Secret
								{#if cloud.hasClientSecret}
									<span class="pg-saved-tag">Sudah tersimpan</span>
								{/if}
							</span>
							<div class="pg-inline-bar">
								<input
									type={showSecret ? 'text' : 'password'}
									class="pg-input"
									placeholder={cloud.hasClientSecret
										? 'Kosongkan jika tidak ingin mengganti'
										: 'GOCSPX-...'}
									bind:value={draftClientSecret}
									autocomplete="new-password"
								/>
								<button
									type="button"
									class="pg-btn pg-icon-only"
									aria-label={showSecret ? 'Sembunyikan secret' : 'Tampilkan secret'}
									onclick={() => (showSecret = !showSecret)}
								>
									{#if showSecret}
										<EyeOff size={14} />
									{:else}
										<Eye size={14} />
									{/if}
								</button>
							</div>
						</label>

						<label class="pg-field">
							<span class="pg-field-label">Nama Folder Root di Drive</span>
							<input
								type="text"
								class="pg-input"
								placeholder="DISTUDIO Photobooth"
								bind:value={draftRootFolder}
							/>
						</label>

						<label class="pg-field">
							<span class="pg-field-label">URL Publik Galeri (Opsional, HTTPS / Tunnel)</span>
							<input
								type="url"
								class="pg-input"
								placeholder="https://booth.domainkamu.com (kosongkan untuk IP lokal)"
								bind:value={draftPublicBaseUrl}
								autocomplete="off"
							/>
						</label>

						<div class="pg-field">
							<span class="pg-field-label">Authorized Redirect URI (untuk Google Console)</span>
							<div class="pg-inline-bar">
								<input type="text" class="pg-input" value={redirectUri} readonly />
								<button type="button" class="pg-btn" onclick={copyRedirectUri}>
									{#if copiedRedirect}
										<Check size={13} />
										Tersalin
									{:else}
										<Copy size={13} />
										Salin
									{/if}
								</button>
							</div>
						</div>

						<div class="pg-form-foot">
							<button
								type="submit"
								class="pg-btn is-primary"
								disabled={savingCloud || loadingCloud}
							>
								<Check size={13} />
								{savingCloud ? 'Menyimpan...' : 'Simpan Konfigurasi'}
							</button>
						</div>
					</div>
				</form>

				<!-- Kanan: Preferensi Sync & Struktur Folder -->
				<div class="d-card pg-card">
					<div class="d-card-head">
						<div>
							<h2 class="d-card-title">Preferensi Sinkronisasi</h2>
							<p class="d-card-sub">Atur jenis berkas dan perilaku unggah otomatis ke Drive.</p>
						</div>
					</div>

					<div class="pg-list">
						<div class="pg-row is-stack">
							<div class="pg-row-copy">
								<span class="pg-row-label">Mode QR Tamu</span>
								<span class="pg-row-hint">
									<strong>Smart</strong> langsung ke folder Drive (kuota HP),
									<strong>Galeri Web + Drive</strong> buka galeri interaktif beserta tombol Drive,
									<strong>Wi-Fi Lokal</strong> khusus jaringan lokal.
								</span>
							</div>
							<div class="pg-seg" role="group" aria-label="Mode QR tamu">
								<button
									type="button"
									class="pg-seg-btn"
									class:is-active={cloud.qrMode === 'smart'}
									aria-pressed={cloud.qrMode === 'smart'}
									disabled={loadingCloud}
									onclick={() => updateCloudPrefs({ qrMode: 'smart' })}
								>
									Smart (Drive)
								</button>
								<button
									type="button"
									class="pg-seg-btn"
									class:is-active={cloud.qrMode === 'gallery'}
									aria-pressed={cloud.qrMode === 'gallery'}
									disabled={loadingCloud}
									onclick={() => updateCloudPrefs({ qrMode: 'gallery' })}
								>
									Galeri Web + Drive
								</button>
								<button
									type="button"
									class="pg-seg-btn"
									class:is-active={cloud.qrMode === 'local'}
									aria-pressed={cloud.qrMode === 'local'}
									disabled={loadingCloud}
									onclick={() => updateCloudPrefs({ qrMode: 'local' })}
								>
									Wi-Fi Lokal
								</button>
							</div>
						</div>

						<label class="pg-row is-clickable">
							<span class="pg-row-copy">
								<span class="pg-row-label">Akses Publik Folder Sesi</span>
								<span class="pg-row-hint">
									Buka izin lihat (<em>anyone with link</em>) khusus pada folder tiap sesi agar tamu
									bisa mengunduh tanpa login. Folder lain tetap privat.
								</span>
								{#if cloud.qrMode === 'smart' && !cloud.publicShare}
									<span class="pg-feedback is-warn">
										Nonaktif — QR otomatis kembali ke Wi-Fi Lokal agar tamu tidak diminta izin akses
										Google Drive.
									</span>
								{/if}
							</span>
							<input
								type="checkbox"
								class="toggle toggle-sm"
								checked={cloud.publicShare}
								disabled={loadingCloud}
								onchange={(e) =>
									updateCloudPrefs({ publicShare: (e.currentTarget as HTMLInputElement).checked })}
							/>
						</label>

						<label class="pg-row is-clickable">
							<span class="pg-row-copy">
								<span class="pg-row-label">Sinkronisasi Otomatis</span>
								<span class="pg-row-hint">
									Langsung unggah di latar belakang setelah sesi selesai tanpa menunda cetak.
								</span>
							</span>
							<input
								type="checkbox"
								class="toggle toggle-sm"
								checked={cloud.autoSync}
								disabled={loadingCloud}
								onchange={(e) =>
									updateCloudPrefs({ autoSync: (e.currentTarget as HTMLInputElement).checked })}
							/>
						</label>

						<div class="pg-row is-stack">
							<div class="pg-row-copy">
								<span class="pg-row-label">Jenis Berkas yang Diunggah</span>
								<span class="pg-row-hint">
									Pilih aset tiap sesi yang ikut dicadangkan ke folder Drive.
								</span>
							</div>
							<div class="pg-chips" role="group" aria-label="Jenis berkas cloud sync">
								<button
									type="button"
									class="pg-chip"
									class:is-active={cloud.uploadTypes.strip}
									aria-pressed={cloud.uploadTypes.strip}
									onclick={() =>
										updateCloudPrefs({ uploadTypes: { strip: !cloud.uploadTypes.strip } })}
								>
									Photo Strip
								</button>
								<button
									type="button"
									class="pg-chip"
									class:is-active={cloud.uploadTypes.photos}
									aria-pressed={cloud.uploadTypes.photos}
									onclick={() =>
										updateCloudPrefs({ uploadTypes: { photos: !cloud.uploadTypes.photos } })}
								>
									Foto Satuan
								</button>
								<button
									type="button"
									class="pg-chip"
									class:is-active={cloud.uploadTypes.gif}
									aria-pressed={cloud.uploadTypes.gif}
									onclick={() => updateCloudPrefs({ uploadTypes: { gif: !cloud.uploadTypes.gif } })}
								>
									Animasi GIF
								</button>
								<button
									type="button"
									class="pg-chip"
									class:is-active={cloud.uploadTypes.video}
									aria-pressed={cloud.uploadTypes.video}
									onclick={() =>
										updateCloudPrefs({ uploadTypes: { video: !cloud.uploadTypes.video } })}
								>
									Video MP4
								</button>
							</div>
						</div>

						<div class="pg-row is-stack">
							<div class="pg-row-copy">
								<span class="pg-row-label">Struktur Folder Otomatis</span>
								<span class="pg-row-hint">
									Setiap sesi disusun rapi menjadi
									<strong>{cloud.rootFolderName} / Tanggal / sesi-ID</strong>. Jika unggahan
									terputus di tengah jalan, percobaan ulang akan melewati berkas yang sudah berhasil
									tanpa membuat duplikat.
								</span>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	{/if}
</div>

<style>
	.pg-page {
		display: flex;
		flex-direction: column;
		gap: 18px;
	}

	/* ── Header ── */
	.pg-head {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		justify-content: space-between;
		gap: 12px 18px;
	}

	.pg-head-copy {
		min-width: 0;
		flex: 1 1 260px;
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
		padding: 0 11px;
		border-radius: 999px;
		background: var(--d-ok-soft);
		color: var(--d-ok);
		font-size: 0.72rem;
		font-weight: 700;
	}

	/* ── Tab Bar (daisyUI tabs-box tuned to Dashboard palette) ── */
	.pg-tabs {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
		padding: 5px;
		border: 1px solid var(--d-border);
		border-radius: 13px;
		background: var(--d-surface);
		width: fit-content;
		max-width: 100%;
	}

	.pg-tab {
		display: inline-flex;
		align-items: center;
		gap: 7px;
		height: 36px;
		padding: 0 14px;
		border-radius: 9px;
		border: none;
		background: transparent;
		color: var(--d-muted);
		font-family: var(--font-body);
		font-size: 0.78rem;
		font-weight: 700;
		white-space: nowrap;
		cursor: pointer;
		transition:
			background-color 140ms ease,
			color 140ms ease;
	}

	.pg-tab:hover:not(.tab-active) {
		color: var(--d-ink);
		background: var(--d-surface-2);
	}

	.pg-tab.tab-active {
		background: var(--d-ink);
		color: var(--d-bg);
	}

	.pg-tab-dot {
		width: 6px;
		height: 6px;
		border-radius: 999px;
		background: var(--d-muted);
	}

	.pg-tab-dot.is-ok {
		background: var(--d-ok);
	}

	.pg-tab-dot.is-warn {
		background: var(--d-warn);
	}

	.pg-tab-dot.is-err {
		background: var(--d-err);
	}

	/* ── Panel & Grid ── */
	.pg-panel {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.pg-panel-single {
		max-width: 720px;
	}

	.pg-two-col {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 16px;
		align-items: start;
	}

	.pg-card {
		background: var(--d-surface);
	}

	.pg-card-pad {
		padding: 16px 18px 18px;
	}

	.pg-list {
		display: flex;
		flex-direction: column;
	}

	/* ── Tombol ── */
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
		font-size: 0.74rem;
		font-weight: 700;
		cursor: pointer;
		white-space: nowrap;
		transition:
			background-color 140ms ease,
			border-color 140ms ease,
			opacity 140ms ease;
	}

	.pg-btn:hover:not(:disabled) {
		background: var(--d-surface-2);
		border-color: var(--d-border-strong);
	}

	.pg-btn:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}

	.pg-btn.is-primary {
		border-color: var(--d-ink);
		background: var(--d-ink);
		color: var(--d-bg);
	}

	.pg-btn.is-primary:hover:not(:disabled) {
		opacity: 0.88;
		background: var(--d-ink);
	}

	.pg-icon-only {
		width: 34px;
		padding: 0;
		flex-shrink: 0;
	}

	.pg-link-btn {
		text-decoration: none;
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
		font-size: 0.72rem;
		font-weight: 600;
		color: var(--d-ink);
	}

	.pg-sm-btn {
		height: 24px;
		padding: 0 9px;
		border: 1px solid var(--d-border);
		border-radius: 6px;
		background: var(--d-surface);
		color: var(--d-ink);
		font-family: var(--font-body);
		font-size: 0.7rem;
		font-weight: 700;
		cursor: pointer;
	}

	.pg-sm-btn.is-primary {
		border-color: var(--d-ink);
		background: var(--d-ink);
		color: var(--d-bg);
	}

	/* ── Kartu Tema ── */
	.pg-theme-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 12px;
	}

	.pg-theme-card {
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding: 11px;
		border: 1px solid var(--d-border);
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
		background: var(--d-surface);
	}

	.pg-theme-mock {
		position: relative;
		height: 76px;
		border-radius: 8px;
		padding: 9px;
		display: flex;
		flex-direction: column;
		gap: 7px;
		overflow: hidden;
		border: 1px solid var(--d-border);
	}

	.pg-theme-mock.is-light {
		background: #f8fafc;
	}

	.pg-theme-mock.is-light .mock-bar {
		height: 8px;
		width: 48%;
		border-radius: 99px;
		background: #cbd5e1;
	}

	.pg-theme-mock.is-light .mock-box {
		flex: 1;
		border-radius: 6px;
		background: #ffffff;
		border: 1px solid #e2e8f0;
	}

	.pg-theme-mock.is-light .mock-icon {
		color: #0f172a;
	}

	.pg-theme-mock.is-dark {
		background: #0b0a09;
	}

	.pg-theme-mock.is-dark .mock-bar {
		height: 8px;
		width: 48%;
		border-radius: 99px;
		background: #2c2824;
	}

	.pg-theme-mock.is-dark .mock-box {
		flex: 1;
		border-radius: 6px;
		background: #141210;
		border: 1px solid rgba(251, 247, 240, 0.12);
	}

	.pg-theme-mock.is-dark .mock-icon {
		color: #fbf7f0;
	}

	.mock-icon {
		position: absolute;
		right: 9px;
		top: 8px;
		display: inline-grid;
		place-items: center;
	}

	.pg-theme-foot {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
	}

	.pg-theme-foot strong {
		display: block;
		font-size: 0.8rem;
		font-weight: 700;
		color: var(--d-ink);
	}

	.pg-theme-foot span {
		display: block;
		font-size: 0.71rem;
		color: var(--d-muted);
	}

	.pg-check-dot {
		width: 22px;
		height: 22px;
		border-radius: 999px;
		background: var(--d-ink);
		color: var(--d-bg);
		display: inline-grid;
		place-items: center;
		flex-shrink: 0;
	}

	/* ── Baris Pengaturan ── */
	.pg-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 10px 14px;
		padding: 13px 18px;
		border-top: 1px solid var(--d-border);
	}

	.pg-row:first-child {
		border-top: none;
	}

	.pg-row.is-stack {
		flex-direction: column;
		align-items: stretch;
		gap: 9px;
	}

	.pg-row.is-clickable {
		cursor: pointer;
	}

	.pg-row.is-clickable:hover {
		background: var(--d-surface-hover);
	}

	.pg-row-copy {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
		flex: 1 1 180px;
	}

	.pg-row-label {
		font-size: 0.81rem;
		font-weight: 700;
		color: var(--d-ink);
	}

	.pg-row-hint {
		margin: 0;
		font-size: 0.72rem;
		line-height: 1.45;
		color: var(--d-muted);
	}

	/* ── Segmented & Chips ── */
	.pg-seg {
		display: inline-flex;
		flex-wrap: wrap;
		gap: 2px;
		padding: 3px;
		border: 1px solid var(--d-border);
		border-radius: 9px;
		background: var(--d-bg);
	}

	.pg-seg-btn {
		height: 27px;
		padding: 0 10px;
		border: none;
		border-radius: 6px;
		background: transparent;
		color: var(--d-muted);
		font-family: var(--font-body);
		font-size: 0.72rem;
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
		min-width: 44px;
		padding: 0 11px;
		border: 1px solid var(--d-border);
		border-radius: 8px;
		background: var(--d-bg);
		color: var(--d-muted);
		font-family: var(--font-body);
		font-size: 0.72rem;
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

	/* ── Form & Input ── */
	.pg-inline-bar {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.pg-select,
	.pg-input {
		flex: 1 1 180px;
		min-width: 0;
		width: 100%;
		height: 34px;
		padding: 0 11px;
		border: 1px solid var(--d-border);
		border-radius: 9px;
		background: var(--d-bg);
		color: var(--d-ink);
		font-family: var(--font-body);
		font-size: 0.77rem;
		font-weight: 600;
		outline: none;
	}

	.pg-select:focus,
	.pg-input:focus {
		border-color: var(--d-ink);
	}

	.pg-form-body {
		display: flex;
		flex-direction: column;
		gap: 12px;
		padding: 15px 18px 18px;
	}

	.pg-field {
		display: flex;
		flex-direction: column;
		gap: 5px;
		min-width: 0;
	}

	.pg-field-label {
		display: flex;
		align-items: center;
		gap: 7px;
		font-size: 0.73rem;
		font-weight: 700;
		color: var(--d-muted);
	}

	.pg-saved-tag {
		padding: 1px 7px;
		border-radius: 999px;
		background: var(--d-ok-soft);
		color: var(--d-ok);
		font-size: 0.66rem;
		font-weight: 700;
	}

	.pg-form-foot {
		padding-top: 2px;
		display: flex;
		align-items: center;
		gap: 8px;
	}

	/* ── Cloud Banner & Status ── */
	.pg-cloud-banner {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 12px 18px;
		padding: 15px 18px;
	}

	.pg-cloud-banner-copy {
		display: flex;
		flex-direction: column;
		gap: 4px;
		min-width: 0;
		flex: 1 1 280px;
	}

	.pg-cloud-banner-top {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
	}

	.pg-cloud-actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
	}

	.pg-status-pill {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		height: 23px;
		padding: 0 9px;
		border-radius: 999px;
		font-size: 0.68rem;
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
		margin-top: 2px;
		font-size: 0.73rem;
		font-weight: 600;
		line-height: 1.4;
	}

	.pg-feedback.is-ok {
		color: var(--d-ok);
	}

	.pg-feedback.is-warn {
		color: var(--d-warn);
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

	@media (max-width: 960px) {
		.pg-two-col {
			grid-template-columns: minmax(0, 1fr);
		}
	}

	@media (max-width: 560px) {
		.pg-tabs {
			width: 100%;
		}

		.pg-tab {
			flex: 1 1 auto;
			justify-content: center;
		}

		.pg-theme-grid {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
