<script lang="ts">
	import { onMount } from 'svelte';
	import { BUILTIN_FORMATS, type StandardFormat } from '#lib/data/standardFormats';
	import { customFrameSizes, loadCustomFrameSizes } from '#lib/services/frameSizes';

	type Draft = {
		id: string;
		label: string;
		kind: 'print' | 'digital';
		pxW: number;
		pxH: number;
		cm: string;
		photosText: string;
		defaultCount: number;
	};

	let loading = $state(true);
	let saving = $state(false);
	let deletingId = $state<string | null>(null);
	let confirmDeleteId = $state<string | null>(null);
	let error = $state<string | null>(null);
	let notice = $state<string | null>(null);
	let editingId = $state<string | null>(null);
	let draft = $state<Draft | null>(null);

	const custom = $derived($customFrameSizes);

	function parsePhotos(text: string): number[] {
		return [
			...new Set(
				text
					.split(/[^0-9]+/)
					.map((x) => Number(x))
					.filter((n) => Number.isFinite(n) && n >= 1 && n <= 12)
					.map((n) => Math.round(n))
			)
		].sort((a, b) => a - b);
	}

	function newDraft(): Draft {
		return {
			id: '',
			label: '',
			kind: 'print',
			pxW: 1200,
			pxH: 1800,
			cm: '',
			photosText: '1, 2, 3, 4',
			defaultCount: 4
		};
	}

	function startAdd(): void {
		error = null;
		notice = null;
		editingId = null;
		draft = newDraft();
	}

	function startEdit(item: StandardFormat): void {
		error = null;
		notice = null;
		confirmDeleteId = null;
		editingId = item.id;
		draft = {
			id: item.id,
			label: item.label,
			kind: item.kind,
			pxW: item.pxW,
			pxH: item.pxH,
			cm: item.cm ?? '',
			photosText: (item.photos || []).join(', '),
			defaultCount: item.defaultCount
		};
	}

	function cancel(): void {
		draft = null;
		editingId = null;
	}

	function autoCm(w: number, h: number): string {
		const cw = (w / 118.110236).toFixed(2).replace('.', ',');
		const ch = (h / 118.110236).toFixed(2).replace('.', ',');
		return `${cw} × ${ch} cm`;
	}

	async function save(e: SubmitEvent): Promise<void> {
		e.preventDefault();
		if (!draft) return;
		error = null;
		notice = null;
		const photos = parsePhotos(draft.photosText);
		if (photos.length === 0) {
			error = 'Isi jumlah foto yang didukung (contoh: 1, 2, 3, 4).';
			return;
		}
		const id = draft.id
			.trim()
			.toLowerCase()
			.replace(/[^a-z0-9_-]+/g, '-')
			.replace(/^-+|-+$/g, '');
		const pxW = Math.round(Number(draft.pxW) || 0);
		const pxH = Math.round(Number(draft.pxH) || 0);
		const payload = {
			id: editingId ?? id,
			label: draft.label.trim() || (editingId ?? id),
			kind: draft.kind,
			pxW,
			pxH,
			cm: draft.cm.trim() || autoCm(pxW, pxH),
			photos,
			defaultCount: photos.includes(Number(draft.defaultCount))
				? Number(draft.defaultCount)
				: photos[0]
		};
		if (!payload.id) {
			error = 'ID wajib diisi (huruf/angka, contoh: custom-4x6).';
			return;
		}
		if (payload.pxW < 100 || payload.pxH < 100) {
			error = 'Ukuran lebar dan tinggi minimal 100 px.';
			return;
		}
		saving = true;
		try {
			const method = editingId ? 'PUT' : 'POST';
			const res = await fetch('/api/frame-sizes', {
				method,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(payload)
			});
			const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
			if (!res.ok || !data.ok) throw new Error(data.error || 'Gagal menyimpan ukuran frame.');
			await loadCustomFrameSizes(true);
			notice = editingId ? 'Ukuran frame kustom diperbarui.' : 'Ukuran frame kustom ditambahkan.';
			cancel();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Gagal menyimpan ukuran frame.';
		} finally {
			saving = false;
		}
	}

	async function remove(item: StandardFormat): Promise<void> {
		deletingId = item.id;
		error = null;
		notice = null;
		try {
			const res = await fetch('/api/frame-sizes', {
				method: 'DELETE',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ id: item.id })
			});
			const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
			if (!res.ok || !data.ok) throw new Error(data.error || 'Gagal menghapus ukuran frame.');
			confirmDeleteId = null;
			await loadCustomFrameSizes(true);
			notice = `Ukuran frame "${item.label}" berhasil dihapus.`;
			if (editingId === item.id) cancel();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Gagal menghapus ukuran frame.';
		} finally {
			deletingId = null;
		}
	}

	async function refresh(): Promise<void> {
		loading = true;
		error = null;
		try {
			await loadCustomFrameSizes(true);
		} finally {
			loading = false;
		}
	}

	onMount(() => {
		void refresh();
	});
