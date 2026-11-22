<script lang="ts">
	import { onMount } from 'svelte';
	import {
		STICKER_ASSETS,
		VINTAGE_STICKER_ASSETS,
		stickerSrc,
		type StickerAsset
	} from '#lib/data/stickers';
	import { customStickersStore, loadCustomAssets } from '#lib/services/customAssets';
	import {
		Plus,
		Search,
		Upload,
		Pencil,
		Trash2,
		Lock,
		X,
		Sparkles,
		Eye,
		EyeOff,
		ChevronLeft,
		ChevronRight
	} from '@lucide/svelte';

	type StickerItem = StickerAsset & { isCustom: boolean };
	type PreviewBg = 'checker' | 'light' | 'dark';

	const builtinList: StickerItem[] = [
		...STICKER_ASSETS.map((s) => ({ ...s, category: 'Pixel', isCustom: false })),
		...VINTAGE_STICKER_ASSETS.map((s) => ({
			...s,
			category: s.category || 'Vintage',
			isCustom: false
		}))
	];

	const PRESET_CATEGORIES = ['Custom', 'Vintage', 'Pixel', 'Lucu', 'Teks'];
	const PAGE_SIZES = [12, 24, 48];
	const MIN_STICKER_SHORT = 64;
	const MIN_STICKER_LONG = 100;
	const MAX_STICKER_SIDE = 1024;

	type UploadEntry = {
		file: File;
		previewUrl: string;
		w: number;
		h: number;
		origW: number;
		origH: number;
		resized: boolean;
	};

	let loading = $state(true);
	let saving = $state(false);
	let togglingId = $state<number | null>(null);
	let deletingId = $state<number | null>(null);
	let confirmDeleteId = $state<number | null>(null);
	let error = $state<string | null>(null);
	let notice = $state<string | null>(null);

	let query = $state('');
	let activeFilter = $state<string>('all');
	let pageSize = $state(12);
	let currentPage = $state(1);

	// Modal Unggah
	let showUploadModal = $state(false);
	let uploadDragging = $state(false);
	let uploadFiles = $state<UploadEntry[]>([]);
	let uploadName = $state('');
	let uploadCategory = $state('Custom');
	let uploadInput = $state<HTMLInputElement | null>(null);

	// Modal Detail / Edit
	let selectedSticker = $state<StickerItem | null>(null);
	let previewBg = $state<PreviewBg>('checker');
	let editName = $state('');
	let editCategory = $state('Custom');
	let editEnabled = $state(true);
	let modalConfirmDelete = $state(false);

	const customList = $derived.by((): StickerItem[] =>
		$customStickersStore.map((s) => ({
			...s,
			category: s.category || 'Custom',
			isCustom: true
		}))
	);

	const allStickers = $derived.by(() => [...customList, ...builtinList]);

	const extraCustomCategories = $derived.by(() => {
		const seen = new Set(['Pixel', 'Vintage']);
		const list: string[] = [];
		for (const s of customList) {
			const cat = s.category || 'Custom';
			if (!seen.has(cat)) {
				seen.add(cat);
				list.push(cat);
			}
		}
		return list;
	});

	const filteredStickers = $derived.by(() => {
		const q = query.trim().toLowerCase();
		return allStickers.filter((s) => {
			if (activeFilter === 'custom' && !s.isCustom) return false;
			if (activeFilter !== 'all' && activeFilter !== 'custom') {
				if ((s.category || '') !== activeFilter) return false;
			}
			if (!q) return true;
			return (
				s.name.toLowerCase().includes(q) ||
				(s.category || '').toLowerCase().includes(q) ||
				s.file.toLowerCase().includes(q)
			);
		});
	});

	const totalPages = $derived(Math.max(1, Math.ceil(filteredStickers.length / pageSize)));
	const safePage = $derived(Math.min(currentPage, totalPages));
	const pageStart = $derived(filteredStickers.length === 0 ? 0 : (safePage - 1) * pageSize + 1);
	const pageEnd = $derived(Math.min(filteredStickers.length, safePage * pageSize));
	const pagedStickers = $derived(
		filteredStickers.slice((safePage - 1) * pageSize, safePage * pageSize)
	);

	$effect(() => {
		void query;
		void activeFilter;
		void pageSize;
		currentPage = 1;
	});

	function isResizableRaster(file: File): boolean {
		const isGif = file.type === 'image/gif' || /\.gif$/i.test(file.name);
		const isSvg = file.type === 'image/svg+xml' || /\.svg$/i.test(file.name);
		return !isGif && !isSvg;
	}

	/**
	 * Baca dimensi stiker, validasi batas minimal piksel, lalu perkecil otomatis
	 * bila sisi terpanjang melebihi MAX_STICKER_SIDE (1024 px) agar tetap tajam & ringan.
	 */
	function prepareStickerFile(file: File): Promise<UploadEntry> {
		return new Promise((resolve, reject) => {
			const rawUrl = URL.createObjectURL(file);
			const img = new Image();
			img.onerror = () => {
				URL.revokeObjectURL(rawUrl);
				reject(new Error(`Berkas "${file.name}" tidak dapat dibaca sebagai gambar.`));
			};
			img.onload = () => {
				const origW = img.naturalWidth || 0;
				const origH = img.naturalHeight || 0;

				if (!origW || !origH) {
					URL.revokeObjectURL(rawUrl);
					reject(new Error(`Dimensi "${file.name}" tidak valid.`));
					return;
				}

				if (
					Math.min(origW, origH) < MIN_STICKER_SHORT ||
					Math.max(origW, origH) < MIN_STICKER_LONG
				) {
					URL.revokeObjectURL(rawUrl);
					reject(
						new Error(
							`"${file.name}" terlalu kecil (${origW} × ${origH} px). Minimal ${MIN_STICKER_LONG} px (sisi terpendek ≥ ${MIN_STICKER_SHORT} px) agar tidak pecah saat cetak.`
						)
					);
					return;
				}

				if (!isResizableRaster(file) || Math.max(origW, origH) <= MAX_STICKER_SIDE) {
					resolve({
						file,
						previewUrl: rawUrl,
						w: origW,
						h: origH,
						origW,
						origH,
						resized: false
					});
					return;
				}

				const scale = MAX_STICKER_SIDE / Math.max(origW, origH);
				const nextW = Math.max(MIN_STICKER_SHORT, Math.round(origW * scale));
				const nextH = Math.max(MIN_STICKER_SHORT, Math.round(origH * scale));
				const canvas = document.createElement('canvas');
				canvas.width = nextW;
				canvas.height = nextH;
				const ctx = canvas.getContext('2d');
				if (!ctx) {
					resolve({
						file,
						previewUrl: rawUrl,
						w: origW,
						h: origH,
						origW,
						origH,
						resized: false
					});
					return;
				}

				ctx.imageSmoothingEnabled = true;
				ctx.imageSmoothingQuality = 'high';
				ctx.drawImage(img, 0, 0, nextW, nextH);

				const preferWebp = file.type === 'image/webp' || /\.webp$/i.test(file.name);
				const outMime = preferWebp ? 'image/webp' : 'image/png';
				const outExt = preferWebp ? '.webp' : '.png';

				canvas.toBlob(
					(blob) => {
						URL.revokeObjectURL(rawUrl);
						if (!blob) {
							reject(new Error(`Gagal memperkecil "${file.name}".`));
							return;
						}
						const baseName = file.name.replace(/\.[^.]+$/, '');
						const resizedFile = new File([blob], `${baseName}${outExt}`, { type: outMime });
						resolve({
							file: resizedFile,
							previewUrl: URL.createObjectURL(resizedFile),
							w: nextW,
							h: nextH,
							origW,
							origH,
							resized: true
						});
					},
					outMime,
					0.92
				);
			};
			img.src = rawUrl;
		});
	}

	function revokeUploadPreviews(): void {
		for (const item of uploadFiles) {
			URL.revokeObjectURL(item.previewUrl);
		}
		uploadFiles = [];
	}

	function openUploadModal(): void {
		error = null;
		notice = null;
		revokeUploadPreviews();
		uploadName = '';
		uploadCategory = 'Custom';
		showUploadModal = true;
	}

	function closeUploadModal(): void {
		if (saving) return;
		showUploadModal = false;
		uploadDragging = false;
		revokeUploadPreviews();
	}

	async function addUploadFiles(fileList: FileList | File[]): Promise<void> {
		const valid: File[] = [];
		for (const f of Array.from(fileList)) {
			if (/\.(png|webp|gif|svg|jpe?g)$/i.test(f.name) || f.type.startsWith('image/')) {
				valid.push(f);
			}
		}
		if (valid.length === 0) {
			error = 'Format stiker harus PNG, WebP, GIF, SVG, atau JPG.';
			return;
		}
		error = null;
		const ready: UploadEntry[] = [];
		const rejected: string[] = [];
		for (const file of valid) {
			try {
				ready.push(await prepareStickerFile(file));
			} catch (e) {
				rejected.push(e instanceof Error ? e.message : `Gagal membaca ${file.name}.`);
			}
		}
		if (rejected.length > 0) {
			error = rejected.join(' ');
		}
		if (ready.length > 0) {
			uploadFiles = [...uploadFiles, ...ready];
			if (uploadFiles.length === 1 && !uploadName.trim()) {
				uploadName = uploadFiles[0].file.name.replace(/\.[^.]+$/, '');
			}
		}
	}

	function removeUploadItem(index: number): void {
		const target = uploadFiles[index];
		if (target) URL.revokeObjectURL(target.previewUrl);
		uploadFiles = uploadFiles.filter((_, i) => i !== index);
		if (uploadFiles.length === 1) {
			uploadName = uploadFiles[0].file.name.replace(/\.[^.]+$/, '');
		} else if (uploadFiles.length === 0) {
			uploadName = '';
		}
	}

	async function handleUploadInputChange(e: Event): Promise<void> {
		const input = e.currentTarget as HTMLInputElement;
		if (input.files?.length) {
			await addUploadFiles(input.files);
		}
		input.value = '';
	}

	function handleUploadDragOver(e: DragEvent): void {
		e.preventDefault();
		if (!saving) uploadDragging = true;
	}

	function handleUploadDragLeave(): void {
		uploadDragging = false;
	}

	async function handleUploadDrop(e: DragEvent): Promise<void> {
		e.preventDefault();
		uploadDragging = false;
		if (saving) return;
		if (e.dataTransfer?.files?.length) {
			await addUploadFiles(e.dataTransfer.files);
		}
	}

	async function submitUpload(e: SubmitEvent): Promise<void> {
		e.preventDefault();
		if (uploadFiles.length === 0 || saving) {
			error = 'Pilih minimal satu berkas gambar stiker.';
			return;
		}
		saving = true;
		error = null;
		notice = null;
		try {
			const cat = uploadCategory.trim() || 'Custom';
			let uploaded = 0;
			for (const entry of uploadFiles) {
				const form = new FormData();
				form.set('file', entry.file);
				const itemName =
					uploadFiles.length === 1 && uploadName.trim()
						? uploadName.trim()
						: entry.file.name.replace(/\.[^.]+$/, '');
				form.set('name', itemName);
				form.set('category', cat);
				form.set('width', String(entry.w));
				form.set('height', String(entry.h));
				const res = await fetch('/api/assets/stickers', { method: 'POST', body: form });
				const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
				if (!res.ok || !data.ok)
					throw new Error(data.error || `Gagal mengunggah ${entry.file.name}.`);
				uploaded++;
			}
			await loadCustomAssets(true);
			notice =
				uploaded === 1
					? 'Stiker kustom ditambahkan dan langsung tersedia di editor.'
					: `${uploaded} stiker kustom berhasil diunggah.`;
			showUploadModal = false;
			revokeUploadPreviews();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Gagal mengunggah stiker.';
		} finally {
			saving = false;
		}
	}

	function openStickerDetail(item: StickerItem): void {
		selectedSticker = item;
		previewBg = 'checker';
		editName = item.name;
		editCategory = item.category || 'Custom';
		editEnabled = item.enabled !== false;
		modalConfirmDelete = false;
	}

	function closeStickerDetail(): void {
		if (saving) return;
		selectedSticker = null;
		modalConfirmDelete = false;
	}

	async function quickToggleEnabled(item: StickerItem): Promise<void> {
		if (!item.isCustom || togglingId !== null) return;
		togglingId = item.dbId;
		error = null;
		const nextEnabled = item.enabled === false;
		try {
			const res = await fetch('/api/assets/stickers', {
				method: 'PUT',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					dbId: item.dbId,
					name: item.name,
					category: item.category || 'Custom',
					enabled: nextEnabled,
					active: nextEnabled
				})
			});
			const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
			if (!res.ok || !data.ok) throw new Error(data.error || 'Gagal mengubah status stiker.');
			await loadCustomAssets(true);
		} catch (err) {
			error = err instanceof Error ? err.message : 'Gagal mengubah status stiker.';
		} finally {
			togglingId = null;
		}
	}

	async function saveStickerEdit(e: SubmitEvent): Promise<void> {
		e.preventDefault();
		if (!selectedSticker || !selectedSticker.isCustom || saving) return;
		saving = true;
		error = null;
		notice = null;
		try {
			const nextName = editName.trim() || 'Stiker';
			const nextCat = editCategory.trim() || 'Custom';
			const res = await fetch('/api/assets/stickers', {
				method: 'PUT',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					dbId: selectedSticker.dbId,
					name: nextName,
					category: nextCat,
					enabled: editEnabled,
					active: editEnabled
				})
			});
			const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
			if (!res.ok || !data.ok) throw new Error(data.error || 'Gagal memperbarui stiker.');
			await loadCustomAssets(true);
			notice = `Stiker "${nextName}" diperbarui.`;
			selectedSticker = null;
		} catch (err) {
			error = err instanceof Error ? err.message : 'Gagal memperbarui stiker.';
		} finally {
			saving = false;
		}
	}

	async function removeSticker(dbId: number, label: string): Promise<void> {
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
			if (selectedSticker?.dbId === dbId) {
				selectedSticker = null;
				modalConfirmDelete = false;
			}
			await loadCustomAssets(true);
			notice = `Stiker "${label}" dihapus.`;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Gagal menghapus stiker.';
		} finally {
			deletingId = null;
		}
	}

	function handleWindowKeydown(e: KeyboardEvent): void {
		if (e.key === 'Escape') {
			if (showUploadModal) closeUploadModal();
			else if (selectedSticker) closeStickerDetail();
		}
	}

	onMount(async () => {
		try {
			await loadCustomAssets(true);
		} finally {
			loading = false;
		}
	});
