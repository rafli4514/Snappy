<script lang="ts">
	import { onMount } from 'svelte';

	type QueueStat = { total: number; pending: number; failed: number; done: number };
	type Summary = Record<string, QueueStat>;

	let loading = $state(true);
	let error = $state<string | null>(null);
	let summary = $state<Summary>({});
	let context = $state<{ gallerySessions?: number; customAssets?: number }>({});

	async function load(): Promise<void> {
		loading = true;
		error = null;
		try {
			const res = await fetch('/api/queue?limit=1');
			const data = (await res.json()) as {
				ok?: boolean;
				summary?: Summary;
				context?: typeof context;
				error?: string;
			};
			if (!res.ok || !data.ok) throw new Error(data.error || 'Gagal memuat ringkasan antrean.');
			summary = data.summary || {};
			context = data.context || {};
		} catch (e) {
			error = e instanceof Error ? e.message : 'Gagal memuat ringkasan antrean.';
		} finally {
			loading = false;
		}
	}

	onMount(() => void load());

	function statOf(key: string): QueueStat {
		return summary[key] || { total: 0, pending: 0, failed: 0, done: 0 };
	}

	let totalItems = $derived(
		statOf('print').total + statOf('cloud-sync').total + statOf('upload').total
	);
	let totalPending = $derived(
		statOf('print').pending + statOf('cloud-sync').pending + statOf('upload').pending
	);
	let totalFailed = $derived(
		statOf('print').failed + statOf('cloud-sync').failed + statOf('upload').failed
	);
</script>

