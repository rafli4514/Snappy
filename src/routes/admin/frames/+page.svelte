<script lang="ts">
	import { onMount } from 'svelte';
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

	let frames = $state<PhotoFrame[]>([]);
	let loading = $state(true);
	let busy = $state(false);
	let error = $state<string | null>(null);
	let notice = $state<string | null>(null);
	let draft = $state<Draft | null>(null);
	let frameName = $state('');
	let focal = $state<'center' | 'top'>('center');

	/** Nomor placeholder urut atas→bawah; Map dari index kandidat. */
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
		frames = await listFrames();
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

			// Lubang transparan dulu; fallback ke bidang gelap pekat (JPEG/WebP,
			// atau PNG/SVG yang flat tanpa transparansi).
			let result = await detectFrameSlots(dataUrl);
			let detectedFromDark = false;
			if (result.boxes.length === 0) {
				const keyed = await detectFrameSlots(dataUrl, {
					mode: 'key',
					keyColor: '#000000'
				});
				if (keyed.boxes.length > 0) {
					result = keyed;
					detectedFromDark = true;
				}
			}
			if (result.boxes.length === 0) {
				error =
					'Tidak ada kandidat yang terdeteksi. Pakai PNG dengan lubang transparan, atau bidang foto hitam pekat.';
				return;
			}
			if (result.boxes.length > 6) {
				error = `Frame punya ${result.boxes.length} kandidat. Maksimal 6 foto per strip.`;
				return;
			}

			const baseName = file.name.replace(/\.(png|svg|jpe?g|webp)$/i, '');
			draft = {
				dataUrl,
				width: result.width,
				height: result.height,
				sourceName: baseName,
				detectedFromDark,
				// Awalnya semua kandidat transparan; placeholder dibuat dari tombol.
				candidates: result.boxes.map((box) => ({ box, placeholder: false }))
			};
			frameName = baseName;
		} catch (e) {
			console.error('Frame upload failed:', e);
			error = 'Gagal membaca artwork. Coba ekspor ulang dari Canva.';
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

	async function handleSave(): Promise<void> {
		if (!draft || busy) return;
		const candidates = draft.candidates;
		const placeholders = candidates.filter((candidate) => candidate.placeholder).map((c) => c.box);
		if (placeholders.length === 0) {
			error = 'Minimal satu placeholder dulu. Ketuk kandidat yang mau diisi.';
			return;
		}
		if (!ratioMatches(draft.width, draft.height, placeholders.length)) {
			const guide = sizeGuideFor(placeholders.length);
			error = guide
				? `Rasio artwork ${draft.width} × ${draft.height} tidak cocok untuk ${placeholders.length} placeholder. Pakai canvas ${guide.width} × ${guide.height} px (${guide.cm}).`
				: `Rasio artwork tidak cocok untuk ${placeholders.length} placeholder.`;
			return;
		}

		const name = frameName.trim() || draft.sourceName;
		const now = Date.now();

		busy = true;
		error = null;
		try {
			// Wilayah yang tidak dijadikan placeholder "dihapus" jadi transparan,
			// supaya artwork tidak lagi menyisakan kotak hitam.
			const erased = candidates.filter((c) => !c.placeholder).map((c) => c.box);
			const artworkDataUrl =
				erased.length > 0 ? await eraseRegions(draft.dataUrl, erased) : draft.dataUrl;

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
				createdAt: now,
				updatedAt: now
			};

			await saveFrame(frame);
			frames = await listFrames();
			notice = `Frame "${name}" tersimpan.`;
			resetDraft();
		} catch (e) {
			console.error('Frame save failed:', e);
			error = 'Gagal menyimpan frame. Penyimpanan browser mungkin penuh.';
		} finally {
			busy = false;
		}
	}

	async function handleDelete(frame: PhotoFrame): Promise<void> {
		if (!window.confirm(`Hapus frame "${frame.name}"?`)) return;
		await deleteFrame(frame.id);
		frames = await listFrames();
		notice = 'Frame dihapus.';
	}

	function newId(): string {
		if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
		return `frame-${Date.now()}-${Math.round(Math.random() * 1e6)}`;
	}
</script>

<svelte:head>
	<title>Frame Studio · DISTUDIO</title>
</svelte:head>

