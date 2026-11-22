<script lang="ts">
	import { onMount } from 'svelte';
	import {
		Printer,
		RefreshCw,
		Trash2,
		Search,
		CheckCircle2,
		AlertCircle,
		Clock,
		Check,
		Copy,
		X,
		ChevronLeft,
		ChevronRight
	} from '@lucide/svelte';

	type Item = {
		id: string;
		status: string;
		title: string;
		detail?: string;
		createdAt: string;
		source?: string;
	};
	type StatusFilter = 'all' | 'pending' | 'done' | 'failed';

	const PAGE_SIZES = [10, 25, 50];

	let loading = $state(true);
	let busyId = $state<string | null>(null);
	let clearing = $state(false);
	let confirmClear = $state(false);
	let error = $state<string | null>(null);
	let notice = $state<string | null>(null);

	let items = $state<Item[]>([]);
	let summary = $state({ total: 0, pending: 0, failed: 0, done: 0 });
	let filter = $state<StatusFilter>('all');
	let query = $state('');
	let pageSize = $state(10);
	let currentPage = $state(1);

	let selectedItem = $state<Item | null>(null);
	let copiedDetail = $state(false);

	const filteredItems = $derived.by(() => {
		const q = query.trim().toLowerCase();
		return items.filter((item) => {
			if (filter === 'pending' && item.status !== 'pending' && item.status !== 'processing') {
				return false;
			}
			if (filter === 'done' && item.status !== 'done') return false;
			if (filter === 'failed' && item.status !== 'failed') return false;
			if (!q) return true;
			return (
				item.title.toLowerCase().includes(q) ||
				(item.detail || '').toLowerCase().includes(q) ||
				(item.source || '').toLowerCase().includes(q)
			);
		});
	});

	const totalPages = $derived(Math.max(1, Math.ceil(filteredItems.length / pageSize)));
	const safePage = $derived(Math.min(currentPage, totalPages));
	const pageStart = $derived(filteredItems.length === 0 ? 0 : (safePage - 1) * pageSize + 1);
	const pageEnd = $derived(Math.min(filteredItems.length, safePage * pageSize));
	const pagedItems = $derived(filteredItems.slice((safePage - 1) * pageSize, safePage * pageSize));

	$effect(() => {
		void filter;
		void query;
		void pageSize;
		currentPage = 1;
	});

	async function load(): Promise<void> {
		loading = true;
		error = null;
		try {
			const res = await fetch('/api/queue?type=print&limit=200');
			const data = (await res.json()) as {
				ok?: boolean;
				items?: Item[];
				summary?: Record<string, typeof summary>;
				error?: string;
			};
			if (!res.ok || !data.ok) throw new Error(data.error || 'Gagal memuat antrean cetak.');
			items = data.items || [];
			summary = data.summary?.print || { total: 0, pending: 0, failed: 0, done: 0 };
			if (selectedItem) {
				selectedItem = items.find((x) => x.id === selectedItem?.id) ?? null;
			}
		} catch (e) {
			error = e instanceof Error ? e.message : 'Gagal memuat antrean cetak.';
		} finally {
			loading = false;
		}
	}

	async function setStatus(id: string, status: string): Promise<void> {
		busyId = id;
		error = null;
		notice = null;
		try {
			const res = await fetch('/api/queue', {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ id, status })
			});
			const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
			if (!res.ok || !data.ok) throw new Error(data.error || 'Gagal memperbarui status.');
			await load();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Gagal memperbarui status.';
		} finally {
			busyId = null;
		}
	}

	async function remove(id: string): Promise<void> {
		busyId = id;
		error = null;
		notice = null;
		try {
			const res = await fetch('/api/queue', {
				method: 'DELETE',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ id })
			});
			const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
			if (!res.ok || !data.ok) throw new Error(data.error || 'Gagal menghapus log.');
			if (selectedItem?.id === id) selectedItem = null;
			await load();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Gagal menghapus log.';
		} finally {
			busyId = null;
		}
	}

	async function clearAll(): Promise<void> {
		clearing = true;
		error = null;
		notice = null;
		try {
			const res = await fetch('/api/queue', {
				method: 'DELETE',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ type: 'print' })
			});
			const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
			if (!res.ok || !data.ok) throw new Error(data.error || 'Gagal membersihkan antrean cetak.');
			confirmClear = false;
			selectedItem = null;
			notice = 'Seluruh log cetak telah dibersihkan.';
			await load();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Gagal membersihkan antrean cetak.';
		} finally {
			clearing = false;
		}
	}

	async function copyDetail(text: string): Promise<void> {
		try {
			await navigator.clipboard.writeText(text);
			copiedDetail = true;
			setTimeout(() => (copiedDetail = false), 1600);
		} catch {
			// abaikan bila clipboard ditolak
		}
	}

	function fmt(iso: string): string {
		try {
			return new Date(iso).toLocaleString('id-ID', {
				day: '2-digit',
				month: 'short',
				year: 'numeric',
				hour: '2-digit',
				minute: '2-digit'
			});
		} catch {
			return iso;
		}
	}

	function statusLabel(status: string): string {
		if (status === 'done') return 'Selesai';
		if (status === 'failed') return 'Gagal';
		if (status === 'pending') return 'Tertunda';
		if (status === 'processing') return 'Diproses';
		if (status === 'skipped') return 'Dilewati';
		return status;
	}

	function handleWindowKeydown(e: KeyboardEvent): void {
		if (e.key === 'Escape' && selectedItem) {
			selectedItem = null;
		}
	}

	onMount(() => void load());
