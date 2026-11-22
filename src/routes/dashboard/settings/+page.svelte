<script lang="ts">
	import { onDestroy } from 'svelte';
	import { session, setTheme, setCameraSettings } from '#lib/stores/session';
	import type {
		CameraFilter,
		FlashMode,
		GridOverlay,
		TimelapseSpeedMul,
		TimerDuration
	} from '#lib/types';
	import { Sun, Moon, Camera, Film, Check } from '@lucide/svelte';

	const TIMER_OPTS: TimerDuration[] = [0, 3, 5, 10];
	const FLASH_OPTS: { v: FlashMode; l: string }[] = [
		{ v: 'off', l: 'Mati' },
		{ v: 'on', l: 'Selalu Aktif' },
		{ v: 'auto', l: 'Otomatis' }
	];
	const FILTER_OPTS: { v: CameraFilter; l: string }[] = [
		{ v: 'none', l: 'Normal' },
		{ v: 'grayscale', l: 'Hitam Putih' },
		{ v: 'sepia', l: 'Sepia' },
		{ v: 'high-contrast', l: 'Kontras Tinggi' },
		{ v: 'warm', l: 'Hangat' },
		{ v: 'cool', l: 'Dingin' }
	];
	const GRID_OPTS: { v: GridOverlay; l: string }[] = [
		{ v: 'none', l: 'Tanpa Grid' },
		{ v: 'thirds', l: 'Rule of Thirds (3×3)' }
	];
	const SPEED_OPTS: TimelapseSpeedMul[] = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

	let savedFlash = $state(false);
	let savedTimer: ReturnType<typeof setTimeout> | null = null;

	const theme = $derived($session.theme);
	const cam = $derived($session.cameraSettings);
	const tl = $derived(cam.timelapse);

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

	onDestroy(() => {
		if (savedTimer) clearTimeout(savedTimer);
	});
</script>

