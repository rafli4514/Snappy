<script lang="ts">
	import { onMount } from 'svelte';
	import { customArStore, loadCustomAssets, type CustomArAsset } from '#lib/services/customAssets';

	let loading = $state(true);
	let saving = $state(false);
	let deletingId = $state<string | null>(null);
	let confirmDeleteId = $state<string | null>(null);
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
		try {
			await loadCustomAssets(true);
		} finally {
			loading = false;
		}
	}

	onMount(() => {
		void refresh();
	});

	async function upload(e: SubmitEvent): Promise<void> {
		e.preventDefault();
		const file = fileInput?.files?.[0];
		if (!file) {
			error = 'Pilih berkas overlay AR (PNG/WebP transparan disarankan).';
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
			if (!res.ok || !data.ok) throw new Error(data.error || 'Gagal mengunggah overlay AR.');
			name = '';
			if (fileInput) fileInput.value = '';
			await loadCustomAssets(true);
			notice = 'Overlay AR berhasil disimpan untuk tahap integrasi pelacakan kamera.';
		} catch (err) {
			error = err instanceof Error ? err.message : 'Gagal mengunggah overlay AR.';
		} finally {
			saving = false;
		}
	}

	function startEdit(item: CustomArAsset): void {
		confirmDeleteId = null;
		editingId = item.id;
		editName = item.name;
		editEnabled = item.enabled !== false;
	}

	async function saveEdit(e: SubmitEvent, id: string): Promise<void> {
		e.preventDefault();
		saving = true;
		error = null;
		notice = null;
		try {
			const res = await fetch('/api/assets/ar', {
				method: 'PUT',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					id,
					name: editName.trim() || 'Overlay AR',
					enabled: editEnabled
				})
			});
			const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
			if (!res.ok || !data.ok) throw new Error(data.error || 'Gagal memperbarui overlay.');
			editingId = null;
			await loadCustomAssets(true);
			notice = 'Overlay AR berhasil diperbarui.';
		} catch (err) {
			error = err instanceof Error ? err.message : 'Gagal memperbarui overlay.';
		} finally {
			saving = false;
		}
	}

	async function remove(id: string, label: string): Promise<void> {
		deletingId = id;
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
			confirmDeleteId = null;
			if (editingId === id) editingId = null;
			await loadCustomAssets(true);
			notice = `Overlay "${label}" dihapus.`;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Gagal menghapus overlay.';
		} finally {
			deletingId = null;
		}
	}
</script>

<div class="d-page">
	<header class="d-head">
		<div>
			<p class="d-eyebrow">Aset · Overlay AR</p>
			<h1 class="d-title">Overlay AR</h1>
			<p class="d-sub">
				Kelola aset overlay AR transparan untuk persiapan integrasi kamera. Fitur pelacakan wajah
				realtime belum aktif pada tahap ini.
			</p>
		</div>
		<div class="d-actions">
			<a class="d-btn" href="/dashboard/assets">Kembali</a>
			<button type="button" class="d-btn" onclick={refresh} disabled={loading}>
				{loading ? 'Memuat…' : 'Muat Ulang'}
			</button>
		</div>
	</header>

	<div class="d-banner d-banner-info" role="note">
		<span>
			Status MVP: halaman ini menyimpan, mengaktifkan, dan mengelola berkas overlay AR agar siap
			dipakai begitu modul face-tracking kamera diaktifkan.
		</span>
	</div>

	{#if error}
		<div class="d-banner d-banner-warn" role="status"><span>{error}</span></div>
	{/if}
	{#if notice}
		<div class="d-banner d-banner-ok" role="status"><span>{notice}</span></div>
	{/if}

	<section class="d-card" aria-label="Unggah overlay AR">
		<div class="d-card-head">
			<div>
				<h2 class="d-card-title">Unggah Overlay AR</h2>
				<p class="d-card-sub">Format PNG, WebP, atau SVG dengan latar belakang transparan.</p>
			</div>
		</div>
		<div class="d-card-body">
			<form class="upload-form" onsubmit={upload}>
				<div class="d-form-grid">
					<div class="d-field">
						<label class="d-field-label" for="ar-file">Berkas Gambar Transparan</label>
						<input
							id="ar-file"
							class="d-file"
							type="file"
							accept="image/png,image/webp,image/svg+xml"
							bind:this={fileInput}
							required
						/>
					</div>
					<div class="d-field">
						<label class="d-field-label" for="ar-name">Nama Overlay</label>
						<input
							id="ar-name"
							class="d-input"
							type="text"
							bind:value={name}
							placeholder="Contoh: Kacamata Retro"
							maxlength="80"
						/>
					</div>
				</div>
				<div class="form-footer">
					<button type="submit" class="d-btn d-btn-primary" disabled={saving}>
						{saving ? 'Mengunggah…' : 'Unggah Overlay'}
					</button>
				</div>
			</form>
		</div>
	</section>

	<section class="d-card" aria-label="Daftar aset overlay AR">
		<div class="d-card-head">
			<div>
				<h2 class="d-card-title">Daftar Aset Overlay</h2>
				<p class="d-card-sub">Aset kustom tersimpan pada penyimpanan lokal studio.</p>
			</div>
			<span class="d-pill d-num">{loading ? '…' : items.length} aset</span>
		</div>

		{#if loading}
			<div class="d-empty"><p>Memuat daftar overlay AR…</p></div>
		{:else if items.length === 0}
			<div class="d-empty">
				<p class="d-empty-title">Belum ada aset overlay AR</p>
				<p>Unggah berkas PNG atau WebP transparan melalui formulir di atas.</p>
			</div>
		{:else}
			<div class="d-list">
				{#each items as a (a.id)}
					<div class="d-row">
						<div class="thumb-wrap d-checker">
							<img class="thumb" src={a.url} alt={a.name} loading="lazy" />
						</div>
						<div class="row-info">
							{#if editingId === a.id}
								<form class="inline-edit" onsubmit={(e) => saveEdit(e, a.id)}>
									<input
										class="d-input edit-field"
										type="text"
										bind:value={editName}
										aria-label="Nama overlay"
										required
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
									<p class="row-name">{a.name}</p>
									<span class="d-pill d-pill-info">Kustom</span>
									<span class="d-pill" class:d-pill-ok={a.enabled !== false}>
										{a.enabled === false ? 'Nonaktif' : 'Aktif'}
									</span>
								</div>
								<p class="row-meta">
									ID: {a.id} · Pelacakan kamera realtime belum terintegrasi
								</p>
							{/if}
						</div>

						{#if editingId !== a.id}
							<div class="d-actions">
								{#if confirmDeleteId === a.id}
									<span class="confirm-note">Hapus "{a.name}"?</span>
									<button
										type="button"
										class="d-btn d-btn-danger d-btn-sm"
										disabled={deletingId === a.id}
										onclick={() => remove(a.id, a.name)}
									>
										{deletingId === a.id ? 'Menghapus…' : 'Ya, Hapus'}
									</button>
									<button
										type="button"
										class="d-btn d-btn-sm"
										disabled={deletingId === a.id}
										onclick={() => (confirmDeleteId = null)}
									>
										Batal
									</button>
								{:else}
									<button type="button" class="d-btn d-btn-sm" onclick={() => startEdit(a)}>
										Edit
									</button>
									<button
										type="button"
										class="d-btn d-btn-danger d-btn-sm"
										onclick={() => (confirmDeleteId = a.id)}
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
		width: 52px;
		height: 52px;
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
		font-size: 0.75rem;
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
		min-width: 160px;
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
</style>
