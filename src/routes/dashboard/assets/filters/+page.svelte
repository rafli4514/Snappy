<script lang="ts">
	import { onMount } from 'svelte';
	import { PHOTO_FILTERS, type FilterCategory, type PhotoFilter } from '#lib/data/filters';
	import { customFiltersStore, loadCustomAssets } from '#lib/services/customAssets';

	const CATEGORIES: (FilterCategory | 'Custom')[] = [
		'Essential',
		'Retro',
		'Fun',
		'Distort',
		'Black & White',
		'Custom'
	];

	let loading = $state(true);
	let saving = $state(false);
	let error = $state<string | null>(null);
	let notice = $state<string | null>(null);
	let editingKey = $state<string | null>(null);
	let form = $state({
		name: '',
		category: 'Custom' as string,
		cssFilter: '',
		ffmpeg: '',
		enabled: true
	});

	const custom = $derived($customFiltersStore);
	const builtinGroups = $derived.by(() => {
		const g: Record<string, PhotoFilter[]> = {};
		for (const f of PHOTO_FILTERS) (g[f.category] ??= []).push(f);
		return g;
	});

	async function refresh(): Promise<void> {
		loading = true;
		error = null;
		await loadCustomAssets(true);
		loading = false;
	}
	onMount(() => void refresh());

	function resetForm(): void {
		editingKey = null;
		form = { name: '', category: 'Custom', cssFilter: '', ffmpeg: '', enabled: true };
	}

	function edit(f: PhotoFilter & { enabled?: boolean }): void {
		editingKey = f.key;
		form = {
			name: f.name,
			category: String(f.category || 'Custom'),
			cssFilter: f.cssFilter || '',
			ffmpeg: f.ffmpeg || '',
			enabled: f.enabled !== false
		};
	}

	async function save(): Promise<void> {
		const name = form.name.trim();
		if (!name) {
			error = 'Nama filter diperlukan.';
			return;
		}
		saving = true;
		error = null;
		notice = null;
		try {
			const method = editingKey ? 'PUT' : 'POST';
			const key =
				editingKey ||
				name
					.trim()
					.toLowerCase()
					.replace(/[^a-z0-9_-]+/g, '-');
			const res = await fetch('/api/assets/filters', {
				method,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ key, ...form, name })
			});
			const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
			if (!res.ok || !data.ok) throw new Error(data.error || 'Gagal menyimpan filter.');
			await loadCustomAssets(true);
			notice = editingKey ? 'Filter custom diperbarui.' : 'Filter custom ditambahkan.';
			resetForm();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Gagal menyimpan filter.';
		} finally {
			saving = false;
		}
	}

	async function remove(key: string, label: string): Promise<void> {
		if (!confirm(`Hapus filter "${label}"?`)) return;
		error = null;
		notice = null;
		try {
			const res = await fetch('/api/assets/filters', {
				method: 'DELETE',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ key })
			});
			const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
			if (!res.ok || !data.ok) throw new Error(data.error || 'Gagal menghapus filter.');
			if (editingKey === key) resetForm();
			await loadCustomAssets(true);
			notice = 'Filter custom dihapus.';
		} catch (e) {
			error = e instanceof Error ? e.message : 'Gagal menghapus filter.';
		}
	}
</script>

