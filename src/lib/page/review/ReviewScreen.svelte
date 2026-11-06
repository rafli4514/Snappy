<script lang="ts">
	import { session, goTo, setRetakeIndex, beginCapture } from '#lib/stores/session';
	import { stopCamera } from '#lib/services/camera';
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
	<header class="review-head">
		<p class="review-kicker font-mono">LANGKAH 2 · REVIEW</p>
		<h1 class="review-title font-display">Cek {photos.length} foto kamu</h1>
		<p class="review-hint font-mono">
			Ketuk foto untuk melihat besar · ambil ulang jika kurang jelas
		</p>
	</header>

	<div class="review-body">
		<div class="photo-grid">
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

	<footer class="review-actions">
		<button type="button" class="ghost-cta font-mono" on:click={() => confirmModal.open()}>
			<svg
				viewBox="0 0 24 24"
				width="14"
				height="14"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
				aria-hidden="true"
			>
				<path d="M1 4v6h6" />
				<path d="M23 20v-6h-6" />
				<path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4-4.64 4.36A9 9 0 0 1 3.51 15" />
			</svg>
			Ambil Ulang Semua
		</button>

		<button
			type="button"
			class="capsule-cta font-mono"
			on:click={continueToEditor}
			disabled={photos.length === 0}
			aria-label="Lanjut desain strip"
		>
			Desain Strip
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
	</footer>
</section>

<ZoomModal bind:this={zoomModal} on:retake={(e) => retakeOne(e.detail)} />
<ConfirmRetakeModal bind:this={confirmModal} count={photos.length} on:confirm={retakeAll} />

<style>
	@import './_ReviewScreen.css';
</style>
