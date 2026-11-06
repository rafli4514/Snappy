<script lang="ts">
	import { onMount } from 'svelte';
	import {
		detectFrameSlots,
		boxesToSlots,
		fileToDataUrl,
		isPngFile,
		isSvgFile,
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

	interface Draft {
		dataUrl: string;
		width: number;
		height: number;
		boxes: DetectedBox[];
		sourceName: string;
	}

	let frames = $state<PhotoFrame[]>([]);
	let loading = $state(true);
	let busy = $state(false);
	let error = $state<string | null>(null);
	let notice = $state<string | null>(null);
	let draft = $state<Draft | null>(null);
	let frameName = $state('');
	let focal = $state<'center' | 'top'>('center');

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

		if (!isPngFile(file) && !isSvgFile(file)) {
			error = 'Format harus PNG atau SVG.';
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

			const result = await detectFrameSlots(dataUrl);
			if (result.boxes.length === 0) {
				error =
					'Tidak ada lubang transparan yang terdeteksi. Ekspor frame dengan background transparan, bukan putih.';
				return;
			}
			if (result.boxes.length > 6) {
				error = `Frame punya ${result.boxes.length} lubang. Maksimal 6 foto per strip.`;
				return;
			}
			if (!ratioMatches(result.width, result.height, result.boxes.length)) {
				const guide = sizeGuideFor(result.boxes.length);
				error = guide
					? `Rasio artwork ${result.width} × ${result.height} tidak cocok untuk ${result.boxes.length} foto. Pakai canvas ${guide.width} × ${guide.height} px (${guide.cm}).`
					: `Rasio artwork tidak cocok untuk ${result.boxes.length} foto.`;
				return;
			}

			const baseName = file.name.replace(/\.(png|svg)$/i, '');
			draft = {
				dataUrl,
				width: result.width,
				height: result.height,
				boxes: result.boxes,
				sourceName: baseName
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

	async function handleSave(): Promise<void> {
		if (!draft || busy) return;
		const name = frameName.trim() || draft.sourceName;
		const now = Date.now();
		const frame: PhotoFrame = {
			id: newId(),
			name,
			slotCount: draft.boxes.length,
			designWidth: draft.width,
			designHeight: draft.height,
			artworkDataUrl: draft.dataUrl,
			slots: boxesToSlots(draft.boxes),
			focal,
			source: 'upload',
			createdAt: now,
			updatedAt: now
		};

		busy = true;
		error = null;
		try {
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
							Ekspor dari Canva sebagai PNG transparan atau SVG. Setiap lubang transparan jadi satu
							slot foto.
						</p>
					</div>

					<input
						type="file"
						class="file-input w-full"
						accept="image/png,image/svg+xml,.png,.svg"
						onchange={handleFile}
						disabled={busy}
						aria-label="Pilih file frame PNG atau SVG"
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
							<h2 class="card-title text-lg">Pratinjau deteksi</h2>
							<span class="badge badge-neutral">{draft.boxes.length} slot</span>
						</div>

						<div class="frame-preview">
							<img src={draft.dataUrl} alt="Artwork frame yang diunggah" />
							{#each draft.boxes as box, i (i)}
								<span
									class="slot-box"
									style="left:{box.x * 100}%; top:{box.y * 100}%; width:{box.width *
										100}%; height:{box.height * 100}%;"
								>
									{i + 1}
								</span>
							{/each}
						</div>

						<p class="font-mono text-xs tracking-wider text-base-content/60">
							{draft.width} × {draft.height} px · {draft.boxes.length} foto
						</p>

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
							<button type="button" class="btn btn-primary" onclick={handleSave} disabled={busy}>
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
						Rasio harus sama dengan produk cetak. Selisih lebih dari 1% ditolak supaya foto tidak
						terdistorsi.
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
		border: 1.5px dashed #2563eb;
		background: rgba(37, 99, 235, 0.12);
		color: #1d4ed8;
		font-family: var(--font-mono);
		font-size: 0.7rem;
		font-weight: 700;
		pointer-events: none;
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
