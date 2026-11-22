<script lang="ts">
	import { onMount } from 'svelte';
	import '#lib/features/dashboard/dashboard.css';
	import ThemeToggle from '#lib/components/ui/ThemeToggle.svelte';
	import { session } from '#lib/stores/session';
	import {
		detectFrameSlots,
		boxesToSlots,
		fileToDataUrl,
		isJpegFile,
		isPngFile,
		isSvgFile,
		isWebpFile,
		eraseWandRegions,
		magicWandSelect,
		sanitizeSvg,
		svgToDataUrl,
		trimTransparentBounds
	} from '#lib/utils/frameDetect';
	import {
		deleteFrame,
		FRAME_SIZE_GUIDES,
		listFrames,
		ratioMatches,
		saveFrame,
		sizeGuideFor
	} from '#lib/utils/frameStorage';
	import { allFormats, detectFormat } from '#lib/data/standardFormats';
	import { customFrameSizes, loadCustomFrameSizes } from '#lib/services/frameSizes';
	import type { WandSlot } from '#lib/utils/frameDetect';
	import type { PhotoFrame } from '#lib/types';
	import {
		Upload,
		Plus,
		Ruler,
		Trash2,
		Check,
		Copy,
		Search,
		CheckCircle2,
		AlertTriangle,
		RefreshCw,
		ArrowLeft,
		X,
		Wand2,
		Eye,
		Download
	} from '@lucide/svelte';

	interface Draft {
		dataUrl: string;
		width: number;
		height: number;
		sourceName: string;
		trimmed: boolean;
		slots: WandSlot[];
	}

	let { embedded = false }: { embedded?: boolean } = $props();

	let frames = $state<PhotoFrame[]>([]);
	let loading = $state(true);
	let busy = $state(false);
	let dragging = $state(false);
	let deletingId = $state<string | null>(null);
	let confirmDeleteId = $state<string | null>(null);
	let error = $state<string | null>(null);
	let notice = $state<string | null>(null);
	let draft = $state<Draft | null>(null);
	let frameName = $state('');
	let wandTolerance = $state(32);
	let wandBusy = $state(false);

	let showGuide = $state(false);
	let copiedDimKey = $state<string | null>(null);
	let query = $state('');
	let slotFilter = $state<number | 'all'>('all');

	let detailFrame = $state<PhotoFrame | null>(null);
	let detailIsDraft = $state(false);
	let detailMode = $state<'simulasi' | 'artwork'>('simulasi');
	let detailBusy = $state(false);
	let detailRename = $state('');
	let detailRenaming = $state(false);
	let detailConfirmDelete = $state(false);

	const SIM_GRADIENTS = [
		'linear-gradient(135deg, #f6d365 0%, #fda085 100%)',
		'linear-gradient(135deg, #84fab0 0%, #8fd3f4 100%)',
		'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)',
		'linear-gradient(135deg, #fccb90 0%, #d57eeb 100%)',
		'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
		'linear-gradient(135deg, #fa709a 0%, #fee140 100%)'
	];

	let fileInput = $state<HTMLInputElement | null>(null);

	const isLight = $derived($session.theme === 'light');

	const formats = $derived.by(() => {
		void $customFrameSizes;
		return allFormats();
	});

	const placeholderCount = $derived(draft ? draft.slots.length : 0);

	const draftValidation = $derived.by(() => {
		if (!draft || placeholderCount === 0) return null;
		const guideOk = ratioMatches(draft.width, draft.height, placeholderCount);
		const fmt = detectFormat(draft.width, draft.height);
		const matchedFormat = fmt && fmt.photos.includes(placeholderCount) ? fmt : null;
		const ok = guideOk || Boolean(fmt);
		const guide = sizeGuideFor(placeholderCount);
		return { ok, matchedFormat, guide };
	});

	const filteredFrames = $derived.by(() => {
		const q = query.trim().toLowerCase();
		return frames.filter((f) => {
			if (slotFilter !== 'all' && f.slotCount !== slotFilter) return false;
			if (!q) return true;
			const fmtLabel = formats.find((x) => x.id === f.formatId)?.label ?? '';
			return f.name.toLowerCase().includes(q) || fmtLabel.toLowerCase().includes(q);
		});
	});

	onMount(async () => {
		await Promise.all([
			loadCustomFrameSizes().catch(() => undefined),
			listFrames()
				.then((list) => {
					frames = list;
				})
				.catch(() => {
					frames = [];
				})
		]);
		loading = false;
	});

	function openFilePicker(): void {
		if (busy) return;
		fileInput?.click();
	}

	function resetDraft(): void {
		draft = null;
		frameName = '';
		error = null;
	}

	async function processFile(file: File): Promise<void> {
		error = null;
		notice = null;
		draft = null;
		frameName = '';

		if (!isPngFile(file) && !isSvgFile(file) && !isJpegFile(file) && !isWebpFile(file)) {
			error = 'Format berkas harus PNG, SVG, JPEG, atau WebP.';
			return;
		}

		busy = true;
		try {
			let rawDataUrl: string;
			if (isSvgFile(file)) {
				const text = await file.text();
				rawDataUrl = svgToDataUrl(sanitizeSvg(text));
			} else {
				rawDataUrl = await fileToDataUrl(file);
			}

			// Potong margin transparan berlebih agar dimensi & rasio akurat
			const trimmed = await trimTransparentBounds(rawDataUrl);

			let result = await detectFrameSlots(trimmed.dataUrl);
			let usedDarkKey = false;
			if (result.boxes.length === 0) {
				const keyed = await detectFrameSlots(trimmed.dataUrl, {
					mode: 'key',
					keyColor: '#000000'
				});
				if (keyed.boxes.length > 0) {
					result = keyed;
					usedDarkKey = true;
				}
			}

			let initialSlots: WandSlot[] = [];
			if (result.boxes.length >= 1 && result.boxes.length <= 6) {
				const refined = await Promise.all(
					result.boxes.map(async (box): Promise<WandSlot> => {
						const cx = box.x + box.width / 2;
						const cy = box.y + box.height / 2;
						const wand = await magicWandSelect(trimmed.dataUrl, cx, cy, wandTolerance);
						if (wand && Boolean(wand.alreadyTransparent) === !usedDarkKey) {
							return wand;
						}
						return {
							...box,
							cx,
							cy,
							alreadyTransparent: !usedDarkKey
						};
					})
				);
				initialSlots = sortSlots(refined);
			}

			const baseName = file.name.replace(/\.(png|svg|jpe?g|webp)$/i, '');
			draft = {
				dataUrl: trimmed.dataUrl,
				width: trimmed.width,
				height: trimmed.height,
				sourceName: baseName,
				trimmed: trimmed.trimmed,
				slots: initialSlots
			};
			frameName = baseName;
		} catch (e) {
			console.error('Frame upload failed:', e);
			error = 'Gagal membaca berkas. Coba ekspor ulang desain dari Canva.';
		} finally {
			busy = false;
		}
	}

	async function handleInputChange(event: Event): Promise<void> {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (file) await processFile(file);
	}

	function handleDragOver(e: DragEvent): void {
		e.preventDefault();
		if (!busy) dragging = true;
	}

	function handleDragLeave(): void {
		dragging = false;
	}

	async function handleDrop(e: DragEvent): Promise<void> {
		e.preventDefault();
		dragging = false;
		if (busy) return;
		const file = e.dataTransfer?.files?.[0];
		if (file) await processFile(file);
	}

	function sortSlots(list: WandSlot[]): WandSlot[] {
		return [...list].sort((a, b) => a.y - b.y || a.x - b.x);
	}

	async function handleWandClick(e: MouseEvent): Promise<void> {
		if (!draft || wandBusy || busy) return;
		const target = e.currentTarget as HTMLElement;
		const rect = target.getBoundingClientRect();
		if (!rect.width || !rect.height) return;

		const normX = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
		const normY = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));

		wandBusy = true;
		error = null;
		try {
			const slot = await magicWandSelect(draft.dataUrl, normX, normY, wandTolerance);
			if (!slot) {
				error = 'Area tidak dapat dipilih. Klik langsung di dalam kotak foto atau ubah toleransi.';
				return;
			}

			// Cek apakah titik klik mengenai slot yang sudah ada (mis. untuk memperbarui toleransi)
			const existingIdx = draft.slots.findIndex((s) => {
				const sameCenter = Math.hypot(slot.cx - s.cx, slot.cy - s.cy) < 0.035;
				const insideExisting =
					slot.cx >= s.x && slot.cx <= s.x + s.width && slot.cy >= s.y && slot.cy <= s.y + s.height;
				return sameCenter || insideExisting;
			});

			if (existingIdx >= 0) {
				if (draft.slots[existingIdx].tolerance !== slot.tolerance) {
					const updated = [...draft.slots];
					updated[existingIdx] = slot;
					draft = { ...draft, slots: sortSlots(updated) };
				}
				return;
			}

			if (draft.slots.length >= 6) {
				error = 'Maksimal 6 slot foto per strip.';
				return;
			}

			draft = {
				...draft,
				slots: sortSlots([...draft.slots, slot])
			};
		} finally {
			wandBusy = false;
		}
	}

	function removeSlot(index: number): void {
		if (!draft) return;
		error = null;
		draft = {
			...draft,
			slots: draft.slots.filter((_, i) => i !== index)
		};
	}

	function clearAllSlots(): void {
		if (!draft) return;
		error = null;
		draft = { ...draft, slots: [] };
	}

	async function handleSave(e: SubmitEvent): Promise<void> {
		e.preventDefault();
		if (!draft || busy) return;
		const placeholders = draft.slots;
		if (placeholders.length === 0) {
			error = 'Pilih minimal satu slot foto dengan mengklik kotak foto pada gambar.';
			return;
		}
		const guideOk = ratioMatches(draft.width, draft.height, placeholders.length);
		const formatMatch = detectFormat(draft.width, draft.height);
		if (!guideOk && !formatMatch) {
			const guide = sizeGuideFor(placeholders.length);
			error = guide
				? `Rasio ${draft.width} × ${draft.height} px belum sesuai. Gunakan ${guide.width} × ${guide.height} px (${guide.cm} cm) atau lihat Panduan Ukuran.`
				: `Rasio ${draft.width} × ${draft.height} px belum sesuai dengan standar cetak.`;
			return;
		}
		const matchedFormat =
			formatMatch && formatMatch.photos.includes(placeholders.length) ? formatMatch : null;

		const name = frameName.trim() || draft.sourceName;
		const now = Date.now();

		busy = true;
		error = null;
		try {
			// Lubangi piksel persis mengikuti bentuk Magic Wand agar sudut membulat & stiker tetap utuh
			const artworkDataUrl = await eraseWandRegions(draft.dataUrl, placeholders);

			const frame: PhotoFrame = {
				id: newId(),
				name,
				slotCount: placeholders.length,
				designWidth: draft.width,
				designHeight: draft.height,
				artworkDataUrl,
				slots: boxesToSlots(placeholders),
				focal: 'center',
				source: 'upload',
				formatId: matchedFormat?.id ?? null,
				createdAt: now,
				updatedAt: now
			};

			await saveFrame(frame);
			frames = await listFrames();
			notice = `Frame "${name}" tersimpan dan siap dipakai di Photobooth.`;
			draft = null;
			frameName = '';
		} catch (err) {
			console.error('Frame save failed:', err);
			error = 'Gagal menyimpan frame. Penyimpanan peramban mungkin penuh.';
		} finally {
			busy = false;
		}
	}

	async function handleDelete(frame: PhotoFrame): Promise<void> {
		deletingId = frame.id;
		error = null;
		notice = null;
		try {
			await deleteFrame(frame.id);
			frames = await listFrames();
			confirmDeleteId = null;
			if (detailFrame?.id === frame.id) {
				closeDetail();
			}
			notice = `Frame "${frame.name}" dihapus.`;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Gagal menghapus frame.';
		} finally {
			deletingId = null;
		}
	}

	function openSavedDetail(frame: PhotoFrame): void {
		detailFrame = frame;
		detailIsDraft = false;
		detailMode = 'simulasi';
		detailRename = frame.name;
		detailConfirmDelete = false;
	}

	async function openDraftDetail(): Promise<void> {
		if (!draft || draft.slots.length === 0 || busy || detailBusy) return;
		detailBusy = true;
		error = null;
		try {
			const artworkDataUrl = await eraseWandRegions(draft.dataUrl, draft.slots);
			const fmt = detectFormat(draft.width, draft.height);
			const matchedFormat = fmt && fmt.photos.includes(draft.slots.length) ? fmt : null;
			const now = Date.now();
			detailFrame = {
				id: 'draft-preview',
				name: frameName.trim() || draft.sourceName,
				slotCount: draft.slots.length,
				designWidth: draft.width,
				designHeight: draft.height,
				artworkDataUrl,
				slots: boxesToSlots(draft.slots),
				focal: 'center',
				source: 'upload',
				formatId: matchedFormat?.id ?? null,
				createdAt: now,
				updatedAt: now
			};
			detailIsDraft = true;
			detailMode = 'simulasi';
			detailConfirmDelete = false;
		} catch (e) {
			console.error('Draft preview failed:', e);
			error = 'Gagal membuat pratinjau detail frame.';
		} finally {
			detailBusy = false;
		}
	}

	function closeDetail(): void {
		detailFrame = null;
		detailIsDraft = false;
		detailConfirmDelete = false;
	}

	async function handleDetailRename(e: SubmitEvent): Promise<void> {
		e.preventDefault();
		if (!detailFrame || detailIsDraft || detailRenaming) return;
		const nextName = detailRename.trim();
		if (!nextName || nextName === detailFrame.name) return;
		detailRenaming = true;
		error = null;
		try {
			const updated: PhotoFrame = {
				...detailFrame,
				name: nextName,
				updatedAt: Date.now()
			};
			await saveFrame(updated);
			frames = await listFrames();
			detailFrame = updated;
			notice = `Nama frame diperbarui menjadi "${nextName}".`;
		} catch (err) {
			error = err instanceof Error ? err.message : 'Gagal memperbarui nama frame.';
		} finally {
			detailRenaming = false;
		}
	}

	function downloadArtwork(frame: PhotoFrame): void {
		const slug = frame.name
			.trim()
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-|-$/g, '');
		const a = document.createElement('a');
		a.href = frame.artworkDataUrl;
		a.download = `${slug || 'frame'}.png`;
		document.body.appendChild(a);
		a.click();
		a.remove();
	}

	function formatRatio(w: number, h: number): string {
		if (!w || !h) return '—';
		if (w >= h) return `${(w / h).toFixed(2)} : 1`;
		return `1 : ${(h / w).toFixed(2)}`;
	}

	function formatDetailDate(ts: number): string {
		try {
			return new Intl.DateTimeFormat('id-ID', {
				day: '2-digit',
				month: 'short',
				year: 'numeric',
				hour: '2-digit',
				minute: '2-digit'
			}).format(new Date(ts));
		} catch {
			return '—';
		}
	}

	async function copyDimension(key: string, w: number, h: number): Promise<void> {
		try {
			await navigator.clipboard.writeText(`${w} x ${h}`);
			copiedDimKey = key;
			setTimeout(() => {
				if (copiedDimKey === key) copiedDimKey = null;
			}, 1800);
		} catch {
			// abaikan bila clipboard ditolak
		}
	}

	function handleWindowKeydown(e: KeyboardEvent): void {
		if (e.key === 'Escape') {
			if (detailFrame) {
				closeDetail();
			} else if (showGuide) {
				showGuide = false;
			}
		}
	}

	function newId(): string {
		if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
		return `frame-${Date.now()}-${Math.round(Math.random() * 1e6)}`;
	}