<div class="dash-page">
	<header class="dash-head">
		<div class="head-row">
			<div>
				<p class="eyebrow font-mono">ADMIN · ASSET · FILTER</p>
				<h1 class="dash-title font-display">Filter</h1>
				<p class="dash-sub">
					Filter bawaan <strong>terkunci</strong>. Filter custom (preset <code>cssFilter</code>)
					dapat ditambah, diedit, dan dihapus. Filter custom aktif muncul di picker editor/dekorasi.
					<em>Catatan:</em>
					pratinjau memakai <code>cssFilter</code>; nilai ffmpeg disimpan sebagai metadata (render
					akhir bergantung pipeline).
				</p>
			</div>
			<button type="button" class="btn btn-outline btn-sm" onclick={refresh} disabled={loading}
				>Muat ulang</button
			>
		</div>
	</header>

	{#if error}<div class="alert alert-warning" role="status"><span>{error}</span></div>{/if}
	{#if notice}<div class="alert alert-success" role="status"><span>{notice}</span></div>{/if}

	<section class="panel" aria-label="Form filter custom">
		<div class="panel-head">
			<h2 class="section-title font-mono">
				{editingKey ? 'EDIT FILTER CUSTOM' : 'TAMBAH FILTER CUSTOM'}
			</h2>
		</div>
		<div class="panel-body form-grid">
			<label class="field">
				<span class="label font-mono">NAMA</span>
				<input
					class="input-bordered input input-sm"
					bind:value={form.name}
					placeholder="Contoh: Film Hangat"
					maxlength="80"
				/>
			</label>
			<label class="field">
				<span class="label font-mono">KATEGORI</span>
				<select class="select-bordered select select-sm" bind:value={form.category}>
					{#each CATEGORIES as c}<option value={c}>{c}</option>{/each}
				</select>
			</label>
			<label class="field wide">
				<span class="label font-mono">CSS FILTER (PRATINJAU)</span>
				<input
					class="input-bordered input input-sm"
					bind:value={form.cssFilter}
					placeholder="sepia(0.4) contrast(1.1) saturate(1.2)"
				/>
			</label>
			<label class="field wide">
				<span class="label font-mono">FFMPEG (OPSIONAL, METADATA)</span>
				<input
					class="input-bordered input input-sm"
					bind:value={form.ffmpeg}
					placeholder="opsional"
				/>
			</label>
			<label class="toggle-label font-mono"
				><input type="checkbox" bind:checked={form.enabled} /> AKTIF</label
			>
			<div class="row-actions">
				<button type="button" class="btn btn-primary btn-sm" onclick={save} disabled={saving}
					>{saving ? 'Menyimpan…' : 'Simpan'}</button
				>
				{#if editingKey}<button type="button" class="btn btn-ghost btn-sm" onclick={resetForm}
						>Batal</button
					>{/if}
			</div>
		</div>
	</section>

	<section class="panel" aria-label="Filter custom">
		<div class="panel-head">
			<h2 class="section-title font-mono">CUSTOM (DAPAT DIEDIT)</h2>
			<span class="count font-mono">{loading ? '…' : custom.length}</span>
		</div>
		<div class="panel-body">
			{#if loading}
				<p class="panel-note">Memuat filter custom…</p>
			{:else if custom.length === 0}
				<p class="panel-note">Belum ada filter custom.</p>
			{:else}
				<ul class="asset-list">
					{#each custom as f (f.key)}
						<li class="asset-row">
							<div class="swatch" style="filter: {f.cssFilter || 'none'}" aria-hidden="true"></div>
							<div class="asset-main">
								<p class="asset-name">{f.name} <span class="edit-tag">CUSTOM</span></p>
								<p class="asset-meta font-mono">
									{f.category} · {f.key} · {f.cssFilter || '(tanpa css)'} · {f.enabled === false
										? 'NONAKTIF'
										: 'AKTIF'}
								</p>
							</div>
							<div class="row-actions">
								<button type="button" class="btn btn-ghost btn-xs" onclick={() => edit(f)}
									>Edit</button
								>
								<button
									type="button"
									class="btn btn-ghost text-error btn-xs"
									onclick={() => remove(f.key, f.name)}>Hapus</button
								>
							</div>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	</section>

	<section class="panel" aria-label="Filter bawaan">
		<div class="panel-head">
			<h2 class="section-title font-mono">BAWAAN (TERKUNCI)</h2>
			<span class="count font-mono">{PHOTO_FILTERS.length}</span>
		</div>
		<div class="panel-body">
			<details class="builtin-details">
				<summary class="font-mono">Lihat filter bawaan</summary>
				<div class="groups">
					{#each Object.entries(builtinGroups) as [cat, filters]}
						<div class="group">
							<p class="group-name font-mono">{cat}</p>
							<ul class="asset-list compact">
								{#each filters as f (f.key)}
									<li class="asset-row">
										<div
											class="swatch"
											style="filter: {f.cssFilter || 'none'}"
											aria-hidden="true"
										></div>
										<div class="asset-main">
											<p class="asset-name">{f.name} <span class="lock-tag">TERKUNCI</span></p>
											<p class="asset-meta font-mono">{f.key}</p>
										</div>
									</li>
								{/each}
							</ul>
						</div>
					{/each}
				</div>
			</details>
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
	.form-grid {
		display: grid;
		gap: 10px;
		grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
		align-items: end;
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.field.wide {
		grid-column: span 2;
		min-width: 220px;
	}
	.label {
		font-size: 0.62rem;
		font-weight: 700;
		letter-spacing: 0.14em;
		opacity: 0.65;
	}
	.asset-list {
		margin: 0;
		padding: 0;
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.asset-list.compact {
		margin-top: 8px;
	}
	.asset-row {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 10px;
		border: 1px solid var(--color-base-300, #d6d3d1);
		border-radius: 10px;
		background: var(--color-base-100, #fff);
		flex-wrap: wrap;
	}
	.swatch {
		width: 38px;
		height: 38px;
		border-radius: 8px;
		background: linear-gradient(135deg, #f59e0b, #3b82f6, #10b981);
		flex-shrink: 0;
		border: 1px solid var(--color-base-300, #d6d3d1);
	}
	.asset-main {
		flex: 1;
		min-width: 180px;
	}
	.asset-name {
		margin: 0;
		font-size: 0.88rem;
		font-weight: 700;
		display: flex;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
	}
	.asset-meta {
		margin: 4px 0 0;
		font-size: 0.68rem;
		opacity: 0.7;
		word-break: break-word;
	}
	.lock-tag,
	.edit-tag {
		font-size: 0.56rem;
		font-weight: 700;
		letter-spacing: 0.12em;
		padding: 2px 6px;
		border-radius: 999px;
		border: 1px solid var(--color-base-300, #d6d3d1);
	}
	.edit-tag {
		border-color: #2563eb;
		color: #1d4ed8;
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
	.toggle-label {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-size: 0.62rem;
		font-weight: 700;
		letter-spacing: 0.1em;
		align-self: center;
	}
	.builtin-details summary {
		cursor: pointer;
		font-size: 0.72rem;
		font-weight: 700;
		letter-spacing: 0.1em;
	}
	.groups {
		display: flex;
		flex-direction: column;
		gap: 12px;
		margin-top: 10px;
		max-height: 48vh;
		overflow: auto;
	}
	.group-name {
		margin: 0;
		font-size: 0.64rem;
		font-weight: 700;
		letter-spacing: 0.16em;
		opacity: 0.7;
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
	code {
		font-size: 0.92em;
	}
</style>
