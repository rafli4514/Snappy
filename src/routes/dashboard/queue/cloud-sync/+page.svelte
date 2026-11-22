<script lang="ts">
	import { onMount } from 'svelte';
	import {
		Cloud,
		FolderArchive,
		Plus,
		RefreshCw,
		Trash2,
		Search,
		CheckCircle2,
		Clock,
		Check,
		RotateCcw,
		X,
		ChevronLeft,
		ChevronRight
	} from '@lucide/svelte';

	type Item = {
		id: string;
		status: string;
		title: string;
		detail?: string;
		ref?: string;
		createdAt: string;
	};
	type StatusFilter = 'all' | 'pending' | 'done';

	const PAGE_SIZES = [10, 25, 50];

	let loading = $state(true);
	let saving = $state(false);
	let busyId = $state<string | null>(null);
	let clearing = $state(false);
	let confirmClear = $state(false);
	let error = $state<string | null>(null);
	let notice = $state<string | null>(null);

	let items = $state<Item[]>([]);
	let summary = $state({ total: 0, pending: 0, failed: 0, done: 0 });
	let context = $state<{ gallerySessions?: number }>({});

	let filter = $state<StatusFilter>('all');
	let query = $state('');
	let pageSize = $state(10);
	let currentPage = $state(1);

	// Modal Tambah Catatan
	let showAddModal = $state(false);
	let draftTitle = $state('');
	let draftDetail = $state('');

	const filteredItems = $derived.by(() => {
		const q = query.trim().toLowerCase();
		return items.filter((item) => {
			if (filter === 'pending' && item.status !== 'pending' && item.status !== 'processing') {
				return false;
			}
			if (filter === 'done' && item.status !== 'done') return false;
			if (!q) return true;
			return (
				item.title.toLowerCase().includes(q) ||
				(item.detail || '').toLowerCase().includes(q) ||
				(item.ref || '').toLowerCase().includes(q)
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
			const res = await fetch('/api/queue?type=cloud-sync&limit=200');
			const data = (await res.json()) as {
				ok?: boolean;
				items?: Item[];
				summary?: Record<string, typeof summary>;
				context?: typeof context;
				error?: string;
			};
			if (!res.ok || !data.ok) throw new Error(data.error || 'Gagal memuat antrean cloud sync.');
			items = data.items || [];
			summary = data.summary?.['cloud-sync'] || { total: 0, pending: 0, failed: 0, done: 0 };
			context = data.context || {};
		} catch (e) {
			error = e instanceof Error ? e.message : 'Gagal memuat antrean cloud sync.';
		} finally {
			loading = false;
		}
	}

	function openAddModal(): void {
		error = null;
		notice = null;
		draftTitle = '';
		draftDetail = '';
		showAddModal = true;
	}

	function closeAddModal(): void {
		if (saving) return;
		showAddModal = false;
	}

	async function enqueue(e: SubmitEvent): Promise<void> {
		e.preventDefault();
		saving = true;
		error = null;
		notice = null;
		try {
			const res = await fetch('/api/queue', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					type: 'cloud-sync',
					title: draftTitle.trim() || 'Arsip sesi lokal',
					detail: draftDetail.trim() || 'Menunggu sinkronisasi manual ke penyimpanan cloud.',
					source: 'dashboard'
				})
			});
			const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
			if (!res.ok || !data.ok) throw new Error(data.error || 'Gagal menambah catatan.');
			showAddModal = false;
			notice = 'Catatan sinkronisasi ditambahkan.';
			await load();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Gagal menambah catatan.';
		} finally {
			saving = false;
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
			if (!res.ok || !data.ok) throw new Error(data.error || 'Gagal menghapus catatan.');
			await load();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Gagal menghapus catatan.';
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
				body: JSON.stringify({ type: 'cloud-sync' })
			});
			const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
			if (!res.ok || !data.ok) throw new Error(data.error || 'Gagal membersihkan catatan.');
			confirmClear = false;
			notice = 'Seluruh catatan sinkronisasi telah dibersihkan.';
			await load();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Gagal membersihkan catatan.';
		} finally {
			clearing = false;
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
		return status;
	}

	function handleWindowKeydown(e: KeyboardEvent): void {
		if (e.key === 'Escape' && showAddModal) {
			closeAddModal();
		}
	}

	onMount(() => void load());
</script>

