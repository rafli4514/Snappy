<script lang="ts">
	import { onMount } from 'svelte';
	import { customArStore, loadCustomAssets, type CustomArAsset } from '#lib/services/customAssets';

	let loading = $state(true);
	let saving = $state(false);
	let error = $state<string | null>(null);
	let notice = $state<string | null>(null);
	let fileInput = $state<HTMLInputElement | null>(null);
	let name = $state('');
	let editingId = $state<string | null>(null);
	let editName = $state('');
	let editEnabled = $state(true);

	const items = $derived($customArStore);

	async function refresh(): Promise<void> {
		loading = true;
		error = null;
		await loadCustomAssets(true);
		loading = false;
	}
	onMount(() => void refresh());

	async function upload(): Promise<void> {
		const file = fileInput?.files?.[0];
		if (!file) {
			error = 'Pilih file overlay AR (PNG/WebP transparan disarankan).';
			return;
		}
		saving = true;
		error = null;
		notice = null;
		try {
			const form = new FormData();
			form.set('file', file);
			form.set('name', name.trim() || file.name.replace(/\.[^.]+$/, ''));
			const res = await fetch('/api/assets/ar', { method: 'POST', body: form });
			const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
			if (!res.ok || !data.ok) throw new Error(data.error || 'Gagal upload overlay AR.');
			name = '';
			if (fileInput) fileInput.value = '';
			await loadCustomAssets(true);
			notice =
				'Overlay AR disimpan. (Realtime tracking/overlay kamera belum diimplementasikan — aset tersimpan untuk tahap integrasi.)';
		} catch (e) {
			error = e instanceof Error ? e.message : 'Gagal upload overlay AR.';
		} finally {
			saving = false;
		}
	}

	function startEdit(item: CustomArAsset): void {
		editingId = item.id;
		editName = item.name;
		editEnabled = item.enabled !== false;
	}

	async function saveEdit(id: string): Promise<void> {
		saving = true;
		error = null;
		notice = null;
		try {
			const res = await fetch('/api/assets/ar', {
				method: 'PUT',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ id, name: editName, enabled: editEnabled })
			});
			const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
			if (!res.ok || !data.ok) throw new Error(data.error || 'Gagal memperbarui overlay.');
			editingId = null;
			await loadCustomAssets(true);
			notice = 'Overlay AR diperbarui.';
		} catch (e) {
			error = e instanceof Error ? e.message : 'Gagal memperbarui overlay.';
		} finally {
			saving = false;
		}
	}

	async function remove(id: string, label: string): Promise<void> {
		if (!confirm(`Hapus overlay "${label}"?`)) return;
		error = null;
		notice = null;
		try {
			const res = await fetch('/api/assets/ar', {
				method: 'DELETE',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ id })
			});
			const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
			if (!res.ok || !data.ok) throw new Error(data.error || 'Gagal menghapus overlay.');
			if (editingId === id) editingId = null;
			await loadCustomAssets(true);
			notice = 'Overlay AR dihapus.';
		} catch (e) {
			error = e instanceof Error ? e.message : 'Gagal menghapus overlay.';
		}
	}
</script>

<div class="dash-page">
	<header class="dash-head">
		<div class="head-row">
			<div>
				<p class="eyebrow font-mono">ADMIN · ASSET · AR</p>
				<h1 class="dash-title font-display">AR</h1>
				<p class="dash-sub">
					Kelola aset overlay AR (upload & custom, MVP). <strong
						>Realtime face tracking/overlay kamera belum diimplementasikan</strong
					>
					di tahap ini — halaman ini hanya mengelola aset (simpan/aktifkan/hapus) agar siap diintegrasikan
					nanti. Tidak ada data palsu.
				</p>
			</div>
			<button type="button" class="btn btn-outline btn-sm" onclick={refresh} disabled={loading}
				>Muat ulang</button
			>
		</div>
	</header>

	{#if error}<div class="alert alert-warning" role="status"><span>{error}</span></div>{/if}
	{#if notice}<div class="alert alert-success" role="status"><span>{notice}</span></div>{/if}

	<section class="panel" aria-label="Upload overlay AR">
		<div class="panel-head"><h2 class="section-title font-mono">UPLOAD OVERLAY AR</h2></div>
		<div class="panel-body upload-grid">
			<label class="field">
				<span class="label font-mono">FILE GAMBAR (TRANSPARAN)</span>
				<input
					class="file-input-bordered file-input w-full file-input-sm"
					type="file"
					accept="image/png,image/webp,image/svg+xml"
					bind:this={fileInput}
				/>
			</label>
			<label class="field">
				<span class="label font-mono">NAMA</span>
				<input
					class="input-bordered input input-sm"
					bind:value={name}
					placeholder="Overlay kacamata"
					maxlength="80"
				/>
			</label>
			<div class="field actions">
				<button type="button" class="btn btn-primary btn-sm" onclick={upload} disabled={saving}
					>{saving ? 'Memproses…' : 'Upload'}</button
				>
			</div>
		</div>
	</section>

	<section class="panel" aria-label="Overlay AR custom">
		<div class="panel-head">
			<h2 class="section-title font-mono">ASET OVERLAY (CUSTOM)</h2>
			<span class="count font-mono">{loading ? '…' : items.length}</span>
		</div>
		<div class="panel-body">
			{#if loading}
				<p class="panel-note">Memuat aset AR…</p>
			{:else if items.length === 0}
				<p class="panel-note">
					Belum ada overlay AR. Unggah aset untuk persiapan integrasi (realtime tracking belum
					aktif).
				</p>
			{:else}
				<ul class="asset-list">
					{#each items as a (a.id)}
						<li class="asset-row">
							<img class="thumb" src={a.url} alt="" loading="lazy" />
							<div class="asset-main">
								{#if editingId === a.id}
									<div class="edit-grid">
										<input
											class="input-bordered input input-xs"
											bind:value={editName}
											aria-label="Nama overlay"
										/>
										<label class="toggle-label font-mono"
											><input type="checkbox" bind:checked={editEnabled} /> AKTIF</label
										>
										<div class="row-actions">
											<button
												type="button"
												class="btn btn-primary btn-xs"
												onclick={() => saveEdit(a.id)}
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
									<p class="asset-name">{a.name} <span class="edit-tag">CUSTOM</span></p>
									<p class="asset-meta font-mono">
										{a.id} · {a.enabled === false ? 'NONAKTIF' : 'AKTIF'} ·
										<span class="muted">realtime belum terintegrasi</span>
									</p>
								{/if}
							</div>
							{#if editingId !== a.id}
								<div class="row-actions">
									<button type="button" class="btn btn-ghost btn-xs" onclick={() => startEdit(a)}
										>Edit</button
									>
									<button
										type="button"
										class="btn btn-ghost text-error btn-xs"
										onclick={() => remove(a.id, a.name)}>Hapus</button
									>
								</div>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}
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
	.edit-tag {
		font-size: 0.56rem;
		font-weight: 700;
		letter-spacing: 0.12em;
		padding: 2px 6px;
		border-radius: 999px;
		border: 1px solid #2563eb;
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
	.muted {
		opacity: 0.75;
	}
</style>
