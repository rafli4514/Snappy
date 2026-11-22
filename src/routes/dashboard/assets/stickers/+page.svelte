<script lang="ts">
	import { onMount } from 'svelte';
	import {
		STICKER_ASSETS,
		VINTAGE_STICKER_ASSETS,
		stickerSrc,
		type StickerAsset
	} from '#lib/data/stickers';
	import { customStickersStore, loadCustomAssets } from '#lib/services/customAssets';

	let loading = $state(true);
	let saving = $state(false);
	let deletingId = $state<number | null>(null);
	let confirmDeleteId = $state<number | null>(null);
	let error = $state<string | null>(null);
	let notice = $state<string | null>(null);
	let fileInput = $state<HTMLInputElement | null>(null);
	let name = $state('');
	let category = $state('Custom');
	let editingId = $state<number | null>(null);
	let editName = $state('');
	let editCategory = $state('Custom');
	let editEnabled = $state(true);

	const custom = $derived($customStickersStore);
	const builtinList = [...STICKER_ASSETS, ...VINTAGE_STICKER_ASSETS];

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

	function readImageSize(file: File): Promise<{ w: number; h: number }> {
		return new Promise((resolve) => {
			const url = URL.createObjectURL(file);
			const img = new Image();
			img.onload = () => {
				resolve({ w: img.naturalWidth || 200, h: img.naturalHeight || 200 });
				URL.revokeObjectURL(url);
			};
			img.onerror = () => {
				resolve({ w: 200, h: 200 });
				URL.revokeObjectURL(url);
			};
			img.src = url;
		});
	}

	async function upload(e: SubmitEvent): Promise<void> {
		e.preventDefault();
		const file = fileInput?.files?.[0];
		if (!file) {
			error = 'Pilih berkas gambar stiker terlebih dahulu.';
			return;
		}
		saving = true;
		error = null;
		notice = null;
		try {
			const size = await readImageSize(file);
			const form = new FormData();
			form.set('file', file);
			form.set('name', name.trim() || file.name.replace(/\.[^.]+$/, ''));
			form.set('category', category.trim() || 'Custom');
			form.set('width', String(size.w));
			form.set('height', String(size.h));
			const res = await fetch('/api/assets/stickers', { method: 'POST', body: form });
			const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
			if (!res.ok || !data.ok) throw new Error(data.error || 'Gagal mengunggah stiker.');
			name = '';
			if (fileInput) fileInput.value = '';
			await loadCustomAssets(true);
			notice = 'Stiker kustom ditambahkan dan langsung tersedia di editor strip.';
		} catch (err) {
			error = err instanceof Error ? err.message : 'Gagal mengunggah stiker.';
		} finally {
			saving = false;
		}
	}

	function startEdit(s: StickerAsset & { enabled?: boolean }): void {
		confirmDeleteId = null;
		editingId = s.dbId;
		editName = s.name;
		editCategory = s.category || 'Custom';
		editEnabled = s.enabled !== false;
	}

	async function saveEdit(e: SubmitEvent, dbId: number): Promise<void> {
		e.preventDefault();
		saving = true;
		error = null;
		notice = null;
		try {
			const res = await fetch('/api/assets/stickers', {
				method: 'PUT',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					dbId,
					name: editName.trim() || 'Stiker',
					category: editCategory.trim() || 'Custom',
					enabled: editEnabled,
					active: editEnabled
				})
			});
			const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
			if (!res.ok || !data.ok) throw new Error(data.error || 'Gagal memperbarui stiker.');
			editingId = null;
			await loadCustomAssets(true);
			notice = 'Stiker kustom berhasil diperbarui.';
		} catch (err) {
			error = err instanceof Error ? err.message : 'Gagal memperbarui stiker.';
		} finally {
			saving = false;
		}
	}

	async function remove(dbId: number, label: string): Promise<void> {
		deletingId = dbId;
		error = null;
		notice = null;
		try {
			const res = await fetch('/api/assets/stickers', {
				method: 'DELETE',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ dbId })
			});
			const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
			if (!res.ok || !data.ok) throw new Error(data.error || 'Gagal menghapus stiker.');
			confirmDeleteId = null;
			if (editingId === dbId) editingId = null;
			await loadCustomAssets(true);
			notice = `Stiker "${label}" dihapus.`;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Gagal menghapus stiker.';
		} finally {
			deletingId = null;
		}
	}