</script>

<svelte:window onkeydown={handleWindowKeydown} />

<div class="st-page">
	<header class="st-head">
		<div class="st-head-copy">
			<h1 class="st-title">Stiker Dekorasi</h1>
			<p class="st-sub">
				Kelola koleksi stiker transparan (PNG, WebP, GIF, SVG) yang tampil di editor strip.
			</p>
		</div>
		<button type="button" class="st-btn is-primary" onclick={openUploadModal} disabled={saving}>
			<Plus size={15} />
			Tambah Stiker
		</button>
	</header>

	{#if error}
		<div class="d-banner d-banner-err" role="alert"><span>{error}</span></div>
	{/if}
	{#if notice}
		<div class="d-banner d-banner-ok" role="status"><span>{notice}</span></div>
	{/if}

	<!-- Toolbar Filter Minimalis -->
	<div class="st-toolbar">
		<div class="st-search">
			<Search size={14} />
			<input
				type="search"
				class="st-search-input"
				placeholder="Cari stiker…"
				bind:value={query}
				aria-label="Cari stiker"
			/>
		</div>

		<div class="st-pills" role="group" aria-label="Filter kategori stiker">
			<button
				type="button"
				class="st-pill"
				class:is-active={activeFilter === 'all'}
				onclick={() => (activeFilter = 'all')}
			>
				Semua ({allStickers.length})
			</button>
			<button
				type="button"
				class="st-pill"
				class:is-active={activeFilter === 'custom'}
				onclick={() => (activeFilter = 'custom')}
			>
				Kustom ({customList.length})
			</button>
			<button
				type="button"
				class="st-pill"
				class:is-active={activeFilter === 'Pixel'}
				onclick={() => (activeFilter = 'Pixel')}
			>
				Pixel ({STICKER_ASSETS.length})
			</button>
			<button
				type="button"
				class="st-pill"
				class:is-active={activeFilter === 'Vintage'}
				onclick={() => (activeFilter = 'Vintage')}
			>
				Vintage ({VINTAGE_STICKER_ASSETS.length})
			</button>
			{#each extraCustomCategories as cat (cat)}
				<button
					type="button"
					class="st-pill"
					class:is-active={activeFilter === cat}
					onclick={() => (activeFilter = cat)}
				>
					{cat}
				</button>
			{/each}
		</div>
	</div>

	{#if loading}
		<div class="st-grid">
			{#each Array(8) as _, idx (idx)}
				<div class="st-skel"></div>
			{/each}
		</div>
	{:else if filteredStickers.length === 0}
		<section class="st-empty" aria-label="Daftar stiker kosong">
			<Sparkles size={22} />
			<p class="st-empty-title">
				{activeFilter === 'custom' ? 'Belum ada stiker kustom' : 'Tidak ada stiker yang cocok'}
			</p>
			<p class="st-empty-sub">
				{activeFilter === 'custom'
					? 'Unggah gambar PNG, WebP, GIF, atau SVG transparan untuk langsung muncul di editor strip.'
					: 'Coba ubah kata kunci pencarian atau pilih kategori lain.'}
			</p>
			{#if activeFilter === 'custom'}
				<button type="button" class="st-btn is-primary" onclick={openUploadModal}>
					<Upload size={14} />
					Unggah Stiker Pertama
				</button>
			{/if}
		</section>
	{:else}
		<section class="st-grid" aria-label="Koleksi stiker">
			{#each pagedStickers as item (`${item.isCustom ? 'c' : 'b'}-${item.dbId}`)}
				{@const isInactive = item.isCustom && item.enabled === false}
				<article class="st-card" class:is-inactive={isInactive}>
					<div class="st-media d-checker">
						<button
							type="button"
							class="st-media-btn"
							onclick={() => openStickerDetail(item)}
							aria-label="Lihat detail stiker {item.name}"
						>
							<img
								class="st-thumb"
								src={stickerSrc(item)}
								alt={item.name}
								loading="lazy"
								draggable="false"
							/>
						</button>

						<span class="st-cat-badge" class:is-custom={item.isCustom}>
							{item.isCustom ? item.category || 'Kustom' : item.category}
						</span>

						{#if item.isCustom}
							<button
								type="button"
								class="st-vis-btn"
								class:is-off={isInactive}
								disabled={togglingId === item.dbId}
								onclick={() => quickToggleEnabled(item)}
								title={isInactive ? 'Aktifkan di editor' : 'Sembunyikan dari editor'}
								aria-label={isInactive ? `Aktifkan ${item.name}` : `Nonaktifkan ${item.name}`}
							>
								{#if isInactive}
									<EyeOff size={12} />
								{:else}
									<Eye size={12} />
								{/if}
							</button>
						{:else}
							<span class="st-lock-dot" title="Stiker bawaan terkunci" aria-label="Bawaan terkunci">
								<Lock size={11} />
							</span>
						{/if}
					</div>

					<div class="st-body">
						<button type="button" class="st-info-btn" onclick={() => openStickerDetail(item)}>
							<h2 class="st-name" title={item.name}>{item.name}</h2>
							<p class="st-meta d-num">
								{item.size?.w ?? '?'} × {item.size?.h ?? '?'} px{#if isInactive}
									· Nonaktif{/if}
							</p>
						</button>

						{#if item.isCustom}
							<div class="st-card-actions">
								{#if confirmDeleteId === item.dbId}
									<button
										type="button"
										class="st-sm-btn is-danger"
										disabled={deletingId === item.dbId}
										onclick={() => removeSticker(item.dbId, item.name)}
									>
										Hapus
									</button>
									<button
										type="button"
										class="st-sm-btn"
										disabled={deletingId === item.dbId}
										onclick={() => (confirmDeleteId = null)}
									>
										Batal
									</button>
								{:else}
									<button
										type="button"
										class="st-icon-btn"
										onclick={() => openStickerDetail(item)}
										title="Edit stiker"
										aria-label="Edit stiker {item.name}"
									>
										<Pencil size={13} />
									</button>
									<button
										type="button"
										class="st-icon-btn is-danger"
										onclick={() => (confirmDeleteId = item.dbId)}
										title="Hapus stiker"
										aria-label="Hapus stiker {item.name}"
									>
										<Trash2 size={13} />
									</button>
								{/if}
							</div>
						{/if}
					</div>
				</article>
			{/each}
		</section>

		<!-- Batasan Halaman (Pagination) -->
		<nav class="st-pager" aria-label="Navigasi halaman stiker">
			<span class="st-pager-info d-num">
				Menampilkan {pageStart}–{pageEnd} dari {filteredStickers.length} stiker
			</span>

			<div class="st-pager-right">
				<div class="st-pager-sizes" role="group" aria-label="Jumlah stiker per halaman">
					{#each PAGE_SIZES as size (size)}
						<button
							type="button"
							class="st-size-btn d-num"
							class:is-active={pageSize === size}
							onclick={() => (pageSize = size)}
						>
							{size}
						</button>
					{/each}
				</div>

				{#if totalPages > 1}
					<div class="st-pager-nav">
						<button
							type="button"
							class="st-nav-btn"
							disabled={safePage <= 1}
							onclick={() => (currentPage = Math.max(1, safePage - 1))}
							aria-label="Halaman sebelumnya"
						>
							<ChevronLeft size={14} />
						</button>
						<span class="st-page-num d-num">{safePage} / {totalPages}</span>
						<button
							type="button"
							class="st-nav-btn"
							disabled={safePage >= totalPages}
							onclick={() => (currentPage = Math.min(totalPages, safePage + 1))}
							aria-label="Halaman berikutnya"
						>
							<ChevronRight size={14} />
						</button>
					</div>
				{/if}
			</div>
		</nav>
	{/if}
</div>

<!-- Modal Unggah Stiker Kustom (Mendukung 1 atau Banyak Berkas Sekaligus) -->
{#if showUploadModal}
	<div class="st-modal" role="dialog" aria-modal="true" aria-label="Unggah stiker kustom">
		<button
			type="button"
			class="st-modal-backdrop"
			aria-label="Tutup unggah stiker"
			onclick={closeUploadModal}
		></button>
		<div class="d-card st-modal-box">
			<div class="st-modal-head">
				<div>
					<h2 class="st-modal-title">Tambah Stiker Kustom</h2>
					<p class="st-modal-sub">
						PNG, WebP, GIF, SVG · Min. {MIN_STICKER_LONG} px · &gt; {MAX_STICKER_SIDE} px diperkecil otomatis.
					</p>
				</div>
				<button type="button" class="st-close-btn" onclick={closeUploadModal} aria-label="Tutup">
					<X size={15} />
				</button>
			</div>

			<form class="st-modal-body" onsubmit={submitUpload}>
				{#if error}
					<div class="d-banner d-banner-err" role="alert"><span>{error}</span></div>
				{/if}

				<input
					bind:this={uploadInput}
					type="file"
					class="st-file-hidden"
					accept="image/png,image/webp,image/gif,image/svg+xml,image/jpeg,.png,.webp,.gif,.svg,.jpg,.jpeg"
					multiple
					onchange={handleUploadInputChange}
					disabled={saving}
				/>

				<button
					type="button"
					class="st-dropzone"
					class:is-dragging={uploadDragging}
					onclick={() => uploadInput?.click()}
					ondragover={handleUploadDragOver}
					ondragleave={handleUploadDragLeave}
					ondrop={handleUploadDrop}
					disabled={saving}
				>
					<span class="st-drop-icon" aria-hidden="true"><Upload size={18} /></span>
					<span class="st-drop-title">Klik atau seret berkas stiker ke sini</span>
					<span class="st-drop-sub">Bisa pilih banyak file sekaligus untuk unggah cepat.</span>
				</button>

				{#if uploadFiles.length > 0}
					<div class="st-queue">
						{#each uploadFiles as entry, idx (entry.previewUrl)}
							<div class="st-queue-item">
								<div class="st-queue-thumb d-checker">
									<img src={entry.previewUrl} alt={entry.file.name} />
								</div>
								<div class="st-queue-info">
									<span class="st-queue-name">{entry.file.name}</span>
									<span class="st-queue-dim d-num">
										{#if entry.resized}
											{entry.origW} × {entry.origH} → {entry.w} × {entry.h} px (diperkecil)
										{:else}
											{entry.w} × {entry.h} px
										{/if}
									</span>
								</div>
								<button
									type="button"
									class="st-icon-btn is-danger"
									onclick={() => removeUploadItem(idx)}
									disabled={saving}
									aria-label="Hapus {entry.file.name}"
								>
									<X size={13} />
								</button>
							</div>
						{/each}
					</div>
				{/if}

				{#if uploadFiles.length <= 1}
					<div class="st-field">
						<label class="st-label" for="up-st-name">Nama Stiker</label>
						<input
							id="up-st-name"
							type="text"
							class="st-input"
							bind:value={uploadName}
							placeholder="Otomatis dari nama berkas bila dikosongkan"
							maxlength="80"
						/>
					</div>
				{/if}

				<div class="st-field">
					<label class="st-label" for="up-st-cat">Kategori</label>
					<input
						id="up-st-cat"
						type="text"
						class="st-input"
						bind:value={uploadCategory}
						placeholder="Custom"
						maxlength="40"
					/>
					<div class="st-cat-presets">
						{#each PRESET_CATEGORIES as preset (preset)}
							<button
								type="button"
								class="st-chip"
								class:is-active={uploadCategory === preset}
								onclick={() => (uploadCategory = preset)}
							>
								{preset}
							</button>
						{/each}
					</div>
				</div>

				<div class="st-modal-foot">
					<button type="button" class="st-btn" onclick={closeUploadModal} disabled={saving}>
						Batal
					</button>
					<button
						type="submit"
						class="st-btn is-primary"
						disabled={saving || uploadFiles.length === 0}
					>
						{saving
							? 'Mengunggah…'
							: uploadFiles.length > 1
								? `Unggah ${uploadFiles.length} Stiker`
								: 'Unggah Stiker'}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}

<!-- Modal Detail / Edit Stiker -->
{#if selectedSticker}
	<div class="st-modal" role="dialog" aria-modal="true" aria-label="Detail stiker">
		<button
			type="button"
			class="st-modal-backdrop"
			aria-label="Tutup detail stiker"
			onclick={closeStickerDetail}
		></button>
		<div class="d-card st-modal-box is-wide">
			<div class="st-modal-head">
				<div>
					<h2 class="st-modal-title">{selectedSticker.name}</h2>
					<p class="st-modal-sub d-num">
						{selectedSticker.category || 'Umum'} · {selectedSticker.size?.w ?? '?'} × {selectedSticker
							.size?.h ?? '?'} px
					</p>
				</div>
				<button type="button" class="st-close-btn" onclick={closeStickerDetail} aria-label="Tutup">
					<X size={15} />
				</button>
			</div>

			<div class="st-det-body">
				<div class="st-det-stage-col">
					<div class="st-bg-seg" role="group" aria-label="Latar pratinjau">
						<button
							type="button"
							class="st-seg-btn"
							class:is-active={previewBg === 'checker'}
							onclick={() => (previewBg = 'checker')}
						>
							Transparan
						</button>
						<button
							type="button"
							class="st-seg-btn"
							class:is-active={previewBg === 'light'}
							onclick={() => (previewBg = 'light')}
						>
							Terang
						</button>
						<button
							type="button"
							class="st-seg-btn"
							class:is-active={previewBg === 'dark'}
							onclick={() => (previewBg = 'dark')}
						>
							Gelap
						</button>
					</div>

					<div
						class="st-det-stage"
						class:d-checker={previewBg === 'checker'}
						class:is-bg-light={previewBg === 'light'}
						class:is-bg-dark={previewBg === 'dark'}
					>
						<img
							class="st-det-img"
							src={stickerSrc(selectedSticker)}
							alt={selectedSticker.name}
							draggable="false"
						/>
					</div>
				</div>

				<aside class="st-det-rail">
					{#if selectedSticker.isCustom}
						<form class="st-det-form" onsubmit={saveStickerEdit}>
							<div class="st-field">
								<label class="st-label" for="ed-st-name">Nama Stiker</label>
								<input
									id="ed-st-name"
									type="text"
									class="st-input"
									bind:value={editName}
									maxlength="80"
									required
								/>
							</div>

							<div class="st-field">
								<label class="st-label" for="ed-st-cat">Kategori</label>
								<input
									id="ed-st-cat"
									type="text"
									class="st-input"
									bind:value={editCategory}
									maxlength="40"
								/>
							</div>

							<label class="st-toggle-row">
								<input type="checkbox" class="toggle toggle-sm" bind:checked={editEnabled} />
								<span>Tampilkan di editor strip</span>
							</label>

							<button type="submit" class="st-btn is-primary is-full" disabled={saving}>
								{saving ? 'Menyimpan…' : 'Simpan Perubahan'}
							</button>
						</form>

						<div class="st-det-danger">
							{#if modalConfirmDelete}
								<div class="st-det-del-row">
									<button
										type="button"
										class="st-sm-btn is-danger"
										disabled={deletingId === selectedSticker.dbId}
										onclick={() =>
											selectedSticker && removeSticker(selectedSticker.dbId, selectedSticker.name)}
									>
										Konfirmasi Hapus
									</button>
									<button
										type="button"
										class="st-sm-btn"
										disabled={deletingId === selectedSticker.dbId}
										onclick={() => (modalConfirmDelete = false)}
									>
										Batal
									</button>
								</div>
							{:else}
								<button
									type="button"
									class="st-btn is-danger-ghost is-full"
									onclick={() => (modalConfirmDelete = true)}
								>
									<Trash2 size={14} />
									Hapus Stiker
								</button>
							{/if}
						</div>
					{:else}
						<dl class="st-specs">
							<div class="st-spec-row">
								<dt>Sumber</dt>
								<dd>Bawaan (terkunci)</dd>
							</div>
							<div class="st-spec-row">
								<dt>Kategori</dt>
								<dd>{selectedSticker.category}</dd>
							</div>
							<div class="st-spec-row">
								<dt>Dimensi</dt>
								<dd class="d-num">
									{selectedSticker.size.w} × {selectedSticker.size.h} px
								</dd>
							</div>
							<div class="st-spec-row">
								<dt>Berkas</dt>
								<dd class="d-num st-file-val" title={selectedSticker.file}>
									{selectedSticker.file}
								</dd>
							</div>
						</dl>

						<button type="button" class="st-btn is-full" onclick={closeStickerDetail}>
							Tutup
						</button>
					{/if}
				</aside>
			</div>
		</div>
	</div>
{/if}

<style>
	.st-file-hidden {
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

	.st-page {
		display: flex;
		flex-direction: column;
		gap: 18px;
	}

	/* ── Header Minimalis ── */
	.st-head {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		justify-content: space-between;
		gap: 12px 18px;
	}

	.st-head-copy {
		min-width: 0;
		flex: 1 1 240px;
	}

	.st-title {
		margin: 0;
		font-size: clamp(1.4rem, 2vw, 1.7rem);
		font-weight: 800;
		letter-spacing: -0.025em;
		line-height: 1.15;
		color: var(--d-ink);
	}

	.st-sub {
		margin: 4px 0 0;
		font-size: 0.82rem;
		color: var(--d-muted);
	}

	.st-btn {
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

	.st-btn:hover:not(:disabled) {
		background: var(--d-surface-2);
		border-color: var(--d-border-strong);
	}

	.st-btn:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}

	.st-btn.is-primary {
		border-color: var(--d-ink);
		background: var(--d-ink);
		color: var(--d-bg);
	}

	.st-btn.is-primary:hover:not(:disabled) {
		opacity: 0.9;
		background: var(--d-ink);
	}

	.st-btn.is-full {
		width: 100%;
	}

	.st-btn.is-danger-ghost {
		color: var(--d-err);
		border-color: color-mix(in srgb, var(--d-err) 30%, var(--d-border));
	}

	.st-btn.is-danger-ghost:hover:not(:disabled) {
		background: var(--d-err-soft);
		border-color: var(--d-err);
	}

	/* ── Toolbar ── */
	.st-toolbar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
	}

	.st-search {
		position: relative;
		display: flex;
		align-items: center;
		flex: 1 1 200px;
		max-width: 300px;
		color: var(--d-muted);
	}

	.st-search :global(svg) {
		position: absolute;
		left: 11px;
		pointer-events: none;
	}

	.st-search-input {
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

	.st-search-input:focus {
		border-color: var(--d-border-strong);
	}

	.st-pills {
		display: flex;
		flex-wrap: wrap;
		gap: 5px;
	}

	.st-pill {
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

	.st-pill:hover:not(.is-active) {
		color: var(--d-ink);
		border-color: var(--d-border-strong);
	}

	.st-pill.is-active {
		border-color: var(--d-ink);
		background: var(--d-ink);
		color: var(--d-bg);
	}

	/* ── Galeri Grid Stiker ── */
	.st-grid {
		display: grid;
		gap: 12px;
		grid-template-columns: repeat(auto-fill, minmax(176px, 1fr));
	}

	.st-skel {
		height: 210px;
		border-radius: 14px;
		background: var(--d-surface-2);
	}

	.st-empty {
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

	.st-empty-title {
		margin: 4px 0 0;
		font-size: 0.92rem;
		font-weight: 800;
		color: var(--d-ink);
	}

	.st-empty-sub {
		margin: 0 0 8px;
		max-width: 42ch;
		font-size: 0.78rem;
		line-height: 1.5;
	}

	.st-card {
		display: flex;
		flex-direction: column;
		border: 1px solid var(--d-border);
		border-radius: 14px;
		background: var(--d-surface);
		overflow: hidden;
		transition:
			border-color 140ms ease,
			opacity 140ms ease;
	}

	.st-card:hover {
		border-color: var(--d-border-strong);
	}

	.st-card.is-inactive {
		opacity: 0.62;
	}

	.st-media {
		position: relative;
		height: 148px;
		border-bottom: 1px solid var(--d-border);
	}

	.st-media-btn {
		width: 100%;
		height: 100%;
		padding: 28px 14px 12px;
		border: none;
		background: transparent;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
	}

	.st-thumb {
		max-width: 100%;
		max-height: 100%;
		object-fit: contain;
		transition: transform 150ms ease;
		user-select: none;
	}

	.st-media-btn:hover .st-thumb {
		transform: scale(1.05);
	}

	.st-cat-badge {
		position: absolute;
		top: 8px;
		left: 8px;
		padding: 2px 7px;
		border-radius: 6px;
		border: 1px solid var(--d-border);
		background: var(--d-surface);
		color: var(--d-muted);
		font-size: 0.64rem;
		font-weight: 700;
		pointer-events: none;
	}

	.st-cat-badge.is-custom {
		border-color: transparent;
		background: rgba(37, 99, 235, 0.16);
		color: #2563eb;
	}

	.st-vis-btn {
		position: absolute;
		top: 8px;
		right: 8px;
		width: 24px;
		height: 24px;
		border: 1px solid var(--d-border);
		border-radius: 6px;
		background: var(--d-surface);
		color: var(--d-ok);
		display: grid;
		place-items: center;
		cursor: pointer;
	}

	.st-vis-btn.is-off {
		color: var(--d-muted);
	}

	.st-lock-dot {
		position: absolute;
		top: 9px;
		right: 9px;
		color: var(--d-muted);
		opacity: 0.6;
		display: grid;
		place-items: center;
		pointer-events: none;
	}

	.st-body {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 6px;
		padding: 9px 11px;
	}

	.st-info-btn {
		min-width: 0;
		flex: 1;
		padding: 0;
		border: none;
		background: transparent;
		text-align: left;
		cursor: pointer;
	}

	.st-name {
		margin: 0;
		font-size: 0.79rem;
		font-weight: 800;
		color: var(--d-ink);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.st-meta {
		margin: 2px 0 0;
		font-size: 0.68rem;
		color: var(--d-muted);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.st-card-actions {
		display: inline-flex;
		align-items: center;
		gap: 3px;
		flex-shrink: 0;
	}

	.st-icon-btn {
		width: 26px;
		height: 26px;
		border: 1px solid transparent;
		border-radius: 7px;
		background: transparent;
		color: var(--d-muted);
		display: grid;
		place-items: center;
		cursor: pointer;
	}

	.st-icon-btn:hover {
		background: var(--d-surface-2);
		color: var(--d-ink);
	}

	.st-icon-btn.is-danger:hover {
		background: var(--d-err-soft);
		color: var(--d-err);
	}

	.st-sm-btn {
		height: 26px;
		padding: 0 8px;
		border: 1px solid var(--d-border);
		border-radius: 6px;
		background: var(--d-surface-2);
		color: var(--d-ink);
		font-family: var(--font-body);
		font-size: 0.69rem;
		font-weight: 700;
		cursor: pointer;
	}

	.st-sm-btn.is-danger {
		border-color: var(--d-err);
		background: var(--d-err);
		color: #ffffff;
	}

	/* ── Pagination Minimalis ── */
	.st-pager {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 10px 14px;
		padding-top: 10px;
		border-top: 1px solid var(--d-border);
	}

	.st-pager-info {
		font-size: 0.74rem;
		font-weight: 600;
		color: var(--d-muted);
	}

	.st-pager-right {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 10px;
	}

	.st-pager-sizes {
		display: inline-flex;
		padding: 2px;
		border: 1px solid var(--d-border);
		border-radius: 8px;
		background: var(--d-surface);
		gap: 2px;
	}

	.st-size-btn {
		height: 24px;
		min-width: 30px;
		padding: 0 7px;
		border: none;
		border-radius: 6px;
		background: transparent;
		color: var(--d-muted);
		font-family: var(--font-body);
		font-size: 0.71rem;
		font-weight: 700;
		cursor: pointer;
	}

	.st-size-btn:hover:not(.is-active) {
		color: var(--d-ink);
	}

	.st-size-btn.is-active {
		background: var(--d-ink);
		color: var(--d-bg);
	}

	.st-pager-nav {
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}

	.st-nav-btn {
		width: 30px;
		height: 30px;
		border: 1px solid var(--d-border);
		border-radius: 8px;
		background: var(--d-surface);
		color: var(--d-ink);
		display: grid;
		place-items: center;
		cursor: pointer;
	}

	.st-nav-btn:hover:not(:disabled) {
		background: var(--d-surface-2);
		border-color: var(--d-border-strong);
	}

	.st-nav-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.st-page-num {
		min-width: 44px;
		text-align: center;
		font-size: 0.74rem;
		font-weight: 700;
		color: var(--d-ink);
	}

	/* ── Modal ── */
	.st-modal {
		position: fixed;
		inset: 0;
		z-index: 80;
		display: grid;
		place-items: center;
		padding: 18px;
	}

	.st-modal-backdrop {
		position: absolute;
		inset: 0;
		border: none;
		background: rgba(0, 0, 0, 0.56);
		backdrop-filter: blur(4px);
		cursor: pointer;
	}

	.st-modal-box {
		position: relative;
		z-index: 1;
		width: min(94vw, 520px);
		max-height: 90dvh;
		display: flex;
		flex-direction: column;
		box-shadow: 0 24px 60px rgba(0, 0, 0, 0.4);
	}

	.st-modal-box.is-wide {
		width: min(94vw, 680px);
	}

	.st-modal-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 12px;
		padding: 14px 18px;
		border-bottom: 1px solid var(--d-border);
	}

	.st-modal-title {
		margin: 0;
		font-size: 0.94rem;
		font-weight: 800;
		color: var(--d-ink);
	}

	.st-modal-sub {
		margin: 2px 0 0;
		font-size: 0.74rem;
		color: var(--d-muted);
	}

	.st-close-btn {
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

	.st-modal-body {
		overflow-y: auto;
		padding: 16px 18px 18px;
		display: flex;
		flex-direction: column;
		gap: 14px;
	}

	.st-dropzone {
		width: 100%;
		padding: 24px 16px;
		border: 1.5px dashed var(--d-border-strong);
		border-radius: 12px;
		background: var(--d-bg);
		color: var(--d-ink);
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 5px;
		text-align: center;
		cursor: pointer;
		transition:
			border-color 140ms ease,
			background-color 140ms ease;
	}

	.st-dropzone:hover:not(:disabled),
	.st-dropzone.is-dragging {
		border-color: var(--d-ink);
		background: var(--d-surface-2);
	}

	.st-drop-icon {
		width: 38px;
		height: 38px;
		border-radius: 10px;
		border: 1px solid var(--d-border);
		background: var(--d-surface);
		display: grid;
		place-items: center;
		margin-bottom: 2px;
	}

	.st-drop-title {
		font-size: 0.82rem;
		font-weight: 800;
	}

	.st-drop-sub {
		font-size: 0.72rem;
		color: var(--d-muted);
	}

	.st-queue {
		display: flex;
		flex-direction: column;
		gap: 6px;
		max-height: 170px;
		overflow-y: auto;
	}

	.st-queue-item {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 6px 8px;
		border: 1px solid var(--d-border);
		border-radius: 9px;
		background: var(--d-bg);
	}

	.st-queue-thumb {
		width: 36px;
		height: 36px;
		border-radius: 7px;
		border: 1px solid var(--d-border);
		padding: 3px;
		display: grid;
		place-items: center;
		flex-shrink: 0;
	}

	.st-queue-thumb img {
		max-width: 100%;
		max-height: 100%;
		object-fit: contain;
	}

	.st-queue-info {
		min-width: 0;
		flex: 1;
		display: flex;
		flex-direction: column;
	}

	.st-queue-name {
		font-size: 0.76rem;
		font-weight: 700;
		color: var(--d-ink);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.st-queue-dim {
		font-size: 0.68rem;
		color: var(--d-muted);
	}

	.st-field {
		display: flex;
		flex-direction: column;
		gap: 5px;
	}

	.st-label {
		font-size: 0.72rem;
		font-weight: 700;
		color: var(--d-muted);
	}

	.st-input {
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
	}

	.st-input:focus {
		border-color: var(--d-border-strong);
	}

	.st-cat-presets {
		display: flex;
		flex-wrap: wrap;
		gap: 5px;
		margin-top: 2px;
	}

	.st-chip {
		height: 24px;
		padding: 0 8px;
		border: 1px solid var(--d-border);
		border-radius: 6px;
		background: var(--d-bg);
		color: var(--d-muted);
		font-family: var(--font-body);
		font-size: 0.68rem;
		font-weight: 700;
		cursor: pointer;
	}

	.st-chip.is-active {
		border-color: var(--d-ink);
		background: var(--d-ink);
		color: var(--d-bg);
	}

	.st-modal-foot {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
		padding-top: 10px;
		border-top: 1px solid var(--d-border);
	}

	/* ── Modal Detail / Edit ── */
	.st-det-body {
		overflow-y: auto;
		padding: 16px 18px 18px;
		display: grid;
		grid-template-columns: minmax(0, 1fr) 250px;
		gap: 16px;
		align-items: start;
	}

	.st-det-stage-col {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.st-bg-seg {
		display: inline-flex;
		align-self: flex-start;
		padding: 3px;
		border: 1px solid var(--d-border);
		border-radius: 9px;
		background: var(--d-bg);
		gap: 2px;
	}

	.st-seg-btn {
		height: 25px;
		padding: 0 10px;
		border: none;
		border-radius: 6px;
		background: transparent;
		color: var(--d-muted);
		font-family: var(--font-body);
		font-size: 0.71rem;
		font-weight: 700;
		cursor: pointer;
	}

	.st-seg-btn.is-active {
		background: var(--d-ink);
		color: var(--d-bg);
	}

	.st-det-stage {
		height: 260px;
		padding: 20px;
		border: 1px solid var(--d-border);
		border-radius: 12px;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.st-det-stage.is-bg-light {
		background: #f8fafc;
	}

	.st-det-stage.is-bg-dark {
		background: #0f172a;
	}

	.st-det-img {
		max-width: 100%;
		max-height: 100%;
		object-fit: contain;
		user-select: none;
	}

	.st-det-rail {
		display: flex;
		flex-direction: column;
		gap: 14px;
		padding: 14px;
		border: 1px solid var(--d-border);
		border-radius: 12px;
		background: var(--d-bg);
	}

	.st-det-form {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.st-toggle-row {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 0.76rem;
		font-weight: 700;
		color: var(--d-ink);
		cursor: pointer;
	}

	.st-det-danger {
		padding-top: 10px;
		border-top: 1px solid var(--d-border);
	}

	.st-det-del-row {
		display: flex;
		gap: 6px;
	}

	.st-det-del-row .st-sm-btn {
		flex: 1;
		height: 34px;
	}

	.st-specs {
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.st-spec-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		font-size: 0.75rem;
	}

	.st-spec-row dt {
		color: var(--d-muted);
		font-weight: 600;
	}

	.st-spec-row dd {
		margin: 0;
		color: var(--d-ink);
		font-weight: 700;
		text-align: right;
	}

	.st-file-val {
		max-width: 130px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	@media (max-width: 680px) {
		.st-det-body {
			grid-template-columns: minmax(0, 1fr);
		}

		.st-det-stage {
			height: 200px;
		}
	}
</style>
