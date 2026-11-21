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

	async function save(): Promise<void> {
		if (!draft) return;
		error = null;
		notice = null;
		const photos = parsePhotos(draft.photosText);
		if (photos.length === 0) {
			error = 'Isi jumlah foto (contoh: 1, 2, 3, 4).';
			return;
		}
		const id = draft.id
			.trim()
			.toLowerCase()
			.replace(/[^a-z0-9_-]+/g, '-')
			.replace(/^-+|-+$/g, '');
		const payload = {
			id: editingId ?? id,
			label: draft.label.trim() || (editingId ?? id),
			kind: draft.kind,
			pxW: Math.round(Number(draft.pxW) || 0),
			pxH: Math.round(Number(draft.pxH) || 0),
			cm:
				draft.cm.trim() ||
				autoCm(Math.round(Number(draft.pxW) || 0), Math.round(Number(draft.pxH) || 0)),
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
			error = 'Ukuran px minimal 100.';
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
			if (!res.ok || !data.ok) throw new Error(data.error || 'Gagal menyimpan.');
			await loadCustomFrameSizes(true);
			notice = editingId ? 'Frame size diperbarui.' : 'Frame size custom ditambahkan.';
			cancel();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Gagal menyimpan frame size.';
		} finally {
			saving = false;
		}
	}

	async function remove(item: StandardFormat): Promise<void> {
		if (!confirm(`Hapus frame size "${item.label}"?`)) return;
		error = null;
		notice = null;
		try {
			const res = await fetch('/api/frame-sizes', {
				method: 'DELETE',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ id: item.id })
			});
			const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
			if (!res.ok || !data.ok) throw new Error(data.error || 'Gagal menghapus.');
			await loadCustomFrameSizes(true);
			notice = 'Frame size custom dihapus.';
			if (editingId === item.id) cancel();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Gagal menghapus frame size.';
		}
	}

	async function refresh(): Promise<void> {
		loading = true;
		error = null;
		await loadCustomFrameSizes(true);
		loading = false;
	}

	onMount(() => {
		void refresh();
	});
</script>