</script>

<div class="d-page">
	<header class="d-head">
		<div>
			<p class="d-eyebrow">Aset · Ukuran Frame</p>
			<h1 class="d-title">Ukuran Frame</h1>
			<p class="d-sub">
				Format bawaan 300 DPI terkunci untuk menjaga presisi cetak. Tambahkan ukuran kustom bila
				dibutuhkan — format kustom otomatis ikut terbaca pada Frame Studio, canvas, dan cetak.
			</p>
		</div>
		<div class="d-actions">
			<a class="d-btn" href="/dashboard/assets">Kembali</a>
			<button type="button" class="d-btn" onclick={refresh} disabled={loading}>
				{loading ? 'Memuat…' : 'Muat Ulang'}
			</button>
			<button type="button" class="d-btn d-btn-primary" onclick={startAdd} disabled={saving}>
				Tambah Ukuran Kustom
			</button>
		</div>
	</header>

	{#if error}
		<div class="d-banner d-banner-warn" role="status"><span>{error}</span></div>
	{/if}
	{#if notice}
		<div class="d-banner d-banner-ok" role="status"><span>{notice}</span></div>
	{/if}

	{#if draft}
		<section class="d-card" aria-label="Formulir ukuran frame kustom">
			<div class="d-card-head">
				<div>
					<h2 class="d-card-title">
						{editingId ? 'Edit Ukuran Kustom' : 'Tambah Ukuran Kustom'}
					</h2>
					<p class="d-card-sub">
						Dimensi otomatis dihitung pada 300 DPI bila kolom sentimeter dikosongkan.
					</p>
				</div>
				<span class="d-pill d-pill-info d-num">
					{draft.pxW} × {draft.pxH} px · {autoCm(draft.pxW, draft.pxH)}
				</span>
			</div>
			<div class="d-card-body">
				<form class="size-form" onsubmit={save}>
					<div class="d-form-grid">
						<div class="d-field">
							<label class="d-field-label" for="fs-id">
								ID {editingId ? '(Terkunci)' : ''}
							</label>
							<input
								id="fs-id"
								class="d-input"
								type="text"
								bind:value={draft.id}
								disabled={!!editingId}
								placeholder="custom-4x6"
								required
							/>
						</div>
						<div class="d-field">
							<label class="d-field-label" for="fs-label">Nama Label</label>
							<input
								id="fs-label"
								class="d-input"
								type="text"
								bind:value={draft.label}
								placeholder="4×6 · Kustom"
								required
							/>
						</div>
						<div class="d-field">
							<label class="d-field-label" for="fs-kind">Jenis Output</label>
							<select id="fs-kind" class="d-select" bind:value={draft.kind}>
								<option value="print">Cetak</option>
								<option value="digital">Digital</option>
							</select>
						</div>
						<div class="d-field">
							<label class="d-field-label" for="fs-w">Lebar (px)</label>
							<input
								id="fs-w"
								class="d-input d-num"
								type="number"
								min="100"
								bind:value={draft.pxW}
								required
							/>
						</div>
						<div class="d-field">
							<label class="d-field-label" for="fs-h">Tinggi (px)</label>
							<input
								id="fs-h"
								class="d-input d-num"
								type="number"
								min="100"
								bind:value={draft.pxH}
								required
							/>
						</div>
						<div class="d-field">
							<label class="d-field-label" for="fs-cm">Ukuran Fisik (cm)</label>
							<input
								id="fs-cm"
								class="d-input"
								type="text"
								bind:value={draft.cm}
								placeholder={autoCm(draft.pxW, draft.pxH)}
							/>
						</div>
						<div class="d-field">
							<label class="d-field-label" for="fs-photos">Jumlah Foto (pisah koma)</label>
							<input
								id="fs-photos"
								class="d-input"
								type="text"
								bind:value={draft.photosText}
								placeholder="1, 2, 3, 4"
								required
							/>
						</div>
						<div class="d-field">
							<label class="d-field-label" for="fs-default">Default Jumlah Foto</label>
							<input
								id="fs-default"
								class="d-input d-num"
								type="number"
								min="1"
								max="12"
								bind:value={draft.defaultCount}
								required
							/>
						</div>
					</div>
					<div class="form-footer">
						<button type="button" class="d-btn d-btn-ghost" onclick={cancel} disabled={saving}>
							Batal
						</button>
						<button type="submit" class="d-btn d-btn-primary" disabled={saving}>
							{saving ? 'Menyimpan…' : 'Simpan Ukuran'}
						</button>
					</div>
				</form>
			</div>
		</section>
	{/if}

	<section class="d-card" aria-label="Format kustom">
		<div class="d-card-head">
			<div>
				<h2 class="d-card-title">Format Kustom</h2>
				<p class="d-card-sub">Dapat diedit atau dihapus kapan saja.</p>
			</div>
			<span class="d-pill d-pill-ok d-num">{loading ? '…' : custom.length} format</span>
		</div>

		{#if loading}
			<div class="d-empty"><p>Memuat ukuran frame kustom…</p></div>
		{:else if custom.length === 0}
			<div class="d-empty">
				<p class="d-empty-title">Belum ada ukuran frame kustom</p>
				<p>
					Klik "Tambah Ukuran Kustom" di atas untuk mendaftarkan dimensi cetak atau digital baru.
				</p>
			</div>
		{:else}
			<div class="d-list">
				{#each custom as format (format.id)}
					<div class="d-row">
						<div class="row-info">
							<div class="row-top">
								<p class="row-name">{format.label}</p>
								<span class="d-pill d-pill-info">Kustom</span>
								<span class="d-pill">
									{format.kind === 'digital' ? 'Digital' : 'Cetak'}
								</span>
							</div>
							<p class="row-meta d-num">
								ID: {format.id} · {format.pxW} × {format.pxH} px · {format.cm} · {format.photos.join(
									'/'
								)} foto (default {format.defaultCount})
							</p>
						</div>
						<div class="d-actions">
							{#if confirmDeleteId === format.id}
								<span class="confirm-note">Hapus "{format.label}"?</span>
								<button
									type="button"
									class="d-btn d-btn-danger d-btn-sm"
									disabled={deletingId === format.id}
									onclick={() => remove(format)}
								>
									{deletingId === format.id ? 'Menghapus…' : 'Ya, Hapus'}
								</button>
								<button
									type="button"
									class="d-btn d-btn-sm"
									disabled={deletingId === format.id}
									onclick={() => (confirmDeleteId = null)}
								>
									Batal
								</button>
							{:else}
								<button type="button" class="d-btn d-btn-sm" onclick={() => startEdit(format)}>
									Edit
								</button>
								<button
									type="button"
									class="d-btn d-btn-danger d-btn-sm"
									onclick={() => (confirmDeleteId = format.id)}
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

	<section class="d-card" aria-label="Format bawaan terkunci">
		<div class="d-card-head">
			<div>
				<h2 class="d-card-title">Format Bawaan</h2>
				<p class="d-card-sub">Standar cetak resmi DISTUDIO (terkunci).</p>
			</div>
			<span class="d-pill d-num">{BUILTIN_FORMATS.length} format</span>
		</div>
		<div class="d-list">
			{#each BUILTIN_FORMATS as format (format.id)}
				<div class="d-row">
					<div class="row-info">
						<div class="row-top">
							<p class="row-name">{format.label}</p>
							<span class="d-pill">Terkunci</span>
						</div>
						<p class="row-meta d-num">
							{format.pxW} × {format.pxH} px · {format.cm} · {format.photos.join('/')} foto
						</p>
					</div>
					<span class="d-pill">
						{format.kind === 'digital' ? 'Digital' : 'Cetak'}
					</span>
				</div>
			{/each}
		</div>
	</section>
</div>

<style>
	.size-form {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.form-footer {
		display: flex;
		flex-wrap: wrap;
		justify-content: flex-end;
		gap: 8px;
		padding-top: 8px;
		border-top: 1px solid var(--d-border);
	}

	.row-info {
		flex: 1;
		min-width: 220px;
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

	.confirm-note {
		font-size: 0.75rem;
		font-weight: 700;
		color: var(--d-err);
	}
</style>
