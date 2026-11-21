<script lang="ts">
	import { session, setCameraSettings, setTheme } from '#lib/stores/session';
	import type {
		CameraFilter,
		FlashMode,
		GridOverlay,
		TimelapseSpeedMul,
		TimerDuration
	} from '#lib/types';

	const timerOptions: { value: TimerDuration; label: string }[] = [
		{ value: 0, label: 'Tanpa timer' },
		{ value: 3, label: '3 detik' },
		{ value: 5, label: '5 detik' },
		{ value: 10, label: '10 detik' }
	];
	const flashOptions: { value: FlashMode; label: string }[] = [
		{ value: 'off', label: 'Mati' },
		{ value: 'on', label: 'Nyala' },
		{ value: 'auto', label: 'Otomatis' }
	];
	const filterOptions: { value: CameraFilter; label: string }[] = [
		{ value: 'none', label: 'Normal' },
		{ value: 'grayscale', label: 'Grayscale' },
		{ value: 'sepia', label: 'Sepia' },
		{ value: 'high-contrast', label: 'Kontras tinggi' },
		{ value: 'warm', label: 'Hangat' },
		{ value: 'cool', label: 'Dingin' }
	];
	const gridOptions: { value: GridOverlay; label: string }[] = [
		{ value: 'none', label: 'Tanpa grid' },
		{ value: 'thirds', label: 'Rule of thirds' }
	];
	const speedOptions: TimelapseSpeedMul[] = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

	const cs = $derived($session.cameraSettings);
	const tl = $derived(cs.timelapse);

	function pickTheme(theme: 'dark' | 'light'): void {
		setTheme(theme);
	}
</script>