<div class="dash-page">
	<header class="dash-head">
		<div class="head-row">
			<div>
				<p class="eyebrow font-mono">ADMIN · ASSET · FRAME SIZE</p>
				<h1 class="dash-title font-display">Frame size</h1>
				<p class="dash-sub">
					Format bawaan <strong>terkunci</strong> (tidak bisa diedit). Ukuran
					<strong>custom baru</strong>
					bisa ditambah, diedit, dan dihapus. Custom yang tersimpan ikut dipakai resolusi format (strip/canvas/print)
					saat runtime.
				</p>
			</div>
			<div class="row-actions">
				<button type="button" class="btn btn-outline btn-sm" onclick={refresh} disabled={loading}
					>Muat ulang</button
				>
				<button type="button" class="btn btn-primary btn-sm" onclick={startAdd} disabled={saving}
					>Tambah custom</button
				>
			</div>
		</div>
	</header>

	{#if error}
		<div class="alert alert-warning" role="status"><span>{error}</span></div>
	{/if}
	{#if notice}
		<div class="alert alert-success" role="status"><span>{notice}</span></div>
	{/if}

	{#if draft}
		<section class="panel" aria-label="Form frame size custom">
			<div class="panel-head">
				<h2 class="section-title font-mono">{editingId ? 'EDIT CUSTOM' : 'TAMBAH CUSTOM'}</h2>
			</div>
			<div class="panel-body form-grid">
				<label class="field">
					<span class="label font-mono">ID {editingId ? '(terkunci)' : ''}</span>
					<input
						class="input-bordered input input-sm"
						bind:value={draft.id}
						disabled={!!editingId}
						placeholder="custom-4x6"
					/>
				</label>
				<label class="field">
					<span class="label font-mono">LABEL</span>
					<input
						class="input-bordered input input-sm"
						bind:value={draft.label}
						placeholder="4×6 · Custom"
					/>
				</label>
				<label class="field">
					<span class="label font-mono">JENIS</span>
					<select class="select-bordered select select-sm" bind:value={draft.kind}>
						<option value="print">Cetak</option>
						<option value="digital">Digital</option>
					</select>
				</label>
				<label class="field">
					<span class="label font-mono">LEBAR (px)</span>
					<input
						class="input-bordered input input-sm"
						type="number"
						min="100"
						bind:value={draft.pxW}
					/>
				</label>
				<label class="field">
					<span class="label font-mono">TINGGI (px)</span>
					<input
						class="input-bordered input input-sm"
						type="number"
						min="100"
						bind:value={draft.pxH}
					/>
				</label>
				<label class="field">
					<span class="label font-mono">CM / KETERANGAN</span>
					<input
						class="input-bordered input input-sm"
						bind:value={draft.cm}
						placeholder={autoCm(draft.pxW, draft.pxH)}
					/>
				</label>
				<label class="field">
					<span class="label font-mono">JUMLAH FOTO (pisah koma)</span>
					<input
						class="input-bordered input input-sm"
						bind:value={draft.photosText}
						placeholder="1, 2, 3, 4"
					/>
				</label>
				<label class="field">
					<span class="label font-mono">DEFAULT COUNT</span>
					<input
						class="input-bordered input input-sm"
						type="number"
						min="1"
						max="12"
						bind:value={draft.defaultCount}
					/>
				</label>
				<div class="row-actions form-actions">
					<button type="button" class="btn btn-primary btn-sm" onclick={save} disabled={saving}
						>{saving ? 'Menyimpan…' : 'Simpan'}</button
					>
					<button type="button" class="btn btn-ghost btn-sm" onclick={cancel} disabled={saving}
						>Batal</button
					>
				</div>
			</div>
		</section>
	{/if}

	<section class="panel" aria-label="Format bawaan (terkunci)">
		<div class="panel-head">
			<h2 class="section-title font-mono">BAWAAN (TERKUNCI)</h2>
			<span class="count font-mono">{BUILTIN_FORMATS.length}</span>
		</div>
		<div class="panel-body">
			<ul class="size-list">
				{#each BUILTIN_FORMATS as format (format.id)}
					<li class="size-row">
						<div class="row-main">
							<p class="size-name">{format.label} <span class="lock-tag">TERKUNCI</span></p>
							<p class="size-meta font-mono">
								{format.pxW} × {format.pxH} px · {format.cm} · {format.photos.join('/')} foto
							</p>
						</div>
						<span class="badge">{format.kind === 'digital' ? 'DIGITAL' : 'CETAK'}</span>
					</li>
				{/each}
			</ul>
		</div>
	</section>

	<section class="panel" aria-label="Format custom (dapat diedit)">
		<div class="panel-head">
			<h2 class="section-title font-mono">CUSTOM (DAPAT DIEDIT)</h2>
			<span class="count font-mono">{loading ? '…' : custom.length}</span>
		</div>
		<div class="panel-body">
			{#if loading}
				<p class="panel-note">Memuat frame size custom…</p>
			{:else if custom.length === 0}
				<p class="panel-note">
					Belum ada frame size custom. Tambahkan ukuran baru bila diperlukan.
				</p>
			{:else}
				<ul class="size-list">
					{#each custom as format (format.id)}
						<li class="size-row">
							<div class="row-main">
								<p class="size-name">{format.label} <span class="edit-tag">CUSTOM</span></p>
								<p class="size-meta font-mono">
									{format.id} · {format.pxW} × {format.pxH} px · {format.cm} · {format.photos.join(
										'/'
									)} foto
								</p>
							</div>
							<div class="row-actions">
								<span class="badge">{format.kind === 'digital' ? 'DIGITAL' : 'CETAK'}</span>
								<button type="button" class="btn btn-ghost btn-xs" onclick={() => startEdit(format)}
									>Edit</button
								>
								<button
									type="button"
									class="btn btn-ghost text-error btn-xs"
									onclick={() => remove(format)}>Hapus</button
								>
							</div>
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
	.size-list {
		margin: 0;
		padding: 0;
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.size-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 12px;
		border: 1px solid var(--color-base-300, #d6d3d1);
		border-radius: 10px;
		background: var(--color-base-100, #fff);
		flex-wrap: wrap;
	}
	.row-main {
		min-width: 0;
	}
	.size-name {
		margin: 0;
		font-size: 0.9rem;
		font-weight: 700;
		display: flex;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
	}
	.size-meta {
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
	.badge {
		font-size: 0.62rem;
		font-weight: 700;
		letter-spacing: 0.12em;
		padding: 2px 10px;
		border-radius: 999px;
		border: 1px solid var(--color-base-300, #d6d3d1);
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
	.form-grid {
		display: grid;
		gap: 10px;
		grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
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
	.form-actions {
		grid-column: 1 / -1;
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
