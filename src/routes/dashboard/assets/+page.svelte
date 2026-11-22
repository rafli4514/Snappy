<script lang="ts">
	import { onMount } from 'svelte';
	import { BUILTIN_FORMATS } from '#lib/data/standardFormats';
	import { STICKER_ASSETS, VINTAGE_STICKER_ASSETS } from '#lib/data/stickers';
	import { PHOTO_FILTERS } from '#lib/data/filters';
	import { listFrames } from '#lib/utils/frameStorage';
	import { customFrameSizes, loadCustomFrameSizes } from '#lib/services/frameSizes';
	import {
		customStickersStore,
		customFiltersStore,
		customArStore,
		loadCustomAssets
	} from '#lib/services/customAssets';

	let loading = $state(true);
	let frameCount = $state(0);

	const customSizesCount = $derived($customFrameSizes.length);
	const customStickersCount = $derived($customStickersStore.length);
	const customFiltersCount = $derived($customFiltersStore.length);
	const customArCount = $derived($customArStore.length);
	const builtinStickerCount = STICKER_ASSETS.length + VINTAGE_STICKER_ASSETS.length;

	async function loadAll(): Promise<void> {
		loading = true;
		try {
			const [frames] = await Promise.all([
				listFrames().catch(() => []),
				loadCustomFrameSizes(true).catch(() => undefined),
				loadCustomAssets(true).catch(() => undefined)
			]);
			frameCount = frames.length;
		} finally {
			loading = false;
		}
	}

	onMount(() => {
		void loadAll();
	});
</script>

