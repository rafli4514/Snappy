<script lang="ts">
	import { onMount } from 'svelte';
	import { cubicOut } from 'svelte/easing';
	import type { TransitionConfig } from 'svelte/transition';
	import { session, goTo, setRetakeIndex, beginCapture } from '#lib/stores/session';
	import { stopCamera } from '#lib/services/camera';
	import ThemeToggle from '#lib/components/ui/ThemeToggle.svelte';
	import StudioFrame from '#lib/components/ui/StudioFrame.svelte';
	import ZoomModal from '#lib/features/review/ZoomModal.svelte';
	import ConfirmRetakeModal from '#lib/features/review/ConfirmRetakeModal.svelte';

	const AUTO_SLIDE_MS = 3000;

	$: photos = $session.photos;

	let activeIndex = 0;
	let slideDir: 1 | -1 = 1;
	let photoAspect = 4 / 3;
	let progressKey = 0;
	let autoTimer: ReturnType<typeof setInterval> | null = null;
	let mounted = false;
	let lastPhotoCount = -1;

	let zoomModal: ZoomModal;
	let confirmModal: ConfirmRetakeModal;

	// Deteksi geser (swipe) pada panggung utama untuk berpindah foto
	let swipeStartX: number | null = null;
	let swipeStartY: number | null = null;
	let suppressZoom = false;

	$: if (photos.length === 0) {
		activeIndex = 0;
	} else if (activeIndex >= photos.length) {
		activeIndex = photos.length - 1;
	}

	$: activePhoto = photos[activeIndex] ?? null;

	$: if (mounted && photos.length !== lastPhotoCount) {
		lastPhotoCount = photos.length;
		progressKey += 1;
		startAutoSlide();
	}

	function stopAutoSlide(): void {
		if (autoTimer) {
			clearInterval(autoTimer);
			autoTimer = null;
		}
	}

	function startAutoSlide(): void {
		stopAutoSlide();
		if (photos.length <= 1) return;
		autoTimer = setInterval(() => {
			if (swipeStartX !== null) return;
			if (typeof document !== 'undefined' && document.querySelector('dialog[open]')) return;
			slideDir = 1;
			activeIndex = (activeIndex + 1) % photos.length;
			progressKey += 1;
		}, AUTO_SLIDE_MS);
	}

	onMount(() => {
		mounted = true;
		lastPhotoCount = photos.length;
		startAutoSlide();
		return () => {
			mounted = false;
			stopAutoSlide();
		};
	});

	function handleImgLoad(e: Event): void {
		const img = e.currentTarget as HTMLImageElement;
		if (img.naturalWidth > 0 && img.naturalHeight > 0) {
			photoAspect = img.naturalWidth / img.naturalHeight;
		}
	}

	function slidePhoto(
		_node: Element,
		{ dir, kind }: { dir: 1 | -1; kind: 'in' | 'out' }
	): TransitionConfig {
		const reduced =
			typeof window !== 'undefined' &&
			window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		if (reduced) {
			return { duration: 0 };
		}
		return {
			duration: kind === 'in' ? 320 : 280,
			easing: cubicOut,
			css: (t, u) => {
				const shift = kind === 'in' ? dir * u * 26 : -dir * u * 26;
				const scale = 0.96 + 0.04 * t;
				return `transform: translate3d(${shift}%, 0, 0) scale(${scale}); opacity: ${t};`;
			}
		};
	}

	function selectPhoto(index: number): void {
		if (index < 0 || index >= photos.length || index === activeIndex) return;
		slideDir = index > activeIndex ? 1 : -1;
		activeIndex = index;
		progressKey += 1;
		startAutoSlide();
	}

	function prevPhoto(): void {
		if (photos.length <= 1) return;
		slideDir = -1;
		activeIndex = (activeIndex - 1 + photos.length) % photos.length;
		progressKey += 1;
		startAutoSlide();
	}

	function nextPhoto(): void {
		if (photos.length <= 1) return;
		slideDir = 1;
		activeIndex = (activeIndex + 1) % photos.length;
		progressKey += 1;
		startAutoSlide();
	}

	function handleHeroPointerDown(e: PointerEvent): void {
		if (photos.length <= 1 || e.button !== 0) return;
		if ((e.target as HTMLElement | null)?.closest('button.hero-retake')) return;
		swipeStartX = e.clientX;
		swipeStartY = e.clientY;
	}

	function handleHeroPointerUp(e: PointerEvent): void {
		if (swipeStartX === null || swipeStartY === null) return;
		const dx = e.clientX - swipeStartX;
		const dy = e.clientY - swipeStartY;
		swipeStartX = null;
		swipeStartY = null;

		if (Math.abs(dx) >= 48 && Math.abs(dx) > Math.abs(dy) * 1.2) {
			suppressZoom = true;
			if (dx < 0) nextPhoto();
			else prevPhoto();
		}
	}

	function handleHeroClick(): void {
		if (suppressZoom) {
			suppressZoom = false;
			return;
		}
		if (activePhoto) {
			zoomModal.open(activePhoto, activeIndex);
		}
	}

	function handleKeyDown(e: KeyboardEvent): void {
		if (photos.length <= 1) return;
		if (document.querySelector('dialog[open]')) return;
		if (e.key === 'ArrowLeft') {
			e.preventDefault();
			prevPhoto();
		} else if (e.key === 'ArrowRight') {
			e.preventDefault();
			nextPhoto();
		}
	}

	function retakeOne(index: number): void {
		setRetakeIndex(index);
		goTo('camera');
	}

	function retakeAll(): void {
		stopCamera();
		beginCapture();
	}

	function continueToEditor(): void {
		goTo('editor');
	}
</script>