</script>

<div class="d-page">
	<header class="d-head">
		<div>
			<p class="d-eyebrow">Aset · Stiker</p>
			<h1 class="d-title">Stiker Dekorasi</h1>
			<p class="d-sub">
				Stiker bawaan terkunci agar katalog dasar selalu utuh. Unggah stiker kustom berlatar
				transparan (PNG/WebP/SVG) untuk langsung tampil di editor.
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

	<section class="d-card" aria-label="Unggah stiker kustom">
		<div class="d-card-head">
			<div>
				<h2 class="d-card-title">Unggah Stiker Kustom</h2>
				<p class="d-card-sub">Format PNG, WebP, GIF, atau SVG dengan latar belakang transparan.</p>
			</div>
		</div>
		<div class="d-card-body">
			<form class="upload-form" onsubmit={upload}>
				<div class="d-form-grid">
					<div class="d-field">
						<label class="d-field-label" for="st-file">Berkas Gambar</label>
						<input
							id="st-file"
							class="d-file"
							type="file"
							accept="image/png,image/webp,image/gif,image/svg+xml"
							bind:this={fileInput}
							required
						/>
					</div>
					<div class="d-field">
						<label class="d-field-label" for="st-name">Nama Stiker</label>
						<input
							id="st-name"
							class="d-input"
							type="text"
							bind:value={name}
							placeholder="Contoh: Bintang Emas"
							maxlength="80"
						/>
					</div>
					<div class="d-field">
						<label class="d-field-label" for="st-cat">Kategori</label>
						<input
							id="st-cat"
							class="d-input"
							type="text"
							bind:value={category}
							placeholder="Custom"
							maxlength="40"
						/>
					</div>
				</div>
				<div class="form-footer">
					<button type="submit" class="d-btn d-btn-primary" disabled={saving}>
						{saving ? 'Mengunggah…' : 'Unggah Stiker'}
					</button>
				</div>
			</form>
		</div>
	</section>

	<section class="d-card" aria-label="Daftar stiker kustom">
		<div class="d-card-head">
			<div>
				<h2 class="d-card-title">Stiker Kustom</h2>
				<p class="d-card-sub">Stiker aktif otomatis muncul di pemilih dekorasi.</p>
			</div>
			<span class="d-pill d-pill-ok d-num">{loading ? '…' : custom.length} stiker</span>
		</div>

		{#if loading}
			<div class="d-empty"><p>Memuat daftar stiker kustom…</p></div>
		{:else if custom.length === 0}
			<div class="d-empty">
				<p class="d-empty-title">Belum ada stiker kustom</p>
				<p>Unggah gambar PNG atau WebP transparan melalui formulir di atas.</p>
			</div>
		{:else}
			<div class="d-list">
				{#each custom as s (s.dbId)}
					<div class="d-row">
						<div class="thumb-wrap d-checker">
							<img class="thumb" src={stickerSrc(s)} alt={s.name} loading="lazy" />
						</div>
						<div class="row-info">
							{#if editingId === s.dbId}
								<form class="inline-edit" onsubmit={(e) => saveEdit(e, s.dbId)}>
									<input
										class="d-input edit-field"
										type="text"
										bind:value={editName}
										aria-label="Nama stiker"
										required
									/>
									<input
										class="d-input edit-cat"
										type="text"
										bind:value={editCategory}
										aria-label="Kategori stiker"
									/>
									<label class="toggle-inline">
										<input type="checkbox" class="toggle toggle-sm" bind:checked={editEnabled} />
										<span>Aktif</span>
									</label>
									<div class="d-actions">
										<button type="submit" class="d-btn d-btn-primary d-btn-sm" disabled={saving}>
											Simpan
										</button>
										<button
											type="button"
											class="d-btn d-btn-ghost d-btn-sm"
											onclick={() => (editingId = null)}
										>
											Batal
										</button>
									</div>
								</form>
							{:else}
								<div class="row-top">
									<p class="row-name">{s.name}</p>
									<span class="d-pill d-pill-info">Kustom</span>
									<span class="d-pill" class:d-pill-ok={s.enabled !== false}>
										{s.enabled === false ? 'Nonaktif' : 'Aktif'}
									</span>
								</div>
								<p class="row-meta d-num">
									{s.category || 'Custom'} · {s.size?.w ?? '?'} × {s.size?.h ?? '?'} px
								</p>
							{/if}
						</div>

						{#if editingId !== s.dbId}
							<div class="d-actions">
								{#if confirmDeleteId === s.dbId}
									<span class="confirm-note">Hapus "{s.name}"?</span>
									<button
										type="button"
										class="d-btn d-btn-danger d-btn-sm"
										disabled={deletingId === s.dbId}
										onclick={() => remove(s.dbId, s.name)}
									>
										{deletingId === s.dbId ? 'Menghapus…' : 'Ya, Hapus'}
									</button>
									<button
										type="button"
										class="d-btn d-btn-sm"
										disabled={deletingId === s.dbId}
										onclick={() => (confirmDeleteId = null)}
									>
										Batal
									</button>
								{:else}
									<button
										type="button"
										class="d-btn d-btn-sm"
										onclick={() => startEdit(s as StickerAsset & { enabled?: boolean })}
									>
										Edit
									</button>
									<button
										type="button"
										class="d-btn d-btn-danger d-btn-sm"
										onclick={() => (confirmDeleteId = s.dbId)}
									>
										Hapus
									</button>
								{/if}
							</div>
						{/if}
					</div>
				{/each}
			</div>
		{/if}
	</section>

	<section class="d-card" aria-label="Stiker bawaan terkunci">
		<div class="d-card-head">
			<div>
				<h2 class="d-card-title">Stiker Bawaan</h2>
				<p class="d-card-sub">Koleksi Pixel & Vintage resmi (terkunci).</p>
			</div>
			<span class="d-pill d-num">{builtinList.length} stiker</span>
		</div>
		<div class="d-card-body">
			<details class="builtin-fold">
				<summary>Tampilkan seluruh stiker bawaan ({builtinList.length})</summary>
				<div class="builtin-grid">
					{#each builtinList as sticker (sticker.dbId)}
						<div class="builtin-tile">
							<div class="thumb-wrap d-checker">
								<img class="thumb" src={stickerSrc(sticker)} alt={sticker.name} loading="lazy" />
							</div>
							<div class="tile-info">
								<p class="tile-name">{sticker.name}</p>
								<p class="tile-meta d-num">
									{sticker.category ?? 'Umum'} · {sticker.size.w}×{sticker.size.h}
								</p>
							</div>
						</div>
					{/each}
				</div>
			</details>
		</div>
	</section>
</div>

<style>
	.upload-form {
		display: flex;
		flex-direction: column;
		gap: 14px;
	}

	.form-footer {
		display: flex;
		justify-content: flex-end;
	}

	.thumb-wrap {
		width: 48px;
		height: 48px;
		border-radius: 10px;
		border: 1px solid var(--d-border);
		display: grid;
		place-items: center;
		padding: 4px;
		flex-shrink: 0;
		overflow: hidden;
	}

	.thumb {
		width: 100%;
		height: 100%;
		object-fit: contain;
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
		font-size: 0.76rem;
		color: var(--d-muted);
	}

	.inline-edit {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
	}

	.edit-field {
		flex: 1;
		min-width: 150px;
	}

	.edit-cat {
		width: 140px;
	}

	.toggle-inline {
		display: inline-flex;
		align-items: center;
		gap: 7px;
		font-size: 0.76rem;
		font-weight: 700;
		color: var(--d-ink);
		cursor: pointer;
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

	.builtin-grid {
		margin-top: 14px;
		display: grid;
		gap: 10px;
		grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
		max-height: 440px;
		overflow-y: auto;
		padding-right: 4px;
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
