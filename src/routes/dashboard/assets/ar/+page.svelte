<script lang="ts">
	import { onMount } from 'svelte';
	import { customArStore, loadCustomAssets, type CustomArAsset } from '#lib/services/customAssets';
	import {
		Plus,
		Search,
		Upload,
		Pencil,
		Trash2,
		X,
		Eye,
		EyeOff,
		Sparkles,
		ChevronLeft,
		ChevronRight
	} from '@lucide/svelte';

	type StatusFilter = 'all' | 'active' | 'inactive';
	type PreviewBg = 'checker' | 'light' | 'dark' | 'camera';

	type UploadEntry = {
		file: File;
		previewUrl: string;
		w: number;
		h: number;
		origW: number;
		origH: number;
		resized: boolean;
	};

	const PAGE_SIZES = [12, 24, 48];
	const MIN_AR_SHORT = 64;
	const MIN_AR_LONG = 100;
	const MAX_AR_SIDE = 1280;

	let loading = $state(true);
	let saving = $state(false);
	let togglingId = $state<string | null>(null);
	let deletingId = $state<string | null>(null);
	let confirmDeleteId = $state<string | null>(null);
	let error = $state<string | null>(null);
	let notice = $state<string | null>(null);

	let query = $state('');
	let statusFilter = $state<StatusFilter>('all');
	let pageSize = $state(12);
	let currentPage = $state(1);

	// Empty-state drag
	let emptyDragging = $state(false);

	// Modal Unggah
	let showUploadModal = $state(false);
	let uploadDragging = $state(false);
	let uploadFiles = $state<UploadEntry[]>([]);
	let uploadName = $state('');
	let uploadInput = $state<HTMLInputElement | null>(null);

	// Modal Detail / Edit
	let selectedItem = $state<CustomArAsset | null>(null);
	let previewBg = $state<PreviewBg>('checker');
	let editName = $state('');
	let editEnabled = $state(true);
	let modalConfirmDelete = $state(false);

	const items = $derived($customArStore);

	const counts = $derived.by(() => ({
		all: items.length,
		active: items.filter((a) => a.enabled !== false).length,
		inactive: items.filter((a) => a.enabled === false).length
	}));

	const filteredItems = $derived.by(() => {
		const q = query.trim().toLowerCase();
		return items.filter((a) => {
			if (statusFilter === 'active' && a.enabled === false) return false;
			if (statusFilter === 'inactive' && a.enabled !== false) return false;
			if (!q) return true;
			return a.name.toLowerCase().includes(q) || a.id.toLowerCase().includes(q);
		});
	});

	const totalPages = $derived(Math.max(1, Math.ceil(filteredItems.length / pageSize)));
	const safePage = $derived(Math.min(currentPage, totalPages));
	const pageStart = $derived(filteredItems.length === 0 ? 0 : (safePage - 1) * pageSize + 1);
	const pageEnd = $derived(Math.min(filteredItems.length, safePage * pageSize));
	const pagedItems = $derived(filteredItems.slice((safePage - 1) * pageSize, safePage * pageSize));

	$effect(() => {
		void query;
		void statusFilter;
		void pageSize;
		currentPage = 1;
	});

	function isResizableRaster(file: File): boolean {
		const isGif = file.type === 'image/gif' || /\.gif$/i.test(file.name);
		const isSvg = file.type === 'image/svg+xml' || /\.svg$/i.test(file.name);
		return !isGif && !isSvg;
	}

	/** Validasi dimensi minimal dan perkecil otomatis bila sisi terpanjang > 1280 px. */
	function prepareArFile(file: File): Promise<UploadEntry> {
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
				if (Math.min(origW, origH) < MIN_AR_SHORT || Math.max(origW, origH) < MIN_AR_LONG) {
					URL.revokeObjectURL(rawUrl);
					reject(
						new Error(
							`"${file.name}" terlalu kecil (${origW} × ${origH} px). Minimal ${MIN_AR_LONG} px (sisi terpendek ≥ ${MIN_AR_SHORT} px).`
						)
					);
					return;
				}
				if (!isResizableRaster(file) || Math.max(origW, origH) <= MAX_AR_SIDE) {
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

				const scale = MAX_AR_SIDE / Math.max(origW, origH);
				const nextW = Math.max(MIN_AR_SHORT, Math.round(origW * scale));
				const nextH = Math.max(MIN_AR_SHORT, Math.round(origH * scale));
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
			if (/\.(png|webp|gif|svg)$/i.test(f.name)) {
				valid.push(f);
			}
		}
		if (valid.length === 0) {
			error = 'Format overlay AR harus gambar transparan (PNG, WebP, GIF, atau SVG).';
			return;
		}
		error = null;
		const ready: UploadEntry[] = [];
		const rejected: string[] = [];
		for (const file of valid) {
			try {
				ready.push(await prepareArFile(file));
			} catch (e) {
				rejected.push(e instanceof Error ? e.message : `Gagal membaca ${file.name}.`);
			}
		}
		if (rejected.length > 0) error = rejected.join(' ');
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

	async function handleEmptyDrop(e: DragEvent): Promise<void> {
		e.preventDefault();
		emptyDragging = false;
		if (saving) return;
		if (e.dataTransfer?.files?.length) {
			openUploadModal();
			await addUploadFiles(e.dataTransfer.files);
		}
	}

	async function handleModalDrop(e: DragEvent): Promise<void> {
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
			error = 'Pilih minimal satu berkas overlay AR.';
			return;
		}
		saving = true;
		error = null;
		notice = null;
		try {
			let uploaded = 0;
			for (const entry of uploadFiles) {
				const form = new FormData();
				form.set('file', entry.file);
				const itemName =
					uploadFiles.length === 1 && uploadName.trim()
						? uploadName.trim()
						: entry.file.name.replace(/\.[^.]+$/, '');
				form.set('name', itemName);
				form.set('width', String(entry.w));
				form.set('height', String(entry.h));
				const res = await fetch('/api/assets/ar', { method: 'POST', body: form });
				const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
				if (!res.ok || !data.ok)
					throw new Error(data.error || `Gagal mengunggah ${entry.file.name}.`);
				uploaded++;
			}
			await loadCustomAssets(true);
			notice =
				uploaded === 1
					? 'Overlay AR berhasil disimpan.'
					: `${uploaded} aset overlay AR berhasil disimpan.`;
			showUploadModal = false;
			revokeUploadPreviews();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Gagal mengunggah overlay AR.';
		} finally {
			saving = false;
		}
	}

	function openDetail(item: CustomArAsset): void {
		selectedItem = item;
		previewBg = 'checker';
		editName = item.name;
		editEnabled = item.enabled !== false;
		modalConfirmDelete = false;
	}

	function closeDetail(): void {
		if (saving) return;
		selectedItem = null;
		modalConfirmDelete = false;
	}

	async function quickToggleEnabled(item: CustomArAsset): Promise<void> {
		if (togglingId !== null) return;
		togglingId = item.id;
		error = null;
		const nextEnabled = item.enabled === false;
		try {
			const res = await fetch('/api/assets/ar', {
				method: 'PUT',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					id: item.id,
					name: item.name,
					enabled: nextEnabled
				})
			});
			const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
			if (!res.ok || !data.ok) throw new Error(data.error || 'Gagal mengubah status overlay.');
			await loadCustomAssets(true);
		} catch (err) {
			error = err instanceof Error ? err.message : 'Gagal mengubah status overlay.';
		} finally {
			togglingId = null;
		}
	}

	async function saveEdit(e: SubmitEvent): Promise<void> {
		e.preventDefault();
		if (!selectedItem || saving) return;
		saving = true;
		error = null;
		notice = null;
		try {
			const nextName = editName.trim() || 'Overlay AR';
			const res = await fetch('/api/assets/ar', {
				method: 'PUT',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					id: selectedItem.id,
					name: nextName,
					enabled: editEnabled
				})
			});
			const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
			if (!res.ok || !data.ok) throw new Error(data.error || 'Gagal memperbarui overlay.');
			await loadCustomAssets(true);
			notice = `Overlay "${nextName}" diperbarui.`;
			selectedItem = null;
		} catch (err) {
			error = err instanceof Error ? err.message : 'Gagal memperbarui overlay.';
		} finally {
			saving = false;
		}
	}

	async function removeItem(id: string, label: string): Promise<void> {
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
			if (selectedItem?.id === id) {
				selectedItem = null;
				modalConfirmDelete = false;
			}
			await loadCustomAssets(true);
			notice = `Overlay "${label}" dihapus.`;
		} catch (err) {
			error = err instanceof Error ? err.message : 'Gagal menghapus overlay.';
		} finally {
			deletingId = null;
		}
	}

	function handleWindowKeydown(e: KeyboardEvent): void {
		if (e.key === 'Escape') {
			if (showUploadModal) closeUploadModal();
			else if (selectedItem) closeDetail();
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

<div class="ar-page">
	<header class="ar-head">
		<div class="ar-head-copy">
			<div class="ar-title-row">
				<h1 class="ar-title">Overlay AR</h1>
				<span class="ar-beta-pill">Persiapan Kamera</span>
			</div>
			<p class="ar-sub">
				Simpan dan atur aset overlay transparan (PNG, WebP, GIF, SVG) untuk integrasi pelacakan
				wajah kamera.
			</p>
		</div>
		{#if items.length > 0}
			<button type="button" class="ar-btn is-primary" onclick={openUploadModal} disabled={saving}>
				<Plus size={15} />
				Tambah Overlay
			</button>
		{/if}
	</header>

	{#if error && !showUploadModal}
		<div class="d-banner d-banner-err" role="alert"><span>{error}</span></div>
	{/if}
	{#if notice}
		<div class="d-banner d-banner-ok" role="status"><span>{notice}</span></div>
	{/if}

	{#if loading}
		<div class="ar-grid">
			{#each Array(4) as _, idx (idx)}
				<div class="ar-skel"></div>
			{/each}
		</div>
	{:else if items.length === 0}
		<!-- Empty State Langsung Siap Drag & Drop -->
		<section class="ar-empty-wrap" aria-label="Unggah overlay AR pertama">
			<button
				type="button"
				class="ar-drop-hero"
				class:is-dragging={emptyDragging}
				onclick={openUploadModal}
				ondragover={(e) => {
					e.preventDefault();
					emptyDragging = true;
				}}
				ondragleave={() => (emptyDragging = false)}
				ondrop={handleEmptyDrop}
			>
				<span class="ar-drop-icon" aria-hidden="true"><Upload size={20} /></span>
				<span class="ar-drop-title">Unggah aset overlay AR pertama</span>
				<span class="ar-drop-desc">
					Seret berkas <strong>PNG, WebP, GIF, atau SVG transparan</strong> (misalnya kacamata, topi,
					atau bingkai kamera) ke sini.
				</span>
				<span class="ar-drop-cta">Pilih Berkas</span>
			</button>
		</section>
	{:else}
		<!-- Toolbar Filter Minimalis -->
		<div class="ar-toolbar">
			<div class="ar-search">
				<Search size={14} />
				<input
					type="search"
					class="ar-search-input"
					placeholder="Cari overlay AR…"
					bind:value={query}
					aria-label="Cari overlay AR"
				/>
			</div>

			<div class="ar-pills" role="group" aria-label="Filter status overlay">
				<button
					type="button"
					class="ar-pill"
					class:is-active={statusFilter === 'all'}
					onclick={() => (statusFilter = 'all')}
				>
					Semua ({counts.all})
				</button>
				<button
					type="button"
					class="ar-pill"
					class:is-active={statusFilter === 'active'}
					onclick={() => (statusFilter = 'active')}
				>
					Aktif ({counts.active})
				</button>
				<button
					type="button"
					class="ar-pill"
					class:is-active={statusFilter === 'inactive'}
					onclick={() => (statusFilter = 'inactive')}
				>
					Nonaktif ({counts.inactive})
				</button>
			</div>
		</div>

		{#if filteredItems.length === 0}
			<section class="ar-empty-filter" aria-label="Hasil pencarian kosong">
				<Sparkles size={20} />
				<p class="ar-empty-title">Tidak ada overlay AR yang cocok</p>
				<p class="ar-empty-sub">Coba ubah kata kunci pencarian atau pilih status lain.</p>
			</section>
		{:else}
			<section class="ar-grid" aria-label="Koleksi overlay AR">
				{#each pagedItems as item (item.id)}
					{@const isInactive = item.enabled === false}
					<article class="ar-card" class:is-inactive={isInactive}>
						<div class="ar-media d-checker">
							<button
								type="button"
								class="ar-media-btn"
								onclick={() => openDetail(item)}
								aria-label="Lihat detail overlay {item.name}"
							>
								<img
									class="ar-thumb"
									src={item.url}
									alt={item.name}
									loading="lazy"
									draggable="false"
								/>
							</button>

							<span class="ar-status-badge" class:is-active={!isInactive}>
								{isInactive ? 'Nonaktif' : 'Aktif'}
							</span>

							<button
								type="button"
								class="ar-vis-btn"
								class:is-off={isInactive}
								disabled={togglingId === item.id}
								onclick={() => quickToggleEnabled(item)}
								title={isInactive ? 'Aktifkan overlay' : 'Nonaktifkan overlay'}
								aria-label={isInactive ? `Aktifkan ${item.name}` : `Nonaktifkan ${item.name}`}
							>
								{#if isInactive}
									<EyeOff size={12} />
								{:else}
									<Eye size={12} />
								{/if}
							</button>
						</div>

						<div class="ar-body">
							<button type="button" class="ar-info-btn" onclick={() => openDetail(item)}>
								<h2 class="ar-name" title={item.name}>{item.name}</h2>
								<p class="ar-meta d-num">
									{item.width && item.height ? `${item.width} × ${item.height} px` : item.file}
								</p>
							</button>

							<div class="ar-card-actions">
								{#if confirmDeleteId === item.id}
									<button
										type="button"
										class="ar-sm-btn is-danger"
										disabled={deletingId === item.id}
										onclick={() => removeItem(item.id, item.name)}
									>
										Hapus
									</button>
									<button
										type="button"
										class="ar-sm-btn"
										disabled={deletingId === item.id}
										onclick={() => (confirmDeleteId = null)}
									>
										Batal
									</button>
								{:else}
									<button
										type="button"
										class="ar-icon-btn"
										onclick={() => openDetail(item)}
										title="Edit overlay"
										aria-label="Edit overlay {item.name}"
									>
										<Pencil size={13} />
									</button>
									<button
										type="button"
										class="ar-icon-btn is-danger"
										onclick={() => (confirmDeleteId = item.id)}
										title="Hapus overlay"
										aria-label="Hapus overlay {item.name}"
									>
										<Trash2 size={13} />
									</button>
								{/if}
							</div>
						</div>
					</article>
				{/each}
			</section>

			<!-- Pagination -->
			<nav class="ar-pager" aria-label="Navigasi halaman overlay AR">
				<span class="ar-pager-info d-num">
					Menampilkan {pageStart}–{pageEnd} dari {filteredItems.length} aset
				</span>

				<div class="ar-pager-right">
					<div class="ar-pager-sizes" role="group" aria-label="Jumlah overlay per halaman">
						{#each PAGE_SIZES as size (size)}
							<button
								type="button"
								class="ar-size-btn d-num"
								class:is-active={pageSize === size}
								onclick={() => (pageSize = size)}
							>
								{size}
							</button>
						{/each}
					</div>

					{#if totalPages > 1}
						<div class="ar-pager-nav">
							<button
								type="button"
								class="ar-nav-btn"
								disabled={safePage <= 1}
								onclick={() => (currentPage = Math.max(1, safePage - 1))}
								aria-label="Halaman sebelumnya"
							>
								<ChevronLeft size={14} />
							</button>
							<span class="ar-page-num d-num">{safePage} / {totalPages}</span>
							<button
								type="button"
								class="ar-nav-btn"
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
	{/if}
</div>

<!-- Modal Unggah Overlay AR -->
{#if showUploadModal}
	<div class="ar-modal" role="dialog" aria-modal="true" aria-label="Unggah overlay AR">
		<button
			type="button"
			class="ar-modal-backdrop"
			aria-label="Tutup unggah overlay"
			onclick={closeUploadModal}
		></button>
		<div class="d-card ar-modal-box">
			<div class="ar-modal-head">
				<div>
					<h2 class="ar-modal-title">Tambah Overlay AR</h2>
					<p class="ar-modal-sub">
						PNG, WebP, GIF, SVG transparan · Min. {MIN_AR_LONG} px · &gt; {MAX_AR_SIDE} px diperkecil
						otomatis.
					</p>
				</div>
				<button type="button" class="ar-close-btn" onclick={closeUploadModal} aria-label="Tutup">
					<X size={15} />
				</button>
			</div>

			<form class="ar-modal-body" onsubmit={submitUpload}>
				{#if error}
					<div class="d-banner d-banner-err" role="alert"><span>{error}</span></div>
				{/if}

				<input
					bind:this={uploadInput}
					type="file"
					class="ar-file-hidden"
					accept="image/png,image/webp,image/gif,image/svg+xml,.png,.webp,.gif,.svg"
					multiple
					onchange={handleUploadInputChange}
					disabled={saving}
				/>

				<button
					type="button"
					class="ar-dropzone"
					class:is-dragging={uploadDragging}
					onclick={() => uploadInput?.click()}
					ondragover={(e) => {
						e.preventDefault();
						if (!saving) uploadDragging = true;
					}}
					ondragleave={() => (uploadDragging = false)}
					ondrop={handleModalDrop}
					disabled={saving}
				>
					<span class="ar-drop-sm-icon" aria-hidden="true"><Upload size={18} /></span>
					<span class="ar-drop-sm-title">Klik atau seret berkas overlay ke sini</span>
					<span class="ar-drop-sm-sub"
						>Bisa pilih beberapa berkas sekaligus (maks 6 MB/berkas).</span
					>
				</button>

				{#if uploadFiles.length > 0}
					<div class="ar-queue">
						{#each uploadFiles as entry, idx (entry.previewUrl)}
							<div class="ar-queue-item">
								<div class="ar-queue-thumb d-checker">
									<img src={entry.previewUrl} alt={entry.file.name} />
								</div>
								<div class="ar-queue-info">
									<span class="ar-queue-name">{entry.file.name}</span>
									<span class="ar-queue-dim d-num">
										{#if entry.resized}
											{entry.origW} × {entry.origH} → {entry.w} × {entry.h} px (diperkecil)
										{:else}
											{entry.w} × {entry.h} px
										{/if}
									</span>
								</div>
								<button
									type="button"
									class="ar-icon-btn is-danger"
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
					<div class="ar-field">
						<label class="ar-label" for="up-ar-name">Nama Overlay</label>
						<input
							id="up-ar-name"
							type="text"
							class="ar-input"
							bind:value={uploadName}
							placeholder="Contoh: Kacamata Retro"
							maxlength="80"
						/>
					</div>
				{/if}

				<div class="ar-modal-foot">
					<button type="button" class="ar-btn" onclick={closeUploadModal} disabled={saving}>
						Batal
					</button>
					<button
						type="submit"
						class="ar-btn is-primary"
						disabled={saving || uploadFiles.length === 0}
					>
						{saving
							? 'Mengunggah…'
							: uploadFiles.length > 1
								? `Unggah ${uploadFiles.length} Overlay`
								: 'Unggah Overlay'}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}

<!-- Modal Detail / Edit Overlay AR -->
{#if selectedItem}
	<div class="ar-modal" role="dialog" aria-modal="true" aria-label="Detail overlay AR">
		<button
			type="button"
			class="ar-modal-backdrop"
			aria-label="Tutup detail overlay"
			onclick={closeDetail}
		></button>
		<div class="d-card ar-modal-box is-wide">
			<div class="ar-modal-head">
				<div>
					<h2 class="ar-modal-title">{selectedItem.name}</h2>
					<p class="ar-modal-sub d-num">
						{selectedItem.width && selectedItem.height
							? `${selectedItem.width} × ${selectedItem.height} px · `
							: ''}{selectedItem.enabled === false ? 'Nonaktif' : 'Aktif'}
					</p>
				</div>
				<button type="button" class="ar-close-btn" onclick={closeDetail} aria-label="Tutup">
					<X size={15} />
				</button>
			</div>

			<div class="ar-det-body">
				<div class="ar-det-stage-col">
					<div class="ar-bg-seg" role="group" aria-label="Latar pratinjau overlay">
						<button
							type="button"
							class="ar-seg-btn"
							class:is-active={previewBg === 'checker'}
							onclick={() => (previewBg = 'checker')}
						>
							Transparan
						</button>
						<button
							type="button"
							class="ar-seg-btn"
							class:is-active={previewBg === 'light'}
							onclick={() => (previewBg = 'light')}
						>
							Terang
						</button>
						<button
							type="button"
							class="ar-seg-btn"
							class:is-active={previewBg === 'dark'}
							onclick={() => (previewBg = 'dark')}
						>
							Gelap
						</button>
						<button
							type="button"
							class="ar-seg-btn"
							class:is-active={previewBg === 'camera'}
							onclick={() => (previewBg = 'camera')}
						>
							Panduan Wajah
						</button>
					</div>

					<div
						class="ar-det-stage"
						class:d-checker={previewBg === 'checker'}
						class:is-bg-light={previewBg === 'light'}
						class:is-bg-dark={previewBg === 'dark' || previewBg === 'camera'}
					>
						{#if previewBg === 'camera'}
							<svg class="ar-face-guide" viewBox="0 0 240 240" aria-hidden="true">
								<ellipse
									cx="120"
									cy="104"
									rx="52"
									ry="66"
									fill="none"
									stroke="rgba(255,255,255,0.28)"
									stroke-width="2"
									stroke-dasharray="6 5"
								/>
								<path
									d="M46 232 C54 182 186 182 194 232"
									fill="none"
									stroke="rgba(255,255,255,0.2)"
									stroke-width="2"
									stroke-dasharray="6 5"
								/>
							</svg>
						{/if}
						<img
							class="ar-det-img"
							src={selectedItem.url}
							alt={selectedItem.name}
							draggable="false"
						/>
					</div>
				</div>

				<aside class="ar-det-rail">
					<form class="ar-det-form" onsubmit={saveEdit}>
						<div class="ar-field">
							<label class="ar-label" for="ed-ar-name">Nama Overlay</label>
							<input
								id="ed-ar-name"
								type="text"
								class="ar-input"
								bind:value={editName}
								maxlength="80"
								required
							/>
						</div>

						<label class="ar-toggle-row">
							<input type="checkbox" class="toggle toggle-sm" bind:checked={editEnabled} />
							<span>Aktifkan aset overlay</span>
						</label>

						<button type="submit" class="ar-btn is-primary is-full" disabled={saving}>
							{saving ? 'Menyimpan…' : 'Simpan Perubahan'}
						</button>
					</form>

					<div class="ar-det-danger">
						{#if modalConfirmDelete}
							<div class="ar-det-del-row">
								<button
									type="button"
									class="ar-sm-btn is-danger"
									disabled={deletingId === selectedItem.id}
									onclick={() => selectedItem && removeItem(selectedItem.id, selectedItem.name)}
								>
									Konfirmasi Hapus
								</button>
								<button
									type="button"
									class="ar-sm-btn"
									disabled={deletingId === selectedItem.id}
									onclick={() => (modalConfirmDelete = false)}
								>
									Batal
								</button>
							</div>
						{:else}
							<button
								type="button"
								class="ar-btn is-danger-ghost is-full"
								onclick={() => (modalConfirmDelete = true)}
							>
								<Trash2 size={14} />
								Hapus Overlay
							</button>
						{/if}
					</div>
				</aside>
			</div>
		</div>
	</div>
{/if}

<style>
	.ar-file-hidden {
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

	.ar-page {
		display: flex;
		flex-direction: column;
		gap: 18px;
	}

	/* ── Header Minimalis ── */
	.ar-head {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		justify-content: space-between;
		gap: 12px 18px;
	}

	.ar-head-copy {
		min-width: 0;
		flex: 1 1 240px;
	}

	.ar-title-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 10px;
	}

	.ar-title {
		margin: 0;
		font-size: clamp(1.4rem, 2vw, 1.7rem);
		font-weight: 800;
		letter-spacing: -0.025em;
		line-height: 1.15;
		color: var(--d-ink);
	}

	.ar-beta-pill {
		padding: 3px 8px;
		border-radius: 999px;
		border: 1px solid var(--d-border);
		background: var(--d-surface);
		color: var(--d-muted);
		font-size: 0.68rem;
		font-weight: 700;
	}

	.ar-sub {
		margin: 4px 0 0;
		font-size: 0.82rem;
		color: var(--d-muted);
	}

	.ar-btn {
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

	.ar-btn:hover:not(:disabled) {
		background: var(--d-surface-2);
		border-color: var(--d-border-strong);
	}

	.ar-btn:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}

	.ar-btn.is-primary {
		border-color: var(--d-ink);
		background: var(--d-ink);
		color: var(--d-bg);
	}

	.ar-btn.is-primary:hover:not(:disabled) {
		opacity: 0.9;
		background: var(--d-ink);
	}

	.ar-btn.is-full {
		width: 100%;
	}

	.ar-btn.is-danger-ghost {
		color: var(--d-err);
		border-color: color-mix(in srgb, var(--d-err) 30%, var(--d-border));
	}

	.ar-btn.is-danger-ghost:hover:not(:disabled) {
		background: var(--d-err-soft);
		border-color: var(--d-err);
	}

	/* ── Empty State Minimalis (Drag & Drop) ── */
	.ar-empty-wrap {
		display: flex;
		justify-content: center;
	}

	.ar-drop-hero {
		width: 100%;
		min-height: 290px;
		padding: 40px 24px;
		border: 1.5px dashed var(--d-border-strong);
		border-radius: 16px;
		background: var(--d-surface);
		color: var(--d-ink);
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 10px;
		text-align: center;
		cursor: pointer;
		transition:
			border-color 150ms ease,
			background-color 150ms ease;
	}

	.ar-drop-hero:hover,
	.ar-drop-hero.is-dragging {
		border-color: var(--d-ink);
		background: var(--d-surface-2);
	}

	.ar-drop-icon {
		width: 48px;
		height: 48px;
		border-radius: 14px;
		border: 1px solid var(--d-border);
		background: var(--d-bg);
		color: var(--d-ink);
		display: grid;
		place-items: center;
	}

	.ar-drop-title {
		font-size: 0.96rem;
		font-weight: 800;
		color: var(--d-ink);
	}

	.ar-drop-desc {
		max-width: 44ch;
		font-size: 0.8rem;
		line-height: 1.5;
		color: var(--d-muted);
	}

	.ar-drop-desc strong {
		color: var(--d-ink);
	}

	.ar-drop-cta {
		margin-top: 6px;
		padding: 8px 18px;
		border-radius: 9px;
		background: var(--d-ink);
		color: var(--d-bg);
		font-size: 0.76rem;
		font-weight: 700;
	}

	/* ── Toolbar ── */
	.ar-toolbar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
	}

	.ar-search {
		position: relative;
		display: flex;
		align-items: center;
		flex: 1 1 200px;
		max-width: 300px;
		color: var(--d-muted);
	}

	.ar-search :global(svg) {
		position: absolute;
		left: 11px;
		pointer-events: none;
	}

	.ar-search-input {
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

	.ar-search-input:focus {
		border-color: var(--d-border-strong);
	}

	.ar-pills {
		display: flex;
		flex-wrap: wrap;
		gap: 5px;
	}

	.ar-pill {
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

	.ar-pill.is-active {
		border-color: var(--d-ink);
		background: var(--d-ink);
		color: var(--d-bg);
	}

	.ar-empty-filter {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 6px;
		min-height: 200px;
		padding: 28px 20px;
		border: 1.5px dashed var(--d-border-strong);
		border-radius: 16px;
		background: var(--d-surface);
		color: var(--d-muted);
		text-align: center;
	}

	.ar-empty-title {
		margin: 4px 0 0;
		font-size: 0.9rem;
		font-weight: 800;
		color: var(--d-ink);
	}

	.ar-empty-sub {
		margin: 0;
		font-size: 0.78rem;
	}

	/* ── Grid Kartu ── */
	.ar-grid {
		display: grid;
		gap: 12px;
		grid-template-columns: repeat(auto-fill, minmax(196px, 1fr));
	}

	.ar-skel {
		height: 214px;
		border-radius: 14px;
		background: var(--d-surface-2);
	}

	.ar-card {
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

	.ar-card:hover {
		border-color: var(--d-border-strong);
	}

	.ar-card.is-inactive {
		opacity: 0.62;
	}

	.ar-media {
		position: relative;
		height: 154px;
		border-bottom: 1px solid var(--d-border);
	}

	.ar-media-btn {
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

	.ar-thumb {
		max-width: 100%;
		max-height: 100%;
		object-fit: contain;
		transition: transform 150ms ease;
		user-select: none;
	}

	.ar-media-btn:hover .ar-thumb {
		transform: scale(1.04);
	}

	.ar-status-badge {
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

	.ar-status-badge.is-active {
		border-color: transparent;
		background: var(--d-ok-soft);
		color: var(--d-ok);
	}

	.ar-vis-btn {
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

	.ar-vis-btn.is-off {
		color: var(--d-muted);
	}

	.ar-body {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 6px;
		padding: 9px 11px;
	}

	.ar-info-btn {
		min-width: 0;
		flex: 1;
		padding: 0;
		border: none;
		background: transparent;
		text-align: left;
		cursor: pointer;
	}

	.ar-name {
		margin: 0;
		font-size: 0.8rem;
		font-weight: 800;
		color: var(--d-ink);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.ar-meta {
		margin: 2px 0 0;
		font-size: 0.68rem;
		color: var(--d-muted);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.ar-card-actions {
		display: inline-flex;
		align-items: center;
		gap: 3px;
		flex-shrink: 0;
	}

	.ar-icon-btn {
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

	.ar-icon-btn:hover {
		background: var(--d-surface-2);
		color: var(--d-ink);
	}

	.ar-icon-btn.is-danger:hover {
		background: var(--d-err-soft);
		color: var(--d-err);
	}

	.ar-sm-btn {
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

	.ar-sm-btn.is-danger {
		border-color: var(--d-err);
		background: var(--d-err);
		color: #ffffff;
	}

	/* ── Pagination ── */
	.ar-pager {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 10px 14px;
		padding-top: 10px;
		border-top: 1px solid var(--d-border);
	}

	.ar-pager-info {
		font-size: 0.74rem;
		font-weight: 600;
		color: var(--d-muted);
	}

	.ar-pager-right {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 10px;
	}

	.ar-pager-sizes {
		display: inline-flex;
		padding: 2px;
		border: 1px solid var(--d-border);
		border-radius: 8px;
		background: var(--d-surface);
		gap: 2px;
	}

	.ar-size-btn {
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

	.ar-size-btn.is-active {
		background: var(--d-ink);
		color: var(--d-bg);
	}

	.ar-pager-nav {
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}

	.ar-nav-btn {
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

	.ar-nav-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.ar-page-num {
		min-width: 44px;
		text-align: center;
		font-size: 0.74rem;
		font-weight: 700;
		color: var(--d-ink);
	}

	/* ── Modal ── */
	.ar-modal {
		position: fixed;
		inset: 0;
		z-index: 80;
		display: grid;
		place-items: center;
		padding: 18px;
	}

	.ar-modal-backdrop {
		position: absolute;
		inset: 0;
		border: none;
		background: rgba(0, 0, 0, 0.56);
		backdrop-filter: blur(4px);
		cursor: pointer;
	}

	.ar-modal-box {
		position: relative;
		z-index: 1;
		width: min(94vw, 520px);
		max-height: 90dvh;
		display: flex;
		flex-direction: column;
		box-shadow: 0 24px 60px rgba(0, 0, 0, 0.4);
	}

	.ar-modal-box.is-wide {
		width: min(94vw, 680px);
	}

	.ar-modal-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 12px;
		padding: 14px 18px;
		border-bottom: 1px solid var(--d-border);
	}

	.ar-modal-title {
		margin: 0;
		font-size: 0.94rem;
		font-weight: 800;
		color: var(--d-ink);
	}

	.ar-modal-sub {
		margin: 2px 0 0;
		font-size: 0.74rem;
		color: var(--d-muted);
	}

	.ar-close-btn {
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

	.ar-modal-body {
		overflow-y: auto;
		padding: 16px 18px 18px;
		display: flex;
		flex-direction: column;
		gap: 14px;
	}

	.ar-dropzone {
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

	.ar-dropzone:hover:not(:disabled),
	.ar-dropzone.is-dragging {
		border-color: var(--d-ink);
		background: var(--d-surface-2);
	}

	.ar-drop-sm-icon {
		width: 38px;
		height: 38px;
		border-radius: 10px;
		border: 1px solid var(--d-border);
		background: var(--d-surface);
		display: grid;
		place-items: center;
		margin-bottom: 2px;
	}

	.ar-drop-sm-title {
		font-size: 0.82rem;
		font-weight: 800;
	}

	.ar-drop-sm-sub {
		font-size: 0.72rem;
		color: var(--d-muted);
	}

	.ar-queue {
		display: flex;
		flex-direction: column;
		gap: 6px;
		max-height: 170px;
		overflow-y: auto;
	}

	.ar-queue-item {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 6px 8px;
		border: 1px solid var(--d-border);
		border-radius: 9px;
		background: var(--d-bg);
	}

	.ar-queue-thumb {
		width: 36px;
		height: 36px;
		border-radius: 7px;
		border: 1px solid var(--d-border);
		padding: 3px;
		display: grid;
		place-items: center;
		flex-shrink: 0;
	}

	.ar-queue-thumb img {
		max-width: 100%;
		max-height: 100%;
		object-fit: contain;
	}

	.ar-queue-info {
		min-width: 0;
		flex: 1;
		display: flex;
		flex-direction: column;
	}

	.ar-queue-name {
		font-size: 0.76rem;
		font-weight: 700;
		color: var(--d-ink);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.ar-queue-dim {
		font-size: 0.68rem;
		color: var(--d-muted);
	}

	.ar-field {
		display: flex;
		flex-direction: column;
		gap: 5px;
	}

	.ar-label {
		font-size: 0.72rem;
		font-weight: 700;
		color: var(--d-muted);
	}

	.ar-input {
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

	.ar-input:focus {
		border-color: var(--d-border-strong);
	}

	.ar-modal-foot {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
		padding-top: 10px;
		border-top: 1px solid var(--d-border);
	}

	/* ── Modal Detail / Edit ── */
	.ar-det-body {
		overflow-y: auto;
		padding: 16px 18px 18px;
		display: grid;
		grid-template-columns: minmax(0, 1fr) 248px;
		gap: 16px;
		align-items: start;
	}

	.ar-det-stage-col {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.ar-bg-seg {
		display: inline-flex;
		flex-wrap: wrap;
		align-self: flex-start;
		padding: 3px;
		border: 1px solid var(--d-border);
		border-radius: 9px;
		background: var(--d-bg);
		gap: 2px;
	}

	.ar-seg-btn {
		height: 25px;
		padding: 0 9px;
		border: none;
		border-radius: 6px;
		background: transparent;
		color: var(--d-muted);
		font-family: var(--font-body);
		font-size: 0.7rem;
		font-weight: 700;
		cursor: pointer;
	}

	.ar-seg-btn.is-active {
		background: var(--d-ink);
		color: var(--d-bg);
	}

	.ar-det-stage {
		position: relative;
		height: 264px;
		padding: 20px;
		border: 1px solid var(--d-border);
		border-radius: 12px;
		display: flex;
		align-items: center;
		justify-content: center;
		overflow: hidden;
	}

	.ar-det-stage.is-bg-light {
		background: #f8fafc;
	}

	.ar-det-stage.is-bg-dark {
		background: #0f172a;
	}

	.ar-face-guide {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		pointer-events: none;
	}

	.ar-det-img {
		position: relative;
		z-index: 1;
		max-width: 100%;
		max-height: 100%;
		object-fit: contain;
		user-select: none;
	}

	.ar-det-rail {
		display: flex;
		flex-direction: column;
		gap: 14px;
		padding: 14px;
		border: 1px solid var(--d-border);
		border-radius: 12px;
		background: var(--d-bg);
	}

	.ar-det-form {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.ar-toggle-row {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 0.76rem;
		font-weight: 700;
		color: var(--d-ink);
		cursor: pointer;
	}

	.ar-det-danger {
		padding-top: 10px;
		border-top: 1px solid var(--d-border);
	}

	.ar-det-del-row {
		display: flex;
		gap: 6px;
	}

	.ar-det-del-row .ar-sm-btn {
		flex: 1;
		height: 34px;
	}

	@media (max-width: 680px) {
		.ar-det-body {
			grid-template-columns: minmax(0, 1fr);
		}

		.ar-det-stage {
			height: 204px;
		}
	}
</style>
