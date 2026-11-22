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
	let deletingKey = $state<string | null>(null);
	let confirmDeleteKey = $state<string | null>(null);
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
		try {
			await loadCustomAssets(true);
		} finally {
			loading = false;
		}
	}

	onMount(() => {
		void refresh();
	});

	function resetForm(): void {
		editingKey = null;
		form = { name: '', category: 'Custom', cssFilter: '', ffmpeg: '', enabled: true };
	}

	function edit(f: PhotoFilter & { enabled?: boolean }): void {
		confirmDeleteKey = null;
		editingKey = f.key;
		form = {
			name: f.name,
			category: String(f.category || 'Custom'),
			cssFilter: f.cssFilter || '',
			ffmpeg: f.ffmpeg || '',
			enabled: f.enabled !== false
		};
	}

	async function save(e: SubmitEvent): Promise<void> {
		e.preventDefault();
		const name = form.name.trim();
		if (!name) {
			error = 'Nama filter wajib diisi.';
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
					.toLowerCase()
					.replace(/[^a-z0-9_-]+/g, '-')
					.replace(/^-+|-+$/g, '');
			const res = await fetch('/api/assets/filters', {
				method,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ key, ...form, name })
			});
			const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
			if (!res.ok || !data.ok) throw new Error(data.error || 'Gagal menyimpan filter.');
			await loadCustomAssets(true);
			notice = editingKey ? 'Filter kustom diperbarui.' : 'Filter kustom ditambahkan.';
			resetForm();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Gagal menyimpan filter.';
		} finally {
			saving = false;
		}
	}

	async function remove(key: string, label: string): Promise<void> {
		deletingKey = key;
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
			confirmDeleteKey = null;
			if (editingKey === key) resetForm();
			await loadCustomAssets(true);
			notice = `Filter "${label}" berhasil dihapus.`;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Gagal menghapus filter.';
		} finally {
			deletingKey = null;
		}
	}
</script>

