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
	let items = $state<Item[]>([]);
	let summary = $state({ total: 0, pending: 0, failed: 0, done: 0 });

	async function load(): Promise<void> {
		loading = true;
		error = null;
		try {
			const res = await fetch('/api/queue?type=print&limit=120');
			const data = (await res.json()) as {
				ok?: boolean;
				items?: Item[];
				summary?: Record<string, typeof summary>;
				error?: string;
			};
			if (!res.ok || !data.ok) throw new Error(data.error || 'Gagal memuat antrian print.');
			items = data.items || [];
			summary = data.summary?.print || summary;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Gagal memuat antrian print.';
		} finally {
			loading = false;
		}
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
		if (!confirm('Hapus semua log/item antrian print lokal?')) return;
		await fetch('/api/queue', {
			method: 'DELETE',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ type: 'print' })
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
				<p class="eyebrow font-mono">ADMIN · QUEUE · PRINT</p>
				<h1 class="dash-title font-display">Print queue</h1>
				<p class="dash-sub">
					<strong>MVP lokal (log):</strong> mencatat hasil percobaan print dari
					<code>/api/print</code>
					(PowerShell → printer Windows). Ini <strong>bukan</strong> OS print spooler/distributed queue.
					Eksekusi print tetap lewat alur print yang ada.
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

	<section class="panel">
		<div class="panel-head"><h2 class="section-title font-mono">RINGKASAN</h2></div>
		<div class="panel-body counts font-mono">
			<span>total {summary.total}</span><span>pending {summary.pending}</span><span
				>gagal {summary.failed}</span
			><span>selesai {summary.done}</span>
		</div>
	</section>

	<section class="panel" aria-label="Item print">
		<div class="panel-head">
			<h2 class="section-title font-mono">LOG / ITEM</h2>
			<span class="count font-mono">{loading ? '…' : items.length}</span>
		</div>
		<div class="panel-body">
			{#if loading}
				<p class="panel-note">Memuat…</p>
			{:else if items.length === 0}
				<p class="panel-note">
					Belum ada log print lokal. Log akan muncul saat <code>/api/print</code> dipanggil (jika runtime
					Node mendukung).
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
	.counts {
		display: flex;
		flex-wrap: wrap;
		gap: 12px;
		font-size: 0.72rem;
		opacity: 0.8;
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
		word-break: break-word;
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
	.badge.skipped {
		opacity: 0.7;
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
	code {
		font-size: 0.92em;
	}
</style>
