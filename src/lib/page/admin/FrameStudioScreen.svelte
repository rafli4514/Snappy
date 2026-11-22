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
		eraseRegions,
		sanitizeSvg,
		svgToDataUrl
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
	import type { DetectedBox } from '#lib/utils/frameDetect';
	import type { PhotoFrame } from '#lib/types';

	interface SlotCandidate {
		box: DetectedBox;
		placeholder: boolean;
	}

	interface Draft {
		dataUrl: string;
		width: number;
		height: number;
		sourceName: string;
		detectedFromDark: boolean;
		candidates: SlotCandidate[];
	}

	let { embedded = false }: { embedded?: boolean } = $props();

	let frames = $state<PhotoFrame[]>([]);
	let loading = $state(true);
	let busy = $state(false);
	let deletingId = $state<string | null>(null);
	let confirmDeleteId = $state<string | null>(null);
	let error = $state<string | null>(null);
	let notice = $state<string | null>(null);
	let draft = $state<Draft | null>(null);
	let frameName = $state('');
	let focal = $state<'center' | 'top'>('center');

	const isLight = $derived($session.theme === 'light');

	const formats = $derived.by(() => {
		void $customFrameSizes;
		return allFormats();
	});

	const placeholderNumbers = $derived.by(() => {
		const map = new Map<number, number>();
		draft?.candidates.forEach((candidate, i) => {
			if (candidate.placeholder) map.set(i, map.size + 1);
		});
		return map;
	});

	const placeholderCount = $derived(
		draft ? draft.candidates.filter((candidate) => candidate.placeholder).length : 0
	);

	const transparentCount = $derived(draft ? draft.candidates.length - placeholderCount : 0);

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

	function resetDraft(): void {
		draft = null;
		frameName = '';
		focal = 'center';
	}

	async function handleFile(event: Event): Promise<void> {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		error = null;
		notice = null;
		resetDraft();

		if (!isPngFile(file) && !isSvgFile(file) && !isJpegFile(file) && !isWebpFile(file)) {
			error = 'Format harus PNG, SVG, JPEG, atau WebP.';
			input.value = '';
			return;
		}

		busy = true;
		try {
			let dataUrl: string;
			if (isSvgFile(file)) {
				const text = await file.text();
				dataUrl = svgToDataUrl(sanitizeSvg(text));
			} else {
				dataUrl = await fileToDataUrl(file);
			}

			let result = await detectFrameSlots(dataUrl);
			let detectedFromDark = false;
			if (result.boxes.length === 0) {
				const keyed = await detectFrameSlots(dataUrl, { mode: 'key', keyColor: '#000000' });
				if (keyed.boxes.length > 0) {
					result = keyed;
					detectedFromDark = true;
				}
			}
			if (result.boxes.length === 0) {
				error =
					'Tidak ada kandidat lubang foto yang terdeteksi. Gunakan PNG berlubang transparan atau bidang foto hitam pekat.';
				return;
			}
			if (result.boxes.length > 6) {
				error = `Frame memiliki ${result.boxes.length} kandidat lubang. Maksimal 6 foto per strip.`;
				return;
			}

			const baseName = file.name.replace(/\.(png|svg|jpe?g|webp)$/i, '');
			draft = {
				dataUrl,
				width: result.width,
				height: result.height,
				sourceName: baseName,
				detectedFromDark,
				candidates: result.boxes.map((box) => ({ box, placeholder: false }))
			};
			frameName = baseName;
		} catch (e) {
			console.error('Frame upload failed:', e);
			error = 'Gagal membaca artwork. Coba ekspor ulang berkas dari Canva.';
		} finally {
			busy = false;
			input.value = '';
		}
	}

	function toggleCandidate(index: number): void {
		if (!draft) return;
		draft = {
			...draft,
			candidates: draft.candidates.map((candidate, i) =>
				i === index ? { ...candidate, placeholder: !candidate.placeholder } : candidate
			)
		};
	}

	function setAllCandidates(placeholder: boolean): void {
		if (!draft) return;
		draft = {
			...draft,
			candidates: draft.candidates.map((candidate) => ({ ...candidate, placeholder }))
		};
	}

	async function handleSave(e: SubmitEvent): Promise<void> {
		e.preventDefault();
		if (!draft || busy) return;
		const candidates = draft.candidates;
		const placeholders = candidates.filter((candidate) => candidate.placeholder).map((c) => c.box);
		if (placeholders.length === 0) {
			error = 'Pilih minimal satu slot placeholder terlebih dahulu.';
			return;
		}
		const guideOk = ratioMatches(draft.width, draft.height, placeholders.length);
		const formatMatch = detectFormat(draft.width, draft.height);
		if (!guideOk && !formatMatch) {
			const guide = sizeGuideFor(placeholders.length);
			error = guide
				? `Rasio artwork ${draft.width} × ${draft.height} px tidak cocok. Gunakan ukuran ${guide.width} × ${guide.height} px (${guide.cm} cm) atau salah satu format pada Katalog Ukuran Frame.`
				: `Rasio artwork ${draft.width} × ${draft.height} px tidak cocok dengan ukuran kustom maupun format standar.`;
			return;
		}
		const matchedFormat =
			formatMatch && formatMatch.photos.includes(placeholders.length) ? formatMatch : null;

		const name = frameName.trim() || draft.sourceName;
		const now = Date.now();

		busy = true;
		error = null;
		try {
			const erasedBoxes = candidates.filter((c) => !c.placeholder).map((c) => c.box);
			const allBoxes = candidates.map((c) => c.box);
			const detectedFromDark = draft.detectedFromDark;
			const isOpaque =
				draft.dataUrl.startsWith('data:image/jpeg') || draft.dataUrl.startsWith('data:image/webp');
			const needFlatten = isOpaque || detectedFromDark || erasedBoxes.length > 0;
			const erasedList = isOpaque || detectedFromDark ? allBoxes : erasedBoxes;
			const artworkDataUrl = needFlatten
				? await eraseRegions(draft.dataUrl, erasedList)
				: draft.dataUrl;

			const frame: PhotoFrame = {
				id: newId(),
				name,
				slotCount: placeholders.length,
				designWidth: draft.width,
				designHeight: draft.height,
				artworkDataUrl,
				slots: boxesToSlots(placeholders),
				focal,
				source: 'upload',
				formatId: matchedFormat?.id ?? null,
				createdAt: now,
				updatedAt: now
			};

			await saveFrame(frame);
			frames = await listFrames();
			notice = `Frame "${name}" berhasil disimpan.`;
			resetDraft();
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
			notice = `Frame "${frame.name}" telah dihapus.`;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Gagal menghapus frame.';
		} finally {
			deletingId = null;
		}
	}

	function newId(): string {
		if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
		return `frame-${Date.now()}-${Math.round(Math.random() * 1e6)}`;
	}
