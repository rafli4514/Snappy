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

	async function refresh(): Promise<void> {
		loading = true;
		error = null;
		await loadCustomAssets(true);
		loading = false;
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

	async function upload(): Promise<void> {
		const file = fileInput?.files?.[0];
		if (!file) {
			error = 'Pilih file gambar sticker.';
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
			if (!res.ok || !data.ok) throw new Error(data.error || 'Gagal upload sticker.');
			name = '';
			if (fileInput) fileInput.value = '';
			await loadCustomAssets(true);
			notice = 'Sticker custom ditambahkan dan tersedia di picker editor/dekorasi.';
		} catch (e) {
			error = e instanceof Error ? e.message : 'Gagal upload sticker.';
		} finally {
			saving = false;
		}
	}

	function startEdit(s: StickerAsset & { enabled?: boolean }): void {
		editingId = s.dbId;
		editName = s.name;
		editCategory = s.category || 'Custom';
		editEnabled = s.enabled !== false;
	}

	async function saveEdit(dbId: number): Promise<void> {
		saving = true;
		error = null;
		notice = null;
		try {
			const res = await fetch('/api/assets/stickers', {
				method: 'PUT',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					dbId,
					name: editName,
					category: editCategory,
					enabled: editEnabled,
					active: editEnabled
				})
			});
			const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
			if (!res.ok || !data.ok) throw new Error(data.error || 'Gagal memperbarui sticker.');
			editingId = null;
			await loadCustomAssets(true);
			notice = 'Sticker custom diperbarui.';
		} catch (e) {
			error = e instanceof Error ? e.message : 'Gagal memperbarui sticker.';
		} finally {
			saving = false;
		}
	}

	async function remove(dbId: number, label: string): Promise<void> {
		if (!confirm(`Hapus sticker "${label}"?`)) return;
		error = null;
		notice = null;
		try {
			const res = await fetch('/api/assets/stickers', {
				method: 'DELETE',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ dbId })
			});
			const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
			if (!res.ok || !data.ok) throw new Error(data.error || 'Gagal menghapus sticker.');
			if (editingId === dbId) editingId = null;
			await loadCustomAssets(true);
			notice = 'Sticker custom dihapus.';
		} catch (e) {
			error = e instanceof Error ? e.message : 'Gagal menghapus sticker.';
		}
	}
</script>