<svelte:window on:keydown={handleKeyDown} />

<section
	class="review-screen screen-enter kiosk-scope"
	class:theme-light={$session.theme === 'light'}
	aria-label="Review foto"
>
	<StudioFrame />

	<div class="frame-inner">
		<header class="top-bar">
			<div class="bar-left">
				<button
					type="button"
					class="brand-back-btn"
					on:click={() => goTo('start')}
					aria-label="Kembali ke halaman awal"
					title="Kembali ke halaman awal"
				>
					<img
						class="brand-logo"
						src="/landingPage/logo.svg"
						alt="DI'STUDIO"
						width="217"
						height="81"
						draggable="false"
					/>
				</button>
			</div>

			<h1 class="screen-title">REVIEW FOTO</h1>

			<div class="bar-right">
				<ThemeToggle inline />
			</div>
		</header>

		<div class="header-divider" aria-hidden="true"></div>

		<div class="spotlight-layout">
			<!-- Panggung utama: kontainer pas mengikuti rasio foto dengan slide otomatis -->
			<div class="hero-stage">
				{#if photos.length > 1}
					<button
						type="button"
						class="nav-arrow is-prev"
						on:click={prevPhoto}
						aria-label="Foto sebelumnya"
					>
						<svg
							viewBox="0 0 24 24"
							width="20"
							height="20"
							fill="none"
							stroke="currentColor"
							stroke-width="2.4"
							stroke-linecap="round"
							stroke-linejoin="round"
							aria-hidden="true"
						>
							<path d="M15 18l-6-6 6-6" />
						</svg>
					</button>
				{/if}

				<div class="hero-slot">
					<div
						class="hero-card"
						style="--photo-ar: {photoAspect};"
						role="region"
						aria-roledescription="carousel"
						aria-label="Pratinjau foto"
						on:pointerdown={handleHeroPointerDown}
						on:pointerup={handleHeroPointerUp}
						on:pointercancel={() => {
							swipeStartX = null;
							swipeStartY = null;
						}}
					>
						{#if activePhoto}
							{#key activeIndex}
								<button
									type="button"
									class="hero-hit"
									in:slidePhoto={{ dir: slideDir, kind: 'in' }}
									out:slidePhoto={{ dir: slideDir, kind: 'out' }}
									on:click={handleHeroClick}
									aria-label="Perbesar foto {activeIndex + 1}"
								>
									<img
										src={activePhoto}
										alt="Hasil foto {activeIndex + 1}"
										class="hero-img"
										on:load={handleImgLoad}
										draggable="false"
									/>
								</button>
							{/key}
						{:else}
							<span class="hero-empty">Belum ada foto</span>
						{/if}

						{#if photos.length > 0}
							<span class="hero-counter" aria-live="polite">
								Foto {activeIndex + 1} / {photos.length}
							</span>

							<button
								type="button"
								class="hero-retake"
								on:click={() => retakeOne(activeIndex)}
								aria-label="Ambil ulang foto {activeIndex + 1}"
							>
								<svg
									viewBox="0 0 24 24"
									width="15"
									height="15"
									fill="none"
									stroke="currentColor"
									stroke-width="2.2"
									stroke-linecap="round"
									stroke-linejoin="round"
									aria-hidden="true"
								>
									<path d="M1 4v6h6" />
									<path d="M3.51 15a9 9 0 1 0 .49-5.5" />
								</svg>
								Ambil Ulang Foto {activeIndex + 1}
							</button>
						{/if}

						{#if photos.length > 1}
							<div class="auto-bar" aria-hidden="true">
								{#key progressKey}
									<span class="auto-fill" style="animation-duration: {AUTO_SLIDE_MS}ms;"></span>
								{/key}
							</div>
						{/if}
					</div>
				</div>

				{#if photos.length > 1}
					<button
						type="button"
						class="nav-arrow is-next"
						on:click={nextPhoto}
						aria-label="Foto berikutnya"
					>
						<svg
							viewBox="0 0 24 24"
							width="20"
							height="20"
							fill="none"
							stroke="currentColor"
							stroke-width="2.4"
							stroke-linecap="round"
							stroke-linejoin="round"
							aria-hidden="true"
						>
							<path d="M9 18l6-6-6-6" />
						</svg>
					</button>
				{/if}
			</div>

			<!-- Deretan thumbnail di bawah -->
			{#if photos.length > 1}
				<div class="thumb-strip" role="tablist" aria-label="Pilih foto untuk ditinjau">
					{#each photos as photo, i (i)}
						<button
							type="button"
							role="tab"
							class="thumb-btn"
							class:is-active={i === activeIndex}
							aria-selected={i === activeIndex}
							aria-label="Lihat foto {i + 1}"
							on:click={() => selectPhoto(i)}
						>
							{#if photo}
								<img src={photo} alt="" draggable="false" />
							{:else}
								<span class="thumb-empty">{i + 1}</span>
							{/if}
							<span class="thumb-num" aria-hidden="true">{i + 1}</span>
						</button>
					{/each}
				</div>
			{/if}
		</div>

		<footer class="bottom-bar">
			<button type="button" class="btn-outline" on:click={() => confirmModal.open()}>
				Ambil Ulang Semua
			</button>

			<button
				type="button"
				class="btn-solid"
				on:click={continueToEditor}
				disabled={photos.length === 0}
				aria-label="Lanjut ke desain strip"
			>
				Lanjut
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
	</div>
</section>

<ZoomModal bind:this={zoomModal} on:retake={(e) => retakeOne(e.detail)} />
<ConfirmRetakeModal bind:this={confirmModal} count={photos.length} on:confirm={retakeAll} />

<style>
	@import './_ReviewScreen.css';
</style>
