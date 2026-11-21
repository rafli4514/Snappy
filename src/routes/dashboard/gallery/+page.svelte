<script lang="ts">
	import { onMount } from 'svelte';

	type SessionSummary = {
		id: string;
		createdAt: string;
		photoCount: number;
		templateKey: string;
		formatId?: string;
		hasGif: boolean;
		hasVideo: boolean;
	};

	let sessions = $state<SessionSummary[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);

	async function loadList(): Promise<void> {
		loading = true;
		error = null;
		try {
			const res = await fetch('/api/gallery?list=1&limit=60');
			if (!res.ok) throw new Error(`Gagal memuat daftar (${res.status})`);
			const data = (await res.json()) as { ok?: boolean; sessions?: SessionSummary[] };
			sessions = Array.isArray(data.sessions) ? data.sessions : [];
		} catch (e) {
			error = e instanceof Error ? e.message : 'Gagal memuat galeri.';
			sessions = [];
		} finally {
			loading = false;
		}
	}

	function fmtDate(iso: string): string {
		try {
			return new Date(iso).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
		} catch {
			return iso;
		}
	}

	function galleryLink(id: string): string {
		return `/gallery/${id}`;
	}

	onMount(() => {
		void loadList();
	});
</script>

<div class="dash-page">
	<header class="dash-head">
		<div class="head-row">
			<div>
				<p class="eyebrow font-mono">ADMIN · GALLERY</p>
				<h1 class="dash-title font-display">Gallery</h1>
				<p class="dash-sub">
					Sesi galeri tamu (QR). Riwayat dan output foto digabung di halaman Session; di sini fokus
					ke tautan galeri yang bisa dibuka tamu.
				</p>
			</div>
			<button type="button" class="btn btn-outline btn-sm" onclick={loadList} disabled={loading}>
				{loading ? 'Memuat…' : 'Muat ulang'}
			</button>
		</div>
	</header>

	{#if error}
		<div class="alert alert-warning" role="status">
			<span
				>{error} Galeri server butuh runtime Node dengan akses disk ke
				<code>.gallery_cache</code>.</span
			>
		</div>
	{/if}

	<section class="panel" aria-label="Daftar galeri">
		<div class="panel-head">
			<h2 class="section-title font-mono">TAUTAN GALERI</h2>
			<span class="count font-mono">{sessions.length}</span>
		</div>
		<div class="panel-body">
			{#if loading}
				<p class="panel-note">Memuat galeri…</p>
			{:else if sessions.length === 0}
				<p class="panel-note">Belum ada sesi galeri tersimpan.</p>
			{:else}
				<ul class="session-list">
					{#each sessions as s (s.id)}
						<li class="gallery-row">
							<div class="row-main">
								<span class="row-id font-mono">{s.id}</span>
								<span class="row-meta">{fmtDate(s.createdAt)} · {s.photoCount} foto</span>
							</div>
							<div class="row-actions">
								<a
									class="btn btn-outline btn-xs"
									href={galleryLink(s.id)}
									target="_blank"
									rel="noopener noreferrer">Buka galeri</a
								>
								<a class="btn btn-ghost btn-xs" href="/dashboard/sessions">Lihat output</a>
							</div>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	</section>
</div>

<style>
	.dash-page {
		display: flex;
		flex-direction: column;
		gap: 18px;
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
		opacity: 0.6;
	}
	.dash-title {
		margin: 6px 0 0;
		font-size: 2rem;
		line-height: 1.1;
	}
	.dash-sub {
		margin: 8px 0 0;
		max-width: 62ch;
		font-size: 0.85rem;
		line-height: 1.55;
		opacity: 0.7;
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
		padding: 14px;
	}
	.section-title {
		margin: 0;
		font-size: 0.66rem;
		font-weight: 700;
		letter-spacing: 0.22em;
		opacity: 0.6;
	}
	.count {
		font-size: 0.72rem;
		opacity: 0.7;
	}
	.panel-note {
		margin: 0;
		font-size: 0.85rem;
		opacity: 0.75;
	}
	.session-list {
		margin: 0;
		padding: 0;
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.gallery-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		padding: 12px;
		border: 1px solid var(--color-base-300, #d6d3d1);
		border-radius: 10px;
		background: var(--color-base-100, #fff);
		flex-wrap: wrap;
	}
	.row-main {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.row-id {
		font-size: 0.78rem;
		font-weight: 700;
	}
	.row-meta {
		font-size: 0.72rem;
		opacity: 0.7;
	}
	.row-actions {
		display: flex;
		gap: 6px;
		flex-wrap: wrap;
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
</style>