</script>

{#snippet studioWorkspace()}
	<div class="studio-grid">
		<div class="studio-main">
			<section class="d-card" aria-label="Unggah artwork frame">
				<div class="d-card-head">
					<div>
						<h2 class="d-card-title">Unggah Artwork</h2>
						<p class="d-card-sub">
							Ekspor dari Canva sebagai PNG transparan, atau JPEG/WebP/SVG dengan bidang foto hitam
							pekat. Setiap lubang terdeteksi otomatis sebagai kandidat slot.
						</p>
					</div>
				</div>
				<div class="d-card-body upload-body">
					<div class="d-field">
						<label class="d-field-label" for="frame-upload-input">
							Berkas Artwork (PNG, SVG, JPEG, WebP)
						</label>
						<input
							id="frame-upload-input"
							type="file"
							class="d-file"
							accept="image/png,image/svg+xml,image/jpeg,image/webp,.png,.svg,.jpg,.jpeg,.webp"
							onchange={handleFile}
							disabled={busy}
						/>
					</div>

					{#if busy}
						<div class="d-banner d-banner-info" role="status">
							<span>Memproses dan mendeteksi lubang foto pada artwork…</span>
						</div>
					{/if}
					{#if error}
						<div class="d-banner d-banner-err" role="alert"><span>{error}</span></div>
					{/if}
					{#if notice}
						<div class="d-banner d-banner-ok" role="status"><span>{notice}</span></div>
					{/if}
				</div>
			</section>

			{#if draft}
				<section class="d-card" aria-label="Editor slot frame">
					<div class="d-card-head">
						<div>
							<h2 class="d-card-title">Editor Slot Foto</h2>
							<p class="d-card-sub d-num">
								{draft.width} × {draft.height} px · {placeholderCount} diisi · {transparentCount} transparan
							</p>
						</div>
						<div class="d-actions">
							{#if draft.detectedFromDark}
								<span class="d-pill d-pill-info">Deteksi Bidang Gelap</span>
							{/if}
							<span class="d-pill d-pill-ok d-num">{placeholderCount} placeholder</span>
						</div>
					</div>

					<form class="d-card-body editor-body" onsubmit={handleSave}>
						<div class="frame-stage d-checker">
							<div class="preview-canvas-box">
								<img class="preview-img" src={draft.dataUrl} alt="Artwork frame yang diunggah" />
								{#each draft.candidates as candidate, i (i)}
									{@const number = placeholderNumbers.get(i)}
									<button
										type="button"
										class="slot-box"
										class:is-placeholder={candidate.placeholder}
										style="left:{candidate.box.x * 100}%; top:{candidate.box.y *
											100}%; width:{candidate.box.width * 100}%; height:{candidate.box.height *
											100}%;"
										onclick={() => toggleCandidate(i)}
										aria-pressed={candidate.placeholder}
										aria-label={candidate.placeholder
											? `Nonaktifkan placeholder ${number}`
											: 'Aktifkan sebagai placeholder foto'}
									>
										<span class="slot-badge d-num">{candidate.placeholder ? number : '×'}</span>
									</button>
								{/each}
							</div>
						</div>

						<div class="slot-toolbar">
							<p class="slot-hint">
								Ketuk kotak di pratinjau untuk mengubah status <strong
									>placeholder ⇄ transparan</strong
								>. Urutan nomor berjalan dari atas ke bawah.
							</p>
							<div class="d-actions">
								<button type="button" class="d-btn d-btn-sm" onclick={() => setAllCandidates(true)}>
									Pilih Semua
								</button>
								<button
									type="button"
									class="d-btn d-btn-sm"
									onclick={() => setAllCandidates(false)}
								>
									Kosongkan
								</button>
							</div>
						</div>

						<ul class="slot-list" aria-label="Daftar kandidat slot">
							{#each draft.candidates as candidate, i (i)}
								{@const number = placeholderNumbers.get(i)}
								<li class="slot-item" class:is-placeholder={candidate.placeholder}>
									<span class="slot-index d-num">{candidate.placeholder ? number : '—'}</span>
									<span class="slot-name">
										{candidate.placeholder ? `Placeholder Foto ${number}` : 'Area Transparan'}
									</span>
									<button
										type="button"
										class="d-btn d-btn-sm"
										class:d-btn-primary={!candidate.placeholder}
										onclick={() => toggleCandidate(i)}
									>
										{candidate.placeholder ? 'Jadikan Transparan' : 'Jadikan Slot'}
									</button>
								</li>
							{/each}
						</ul>

						<div class="d-form-grid">
							<div class="d-field">
								<label class="d-field-label" for="draft-frame-name">Nama Frame</label>
								<input
									id="draft-frame-name"
									type="text"
									class="d-input"
									bind:value={frameName}
									maxlength="60"
									required
								/>
							</div>
							<div class="d-field">
								<span class="d-field-label">Posisi Crop Default</span>
								<div class="d-tabs" role="radiogroup" aria-label="Posisi crop default">
									<button
										type="button"
										class="d-tab"
										class:is-active={focal === 'center'}
										onclick={() => (focal = 'center')}
										aria-pressed={focal === 'center'}
									>
										Tengah
									</button>
									<button
										type="button"
										class="d-tab"
										class:is-active={focal === 'top'}
										onclick={() => (focal = 'top')}
										aria-pressed={focal === 'top'}
									>
										Atas
									</button>
								</div>
							</div>
						</div>

						<div class="editor-footer">
							<button type="button" class="d-btn d-btn-ghost" onclick={resetDraft} disabled={busy}>
								Batal
							</button>
							<button
								type="submit"
								class="d-btn d-btn-primary"
								disabled={busy || placeholderCount === 0}
							>
								{busy ? 'Menyimpan…' : 'Simpan Frame'}
							</button>
						</div>
					</form>
				</section>
			{/if}

			<section class="d-card" aria-label="Daftar frame tersimpan">
				<div class="d-card-head">
					<div>
						<h2 class="d-card-title">Frame Tersimpan</h2>
						<p class="d-card-sub">
							Template yang disimpan langsung tersedia pada layar pilih strip & editor.
						</p>
					</div>
					<span class="d-pill d-num">{loading ? '…' : frames.length} frame</span>
				</div>

				<div class="d-card-body">
					{#if loading}
						<div class="d-empty"><p>Memuat daftar frame tersimpan…</p></div>
					{:else if frames.length === 0}
						<div class="d-empty">
							<p class="d-empty-title">Belum ada frame tersimpan</p>
							<p>Unggah artwork pertama melalui panel di atas untuk mulai membuat koleksi frame.</p>
						</div>
					{:else}
						<div class="saved-grid">
							{#each frames as frame (frame.id)}
								<article class="saved-card">
									<div class="saved-thumb d-checker">
										<img src={frame.artworkDataUrl} alt={frame.name} loading="lazy" />
									</div>
									<div class="saved-body">
										<div class="saved-head">
											<h3 class="saved-name">{frame.name}</h3>
											<span class="d-pill">
												{formats.find((f) => f.id === frame.formatId)?.label ?? 'Kustom'}
											</span>
										</div>
										<p class="saved-meta d-num">
											{frame.slotCount} foto · {frame.designWidth} × {frame.designHeight} px
										</p>
										<div class="saved-actions">
											{#if confirmDeleteId === frame.id}
												<span class="confirm-note">Hapus?</span>
												<button
													type="button"
													class="d-btn d-btn-danger d-btn-sm"
													disabled={deletingId === frame.id}
													onclick={() => handleDelete(frame)}
												>
													{deletingId === frame.id ? 'Menghapus…' : 'Ya'}
												</button>
												<button
													type="button"
													class="d-btn d-btn-sm"
													disabled={deletingId === frame.id}
													onclick={() => (confirmDeleteId = null)}
												>
													Batal
												</button>
											{:else}
												<button
													type="button"
													class="d-btn d-btn-danger d-btn-sm"
													onclick={() => (confirmDeleteId = frame.id)}
												>
													Hapus
												</button>
											{/if}
										</div>
									</div>
								</article>
							{/each}
						</div>
					{/if}
				</div>
			</section>
		</div>

		<aside class="studio-side" aria-label="Panduan ukuran kanvas">
			<section class="d-card">
				<div class="d-card-head">
					<div>
						<h2 class="d-card-title">Panduan Ukuran Kanvas</h2>
						<p class="d-card-sub">Rasio artwork harus cocok dengan standar 300 DPI.</p>
					</div>
				</div>
				<div class="d-card-body guide-body">
					<div>
						<p class="guide-heading">Ukuran Strip (1–6 Foto)</p>
						<ul class="guide-list">
							{#each FRAME_SIZE_GUIDES as guide (guide.slotCount)}
								<li class="guide-row">
									<span class="guide-label">{guide.slotCount} foto</span>
									<span class="guide-dim d-num">{guide.width} × {guide.height} px</span>
								</li>
							{/each}
						</ul>
					</div>

					<div>
						<p class="guide-heading">Format Standar & Kustom</p>
						<ul class="guide-list">
							{#each formats as guide (guide.id)}
								<li class="guide-row">
									<span class="guide-label">{guide.label}</span>
									<span class="guide-dim d-num">{guide.pxW} × {guide.pxH} px</span>
								</li>
							{/each}
						</ul>
					</div>

					<a class="d-btn d-btn-sm guide-link" href="/dashboard/assets/frame-sizes">
						Kelola Ukuran Frame
					</a>
				</div>
			</section>
		</aside>
	</div>
{/snippet}

{#if embedded}
	{@render studioWorkspace()}
{:else}
	<div class="dash-shell" class:theme-light={isLight}>
		<header class="standalone-bar">
			<div class="standalone-inner">
				<div>
					<p class="d-eyebrow">Admin · Frame Studio</p>
					<h1 class="standalone-title">Frame Studio</h1>
				</div>
				<div class="d-actions">
					<a class="d-btn d-btn-sm" href="/dashboard/assets/frame-sizes">Ukuran Frame</a>
					<a class="d-btn d-btn-sm" href="/dashboard">Dashboard</a>
					<a class="d-btn d-btn-sm" href="/strip">Photobooth</a>
					<ThemeToggle inline />
				</div>
			</div>
		</header>
		<div class="standalone-main">
			{@render studioWorkspace()}
		</div>
	</div>
{/if}

<style>
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
		margin: 2px 0 0;
		font-size: 1.35rem;
		font-weight: 800;
		letter-spacing: -0.02em;
		color: var(--d-ink);
	}

	.standalone-main {
		max-width: 1240px;
		margin: 0 auto;
		padding: 24px clamp(16px, 3vw, 32px) 48px;
	}

	.studio-grid {
		display: grid;
		gap: 18px;
		grid-template-columns: minmax(0, 1fr) 310px;
		align-items: start;
	}

	@media (max-width: 980px) {
		.studio-grid {
			grid-template-columns: minmax(0, 1fr);
		}
	}

	.studio-main,
	.studio-side {
		display: flex;
		flex-direction: column;
		gap: 18px;
		min-width: 0;
	}

	.upload-body,
	.editor-body {
		display: flex;
		flex-direction: column;
		gap: 14px;
	}

	/* Stage pratinjau dengan wrapper ketat agar persentase slot-box tepat di atas lubang foto */
	.frame-stage {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 16px;
		border: 1px solid var(--d-border);
		border-radius: 14px;
		overflow: hidden;
	}

	.preview-canvas-box {
		position: relative;
		display: inline-block;
		max-width: 100%;
		line-height: 0;
	}

	.preview-img {
		display: block;
		max-width: 100%;
		max-height: 440px;
		width: auto;
		height: auto;
	}

	.slot-box {
		position: absolute;
		display: grid;
		place-items: center;
		border: 2px dashed rgba(148, 163, 184, 0.9);
		background: rgba(148, 163, 184, 0.22);
		color: #ffffff;
		cursor: pointer;
		border-radius: 4px;
		padding: 0;
		transition:
			background-color 140ms ease,
			border-color 140ms ease;
	}

	.slot-box:hover {
		background: rgba(148, 163, 184, 0.36);
	}

	.slot-box.is-placeholder {
		border-style: solid;
		border-color: #2563eb;
		background: rgba(37, 99, 235, 0.28);
	}

	.slot-box:focus-visible {
		outline: 2.5px solid #2563eb;
		outline-offset: 2px;
	}

	.slot-badge {
		min-width: 26px;
		height: 26px;
		padding: 0 7px;
		border-radius: 999px;
		background: rgba(15, 23, 42, 0.78);
		color: #ffffff;
		font-size: 0.76rem;
		font-weight: 800;
		display: grid;
		place-items: center;
	}

	.slot-box.is-placeholder .slot-badge {
		background: #2563eb;
	}

	.slot-toolbar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
	}

	.slot-hint {
		margin: 0;
		font-size: 0.76rem;
		line-height: 1.45;
		color: var(--d-muted);
		flex: 1;
		min-width: 200px;
	}

	.slot-list {
		margin: 0;
		padding: 0;
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.slot-item {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 10px;
		padding: 9px 12px;
		border: 1px solid var(--d-border);
		border-radius: 12px;
		background: var(--d-bg);
	}

	.slot-item.is-placeholder {
		border-color: var(--d-info);
		background: var(--d-info-soft);
	}

	.slot-index {
		width: 26px;
		height: 26px;
		border-radius: 999px;
		background: var(--d-surface-2);
		color: var(--d-ink);
		font-size: 0.76rem;
		font-weight: 800;
		display: grid;
		place-items: center;
		flex-shrink: 0;
	}

	.slot-item.is-placeholder .slot-index {
		background: var(--d-info);
		color: #ffffff;
	}

	.slot-name {
		flex: 1;
		font-size: 0.82rem;
		font-weight: 700;
		color: var(--d-ink);
	}

	.editor-footer {
		display: flex;
		flex-wrap: wrap;
		justify-content: flex-end;
		gap: 8px;
		padding-top: 10px;
		border-top: 1px solid var(--d-border);
	}

	.saved-grid {
		display: grid;
		gap: 12px;
		grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
	}

	.saved-card {
		display: flex;
		flex-direction: column;
		border: 1px solid var(--d-border);
		border-radius: 14px;
		background: var(--d-bg);
		overflow: hidden;
	}

	.saved-thumb {
		height: 168px;
		padding: 12px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-bottom: 1px solid var(--d-border);
	}

	.saved-thumb img {
		display: block;
		max-width: 100%;
		max-height: 144px;
		object-fit: contain;
	}

	.saved-body {
		padding: 12px 14px 14px;
		display: flex;
		flex-direction: column;
		gap: 6px;
		flex: 1;
	}

	.saved-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 8px;
	}

	.saved-name {
		margin: 0;
		font-size: 0.88rem;
		font-weight: 700;
		line-height: 1.3;
		color: var(--d-ink);
	}

	.saved-meta {
		margin: 0;
		font-size: 0.74rem;
		color: var(--d-muted);
	}

	.saved-actions {
		margin-top: auto;
		padding-top: 8px;
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 6px;
	}

	.confirm-note {
		font-size: 0.74rem;
		font-weight: 700;
		color: var(--d-err);
	}

	.guide-body {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.guide-heading {
		margin: 0 0 8px;
		font-size: 0.7rem;
		font-weight: 800;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--d-muted);
	}

	.guide-list {
		margin: 0;
		padding: 0;
		list-style: none;
		display: flex;
		flex-direction: column;
	}

	.guide-row {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 10px;
		padding: 7px 0;
		border-bottom: 1px solid var(--d-border);
		font-size: 0.76rem;
	}

	.guide-row:last-child {
		border-bottom: none;
	}

	.guide-label {
		font-weight: 700;
		color: var(--d-ink);
	}

	.guide-dim {
		color: var(--d-muted);
		white-space: nowrap;
	}

	.guide-link {
		width: 100%;
	}
</style>
