<script lang="ts">
	import { onMount } from 'svelte';
	import {
		BUILTIN_FORMATS,
		generateCustomSpec,
		specFor,
		type StandardFormat
	} from '#lib/data/standardFormats';
	import { customFrameSizes, loadCustomFrameSizes } from '#lib/services/frameSizes';
	import type { ProductSpec } from '#lib/types';
	import {
		Plus,
		Search,
		Copy,
		Check,
		Pencil,
		Trash2,
		Lock,
		X,
		SlidersHorizontal,
		Upload
	} from '@lucide/svelte';

	type FilterTab = 'all' | 'builtin' | 'custom' | 'digital';

	type Draft = {
		id: string;
		idTouched: boolean;
		label: string;
		kind: 'print' | 'digital';
		pxW: number;
		pxH: number;
		cm: string;
		photos: number[];
		defaultCount: number;
		thumbnail: string | null;
	};

	/** Aset thumbnail contoh dari halaman pilih strip (/strip). */
	const STRIP_THUMBS: Record<string, string> = {
		'2x6:3': '/strip-select/01-2x6-3foto.png',
		'2x6:4': '/strip-select/02-2x6-4foto.png',
		'2x8:4': '/strip-select/03-2x8-4foto.png',
		'2x8:5': '/strip-select/04-2x8-5foto.png',
		'4r-double:4': '/strip-select/05-4r-double.png',
		'4r-double:6': '/strip-select/06-4r-6foto.png',
		'3r:3': '/strip-select/07-3r-portrait-3foto.png',
		'5r:4': '/strip-select/08-5r-portrait-4foto.png',
		'square:4': '/strip-select/09-square-1x1-4foto.png'
	};

	const PHOTO_CHOICES = [1, 2, 3, 4, 5, 6];
	const BUILTIN_IDS = new Set(BUILTIN_FORMATS.map((f) => f.id));

	let loading = $state(true);
	let saving = $state(false);
	let deletingId = $state<string | null>(null);
	let confirmDeleteId = $state<string | null>(null);
	let error = $state<string | null>(null);
	let notice = $state<string | null>(null);

	let query = $state('');
	let activeTab = $state<FilterTab>('all');
	let copiedId = $state<string | null>(null);
	let previewCounts = $state<Record<string, number>>({});

	let editingId = $state<string | null>(null);
	let draft = $state<Draft | null>(null);
	let thumbDragging = $state(false);
	let thumbBusy = $state(false);
	let thumbInput = $state<HTMLInputElement | null>(null);

	const custom = $derived($customFrameSizes);

	const combinedFormats = $derived.by(() => [...custom, ...BUILTIN_FORMATS]);

	const filteredFormats = $derived.by(() => {
		const q = query.trim().toLowerCase();
		return combinedFormats.filter((item) => {
			const isCustom = !BUILTIN_IDS.has(item.id);
			if (activeTab === 'custom' && !isCustom) return false;
			if (activeTab === 'builtin' && isCustom) return false;
			if (activeTab === 'digital' && item.kind !== 'digital') return false;
			if (!q) return true;
			return (
				item.label.toLowerCase().includes(q) ||
				item.id.toLowerCase().includes(q) ||
				item.cm.toLowerCase().includes(q) ||
				`${item.pxW}x${item.pxH}`.includes(q.replace(/\s+/g, ''))
			);
		});
	});

	const counts = $derived.by(() => ({
		all: combinedFormats.length,
		builtin: BUILTIN_FORMATS.length,
		digital: combinedFormats.filter((f) => f.kind === 'digital').length,
		custom: custom.length
	}));

	const draftPreviewSpec = $derived.by((): ProductSpec | null => {
		if (!draft) return null;
		const pxW = Math.max(100, Math.round(Number(draft.pxW) || 1200));
		const pxH = Math.max(100, Math.round(Number(draft.pxH) || 1800));
		const count = draft.photos.includes(draft.defaultCount)
			? draft.defaultCount
			: (draft.photos[0] ?? 4);
		return generateCustomSpec(
			{
				id: draft.id || 'preview',
				label: draft.label || 'Kustom',
				kind: draft.kind,
				pxW,
				pxH,
				cm: draft.cm || autoCm(pxW, pxH),
				ratio: pxW / pxH,
				photos: draft.photos.length ? draft.photos : [4],
				defaultCount: count
			},
			count
		);
	});

	function slugify(value: string): string {
		return value
			.trim()
			.toLowerCase()
			.replace(/[^a-z0-9_-]+/g, '-')
			.replace(/^-+|-+$/g, '');
	}

	function autoCm(w: number, h: number): string {
		const cw = (Math.max(1, w) / 118.110236).toFixed(2).replace('.', ',');
		const ch = (Math.max(1, h) / 118.110236).toFixed(2).replace('.', ',');
		return `${cw} × ${ch} cm`;
	}

	/** Pilih jumlah foto awal yang punya aset PNG di /strip-select bila tersedia. */
	function activeCountFor(format: StandardFormat): number {
		const picked = previewCounts[format.id];
		if (picked && format.photos.includes(picked)) return picked;
		if (STRIP_THUMBS[`${format.id}:${format.defaultCount}`]) return format.defaultCount;
		const withAsset = format.photos.find((n) => Boolean(STRIP_THUMBS[`${format.id}:${n}`]));
		return withAsset ?? format.defaultCount;
	}

	function thumbSrcFor(format: StandardFormat, count: number): string | null {
		if (format.thumbnail) return format.thumbnail;
		return STRIP_THUMBS[`${format.id}:${count}`] ?? null;
	}

	function setPreviewCount(formatId: string, count: number): void {
		previewCounts = { ...previewCounts, [formatId]: count };
	}

	/** Hitung kotak slot untuk SVG thumbnail agar persis serasi dengan aset /strip-select. */
	function layoutSlots(spec: ProductSpec): { x: number; y: number; w: number; h: number }[] {
		const out: { x: number; y: number; w: number; h: number }[] = [];
		let y = spec.margin + spec.hairline;
		for (const row of spec.rows) {
			const totalW =
				row.cells.reduce((sum, c) => sum + c.w, 0) + spec.gap * Math.max(0, row.cells.length - 1);
			let x = (spec.pxW - totalW) / 2;
			for (const cell of row.cells) {
				out.push({ x, y, w: cell.w, h: row.h });
				x += cell.w + spec.gap;
			}
			y += row.h + spec.gap;
		}
		return out;
	}

	function startAdd(): void {
		error = null;
		notice = null;
		editingId = null;
		draft = {
			id: '',
			idTouched: false,
			label: '',
			kind: 'print',
			pxW: 1200,
			pxH: 1800,
			cm: '',
			photos: [2, 4],
			defaultCount: 4,
			thumbnail: null
		};
	}

	function startEdit(item: StandardFormat): void {
		error = null;
		notice = null;
		confirmDeleteId = null;
		editingId = item.id;
		draft = {
			id: item.id,
			idTouched: true,
			label: item.label,
			kind: item.kind,
			pxW: item.pxW,
			pxH: item.pxH,
			cm: item.cm ?? '',
			photos: item.photos?.length ? [...item.photos] : [item.defaultCount || 4],
			defaultCount: item.defaultCount,
			thumbnail: item.thumbnail ?? null
		};
	}

	function closeModal(): void {
		if (saving) return;
		draft = null;
		editingId = null;
		thumbDragging = false;
	}

	/** Baca file gambar, ambil dimensi aslinya, lalu perkecil menjadi thumbnail PNG ringan. */
	function loadThumbFile(file: File): Promise<{ dataUrl: string; width: number; height: number }> {
		return new Promise((resolve, reject) => {
			const reader = new FileReader();
			reader.onerror = () => reject(new Error('Gagal membaca berkas gambar.'));
			reader.onload = () => {
				const raw = reader.result as string;
				const img = new Image();
				img.onerror = () => reject(new Error('Gambar tidak valid atau rusak.'));
				img.onload = () => {
					const origW = img.naturalWidth || 1200;
					const origH = img.naturalHeight || 1800;
					const maxSide = 480;
					const scale = Math.min(1, maxSide / Math.max(origW, origH));
					const w = Math.max(1, Math.round(origW * scale));
					const h = Math.max(1, Math.round(origH * scale));
					const canvas = document.createElement('canvas');
					canvas.width = w;
					canvas.height = h;
					const ctx = canvas.getContext('2d');
					if (!ctx) {
						reject(new Error('Kanvas tidak tersedia.'));
						return;
					}
					ctx.drawImage(img, 0, 0, w, h);
					let dataUrl = canvas.toDataURL('image/png');
					if (dataUrl.length > 650_000) {
						dataUrl = canvas.toDataURL('image/webp', 0.88);
					}
					resolve({ dataUrl, width: origW, height: origH });
				};
				img.src = raw;
			};
			reader.readAsDataURL(file);
		});
	}

	async function processThumbFile(file: File): Promise<void> {
		if (!draft || thumbBusy) return;
		if (
			!/^image\/(png|jpeg|webp|svg\+xml)$/i.test(file.type) &&
			!/\.(png|jpe?g|webp|svg)$/i.test(file.name)
		) {
			error = 'Format gambar contoh harus PNG, JPEG, WebP, atau SVG.';
			return;
		}
		thumbBusy = true;
		error = null;
		try {
			const res = await loadThumbFile(file);
			draft.thumbnail = res.dataUrl;
			draft.pxW = Math.max(100, Math.min(12000, res.width));
			draft.pxH = Math.max(100, Math.min(12000, res.height));
			if (!editingId && !draft.label.trim()) {
				const base = file.name.replace(/\.(png|jpe?g|webp|svg)$/i, '');
				handleLabelInput(base);
			}
		} catch (e) {
			error = e instanceof Error ? e.message : 'Gagal memproses gambar contoh.';
		} finally {
			thumbBusy = false;
		}
	}

	async function handleThumbInput(e: Event): Promise<void> {
		const input = e.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (file) await processThumbFile(file);
	}

	function handleThumbDragOver(e: DragEvent): void {
		e.preventDefault();
		if (!thumbBusy) thumbDragging = true;
	}

	function handleThumbDragLeave(): void {
		thumbDragging = false;
	}

	async function handleThumbDrop(e: DragEvent): Promise<void> {
		e.preventDefault();
		thumbDragging = false;
		const file = e.dataTransfer?.files?.[0];
		if (file) await processThumbFile(file);
	}

	function handleLabelInput(value: string): void {
		if (!draft) return;
		draft.label = value;
		if (!editingId && !draft.idTouched) {
			draft.id = slugify(value);
		}
	}

	function toggleDraftPhoto(n: number): void {
		if (!draft) return;
		const exists = draft.photos.includes(n);
		if (exists && draft.photos.length === 1) return;
		const next = exists
			? draft.photos.filter((x) => x !== n)
			: [...draft.photos, n].sort((a, b) => a - b);
		draft.photos = next;
		if (!next.includes(draft.defaultCount)) {
			draft.defaultCount = next[next.length - 1];
		}
	}

	async function save(e: SubmitEvent): Promise<void> {
		e.preventDefault();
		if (!draft) return;
		error = null;
		notice = null;

		const photos = [...new Set(draft.photos)].sort((a, b) => a - b);
		if (photos.length === 0) {
			error = 'Pilih minimal satu jumlah foto yang didukung.';
			return;
		}

		const cleanId = editingId ?? slugify(draft.id || draft.label);
		const pxW = Math.round(Number(draft.pxW) || 0);
		const pxH = Math.round(Number(draft.pxH) || 0);
		if (!cleanId) {
			error = 'Nama atau ID ukuran wajib diisi.';
			return;
		}
		if (pxW < 100 || pxH < 100) {
			error = 'Lebar dan tinggi minimal 100 px.';
			return;
		}

		const payload = {
			id: cleanId,
			label: draft.label.trim() || cleanId,
			kind: draft.kind,
			pxW,
			pxH,
			cm:
				draft.cm.trim() ||
				(draft.kind === 'digital' ? `${pxW}:${pxH} · digital` : autoCm(pxW, pxH)),
			photos,
			defaultCount: photos.includes(draft.defaultCount) ? draft.defaultCount : photos[0],
			...(draft.thumbnail ? { thumbnail: draft.thumbnail } : {})
		};

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
			notice = editingId
				? `Ukuran "${payload.label}" diperbarui.`
				: `Ukuran "${payload.label}" ditambahkan.`;
			draft = null;
			editingId = null;
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
			notice = `Ukuran "${item.label}" dihapus.`;
			if (editingId === item.id) closeModal();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Gagal menghapus ukuran frame.';
		} finally {
			deletingId = null;
		}
	}

	async function copyDim(format: StandardFormat): Promise<void> {
		try {
			await navigator.clipboard.writeText(`${format.pxW} x ${format.pxH}`);
			copiedId = format.id;
			setTimeout(() => {
				if (copiedId === format.id) copiedId = null;
			}, 1600);
		} catch {
			// abaikan bila clipboard tidak diizinkan
		}
	}

	function handleWindowKeydown(e: KeyboardEvent): void {
		if (e.key === 'Escape' && draft) {
			closeModal();
		}
	}

	onMount(async () => {
		try {
			await loadCustomFrameSizes(true);
		} finally {
			loading = false;
		}
	});