<svelte:window onkeydown={handleWindowKeydown} />

<div class="cs-page">
	<header class="cs-head">
		<div class="cs-head-copy">
			<div class="cs-title-row">
				<h1 class="cs-title">Sinkronisasi Cloud</h1>
				<span class="cs-mode-pill">Mode Lokal</span>
			</div>
			<p class="cs-sub">
				Catat dan kelola daftar arsip sesi yang menunggu sinkronisasi ke penyimpanan cloud.
			</p>
		</div>

		<div class="cs-head-actions">
			<button type="button" class="cs-btn" onclick={load} disabled={loading}>
				<span class="cs-spin-wrap" class:is-spinning={loading}><RefreshCw size={14} /></span>
				Muat Ulang
			</button>

			{#if items.length > 0}
				{#if confirmClear}
					<div class="cs-confirm-bar" role="group" aria-label="Konfirmasi hapus semua catatan">
						<span>Hapus semua?</span>
						<button
							type="button"
							class="cs-sm-btn is-danger"
							onclick={clearAll}
							disabled={clearing}
						>
							{clearing ? '…' : 'Ya, Hapus'}
						</button>
						<button
							type="button"
							class="cs-sm-btn"
							onclick={() => (confirmClear = false)}
							disabled={clearing}
						>
							Batal
						</button>
					</div>
				{:else}
					<button
						type="button"
						class="cs-btn is-danger-ghost"
						onclick={() => (confirmClear = true)}
						disabled={loading || clearing}
					>
						<Trash2 size={14} />
						Bersihkan
					</button>
				{/if}
			{/if}

			<button type="button" class="cs-btn is-primary" onclick={openAddModal} disabled={saving}>
				<Plus size={15} />
				Tambah Catatan
			</button>
		</div>
	</header>

	{#if error && !showAddModal}
		<div class="d-banner d-banner-err" role="alert"><span>{error}</span></div>
	{/if}
	{#if notice}
		<div class="d-banner d-banner-ok" role="status"><span>{notice}</span></div>
	{/if}

	<!-- Ringkasan Status -->
	<section class="cs-kpi-grid" aria-label="Ringkasan sinkronisasi cloud">
		<a class="cs-kpi is-link" href="/dashboard/sessions">
			<div class="cs-kpi-top">
				<span class="cs-kpi-label">Sesi Lokal</span>
				<FolderArchive size={14} />
			</div>
			<span class="cs-kpi-val d-num">{loading ? '—' : (context.gallerySessions ?? 0)}</span>
		</a>

		<button
			type="button"
			class="cs-kpi"
			class:is-active={filter === 'all'}
			onclick={() => (filter = 'all')}
		>
			<div class="cs-kpi-top">
				<span class="cs-kpi-label">Total Catatan</span>
				<Cloud size={14} />
			</div>
			<span class="cs-kpi-val d-num">{loading ? '—' : summary.total}</span>
		</button>

		<button
			type="button"
			class="cs-kpi"
			class:is-active={filter === 'pending'}
			onclick={() => (filter = 'pending')}
		>
			<div class="cs-kpi-top">
				<span class="cs-kpi-label">Tertunda</span>
				<span class="cs-dot is-warn" aria-hidden="true"></span>
			</div>
			<span class="cs-kpi-val d-num">{loading ? '—' : summary.pending}</span>
		</button>

		<button
			type="button"
			class="cs-kpi"
			class:is-active={filter === 'done'}
			onclick={() => (filter = 'done')}
		>
			<div class="cs-kpi-top">
				<span class="cs-kpi-label">Selesai</span>
				<span class="cs-dot is-ok" aria-hidden="true"></span>
			</div>
			<span class="cs-kpi-val d-num">{loading ? '—' : summary.done}</span>
		</button>
	</section>

	<!-- Toolbar Pencarian & Filter -->
	<div class="cs-toolbar">
		<div class="cs-search">
			<Search size={14} />
			<input
				type="search"
				class="cs-search-input"
				placeholder="Cari arsip atau catatan…"
				bind:value={query}
				aria-label="Cari catatan sinkronisasi"
			/>
		</div>

		<div class="cs-pills" role="group" aria-label="Filter status sinkronisasi">
			<button
				type="button"
				class="cs-pill"
				class:is-active={filter === 'all'}
				onclick={() => (filter = 'all')}
			>
				Semua ({summary.total})
			</button>
			<button
				type="button"
				class="cs-pill"
				class:is-active={filter === 'pending'}
				onclick={() => (filter = 'pending')}
			>
				Tertunda ({summary.pending})
			</button>
			<button
				type="button"
				class="cs-pill"
				class:is-active={filter === 'done'}
				onclick={() => (filter = 'done')}
			>
				Selesai ({summary.done})
			</button>
		</div>
	</div>

	<!-- Daftar Catatan -->
	{#if loading}
		<div class="d-card cs-skel-list">
			{#each Array(4) as _, idx (idx)}
				<div class="cs-skel-row"></div>
			{/each}
		</div>
	{:else if filteredItems.length === 0}
		<section class="cs-empty" aria-label="Daftar sinkronisasi kosong">
			<span class="cs-empty-icon" aria-hidden="true"><Cloud size={20} /></span>
			<p class="cs-empty-title">
				{items.length === 0 ? 'Belum ada catatan sinkronisasi' : 'Tidak ada catatan yang cocok'}
			</p>
			<p class="cs-empty-sub">
				{items.length === 0
					? 'Tambahkan catatan paket sesi atau arsip untuk melacak status cadangan secara lokal.'
					: 'Coba ubah kata kunci pencarian atau pilih filter status lain.'}
			</p>
			{#if items.length === 0}
				<button type="button" class="cs-btn is-primary" onclick={openAddModal}>
					<Plus size={14} />
					Tambah Catatan Pertama
				</button>
			{/if}
		</section>
	{:else}
		<section class="d-card cs-list-card" aria-label="Daftar penanda sinkronisasi">
			<div class="cs-list">
				{#each pagedItems as item (item.id)}
					<div class="cs-row">
						<div class="cs-row-main">
							<span
								class="cs-status-ico"
								class:is-ok={item.status === 'done'}
								class:is-warn={item.status !== 'done'}
								aria-hidden="true"
							>
								{#if item.status === 'done'}
									<CheckCircle2 size={15} />
								{:else}
									<Clock size={15} />
								{/if}
							</span>

							<div class="cs-row-copy">
								<div class="cs-row-top">
									<span class="cs-row-title">{item.title}</span>
									<span
										class="cs-badge"
										class:is-ok={item.status === 'done'}
										class:is-warn={item.status !== 'done'}
									>
										{statusLabel(item.status)}
									</span>
								</div>
								{#if item.detail}
									<p class="cs-row-detail">{item.detail}</p>
								{/if}
								<p class="cs-row-meta d-num">
									{fmt(item.createdAt)}{item.ref ? ` · ${item.ref}` : ''}
								</p>
							</div>
						</div>

						<div class="cs-row-actions">
							{#if item.status !== 'done'}
								<button
									type="button"
									class="cs-icon-btn is-ok"
									disabled={busyId === item.id}
									onclick={() => setStatus(item.id, 'done')}
									title="Tandai selesai"
									aria-label="Tandai selesai"
								>
									<Check size={14} />
								</button>
							{:else}
								<button
									type="button"
									class="cs-icon-btn is-warn"
									disabled={busyId === item.id}
									onclick={() => setStatus(item.id, 'pending')}
									title="Kembalikan ke tertunda"
									aria-label="Kembalikan ke tertunda"
								>
									<RotateCcw size={13} />
								</button>
							{/if}
							<button
								type="button"
								class="cs-icon-btn is-danger"
								disabled={busyId === item.id}
								onclick={() => remove(item.id)}
								title="Hapus catatan"
								aria-label="Hapus catatan"
							>
								<Trash2 size={14} />
							</button>
						</div>
					</div>
				{/each}
			</div>
		</section>

		<!-- Pagination -->
		<nav class="cs-pager" aria-label="Navigasi halaman sinkronisasi">
			<span class="cs-pager-info d-num">
				Menampilkan {pageStart}–{pageEnd} dari {filteredItems.length} catatan
			</span>

			<div class="cs-pager-right">
				<div class="cs-pager-sizes" role="group" aria-label="Jumlah catatan per halaman">
					{#each PAGE_SIZES as size (size)}
						<button
							type="button"
							class="cs-size-btn d-num"
							class:is-active={pageSize === size}
							onclick={() => (pageSize = size)}
						>
							{size}
						</button>
					{/each}
				</div>

				{#if totalPages > 1}
					<div class="cs-pager-nav">
						<button
							type="button"
							class="cs-nav-btn"
							disabled={safePage <= 1}
							onclick={() => (currentPage = Math.max(1, safePage - 1))}
							aria-label="Halaman sebelumnya"
						>
							<ChevronLeft size={14} />
						</button>
						<span class="cs-page-num d-num">{safePage} / {totalPages}</span>
						<button
							type="button"
							class="cs-nav-btn"
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

<!-- Modal Tambah Catatan Sinkronisasi -->
{#if showAddModal}
	<div class="cs-modal" role="dialog" aria-modal="true" aria-label="Tambah catatan sinkronisasi">
		<button
			type="button"
			class="cs-modal-backdrop"
			aria-label="Tutup formulir"
			onclick={closeAddModal}
		></button>
		<div class="d-card cs-modal-box">
			<div class="cs-modal-head">
				<div>
					<h2 class="cs-modal-title">Tambah Catatan Sinkronisasi</h2>
					<p class="cs-modal-sub">
						Tersimpan secara lokal sebagai daftar arsip yang perlu dicadangkan.
					</p>
				</div>
				<button type="button" class="cs-close-btn" onclick={closeAddModal} aria-label="Tutup">
					<X size={15} />
				</button>
			</div>

			<form class="cs-modal-body" onsubmit={enqueue}>
				{#if error}
					<div class="d-banner d-banner-err" role="alert"><span>{error}</span></div>
				{/if}

				<div class="cs-field">
					<label class="cs-label" for="cs-title">Judul Arsip / Sesi</label>
					<input
						id="cs-title"
						type="text"
						class="cs-input"
						bind:value={draftTitle}
						placeholder="Contoh: Arsip acara malam ini"
						maxlength="140"
						required
					/>
				</div>

				<div class="cs-field">
					<label class="cs-label" for="cs-detail">Catatan (opsional)</label>
					<textarea
						id="cs-detail"
						class="cs-textarea"
						rows="3"
						bind:value={draftDetail}
						placeholder="Contoh: Folder Google Drive acara pernikahan"
						maxlength="400"></textarea>
				</div>

				<div class="cs-modal-foot">
					<button type="button" class="cs-btn" onclick={closeAddModal} disabled={saving}>
						Batal
					</button>
					<button type="submit" class="cs-btn is-primary" disabled={saving}>
						{saving ? 'Menyimpan…' : 'Simpan Catatan'}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}

<style>
	.cs-page {
		display: flex;
		flex-direction: column;
		gap: 18px;
	}

	/* ── Header Minimalis ── */
	.cs-head {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		justify-content: space-between;
		gap: 12px 18px;
	}

	.cs-head-copy {
		min-width: 0;
		flex: 1 1 240px;
	}

	.cs-title-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 10px;
	}

	.cs-title {
		margin: 0;
		font-size: clamp(1.4rem, 2vw, 1.7rem);
		font-weight: 800;
		letter-spacing: -0.025em;
		line-height: 1.15;
		color: var(--d-ink);
	}

	.cs-mode-pill {
		padding: 3px 8px;
		border-radius: 999px;
		border: 1px solid var(--d-border);
		background: var(--d-surface);
		color: var(--d-muted);
		font-size: 0.68rem;
		font-weight: 700;
	}

	.cs-sub {
		margin: 4px 0 0;
		font-size: 0.82rem;
		color: var(--d-muted);
	}

	.cs-head-actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
	}

	.cs-spin-wrap {
		display: inline-grid;
		place-items: center;
	}

	.cs-spin-wrap.is-spinning {
		animation: csSpin 850ms linear infinite;
	}

	@keyframes csSpin {
		to {
			transform: rotate(360deg);
		}
	}

	.cs-btn {
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
		white-space: nowrap;
		cursor: pointer;
		transition:
			background-color 140ms ease,
			border-color 140ms ease,
			opacity 140ms ease;
	}

	.cs-btn:hover:not(:disabled) {
		background: var(--d-surface-2);
		border-color: var(--d-border-strong);
	}

	.cs-btn:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}

	.cs-btn.is-primary {
		border-color: var(--d-ink);
		background: var(--d-ink);
		color: var(--d-bg);
	}

	.cs-btn.is-danger-ghost {
		color: var(--d-err);
		border-color: color-mix(in srgb, var(--d-err) 30%, var(--d-border));
	}

	.cs-btn.is-danger-ghost:hover:not(:disabled) {
		background: var(--d-err-soft);
		border-color: var(--d-err);
	}

	.cs-confirm-bar {
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

	.cs-sm-btn {
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

	.cs-sm-btn.is-danger {
		border-color: var(--d-err);
		background: var(--d-err);
		color: #ffffff;
	}

	/* ── Compact KPIs ── */
	.cs-kpi-grid {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 10px;
	}

	.cs-kpi {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 13px 14px;
		border: 1px solid var(--d-border);
		border-radius: 12px;
		background: var(--d-surface);
		color: var(--d-ink);
		text-align: left;
		text-decoration: none;
		cursor: pointer;
		transition:
			border-color 140ms ease,
			background-color 140ms ease;
	}

	.cs-kpi:hover {
		border-color: var(--d-border-strong);
	}

	.cs-kpi.is-active {
		border-color: var(--d-ink);
		background: var(--d-surface-2);
	}

	.cs-kpi.is-link:hover {
		background: var(--d-surface-2);
	}

	.cs-kpi-top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		color: var(--d-muted);
	}

	.cs-kpi-label {
		font-size: 0.72rem;
		font-weight: 700;
	}

	.cs-kpi-val {
		font-size: 1.45rem;
		font-weight: 800;
		line-height: 1.1;
		letter-spacing: -0.02em;
	}

	.cs-dot {
		width: 8px;
		height: 8px;
		border-radius: 999px;
	}

	.cs-dot.is-ok {
		background: var(--d-ok);
	}

	.cs-dot.is-warn {
		background: var(--d-warn);
	}

	/* ── Toolbar ── */
	.cs-toolbar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
	}

	.cs-search {
		position: relative;
		display: flex;
		align-items: center;
		flex: 1 1 200px;
		max-width: 300px;
		color: var(--d-muted);
	}

	.cs-search :global(svg) {
		position: absolute;
		left: 11px;
		pointer-events: none;
	}

	.cs-search-input {
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

	.cs-search-input:focus {
		border-color: var(--d-border-strong);
	}

	.cs-pills {
		display: flex;
		flex-wrap: wrap;
		gap: 5px;
	}

	.cs-pill {
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

	.cs-pill.is-active {
		border-color: var(--d-ink);
		background: var(--d-ink);
		color: var(--d-bg);
	}

	/* ── Empty & Skeleton ── */
	.cs-skel-list {
		padding: 12px;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.cs-skel-row {
		height: 56px;
		border-radius: 10px;
		background: var(--d-surface-2);
	}

	.cs-empty {
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

	.cs-empty-icon {
		width: 44px;
		height: 44px;
		border-radius: 12px;
		border: 1px solid var(--d-border);
		background: var(--d-bg);
		color: var(--d-ink);
		display: grid;
		place-items: center;
	}

	.cs-empty-title {
		margin: 4px 0 0;
		font-size: 0.92rem;
		font-weight: 800;
		color: var(--d-ink);
	}

	.cs-empty-sub {
		margin: 0 0 8px;
		max-width: 44ch;
		font-size: 0.78rem;
		line-height: 1.5;
	}

	/* ── List Rows ── */
	.cs-list-card {
		overflow: hidden;
	}

	.cs-list {
		display: flex;
		flex-direction: column;
	}

	.cs-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		padding: 11px 14px;
		border-bottom: 1px solid var(--d-border);
	}

	.cs-row:last-child {
		border-bottom: none;
	}

	.cs-row:hover {
		background: var(--d-surface-2);
	}

	.cs-row-main {
		min-width: 0;
		flex: 1;
		display: flex;
		align-items: flex-start;
		gap: 11px;
	}

	.cs-status-ico {
		margin-top: 2px;
		flex-shrink: 0;
	}

	.cs-status-ico.is-ok {
		color: var(--d-ok);
	}

	.cs-status-ico.is-warn {
		color: var(--d-warn);
	}

	.cs-row-copy {
		min-width: 0;
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 3px;
	}

	.cs-row-top {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 7px;
	}

	.cs-row-title {
		font-size: 0.84rem;
		font-weight: 800;
		color: var(--d-ink);
	}

	.cs-badge {
		padding: 2px 7px;
		border-radius: 6px;
		font-size: 0.66rem;
		font-weight: 700;
	}

	.cs-badge.is-ok {
		background: var(--d-ok-soft);
		color: var(--d-ok);
	}

	.cs-badge.is-warn {
		background: var(--d-warn-soft);
		color: var(--d-warn);
	}

	.cs-row-detail {
		margin: 0;
		font-size: 0.76rem;
		color: var(--d-muted);
		line-height: 1.4;
	}

	.cs-row-meta {
		margin: 0;
		font-size: 0.7rem;
		color: var(--d-muted);
		opacity: 0.85;
	}

	.cs-row-actions {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		flex-shrink: 0;
	}

	.cs-icon-btn {
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

	.cs-icon-btn.is-ok:hover:not(:disabled) {
		color: var(--d-ok);
		border-color: var(--d-ok);
		background: var(--d-ok-soft);
	}

	.cs-icon-btn.is-warn:hover:not(:disabled) {
		color: var(--d-warn);
		border-color: var(--d-warn);
		background: var(--d-warn-soft);
	}

	.cs-icon-btn.is-danger:hover:not(:disabled) {
		color: var(--d-err);
		border-color: var(--d-err);
		background: var(--d-err-soft);
	}

	/* ── Pagination ── */
	.cs-pager {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 10px 14px;
	}

	.cs-pager-info {
		font-size: 0.74rem;
		font-weight: 600;
		color: var(--d-muted);
	}

	.cs-pager-right {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 10px;
	}

	.cs-pager-sizes {
		display: inline-flex;
		padding: 2px;
		border: 1px solid var(--d-border);
		border-radius: 8px;
		background: var(--d-surface);
		gap: 2px;
	}

	.cs-size-btn {
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

	.cs-size-btn.is-active {
		background: var(--d-ink);
		color: var(--d-bg);
	}

	.cs-pager-nav {
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}

	.cs-nav-btn {
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

	.cs-nav-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.cs-page-num {
		min-width: 44px;
		text-align: center;
		font-size: 0.74rem;
		font-weight: 700;
		color: var(--d-ink);
	}

	/* ── Modal Tambah Catatan ── */
	.cs-modal {
		position: fixed;
		inset: 0;
		z-index: 80;
		display: grid;
		place-items: center;
		padding: 18px;
	}

	.cs-modal-backdrop {
		position: absolute;
		inset: 0;
		border: none;
		background: rgba(0, 0, 0, 0.56);
		backdrop-filter: blur(4px);
		cursor: pointer;
	}

	.cs-modal-box {
		position: relative;
		z-index: 1;
		width: min(94vw, 480px);
		max-height: 88dvh;
		display: flex;
		flex-direction: column;
		box-shadow: 0 24px 60px rgba(0, 0, 0, 0.4);
	}

	.cs-modal-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 12px;
		padding: 14px 18px;
		border-bottom: 1px solid var(--d-border);
	}

	.cs-modal-title {
		margin: 0;
		font-size: 0.94rem;
		font-weight: 800;
		color: var(--d-ink);
	}

	.cs-modal-sub {
		margin: 2px 0 0;
		font-size: 0.74rem;
		color: var(--d-muted);
	}

	.cs-close-btn {
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

	.cs-modal-body {
		overflow-y: auto;
		padding: 16px 18px 18px;
		display: flex;
		flex-direction: column;
		gap: 14px;
	}

	.cs-field {
		display: flex;
		flex-direction: column;
		gap: 5px;
	}

	.cs-label {
		font-size: 0.72rem;
		font-weight: 700;
		color: var(--d-muted);
	}

	.cs-input,
	.cs-textarea {
		padding: 8px 10px;
		border: 1px solid var(--d-border);
		border-radius: 9px;
		background: var(--d-bg);
		color: var(--d-ink);
		font-family: var(--font-body);
		font-size: 0.8rem;
		font-weight: 600;
		outline: none;
		width: 100%;
	}

	.cs-input {
		height: 36px;
		padding: 0 10px;
	}

	.cs-textarea {
		resize: vertical;
		line-height: 1.45;
	}

	.cs-input:focus,
	.cs-textarea:focus {
		border-color: var(--d-border-strong);
	}

	.cs-modal-foot {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
		padding-top: 10px;
		border-top: 1px solid var(--d-border);
	}

	@media (max-width: 720px) {
		.cs-kpi-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
</style>