<div class="dash-page">
	<header class="dash-head">
		<div class="head-row">
			<div>
				<p class="eyebrow font-mono">ADMIN · ASSET · STICKER</p>
				<h1 class="dash-title font-display">Sticker</h1>
				<p class="dash-sub">
					Sticker bawaan <strong>terkunci</strong>. Sticker custom bisa diunggah,
					diaktifkan/nonaktifkan, dan dihapus. Sticker custom aktif akan muncul di kategori terkait
					pada editor/dekorasi strip.
				</p>
			</div>
			<button type="button" class="btn btn-outline btn-sm" onclick={refresh} disabled={loading}
				>Muat ulang</button
			>
		</div>
	</header>

	{#if error}<div class="alert alert-warning" role="status"><span>{error}</span></div>{/if}
	{#if notice}<div class="alert alert-success" role="status"><span>{notice}</span></div>{/if}

	<section class="panel" aria-label="Upload sticker custom">
		<div class="panel-head"><h2 class="section-title font-mono">UPLOAD STICKER CUSTOM</h2></div>
		<div class="panel-body upload-grid">
			<label class="field">
				<span class="label font-mono">FILE GAMBAR</span>
				<input
					class="file-input-bordered file-input w-full file-input-sm"
					type="file"
					accept="image/png,image/webp,image/gif,image/svg+xml"
					bind:this={fileInput}
				/>
			</label>
			<label class="field">
				<span class="label font-mono">NAMA</span>
				<input
					class="input-bordered input input-sm"
					bind:value={name}
					placeholder="Sticker kustom"
					maxlength="80"
				/>
			</label>
			<label class="field">
				<span class="label font-mono">KATEGORI</span>
				<input
					class="input-bordered input input-sm"
					bind:value={category}
					placeholder="Custom"
					maxlength="40"
				/>
			</label>
			<div class="field actions">
				<button type="button" class="btn btn-primary btn-sm" onclick={upload} disabled={saving}
					>{saving ? 'Memproses…' : 'Upload'}</button
				>
			</div>
		</div>
	</section>

	<section class="panel" aria-label="Sticker custom">
		<div class="panel-head">
			<h2 class="section-title font-mono">CUSTOM (DAPAT DIEDIT)</h2>
			<span class="count font-mono">{loading ? '…' : custom.length}</span>
		</div>
		<div class="panel-body">
			{#if loading}
				<p class="panel-note">Memuat sticker custom…</p>
			{:else if custom.length === 0}
				<p class="panel-note">
					Belum ada sticker custom. Unggah gambar (PNG/WebP disarankan, latar transparan).
				</p>
			{:else}
				<ul class="asset-list">
					{#each custom as s (s.dbId)}
						<li class="asset-row">
							<img class="thumb" src={stickerSrc(s)} alt="" loading="lazy" />
							<div class="asset-main">
								{#if editingId === s.dbId}
									<div class="edit-grid">
										<input
											class="input-bordered input input-xs"
											bind:value={editName}
											aria-label="Nama sticker"
										/>
										<input
											class="input-bordered input input-xs"
											bind:value={editCategory}
											aria-label="Kategori sticker"
										/>
										<label class="toggle-label font-mono"
											><input type="checkbox" bind:checked={editEnabled} /> AKTIF</label
										>
										<div class="row-actions">
											<button
												type="button"
												class="btn btn-primary btn-xs"
												onclick={() => saveEdit(s.dbId)}
												disabled={saving}>Simpan</button
											>
											<button
												type="button"
												class="btn btn-ghost btn-xs"
												onclick={() => (editingId = null)}>Batal</button
											>
										</div>
									</div>
								{:else}
									<p class="asset-name">{s.name} <span class="edit-tag">CUSTOM</span></p>
									<p class="asset-meta font-mono">
										{s.category || 'Custom'} · {s.size?.w ?? '?'}×{s.size?.h ?? '?'} px · {s.enabled ===
										false
											? 'NONAKTIF'
											: 'AKTIF'}
									</p>
								{/if}
							</div>
							{#if editingId !== s.dbId}
								<div class="row-actions">
									<button
										type="button"
										class="btn btn-ghost btn-xs"
										onclick={() => startEdit(s as StickerAsset & { enabled?: boolean })}
										>Edit</button
									>
									<button
										type="button"
										class="btn btn-ghost text-error btn-xs"
										onclick={() => remove(s.dbId, s.name)}>Hapus</button
									>
								</div>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	</section>

	<section class="panel" aria-label="Sticker bawaan">
		<div class="panel-head">
			<h2 class="section-title font-mono">BAWAAN (TERKUNCI)</h2>
			<span class="count font-mono">{STICKER_ASSETS.length + VINTAGE_STICKER_ASSETS.length}</span>
		</div>
		<div class="panel-body">
			<details class="builtin-details">
				<summary class="font-mono">Lihat sticker bawaan (Pixel + Vintage)</summary>
				<ul class="asset-list compact">
					{#each [...STICKER_ASSETS, ...VINTAGE_STICKER_ASSETS] as sticker (sticker.dbId)}
						<li class="asset-row">
							<img class="thumb" src={stickerSrc(sticker)} alt="" loading="lazy" />
							<div class="asset-main">
								<p class="asset-name">{sticker.name} <span class="lock-tag">TERKUNCI</span></p>
								<p class="asset-meta font-mono">
									{sticker.category ?? 'Umum'} · {sticker.size.w}×{sticker.size.h} px
								</p>
							</div>
						</li>
					{/each}
				</ul>
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
		max-width: 72ch;
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
	.upload-grid {
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
	.label {
		font-size: 0.62rem;
		font-weight: 700;
		letter-spacing: 0.14em;
		opacity: 0.65;
	}
	.actions {
		justify-content: flex-end;
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
		margin-top: 10px;
		max-height: 46vh;
		overflow: auto;
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
	.thumb {
		width: 44px;
		height: 44px;
		object-fit: contain;
		border-radius: 8px;
		background: color-mix(in srgb, var(--color-base-300, #d6d3d1) 30%, transparent);
		flex-shrink: 0;
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
	.edit-grid {
		display: flex;
		gap: 6px;
		align-items: center;
		flex-wrap: wrap;
	}
	.toggle-label {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-size: 0.62rem;
		font-weight: 700;
		letter-spacing: 0.1em;
	}
	.builtin-details summary {
		cursor: pointer;
		font-size: 0.72rem;
		font-weight: 700;
		letter-spacing: 0.1em;
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