</script>

<svelte:window onkeydown={handleWindowKeydown} />

{#snippet miniStripSvg(spec: ProductSpec)}
	{@const slots = layoutSlots(spec)}
	{@const minSide = Math.min(spec.pxW, spec.pxH)}
	{@const borderW = Math.max(8, Math.round(minSide * 0.032))}
	{@const outerR = Math.round(minSide * 0.045)}
	{@const slotR = Math.round(minSide * 0.024)}
	{@const footH = Math.max(14, Math.round(spec.footer * 0.16))}
	{@const footW = Math.round(spec.pxW * (spec.cutLine === 'vertical' ? 0.24 : 0.36))}
	{@const footY = spec.pxH - spec.footer * 0.56}
	<svg class="fz-svg-thumb" viewBox="0 0 {spec.pxW} {spec.pxH}" role="img" aria-hidden="true">
		<rect
			x={borderW / 2}
			y={borderW / 2}
			width={spec.pxW - borderW}
			height={spec.pxH - borderW}
			rx={outerR}
			fill="#ffffff"
			stroke="#1e293b"
			stroke-width={borderW}
		/>
		{#each slots as s, idx (idx)}
			<rect
				x={s.x}
				y={s.y}
				width={s.w}
				height={s.h}
				rx={slotR}
				fill="#e8e4dc"
				stroke="#d4d0c8"
				stroke-width={Math.max(4, Math.round(minSide * 0.008))}
			/>
		{/each}
		{#if spec.cutLine === 'vertical'}
			<line
				x1={spec.pxW / 2}
				y1={borderW}
				x2={spec.pxW / 2}
				y2={spec.pxH - borderW}
				stroke="#94a3b8"
				stroke-width={Math.max(6, Math.round(minSide * 0.014))}
			/>
			<rect
				x={spec.pxW * 0.25 - footW / 2}
				y={footY}
				width={footW}
				height={footH}
				rx={footH / 2}
				fill="#d1d5db"
			/>
			<rect
				x={spec.pxW * 0.75 - footW / 2}
				y={footY}
				width={footW}
				height={footH}
				rx={footH / 2}
				fill="#d1d5db"
			/>
		{:else}
			<rect
				x={(spec.pxW - footW) / 2}
				y={footY}
				width={footW}
				height={footH}
				rx={footH / 2}
				fill="#d1d5db"
			/>
		{/if}
	</svg>
{/snippet}

<div class="fz-page">
	<header class="fz-head">
		<div class="fz-head-copy">
			<h1 class="fz-title">Ukuran Frame</h1>
			<p class="fz-sub">
				Standar cetak 300 DPI dan format kustom yang dipakai di Frame Studio &amp; Photobooth.
			</p>
		</div>
		<button type="button" class="fz-btn is-primary" onclick={startAdd} disabled={saving}>
			<Plus size={15} />
			Tambah Ukuran
		</button>
	</header>

	{#if error}
		<div class="d-banner d-banner-err" role="alert"><span>{error}</span></div>
	{/if}
	{#if notice}
		<div class="d-banner d-banner-ok" role="status"><span>{notice}</span></div>
	{/if}

	<!-- Toolbar Filter Minimalis -->
	<div class="fz-toolbar">
		<div class="fz-search">
			<Search size={14} />
			<input
				type="search"
				class="fz-search-input"
				placeholder="Cari ukuran atau piksel…"
				bind:value={query}
				aria-label="Cari ukuran frame"
			/>
		</div>

		<div class="fz-pills" role="group" aria-label="Filter kategori ukuran">
			<button
				type="button"
				class="fz-pill"
				class:is-active={activeTab === 'all'}
				onclick={() => (activeTab = 'all')}
			>
				Semua ({counts.all})
			</button>
			<button
				type="button"
				class="fz-pill"
				class:is-active={activeTab === 'builtin'}
				onclick={() => (activeTab = 'builtin')}
			>
				Bawaan ({counts.builtin})
			</button>
			<button
				type="button"
				class="fz-pill"
				class:is-active={activeTab === 'custom'}
				onclick={() => (activeTab = 'custom')}
			>
				Kustom ({counts.custom})
			</button>
			{#if counts.digital > 0}
				<button
					type="button"
					class="fz-pill"
					class:is-active={activeTab === 'digital'}
					onclick={() => (activeTab = 'digital')}
				>
					Digital ({counts.digital})
				</button>
			{/if}
		</div>
	</div>

	{#if loading}
		<div class="fz-grid">
			{#each Array(6) as _, idx (idx)}
				<div class="fz-skel"></div>
			{/each}
		</div>
	{:else if filteredFormats.length === 0}
		<section class="fz-empty" aria-label="Daftar kosong">
			<SlidersHorizontal size={22} />
			<p class="fz-empty-title">
				{activeTab === 'custom' ? 'Belum ada ukuran kustom' : 'Tidak ada ukuran frame yang cocok'}
			</p>
			<p class="fz-empty-sub">
				{activeTab === 'custom'
					? 'Tambahkan dimensi cetak atau digital kustom untuk langsung dipakai di Frame Studio.'
					: 'Coba ubah kata kunci pencarian atau pilih kategori lain.'}
			</p>
			{#if activeTab === 'custom'}
				<button type="button" class="fz-btn is-primary" onclick={startAdd}>
					<Plus size={14} />
					Tambah Ukuran Kustom
				</button>
			{/if}
		</section>
	{:else}
		<section class="fz-grid" aria-label="Daftar ukuran frame">
			{#each filteredFormats as format (format.id)}
				{@const isCustom = !BUILTIN_IDS.has(format.id)}
				{@const activeCount = activeCountFor(format)}
				{@const pngSrc = thumbSrcFor(format, activeCount)}
				{@const spec = pngSrc ? null : specFor(format.id, activeCount)}
				<article class="fz-card">
					<div class="fz-media">
						<div class="fz-media-badges">
							<span class="fz-badge">{format.kind === 'digital' ? 'Digital' : 'Cetak'}</span>
							{#if isCustom}
								<span class="fz-badge is-custom">Kustom</span>
							{/if}
						</div>

						<button
							type="button"
							class="fz-copy-chip d-num"
							onclick={() => copyDim(format)}
							title="Salin dimensi piksel untuk Canva"
						>
							{#if copiedId === format.id}
								<Check size={11} /> Tersalin
							{:else}
								<Copy size={11} /> {format.pxW} × {format.pxH}
							{/if}
						</button>

						<div class="fz-thumb-wrap">
							{#if pngSrc}
								<img
									class="fz-png-thumb"
									src={pngSrc}
									alt="Contoh layout {format.label} {activeCount} foto"
									loading="lazy"
									draggable="false"
								/>
							{:else if spec}
								{@render miniStripSvg(spec)}
							{/if}
						</div>
					</div>

					<div class="fz-body">
						<div class="fz-name-row">
							<h2 class="fz-name" title={format.label}>{format.label}</h2>
							{#if !isCustom}
								<span class="fz-lock" title="Format bawaan terkunci" aria-label="Bawaan terkunci">
									<Lock size={12} />
								</span>
							{/if}
						</div>

						<p class="fz-spec d-num">{format.cm}</p>

						<div class="fz-counts" role="group" aria-label="Pratinjau jumlah foto {format.label}">
							{#each format.photos as n (n)}
								<button
									type="button"
									class="fz-count-chip d-num"
									class:is-active={activeCount === n}
									onclick={() => setPreviewCount(format.id, n)}
									title="Lihat contoh {n} foto"
								>
									{n} foto
								</button>
							{/each}
						</div>
					</div>

					{#if isCustom}
						<div class="fz-foot">
							{#if confirmDeleteId === format.id}
								<button
									type="button"
									class="fz-sm-btn is-danger"
									disabled={deletingId === format.id}
									onclick={() => remove(format)}
								>
									{deletingId === format.id ? 'Menghapus…' : 'Hapus'}
								</button>
								<button
									type="button"
									class="fz-sm-btn"
									disabled={deletingId === format.id}
									onclick={() => (confirmDeleteId = null)}
								>
									Batal
								</button>
							{:else}
								<button type="button" class="fz-sm-btn" onclick={() => startEdit(format)}>
									<Pencil size={12} />
									Edit
								</button>
								<button
									type="button"
									class="fz-sm-btn is-danger-ghost"
									onclick={() => (confirmDeleteId = format.id)}
								>
									<Trash2 size={12} />
									Hapus
								</button>
							{/if}
						</div>
					{/if}
				</article>
			{/each}
		</section>
	{/if}
</div>

<!-- Modal Tambah / Edit Ukuran Kustom -->
{#if draft}
	<div class="fz-modal" role="dialog" aria-modal="true" aria-label="Formulir ukuran frame kustom">
		<button type="button" class="fz-modal-backdrop" aria-label="Tutup formulir" onclick={closeModal}
		></button>
		<div class="d-card fz-modal-box">
			<div class="fz-modal-head">
				<div>
					<h2 class="fz-modal-title">
						{editingId ? 'Edit Ukuran Kustom' : 'Tambah Ukuran Kustom'}
					</h2>
					<p class="fz-modal-sub">Otomatis terbaca di Frame Studio, kanvas editor, dan cetak.</p>
				</div>
				<button type="button" class="fz-close-btn" onclick={closeModal} aria-label="Tutup">
					<X size={15} />
				</button>
			</div>

			<form class="fz-modal-body" onsubmit={save}>
				<input
					bind:this={thumbInput}
					type="file"
					class="fz-file-hidden"
					accept="image/png,image/jpeg,image/webp,image/svg+xml,.png,.jpg,.jpeg,.webp,.svg"
					onchange={handleThumbInput}
					disabled={thumbBusy || saving}
				/>

				<!-- Unggah Thumbnail Contoh (Klik atau Seret) -->
				<div class="fz-preview-col">
					<button
						type="button"
						class="fz-live-stage"
						class:is-dragging={thumbDragging}
						onclick={() => thumbInput?.click()}
						ondragover={handleThumbDragOver}
						ondragleave={handleThumbDragLeave}
						ondrop={handleThumbDrop}
						disabled={thumbBusy || saving}
						title="Klik atau seret gambar contoh untuk thumbnail & isi ukuran otomatis"
					>
						{#if draft.thumbnail}
							<img
								class="fz-png-thumb"
								src={draft.thumbnail}
								alt="Contoh thumbnail ukuran kustom"
								draggable="false"
							/>
						{:else if draftPreviewSpec}
							{@render miniStripSvg(draftPreviewSpec)}
						{/if}
					</button>

					<div class="fz-thumb-actions">
						<button
							type="button"
							class="fz-sm-btn"
							onclick={() => thumbInput?.click()}
							disabled={thumbBusy || saving}
						>
							<Upload size={12} />
							{thumbBusy ? 'Memuat…' : draft.thumbnail ? 'Ganti Foto' : 'Unggah Foto'}
						</button>
						{#if draft.thumbnail}
							<button
								type="button"
								class="fz-sm-btn is-danger-ghost"
								onclick={() => draft && (draft.thumbnail = null)}
								disabled={saving}
								title="Hapus foto contoh"
								aria-label="Hapus foto contoh"
							>
								<Trash2 size={12} />
							</button>
						{/if}
					</div>

					<div class="fz-live-meta d-num">
						<strong
							>{Math.max(100, Number(draft.pxW) || 0)} × {Math.max(100, Number(draft.pxH) || 0)} px</strong
						>
						<span>{draft.cm.trim() || autoCm(draft.pxW, draft.pxH)}</span>
					</div>
				</div>

				<!-- Bidang Input Ringkas -->
				<div class="fz-form-col">
					<div class="fz-field">
						<label class="fz-label" for="fz-label">Nama Ukuran</label>
						<input
							id="fz-label"
							type="text"
							class="fz-input"
							value={draft.label}
							oninput={(e) => handleLabelInput((e.currentTarget as HTMLInputElement).value)}
							placeholder="Contoh: 4×6 · Kustom"
							maxlength="80"
							required
						/>
					</div>

					<div class="fz-field-row">
						<div class="fz-field">
							<label class="fz-label" for="fz-id">
								ID {editingId ? '(Terkunci)' : ''}
							</label>
							<input
								id="fz-id"
								type="text"
								class="fz-input d-num"
								value={draft.id}
								oninput={(e) => {
									if (!draft) return;
									draft.id = (e.currentTarget as HTMLInputElement).value;
									draft.idTouched = true;
								}}
								disabled={Boolean(editingId)}
								placeholder="4x6-kustom"
								required
							/>
						</div>

						<div class="fz-field">
							<span class="fz-label">Jenis Output</span>
							<div class="fz-seg" role="group" aria-label="Jenis output">
								<button
									type="button"
									class="fz-seg-btn"
									class:is-active={draft.kind === 'print'}
									onclick={() => draft && (draft.kind = 'print')}
								>
									Cetak
								</button>
								<button
									type="button"
									class="fz-seg-btn"
									class:is-active={draft.kind === 'digital'}
									onclick={() => draft && (draft.kind = 'digital')}
								>
									Digital
								</button>
							</div>
						</div>
					</div>

					<div class="fz-field-row">
						<div class="fz-field">
							<label class="fz-label" for="fz-w">Lebar (px)</label>
							<input
								id="fz-w"
								type="number"
								min="100"
								max="12000"
								class="fz-input d-num"
								bind:value={draft.pxW}
								required
							/>
						</div>
						<div class="fz-field">
							<label class="fz-label" for="fz-h">Tinggi (px)</label>
							<input
								id="fz-h"
								type="number"
								min="100"
								max="12000"
								class="fz-input d-num"
								bind:value={draft.pxH}
								required
							/>
						</div>
					</div>

					<div class="fz-field">
						<label class="fz-label" for="fz-cm">Keterangan Ukuran Fisik (opsional)</label>
						<input
							id="fz-cm"
							type="text"
							class="fz-input"
							bind:value={draft.cm}
							placeholder={autoCm(draft.pxW, draft.pxH)}
							maxlength="80"
						/>
					</div>

					<div class="fz-field">
						<span class="fz-label">Jumlah Foto Didukung</span>
						<div class="fz-photo-picker" role="group" aria-label="Pilih jumlah foto">
							{#each PHOTO_CHOICES as n (n)}
								<button
									type="button"
									class="fz-pick-btn d-num"
									class:is-active={draft.photos.includes(n)}
									onclick={() => toggleDraftPhoto(n)}
								>
									{n}
								</button>
							{/each}
						</div>
					</div>

					<div class="fz-modal-foot">
						<button type="button" class="fz-btn" onclick={closeModal} disabled={saving}>
							Batal
						</button>
						<button type="submit" class="fz-btn is-primary" disabled={saving}>
							{saving ? 'Menyimpan…' : 'Simpan Ukuran'}
						</button>
					</div>
				</div>
			</form>
		</div>
	</div>
{/if}

<style>
	.fz-page {
		display: flex;
		flex-direction: column;
		gap: 18px;
	}

	/* ── Header Minimalis ── */
	.fz-head {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		justify-content: space-between;
		gap: 12px 18px;
	}

	.fz-head-copy {
		min-width: 0;
		flex: 1 1 240px;
	}

	.fz-title {
		margin: 0;
		font-size: clamp(1.4rem, 2vw, 1.7rem);
		font-weight: 800;
		letter-spacing: -0.025em;
		line-height: 1.15;
		color: var(--d-ink);
	}

	.fz-sub {
		margin: 4px 0 0;
		font-size: 0.82rem;
		color: var(--d-muted);
	}

	.fz-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		height: 36px;
		padding: 0 14px;
		border: 1px solid var(--d-border);
		border-radius: 9px;
		background: var(--d-surface);
		color: var(--d-ink);
		font-family: var(--font-body);
		font-size: 0.76rem;
		font-weight: 700;
		white-space: nowrap;
		cursor: pointer;
		transition:
			background-color 140ms ease,
			border-color 140ms ease,
			opacity 140ms ease;
	}

	.fz-btn:hover:not(:disabled) {
		background: var(--d-surface-2);
		border-color: var(--d-border-strong);
	}

	.fz-btn:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}

	.fz-btn.is-primary {
		border-color: var(--d-ink);
		background: var(--d-ink);
		color: var(--d-bg);
	}

	.fz-btn.is-primary:hover:not(:disabled) {
		opacity: 0.9;
		background: var(--d-ink);
	}

	/* ── Toolbar ── */
	.fz-toolbar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
	}

	.fz-search {
		position: relative;
		display: flex;
		align-items: center;
		flex: 1 1 200px;
		max-width: 300px;
		color: var(--d-muted);
	}

	.fz-search :global(svg) {
		position: absolute;
		left: 11px;
		pointer-events: none;
	}

	.fz-search-input {
		width: 100%;
		height: 34px;
		padding: 0 11px 0 32px;
		border: 1px solid var(--d-border);
		border-radius: 9px;
		background: var(--d-surface);
		color: var(--d-ink);
		font-family: var(--font-body);
		font-size: 0.78rem;
		outline: none;
	}

	.fz-search-input:focus {
		border-color: var(--d-border-strong);
	}

	.fz-pills {
		display: flex;
		flex-wrap: wrap;
		gap: 5px;
	}

	.fz-pill {
		height: 30px;
		padding: 0 11px;
		border: 1px solid var(--d-border);
		border-radius: 8px;
		background: var(--d-surface);
		color: var(--d-muted);
		font-family: var(--font-body);
		font-size: 0.72rem;
		font-weight: 700;
		cursor: pointer;
	}

	.fz-pill:hover:not(.is-active) {
		color: var(--d-ink);
		border-color: var(--d-border-strong);
	}

	.fz-pill.is-active {
		border-color: var(--d-ink);
		background: var(--d-ink);
		color: var(--d-bg);
	}

	/* ── Grid Kartu Visual ── */
	.fz-grid {
		display: grid;
		gap: 14px;
		grid-template-columns: repeat(auto-fill, minmax(232px, 1fr));
	}

	.fz-skel {
		height: 310px;
		border-radius: 14px;
		background: var(--d-surface-2);
	}

	.fz-empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 8px;
		min-height: 260px;
		padding: 32px 20px;
		border: 1.5px dashed var(--d-border-strong);
		border-radius: 16px;
		background: var(--d-surface);
		color: var(--d-muted);
		text-align: center;
	}

	.fz-empty-title {
		margin: 4px 0 0;
		font-size: 0.92rem;
		font-weight: 800;
		color: var(--d-ink);
	}

	.fz-empty-sub {
		margin: 0 0 8px;
		max-width: 40ch;
		font-size: 0.78rem;
		line-height: 1.5;
	}

	.fz-card {
		display: flex;
		flex-direction: column;
		border: 1px solid var(--d-border);
		border-radius: 14px;
		background: var(--d-surface);
		overflow: hidden;
		transition: border-color 140ms ease;
	}

	.fz-card:hover {
		border-color: var(--d-border-strong);
	}

	.fz-media {
		position: relative;
		height: 196px;
		padding: 34px 16px 14px;
		background: var(--d-bg);
		border-bottom: 1px solid var(--d-border);
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.fz-media-badges {
		position: absolute;
		top: 9px;
		left: 9px;
		display: flex;
		align-items: center;
		gap: 5px;
	}

	.fz-badge {
		padding: 2px 7px;
		border-radius: 6px;
		border: 1px solid var(--d-border);
		background: var(--d-surface);
		color: var(--d-muted);
		font-size: 0.65rem;
		font-weight: 700;
	}

	.fz-badge.is-custom {
		border-color: transparent;
		background: var(--d-info-soft, rgba(37, 99, 235, 0.14));
		color: #2563eb;
	}

	.fz-copy-chip {
		position: absolute;
		top: 9px;
		right: 9px;
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 3px 7px;
		border: 1px solid var(--d-border);
		border-radius: 6px;
		background: var(--d-surface);
		color: var(--d-ink);
		font-family: var(--font-body);
		font-size: 0.66rem;
		font-weight: 700;
		cursor: pointer;
	}

	.fz-copy-chip:hover {
		background: var(--d-surface-2);
		border-color: var(--d-border-strong);
	}

	.fz-thumb-wrap {
		width: 100%;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.fz-png-thumb {
		max-width: 100%;
		max-height: 100%;
		object-fit: contain;
		filter: drop-shadow(0 6px 14px rgba(15, 23, 42, 0.14));
		user-select: none;
	}

	.fz-svg-thumb {
		max-width: 100%;
		max-height: 100%;
		width: auto;
		height: auto;
		display: block;
		filter: drop-shadow(0 6px 14px rgba(15, 23, 42, 0.14));
	}

	.fz-body {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 12px 13px 13px;
		flex: 1;
	}

	.fz-name-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
	}

	.fz-name {
		margin: 0;
		font-size: 0.85rem;
		font-weight: 800;
		color: var(--d-ink);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.fz-lock {
		color: var(--d-muted);
		opacity: 0.65;
		display: inline-grid;
		place-items: center;
		flex-shrink: 0;
	}

	.fz-spec {
		margin: 0;
		font-size: 0.72rem;
		color: var(--d-muted);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.fz-counts {
		margin-top: 4px;
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
	}

	.fz-count-chip {
		height: 24px;
		padding: 0 8px;
		border: 1px solid var(--d-border);
		border-radius: 6px;
		background: var(--d-bg);
		color: var(--d-muted);
		font-family: var(--font-body);
		font-size: 0.67rem;
		font-weight: 700;
		cursor: pointer;
		transition:
			background-color 120ms ease,
			border-color 120ms ease,
			color 120ms ease;
	}

	.fz-count-chip:hover:not(.is-active) {
		color: var(--d-ink);
		border-color: var(--d-border-strong);
	}

	.fz-count-chip.is-active {
		border-color: var(--d-ink);
		background: var(--d-ink);
		color: var(--d-bg);
	}

	.fz-foot {
		display: flex;
		gap: 6px;
		padding: 9px 13px;
		border-top: 1px solid var(--d-border);
		background: var(--d-bg);
	}

	.fz-sm-btn {
		flex: 1;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 5px;
		height: 28px;
		padding: 0 10px;
		border: 1px solid var(--d-border);
		border-radius: 7px;
		background: var(--d-surface);
		color: var(--d-ink);
		font-family: var(--font-body);
		font-size: 0.71rem;
		font-weight: 700;
		cursor: pointer;
	}

	.fz-sm-btn:hover:not(:disabled) {
		background: var(--d-surface-2);
		border-color: var(--d-border-strong);
	}

	.fz-sm-btn.is-danger {
		border-color: var(--d-err);
		background: var(--d-err);
		color: #ffffff;
	}

	.fz-sm-btn.is-danger-ghost {
		color: var(--d-err);
	}

	.fz-sm-btn.is-danger-ghost:hover:not(:disabled) {
		background: var(--d-err-soft);
		border-color: var(--d-err);
	}

	/* ── Modal Tambah / Edit ── */
	.fz-modal {
		position: fixed;
		inset: 0;
		z-index: 80;
		display: grid;
		place-items: center;
		padding: 18px;
	}

	.fz-modal-backdrop {
		position: absolute;
		inset: 0;
		border: none;
		background: rgba(0, 0, 0, 0.56);
		backdrop-filter: blur(4px);
		cursor: pointer;
	}

	.fz-modal-box {
		position: relative;
		z-index: 1;
		width: min(94vw, 720px);
		max-height: 90dvh;
		display: flex;
		flex-direction: column;
		box-shadow: 0 24px 60px rgba(0, 0, 0, 0.4);
	}

	.fz-modal-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 12px;
		padding: 14px 18px;
		border-bottom: 1px solid var(--d-border);
	}

	.fz-modal-title {
		margin: 0;
		font-size: 0.94rem;
		font-weight: 800;
		color: var(--d-ink);
	}

	.fz-modal-sub {
		margin: 2px 0 0;
		font-size: 0.74rem;
		color: var(--d-muted);
	}

	.fz-close-btn {
		width: 30px;
		height: 30px;
		border: 1px solid var(--d-border);
		border-radius: 8px;
		background: var(--d-surface-2);
		color: var(--d-ink);
		display: grid;
		place-items: center;
		cursor: pointer;
	}

	.fz-modal-body {
		overflow-y: auto;
		padding: 16px 18px 18px;
		display: grid;
		grid-template-columns: 200px minmax(0, 1fr);
		gap: 18px;
		align-items: start;
	}

	.fz-file-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}

	.fz-preview-col {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.fz-live-stage {
		width: 100%;
		height: 230px;
		padding: 16px;
		border: 1.5px dashed var(--d-border-strong);
		border-radius: 12px;
		background: var(--d-bg);
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		transition:
			border-color 140ms ease,
			background-color 140ms ease;
	}

	.fz-live-stage:hover:not(:disabled),
	.fz-live-stage.is-dragging {
		border-color: var(--d-ink);
		background: var(--d-surface-2);
	}

	.fz-thumb-actions {
		display: flex;
		gap: 6px;
	}

	.fz-thumb-actions .fz-sm-btn.is-danger-ghost {
		flex: 0 0 32px;
		padding: 0;
	}

	.fz-live-meta {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2px;
		font-size: 0.72rem;
		color: var(--d-muted);
		text-align: center;
	}

	.fz-live-meta strong {
		color: var(--d-ink);
		font-weight: 800;
	}

	.fz-form-col {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.fz-field-row {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 10px;
	}

	.fz-field {
		display: flex;
		flex-direction: column;
		gap: 5px;
		min-width: 0;
	}

	.fz-label {
		font-size: 0.72rem;
		font-weight: 700;
		color: var(--d-muted);
	}

	.fz-input {
		height: 35px;
		padding: 0 10px;
		border: 1px solid var(--d-border);
		border-radius: 9px;
		background: var(--d-bg);
		color: var(--d-ink);
		font-family: var(--font-body);
		font-size: 0.8rem;
		font-weight: 600;
		outline: none;
		width: 100%;
	}

	.fz-input:focus {
		border-color: var(--d-border-strong);
	}

	.fz-input:disabled {
		opacity: 0.55;
		cursor: not-allowed;
	}

	.fz-seg {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 3px;
		padding: 3px;
		height: 35px;
		border: 1px solid var(--d-border);
		border-radius: 9px;
		background: var(--d-bg);
	}

	.fz-seg-btn {
		border: none;
		border-radius: 6px;
		background: transparent;
		color: var(--d-muted);
		font-family: var(--font-body);
		font-size: 0.73rem;
		font-weight: 700;
		cursor: pointer;
	}

	.fz-seg-btn.is-active {
		background: var(--d-ink);
		color: var(--d-bg);
	}

	.fz-photo-picker {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}

	.fz-pick-btn {
		width: 38px;
		height: 34px;
		border: 1px solid var(--d-border);
		border-radius: 8px;
		background: var(--d-bg);
		color: var(--d-muted);
		font-family: var(--font-body);
		font-size: 0.78rem;
		font-weight: 800;
		cursor: pointer;
	}

	.fz-pick-btn.is-active {
		border-color: var(--d-ink);
		background: var(--d-ink);
		color: var(--d-bg);
	}

	.fz-modal-foot {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
		padding-top: 10px;
		border-top: 1px solid var(--d-border);
	}

	@media (max-width: 680px) {
		.fz-modal-body {
			grid-template-columns: minmax(0, 1fr);
		}

		.fz-live-stage {
			height: 170px;
		}
	}
</style>