<main class="min-h-dvh bg-base-100 text-base-content">
	<header class="border-b border-base-300 px-5 py-4 sm:px-8">
		<div class="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3">
			<div>
				<p class="font-mono text-xs tracking-[0.22em] text-base-content/60">ADMIN · FRAME STUDIO</p>
				<h1 class="font-display text-2xl sm:text-3xl">Frame Canva</h1>
			</div>
			<a class="btn btn-ghost btn-sm" href="/strip">Kembali ke kios</a>
		</div>
	</header>

	<div class="mx-auto grid max-w-5xl gap-8 px-5 py-8 sm:px-8 lg:grid-cols-[minmax(0,1fr)_320px]">
		<section class="flex flex-col gap-6" aria-label="Unggah frame">
			<div class="card border border-base-300 bg-base-200">
				<div class="card-body gap-4">
					<div>
						<h2 class="card-title text-lg">Unggah artwork</h2>
						<p class="text-sm text-base-content/70">
							Ekspor dari Canva sebagai PNG transparan, atau JPEG/WebP/SVG dengan bidang foto hitam
							pekat. Setiap lubang / bidang gelap jadi satu kandidat slot.
						</p>
					</div>

					<input
						type="file"
						class="file-input w-full"
						accept="image/png,image/svg+xml,image/jpeg,image/webp,.png,.svg,.jpg,.jpeg,.webp"
						onchange={handleFile}
						disabled={busy}
						aria-label="Pilih file frame PNG, SVG, JPEG, atau WebP"
					/>

					{#if busy}
						<p class="text-sm text-base-content/70" role="status">Membaca artwork…</p>
					{/if}

					{#if error}
						<div class="alert alert-error" role="alert">
							<span>{error}</span>
						</div>
					{/if}

					{#if notice}
						<div class="alert alert-success" role="status">
							<span>{notice}</span>
						</div>
					{/if}
				</div>
			</div>

			{#if draft}
				<div class="card border border-base-300 bg-base-200">
					<div class="card-body gap-4">
						<div class="flex flex-wrap items-center justify-between gap-2">
							<h2 class="card-title text-lg">Editor slot</h2>
							<span class="badge badge-neutral">{placeholderCount} placeholder</span>
						</div>

						<div class="frame-preview">
							<img src={draft.dataUrl} alt="Artwork frame yang diunggah" />
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
										? `Hapus placeholder ${number}`
										: 'Jadikan placeholder'}
								>
									{candidate.placeholder ? number : '×'}
								</button>
							{/each}
						</div>

						<div class="flex flex-wrap items-center justify-between gap-3">
							<p class="font-mono text-xs tracking-wider text-base-content/60">
								{draft.width} × {draft.height} px · {placeholderCount} diisi · {transparentCount} dihapus
							</p>
							{#if draft.detectedFromDark}
								<span class="badge badge-outline badge-sm">Terdeteksi dari bidang gelap</span>
							{/if}
						</div>

						<div class="flex flex-wrap items-center justify-between gap-2">
							<p class="text-xs text-base-content/60">
								Ketuk kotak untuk ubah <strong>placeholder ⇄ transparan</strong>. Placeholder
								dinomori 1 sampai {placeholderCount || 'N'} urut atas → bawah.
							</p>
							<div class="flex gap-2">
								<button
									type="button"
									class="btn btn-outline btn-xs"
									onclick={() => setAllCandidates(true)}
								>
									Placeholder semua
								</button>
								<button
									type="button"
									class="btn btn-outline btn-xs"
									onclick={() => setAllCandidates(false)}
								>
									Hapus semua
								</button>
							</div>
						</div>

						<ul class="slot-list" aria-label="Kandidat slot">
							{#each draft.candidates as candidate, i (i)}
								{@const number = placeholderNumbers.get(i)}
								<li class="slot-item" class:is-placeholder={candidate.placeholder}>
									<span class="slot-index font-mono">{candidate.placeholder ? number : '—'}</span>
									<span class="slot-name">
										{candidate.placeholder ? `Placeholder ${number}` : 'Transparan'}
									</span>
									<button
										type="button"
										class="btn btn-xs"
										class:btn-primary={!candidate.placeholder}
										class:btn-ghost={candidate.placeholder}
										onclick={() => toggleCandidate(i)}
									>
										{candidate.placeholder ? 'Hapus' : 'Placeholder'}
									</button>
								</li>
							{/each}
						</ul>

						<fieldset class="fieldset">
							<legend class="fieldset-legend">Nama frame</legend>
							<input type="text" class="input w-full" bind:value={frameName} maxlength="60" />
						</fieldset>

						<fieldset class="fieldset">
							<legend class="fieldset-legend">Posisi crop default</legend>
							<div class="join">
								<button
									type="button"
									class="btn join-item"
									class:btn-active={focal === 'center'}
									onclick={() => (focal = 'center')}
									aria-pressed={focal === 'center'}
								>
									Tengah
								</button>
								<button
									type="button"
									class="btn join-item"
									class:btn-active={focal === 'top'}
									onclick={() => (focal = 'top')}
									aria-pressed={focal === 'top'}
								>
									Atas
								</button>
							</div>
						</fieldset>

						<div class="flex flex-wrap justify-end gap-2">
							<button type="button" class="btn btn-ghost" onclick={resetDraft} disabled={busy}>
								Batal
							</button>
							<button
								type="button"
								class="btn btn-primary"
								onclick={handleSave}
								disabled={busy || placeholderCount === 0}
							>
								Simpan frame
							</button>
						</div>
					</div>
				</div>
			{/if}

			<section aria-label="Daftar frame tersimpan">
				<h2 class="font-display mb-3 text-xl">Frame tersimpan</h2>

				{#if loading}
					<p class="text-sm text-base-content/70" role="status">Memuat frame…</p>
				{:else if frames.length === 0}
					<div class="rounded-box border border-dashed border-base-300 px-5 py-10 text-center">
						<p class="font-mono text-xs tracking-[0.2em] text-base-content/50">BELUM ADA FRAME</p>
						<p class="mt-2 text-sm text-base-content/70">
							Frame yang kamu simpan muncul di layar pilih frame.
						</p>
					</div>
				{:else}
					<ul class="grid gap-4 sm:grid-cols-2">
						{#each frames as frame (frame.id)}
							<li class="card border border-base-300 bg-base-200">
								<figure class="frame-thumb">
									<img src={frame.artworkDataUrl} alt="" />
								</figure>
								<div class="card-body gap-2 p-4">
									<h3 class="text-base leading-tight font-semibold">{frame.name}</h3>
									<p class="font-mono text-xs text-base-content/60">
										{frame.slotCount} foto · {frame.designWidth} × {frame.designHeight} px
									</p>
									<div class="card-actions justify-end">
										<button
											type="button"
											class="btn btn-ghost text-error btn-sm"
											onclick={() => handleDelete(frame)}
										>
											Hapus
										</button>
									</div>
								</div>
							</li>
						{/each}
					</ul>
				{/if}
			</section>
		</section>

		<aside class="flex flex-col gap-4" aria-label="Panduan ukuran canvas">
			<div class="card border border-base-300 bg-base-200">
				<div class="card-body gap-3">
					<h2 class="card-title text-base">Ukuran canvas Canva</h2>
					<p class="text-sm text-base-content/70">
						Rasio harus sama dengan produk cetak placeholder. Selisih lebih dari 1% ditolak supaya
						foto tidak terdistorsi.
					</p>
					<ul class="flex flex-col gap-2">
						{#each FRAME_SIZE_GUIDES as guide (guide.slotCount)}
							<li class="flex items-baseline justify-between gap-3 border-b border-base-300 pb-2">
								<span class="font-mono text-xs">{guide.slotCount} foto</span>
								<span class="font-mono text-xs text-base-content/70">
									{guide.width} × {guide.height} px
								</span>
							</li>
						{/each}
					</ul>
				</div>
			</div>
		</aside>
	</div>
</main>

<style>
	.frame-preview {
		position: relative;
		width: 100%;
		max-height: 460px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: var(--radius-box);
		overflow: hidden;
		background-color: #f4f1ea;
		background-image:
			linear-gradient(45deg, #e4ded1 25%, transparent 25%),
			linear-gradient(-45deg, #e4ded1 25%, transparent 25%),
			linear-gradient(45deg, transparent 75%, #e4ded1 75%),
			linear-gradient(-45deg, transparent 75%, #e4ded1 75%);
		background-size: 16px 16px;
		background-position:
			0 0,
			0 8px,
			8px -8px,
			-8px 0;
	}

	.frame-preview > img {
		display: block;
		max-width: 100%;
		max-height: 460px;
		object-fit: contain;
	}

	.slot-box {
		position: absolute;
		display: flex;
		align-items: center;
		justify-content: center;
		border: 1.5px dashed #94a3b8;
		background: rgba(148, 163, 184, 0.18);
		color: #64748b;
		font-family: var(--font-mono);
		font-size: 0.75rem;
		font-weight: 700;
		cursor: pointer;
		border-radius: 2px;
	}

	.slot-box:not(.is-placeholder) {
		opacity: 0.72;
	}

	.slot-box.is-placeholder {
		border-color: #2563eb;
		background: rgba(37, 99, 235, 0.18);
		color: #1d4ed8;
	}

	.slot-box:focus-visible {
		outline: 2.5px solid var(--focus, #1d4ed8);
		outline-offset: 2px;
	}

	.slot-list {
		display: flex;
		flex-direction: column;
		gap: 6px;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.slot-item {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 6px 10px;
		border: 1px solid var(--color-base-300, #d6d3d1);
		border-radius: var(--radius-box);
		background: var(--color-base-100, #fafaf9);
	}

	.slot-item.is-placeholder {
		border-color: #2563eb;
	}

	.slot-index {
		width: 1.5rem;
		font-size: 0.8rem;
		color: var(--color-base-content, #1c1917);
	}

	.slot-name {
		flex: 1;
		font-size: 0.8rem;
		color: var(--color-base-content, #1c1917);
	}

	.frame-thumb {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 160px;
		padding: 10px;
		background-color: #f4f1ea;
		background-image:
			linear-gradient(45deg, #e4ded1 25%, transparent 25%),
			linear-gradient(-45deg, #e4ded1 25%, transparent 25%),
			linear-gradient(45deg, transparent 75%, #e4ded1 75%),
			linear-gradient(-45deg, transparent 75%, #e4ded1 75%);
		background-size: 14px 14px;
		background-position:
			0 0,
			0 7px,
			7px -7px,
			-7px 0;
	}

	.frame-thumb img {
		display: block;
		max-width: 100%;
		max-height: 140px;
		object-fit: contain;
	}
</style>