<div class="d-page">
	<header class="d-head">
		<div>
			<p class="d-eyebrow">Admin · Antrean</p>
			<h1 class="d-title">Antrean Lokal</h1>
			<p class="d-sub">
				Pelacakan lokal berbasis berkas (Node + penyimpanan disk) untuk cetak, sinkronisasi cloud,
				dan unggahan. Bukan layanan antrean cloud terdistribusi atau OS print spooler.
			</p>
		</div>
		<div class="d-actions">
			<button type="button" class="d-btn" onclick={load} disabled={loading}>
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

	{#if error}
		<div class="d-banner d-banner-warn" role="status">
			<span>{error}</span>
		</div>
	{/if}

	<section class="d-kpi-grid" aria-label="Ringkasan antrean">
		<div class="d-kpi">
			<div class="d-kpi-top">
				<p class="d-kpi-label">Total Item</p>
				<span class="d-kpi-icon" aria-hidden="true">
					<svg
						width="17"
						height="17"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<line x1="8" y1="6" x2="21" y2="6" />
						<line x1="8" y1="12" x2="21" y2="12" />
						<line x1="8" y1="18" x2="21" y2="18" />
						<line x1="3" y1="6" x2="3.01" y2="6" />
						<line x1="3" y1="12" x2="3.01" y2="12" />
						<line x1="3" y1="18" x2="3.01" y2="18" />
					</svg>
				</span>
			</div>
			<p class="d-kpi-val">{loading ? '—' : totalItems}</p>
			<p class="d-kpi-hint">Gabungan seluruh antrean lokal</p>
		</div>

		<div class="d-kpi">
			<div class="d-kpi-top">
				<p class="d-kpi-label">Tertunda / Gagal</p>
				<span class="d-kpi-icon" aria-hidden="true">
					<svg
						width="17"
						height="17"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<circle cx="12" cy="12" r="10" />
						<polyline points="12 6 12 12 16 14" />
					</svg>
				</span>
			</div>
			<p class="d-kpi-val">{loading ? '—' : totalPending + totalFailed}</p>
			<p class="d-kpi-hint d-num">
				{loading ? 'Memuat…' : `${totalPending} tertunda · ${totalFailed} gagal`}
			</p>
		</div>

		<div class="d-kpi">
			<div class="d-kpi-top">
				<p class="d-kpi-label">Sesi Galeri Lokal</p>
				<span class="d-kpi-icon" aria-hidden="true">
					<svg
						width="17"
						height="17"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<rect x="3" y="3" width="18" height="18" rx="2" />
						<circle cx="8.5" cy="8.5" r="1.5" />
						<polyline points="21 15 16 10 5 21" />
					</svg>
				</span>
			</div>
			<p class="d-kpi-val">{loading ? '—' : (context.gallerySessions ?? 0)}</p>
			<p class="d-kpi-hint">Tersimpan di perangkat ini</p>
		</div>

		<div class="d-kpi">
			<div class="d-kpi-top">
				<p class="d-kpi-label">Aset Kustom</p>
				<span class="d-kpi-icon" aria-hidden="true">
					<svg
						width="17"
						height="17"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<polygon points="12 2 2 7 12 12 22 7 12 2" />
						<polyline points="2 17 12 22 22 17" />
						<polyline points="2 12 12 17 22 12" />
					</svg>
				</span>
			</div>
			<p class="d-kpi-val">{loading ? '—' : (context.customAssets ?? 0)}</p>
			<p class="d-kpi-hint">Stiker, filter, AR & ukuran aktif</p>
		</div>
	</section>

	<section class="d-hub-grid" aria-label="Daftar antrean">
		<a class="d-hub-card" href="/dashboard/queue/print">
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
						<polyline points="6 9 6 2 18 2 18 9" />
						<path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
						<rect x="6" y="14" width="12" height="8" />
					</svg>
				</span>
				<span class="d-pill">MVP Lokal</span>
			</div>
			<div>
				<p class="d-hub-name">Antrean Cetak</p>
				<p class="d-hub-desc">
					Log lokal percobaan cetak melalui endpoint cetak ke printer Windows.
				</p>
			</div>
			<div class="stat-pills d-num">
				<span class="d-pill">Total {loading ? '…' : statOf('print').total}</span>
				{#if !loading && statOf('print').pending > 0}
					<span class="d-pill d-pill-warn">Tertunda {statOf('print').pending}</span>
				{/if}
				{#if !loading && statOf('print').failed > 0}
					<span class="d-pill d-pill-err">Gagal {statOf('print').failed}</span>
				{/if}
				{#if !loading && statOf('print').done > 0}
					<span class="d-pill d-pill-ok">Selesai {statOf('print').done}</span>
				{/if}
			</div>
		</a>

		<a class="d-hub-card" href="/dashboard/queue/cloud-sync">
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
						<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
					</svg>
				</span>
				<span class="d-pill">MVP Lokal</span>
			</div>
			<div>
				<p class="d-hub-name">Sinkronisasi Cloud</p>
				<p class="d-hub-desc">
					Penanda lokal calon sinkronisasi. Belum terhubung ke backend cloud eksternal.
				</p>
			</div>
			<div class="stat-pills d-num">
				<span class="d-pill">Sesi {loading ? '…' : (context.gallerySessions ?? 0)}</span>
				<span class="d-pill">Item {loading ? '…' : statOf('cloud-sync').total}</span>
				{#if !loading && statOf('cloud-sync').pending > 0}
					<span class="d-pill d-pill-warn">Tertunda {statOf('cloud-sync').pending}</span>
				{/if}
			</div>
		</a>

		<a class="d-hub-card" href="/dashboard/queue/upload">
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
						<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
						<polyline points="17 8 12 3 7 8" />
						<line x1="12" y1="3" x2="12" y2="15" />
					</svg>
				</span>
				<span class="d-pill">MVP Lokal</span>
			</div>
			<div>
				<p class="d-hub-name">Antrean Unggahan</p>
				<p class="d-hub-desc">
					Unggah aset langsung via API; halaman ini berfungsi sebagai pelacak unggahan lokal.
				</p>
			</div>
			<div class="stat-pills d-num">
				<span class="d-pill">Aset {loading ? '…' : (context.customAssets ?? 0)}</span>
				<span class="d-pill">Item {loading ? '…' : statOf('upload').total}</span>
				{#if !loading && statOf('upload').failed > 0}
					<span class="d-pill d-pill-err">Gagal {statOf('upload').failed}</span>
				{/if}
			</div>
		</a>
	</section>
</div>

<style>
	.stat-pills {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin-top: auto;
		padding-top: 4px;
	}
</style>