<div class="d-page">
	<header class="d-head">
		<div>
			<p class="d-eyebrow">Aset · Filter Foto</p>
			<h1 class="d-title">Filter Foto</h1>
			<p class="d-sub">
				Filter bawaan terkunci. Tambahkan preset kustom berbasis ekspresi CSS filter untuk pratinjau
				langsung pada layar editor dan dekorasi strip. Nilai ffmpeg disimpan sebagai metadata
				opsional.
			</p>
		</div>
		<div class="d-actions">
			<a class="d-btn" href="/dashboard/assets">Kembali</a>
			<button type="button" class="d-btn" onclick={refresh} disabled={loading}>
				{loading ? 'Memuat…' : 'Muat Ulang'}
			</button>
		</div>
	</header>

	{#if error}
		<div class="d-banner d-banner-warn" role="status"><span>{error}</span></div>
	{/if}
	{#if notice}
		<div class="d-banner d-banner-ok" role="status"><span>{notice}</span></div>
	{/if}

	<section class="d-card" aria-label="Formulir filter kustom">
		<div class="d-card-head">
			<div>
				<h2 class="d-card-title">
					{editingKey ? 'Edit Filter Kustom' : 'Tambah Filter Kustom'}
				</h2>
				<p class="d-card-sub">
					Ketik aturan CSS filter lalu lihat efek warnanya secara langsung di kotak pratinjau.
				</p>
			</div>
			{#if editingKey}
				<span class="d-pill d-pill-info">Mengedit: {editingKey}</span>
			{/if}
		</div>
		<div class="d-card-body">
			<form class="filter-form" onsubmit={save}>
				<div class="preview-strip">
					<div class="preview-pair">
						<div class="swatch-box">
							<div class="swatch-lg" aria-hidden="true"></div>
							<span class="swatch-cap">Asli</span>
						</div>
						<div class="swatch-box">
							<div
								class="swatch-lg"
								style="filter: {form.cssFilter || 'none'}"
								aria-hidden="true"
							></div>
							<span class="swatch-cap">Hasil Filter</span>
						</div>
					</div>
					<div class="preview-inputs">
						<div class="d-form-grid">
							<div class="d-field">
								<label class="d-field-label" for="fl-name">Nama Filter</label>
								<input
									id="fl-name"
									class="d-input"
									type="text"
									bind:value={form.name}
									placeholder="Contoh: Film Hangat"
									maxlength="80"
									required
								/>
							</div>
							<div class="d-field">
								<label class="d-field-label" for="fl-cat">Kategori</label>
								<select id="fl-cat" class="d-select" bind:value={form.category}>
									{#each CATEGORIES as c (c)}
										<option value={c}>{c}</option>
									{/each}
								</select>
							</div>
						</div>

						<div class="d-form-grid">
							<div class="d-field">
								<label class="d-field-label" for="fl-css">CSS Filter (Pratinjau)</label>
								<input
									id="fl-css"
									class="d-input"
									type="text"
									bind:value={form.cssFilter}
									placeholder="sepia(0.35) contrast(1.1) saturate(1.2)"
								/>
							</div>
							<div class="d-field">
								<label class="d-field-label" for="fl-ff">FFmpeg (Opsional, Metadata)</label>
								<input
									id="fl-ff"
									class="d-input"
									type="text"
									bind:value={form.ffmpeg}
									placeholder="Opsional"
								/>
							</div>
						</div>
					</div>
				</div>

				<div class="form-footer">
					<label class="toggle-inline">
						<input type="checkbox" class="toggle toggle-sm" bind:checked={form.enabled} />
						<span>Aktifkan di picker editor</span>
					</label>
					<div class="d-actions">
						{#if editingKey}
							<button type="button" class="d-btn d-btn-ghost" onclick={resetForm} disabled={saving}>
								Batal
							</button>
						{/if}
						<button type="submit" class="d-btn d-btn-primary" disabled={saving}>
							{saving ? 'Menyimpan…' : editingKey ? 'Perbarui Filter' : 'Simpan Filter'}
						</button>
					</div>
				</div>
			</form>
		</div>
	</section>

	<section class="d-card" aria-label="Daftar filter kustom">
		<div class="d-card-head">
			<div>
				<h2 class="d-card-title">Filter Kustom</h2>
				<p class="d-card-sub">Dapat diedit, dinonaktifkan, atau dihapus.</p>
			</div>
			<span class="d-pill d-pill-ok d-num">{loading ? '…' : custom.length} filter</span>
		</div>

		{#if loading}
			<div class="d-empty"><p>Memuat daftar filter kustom…</p></div>
		{:else if custom.length === 0}
			<div class="d-empty">
				<p class="d-empty-title">Belum ada filter kustom</p>
				<p>Buat preset warna kustom pertama melalui formulir di atas.</p>
			</div>
		{:else}
			<div class="d-list">
				{#each custom as f (f.key)}
					<div class="d-row">
						<div class="swatch" style="filter: {f.cssFilter || 'none'}" aria-hidden="true"></div>
						<div class="row-info">
							<div class="row-top">
								<p class="row-name">{f.name}</p>
								<span class="d-pill d-pill-info">{f.category}</span>
								<span class="d-pill" class:d-pill-ok={f.enabled !== false}>
									{f.enabled === false ? 'Nonaktif' : 'Aktif'}
								</span>
							</div>
							<p class="row-meta">
								Kunci: {f.key} · {f.cssFilter || 'Tanpa CSS filter'}
							</p>
						</div>
						<div class="d-actions">
							{#if confirmDeleteKey === f.key}
								<span class="confirm-note">Hapus "{f.name}"?</span>
								<button
									type="button"
									class="d-btn d-btn-danger d-btn-sm"
									disabled={deletingKey === f.key}
									onclick={() => remove(f.key, f.name)}
								>
									{deletingKey === f.key ? 'Menghapus…' : 'Ya, Hapus'}
								</button>
								<button
									type="button"
									class="d-btn d-btn-sm"
									disabled={deletingKey === f.key}
									onclick={() => (confirmDeleteKey = null)}
								>
									Batal
								</button>
							{:else}
								<button type="button" class="d-btn d-btn-sm" onclick={() => edit(f)}>Edit</button>
								<button
									type="button"
									class="d-btn d-btn-danger d-btn-sm"
									onclick={() => (confirmDeleteKey = f.key)}
								>
									Hapus
								</button>
							{/if}
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</section>

	<section class="d-card" aria-label="Filter bawaan terkunci">
		<div class="d-card-head">
			<div>
				<h2 class="d-card-title">Filter Bawaan</h2>
				<p class="d-card-sub">Preset warna standar studio (terkunci).</p>
			</div>
			<span class="d-pill d-num">{PHOTO_FILTERS.length} filter</span>
		</div>
		<div class="d-card-body">
			<details class="builtin-fold">
				<summary>Tampilkan seluruh filter bawaan ({PHOTO_FILTERS.length})</summary>
				<div class="groups">
					{#each Object.entries(builtinGroups) as [cat, filters] (cat)}
						<div class="group">
							<p class="group-title">{cat}</p>
							<div class="builtin-grid">
								{#each filters as f (f.key)}
									<div class="builtin-tile">
										<div
											class="swatch"
											style="filter: {f.cssFilter || 'none'}"
											aria-hidden="true"
										></div>
										<div class="tile-info">
											<p class="tile-name">{f.name}</p>
											<p class="tile-meta">{f.key}</p>
										</div>
									</div>
								{/each}
							</div>
						</div>
					{/each}
				</div>
			</details>
		</div>
	</section>
</div>

<style>
	.filter-form {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.preview-strip {
		display: grid;
		gap: 16px;
		grid-template-columns: auto minmax(0, 1fr);
		align-items: start;
	}

	@media (max-width: 720px) {
		.preview-strip {
			grid-template-columns: minmax(0, 1fr);
		}
	}

	.preview-pair {
		display: flex;
		gap: 10px;
	}

	.swatch-box {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 6px;
	}

	.swatch-lg {
		width: 74px;
		height: 92px;
		border-radius: 12px;
		border: 1px solid var(--d-border);
		background: linear-gradient(145deg, #f59e0b 0%, #ef4444 35%, #3b82f6 70%, #10b981 100%);
	}

	.swatch-cap {
		font-size: 0.68rem;
		font-weight: 700;
		color: var(--d-muted);
	}

	.preview-inputs {
		display: flex;
		flex-direction: column;
		gap: 12px;
		min-width: 0;
	}

	.form-footer {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding-top: 10px;
		border-top: 1px solid var(--d-border);
	}

	.toggle-inline {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		font-size: 0.78rem;
		font-weight: 700;
		color: var(--d-ink);
		cursor: pointer;
	}

	.swatch {
		width: 42px;
		height: 42px;
		border-radius: 10px;
		border: 1px solid var(--d-border);
		background: linear-gradient(135deg, #f59e0b, #ef4444, #3b82f6, #10b981);
		flex-shrink: 0;
	}

	.row-info {
		flex: 1;
		min-width: 200px;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.row-top {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
	}

	.row-name {
		margin: 0;
		font-size: 0.9rem;
		font-weight: 700;
		color: var(--d-ink);
	}

	.row-meta {
		margin: 0;
		font-size: 0.75rem;
		color: var(--d-muted);
		word-break: break-word;
	}

	.confirm-note {
		font-size: 0.75rem;
		font-weight: 700;
		color: var(--d-err);
	}

	.builtin-fold summary {
		cursor: pointer;
		font-size: 0.8rem;
		font-weight: 700;
		color: var(--d-ink);
		user-select: none;
	}

	.groups {
		margin-top: 14px;
		display: flex;
		flex-direction: column;
		gap: 16px;
		max-height: 460px;
		overflow-y: auto;
		padding-right: 4px;
	}

	.group {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.group-title {
		margin: 0;
		font-size: 0.72rem;
		font-weight: 800;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--d-muted);
	}

	.builtin-grid {
		display: grid;
		gap: 8px;
		grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
	}

	.builtin-tile {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 8px 10px;
		border: 1px solid var(--d-border);
		border-radius: 12px;
		background: var(--d-bg);
	}

	.tile-info {
		min-width: 0;
		flex: 1;
	}

	.tile-name {
		margin: 0;
		font-size: 0.8rem;
		font-weight: 700;
		color: var(--d-ink);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.tile-meta {
		margin: 2px 0 0;
		font-size: 0.7rem;
		color: var(--d-muted);
	}
</style>
