<script lang="ts">
	import { session, goTo, setRetakeIndex, beginCapture } from '#lib/stores/session';
	import { stopCamera } from '#lib/services/camera';
	import ThemeToggle from '#lib/components/ui/ThemeToggle.svelte';
	import PhotoCard from '#lib/features/review/PhotoCard.svelte';
	import ZoomModal from '#lib/features/review/ZoomModal.svelte';
	import ConfirmRetakeModal from '#lib/features/review/ConfirmRetakeModal.svelte';

	$: photos = $session.photos;

	let zoomModal: ZoomModal;
	let confirmModal: ConfirmRetakeModal;

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

<section
	class="review-screen screen-enter kiosk-scope"
	class:theme-light={$session.theme === 'light'}
	aria-label="Review foto"
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

		<div class="review-stage">
			<div class="photo-grid" data-count={photos.length}>
				{#each photos as photo, i (i)}
					<PhotoCard
						{photo}
						index={i}
						on:zoom={() => zoomModal.open(photo, i)}
						on:retake={() => retakeOne(i)}
					/>
				{/each}
			</div>
		</div>
		<p class="bottom-note">
			{photos.length} foto siap · ketuk foto untuk memperbesar atau tekan "Ambil Ulang Semua" untuk mengambil
			ulang foto
		</p>

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
