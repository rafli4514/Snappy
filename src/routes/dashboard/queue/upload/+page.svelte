<script lang="ts">
	import { onMount } from 'svelte';

	type Item = {
		id: string;
		status: string;
		title: string;
		detail?: string;
		createdAt: string;
		source?: string;
	};
	let loading = $state(true);
	let error = $state<string | null>(null);
	let notice = $state<string | null>(null);
	let items = $state<Item[]>([]);
	let context = $state<{ customAssets?: number }>({});
	let title = $state('');

	async function load(): Promise<void> {
		loading = true;
		error = null;
		try {
			const res = await fetch('/api/queue?type=upload&limit=120');
			const data = (await res.json()) as {
				ok?: boolean;
				items?: Item[];
				context?: typeof context;
				error?: string;
			};
			if (!res.ok || !data.ok) throw new Error(data.error || 'Gagal memuat upload queue.');
			items = data.items || [];
			context = data.context || {};
		} catch (e) {
			error = e instanceof Error ? e.message : 'Gagal memuat upload queue.';
		} finally {
			loading = false;
		}
	}

	async function enqueue(): Promise<void> {
		error = null;
		notice = null;
		const res = await fetch('/api/queue', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				type: 'upload',
				title: title.trim() || 'Item upload (lokal)',
				detail: 'MVP lokal: penanda pelacakan upload.',
				source: 'dashboard'
			})
		});
		const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
		if (!res.ok || !data.ok) {
			error = data.error || 'Gagal menambah item.';
			return;
		}
		title = '';
		notice = 'Item lokal ditambahkan.';
		await load();
	}

	async function setStatus(id: string, status: string): Promise<void> {
		await fetch('/api/queue', {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ id, status })
		});
		await load();
	}
	async function remove(id: string): Promise<void> {
		await fetch('/api/queue', {
			method: 'DELETE',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ id })
		});
		await load();
	}
	async function clearAll(): Promise<void> {
		if (!confirm('Hapus semua item upload queue lokal?')) return;
		await fetch('/api/queue', {
			method: 'DELETE',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ type: 'upload' })
		});
		await load();
	}

	onMount(() => void load());
	function fmt(iso: string) {
		try {
			return new Date(iso).toLocaleString('id-ID');
		} catch {
			return iso;
		}
	}
</script>

<div class="dash-page">
	<header class="dash-head">
		<div class="head-row">
			<div>
				<p class="eyebrow font-mono">ADMIN · QUEUE · UPLOAD</p>
				<h1 class="dash-title font-display">Upload queue</h1>
				<p class="dash-sub">
					<strong>MVP lokal:</strong> pelacakan antrian upload. Upload aset (sticker/filter/AR/frame
					size custom) saat ini <strong>langsung</strong>
					diproses via API (bukan antrian persisten terdistribusi). Aset custom tersimpan:
					<strong>{loading ? '…' : (context.customAssets ?? 0)}</strong>.
				</p>
			</div>
			<div class="row-actions">
				<button type="button" class="btn btn-outline btn-sm" onclick={load} disabled={loading}
					>Muat ulang</button
				>
				<button
					type="button"
					class="btn btn-ghost text-error btn-sm"
					onclick={clearAll}
					disabled={loading || items.length === 0}>Bersihkan</button
				>
			</div>
		</div>
	</header>

	{#if error}<div class="alert alert-warning" role="status"><span>{error}</span></div>{/if}
	{#if notice}<div class="alert alert-success" role="status"><span>{notice}</span></div>{/if}

	<section class="panel">
		<div class="panel-head"><h2 class="section-title font-mono">TAMBAH ITEM LOKAL (MVP)</h2></div>
		<div class="panel-body add-row">
			<input
				class="input-bordered input input-sm"
				bind:value={title}
				placeholder="Judul/catatan (opsional)"
			/>
			<button type="button" class="btn btn-primary btn-sm" onclick={enqueue}>Tambah</button>
		</div>
	</section>

	<section class="panel" aria-label="Item upload">
		<div class="panel-head">
			<h2 class="section-title font-mono">ITEM (LOKAL)</h2>
			<span class="count font-mono">{loading ? '…' : items.length}</span>
		</div>
		<div class="panel-body">
			{#if loading}<p class="panel-note">Memuat…</p>
			{:else if items.length === 0}<p class="panel-note">
					Belum ada item pelacakan. Upload aset yang berhasil saat ini tercermin pada jumlah aset
					custom (real), bukan sebagai antrian tertunda.
				</p>
			{:else}
				<ul class="item-list">
					{#each items as item (item.id)}
						<li class="item-row">
							<div class="item-main">
								<p class="item-title">
									{item.title} <span class="badge {item.status}">{item.status}</span>
								</p>
								<p class="item-meta font-mono">
									{fmt(item.createdAt)}{item.source ? ` · ${item.source}` : ''}
								</p>
								{#if item.detail}<p class="item-detail">{item.detail}</p>{/if}
							</div>
							<div class="row-actions">
								<button
									type="button"
									class="btn btn-ghost btn-xs"
									onclick={() => setStatus(item.id, 'done')}>Selesai</button
								>
								<button
									type="button"
									class="btn btn-ghost btn-xs"
									onclick={() => setStatus(item.id, 'failed')}>Gagal</button
								>
								<button
									type="button"
									class="btn btn-ghost text-error btn-xs"
									onclick={() => remove(item.id)}>Hapus</button
								>
							</div>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	</section>
	<div class="row-actions">
		<a class="btn btn-outline btn-sm" href="/dashboard/queue">Kembali ke Queue</a>
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
		opacity: 0.6;
	}
	.dash-title {
		margin: 6px 0 0;
		font-size: 2rem;
		line-height: 1.1;
	}
	.dash-sub {
		margin: 8px 0 0;
		max-width: 78ch;
		font-size: 0.85rem;
		line-height: 1.55;
		opacity: 0.75;
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
	.add-row {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
	}
	.add-row .input {
		flex: 1;
		min-width: 180px;
	}
	.item-list {
		margin: 0;
		padding: 0;
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.item-row {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 12px;
		padding: 12px;
		border: 1px solid var(--color-base-300, #d6d3d1);
		border-radius: 10px;
		background: var(--color-base-100, #fff);
		flex-wrap: wrap;
	}
	.item-main {
		flex: 1;
		min-width: 220px;
	}
	.item-title {
		margin: 0;
		font-size: 0.88rem;
		font-weight: 700;
		display: flex;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
	}
	.item-meta {
		margin: 4px 0 0;
		font-size: 0.66rem;
		opacity: 0.7;
	}
	.item-detail {
		margin: 6px 0 0;
		font-size: 0.78rem;
		opacity: 0.8;
	}
	.badge {
		font-size: 0.56rem;
		font-weight: 700;
		letter-spacing: 0.1em;
		padding: 2px 8px;
		border-radius: 999px;
		border: 1px solid var(--color-base-300, #d6d3d1);
		text-transform: uppercase;
	}
	.badge.done {
		border-color: #16a34a;
		color: #15803d;
	}
	.badge.failed {
		border-color: #dc2626;
		color: #b91c1c;
	}
	.badge.pending,
	.badge.processing {
		border-color: #d97706;
		color: #b45309;
	}
	.row-actions {
		display: flex;
		align-items: center;
		gap: 6px;
		flex-wrap: wrap;
	}
	.panel-note {
		margin: 0;
		font-size: 0.85rem;
		opacity: 0.75;
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
	.alert-success {
		background: color-mix(in srgb, #22c55e 12%, transparent);
	}
</style>
