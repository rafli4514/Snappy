<script lang="ts">
	import { onMount } from 'svelte';

	type Item = {
		id: string;
		status: string;
		title: string;
		detail?: string;
		ref?: string;
		createdAt: string;
	};
	type StatusFilter = 'all' | 'pending' | 'done';

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
	let title = $state('');
	let filter = $state<StatusFilter>('all');

	let filteredItems = $derived(
		items.filter((item) => {
			if (filter === 'all') return true;
			if (filter === 'pending') return item.status === 'pending' || item.status === 'processing';
			return item.status === filter;
		})
	);

	async function load(): Promise<void> {
		loading = true;
		error = null;
		try {
			const res = await fetch('/api/queue?type=cloud-sync&limit=120');
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
					title: title.trim() || 'Calon sinkronisasi (lokal)',
					detail: 'MVP lokal: ditandai untuk sinkronisasi saat backend cloud tersedia.',
					source: 'dashboard'
				})
			});
			const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
			if (!res.ok || !data.ok) throw new Error(data.error || 'Gagal menambah item lokal.');
			title = '';
			notice = 'Penanda lokal berhasil ditambahkan (belum dikirim ke cloud).';
			await load();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Gagal menambah item lokal.';
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
			if (!res.ok || !data.ok) throw new Error(data.error || 'Gagal menghapus item.');
			await load();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Gagal menghapus item.';
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
			if (!res.ok || !data.ok) throw new Error(data.error || 'Gagal membersihkan item.');
			confirmClear = false;
			notice = 'Seluruh penanda cloud sync lokal telah dihapus.';
			await load();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Gagal membersihkan item.';
		} finally {
			clearing = false;
		}
	}

	onMount(() => void load());

	function fmt(iso: string): string {
		try {
			return new Date(iso).toLocaleString('id-ID', {
				dateStyle: 'medium',
				timeStyle: 'short'
			});
		} catch {
			return iso;
		}
	}

	function statusPillClass(status: string): string {
		if (status === 'done') return 'd-pill d-pill-ok';
		if (status === 'failed') return 'd-pill d-pill-err';
		if (status === 'pending' || status === 'processing') return 'd-pill d-pill-warn';
		return 'd-pill';
	}

	function statusLabel(status: string): string {
		if (status === 'done') return 'Selesai (Lokal)';
		if (status === 'failed') return 'Gagal';
		if (status === 'pending') return 'Tertunda';
		if (status === 'processing') return 'Diproses';
		return status;
	}
</script>