</script>

<svelte:window onkeydown={handleWindowKeydown} />

<div class="pq-page">
	<header class="pq-head">
		<div class="pq-head-copy">
			<h1 class="pq-title">Antrean Cetak</h1>
			<p class="pq-sub">Pantau riwayat percobaan cetak ke printer lokal dan kelola statusnya.</p>
		</div>

		<div class="pq-head-actions">
			<button type="button" class="pq-btn" onclick={load} disabled={loading}>
				<span class="pq-spin-wrap" class:is-spinning={loading}><RefreshCw size={14} /></span>
				Muat Ulang
			</button>

			{#if items.length > 0}
				{#if confirmClear}
					<div class="pq-confirm-bar" role="group" aria-label="Konfirmasi hapus semua log">
						<span>Hapus semua?</span>
						<button
							type="button"
							class="pq-sm-btn is-danger"
							onclick={clearAll}
							disabled={clearing}
						>
							{clearing ? '…' : 'Ya, Hapus'}
						</button>
						<button
							type="button"
							class="pq-sm-btn"
							onclick={() => (confirmClear = false)}
							disabled={clearing}
						>
							Batal
						</button>
					</div>
				{:else}
					<button
						type="button"
						class="pq-btn is-danger-ghost"
						onclick={() => (confirmClear = true)}
						disabled={loading || clearing}
					>
						<Trash2 size={14} />
						Bersihkan
					</button>
				{/if}
			{/if}
		</div>
	</header>

	{#if error}
		<div class="d-banner d-banner-err" role="alert"><span>{error}</span></div>
	{/if}
	{#if notice}
		<div class="d-banner d-banner-ok" role="status"><span>{notice}</span></div>
	{/if}

	<!-- Ringkasan Status Interaktif (Klik untuk Filter) -->
	<section class="pq-kpi-grid" aria-label="Ringkasan status cetak">
		<button
			type="button"
			class="pq-kpi"
			class:is-active={filter === 'all'}
			onclick={() => (filter = 'all')}
		>
			<div class="pq-kpi-top">
				<span class="pq-kpi-label">Total Log</span>
				<Printer size={14} />
			</div>
			<span class="pq-kpi-val d-num">{loading ? '—' : summary.total}</span>
		</button>

		<button
			type="button"
			class="pq-kpi"
			class:is-active={filter === 'pending'}
			onclick={() => (filter = 'pending')}
		>
			<div class="pq-kpi-top">
				<span class="pq-kpi-label">Tertunda</span>
				<span class="pq-dot is-warn" aria-hidden="true"></span>
			</div>
			<span class="pq-kpi-val d-num">{loading ? '—' : summary.pending}</span>
		</button>

		<button
			type="button"
			class="pq-kpi"
			class:is-active={filter === 'done'}
			onclick={() => (filter = 'done')}
		>
			<div class="pq-kpi-top">
				<span class="pq-kpi-label">Selesai</span>
				<span class="pq-dot is-ok" aria-hidden="true"></span>
			</div>
			<span class="pq-kpi-val d-num">{loading ? '—' : summary.done}</span>
		</button>

		<button
			type="button"
			class="pq-kpi"
			class:is-active={filter === 'failed'}
			onclick={() => (filter = 'failed')}
		>
			<div class="pq-kpi-top">
				<span class="pq-kpi-label">Gagal</span>
				<span class="pq-dot is-err" aria-hidden="true"></span>
			</div>
			<span class="pq-kpi-val d-num">{loading ? '—' : summary.failed}</span>
		</button>
	</section>

	<!-- Toolbar Pencarian & Filter -->
	<div class="pq-toolbar">
		<div class="pq-search">
			<Search size={14} />
			<input
				type="search"
				class="pq-search-input"
				placeholder="Cari printer, judul, atau pesan…"
				bind:value={query}
				aria-label="Cari log cetak"
			/>
		</div>

		<div class="pq-pills" role="group" aria-label="Filter status log">
			<button
				type="button"
				class="pq-pill"
				class:is-active={filter === 'all'}
				onclick={() => (filter = 'all')}
			>
				Semua ({summary.total})
			</button>
			<button
				type="button"
				class="pq-pill"
				class:is-active={filter === 'pending'}
				onclick={() => (filter = 'pending')}
			>
				Tertunda ({summary.pending})
			</button>
			<button
				type="button"
				class="pq-pill"
				class:is-active={filter === 'done'}
				onclick={() => (filter = 'done')}
			>
				Selesai ({summary.done})
			</button>
			<button
				type="button"
				class="pq-pill"
				class:is-active={filter === 'failed'}
				onclick={() => (filter = 'failed')}
			>
				Gagal ({summary.failed})
			</button>
		</div>
	</div>

	<!-- Daftar Log -->
	{#if loading}
		<div class="d-card pq-skel-list">
			{#each Array(4) as _, idx (idx)}
				<div class="pq-skel-row"></div>
			{/each}
		</div>
	{:else if filteredItems.length === 0}
		<section class="pq-empty" aria-label="Daftar log cetak kosong">
			<span class="pq-empty-icon" aria-hidden="true"><Printer size={20} /></span>
			<p class="pq-empty-title">
				{items.length === 0 ? 'Belum ada riwayat cetak' : 'Tidak ada log yang cocok'}
			</p>
			<p class="pq-empty-sub">
				{items.length === 0
					? 'Percobaan cetak dari layar cetak atau cetak ulang sesi akan otomatis tercatat di sini.'
					: 'Coba ubah kata kunci pencarian atau pilih status lain.'}
			</p>
			{#if items.length === 0}
				<a class="pq-btn" href="/dashboard/sessions">Buka Riwayat Sesi</a>
			{/if}
		</section>
	{:else}
		<section class="d-card pq-list-card" aria-label="Log percobaan cetak">
			<div class="pq-list">
				{#each pagedItems as item (item.id)}
					<div class="pq-row">
						<button type="button" class="pq-row-main" onclick={() => (selectedItem = item)}>
							<span
								class="pq-status-ico"
								class:is-ok={item.status === 'done'}
								class:is-err={item.status === 'failed'}
								class:is-warn={item.status === 'pending' || item.status === 'processing'}
								aria-hidden="true"
							>
								{#if item.status === 'done'}
									<CheckCircle2 size={15} />
								{:else if item.status === 'failed'}
									<AlertCircle size={15} />
								{:else}
									<Clock size={15} />
								{/if}
							</span>

							<div class="pq-row-copy">
								<div class="pq-row-top">
									<span class="pq-row-title">{item.title}</span>
									<span
										class="pq-badge"
										class:is-ok={item.status === 'done'}
										class:is-err={item.status === 'failed'}
										class:is-warn={item.status === 'pending' || item.status === 'processing'}
									>
										{statusLabel(item.status)}
									</span>
								</div>
								{#if item.detail}
									<p class="pq-row-detail">{item.detail}</p>
								{/if}
								<p class="pq-row-meta d-num">
									{fmt(item.createdAt)}{item.source ? ` · ${item.source}` : ''}
								</p>
							</div>
						</button>

						<div class="pq-row-actions">
							{#if item.status !== 'done'}
								<button
									type="button"
									class="pq-icon-btn is-ok"
									disabled={busyId === item.id}
									onclick={() => setStatus(item.id, 'done')}
									title="Tandai selesai"
									aria-label="Tandai selesai"
								>
									<Check size={14} />
								</button>
							{/if}
							{#if item.status !== 'failed'}
								<button
									type="button"
									class="pq-icon-btn is-warn"
									disabled={busyId === item.id}
									onclick={() => setStatus(item.id, 'failed')}
									title="Tandai gagal"
									aria-label="Tandai gagal"
								>
									<AlertCircle size={14} />
								</button>
							{/if}
							<button
								type="button"
								class="pq-icon-btn is-danger"
								disabled={busyId === item.id}
								onclick={() => remove(item.id)}
								title="Hapus log"
								aria-label="Hapus log"
							>
								<Trash2 size={14} />
							</button>
						</div>
					</div>
				{/each}
			</div>
		</section>

		<!-- Pagination -->
		<nav class="pq-pager" aria-label="Navigasi halaman log cetak">
			<span class="pq-pager-info d-num">
				Menampilkan {pageStart}–{pageEnd} dari {filteredItems.length} log
			</span>

			<div class="pq-pager-right">
				<div class="pq-pager-sizes" role="group" aria-label="Jumlah log per halaman">
					{#each PAGE_SIZES as size (size)}
						<button
							type="button"
							class="pq-size-btn d-num"
							class:is-active={pageSize === size}
							onclick={() => (pageSize = size)}
						>
							{size}
						</button>
					{/each}
				</div>

				{#if totalPages > 1}
					<div class="pq-pager-nav">
						<button
							type="button"
							class="pq-nav-btn"
							disabled={safePage <= 1}
							onclick={() => (currentPage = Math.max(1, safePage - 1))}
							aria-label="Halaman sebelumnya"
						>
							<ChevronLeft size={14} />
						</button>
						<span class="pq-page-num d-num">{safePage} / {totalPages}</span>
						<button
							type="button"
							class="pq-nav-btn"
							disabled={safePage >= totalPages}
							onclick={() => (currentPage = Math.min(totalPages, safePage + 1))}
							aria-label="Halaman berikutnya"
						>
							<ChevronRight size={14} />
						</button>
					</div>
				{/if}
			</div>
		</nav>
	{/if}
</div>

<!-- Modal Detail Log Cetak -->
{#if selectedItem}
	<div class="pq-modal" role="dialog" aria-modal="true" aria-label="Detail log cetak">
		<button
			type="button"
			class="pq-modal-backdrop"
			aria-label="Tutup detail log"
			onclick={() => (selectedItem = null)}
		></button>
		<div class="d-card pq-modal-box">
			<div class="pq-modal-head">
				<div>
					<h2 class="pq-modal-title">{selectedItem.title}</h2>
					<p class="pq-modal-sub d-num">
						{fmt(selectedItem.createdAt)}{selectedItem.source ? ` · ${selectedItem.source}` : ''}
					</p>
				</div>
				<button
					type="button"
					class="pq-close-btn"
					onclick={() => (selectedItem = null)}
					aria-label="Tutup"
				>
					<X size={15} />
				</button>
			</div>

			<div class="pq-modal-body">
				<div class="pq-det-row">
					<span class="pq-det-label">Status</span>
					<span
						class="pq-badge"
						class:is-ok={selectedItem.status === 'done'}
						class:is-err={selectedItem.status === 'failed'}
						class:is-warn={selectedItem.status === 'pending' ||
							selectedItem.status === 'processing'}
					>
						{statusLabel(selectedItem.status)}
					</span>
				</div>

				{#if selectedItem.detail}
					<div class="pq-det-block">
						<div class="pq-det-block-head">
							<span class="pq-det-label">Detail / Pesan Printer</span>
							<button
								type="button"
								class="pq-copy-btn"
								onclick={() => selectedItem?.detail && copyDetail(selectedItem.detail)}
							>
								{#if copiedDetail}
									<Check size={12} /> Tersalin
								{:else}
									<Copy size={12} /> Salin
								{/if}
							</button>
						</div>
						<pre class="pq-det-pre d-num">{selectedItem.detail}</pre>
					</div>
				{/if}

				<div class="pq-modal-foot">
					<button
						type="button"
						class="pq-btn is-danger-ghost"
						disabled={busyId === selectedItem.id}
						onclick={() => selectedItem && remove(selectedItem.id)}
					>
						<Trash2 size={13} />
						Hapus
					</button>
					<div class="pq-modal-foot-right">
						{#if selectedItem.status !== 'failed'}
							<button
								type="button"
								class="pq-btn"
								disabled={busyId === selectedItem.id}
								onclick={() => selectedItem && setStatus(selectedItem.id, 'failed')}
							>
								Tandai Gagal
							</button>
						{/if}
						{#if selectedItem.status !== 'done'}
							<button
								type="button"
								class="pq-btn is-primary"
								disabled={busyId === selectedItem.id}
								onclick={() => selectedItem && setStatus(selectedItem.id, 'done')}
							>
								Tandai Selesai
							</button>
						{/if}
					</div>
				</div>
			</div>
		</div>
	</div>
{/if}

<style>
	.pq-page {
		display: flex;
		flex-direction: column;
		gap: 18px;
	}

	/* ── Header Minimalis ── */
	.pq-head {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		justify-content: space-between;
		gap: 12px 18px;
	}

	.pq-head-copy {
		min-width: 0;
		flex: 1 1 240px;
	}

	.pq-title {
		margin: 0;
		font-size: clamp(1.4rem, 2vw, 1.7rem);
		font-weight: 800;
		letter-spacing: -0.025em;
		line-height: 1.15;
		color: var(--d-ink);
	}

	.pq-sub {
		margin: 4px 0 0;
		font-size: 0.82rem;
		color: var(--d-muted);
	}

	.pq-head-actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
	}

	.pq-spin-wrap {
		display: inline-grid;
		place-items: center;
	}

	.pq-spin-wrap.is-spinning {
		animation: pqSpin 850ms linear infinite;
	}

	@keyframes pqSpin {
		to {
			transform: rotate(360deg);
		}
	}

	.pq-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		height: 36px;
		padding: 0 14px;
		border: 1px solid var(--d-border);
		border-radius: 9px;
		background: var(--d-surface);
		color: var(--d-ink);
		font-family: var(--font-body);
		font-size: 0.76rem;
		font-weight: 700;
		text-decoration: none;
		white-space: nowrap;
		cursor: pointer;
		transition:
			background-color 140ms ease,
			border-color 140ms ease,
			opacity 140ms ease;
	}

	.pq-btn:hover:not(:disabled) {
		background: var(--d-surface-2);
		border-color: var(--d-border-strong);
	}

	.pq-btn:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}

	.pq-btn.is-primary {
		border-color: var(--d-ink);
		background: var(--d-ink);
		color: var(--d-bg);
	}

	.pq-btn.is-danger-ghost {
		color: var(--d-err);
		border-color: color-mix(in srgb, var(--d-err) 30%, var(--d-border));
	}

	.pq-btn.is-danger-ghost:hover:not(:disabled) {
		background: var(--d-err-soft);
		border-color: var(--d-err);
	}

	.pq-confirm-bar {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		height: 36px;
		padding: 0 6px 0 11px;
		border: 1px solid color-mix(in srgb, var(--d-err) 38%, transparent);
		border-radius: 9px;
		background: var(--d-err-soft);
		color: var(--d-err);
		font-size: 0.73rem;
		font-weight: 700;
	}

	.pq-sm-btn {
		height: 25px;
		padding: 0 8px;
		border: 1px solid var(--d-border);
		border-radius: 6px;
		background: var(--d-surface);
		color: var(--d-ink);
		font-family: var(--font-body);
		font-size: 0.7rem;
		font-weight: 700;
		cursor: pointer;
	}

	.pq-sm-btn.is-danger {
		border-color: var(--d-err);
		background: var(--d-err);
		color: #ffffff;
	}

	/* ── Compact Interactive KPIs ── */
	.pq-kpi-grid {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 10px;
	}

	.pq-kpi {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 13px 14px;
		border: 1px solid var(--d-border);
		border-radius: 12px;
		background: var(--d-surface);
		color: var(--d-ink);
		text-align: left;
		cursor: pointer;
		transition:
			border-color 140ms ease,
			background-color 140ms ease;
	}

	.pq-kpi:hover {
		border-color: var(--d-border-strong);
	}

	.pq-kpi.is-active {
		border-color: var(--d-ink);
		background: var(--d-surface-2);
	}

	.pq-kpi-top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		color: var(--d-muted);
	}

	.pq-kpi-label {
		font-size: 0.72rem;
		font-weight: 700;
	}

	.pq-kpi-val {
		font-size: 1.45rem;
		font-weight: 800;
		line-height: 1.1;
		letter-spacing: -0.02em;
	}

	.pq-dot {
		width: 8px;
		height: 8px;
		border-radius: 999px;
	}

	.pq-dot.is-ok {
		background: var(--d-ok);
	}

	.pq-dot.is-warn {
		background: var(--d-warn);
	}

	.pq-dot.is-err {
		background: var(--d-err);
	}

	/* ── Toolbar ── */
	.pq-toolbar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
	}

	.pq-search {
		position: relative;
		display: flex;
		align-items: center;
		flex: 1 1 200px;
		max-width: 300px;
		color: var(--d-muted);
	}

	.pq-search :global(svg) {
		position: absolute;
		left: 11px;
		pointer-events: none;
	}

	.pq-search-input {
		width: 100%;
		height: 34px;
		padding: 0 11px 0 32px;
		border: 1px solid var(--d-border);
		border-radius: 9px;
		background: var(--d-surface);
		color: var(--d-ink);
		font-family: var(--font-body);
		font-size: 0.78rem;
		outline: none;
	}

	.pq-search-input:focus {
		border-color: var(--d-border-strong);
	}

	.pq-pills {
		display: flex;
		flex-wrap: wrap;
		gap: 5px;
	}

	.pq-pill {
		height: 30px;
		padding: 0 10px;
		border: 1px solid var(--d-border);
		border-radius: 8px;
		background: var(--d-surface);
		color: var(--d-muted);
		font-family: var(--font-body);
		font-size: 0.72rem;
		font-weight: 700;
		cursor: pointer;
	}

	.pq-pill.is-active {
		border-color: var(--d-ink);
		background: var(--d-ink);
		color: var(--d-bg);
	}

	/* ── Empty & Skeleton ── */
	.pq-skel-list {
		padding: 12px;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.pq-skel-row {
		height: 56px;
		border-radius: 10px;
		background: var(--d-surface-2);
	}

	.pq-empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 8px;
		min-height: 250px;
		padding: 32px 20px;
		border: 1.5px dashed var(--d-border-strong);
		border-radius: 16px;
		background: var(--d-surface);
		color: var(--d-muted);
		text-align: center;
	}

	.pq-empty-icon {
		width: 44px;
		height: 44px;
		border-radius: 12px;
		border: 1px solid var(--d-border);
		background: var(--d-bg);
		color: var(--d-ink);
		display: grid;
		place-items: center;
	}

	.pq-empty-title {
		margin: 4px 0 0;
		font-size: 0.92rem;
		font-weight: 800;
		color: var(--d-ink);
	}

	.pq-empty-sub {
		margin: 0 0 8px;
		max-width: 44ch;
		font-size: 0.78rem;
		line-height: 1.5;
	}

	/* ── List Rows ── */
	.pq-list-card {
		overflow: hidden;
	}

	.pq-list {
		display: flex;
		flex-direction: column;
	}

	.pq-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		padding: 11px 14px;
		border-bottom: 1px solid var(--d-border);
		transition: background-color 120ms ease;
	}

	.pq-row:last-child {
		border-bottom: none;
	}

	.pq-row:hover {
		background: var(--d-surface-2);
	}

	.pq-row-main {
		min-width: 0;
		flex: 1;
		display: flex;
		align-items: flex-start;
		gap: 11px;
		padding: 0;
		border: none;
		background: transparent;
		text-align: left;
		cursor: pointer;
	}

	.pq-status-ico {
		margin-top: 2px;
		color: var(--d-muted);
		flex-shrink: 0;
	}

	.pq-status-ico.is-ok {
		color: var(--d-ok);
	}

	.pq-status-ico.is-warn {
		color: var(--d-warn);
	}

	.pq-status-ico.is-err {
		color: var(--d-err);
	}

	.pq-row-copy {
		min-width: 0;
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 3px;
	}

	.pq-row-top {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 7px;
	}

	.pq-row-title {
		font-size: 0.84rem;
		font-weight: 800;
		color: var(--d-ink);
	}

	.pq-badge {
		padding: 2px 7px;
		border-radius: 6px;
		background: var(--d-surface-2);
		color: var(--d-muted);
		font-size: 0.66rem;
		font-weight: 700;
	}

	.pq-badge.is-ok {
		background: var(--d-ok-soft);
		color: var(--d-ok);
	}

	.pq-badge.is-warn {
		background: var(--d-warn-soft);
		color: var(--d-warn);
	}

	.pq-badge.is-err {
		background: var(--d-err-soft);
		color: var(--d-err);
	}

	.pq-row-detail {
		margin: 0;
		font-size: 0.76rem;
		color: var(--d-muted);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.pq-row-meta {
		margin: 0;
		font-size: 0.7rem;
		color: var(--d-muted);
		opacity: 0.85;
	}

	.pq-row-actions {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		flex-shrink: 0;
	}

	.pq-icon-btn {
		width: 28px;
		height: 28px;
		border: 1px solid var(--d-border);
		border-radius: 7px;
		background: var(--d-surface);
		color: var(--d-muted);
		display: grid;
		place-items: center;
		cursor: pointer;
	}

	.pq-icon-btn.is-ok:hover:not(:disabled) {
		color: var(--d-ok);
		border-color: var(--d-ok);
		background: var(--d-ok-soft);
	}

	.pq-icon-btn.is-warn:hover:not(:disabled) {
		color: var(--d-warn);
		border-color: var(--d-warn);
		background: var(--d-warn-soft);
	}

	.pq-icon-btn.is-danger:hover:not(:disabled) {
		color: var(--d-err);
		border-color: var(--d-err);
		background: var(--d-err-soft);
	}

	/* ── Pagination ── */
	.pq-pager {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 10px 14px;
	}

	.pq-pager-info {
		font-size: 0.74rem;
		font-weight: 600;
		color: var(--d-muted);
	}

	.pq-pager-right {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 10px;
	}

	.pq-pager-sizes {
		display: inline-flex;
		padding: 2px;
		border: 1px solid var(--d-border);
		border-radius: 8px;
		background: var(--d-surface);
		gap: 2px;
	}

	.pq-size-btn {
		height: 24px;
		min-width: 30px;
		padding: 0 7px;
		border: none;
		border-radius: 6px;
		background: transparent;
		color: var(--d-muted);
		font-family: var(--font-body);
		font-size: 0.71rem;
		font-weight: 700;
		cursor: pointer;
	}

	.pq-size-btn.is-active {
		background: var(--d-ink);
		color: var(--d-bg);
	}

	.pq-pager-nav {
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}

	.pq-nav-btn {
		width: 30px;
		height: 30px;
		border: 1px solid var(--d-border);
		border-radius: 8px;
		background: var(--d-surface);
		color: var(--d-ink);
		display: grid;
		place-items: center;
		cursor: pointer;
	}

	.pq-nav-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.pq-page-num {
		min-width: 44px;
		text-align: center;
		font-size: 0.74rem;
		font-weight: 700;
		color: var(--d-ink);
	}

	/* ── Modal Detail ── */
	.pq-modal {
		position: fixed;
		inset: 0;
		z-index: 80;
		display: grid;
		place-items: center;
		padding: 18px;
	}

	.pq-modal-backdrop {
		position: absolute;
		inset: 0;
		border: none;
		background: rgba(0, 0, 0, 0.56);
		backdrop-filter: blur(4px);
		cursor: pointer;
	}

	.pq-modal-box {
		position: relative;
		z-index: 1;
		width: min(94vw, 560px);
		max-height: 88dvh;
		display: flex;
		flex-direction: column;
		box-shadow: 0 24px 60px rgba(0, 0, 0, 0.4);
	}

	.pq-modal-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 12px;
		padding: 14px 18px;
		border-bottom: 1px solid var(--d-border);
	}

	.pq-modal-title {
		margin: 0;
		font-size: 0.94rem;
		font-weight: 800;
		color: var(--d-ink);
	}

	.pq-modal-sub {
		margin: 2px 0 0;
		font-size: 0.73rem;
		color: var(--d-muted);
	}

	.pq-close-btn {
		width: 30px;
		height: 30px;
		border: 1px solid var(--d-border);
		border-radius: 8px;
		background: var(--d-surface-2);
		color: var(--d-ink);
		display: grid;
		place-items: center;
		cursor: pointer;
	}

	.pq-modal-body {
		overflow-y: auto;
		padding: 16px 18px 18px;
		display: flex;
		flex-direction: column;
		gap: 14px;
	}

	.pq-det-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.pq-det-label {
		font-size: 0.72rem;
		font-weight: 700;
		color: var(--d-muted);
	}

	.pq-det-block {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.pq-det-block-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.pq-copy-btn {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 3px 8px;
		border: 1px solid var(--d-border);
		border-radius: 6px;
		background: var(--d-surface-2);
		color: var(--d-ink);
		font-family: var(--font-body);
		font-size: 0.69rem;
		font-weight: 700;
		cursor: pointer;
	}

	.pq-det-pre {
		margin: 0;
		padding: 10px 12px;
		border: 1px solid var(--d-border);
		border-radius: 10px;
		background: var(--d-bg);
		color: var(--d-ink);
		font-size: 0.75rem;
		line-height: 1.5;
		white-space: pre-wrap;
		word-break: break-word;
		max-height: 220px;
		overflow-y: auto;
	}

	.pq-modal-foot {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		padding-top: 10px;
		border-top: 1px solid var(--d-border);
	}

	.pq-modal-foot-right {
		display: flex;
		gap: 8px;
	}

	@media (max-width: 720px) {
		.pq-kpi-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
</style>
