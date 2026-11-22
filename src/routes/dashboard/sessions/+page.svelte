<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import type { GallerySession } from '#lib/types';
	import {
		RefreshCw,
		Search,
		ExternalLink,
		Camera,
		Film,
		Image as ImageIcon
	} from '@lucide/svelte';

	type SessionSummary = {
		id: string;
		createdAt?: string;
		photoCount?: number;
		templateKey?: string;
		formatId?: string;
		hasGif?: boolean;
		hasVideo?: boolean;
	};

	type MediaFilter = 'all' | 'video' | 'gif';

	let list = $state<SessionSummary[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let query = $state('');
	let mediaFilter = $state<MediaFilter>('all');

	let selectedId = $state<string | null>(null);
	let detail = $state<GallerySession | null>(null);
	let detailLoading = $state(false);
	let detailError = $state<string | null>(null);

	const filteredList = $derived.by(() => {
		const q = query.trim().toLowerCase();
		return list.filter((s) => {
			if (mediaFilter === 'video' && !s.hasVideo) return false;
			if (mediaFilter === 'gif' && !s.hasGif) return false;
			if (!q) return true;
			return (
				s.id.toLowerCase().includes(q) ||
				(s.formatId || '').toLowerCase().includes(q) ||
				(s.templateKey || '').toLowerCase().includes(q)
			);
		});
	});

	function formatDate(iso?: string): string {
		if (!iso) return '—';
		const d = new Date(iso);
		if (!Number.isFinite(d.getTime())) return iso;
		return d.toLocaleString('id-ID', {
			day: '2-digit',
			month: 'short',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	async function loadList(): Promise<void> {
		loading = true;
		error = null;
		try {
			const res = await fetch('/api/gallery?list=1&limit=60');
			if (!res.ok) throw new Error('Daftar sesi tidak tersedia');
			const data = (await res.json()) as { sessions?: SessionSummary[] };
			list = Array.isArray(data.sessions) ? data.sessions : [];
		} catch (e) {
			list = [];
			error = e instanceof Error ? e.message : 'Gagal memuat daftar sesi.';
		} finally {
			loading = false;
		}
	}

	async function openDetail(id: string, toggleOff = true): Promise<void> {
		if (toggleOff && selectedId === id && detail) {
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
			if (!res.ok) throw new Error('Detail sesi tidak ditemukan');
			detail = (await res.json()) as GallerySession;
		} catch (e) {
			detailError = e instanceof Error ? e.message : 'Gagal memuat detail sesi.';
		} finally {
			detailLoading = false;
		}
	}

	onMount(async () => {
		await loadList();
		const targetId = page.url.searchParams.get('id');
		if (targetId) {
			void openDetail(targetId, false);
		} else if (list.length > 0) {
			void openDetail(list[0].id, false);
		}
	});
</script>

<div class="d-page">
	<header class="d-head">
		<div>
			<p class="d-eyebrow">RIWAYAT PEMOTRETAN</p>
			<h1 class="d-title">Sesi</h1>
			<p class="d-sub">
				Periksa hasil strip cetak, foto individu, GIF, dan video MP4 dari setiap sesi tamu.
			</p>
		</div>
		<div class="d-actions">
			<button type="button" class="d-btn" onclick={loadList} disabled={loading}>
				<RefreshCw size={14} />
				{loading ? 'Memuat…' : 'Muat Ulang'}
			</button>
		</div>
	</header>

	<!-- Bar pencarian & filter -->
	<div class="filter-bar">
		<div class="d-search-wrap">
			<Search size={15} />
			<input
				type="search"
				class="d-input"
				placeholder="Cari ID sesi atau format…"
				bind:value={query}
				aria-label="Cari sesi"
			/>
		</div>

		<div class="d-tabs" role="tablist" aria-label="Filter media sesi">
			<button
				type="button"
				role="tab"
				class="d-tab"
				class:is-active={mediaFilter === 'all'}
				aria-selected={mediaFilter === 'all'}
				onclick={() => (mediaFilter = 'all')}
			>
				Semua ({list.length})
			</button>
			<button
				type="button"
				role="tab"
				class="d-tab"
				class:is-active={mediaFilter === 'video'}
				aria-selected={mediaFilter === 'video'}
				onclick={() => (mediaFilter = 'video')}
			>
				Ada Video
			</button>
			<button
				type="button"
				role="tab"
				class="d-tab"
				class:is-active={mediaFilter === 'gif'}
				aria-selected={mediaFilter === 'gif'}
				onclick={() => (mediaFilter = 'gif')}
			>
				Ada GIF
			</button>
		</div>
	</div>

	{#if error}
		<div class="d-banner d-banner-err" role="alert">{error}</div>
	{/if}

	<div class="sessions-split">
		<!-- Kolom Kiri: Daftar Sesi -->
		<section class="d-card list-panel" aria-label="Daftar sesi">
			<div class="d-card-head">
				<div>
					<h2 class="d-card-title">Daftar Sesi</h2>
					<p class="d-card-sub d-num">{filteredList.length} sesi ditampilkan</p>
				</div>
			</div>

			{#if loading}
				<div class="d-empty">Memuat sesi…</div>
			{:else if filteredList.length === 0}
				<div class="d-empty">
					<Camera size={24} />
					<p class="d-empty-title">Tidak ada sesi ditemukan</p>
					<span>Ubah kata kunci pencarian atau selesaikan sesi baru.</span>
				</div>
			{:else}
				<div class="session-scroll">
					{#each filteredList as s (s.id)}
						<button
							type="button"
							class="session-item"
							class:is-active={selectedId === s.id}
							onclick={() => openDetail(s.id)}
						>
							<div class="session-item-top">
								<span class="session-id d-num">#{s.id}</span>
								<span class="session-date">{formatDate(s.createdAt)}</span>
							</div>
							<div class="session-item-meta">
								<span class="d-pill d-num">{s.photoCount ?? 0} foto</span>
								{#if s.formatId || s.templateKey}
									<span class="d-pill">{s.formatId || s.templateKey}</span>
								{/if}
								{#if s.hasVideo}
									<span class="d-pill d-pill-info">MP4</span>
								{/if}
								{#if s.hasGif}
									<span class="d-pill d-pill-warn">GIF</span>
								{/if}
							</div>
						</button>
					{/each}
				</div>
			{/if}
		</section>

		<!-- Kolom Kanan: Detail Sesi -->
		<section class="d-card detail-panel" aria-label="Detail output sesi">
			{#if !selectedId}
				<div class="d-empty detail-empty">
					<ImageIcon size={28} />
					<p class="d-empty-title">Pilih sesi di sebelah kiri</p>
					<span>Pratinjau strip final, foto satuan, dan timelapse akan tampil di sini.</span>
				</div>
			{:else if detailLoading}
				<div class="d-empty detail-empty">Memuat output sesi #{selectedId}…</div>
			{:else if detailError}
				<div class="d-card-body">
					<div class="d-banner d-banner-err" role="alert">{detailError}</div>
				</div>
			{:else if detail}
				<div class="d-card-head">
					<div>
						<h2 class="d-card-title d-num">Sesi #{detail.id}</h2>
						<p class="d-card-sub">
							{formatDate(detail.createdAt)} · {detail.photos?.length ?? 0} foto · {detail.templateKey ||
								'standar'}
						</p>
					</div>
					<a
						class="d-btn d-btn-sm d-btn-primary"
						href={`/gallery/${encodeURIComponent(detail.id)}`}
						target="_blank"
						rel="noopener noreferrer"
					>
						Buka Galeri
						<ExternalLink size={13} />
					</a>
				</div>

				<div class="d-card-body detail-stack">
					{#if detail.stripDataUrl}
						<div class="output-block">
							<p class="d-eyebrow">HASIL STRIP FINAL</p>
							<div class="strip-stage">
								<img
									src={detail.stripDataUrl}
									alt="Hasil strip sesi {detail.id}"
									class="strip-preview"
								/>
							</div>
						</div>
					{/if}

					{#if detail.photos?.length}
						<div class="output-block">
							<p class="d-eyebrow">FOTO INDIVIDU ({detail.photos.length})</p>
							<div class="photos-grid">
								{#each detail.photos as p, i (i)}
									<div class="photo-thumb">
										<img src={p} alt="Foto {i + 1} sesi {detail.id}" loading="lazy" />
										<span class="photo-idx">{i + 1}</span>
									</div>
								{/each}
							</div>
						</div>
					{/if}

					{#if detail.videoDataUrl || detail.gifDataUrl}
						<div class="output-block">
							<p class="d-eyebrow">TIMELAPSE</p>
							<div class="tl-grid">
								{#if detail.videoDataUrl}
									<div class="tl-card">
										<span class="tl-label"><Film size={13} /> Video MP4</span>
										<!-- svelte-ignore a11y_media_has_caption -->
										<video
											src={detail.videoDataUrl}
											controls
											loop
											muted
											playsinline
											class="tl-media"
										></video>
									</div>
								{/if}
								{#if detail.gifDataUrl}
									<div class="tl-card">
										<span class="tl-label"><ImageIcon size={13} /> Animasi GIF</span>
										<img
											src={detail.gifDataUrl}
											alt="GIF timelapse sesi {detail.id}"
											class="tl-media"
										/>
									</div>
								{/if}
							</div>
						</div>
					{/if}
				</div>
			{/if}
		</section>
	</div>
</div>

<style>
	.filter-bar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
	}

	.sessions-split {
		display: grid;
		gap: 16px;
		grid-template-columns: 1fr;
		align-items: start;
	}

	.session-scroll {
		max-height: 68dvh;
		overflow-y: auto;
	}

	.session-item {
		width: 100%;
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 13px 16px;
		border: none;
		border-bottom: 1px solid var(--d-border);
		border-left: 3px solid transparent;
		background: transparent;
		color: var(--d-ink);
		text-align: left;
		cursor: pointer;
		transition:
			background-color 140ms ease,
			border-color 140ms ease;
	}

	.session-item:last-child {
		border-bottom: none;
	}

	.session-item:hover {
		background: var(--d-surface-hover);
	}

	.session-item.is-active {
		background: var(--d-surface-2);
		border-left-color: var(--d-ink);
	}

	.session-item-top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
	}

	.session-id {
		font-size: 0.84rem;
		font-weight: 800;
	}

	.session-date {
		font-size: 0.72rem;
		color: var(--d-muted);
	}

	.session-item-meta {
		display: flex;
		flex-wrap: wrap;
		gap: 5px;
	}

	.detail-empty {
		min-height: 360px;
		justify-content: center;
	}

	.detail-stack {
		display: flex;
		flex-direction: column;
		gap: 20px;
	}

	.output-block {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.strip-stage {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 18px;
		border: 1px solid var(--d-border);
		border-radius: 14px;
		background: var(--d-bg);
	}

	.strip-preview {
		max-width: 100%;
		max-height: 440px;
		width: auto;
		height: auto;
		border-radius: 6px;
		box-shadow: var(--d-shadow);
	}

	.photos-grid {
		display: grid;
		gap: 10px;
		grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
	}

	.photo-thumb {
		position: relative;
		aspect-ratio: 4 / 3;
		border: 1px solid var(--d-border);
		border-radius: 12px;
		overflow: hidden;
		background: var(--d-surface-2);
	}

	.photo-thumb img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}

	.photo-idx {
		position: absolute;
		top: 7px;
		left: 7px;
		min-width: 22px;
		height: 22px;
		padding: 0 6px;
		border-radius: 999px;
		background: rgba(15, 23, 42, 0.72);
		color: #ffffff;
		font-size: 0.68rem;
		font-weight: 700;
		display: inline-flex;
		align-items: center;
		justify-content: center;
	}

	.tl-grid {
		display: grid;
		gap: 12px;
		grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
	}

	.tl-card {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 10px;
		border: 1px solid var(--d-border);
		border-radius: 14px;
		background: var(--d-bg);
	}

	.tl-label {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-size: 0.72rem;
		font-weight: 700;
		color: var(--d-muted);
	}

	.tl-media {
		width: 100%;
		max-height: 260px;
		border-radius: 10px;
		object-fit: contain;
		background: #000000;
	}

	@media (min-width: 980px) {
		.sessions-split {
			grid-template-columns: 340px minmax(0, 1fr);
		}
	}
</style>