</script>

<svelte:window onkeydown={handleWindowKeydown} />

<input
	bind:this={fileInput}
	type="file"
	class="fs-file-hidden"
	accept="image/png,image/svg+xml,image/jpeg,image/webp,.png,.svg,.jpg,.jpeg,.webp"
	onchange={handleInputChange}
	disabled={busy}
/>

{#snippet studioContent()}
	<div class="fs-page">
		{#if embedded}
			<header class="fs-head">
				<div class="fs-head-copy">
					<h1 class="fs-title">Frame Studio</h1>
					<p class="fs-sub">Kelola template frame strip yang tampil di Photobooth.</p>
				</div>

				<div class="fs-head-actions">
					<button type="button" class="fs-btn" onclick={() => (showGuide = true)}>
						<Ruler size={14} />
						Panduan Ukuran
					</button>
				</div>
			</header>
		{/if}

		{#if error}
			<div class="d-banner d-banner-err" role="alert"><span>{error}</span></div>
		{/if}
		{#if notice}
			<div class="d-banner d-banner-ok" role="status"><span>{notice}</span></div>
		{/if}

		{#if draft}
			<!-- ═══ MODE EDITOR SLOT (Fokus & Minimalis) ═══ -->
			<section class="d-card fs-editor" aria-label="Editor slot frame">
				<div class="fs-editor-top">
					<button type="button" class="fs-back-btn" onclick={resetDraft} disabled={busy}>
						<ArrowLeft size={14} />
						Kembali
					</button>
					<span class="fs-editor-dim d-num">
						{draft.width} × {draft.height} px · {placeholderCount} slot aktif
					</span>
					<button type="button" class="fs-sm-btn" onclick={openFilePicker} disabled={busy}>
						Ganti File
					</button>
				</div>

				<div class="fs-editor-body">
					<!-- Kiri: Kanvas Magic Wand -->
					<div class="fs-stage-col">
						<div class="frame-stage d-checker">
							<div class="preview-canvas-box">
								<button
									type="button"
									class="wand-hit"
									onclick={handleWandClick}
									disabled={wandBusy || busy}
									aria-label="Klik area foto pada gambar untuk memilih slot dengan Magic Wand"
								>
									<img class="preview-img" src={draft.dataUrl} alt="Pratinjau frame" />
								</button>
								{#each draft.slots as slot, i (i)}
									{#if slot.maskDataUrl}
										<img
											class="wand-mask-layer"
											src={slot.maskDataUrl}
											alt=""
											aria-hidden="true"
											draggable="false"
										/>
									{:else}
										<div
											class="slot-fallback"
											aria-hidden="true"
											style="left:{slot.x * 100}%; top:{slot.y * 100}%; width:{slot.width *
												100}%; height:{slot.height * 100}%;"
										></div>
									{/if}
									<button
										type="button"
										class="slot-pin d-num"
										style="left:{slot.cx * 100}%; top:{slot.cy * 100}%;"
										onclick={() => removeSlot(i)}
										title="Klik untuk menghapus slot {i + 1}"
										aria-label="Hapus slot foto {i + 1}"
									>
										<span class="slot-pin-num">{i + 1}</span>
										<span class="slot-pin-del" aria-hidden="true"><X size={13} /></span>
									</button>
								{/each}
							</div>
						</div>
						<p class="fs-hint">
							<Wand2 size={12} />
							<strong>Magic Wand:</strong> klik area kotak foto untuk memilih (mengikuti sudut membulat
							&amp; stiker), klik nomor slot untuk menghapus.
						</p>
					</div>

					<!-- Kanan: Panel Pengaturan Ringkas -->
					<form class="fs-form-rail" onsubmit={handleSave}>
						<div class="fs-field">
							<label class="fs-label" for="draft-frame-name">Nama Frame</label>
							<input
								id="draft-frame-name"
								type="text"
								class="fs-input"
								bind:value={frameName}
								placeholder="Contoh: Classic White 4R"
								maxlength="60"
								required
							/>
						</div>

						<div class="fs-field">
							<div class="fs-slot-row">
								<label class="fs-label" for="wand-tol">Toleransi Magic Wand</label>
								<span class="fs-label d-num">{wandTolerance}</span>
							</div>
							<input
								id="wand-tol"
								type="range"
								min="8"
								max="72"
								step="2"
								class="fs-range"
								bind:value={wandTolerance}
							/>
						</div>

						<div class="fs-slot-row">
							<span class="fs-label d-num">
								{placeholderCount} slot terpilih{draft.trimmed ? ' · Margin dipotong' : ''}
							</span>
							{#if placeholderCount > 0}
								<button type="button" class="fs-link-btn" onclick={clearAllSlots}>
									Bersihkan
								</button>
							{/if}
						</div>

						{#if draftValidation}
							<div
								class="fs-status"
								class:is-ok={draftValidation.ok}
								class:is-warn={!draftValidation.ok}
							>
								{#if draftValidation.ok}
									<CheckCircle2 size={15} />
									<span>
										{draftValidation.matchedFormat
											? `Cocok · ${draftValidation.matchedFormat.label}`
											: `Rasio cocok untuk ${placeholderCount} foto`}
									</span>
								{:else}
									<AlertTriangle size={15} />
									<span class="d-num">
										{draftValidation.guide
											? `Rasio tidak cocok · Gunakan ${draftValidation.guide.width} × ${draftValidation.guide.height} px`
											: 'Rasio tidak sesuai standar cetak'}
									</span>
								{/if}
							</div>
						{/if}

						<div class="fs-form-foot">
							<button
								type="button"
								class="fs-btn is-full"
								onclick={openDraftDetail}
								disabled={busy || detailBusy || placeholderCount === 0}
							>
								<Eye size={14} />
								{detailBusy ? 'Menyiapkan Pratinjau…' : 'Cek Detail'}
							</button>
							<button
								type="submit"
								class="fs-btn is-primary is-full"
								disabled={busy || placeholderCount === 0}
							>
								{busy ? 'Menyimpan…' : 'Simpan Frame'}
							</button>
						</div>
					</form>
				</div>
			</section>
		{:else if loading}
			<div class="fs-grid">
				{#each Array(4) as _, idx (idx)}
					<div class="fs-skel"></div>
				{/each}
			</div>
		{:else if frames.length === 0}
			<!-- ═══ EMPTY STATE MINIMALIS (Langsung Siap Unggah) ═══ -->
			<section class="fs-empty-wrap" aria-label="Unggah frame pertama">
				<button
					type="button"
					class="fs-dropzone"
					class:is-dragging={dragging}
					onclick={openFilePicker}
					ondragover={handleDragOver}
					ondragleave={handleDragLeave}
					ondrop={handleDrop}
					disabled={busy}
				>
					<span class="fs-drop-icon" aria-hidden="true">
						{#if busy}
							<span class="fs-spin"><RefreshCw size={20} /></span>
						{:else}
							<Upload size={20} />
						{/if}
					</span>
					<span class="fs-drop-title">
						{busy ? 'Mendeteksi slot foto…' : 'Unggah desain frame pertama'}
					</span>
					<span class="fs-drop-desc">
						Seret berkas <strong>PNG transparan</strong>, SVG, JPEG, atau WebP dari Canva ke sini.
						Lubang foto akan terdeteksi otomatis.
					</span>
					<span class="fs-drop-cta">Pilih Berkas</span>
				</button>
			</section>
		{:else}
			<!-- ═══ KOLEKSI FRAME (Galeri Bersih + Filter Minimalis) ═══ -->
			<div class="fs-toolbar">
				<div class="fs-search">
					<Search size={14} />
					<input
						type="search"
						class="fs-search-input"
						placeholder="Cari frame…"
						bind:value={query}
						aria-label="Cari frame"
					/>
				</div>

				<div class="fs-slot-pills" role="group" aria-label="Filter jumlah foto">
					<button
						type="button"
						class="fs-pill-btn"
						class:is-active={slotFilter === 'all'}
						onclick={() => (slotFilter = 'all')}
					>
						Semua ({frames.length})
					</button>
					{#each [1, 2, 3, 4, 5, 6] as n (n)}
						{#if frames.some((f) => f.slotCount === n)}
							<button
								type="button"
								class="fs-pill-btn d-num"
								class:is-active={slotFilter === n}
								onclick={() => (slotFilter = n)}
							>
								{n} Foto
							</button>
						{/if}
					{/each}
				</div>
			</div>

			<section class="fs-grid" aria-label="Koleksi frame">
				<!-- Kartu Tambah Cepat (mendukung drag & drop langsung) -->
				<button
					type="button"
					class="fs-add-tile"
					class:is-dragging={dragging}
					onclick={openFilePicker}
					ondragover={handleDragOver}
					ondragleave={handleDragLeave}
					ondrop={handleDrop}
					disabled={busy}
				>
					<span class="fs-add-circle" aria-hidden="true">
						{#if busy}
							<span class="fs-spin"><RefreshCw size={18} /></span>
						{:else}
							<Plus size={18} />
						{/if}
					</span>
					<span class="fs-add-title">{busy ? 'Memproses…' : 'Tambah Frame'}</span>
					<span class="fs-add-sub">Klik atau seret PNG / SVG</span>
				</button>

				{#each filteredFrames as frame (frame.id)}
					{@const fmtLabel = formats.find((f) => f.id === frame.formatId)?.label}
					<article class="fs-card">
						<button
							type="button"
							class="fs-card-media d-checker"
							onclick={() => openSavedDetail(frame)}
							aria-label="Cek detail frame {frame.name}"
						>
							<img src={frame.artworkDataUrl} alt={frame.name} loading="lazy" />
							<span class="fs-card-badge d-num">{frame.slotCount} foto</span>
							<span class="fs-card-inspect" aria-hidden="true">
								<Eye size={12} />
								Cek Detail
							</span>
						</button>

						<div class="fs-card-foot">
							<button type="button" class="fs-card-info" onclick={() => openSavedDetail(frame)}>
								<h2 class="fs-card-name" title={frame.name}>{frame.name}</h2>
								<p class="fs-card-meta d-num">
									{fmtLabel ? `${fmtLabel} · ` : ''}{frame.designWidth} × {frame.designHeight}
								</p>
							</button>

							{#if confirmDeleteId === frame.id}
								<div class="fs-confirm">
									<button
										type="button"
										class="fs-sm-btn is-danger-solid"
										disabled={deletingId === frame.id}
										onclick={() => handleDelete(frame)}
									>
										Hapus
									</button>
									<button
										type="button"
										class="fs-sm-btn"
										disabled={deletingId === frame.id}
										onclick={() => (confirmDeleteId = null)}
									>
										Batal
									</button>
								</div>
							{:else}
								<button
									type="button"
									class="fs-del-icon"
									onclick={() => (confirmDeleteId = frame.id)}
									title="Hapus frame"
									aria-label="Hapus frame {frame.name}"
								>
									<Trash2 size={14} />
								</button>
							{/if}
						</div>
					</article>
				{/each}
			</section>
		{/if}
	</div>
{/snippet}

<!-- Modal Check Detail Frame (Simulasi Foto + Artwork PNG + Spesifikasi) -->
{#if detailFrame}
	{@const detailFmtLabel =
		formats.find((f) => f.id === detailFrame?.formatId)?.label ??
		detectFormat(detailFrame.designWidth, detailFrame.designHeight)?.label ??
		'Kustom'}
	<div class="fs-modal" role="dialog" aria-modal="true" aria-label="Detail frame">
		<button
			type="button"
			class="fs-modal-backdrop"
			aria-label="Tutup detail frame"
			onclick={closeDetail}
		></button>
		<div class="d-card fs-det-modal-box">
			<div class="fs-modal-head">
				<div class="fs-det-head-copy">
					<h2 class="fs-modal-title">
						{detailIsDraft ? `Pratinjau · ${detailFrame.name}` : detailFrame.name}
					</h2>
					<p class="fs-modal-sub d-num">
						{detailFrame.slotCount} slot foto · {detailFrame.designWidth} × {detailFrame.designHeight}
						px · {detailFmtLabel}
					</p>
				</div>
				<button type="button" class="fs-icon-close" onclick={closeDetail} aria-label="Tutup">
					<X size={15} />
				</button>
			</div>

			<div class="fs-det-body">
				<!-- Kiri: Pratinjau Besar (Simulasi Foto / Transparansi PNG) -->
				<div class="fs-det-stage-col">
					<div class="fs-det-controls">
						<div class="fs-seg" role="group" aria-label="Mode tampilan pratinjau">
							<button
								type="button"
								class="fs-seg-btn"
								class:is-active={detailMode === 'simulasi'}
								onclick={() => (detailMode = 'simulasi')}
							>
								Simulasi Foto
							</button>
							<button
								type="button"
								class="fs-seg-btn"
								class:is-active={detailMode === 'artwork'}
								onclick={() => (detailMode = 'artwork')}
							>
								Artwork PNG
							</button>
						</div>
					</div>

					<div class="fs-det-stage d-checker">
						<div class="fs-det-canvas">
							{#if detailMode === 'simulasi'}
								{#each detailFrame.slots as slot, i (slot.id)}
									<div
										class="fs-sim-photo"
										style="left:{slot.x * 100}%; top:{slot.y * 100}%; width:{slot.width *
											100}%; height:{slot.height * 100}%; background:{SIM_GRADIENTS[
											i % SIM_GRADIENTS.length
										]};"
										aria-hidden="true"
									></div>
								{/each}
							{/if}

							<img class="fs-det-img" src={detailFrame.artworkDataUrl} alt={detailFrame.name} />
						</div>
					</div>
				</div>

				<!-- Kanan: Spesifikasi & Aksi -->
				<aside class="fs-det-rail">
					{#if !detailIsDraft}
						<form class="fs-field" onsubmit={handleDetailRename}>
							<label class="fs-label" for="det-frame-name">Nama Frame</label>
							<div class="fs-det-rename-row">
								<input
									id="det-frame-name"
									type="text"
									class="fs-input"
									bind:value={detailRename}
									maxlength="60"
									required
								/>
								<button
									type="submit"
									class="fs-btn"
									disabled={detailRenaming ||
										!detailRename.trim() ||
										detailRename.trim() === detailFrame.name}
								>
									{detailRenaming ? '…' : 'Ubah'}
								</button>
							</div>
						</form>
					{/if}

					<div class="fs-det-section">
						<p class="fs-guide-label">Spesifikasi</p>
						<dl class="fs-det-specs">
							<div class="fs-det-spec-row">
								<dt>Format</dt>
								<dd>{detailFmtLabel}</dd>
							</div>
							<div class="fs-det-spec-row">
								<dt>Dimensi</dt>
								<dd class="d-num">
									{detailFrame.designWidth} × {detailFrame.designHeight} px
								</dd>
							</div>
							<div class="fs-det-spec-row">
								<dt>Rasio</dt>
								<dd class="d-num">
									{formatRatio(detailFrame.designWidth, detailFrame.designHeight)}
								</dd>
							</div>
							<div class="fs-det-spec-row">
								<dt>Jumlah Slot</dt>
								<dd class="d-num">{detailFrame.slotCount} foto</dd>
							</div>
							{#if !detailIsDraft}
								<div class="fs-det-spec-row">
									<dt>Diperbarui</dt>
									<dd class="d-num">{formatDetailDate(detailFrame.updatedAt)}</dd>
								</div>
							{/if}
						</dl>
					</div>

					<div class="fs-det-section">
						<p class="fs-guide-label">Ukuran Slot Foto</p>
						<div class="fs-det-slots">
							{#each detailFrame.slots as slot, i (slot.id)}
								{@const sw = Math.round(slot.width * detailFrame.designWidth)}
								{@const sh = Math.round(slot.height * detailFrame.designHeight)}
								<div class="fs-det-slot-chip d-num">
									<span>Slot {i + 1}</span>
									<strong>{sw} × {sh} px</strong>
								</div>
							{/each}
						</div>
					</div>

					<div class="fs-det-actions">
						<button
							type="button"
							class="fs-btn is-full"
							onclick={() => detailFrame && downloadArtwork(detailFrame)}
						>
							<Download size={14} />
							Unduh PNG Transparan
						</button>

						{#if !detailIsDraft}
							{#if detailConfirmDelete}
								<div class="fs-det-del-confirm">
									<button
										type="button"
										class="fs-sm-btn is-danger-solid"
										disabled={deletingId === detailFrame.id}
										onclick={() => detailFrame && handleDelete(detailFrame)}
									>
										Konfirmasi Hapus
									</button>
									<button
										type="button"
										class="fs-sm-btn"
										disabled={deletingId === detailFrame.id}
										onclick={() => (detailConfirmDelete = false)}
									>
										Batal
									</button>
								</div>
							{:else}
								<button
									type="button"
									class="fs-btn is-danger-ghost is-full"
									onclick={() => (detailConfirmDelete = true)}
								>
									<Trash2 size={14} />
									Hapus Frame
								</button>
							{/if}
						{:else}
							<button type="button" class="fs-btn is-primary is-full" onclick={closeDetail}>
								Kembali ke Editor
							</button>
						{/if}
					</div>
				</aside>
			</div>
		</div>
	</div>
{/if}

<!-- Modal Panduan Ukuran Kanvas (Hanya muncul saat dibutuhkan) -->
{#if showGuide}
	<div class="fs-modal" role="dialog" aria-modal="true" aria-label="Panduan ukuran kanvas">
		<button
			type="button"
			class="fs-modal-backdrop"
			aria-label="Tutup panduan"
			onclick={() => (showGuide = false)}
		></button>
		<div class="d-card fs-modal-box">
			<div class="fs-modal-head">
				<div>
					<h2 class="fs-modal-title">Panduan Ukuran Kanvas (300 DPI)</h2>
					<p class="fs-modal-sub">Klik ukuran piksel untuk menyalin ke Canva.</p>
				</div>
				<button
					type="button"
					class="fs-icon-close"
					onclick={() => (showGuide = false)}
					aria-label="Tutup"
				>
					<X size={15} />
				</button>
			</div>

			<div class="fs-modal-body">
				<div class="fs-guide-sec">
					<p class="fs-guide-label">Strip (1–6 Foto)</p>
					<div class="fs-guide-rows">
						{#each FRAME_SIZE_GUIDES as guide (guide.slotCount)}
							{@const key = `s-${guide.slotCount}`}
							<div class="fs-guide-row">
								<span class="fs-guide-name"
									>{guide.slotCount} Foto <small>({guide.cm} cm)</small></span
								>
								<button
									type="button"
									class="fs-copy-btn d-num"
									onclick={() => copyDimension(key, guide.width, guide.height)}
								>
									{#if copiedDimKey === key}
										<Check size={12} /> Tersalin
									{:else}
										<Copy size={12} /> {guide.width} × {guide.height}
									{/if}
								</button>
							</div>
						{/each}
					</div>
				</div>

				<div class="fs-guide-sec">
					<div class="fs-guide-sec-head">
						<p class="fs-guide-label">Format Standar &amp; Kustom</p>
						<a class="fs-link-btn" href="/dashboard/assets/frame-sizes">Kelola Ukuran</a>
					</div>
					<div class="fs-guide-rows">
						{#each formats as fmt (fmt.id)}
							{@const key = `f-${fmt.id}`}
							<div class="fs-guide-row">
								<span class="fs-guide-name">{fmt.label} <small>({fmt.cm})</small></span>
								<button
									type="button"
									class="fs-copy-btn d-num"
									onclick={() => copyDimension(key, fmt.pxW, fmt.pxH)}
								>
									{#if copiedDimKey === key}
										<Check size={12} /> Tersalin
									{:else}
										<Copy size={12} /> {fmt.pxW} × {fmt.pxH}
									{/if}
								</button>
							</div>
						{/each}
					</div>
				</div>
			</div>
		</div>
	</div>
{/if}

{#if embedded}
	{@render studioContent()}
{:else}
	<div class="dash-shell" class:theme-light={isLight}>
		<header class="standalone-bar">
			<div class="standalone-inner">
				<h1 class="standalone-title">Frame Studio</h1>
				<div class="fs-head-actions">
					<button type="button" class="fs-btn" onclick={() => (showGuide = true)}>
						<Ruler size={14} />
						Panduan Ukuran
					</button>
					<button type="button" class="fs-btn is-primary" onclick={openFilePicker} disabled={busy}>
						<Plus size={15} />
						Tambah Frame
					</button>
					<a class="fs-btn" href="/dashboard">Dashboard</a>
					<ThemeToggle inline />
				</div>
			</div>
		</header>
		<div class="standalone-main">
			{@render studioContent()}
		</div>
	</div>
{/if}

<style>
	.fs-file-hidden {
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

	.fs-page {
		display: flex;
		flex-direction: column;
		gap: 18px;
	}

	/* ── Header Minimalis ── */
	.fs-head {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		justify-content: space-between;
		gap: 12px 18px;
	}

	.fs-head-copy {
		min-width: 0;
		flex: 1 1 240px;
	}

	.fs-title {
		margin: 0;
		font-size: clamp(1.4rem, 2vw, 1.7rem);
		font-weight: 800;
		letter-spacing: -0.025em;
		line-height: 1.15;
		color: var(--d-ink);
	}

	.fs-sub {
		margin: 4px 0 0;
		font-size: 0.82rem;
		color: var(--d-muted);
	}

	.fs-head-actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
		flex-shrink: 0;
	}

	/* ── Tombol Seragam ── */
	.fs-btn {
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
		text-decoration: none;
		white-space: nowrap;
		cursor: pointer;
		transition:
			background-color 140ms ease,
			border-color 140ms ease,
			opacity 140ms ease;
	}

	.fs-btn:hover:not(:disabled) {
		background: var(--d-surface-2);
		border-color: var(--d-border-strong);
	}

	.fs-btn:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}

	.fs-btn.is-primary {
		border-color: var(--d-ink);
		background: var(--d-ink);
		color: var(--d-bg);
	}

	.fs-btn.is-primary:hover:not(:disabled) {
		opacity: 0.9;
		background: var(--d-ink);
	}

	.fs-btn.is-full {
		width: 100%;
	}

	.fs-btn.is-danger-ghost {
		color: var(--d-err);
		border-color: color-mix(in srgb, var(--d-err) 30%, var(--d-border));
	}

	.fs-btn.is-danger-ghost:hover:not(:disabled) {
		background: var(--d-err-soft);
		border-color: var(--d-err);
	}

	.fs-sm-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 5px;
		height: 29px;
		padding: 0 10px;
		border: 1px solid var(--d-border);
		border-radius: 7px;
		background: var(--d-surface-2);
		color: var(--d-ink);
		font-family: var(--font-body);
		font-size: 0.72rem;
		font-weight: 700;
		cursor: pointer;
		white-space: nowrap;
	}

	.fs-sm-btn:hover:not(:disabled) {
		background: var(--d-surface-hover);
		border-color: var(--d-border-strong);
	}

	.fs-sm-btn.is-danger-solid {
		border-color: var(--d-err);
		background: var(--d-err);
		color: #ffffff;
	}

	.fs-link-btn {
		border: none;
		padding: 0;
		background: transparent;
		color: var(--d-ink);
		font-family: var(--font-body);
		font-size: 0.73rem;
		font-weight: 700;
		text-decoration: none;
		cursor: pointer;
	}

	.fs-link-btn:hover {
		text-decoration: underline;
	}

	/* ── Empty State Minimalis ── */
	.fs-empty-wrap {
		display: flex;
		justify-content: center;
	}

	.fs-dropzone {
		width: 100%;
		min-height: 300px;
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

	.fs-dropzone:hover:not(:disabled),
	.fs-dropzone.is-dragging {
		border-color: var(--d-ink);
		background: var(--d-surface-2);
	}

	.fs-drop-icon {
		width: 48px;
		height: 48px;
		border-radius: 14px;
		border: 1px solid var(--d-border);
		background: var(--d-bg);
		color: var(--d-ink);
		display: grid;
		place-items: center;
	}

	.fs-drop-title {
		font-size: 0.96rem;
		font-weight: 800;
		color: var(--d-ink);
	}

	.fs-drop-desc {
		max-width: 42ch;
		font-size: 0.8rem;
		line-height: 1.5;
		color: var(--d-muted);
	}

	.fs-drop-desc strong {
		color: var(--d-ink);
	}

	.fs-drop-cta {
		margin-top: 6px;
		padding: 8px 18px;
		border-radius: 9px;
		background: var(--d-ink);
		color: var(--d-bg);
		font-size: 0.76rem;
		font-weight: 700;
	}

	.fs-spin {
		display: inline-grid;
		animation: fsSpin 900ms linear infinite;
	}

	@keyframes fsSpin {
		to {
			transform: rotate(360deg);
		}
	}

	/* ── Editor Slot (Minimalis 2-Kolom) ── */
	.fs-editor-top {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		padding: 11px 16px;
		border-bottom: 1px solid var(--d-border);
	}

	.fs-back-btn {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		border: none;
		padding: 5px 8px;
		margin-left: -8px;
		border-radius: 7px;
		background: transparent;
		color: var(--d-ink);
		font-family: var(--font-body);
		font-size: 0.78rem;
		font-weight: 700;
		cursor: pointer;
	}

	.fs-back-btn:hover {
		background: var(--d-surface-2);
	}

	.fs-editor-dim {
		font-size: 0.74rem;
		font-weight: 600;
		color: var(--d-muted);
	}

	.fs-editor-body {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 280px;
		gap: 16px;
		padding: 16px;
		align-items: start;
	}

	.fs-stage-col {
		display: flex;
		flex-direction: column;
		gap: 8px;
		min-width: 0;
	}

	.frame-stage {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 18px;
		border: 1px solid var(--d-border);
		border-radius: 12px;
		min-height: 360px;
		overflow: hidden;
	}

	/* Wrapper ketat agar persentase slot-box tepat di atas lubang foto */
	.preview-canvas-box {
		position: relative;
		display: inline-block;
		max-width: 100%;
		line-height: 0;
	}

	.wand-hit {
		display: block;
		padding: 0;
		border: none;
		background: transparent;
		cursor: crosshair;
		line-height: 0;
	}

	.preview-img {
		display: block;
		max-width: 100%;
		max-height: 440px;
		width: auto;
		height: auto;
		user-select: none;
	}

	/* Overlay bentuk persis Magic Wand — mengikuti sudut membulat & stiker tanpa menghalangi klik */
	.wand-mask-layer {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		pointer-events: none;
		user-select: none;
	}

	.slot-fallback {
		position: absolute;
		border: 2px solid #2563eb;
		background: rgba(37, 99, 235, 0.28);
		border-radius: 4px;
		pointer-events: none;
	}

	.slot-pin {
		position: absolute;
		transform: translate(-50%, -50%);
		width: 28px;
		height: 28px;
		padding: 0;
		border: 2px solid #ffffff;
		border-radius: 999px;
		background: #2563eb;
		color: #ffffff;
		font-size: 0.76rem;
		font-weight: 800;
		display: grid;
		place-items: center;
		cursor: pointer;
		box-shadow: 0 2px 8px rgba(15, 23, 42, 0.32);
		transition:
			background-color 140ms ease,
			transform 140ms ease;
	}

	.slot-pin:hover {
		background: var(--d-err);
		transform: translate(-50%, -50%) scale(1.08);
	}

	.slot-pin-del {
		display: none;
	}

	.slot-pin:hover .slot-pin-num {
		display: none;
	}

	.slot-pin:hover .slot-pin-del {
		display: inline-grid;
		place-items: center;
	}

	.fs-hint {
		margin: 0;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 5px;
		font-size: 0.73rem;
		color: var(--d-muted);
		text-align: center;
	}

	.fs-range {
		width: 100%;
		accent-color: var(--d-ink);
		cursor: pointer;
	}

	.fs-form-rail {
		display: flex;
		flex-direction: column;
		gap: 14px;
		padding: 14px;
		border: 1px solid var(--d-border);
		border-radius: 12px;
		background: var(--d-bg);
	}

	.fs-field {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.fs-label {
		font-size: 0.72rem;
		font-weight: 700;
		color: var(--d-muted);
	}

	.fs-input {
		height: 36px;
		padding: 0 11px;
		border: 1px solid var(--d-border);
		border-radius: 9px;
		background: var(--d-surface);
		color: var(--d-ink);
		font-family: var(--font-body);
		font-size: 0.8rem;
		font-weight: 600;
		outline: none;
	}

	.fs-input:focus {
		border-color: var(--d-border-strong);
	}

	.fs-slot-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		padding-top: 2px;
	}

	.fs-status {
		display: flex;
		align-items: flex-start;
		gap: 8px;
		padding: 9px 11px;
		border-radius: 9px;
		font-size: 0.73rem;
		font-weight: 600;
		line-height: 1.4;
	}

	.fs-status.is-ok {
		background: var(--d-ok-soft);
		color: var(--d-ok);
	}

	.fs-status.is-warn {
		background: var(--d-warn-soft);
		color: var(--d-warn);
	}

	.fs-form-foot {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding-top: 8px;
		border-top: 1px solid var(--d-border);
	}

	/* ── Galeri Koleksi Minimalis ── */
	.fs-toolbar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
	}

	.fs-search {
		position: relative;
		display: flex;
		align-items: center;
		flex: 1 1 200px;
		max-width: 300px;
		color: var(--d-muted);
	}

	.fs-search :global(svg) {
		position: absolute;
		left: 11px;
		pointer-events: none;
	}

	.fs-search-input {
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

	.fs-slot-pills {
		display: flex;
		flex-wrap: wrap;
		gap: 5px;
	}

	.fs-pill-btn {
		height: 30px;
		padding: 0 10px;
		border: 1px solid var(--d-border);
		border-radius: 8px;
		background: var(--d-surface);
		color: var(--d-muted);
		font-family: var(--font-body);
		font-size: 0.72rem;
		font-weight: 700;
		cursor: pointer;
	}

	.fs-pill-btn:hover:not(.is-active) {
		color: var(--d-ink);
		border-color: var(--d-border-strong);
	}

	.fs-pill-btn.is-active {
		border-color: var(--d-ink);
		background: var(--d-ink);
		color: var(--d-bg);
	}

	.fs-grid {
		display: grid;
		gap: 12px;
		grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
	}

	.fs-skel {
		height: 270px;
		border-radius: 14px;
		background: var(--d-surface-2);
	}

	.fs-add-tile {
		min-height: 268px;
		padding: 20px;
		border: 1.5px dashed var(--d-border-strong);
		border-radius: 14px;
		background: transparent;
		color: var(--d-ink);
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 8px;
		text-align: center;
		cursor: pointer;
		transition:
			border-color 140ms ease,
			background-color 140ms ease;
	}

	.fs-add-tile:hover:not(:disabled),
	.fs-add-tile.is-dragging {
		border-color: var(--d-ink);
		background: var(--d-surface);
	}

	.fs-add-circle {
		width: 40px;
		height: 40px;
		border-radius: 999px;
		border: 1px solid var(--d-border);
		background: var(--d-surface);
		display: grid;
		place-items: center;
	}

	.fs-add-title {
		font-size: 0.82rem;
		font-weight: 800;
	}

	.fs-add-sub {
		font-size: 0.72rem;
		color: var(--d-muted);
	}

	.fs-card {
		display: flex;
		flex-direction: column;
		border: 1px solid var(--d-border);
		border-radius: 14px;
		background: var(--d-surface);
		overflow: hidden;
		transition: border-color 140ms ease;
	}

	.fs-card:hover {
		border-color: var(--d-border-strong);
	}

	.fs-card-media {
		position: relative;
		width: 100%;
		height: 208px;
		padding: 12px;
		border: none;
		border-bottom: 1px solid var(--d-border);
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
	}

	.fs-card-media img {
		max-width: 100%;
		max-height: 100%;
		object-fit: contain;
		transition: transform 160ms ease;
	}

	.fs-card-media:hover img {
		transform: scale(1.025);
	}

	.fs-card-badge {
		position: absolute;
		top: 9px;
		left: 9px;
		padding: 2px 8px;
		border-radius: 999px;
		background: rgba(15, 23, 42, 0.74);
		color: #ffffff;
		font-size: 0.66rem;
		font-weight: 700;
	}

	.fs-card-inspect {
		position: absolute;
		right: 9px;
		bottom: 9px;
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 4px 9px;
		border-radius: 999px;
		background: rgba(15, 23, 42, 0.8);
		color: #ffffff;
		font-size: 0.68rem;
		font-weight: 700;
		opacity: 0;
		transform: translateY(3px);
		transition:
			opacity 140ms ease,
			transform 140ms ease;
	}

	.fs-card-media:hover .fs-card-inspect,
	.fs-card-media:focus-visible .fs-card-inspect {
		opacity: 1;
		transform: translateY(0);
	}

	.fs-card-foot {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		padding: 10px 12px;
	}

	.fs-card-info {
		min-width: 0;
		flex: 1;
		padding: 0;
		border: none;
		background: transparent;
		text-align: left;
		cursor: pointer;
	}

	.fs-card-name {
		margin: 0;
		font-size: 0.81rem;
		font-weight: 800;
		color: var(--d-ink);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.fs-card-meta {
		margin: 2px 0 0;
		font-size: 0.7rem;
		color: var(--d-muted);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.fs-confirm {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		flex-shrink: 0;
	}

	.fs-del-icon {
		width: 30px;
		height: 30px;
		border: 1px solid transparent;
		border-radius: 8px;
		background: transparent;
		color: var(--d-muted);
		display: grid;
		place-items: center;
		cursor: pointer;
		flex-shrink: 0;
	}

	.fs-del-icon:hover {
		color: var(--d-err);
		background: var(--d-err-soft);
	}

	/* ── Modal Panduan Ukuran ── */
	.fs-modal {
		position: fixed;
		inset: 0;
		z-index: 80;
		display: grid;
		place-items: center;
		padding: 18px;
	}

	.fs-modal-backdrop {
		position: absolute;
		inset: 0;
		border: none;
		background: rgba(0, 0, 0, 0.56);
		backdrop-filter: blur(4px);
		cursor: pointer;
	}

	.fs-modal-box {
		position: relative;
		z-index: 1;
		width: min(94vw, 680px);
		max-height: 86dvh;
		display: flex;
		flex-direction: column;
		box-shadow: 0 24px 60px rgba(0, 0, 0, 0.38);
	}

	.fs-modal-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 12px;
		padding: 14px 18px;
		border-bottom: 1px solid var(--d-border);
	}

	.fs-modal-title {
		margin: 0;
		font-size: 0.92rem;
		font-weight: 800;
		color: var(--d-ink);
	}

	.fs-modal-sub {
		margin: 2px 0 0;
		font-size: 0.74rem;
		color: var(--d-muted);
	}

	.fs-icon-close {
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

	.fs-modal-body {
		overflow-y: auto;
		padding: 14px 18px 18px;
		display: flex;
		flex-direction: column;
		gap: 18px;
	}

	.fs-guide-sec {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.fs-guide-sec-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
	}

	.fs-guide-label {
		margin: 0;
		font-size: 0.72rem;
		font-weight: 800;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--d-muted);
	}

	.fs-guide-rows {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 6px;
	}

	.fs-guide-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		padding: 7px 10px;
		border: 1px solid var(--d-border);
		border-radius: 9px;
		background: var(--d-bg);
	}

	.fs-guide-name {
		font-size: 0.75rem;
		font-weight: 700;
		color: var(--d-ink);
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.fs-guide-name small {
		font-weight: 500;
		color: var(--d-muted);
	}

	.fs-copy-btn {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 3px 7px;
		border: 1px solid var(--d-border);
		border-radius: 6px;
		background: var(--d-surface);
		color: var(--d-ink);
		font-family: var(--font-body);
		font-size: 0.69rem;
		font-weight: 700;
		cursor: pointer;
		white-space: nowrap;
		flex-shrink: 0;
	}

	.fs-copy-btn:hover {
		background: var(--d-surface-2);
		border-color: var(--d-border-strong);
	}

	/* ── Modal Detail Frame ── */
	.fs-det-modal-box {
		position: relative;
		z-index: 1;
		width: min(95vw, 860px);
		max-height: 90dvh;
		display: flex;
		flex-direction: column;
		box-shadow: 0 24px 64px rgba(0, 0, 0, 0.42);
	}

	.fs-det-head-copy {
		min-width: 0;
		flex: 1;
	}

	.fs-det-body {
		overflow-y: auto;
		padding: 16px 18px 18px;
		display: grid;
		grid-template-columns: minmax(0, 1fr) 292px;
		gap: 16px;
		align-items: start;
	}

	.fs-det-stage-col {
		display: flex;
		flex-direction: column;
		gap: 10px;
		min-width: 0;
	}

	.fs-det-controls {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
	}

	.fs-seg {
		display: inline-flex;
		padding: 3px;
		border: 1px solid var(--d-border);
		border-radius: 9px;
		background: var(--d-bg);
		gap: 2px;
	}

	.fs-seg-btn {
		height: 26px;
		padding: 0 11px;
		border: none;
		border-radius: 6px;
		background: transparent;
		color: var(--d-muted);
		font-family: var(--font-body);
		font-size: 0.72rem;
		font-weight: 700;
		cursor: pointer;
		transition:
			background-color 140ms ease,
			color 140ms ease;
	}

	.fs-seg-btn:hover:not(.is-active) {
		color: var(--d-ink);
	}

	.fs-seg-btn.is-active {
		background: var(--d-ink);
		color: var(--d-bg);
	}

	.fs-det-stage {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 20px;
		border: 1px solid var(--d-border);
		border-radius: 12px;
		min-height: 380px;
		overflow: hidden;
	}

	.fs-det-canvas {
		position: relative;
		display: inline-block;
		max-width: 100%;
		line-height: 0;
		box-shadow: 0 12px 32px rgba(0, 0, 0, 0.22);
	}

	.fs-sim-photo {
		position: absolute;
		z-index: 1;
		overflow: hidden;
	}

	.fs-det-img {
		position: relative;
		z-index: 2;
		display: block;
		max-width: 100%;
		max-height: 520px;
		width: auto;
		height: auto;
		user-select: none;
	}

	.fs-det-rail {
		display: flex;
		flex-direction: column;
		gap: 14px;
		padding: 14px;
		border: 1px solid var(--d-border);
		border-radius: 12px;
		background: var(--d-bg);
	}

	.fs-det-rename-row {
		display: flex;
		gap: 6px;
	}

	.fs-det-rename-row .fs-input {
		flex: 1;
		min-width: 0;
	}

	.fs-det-section {
		display: flex;
		flex-direction: column;
		gap: 7px;
	}

	.fs-det-specs {
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.fs-det-spec-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		font-size: 0.75rem;
	}

	.fs-det-spec-row dt {
		color: var(--d-muted);
		font-weight: 600;
	}

	.fs-det-spec-row dd {
		margin: 0;
		color: var(--d-ink);
		font-weight: 700;
		text-align: right;
	}

	.fs-det-slots {
		display: flex;
		flex-direction: column;
		gap: 5px;
	}

	.fs-det-slot-chip {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		padding: 6px 9px;
		border: 1px solid var(--d-border);
		border-radius: 8px;
		background: var(--d-surface);
		font-size: 0.72rem;
		color: var(--d-muted);
	}

	.fs-det-slot-chip strong {
		color: var(--d-ink);
		font-weight: 700;
	}

	.fs-det-actions {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding-top: 10px;
		border-top: 1px solid var(--d-border);
	}

	.fs-det-del-confirm {
		display: flex;
		gap: 6px;
	}

	.fs-det-del-confirm .fs-sm-btn {
		flex: 1;
		height: 34px;
	}

	/* ── Standalone Wrapper (/admin/frames) ── */
	.standalone-bar {
		position: sticky;
		top: 0;
		z-index: 20;
		border-bottom: 1px solid var(--d-border);
		background: color-mix(in srgb, var(--d-bg) 90%, transparent);
		backdrop-filter: blur(12px);
	}

	.standalone-inner {
		max-width: 1240px;
		margin: 0 auto;
		padding: 14px clamp(16px, 3vw, 32px);
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
	}

	.standalone-title {
		margin: 0;
		font-size: 1.35rem;
		font-weight: 800;
		letter-spacing: -0.02em;
		color: var(--d-ink);
	}

	.standalone-main {
		max-width: 1240px;
		margin: 0 auto;
		padding: 22px clamp(16px, 3vw, 32px) 48px;
	}

	@media (max-width: 820px) {
		.fs-editor-body,
		.fs-det-body {
			grid-template-columns: minmax(0, 1fr);
		}
	}

	@media (max-width: 600px) {
		.fs-guide-rows {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