<div class="d-page">
	<header class="d-head">
		<div>
			<p class="d-eyebrow">Admin · Aset</p>
			<h1 class="d-title">Katalog Aset Kreatif</h1>
			<p class="d-sub">
				Kelola frame template strip, ukuran format cetak, stiker dekorasi, preset filter foto, dan
				aset overlay AR. Aset bawaan terkunci agar standar cetak tetap aman, sedangkan aset kustom
				dapat ditambah dan diubah kapan saja.
			</p>
		</div>
		<div class="d-actions">
			<button type="button" class="d-btn" onclick={loadAll} disabled={loading}>
				<svg
					width="14"
					height="14"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					aria-hidden="true"
				>
					<path d="M21 12a9 9 0 1 1-2.64-6.36" />
					<polyline points="21 3 21 9 15 9" />
				</svg>
				<span>{loading ? 'Memuat…' : 'Muat Ulang'}</span>
			</button>
		</div>
	</header>

	<section class="d-kpi-grid" aria-label="Ringkasan aset">
		<div class="d-kpi">
			<div class="d-kpi-top"><p class="d-kpi-label">Frame Tersimpan</p></div>
			<p class="d-kpi-val">{loading ? '—' : frameCount}</p>
			<p class="d-kpi-hint">Template strip dari Frame Studio</p>
		</div>
		<div class="d-kpi">
			<div class="d-kpi-top"><p class="d-kpi-label">Ukuran Format</p></div>
			<p class="d-kpi-val">{loading ? '—' : BUILTIN_FORMATS.length + customSizesCount}</p>
			<p class="d-kpi-hint d-num">
				{BUILTIN_FORMATS.length} bawaan · {loading ? '…' : customSizesCount} kustom
			</p>
		</div>
		<div class="d-kpi">
			<div class="d-kpi-top"><p class="d-kpi-label">Stiker & Filter Kustom</p></div>
			<p class="d-kpi-val">{loading ? '—' : customStickersCount + customFiltersCount}</p>
			<p class="d-kpi-hint d-num">
				{loading ? '…' : `${customStickersCount} stiker · ${customFiltersCount} filter`}
			</p>
		</div>
		<div class="d-kpi">
			<div class="d-kpi-top"><p class="d-kpi-label">Overlay AR</p></div>
			<p class="d-kpi-val">{loading ? '—' : customArCount}</p>
			<p class="d-kpi-hint">Aset siap integrasi tahap lanjut</p>
		</div>
	</section>

	<section class="d-hub-grid" aria-label="Daftar modul aset">
		<a class="d-hub-card" href="/dashboard/assets/frames">
			<div class="d-hub-top">
				<span class="d-hub-icon" aria-hidden="true">
					<svg
						width="18"
						height="18"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<rect x="3" y="3" width="18" height="18" rx="2" />
						<line x1="3" y1="9" x2="21" y2="9" />
						<line x1="9" y1="21" x2="9" y2="9" />
					</svg>
				</span>
				<span class="d-pill d-pill-info">Studio</span>
			</div>
			<div>
				<p class="d-hub-name">Frame Studio</p>
				<p class="d-hub-desc">
					Unggah artwork PNG/SVG/JPEG dari Canva dan deteksi lubang foto secara otomatis.
				</p>
			</div>
			<div class="card-meta d-num">
				<span class="d-pill">{loading ? '…' : frameCount} tersimpan</span>
			</div>
		</a>

		<a class="d-hub-card" href="/dashboard/assets/frame-sizes">
			<div class="d-hub-top">
				<span class="d-hub-icon" aria-hidden="true">
					<svg
						width="18"
						height="18"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<path d="M21 15V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10" />
						<path d="M16 19h6" />
						<path d="M19 16v6" />
					</svg>
				</span>
				<span class="d-pill">Katalog</span>
			</div>
			<div>
				<p class="d-hub-name">Ukuran Frame</p>
				<p class="d-hub-desc">
					Daftar ukuran kertas standar 300 DPI dan dimensi kustom untuk cetak maupun digital.
				</p>
			</div>
			<div class="card-meta d-num">
				<span class="d-pill">{BUILTIN_FORMATS.length} bawaan</span>
				<span class="d-pill d-pill-ok">{loading ? '…' : customSizesCount} kustom</span>
			</div>
		</a>

		<a class="d-hub-card" href="/dashboard/assets/stickers">
			<div class="d-hub-top">
				<span class="d-hub-icon" aria-hidden="true">
					<svg
						width="18"
						height="18"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<circle cx="12" cy="12" r="10" />
						<path d="M8 14s1.5 2 4 2 4-2 4-2" />
						<line x1="9" y1="9" x2="9.01" y2="9" />
						<line x1="15" y1="9" x2="15.01" y2="9" />
					</svg>
				</span>
				<span class="d-pill d-pill-ok">Kustom</span>
			</div>
			<div>
				<p class="d-hub-name">Stiker</p>
				<p class="d-hub-desc">
					Stiker bawaan Pixel & Vintage ditambah unggahan kustom yang tampil di editor strip.
				</p>
			</div>
			<div class="card-meta d-num">
				<span class="d-pill">{builtinStickerCount} bawaan</span>
				<span class="d-pill d-pill-ok">{loading ? '…' : customStickersCount} kustom</span>
			</div>
		</a>

		<a class="d-hub-card" href="/dashboard/assets/filters">
			<div class="d-hub-top">
				<span class="d-hub-icon" aria-hidden="true">
					<svg
						width="18"
						height="18"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<circle cx="13.5" cy="6.5" r=".5" fill="currentColor" />
						<circle cx="17.5" cy="10.5" r=".5" fill="currentColor" />
						<circle cx="8.5" cy="7.5" r=".5" fill="currentColor" />
						<circle cx="6.5" cy="12.5" r=".5" fill="currentColor" />
						<path
							d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"
						/>
					</svg>
				</span>
				<span class="d-pill d-pill-ok">Kustom</span>
			</div>
			<div>
				<p class="d-hub-name">Filter Foto</p>
				<p class="d-hub-desc">
					Preset warna bawaan dan filter CSS kustom dengan pratinjau langsung di layar editor.
				</p>
			</div>
			<div class="card-meta d-num">
				<span class="d-pill">{PHOTO_FILTERS.length} bawaan</span>
				<span class="d-pill d-pill-ok">{loading ? '…' : customFiltersCount} kustom</span>
			</div>
		</a>

		<a class="d-hub-card" href="/dashboard/assets/ar">
			<div class="d-hub-top">
				<span class="d-hub-icon" aria-hidden="true">
					<svg
						width="18"
						height="18"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z" />
						<path d="M12 12l8-4.5" />
						<path d="M12 12v9" />
						<path d="M12 12L4 7.5" />
					</svg>
				</span>
				<span class="d-pill d-pill-warn">MVP</span>
			</div>
			<div>
				<p class="d-hub-name">Overlay AR</p>
				<p class="d-hub-desc">
					Unggah dan kelola aset overlay AR transparan. Pelacakan wajah realtime belum aktif.
				</p>
			</div>
			<div class="card-meta d-num">
				<span class="d-pill">{loading ? '…' : customArCount} aset</span>
			</div>
		</a>
	</section>
</div>

<style>
	.card-meta {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin-top: auto;
		padding-top: 4px;
	}
</style>
