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
		sanitizeSvg,
		svgToDataUrl
	} from '#lib/utils/frameDetect';
	import { deleteFrame, listFrames, saveFrame } from '#lib/utils/frameStorage';
	import { STANDARD_FORMATS } from '#lib/data/standardFormats';
	import type { StandardFormat } from '#lib/data/standardFormats';
	import type { PhotoFrame } from '#lib/types';

	const PRESET_KEY = 'distudio-standard-presets';

	let frames = $state<PhotoFrame[]>([]);
	let loading = $state(true);
	let busyFor = $state<string | null>(null);
	let error = $state<string | null>(null);
	let notice = $state<string | null>(null);
	let presetOn = $state<Record<string, boolean>>({});

	onMount(async () => {
		frames = await listFrames();
		loading = false;
		presetOn = readPresets();
	});

	function readPresets(): Record<string, boolean> {
		if (typeof window === 'undefined') return {};
		try {
			return JSON.parse(localStorage.getItem(PRESET_KEY) || '{}') as Record<string, boolean>;
		} catch {
			return {};
		}
	}

	function presetEnabled(formatId: string): boolean {
		return presetOn[formatId] ?? true;
	}

	function togglePreset(formatId: string): void {
		presetOn = { ...presetOn, [formatId]: !presetEnabled(formatId) };
		try {
			localStorage.setItem(PRESET_KEY, JSON.stringify(presetOn));
		} catch {
			/* private mode — toggle berlaku sesi ini saja */
		}
	}

	function framesFor(formatId: string): PhotoFrame[] {
		return frames.filter((frame) => frame.formatId === formatId);
	}

	async function toggleFrame(frame: PhotoFrame): Promise<void> {
		try {
			await saveFrame({ ...frame, enabled: frame.enabled === false, updatedAt: Date.now() });
			frames = await listFrames();
		} catch {
			error = 'Gagal menyimpan pengaturan frame.';
		}
	}

	async function renameFrame(frame: PhotoFrame, name: string): Promise<void> {
		const next = name.trim();
		if (!next || next === frame.name) return;
		try {
			await saveFrame({ ...frame, name: next, updatedAt: Date.now() });
			frames = await listFrames();
		} catch {
			error = 'Gagal mengganti nama frame.';
		}
	}

	async function removeFrame(frame: PhotoFrame): Promise<void> {
		if (!window.confirm(`Hapus frame "${frame.name}"?`)) return;
		await deleteFrame(frame.id);
		frames = await listFrames();
		notice = 'Frame dihapus.';
	}

	async function uploadFor(format: StandardFormat, event: Event): Promise<void> {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		error = null;
		notice = null;
		busyFor = format.id;

		try {
			if (!isPngFile(file) && !isSvgFile(file) && !isJpegFile(file) && !isWebpFile(file)) {
				throw new Error('Format harus PNG, SVG, JPEG, atau WebP.');
			}

			let dataUrl: string;
			if (isSvgFile(file)) {
				const text = await file.text();
				dataUrl = svgToDataUrl(sanitizeSvg(text));
			} else {
				dataUrl = await fileToDataUrl(file);
			}

			let result = await detectFrameSlots(dataUrl);
			if (result.boxes.length === 0) {
				const keyed = await detectFrameSlots(dataUrl, {
					mode: 'key',
					keyColor: '#000000'
				});
				if (keyed.boxes.length > 0) result = keyed;
			}
			if (result.boxes.length === 0) {
				throw new Error(
					'Tidak ada slot terdeteksi. Pakai artwork dengan lubang transparan atau bidang hitam pekat.'
				);
			}
			if (!format.photos.includes(result.boxes.length)) {
				throw new Error(
					`Slot terdeteksi ${result.boxes.length}; ${format.label} hanya mendukung ${format.photos.join('/')} foto.`
				);
			}

			const actual = result.width / result.height;
			if (Math.abs(actual / format.ratio - 1) > 0.01) {
				throw new Error(
					`Rasio artwork ${result.width} × ${result.height} tidak cocok untuk ${format.label} (${format.pxW} × ${format.pxH} px).`
				);
			}

			const now = Date.now();
			const frame: PhotoFrame = {
				id: newId(),
				name: file.name.replace(/\.(png|svg|jpe?g|webp)$/i, ''),
				slotCount: result.boxes.length,
				designWidth: result.width,
				designHeight: result.height,
				artworkDataUrl: dataUrl,
				slots: boxesToSlots(result.boxes),
				focal: 'center',
				source: 'upload',
				formatId: format.id,
				enabled: true,
				createdAt: now,
				updatedAt: now
			};
			await saveFrame(frame);
			frames = await listFrames();
			notice = `Frame tersimpan di kategori ${format.label}.`;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Gagal membaca artwork.';
		} finally {
			busyFor = null;
			input.value = '';
		}
	}

	function newId(): string {
		if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
		return `frame-${Date.now()}-${Math.round(Math.random() * 1e6)}`;
	}
