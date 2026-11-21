<script lang="ts">
	import { onMount } from 'svelte';

	type Summary = Record<string, { total: number; pending: number; failed: number; done: number }>;
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
			if (!res.ok || !data.ok) throw new Error(data.error || 'Gagal memuat ringkasan antrian.');
			summary = data.summary || {};
			context = data.context || {};
		} catch (e) {
			error = e instanceof Error ? e.message : 'Gagal memuat ringkasan antrian.';
		} finally {
			loading = false;
		}
	}

	onMount(() => void load());

	function s(key: string) {
		return summary[key] || { total: 0, pending: 0, failed: 0, done: 0 };
	}
</script>

<div class="dash-page">
	<header class="dash-head">
		<div class="head-row">
			<div>
				<p class="eyebrow font-mono">ADMIN · QUEUE</p>
				<h1 class="dash-title font-display">Queue</h1>
				<p class="dash-sub">
					Antrian <strong>MVP lokal</strong> (file-backed, Node + disk tulis) untuk print, cloud
					sync, dan upload.
					<strong>Bukan</strong> backend cloud/distributed/OS spooler. Status jujur; tanpa data palsu.
				</p>
			</div>
			<button type="button" class="btn btn-outline btn-sm" onclick={load} disabled={loading}
				>Muat ulang</button
			>
		</div>
	</header>

	{#if error}<div class="alert alert-warning" role="status"><span>{error}</span></div>{/if}

	<section class="asset-grid" aria-label="Daftar queue">
		<a class="asset-card" href="/dashboard/queue/print">
			<p class="asset-name">Print queue</p>
			<p class="asset-desc">
				Log lokal percobaan print via <code>/api/print</code> (PowerShell → printer Windows).
			</p>
			<div class="counts font-mono">
				<span>total {loading ? '…' : s('print').total}</span>
				<span>pending {loading ? '…' : s('print').pending}</span>
				<span>gagal {loading ? '…' : s('print').failed}</span>
			</div>
			<span class="asset-status">MVP LOKAL</span>
		</a>
		<a class="asset-card" href="/dashboard/queue/cloud-sync">
			<p class="asset-name">Cloud sync</p>
			<p class="asset-desc">
				Pelacakan lokal niat/calon sinkronisasi. <strong>Belum ada backend cloud sync.</strong>
			</p>
			<div class="counts font-mono">
				<span>sesi lokal {loading ? '…' : (context.gallerySessions ?? 0)}</span>
				<span>item {loading ? '…' : s('cloud-sync').total}</span>
			</div>
			<span class="asset-status">MVP LOKAL</span>
		</a>
		<a class="asset-card" href="/dashboard/queue/upload">
			<p class="asset-name">Upload queue</p>
			<p class="asset-desc">
				Upload aset kini langsung via API; halaman ini untuk pelacakan lokal/MVP.
			</p>
			<div class="counts font-mono">
				<span>aset custom {loading ? '…' : (context.customAssets ?? 0)}</span>
				<span>item {loading ? '…' : s('upload').total}</span>
			</div>
			<span class="asset-status">MVP LOKAL</span>
		</a>
	</section>
</div>

<style>
	.dash-page {
		display: flex;
		flex-direction: column;
		gap: 22px;
	}
	.head-row {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 12px;
		flex-wrap: wrap;
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
		max-width: 72ch;
		font-size: 0.85rem;
		line-height: 1.55;
		opacity: 0.75;
	}
	.asset-grid {
		display: grid;
		gap: 12px;
		grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
	}
	.asset-card {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 16px;
		border: 1px solid var(--color-base-300, #d6d3d1);
		border-radius: var(--radius-box, 12px);
		background: var(--color-base-200, #f5f5f4);
		text-decoration: none;
		color: inherit;
	}
	.asset-card:hover {
		border-color: var(--color-base-content, #1c1917);
	}
	.asset-name {
		margin: 0;
		font-size: 1rem;
		font-weight: 700;
	}
	.asset-desc {
		margin: 0;
		font-size: 0.76rem;
		line-height: 1.45;
		opacity: 0.7;
	}
	.counts {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin-top: 4px;
		font-size: 0.66rem;
		opacity: 0.75;
	}
	.asset-status {
		align-self: flex-start;
		margin-top: 6px;
		padding: 3px 8px;
		border-radius: 9999px;
		border: 1px solid var(--color-base-300, #d6d3d1);
		font-size: 0.62rem;
		font-weight: 700;
		letter-spacing: 0.12em;
	}
	.alert {
		padding: 10px 12px;
		border-radius: 10px;
		border: 1px solid var(--color-base-300, #d6d3d1);
		font-size: 0.82rem;
	}
	.alert-warning {
		background: color-mix(in srgb, #f59e0b 12%, transparent);
	}
	code {
		font-size: 0.92em;
	}
</style>