<div class="dash-page">
	<header class="dash-head">
		<p class="eyebrow font-mono">ADMIN · SETTING</p>
		<h1 class="dash-title font-display">Setting</h1>
		<p class="dash-sub">
			Pengaturan operasional kiosk. Tema disimpan di <code>distudio-theme</code>; pengaturan kamera
			&amp; timelapse disimpan di <code>distudio-camera-settings</code> (localStorage perangkat ini),
			dipakai oleh layar kamera/timelapse.
		</p>
	</header>

	<section class="panel" aria-label="Tema kiosk">
		<div class="panel-head"><h2 class="section-title font-mono">TEMA KIOSK</h2></div>
		<div class="panel-body">
			<div class="setting-row">
				<div>
					<p class="setting-name">Mode tampilan</p>
					<p class="setting-desc">
						Aktif: <strong>{$session.theme === 'dark' ? 'Gelap' : 'Terang'}</strong>
					</p>
				</div>
				<div class="row-actions" role="group" aria-label="Pilih tema">
					<button
						type="button"
						class="btn btn-sm {$session.theme === 'light' ? 'btn-primary' : 'btn-outline'}"
						onclick={() => pickTheme('light')}
						aria-pressed={$session.theme === 'light'}
					>
						Terang
					</button>
					<button
						type="button"
						class="btn btn-sm {$session.theme === 'dark' ? 'btn-primary' : 'btn-outline'}"
						onclick={() => pickTheme('dark')}
						aria-pressed={$session.theme === 'dark'}
					>
						Gelap
					</button>
				</div>
			</div>
		</div>
	</section>

	<section class="panel" aria-label="Default kamera">
		<div class="panel-head"><h2 class="section-title font-mono">DEFAULT KAMERA</h2></div>
		<div class="panel-body form-grid">
			<label class="field">
				<span class="label font-mono">TIMER CAPTURE</span>
				<select
					class="select-bordered select select-sm"
					value={cs.timer}
					onchange={(e) =>
						setCameraSettings({ timer: Number(e.currentTarget.value) as TimerDuration })}
				>
					{#each timerOptions as opt}<option value={opt.value}>{opt.label}</option>{/each}
				</select>
			</label>

			<label class="field">
				<span class="label font-mono">FLASH</span>
				<select
					class="select-bordered select select-sm"
					value={cs.flash}
					onchange={(e) => setCameraSettings({ flash: e.currentTarget.value as FlashMode })}
				>
					{#each flashOptions as opt}<option value={opt.value}>{opt.label}</option>{/each}
				</select>
			</label>

			<label class="field">
				<span class="label font-mono">FILTER KAMERA</span>
				<select
					class="select-bordered select select-sm"
					value={cs.filter}
					onchange={(e) => setCameraSettings({ filter: e.currentTarget.value as CameraFilter })}
				>
					{#each filterOptions as opt}<option value={opt.value}>{opt.label}</option>{/each}
				</select>
			</label>

			<label class="field">
				<span class="label font-mono">GRID</span>
				<select
					class="select-bordered select select-sm"
					value={cs.grid}
					onchange={(e) => setCameraSettings({ grid: e.currentTarget.value as GridOverlay })}
				>
					{#each gridOptions as opt}<option value={opt.value}>{opt.label}</option>{/each}
				</select>
			</label>
		</div>
	</section>

	<section class="panel" aria-label="Default timelapse">
		<div class="panel-head"><h2 class="section-title font-mono">DEFAULT TIMELAPSE</h2></div>
		<div class="panel-body form-grid">
			<label class="toggle-field">
				<input
					type="checkbox"
					class="checkbox checkbox-sm"
					checked={tl.auto}
					onchange={(e) => setCameraSettings({ timelapse: { auto: e.currentTarget.checked } })}
				/>
				<span>
					<span class="setting-name">Auto-generate</span>
					<span class="setting-desc"
						>Buat timelapse otomatis saat pengaturan/foto siap (halaman timelapse).</span
					>
				</span>
			</label>

			<label class="field">
				<span class="label font-mono">KECEPATAN</span>
				<select
					class="select-bordered select select-sm"
					value={tl.speedMul}
					onchange={(e) =>
						setCameraSettings({
							timelapse: { speedMul: Number(e.currentTarget.value) as TimelapseSpeedMul }
						})}
				>
					{#each speedOptions as s}<option value={s}>{s}×</option>{/each}
				</select>
			</label>

			<label class="field">
				<span class="label font-mono">TRANSISI</span>
				<select
					class="select-bordered select select-sm"
					value={tl.transition}
					onchange={(e) =>
						setCameraSettings({
							timelapse: { transition: e.currentTarget.value as 'none' | 'crossfade' }
						})}
				>
					<option value="none">Tanpa transisi</option>
					<option value="crossfade">Crossfade</option>
				</select>
			</label>

			<label class="toggle-field">
				<input
					type="checkbox"
					class="checkbox checkbox-sm"
					checked={tl.makeVideo}
					onchange={(e) => setCameraSettings({ timelapse: { makeVideo: e.currentTarget.checked } })}
				/>
				<span>
					<span class="setting-name">Buat video MP4</span>
					<span class="setting-desc">Selain GIF, hasilkan MP4 (jika pipeline mendukung).</span>
				</span>
			</label>
		</div>
	</section>

	<section class="panel" aria-label="Catatan">
		<div class="panel-body">
			<p class="panel-note">
				Preferensi cetak (printer) dan konfigurasi lanjutan yang belum memiliki penyimpanan
				persisten diatur melalui alur/halaman terkait; halaman ini hanya mengubah setelan yang <strong
					>sudah</strong
				>
				didukung dan tersimpan lokal.
			</p>
			<div class="row-actions">
				<a class="btn btn-outline btn-sm" href="/dashboard">Kembali ke Dashboard</a>
			</div>
		</div>
	</section>
</div>

<style>
	.dash-page {
		display: flex;
		flex-direction: column;
		gap: 18px;
	}
	.dash-head .eyebrow {
		margin: 0;
		font-size: 0.66rem;
		font-weight: 700;
		letter-spacing: 0.22em;
		text-transform: uppercase;
		opacity: 0.6;
	}
	.dash-title {
		margin: 6px 0 0;
		font-size: 2rem;
		line-height: 1.1;
	}
	.dash-sub {
		margin: 8px 0 0;
		max-width: 78ch;
		font-size: 0.85rem;
		line-height: 1.55;
		opacity: 0.75;
	}
	.panel {
		border: 1px solid var(--color-base-300, #d6d3d1);
		border-radius: var(--radius-box, 12px);
		background: var(--color-base-200, #f5f5f4);
		overflow: hidden;
	}
	.panel-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		padding: 12px 14px;
		border-bottom: 1px solid var(--color-base-300, #d6d3d1);
	}
	.panel-body {
		padding: 14px 18px;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.section-title {
		margin: 0;
		font-size: 0.66rem;
		font-weight: 700;
		letter-spacing: 0.22em;
		opacity: 0.6;
	}
	.setting-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
	}
	.setting-name {
		display: block;
		margin: 0;
		font-size: 0.92rem;
		font-weight: 700;
	}
	.setting-desc {
		display: block;
		margin: 4px 0 0;
		font-size: 0.78rem;
		line-height: 1.45;
		opacity: 0.7;
	}
	.row-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.form-grid {
		display: grid;
		gap: 12px;
		grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
		align-items: start;
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.label {
		font-size: 0.62rem;
		font-weight: 700;
		letter-spacing: 0.14em;
		opacity: 0.65;
	}
	.toggle-field {
		display: flex;
		align-items: flex-start;
		gap: 10px;
		padding: 10px 12px;
		border: 1px solid var(--color-base-300, #d6d3d1);
		border-radius: 10px;
		background: var(--color-base-100, #fff);
		cursor: pointer;
	}
	.panel-note {
		margin: 0;
		font-size: 0.85rem;
		line-height: 1.5;
		opacity: 0.8;
	}
	code {
		font-size: 0.92em;
	}
</style>