</script>

<svelte:head>
	<title>Katalog Standard · DISTUDIO</title>
</svelte:head>

<main class="min-h-dvh bg-base-100 text-base-content">
	<header class="border-b border-base-300 px-5 py-4 sm:px-8">
		<div class="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
			<div>
				<p class="font-mono text-xs tracking-[0.22em] text-base-content/60">
					ADMIN · KATALOG STANDARD
				</p>
				<h1 class="font-display text-2xl sm:text-3xl">Standard Photobooth</h1>
			</div>
			<div class="flex items-center gap-2">
				<a class="btn btn-ghost btn-sm" href="/admin/frames">Frame Studio</a>
				<a class="btn btn-ghost btn-sm" href="/strip">Kembali ke kios</a>
			</div>
		</div>
	</header>

	<div class="mx-auto max-w-6xl px-5 py-6 sm:px-8">
		<p class="max-w-3xl text-sm text-base-content/70">
			Kelola frame standard yang tampil di kios: preset bawaan, upload artwork per kategori (rasio
			wajib cocok, slot terdeteksi otomatis), dan toggle visibilitas. Custom frame dari Canva tetap
			dikelola lewat Frame Studio.
		</p>

		{#if error}
			<div class="mt-4 alert alert-error" role="alert">
				<span>{error}</span>
			</div>
		{/if}

		{#if notice}
			<div class="mt-4 alert alert-success" role="status">
				<span>{notice}</span>
			</div>
		{/if}

		<div class="mt-6 grid gap-4 lg:grid-cols-2">
			{#each STANDARD_FORMATS as format (format.id)}
				{@const mine = framesFor(format.id)}
				<section class="card border border-base-300 bg-base-200" aria-label={format.label}>
					<div class="card-body gap-3 p-4">
						<header class="flex items-start justify-between gap-3">
							<div class="flex items-center gap-3">
								<span
									class="format-thumb"
									style="aspect-ratio: {format.pxW / format.pxH};"
									aria-hidden="true"
								>
									<span class="format-thumb-label">{format.label.split('·')[0].trim()}</span>
								</span>
								<div>
									<h2 class="text-base leading-tight font-semibold">{format.label}</h2>
									<p class="font-mono text-[0.65rem] text-base-content/60">
										{format.pxW} × {format.pxH} px · {format.cm}
									</p>
									<p class="font-mono text-[0.65rem] text-base-content/60">
										{format.photos.join('/')} foto
									</p>
								</div>
							</div>
							<span class="badge badge-outline whitespace-nowrap">
								{format.kind === 'digital' ? 'DIGITAL' : 'CETAK'}
							</span>
						</header>

						<ul class="flex flex-col gap-2">
							<li class="frame-row">
								<div class="builtin-thumb" aria-hidden="true">
									<span>Classic</span>
								</div>
								<div class="frame-meta">
									<p class="frame-name">Classic</p>
									<p class="frame-sub font-mono">BAWAAN · semua jumlah foto</p>
								</div>
								<label class="toggle">
									<input
										type="checkbox"
										class="toggle toggle-sm"
										checked={presetEnabled(format.id)}
										onchange={() => togglePreset(format.id)}
										aria-label={`Tampilkan preset Classic ${format.label} di kios`}
									/>
								</label>
							</li>

							{#if loading}
								<li class="text-xs text-base-content/60">Memuat frame…</li>
							{:else}
								{#each mine as frame (frame.id)}
									<li class="frame-row">
										<img class="frame-thumb-img" src={frame.artworkDataUrl} alt="" />
										<div class="frame-meta">
											<input
												type="text"
												class="rename-input"
												value={frame.name}
												maxlength="60"
												aria-label={`Nama frame ${frame.name}`}
												onchange={(e) =>
													renameFrame(frame, (e.currentTarget as HTMLInputElement).value)}
											/>
											<p class="frame-sub font-mono">
												{frame.slotCount} foto · {frame.designWidth} × {frame.designHeight} px
											</p>
										</div>
										<label class="toggle">
											<input
												type="checkbox"
												class="toggle toggle-sm"
												checked={frame.enabled !== false}
												onchange={() => toggleFrame(frame)}
												aria-label={`Tampilkan frame ${frame.name} di kios`}
											/>
										</label>
										<button
											type="button"
											class="btn btn-ghost text-error btn-xs"
											onclick={() => removeFrame(frame)}
										>
											Hapus
										</button>
									</li>
								{/each}
							{/if}

							<li>
								<input
									type="file"
									class="file-input file-input-ghost w-full"
									accept="image/png,image/svg+xml,image/jpeg,image/webp,.png,.svg,.jpg,.jpeg,.webp"
									disabled={busyFor !== null}
									onchange={(e) => uploadFor(format, e)}
									aria-label={`Upload frame untuk ${format.label}`}
								/>
							</li>
						</ul>
					</div>
				</section>
			{/each}
		</div>
	</div>
</main>

<style>
	.format-thumb {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 84px;
		min-width: 34px;
		border: 1px solid var(--color-base-300);
		border-radius: 6px;
		background:
			linear-gradient(45deg, var(--color-base-300) 25%, transparent 25%) 0 0 / 12px 12px,
			linear-gradient(-45deg, var(--color-base-300) 25%, transparent 25%) 0 6px / 12px 12px,
			linear-gradient(45deg, transparent 75%, var(--color-base-300) 75%) 6px -6px / 12px 12px,
			linear-gradient(-45deg, transparent 75%, var(--color-base-300) 75%) -6px 0 / 12px 12px;
	}

	.format-thumb-label {
		font-family: var(--font-mono);
		font-size: 0.7rem;
		font-weight: 800;
		color: var(--color-base-content);
	}

	.frame-row {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 8px;
		border: 1px solid var(--color-base-300);
		border-radius: var(--radius-box);
		background: var(--color-base-100);
	}

	.builtin-thumb,
	.frame-thumb-img {
		width: 56px;
		height: 84px;
		flex-shrink: 0;
		border-radius: 6px;
		object-fit: cover;
	}

	.builtin-thumb {
		display: flex;
		align-items: center;
		justify-content: center;
		background: #fbf7f0;
		border: 1px solid #c7a45c;
		font-family: var(--font-mono);
		font-size: 0.62rem;
		font-weight: 800;
		color: #2b2620;
	}

	.frame-meta {
		flex: 1;
		min-width: 0;
	}

	.frame-name {
		font-size: 0.82rem;
		font-weight: 650;
		line-height: 1.25;
		margin: 0;
	}

	.frame-sub {
		font-size: 0.62rem;
		color: var(--color-base-content/60);
		margin: 2px 0 0;
	}

	.rename-input {
		width: 100%;
		font-size: 0.82rem;
		font-weight: 650;
		background: transparent;
		border: 1px solid transparent;
		border-radius: 6px;
		padding: 2px 6px;
	}

	.rename-input:hover,
	.rename-input:focus-visible {
		border-color: var(--color-base-300);
		outline: none;
	}

	.toggle {
		flex-shrink: 0;
	}
</style>
