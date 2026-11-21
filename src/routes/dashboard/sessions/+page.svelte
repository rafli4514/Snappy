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

	type GallerySession = {
		id: string;
		createdAt: string;
		photos: string[];
		stripDataUrl: string;
		templateKey: string;
		formatId?: string;
		gifDataUrl?: string | null;
		videoDataUrl?: string | null;
	};

	let sessions = $state<SessionSummary[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let selectedId = $state<string | null>(null);
	let detail = $state<GallerySession | null>(null);
	let detailLoading = $state(false);
	let detailError = $state<string | null>(null);

	async function loadList(): Promise<void> {
		loading = true;
		error = null;
		try {
			const res = await fetch('/api/gallery?list=1&limit=60');
			if (!res.ok) throw new Error(`Gagal memuat daftar (${res.status})`);
			const data = (await res.json()) as { ok?: boolean; sessions?: SessionSummary[] };
			sessions = Array.isArray(data.sessions) ? data.sessions : [];
		} catch (e) {
			error = e instanceof Error ? e.message : 'Gagal memuat riwayat sesi.';
			sessions = [];
		} finally {
			loading = false;
		}
	}

	async function openDetail(id: string): Promise<void> {
		if (selectedId === id && detail) {
			selectedId = null;
			detail = null;
			detailError = null;
			return;
		}
		selectedId = id;
		detail = null;
		detailError = null;
		detailLoading = true;
		try {
			const res = await fetch(`/api/gallery/${encodeURIComponent(id)}`);
			if (!res.ok) throw new Error(`Sesi tidak ditemukan (${res.status})`);
			const data = (await res.json()) as GallerySession | { error?: string };
			if ('error' in data && data.error) throw new Error(data.error);
			detail = data as GallerySession;
		} catch (e) {
			detailError = e instanceof Error ? e.message : 'Gagal memuat detail sesi.';
		} finally {
			detailLoading = false;
		}
	}

	function fmtDate(iso: string): string {
		try {
			return new Date(iso).toLocaleString('id-ID', {
				dateStyle: 'medium',
				timeStyle: 'short'
			});
		} catch {
			return iso;
		}
	}

	onMount(() => {
		void loadList();
	});
</script>

<div class="dash-page">
	<header class="dash-head">
		<div class="head-row">
			<div>
				<p class="eyebrow font-mono">ADMIN · SESSION</p>
				<h1 class="dash-title font-display">Session / Riwayat</h1>
				<p class="dash-sub">
					Riwayat sesi dari galeri server. Pilih sesi untuk melihat output foto (strip dan foto
					individu).
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
				>{error} Riwayat server butuh runtime Node dengan akses disk ke
				<code>.gallery_cache</code>.</span
			>
		</div>
	{/if}

	<div class="layout">
		<section class="panel list-panel" aria-label="Daftar sesi">
			<div class="panel-head">
				<h2 class="section-title font-mono">DAFTAR SESI</h2>
				<span class="count font-mono">{sessions.length}</span>
			</div>
			<div class="panel-body">
				{#if loading}
					<p class="panel-note">Memuat riwayat…</p>
				{:else if sessions.length === 0}
					<p class="panel-note">Belum ada sesi tersimpan di galeri server.</p>
				{:else}
					<ul class="session-list">
						{#each sessions as s (s.id)}
							<li>
								<button
									type="button"
									class="session-row"
									class:active={selectedId === s.id}
									onclick={() => openDetail(s.id)}
									aria-expanded={selectedId === s.id}
								>
									<span class="row-main">
										<span class="row-id font-mono">{s.id}</span>
										<span class="row-meta">{fmtDate(s.createdAt)} · {s.photoCount} foto</span>
									</span>
									<span class="row-badges">
										{#if s.formatId}<span class="mini-badge font-mono">{s.formatId}</span>{/if}
										{#if s.hasGif}<span class="mini-badge">GIF</span>{/if}
										{#if s.hasVideo}<span class="mini-badge">MP4</span>{/if}
									</span>
								</button>
							</li>
						{/each}
					</ul>
				{/if}
			</div>
		</section>

		<section class="panel detail-panel" aria-label="Output foto sesi">
			<div class="panel-head">
				<h2 class="section-title font-mono">OUTPUT FOTO</h2>
				{#if detail}
					<a
						class="btn btn-ghost btn-xs"
						href={`/gallery/${detail.id}`}
						target="_blank"
						rel="noopener noreferrer">Buka galeri</a
					>
				{/if}
			</div>
			<div class="panel-body">
				{#if !selectedId}
					<p class="panel-note">Pilih sesi dari daftar untuk melihat output foto.</p>
				{:else if detailLoading}
					<p class="panel-note">Memuat output foto…</p>
				{:else if detailError}
					<div class="alert alert-warning" role="status"><span>{detailError}</span></div>
				{:else if detail}
					<div class="detail-meta font-mono">
						<span>ID: {detail.id}</span>
						<span>{fmtDate(detail.createdAt)}</span>
						<span>{detail.photos?.length ?? 0} foto</span>
						{#if detail.formatId}<span>Format: {detail.formatId}</span>{/if}
					</div>

					{#if detail.stripDataUrl}
						<div class="output-block">
							<p class="block-label font-mono">STRIP</p>
							<img
								class="strip-img"
								src={detail.stripDataUrl}
								alt="Output strip sesi {detail.id}"
							/>
						</div>
					{/if}

					{#if detail.photos?.length}
						<div class="output-block">
							<p class="block-label font-mono">FOTO</p>
							<div class="photo-grid">
								{#each detail.photos as src, i (i)}
									{#if src}
										<img
											class="photo-img"
											{src}
											alt="Foto {i + 1} sesi {detail.id}"
											loading="lazy"
										/>
									{/if}
								{/each}
							</div>
						</div>
					{/if}

					{#if detail.gifDataUrl}
						<div class="output-block">
							<p class="block-label font-mono">TIMELAPSE (GIF)</p>
							<img
								class="gif-img"
								src={detail.gifDataUrl}
								alt="Timelapse GIF sesi {detail.id}"
								loading="lazy"
							/>
						</div>
					{/if}

					{#if detail.videoDataUrl}
						<div class="output-block">
							<p class="block-label font-mono">TIMELAPSE (MP4)</p>
							<video class="video-el" src={detail.videoDataUrl} controls loop muted playsinline
							></video>
						</div>
					{/if}
				{/if}
			</div>
		</section>
	</div>
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
		max-width: 62ch;
		font-size: 0.85rem;
		line-height: 1.55;
		opacity: 0.7;
	}
	.layout {
		display: grid;
		gap: 12px;
		grid-template-columns: minmax(0, 1fr);
	}
	@media (min-width: 980px) {
		.layout {
			grid-template-columns: 360px minmax(0, 1fr);
			align-items: start;
		}
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
		max-height: 65vh;
		overflow: auto;
	}
	.session-row {
		width: 100%;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		padding: 12px;
		border: 1px solid var(--color-base-300, #d6d3d1);
		border-radius: 10px;
		background: var(--color-base-100, #fff);
		text-align: left;
		cursor: pointer;
		color: inherit;
	}
	.session-row:hover {
		border-color: color-mix(in srgb, var(--color-base-content, #1c1917) 35%, transparent);
	}
	.session-row.active {
		border-color: var(--color-base-content, #1c1917);
	}
	.row-main {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}
	.row-id {
		font-size: 0.78rem;
		font-weight: 700;
	}
	.row-meta {
		font-size: 0.72rem;
		opacity: 0.7;
	}
	.row-badges {
		display: flex;
		gap: 4px;
		flex-wrap: wrap;
		justify-content: flex-end;
	}
	.mini-badge {
		font-size: 0.58rem;
		font-weight: 700;
		padding: 2px 6px;
		border-radius: 999px;
		border: 1px solid var(--color-base-300, #d6d3d1);
		opacity: 0.8;
	}
	.detail-meta {
		display: flex;
		flex-wrap: wrap;
		gap: 8px 14px;
		font-size: 0.68rem;
		opacity: 0.75;
		margin-bottom: 12px;
	}
	.output-block {
		margin-top: 14px;
	}
	.block-label {
		margin: 0 0 8px;
		font-size: 0.62rem;
		font-weight: 700;
		letter-spacing: 0.18em;
		opacity: 0.6;
	}
	.strip-img {
		display: block;
		max-width: 100%;
		max-height: 520px;
		width: auto;
		height: auto;
		border-radius: 8px;
		border: 1px solid var(--color-base-300, #d6d3d1);
		background: #fff;
	}
	.photo-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
		gap: 8px;
	}
	.photo-img {
		display: block;
		width: 100%;
		aspect-ratio: 1 / 1;
		object-fit: cover;
		border-radius: 8px;
		border: 1px solid var(--color-base-300, #d6d3d1);
		background: #fff;
	}
	.gif-img,
	.video-el {
		display: block;
		max-width: 100%;
		max-height: 360px;
		border-radius: 8px;
		border: 1px solid var(--color-base-300, #d6d3d1);
		background: #000;
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
	.alert code {
		font-size: 0.78em;
	}
</style>
