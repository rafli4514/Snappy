<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { session, stripPhotos, goTo, setTimelapseResult } from '#lib/stores/session';
	import {
		buildTimelapseGif,
		buildTimelapseVideo,
		type TimelapseTransition
	} from '#lib/utils/timelapse';
	import type { TimelapseMeta, TimelapseSpeedMul } from '#lib/types';

	const SPEED_OPTIONS: { v: TimelapseSpeedMul; l: string }[] = [
		{ v: 0.25, l: '0.25×' },
		{ v: 0.5, l: '0.5×' },
		{ v: 0.75, l: '0.75×' },
		{ v: 1, l: '1×' },
		{ v: 1.25, l: '1.25×' },
		{ v: 1.5, l: '1.5×' },
		{ v: 1.75, l: '1.75×' },
		{ v: 2, l: '2×' }
	];

	$: camTl = $session.cameraSettings?.timelapse;

	let speedMul: TimelapseSpeedMul = 1;
	let transition: TimelapseTransition = 'none';
	let makeVideo = true;

	let generating = false;
	let statusText = '';
	let error: string | null = null;
	let previewUrl: string | null = null;
	let videoUrl: string | null = null;
	let generatedMeta: TimelapseMeta | null = null;

	let seq = 0;
	let debounceTimer: ReturnType<typeof setTimeout> | null = null;
	let inited = false;
	let prevKey = '';
	let needsRegen = false;

	$: theme = $session.theme;
	$: photos = $stripPhotos;
	$: savedGif = $session.timelapseDataUrl;
	$: savedVideo = $session.timelapseVideoDataUrl;
	$: hasPreview = !!(previewUrl || savedGif);
	$: hasVideo = !!(videoUrl || savedVideo);
	$: videoSupported = mp4Supported();

	$: settingsKey = JSON.stringify({ speedMul, transition, makeVideo: makeVideo && videoSupported });
	$: metaMatches =
		!!generatedMeta &&
		generatedMeta.speedMul === speedMul &&
		generatedMeta.transition === transition &&
		generatedMeta.hasVideo === (makeVideo && videoSupported && !!(videoUrl || savedVideo));

	function mp4Supported(): boolean {
		if (typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined') return true;
		if (typeof MediaRecorder === 'undefined') return false;
		const candidates = [
			'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
			'video/mp4;codecs=avc1.42E01E',
			'video/mp4;codecs=h264',
			'video/mp4'
		];
		for (const m of candidates) {
			try {
				if (MediaRecorder.isTypeSupported(m)) return true;
			} catch {
				/* ignore */
			}
		}
		return false;
	}

	function applyDefaults(): void {
		if (!camTl) return;
		speedMul = camTl.speedMul;
		transition = camTl.transition;
		makeVideo = camTl.makeVideo;
	}

	async function generate(auto = false): Promise<void> {
		if (!photos.length) return;
		const mySeq = ++seq;
		generating = true;
		error = null;
		const wantVideo = makeVideo && videoSupported;
		try {
			statusText = 'Membuat GIF…';
			const gifUrl = await buildTimelapseGif(photos, {
				speedMul,
				transition,
				width: 480,
				height: 360
			});
			if (mySeq !== seq) return;
			previewUrl = gifUrl;

			let vUrl: string | null = null;
			if (wantVideo) {
				statusText = 'Membuat video MP4…';
				try {
					vUrl = await buildTimelapseVideo(photos, {
						speedMul,
						transition,
						width: 480,
						height: 360
					});
				} catch (ve) {
					console.warn('Video timelapse gagal, lanjut dengan GIF:', ve);
					vUrl = null;
				}
				if (mySeq !== seq) return;
			}
			videoUrl = vUrl;
			generatedMeta = { speedMul, transition, hasVideo: !!vUrl };
			setTimelapseResult(gifUrl, vUrl, generatedMeta);
			statusText = '';
		} catch (e) {
			if (mySeq !== seq) return;
			console.error('Timelapse error:', e);
			error = auto ? 'Gagal membuat timelapse otomatis.' : 'Gagal membuat timelapse. Coba lagi.';
			statusText = '';
		} finally {
			if (mySeq === seq) {
				generating = false;
				statusText = '';
				if (needsRegen && camTl?.auto && photos.length) {
					needsRegen = false;
					void generate(true);
				}
			}
		}
	}

	function scheduleAuto(): void {
		if (!inited || !camTl?.auto) return;
		if (debounceTimer) clearTimeout(debounceTimer);
		debounceTimer = setTimeout(() => {
			debounceTimer = null;
			if (generating) {
				needsRegen = true;
				return;
			}
			void generate(true);
		}, 650);
	}

	$: if (inited) {
		const k = settingsKey;
		if (k !== prevKey) {
			prevKey = k;
			if (photos.length) scheduleAuto();
		}
	}

	function downloadGif(): void {
		const url = previewUrl || savedGif;
		if (!url) return;
		const a = document.createElement('a');
		a.href = url;
		a.download = `distudio-timelapse-${Date.now()}.gif`;
		document.body.appendChild(a);
		a.click();
		a.remove();
	}

	function downloadVideo(): void {
		const url = videoUrl || savedVideo;
		if (!url) return;
		const a = document.createElement('a');
		a.href = url;
		a.download = `distudio-timelapse-${Date.now()}.mp4`;
		document.body.appendChild(a);
		a.click();
		a.remove();
	}

	function handleNext(): void {
		goTo('print');
	}

	onMount(() => {
		applyDefaults();
		if (savedGif && !previewUrl) previewUrl = savedGif;
		if (savedVideo && !videoUrl) videoUrl = savedVideo;
		generatedMeta = $session.timelapseMeta ?? null;
		prevKey = JSON.stringify({ speedMul, transition, makeVideo: makeVideo && videoSupported });
		inited = true;
		const auto = $session.cameraSettings?.timelapse?.auto ?? true;
		const hasValid = !!(savedGif && generatedMeta && metaMatches);
		if (auto && photos.length && !hasValid) void generate(true);
	});

	onDestroy(() => {
		if (debounceTimer) clearTimeout(debounceTimer);
		seq++;
	});
</script>

<section
	class="timelapse-screen screen-enter kiosk-scope"
	class:theme-light={theme === 'light'}
	aria-label="Timelapse"
>
	<header class="tl-head">
		<button
			type="button"
			class="head-back-btn"
			on:click={() => goTo('decorate')}
			aria-label="Kembali ke dekorasi"
		>
			<svg
				width="16"
				height="16"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2.5"
				stroke-linecap="round"
				stroke-linejoin="round"
				aria-hidden="true"
			>
				<path d="M15 18l-6-6 6-6" />
			</svg>
		</button>
		<h1 class="tl-head-title font-display">Timelapse</h1>
		<span class="head-balance" aria-hidden="true"></span>
	</header>

	<div class="tl-body">
		<div class="tl-preview">
			<div class="tl-preview-card">
				{#if videoUrl || savedVideo}
					<!-- svelte-ignore a11y_media_has_caption -->
					<video
						src={videoUrl || savedVideo}
						class="tl-img"
						autoplay
						loop
						muted
						playsinline
						controls
						aria-label="Pratinjau video timelapse"
					></video>
				{:else if previewUrl || savedGif}
					<img src={previewUrl || savedGif} alt="Pratinjau timelapse" class="tl-img" />
				{:else if generating}
					<div class="tl-empty"><p class="font-mono">{statusText || 'Menyiapkan…'}</p></div>
				{:else}
					<div class="tl-empty">
						<p class="font-mono">Belum ada timelapse.</p>
						<p class="tl-hint font-mono">Timelapse dibuat otomatis dari foto sesi.</p>
					</div>
				{/if}
			</div>
			{#if generating}
				<div class="tl-stale font-mono" role="status">{statusText || 'Memperbarui timelapse…'}</div>
			{:else if hasPreview && !metaMatches && inited}
				<div class="tl-stale font-mono" role="status">Menyesuaikan pengaturan…</div>
			{/if}
			{#if (videoUrl || savedVideo) && (previewUrl || savedGif)}
				<p class="tl-hint tl-preview-note font-mono">
					Pratinjau video MP4 · GIF tetap tersedia untuk unduh/galeri
				</p>
			{/if}
		</div>

		<aside class="tl-panel" aria-label="Pengaturan timelapse">
			<div class="tl-group">
				<span class="tl-label font-mono">Kecepatan</span>
				<div class="speed-grid" role="group" aria-label="Kecepatan putar">
					{#each SPEED_OPTIONS as s (s.v)}
						<button
							type="button"
							class="tab-action-btn speed-btn font-mono"
							class:is-active={speedMul === s.v}
							on:click={() => (speedMul = s.v)}
							aria-pressed={speedMul === s.v}>{s.l}</button
						>
					{/each}
				</div>
			</div>

			<div class="tl-group">
				<span class="tl-label font-mono">Transisi</span>
				<div class="tab-actions" role="group" aria-label="Transisi antar foto">
					<button
						type="button"
						class="tab-action-btn font-mono"
						class:is-active={transition === 'none'}
						on:click={() => (transition = 'none')}
						aria-pressed={transition === 'none'}>Tanpa</button
					>
					<button
						type="button"
						class="tab-action-btn font-mono"
						class:is-active={transition === 'crossfade'}
						on:click={() => (transition = 'crossfade')}
						aria-pressed={transition === 'crossfade'}>Crossfade</button
					>
				</div>
			</div>

			<div class="tl-group">
				<span class="tl-label font-mono">Output video</span>
				<div class="tab-actions" role="group" aria-label="Output video">
					<button
						type="button"
						class="tab-action-btn font-mono"
						class:is-active={makeVideo}
						on:click={() => (makeVideo = true)}
						disabled={!videoSupported}
						aria-pressed={makeVideo}>GIF + Video</button
					>
					<button
						type="button"
						class="tab-action-btn font-mono"
						class:is-active={!makeVideo}
						on:click={() => (makeVideo = false)}
						aria-pressed={!makeVideo}>GIF saja</button
					>
				</div>
				<p class="tl-hint font-mono">
					{videoSupported
						? 'Video MP4 diunduh & diunggah ke galeri.'
						: 'Video MP4 tidak didukung browser ini.'}
				</p>
			</div>

			{#if error}
				<div class="tl-error font-mono" role="alert">
					{error}
					<button type="button" class="tl-retry font-mono" on:click={() => generate(false)}
						>Coba Lagi</button
					>
				</div>
			{/if}

			<div class="tl-actions">
				<button
					type="button"
					class="tab-action-btn font-mono"
					on:click={downloadGif}
					disabled={!hasPreview || generating}
					aria-label="Download GIF timelapse">Download GIF</button
				>
				<button
					type="button"
					class="tab-action-btn font-mono"
					on:click={downloadVideo}
					disabled={!hasVideo || generating}
					aria-label="Download video timelapse">Download Video MP4</button
				>
			</div>

			<div class="tl-footer">
				<button type="button" class="capsule-cta font-mono" on:click={handleNext}>
					{generating ? 'LANJUT (MEMPROSES…)' : 'LANJUT CETAK'}
					<svg
						viewBox="0 0 24 24"
						width="14"
						height="14"
						fill="none"
						stroke="currentColor"
						stroke-width="2.5"
						stroke-linecap="round"
						aria-hidden="true"
					>
						<polyline points="9 18 15 12 9 6" />
					</svg>
				</button>
			</div>
		</aside>
	</div>
</section>

<style>
	.timelapse-screen {
		position: relative;
		height: 100dvh;
		height: 100vh;
		display: flex;
		flex-direction: column;
		background: var(--bg);
		color: var(--fg);
		overflow: hidden;
		user-select: none;
		transition:
			background-color 220ms ease,
			color 220ms ease;
	}
	.tl-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		height: 52px;
		padding: 0 18px;
		border-bottom: 1px solid var(--ring-line);
		background: var(--bg);
		flex-shrink: 0;
		z-index: 20;
	}
	.tl-head-title {
		margin: 0;
		font-size: 1.15rem;
		font-weight: 500;
		color: var(--fg);
		letter-spacing: 0.01em;
	}
	.head-back-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 44px;
		height: 44px;
		padding: 0;
		border: none;
		border-radius: 999px;
		background: transparent;
		color: var(--fg-dim);
		cursor: pointer;
	}
	.head-back-btn:hover {
		color: var(--fg);
		background: var(--ring-line);
	}
	.head-back-btn:focus-visible {
		outline: 2.5px solid var(--focus);
		outline-offset: 2px;
	}
	.head-balance {
		width: 44px;
		height: 44px;
		flex-shrink: 0;
	}
	.tl-body {
		flex: 1;
		display: grid;
		grid-template-columns: 1fr 360px;
		min-height: 0;
		overflow: hidden;
	}
	.tl-preview {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 18px;
		gap: 10px;
		min-height: 0;
	}
	.tl-preview-card {
		width: min(100%, 720px);
		aspect-ratio: 4 / 3;
		max-height: 100%;
		border: 1px solid var(--hairline);
		border-radius: 12px;
		background: var(--veil-edge);
		overflow: hidden;
		display: flex;
		align-items: center;
		justify-content: center;
		box-shadow:
			0 10px 26px rgba(11, 10, 9, 0.18),
			0 0 0 1px var(--ring-line);
	}
	.tl-img {
		width: 100%;
		height: 100%;
		object-fit: contain;
		display: block;
		background: #000;
	}
	.tl-empty {
		padding: 18px;
		text-align: center;
		color: var(--fg-dim);
	}
	.tl-stale {
		max-width: 520px;
		padding: 8px 12px;
		border: 1px solid var(--hairline);
		border-radius: 8px;
		background: var(--veil-edge);
		color: var(--fg);
		font-size: 0.6rem;
		text-align: center;
	}
	.tl-panel {
		border-left: 1px solid var(--ring-line);
		background: var(--bg);
		padding: 14px;
		display: flex;
		flex-direction: column;
		gap: 12px;
		overflow-y: auto;
		min-height: 0;
	}
	.tl-group {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.tl-label {
		font-size: 0.58rem;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--fg-dim);
	}
	.tl-hint {
		margin: 0;
		font-size: 0.58rem;
		color: var(--fg-dim);
		line-height: 1.4;
	}
	.tl-error {
		padding: 10px;
		border: 1px solid #c44;
		border-radius: 8px;
		color: #f66;
		font-size: 0.62rem;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.tl-retry {
		min-height: 44px;
		border: 1px solid currentColor;
		border-radius: 8px;
		background: transparent;
		color: inherit;
		font-size: 0.62rem;
		font-weight: 700;
		cursor: pointer;
	}
	.tab-actions {
		display: flex;
		gap: 8px;
	}
	.speed-grid {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 6px;
	}
	.tab-action-btn {
		flex: 1;
		min-height: 44px;
		padding: 0 8px;
		border: 1px solid var(--hairline);
		border-radius: 8px;
		background: transparent;
		color: var(--fg);
		font-size: 0.62rem;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		cursor: pointer;
		transition:
			border-color 160ms ease,
			background-color 160ms ease;
	}
	.speed-btn {
		min-height: 44px;
		font-size: 0.58rem;
		letter-spacing: 0.02em;
	}
	.tab-action-btn:hover:not(:disabled) {
		border-color: var(--fg);
		background: var(--ring-line);
	}
	.tab-action-btn.is-active {
		background: var(--fg);
		color: var(--bg);
		border-color: var(--fg);
	}
	.tab-action-btn:focus-visible {
		outline: 2.5px solid var(--focus);
		outline-offset: 2px;
	}
	.tab-action-btn:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}
	.tl-actions {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.tl-footer {
		margin-top: auto;
		padding-top: 8px;
		border-top: 1px solid var(--ring-line);
	}
	.capsule-cta {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 10px;
		width: 100%;
		min-height: 44px;
		padding: 0 24px;
		border: none;
		border-radius: 999px;
		background: var(--fg);
		color: var(--bg);
		font-size: 0.72rem;
		font-weight: 800;
		letter-spacing: 0.22em;
		text-transform: uppercase;
		cursor: pointer;
		transition:
			background-color 200ms ease,
			color 200ms ease,
			box-shadow 200ms ease,
			transform 160ms ease;
	}
	.capsule-cta:hover {
		background: transparent;
		color: var(--fg);
		box-shadow:
			inset 0 0 0 2px var(--fg),
			0 0 0 5px var(--halo-h);
		transform: translateY(-2px);
	}
	.capsule-cta:focus-visible {
		outline: 2.5px solid var(--focus);
		outline-offset: 4px;
	}
	@media (max-width: 860px) {
		.tl-body {
			grid-template-columns: 1fr;
			grid-template-rows: minmax(220px, 1fr) auto;
		}
		.tl-panel {
			border-left: none;
			border-top: 1px solid var(--ring-line);
		}
		.speed-grid {
			grid-template-columns: repeat(4, minmax(0, 1fr));
		}
	}
</style>
