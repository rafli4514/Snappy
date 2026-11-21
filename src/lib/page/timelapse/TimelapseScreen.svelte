<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { session, stripPhotos, goTo, setTimelapseResult } from '#lib/stores/session';
	import {
		buildTimelapseGif,
		buildTimelapseVideo,
		type TimelapseTransition
	} from '#lib/utils/timelapse';
	import ThemeToggle from '#lib/components/ui/ThemeToggle.svelte';
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
	<img
		class="bg-frame"
		src="/strip-select/bg-frame.png"
		alt=""
		aria-hidden="true"
		draggable="false"
	/>

	<div class="frame-inner">
		<header class="top-bar">
			<div class="bar-left">
				<button
					type="button"
					class="back-pill"
					on:click={() => goTo('edit')}
					aria-label="Kembali ke edit dan dekorasi"
				>
					<svg
						width="15"
						height="15"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2.4"
						stroke-linecap="round"
						stroke-linejoin="round"
						aria-hidden="true"
					>
						<path d="M15 18l-6-6 6-6" />
					</svg>
					Edit &amp; Dekorasi
				</button>
			</div>

			<h1 class="screen-title">TIMELAPSE</h1>

			<div class="bar-right">
				<ThemeToggle inline />
			</div>
		</header>

		<div class="header-divider" aria-hidden="true"></div>

		<div class="tl-stage">
			<!-- Pratinjau Video / GIF -->
			<main class="preview-stage" aria-label="Pratinjau timelapse">
				<div class="preview-card">
					{#if videoUrl || savedVideo}
						<!-- svelte-ignore a11y_media_has_caption -->
						<video
							src={videoUrl || savedVideo}
							class="preview-media"
							autoplay
							loop
							muted
							playsinline
							controls
							aria-label="Pratinjau video timelapse"
						></video>
					{:else if previewUrl || savedGif}
						<img src={previewUrl || savedGif} alt="Pratinjau timelapse" class="preview-media" />
					{:else if generating}
						<div class="preview-empty">
							<span class="spinner" aria-hidden="true"></span>
							<p>{statusText || 'Menyiapkan timelapse…'}</p>
						</div>
					{:else}
						<div class="preview-empty">
							<p class="empty-title">Belum ada timelapse</p>
							<p class="empty-sub">Timelapse dibuat otomatis dari rangkaian foto sesi.</p>
						</div>
					{/if}
				</div>

				{#if generating}
					<div class="status-pill" role="status">
						<span class="status-dot" aria-hidden="true"></span>
						{statusText || 'Memperbarui timelapse…'}
					</div>
				{:else if hasPreview && !metaMatches && inited}
					<div class="status-pill" role="status">
						<span class="status-dot" aria-hidden="true"></span>
						Menyesuaikan pengaturan…
					</div>
				{/if}
			</main>

			<!-- Panel Pengaturan -->
			<aside class="panel settings-panel" aria-label="Pengaturan timelapse">
				<div class="settings-scroll">
					<div class="setting-card">
						<span class="group-eyebrow">KECEPATAN</span>
						<div class="speed-grid" role="group" aria-label="Kecepatan putar">
							{#each SPEED_OPTIONS as s (s.v)}
								<button
									type="button"
									class="opt-btn"
									class:is-active={speedMul === s.v}
									on:click={() => (speedMul = s.v)}
									aria-pressed={speedMul === s.v}
								>
									{s.l}
								</button>
							{/each}
						</div>
					</div>

					<div class="setting-card">
						<span class="group-eyebrow">TRANSISI</span>
						<div class="opt-row" role="group" aria-label="Transisi antar foto">
							<button
								type="button"
								class="opt-btn"
								class:is-active={transition === 'none'}
								on:click={() => (transition = 'none')}
								aria-pressed={transition === 'none'}
							>
								Tanpa
							</button>
							<button
								type="button"
								class="opt-btn"
								class:is-active={transition === 'crossfade'}
								on:click={() => (transition = 'crossfade')}
								aria-pressed={transition === 'crossfade'}
							>
								Crossfade
							</button>
						</div>
					</div>

					{#if error}
						<div class="error-card" role="alert">
							<p>{error}</p>
							<button type="button" class="retry-btn" on:click={() => generate(false)}>
								Coba Lagi
							</button>
						</div>
					{/if}
				</div>

				<footer class="panel-footer">
					<button type="button" class="btn-next" on:click={handleNext}>
						{generating ? 'Lanjut (Memproses…)' : 'Lanjut Cetak'}
						<svg
							viewBox="0 0 24 24"
							width="15"
							height="15"
							fill="none"
							stroke="currentColor"
							stroke-width="2.4"
							stroke-linecap="round"
							aria-hidden="true"
						>
							<polyline points="9 18 15 12 9 6" />
						</svg>
					</button>
				</footer>
			</aside>
		</div>
	</div>
</section>

<style>
	@import './_TimelapseScreen.css';
</style>
