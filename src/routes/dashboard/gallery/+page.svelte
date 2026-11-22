<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { RefreshCw, Search, Copy, Check, ExternalLink, Eye, Images } from '@lucide/svelte';

	type GallerySummary = {
		id: string;
		createdAt?: string;
		photoCount?: number;
		templateKey?: string;
		formatId?: string;
		hasGif?: boolean;
		hasVideo?: boolean;
	};

	let list = $state<GallerySummary[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let query = $state('');
	let copiedId = $state<string | null>(null);
	let copyTimer: ReturnType<typeof setTimeout> | null = null;

	const filtered = $derived.by(() => {
		const q = query.trim().toLowerCase();
		if (!q) return list;
		return list.filter(
			(s) =>
				s.id.toLowerCase().includes(q) ||
				(s.formatId || '').toLowerCase().includes(q) ||
				(s.templateKey || '').toLowerCase().includes(q)
		);
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
			if (!res.ok) throw new Error('Daftar galeri tidak tersedia');
			const data = (await res.json()) as { sessions?: GallerySummary[] };
			list = Array.isArray(data.sessions) ? data.sessions : [];
		} catch (e) {
			list = [];
			error = e instanceof Error ? e.message : 'Gagal memuat daftar galeri.';
		} finally {
			loading = false;
		}
	}

	function copyLink(id: string): void {
		if (typeof window === 'undefined') return;
		const url = `${window.location.origin}/gallery/${encodeURIComponent(id)}`;
		navigator.clipboard
			.writeText(url)
			.then(() => {
				copiedId = id;
				if (copyTimer) clearTimeout(copyTimer);
				copyTimer = setTimeout(() => (copiedId = null), 2200);
			})
			.catch(() => {
				error = 'Gagal menyalin tautan galeri ke clipboard.';
			});
	}

	onMount(() => {
		void loadList();
	});

	onDestroy(() => {
		if (copyTimer) clearTimeout(copyTimer);
	});
</script>

<div class="d-page">
	<header class="d-head">
		<div>
			<p class="d-eyebrow">TAUTAN TAMU</p>
			<h1 class="d-title">Galeri QR</h1>
			<p class="d-sub">
				Kelola tautan galeri tamu yang dibagikan melalui QR code. Salin tautan, buka pratinjau
				langsung, atau lompat ke detail sesi.
			</p>
		</div>
		<div class="d-actions">
			<button type="button" class="d-btn" onclick={loadList} disabled={loading}>
				<RefreshCw size={14} />
				{loading ? 'Memuat…' : 'Muat Ulang'}
			</button>
		</div>
	</header>

	<div class="gallery-toolbar">
		<div class="d-search-wrap">
			<Search size={15} />
			<input
				type="search"
				class="d-input"
				placeholder="Cari ID galeri atau format…"
				bind:value={query}
				aria-label="Cari galeri"
			/>
		</div>
		<span class="d-pill d-num">{filtered.length} galeri</span>
	</div>

	{#if error}
		<div class="d-banner d-banner-err" role="alert">{error}</div>
	{/if}

	<section class="d-card" aria-label="Daftar tautan galeri">
		{#if loading}
			<div class="d-empty">Memuat daftar galeri…</div>
		{:else if filtered.length === 0}
			<div class="d-empty">
				<Images size={26} />
				<p class="d-empty-title">Belum ada galeri tersimpan</p>
				<span>Galeri akan otomatis tercatat setelah tamu menyelesaikan sesi di halaman cetak.</span>
			</div>
		{:else}
			<div class="d-list">
				{#each filtered as s (s.id)}
					<div class="d-row">
						<div class="gal-info">
							<div class="gal-top">
								<span class="gal-id d-num">#{s.id}</span>
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
							<p class="gal-meta">
								{formatDate(s.createdAt)} · <span>/gallery/{s.id}</span>
							</p>
						</div>

						<div class="d-actions">
							<button type="button" class="d-btn d-btn-sm" onclick={() => copyLink(s.id)}>
								{#if copiedId === s.id}
									<Check size={13} />
									Tersalin
								{:else}
									<Copy size={13} />
									Salin Link
								{/if}
							</button>
							<a class="d-btn d-btn-sm" href={`/dashboard/sessions?id=${encodeURIComponent(s.id)}`}>
								<Eye size={13} />
								Detail Sesi
							</a>
							<a
								class="d-btn d-btn-sm d-btn-primary"
								href={`/gallery/${encodeURIComponent(s.id)}`}
								target="_blank"
								rel="noopener noreferrer"
							>
								Buka
								<ExternalLink size={13} />
							</a>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</section>
</div>

<style>
	.gallery-toolbar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
	}

	.gal-info {
		display: flex;
		flex-direction: column;
		gap: 5px;
		min-width: 0;
	}

	.gal-top {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px;
	}

	.gal-id {
		font-size: 0.88rem;
		font-weight: 800;
		color: var(--d-ink);
	}

	.gal-meta {
		margin: 0;
		font-size: 0.76rem;
		color: var(--d-muted);
	}
</style>