<div class="d-page">
	<header class="d-head">
		<div>
			<p class="d-eyebrow">KONFIGURASI PERANGKAT</p>
			<h1 class="d-title">Pengaturan</h1>
			<p class="d-sub">
				Semua perubahan disimpan otomatis ke penyimpanan lokal browser perangkat ini.
			</p>
		</div>
		<div class="d-actions">
			{#if savedFlash}
				<span class="d-pill d-pill-ok">
					<Check size={13} />
					Tersimpan
				</span>
			{/if}
		</div>
	</header>

	<!-- 1. Tema Tampilan -->
	<section class="d-card" aria-labelledby="set-theme-title">
		<div class="d-card-head">
			<div>
				<h2 id="set-theme-title" class="d-card-title">Tema Tampilan Aplikasi &amp; Admin</h2>
				<p class="d-card-sub">Pilih nuansa terang atau gelap sebagai default perangkat.</p>
			</div>
		</div>
		<div class="d-card-body">
			<div class="theme-grid">
				<button
					type="button"
					class="theme-card"
					class:is-active={theme === 'light'}
					aria-pressed={theme === 'light'}
					onclick={() => updateTheme('light')}
				>
					<span class="theme-preview is-light" aria-hidden="true">
						<Sun size={20} />
					</span>
					<span class="theme-copy">
						<strong>Mode Terang</strong>
						<span>Bersih, cerah, kontras tinta gelap.</span>
					</span>
				</button>

				<button
					type="button"
					class="theme-card"
					class:is-active={theme === 'dark'}
					aria-pressed={theme === 'dark'}
					onclick={() => updateTheme('dark')}
				>
					<span class="theme-preview is-dark" aria-hidden="true">
						<Moon size={20} />
					</span>
					<span class="theme-copy">
						<strong>Mode Gelap</strong>
						<span>Studio obsidian, nyaman di ruangan redup.</span>
					</span>
				</button>
			</div>
		</div>
	</section>

	<!-- 2. Default Kamera -->
	<section class="d-card" aria-labelledby="set-cam-title">
		<div class="d-card-head">
			<div class="head-with-icon">
				<span class="d-kpi-icon"><Camera size={16} /></span>
				<div>
					<h2 id="set-cam-title" class="d-card-title">Default Kamera</h2>
					<p class="d-card-sub">Nilai awal hitung mundur, flash, filter live, dan garis bantu.</p>
				</div>
			</div>
		</div>
		<div class="d-card-body">
			<div class="d-form-grid">
				<label class="d-field">
					<span class="d-field-label">Timer Hitung Mundur</span>
					<select
						class="d-select"
						value={cam.timer}
						onchange={(e) =>
							updateCam({
								timer: Number((e.currentTarget as HTMLSelectElement).value) as TimerDuration
							})}
					>
						{#each TIMER_OPTS as t (t)}
							<option value={t}>{t === 0 ? 'Instan (0 detik)' : `${t} detik`}</option>
						{/each}
					</select>
				</label>

				<label class="d-field">
					<span class="d-field-label">Mode Flash Layar</span>
					<select
						class="d-select"
						value={cam.flash}
						onchange={(e) =>
							updateCam({ flash: (e.currentTarget as HTMLSelectElement).value as FlashMode })}
					>
						{#each FLASH_OPTS as f (f.v)}
							<option value={f.v}>{f.l}</option>
						{/each}
					</select>
				</label>

				<label class="d-field">
					<span class="d-field-label">Filter Live Kamera</span>
					<select
						class="d-select"
						value={cam.filter}
						onchange={(e) =>
							updateCam({ filter: (e.currentTarget as HTMLSelectElement).value as CameraFilter })}
					>
						{#each FILTER_OPTS as f (f.v)}
							<option value={f.v}>{f.l}</option>
						{/each}
					</select>
				</label>

				<label class="d-field">
					<span class="d-field-label">Grid Komposisi</span>
					<select
						class="d-select"
						value={cam.grid}
						onchange={(e) =>
							updateCam({ grid: (e.currentTarget as HTMLSelectElement).value as GridOverlay })}
					>
						{#each GRID_OPTS as g (g.v)}
							<option value={g.v}>{g.l}</option>
						{/each}
					</select>
				</label>
			</div>
		</div>
	</section>

	<!-- 3. Default Timelapse -->
	<section class="d-card" aria-labelledby="set-tl-title">
		<div class="d-card-head">
			<div class="head-with-icon">
				<span class="d-kpi-icon"><Film size={16} /></span>
				<div>
					<h2 id="set-tl-title" class="d-card-title">Default Timelapse</h2>
					<p class="d-card-sub">Pengaturan otomatis saat tamu masuk ke tahap timelapse.</p>
				</div>
			</div>
		</div>
		<div class="d-card-body tl-stack">
			<div class="switch-grid">
				<label class="d-switch-row">
					<span class="d-switch-meta">
						<span class="d-switch-title">Auto-generate Timelapse</span>
						<span class="d-switch-hint"
							>Langsung merender GIF/video tanpa menekan tombol manual.</span
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

				<label class="d-switch-row">
					<span class="d-switch-meta">
						<span class="d-switch-title">Buat Video MP4</span>
						<span class="d-switch-hint">Sertakan video MP4 selain animasi GIF untuk galeri HP.</span
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
			</div>

			<div class="d-form-grid">
				<div class="d-field">
					<span class="d-field-label">Kecepatan Putar Default</span>
					<div class="speed-pills" role="group" aria-label="Kecepatan timelapse">
						{#each SPEED_OPTS as s (s)}
							<button
								type="button"
								class="speed-pill"
								class:is-active={tl.speedMul === s}
								aria-pressed={tl.speedMul === s}
								onclick={() => updateCam({ timelapse: { ...tl, speedMul: s } })}
							>
								{s}×
							</button>
						{/each}
					</div>
				</div>

				<div class="d-field">
					<span class="d-field-label">Transisi Antar Foto</span>
					<div class="d-tabs" role="group" aria-label="Transisi timelapse">
						<button
							type="button"
							class="d-tab"
							class:is-active={tl.transition === 'none'}
							aria-pressed={tl.transition === 'none'}
							onclick={() => updateCam({ timelapse: { ...tl, transition: 'none' } })}
						>
							Tanpa Transisi
						</button>
						<button
							type="button"
							class="d-tab"
							class:is-active={tl.transition === 'crossfade'}
							aria-pressed={tl.transition === 'crossfade'}
							onclick={() => updateCam({ timelapse: { ...tl, transition: 'crossfade' } })}
						>
							Crossfade
						</button>
					</div>
				</div>
			</div>
		</div>
	</section>
</div>

<style>
	.head-with-icon {
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.theme-grid {
		display: grid;
		gap: 12px;
		grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
	}

	.theme-card {
		display: flex;
		align-items: center;
		gap: 14px;
		padding: 14px;
		border: 1.5px solid var(--d-border);
		border-radius: 14px;
		background: var(--d-bg);
		color: var(--d-ink);
		text-align: left;
		cursor: pointer;
		transition:
			border-color 150ms ease,
			transform 130ms ease;
	}

	.theme-card:hover {
		border-color: var(--d-border-strong);
		transform: translateY(-1px);
	}

	.theme-card.is-active {
		border-color: var(--d-ink);
		box-shadow: inset 0 0 0 1px var(--d-ink);
	}

	.theme-preview {
		width: 46px;
		height: 46px;
		border-radius: 12px;
		display: grid;
		place-items: center;
		flex-shrink: 0;
		border: 1px solid var(--d-border);
	}

	.theme-preview.is-light {
		background: #ffffff;
		color: #0f172a;
	}

	.theme-preview.is-dark {
		background: #0b0a09;
		color: #fbf7f0;
	}

	.theme-copy {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.theme-copy strong {
		font-size: 0.86rem;
		font-weight: 800;
	}

	.theme-copy span {
		font-size: 0.74rem;
		color: var(--d-muted);
	}

	.tl-stack {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.switch-grid {
		display: grid;
		gap: 10px;
		grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
	}

	.speed-pills {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}

	.speed-pill {
		min-width: 50px;
		min-height: 34px;
		padding: 0 10px;
		border: 1px solid var(--d-border-strong);
		border-radius: 10px;
		background: var(--d-bg);
		color: var(--d-ink);
		font-family: var(--font-body);
		font-size: 0.75rem;
		font-weight: 700;
		cursor: pointer;
		transition:
			background-color 140ms ease,
			color 140ms ease,
			border-color 140ms ease;
	}

	.speed-pill:hover:not(.is-active) {
		border-color: var(--d-ink);
	}

	.speed-pill.is-active {
		background: var(--d-ink);
		border-color: var(--d-ink);
		color: var(--d-bg);
	}
</style>