<div class="d-page">
	<header class="d-head">
		<div>
			<p class="d-eyebrow">Antrean · Sinkronisasi Cloud</p>
			<h1 class="d-title">Sinkronisasi Cloud</h1>
			<p class="d-sub">
				Pelacakan lokal niat atau calon sinkronisasi pada perangkat ini. Belum ada backend cloud
				sync aktif dan tidak ada data yang dikirim keluar perangkat.
			</p>
		</div>
		<div class="d-actions">
			<a class="d-btn" href="/dashboard/queue">Kembali</a>
			<button type="button" class="d-btn" onclick={load} disabled={loading}>
				{loading ? 'Memuat…' : 'Muat Ulang'}
			</button>
			{#if !confirmClear}
				<button
					type="button"
					class="d-btn d-btn-danger"
					onclick={() => (confirmClear = true)}
					disabled={loading || clearing || items.length === 0}
				>
					Bersihkan Semua
				</button>
			{:else}
				<div class="confirm-inline" role="group" aria-label="Konfirmasi hapus semua">
					<span class="confirm-text">Hapus semua item?</span>
					<button
						type="button"
						class="d-btn d-btn-danger d-btn-sm"
						onclick={clearAll}
						disabled={clearing}
					>
						{clearing ? 'Menghapus…' : 'Ya, Hapus'}
					</button>
					<button
						type="button"
						class="d-btn d-btn-sm"
						onclick={() => (confirmClear = false)}
						disabled={clearing}
					>
						Batal
					</button>
				</div>
			{/if}
		</div>
	</header>

	<div class="d-banner d-banner-info" role="note">
		<span>
			Mode MVP lokal: menandai item sebagai "Selesai" hanya mengubah status di catatan lokal, bukan
			bukti unggahan ke server cloud.
		</span>
	</div>

	{#if error}
		<div class="d-banner d-banner-warn" role="status"><span>{error}</span></div>
	{/if}
	{#if notice}
		<div class="d-banner d-banner-ok" role="status"><span>{notice}</span></div>
	{/if}

	<section class="d-kpi-grid" aria-label="Ringkasan cloud sync">
		<div class="d-kpi">
			<div class="d-kpi-top"><p class="d-kpi-label">Sesi Galeri Lokal</p></div>
			<p class="d-kpi-val">{loading ? '—' : (context.gallerySessions ?? 0)}</p>
			<p class="d-kpi-hint">Tersimpan di penyimpanan lokal</p>
		</div>
		<div class="d-kpi">
			<div class="d-kpi-top"><p class="d-kpi-label">Total Penanda</p></div>
			<p class="d-kpi-val">{loading ? '—' : summary.total}</p>
			<p class="d-kpi-hint">Catatan sinkronisasi lokal</p>
		</div>
		<div class="d-kpi">
			<div class="d-kpi-top"><p class="d-kpi-label">Tertunda</p></div>
			<p class="d-kpi-val">{loading ? '—' : summary.pending}</p>
			<p class="d-kpi-hint">Menunggu proses sinkronisasi</p>
		</div>
		<div class="d-kpi">
			<div class="d-kpi-top"><p class="d-kpi-label">Ditandai Selesai</p></div>
			<p class="d-kpi-val">{loading ? '—' : summary.done}</p>
			<p class="d-kpi-hint">Status lokal saja</p>
		</div>
	</section>

	<section class="d-card" aria-label="Tambah penanda lokal">
		<div class="d-card-head">
			<div>
				<h2 class="d-card-title">Tambah Penanda Lokal</h2>
				<p class="d-card-sub">Catat paket sesi atau catatan arsip untuk sinkronisasi manual.</p>
			</div>
		</div>
		<div class="d-card-body">
			<form class="add-form" onsubmit={enqueue}>
				<div class="d-field add-input">
					<label class="d-field-label" for="cs-title">Judul atau Catatan (Opsional)</label>
					<input
						id="cs-title"
						class="d-input"
						type="text"
						bind:value={title}
						placeholder="Contoh: Arsip acara malam ini"
					/>
				</div>
				<button type="submit" class="d-btn d-btn-primary" disabled={saving}>
					{saving ? 'Menambahkan…' : 'Tambah Penanda'}
				</button>
			</form>
		</div>
	</section>

	<section class="d-card" aria-label="Daftar item cloud sync">
		<div class="d-card-head">
			<div>
				<h2 class="d-card-title">Daftar Penanda Lokal</h2>
				<p class="d-card-sub d-num">
					Menampilkan {loading ? '…' : filteredItems.length} dari {loading ? '…' : items.length} item
				</p>
			</div>
			<div class="d-tabs" role="tablist" aria-label="Filter status">
				<button
					type="button"
					role="tab"
					class="d-tab"
					class:is-active={filter === 'all'}
					aria-selected={filter === 'all'}
					onclick={() => (filter = 'all')}
				>
					Semua
				</button>
				<button
					type="button"
					role="tab"
					class="d-tab"
					class:is-active={filter === 'pending'}
					aria-selected={filter === 'pending'}
					onclick={() => (filter = 'pending')}
				>
					Tertunda
				</button>
				<button
					type="button"
					role="tab"
					class="d-tab"
					class:is-active={filter === 'done'}
					aria-selected={filter === 'done'}
					onclick={() => (filter = 'done')}
				>
					Selesai
				</button>
			</div>
		</div>

		{#if loading}
			<div class="d-empty"><p>Memuat daftar penanda lokal…</p></div>
		{:else if filteredItems.length === 0}
			<div class="d-empty">
				<p class="d-empty-title">
					{items.length === 0 ? 'Belum ada item sinkronisasi' : 'Tidak ada item pada filter ini'}
				</p>
				<p>
					{items.length === 0
						? 'Tambahkan penanda lokal melalui formulir di atas bila diperlukan.'
						: 'Pilih filter lain untuk melihat seluruh daftar.'}
				</p>
			</div>
		{:else}
			<div class="d-list">
				{#each filteredItems as item (item.id)}
					<div class="d-row">
						<div class="item-info">
							<div class="item-top">
								<p class="item-title">{item.title}</p>
								<span class={statusPillClass(item.status)}>{statusLabel(item.status)}</span>
							</div>
							<p class="item-meta d-num">
								{fmt(item.createdAt)}{item.ref ? ` · ${item.ref}` : ''}
							</p>
							{#if item.detail}
								<p class="item-detail">{item.detail}</p>
							{/if}
						</div>
						<div class="d-actions">
							<button
								type="button"
								class="d-btn d-btn-sm"
								disabled={busyId === item.id || item.status === 'done'}
								onclick={() => setStatus(item.id, 'done')}
							>
								Selesai
							</button>
							<button
								type="button"
								class="d-btn d-btn-sm"
								disabled={busyId === item.id || item.status === 'pending'}
								onclick={() => setStatus(item.id, 'pending')}
							>
								Tertunda
							</button>
							<button
								type="button"
								class="d-btn d-btn-danger d-btn-sm"
								disabled={busyId === item.id}
								onclick={() => remove(item.id)}
							>
								Hapus
							</button>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</section>
</div>

<style>
	.confirm-inline {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		padding: 4px 6px 4px 12px;
		border: 1px solid color-mix(in srgb, var(--d-err) 40%, transparent);
		border-radius: 999px;
		background: var(--d-err-soft);
	}

	.confirm-text {
		font-size: 0.74rem;
		font-weight: 700;
		color: var(--d-err);
	}

	.add-form {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		gap: 10px;
	}

	.add-input {
		flex: 1;
		min-width: 220px;
	}

	.item-info {
		flex: 1;
		min-width: 220px;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.item-top {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
	}

	.item-title {
		margin: 0;
		font-size: 0.88rem;
		font-weight: 700;
		color: var(--d-ink);
	}

	.item-meta {
		margin: 0;
		font-size: 0.74rem;
		color: var(--d-muted);
	}

	.item-detail {
		margin: 2px 0 0;
		font-size: 0.78rem;
		line-height: 1.45;
		color: var(--d-muted);
	}
</style>
