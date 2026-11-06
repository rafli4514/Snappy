<script lang="ts">
	import {
		session,
		goTo,
		setRetakeIndex,
		beginCapture,
		autoSelectPhotos,
		toggleSelectedPhoto
	} from '#lib/stores/session';
	import { stopCamera } from '#lib/services/camera';
	import PhotoCard from '#lib/features/review/PhotoCard.svelte';
	import ZoomModal from '#lib/features/review/ZoomModal.svelte';
	import ConfirmRetakeModal from '#lib/features/review/ConfirmRetakeModal.svelte';

	$: photos = $session.photos;
	$: slotCount = $session.photoCount;
	$: selected = $session.selectedPhotoIndices;
	$: isFull = selected.length === slotCount;
	$: canContinue = isFull && photos.length >= slotCount;

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
		if (!canContinue) return;
		goTo('editor');
	}

	function orderOf(index: number): number {
		return selected.indexOf(index) + 1;
	}
</script>

<section
	class="review-screen screen-enter kiosk-scope"
	class:theme-light={$session.theme === 'light'}
	aria-label="Review foto"
>
	<header class="review-head">
		<p class="review-kicker font-mono">LANGKAH 2 · PILIH FOTO</p>
		<h1 class="review-title font-display">Pilih {slotCount} foto favoritmu</h1>
		<p class="review-counter font-mono" role="status">
			<strong>{selected.length}</strong> / {slotCount} dipilih
		</p>
		{#if isFull}
			<p class="review-hint font-mono">Pilihan penuh — lepas satu foto untuk menukar.</p>
		{:else}
			<p class="review-hint font-mono">Ketuk foto untuk memilih atau melepas.</p>
		{/if}
	</header>

	<div class="review-body">
		<div class="photo-grid">
			{#each photos as photo, i (i)}
				<PhotoCard
					{photo}
					index={i}
					selectable
					selected={selected.includes(i)}
					order={orderOf(i)}
					on:zoom={() => zoomModal.open(photo, i)}
					on:retake={() => retakeOne(i)}
					on:toggle={() => toggleSelectedPhoto(i)}
				/>
			{/each}
		</div>
	</div>

	<footer class="review-actions">
		<div class="actions-left">
			<button type="button" class="ghost-cta font-mono" on:click={autoSelectPhotos}>
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
					<path d="M3 6h18M7 12h10M11 18h2" />
				</svg>
				Pilih Otomatis
			</button>

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
		</div>

		<button
			type="button"
			class="capsule-cta font-mono"
			on:click={continueToEditor}
			disabled={!canContinue}
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
<ConfirmRetakeModal bind:this={confirmModal} on:confirm={retakeAll} />

<style>
	@import './_ReviewScreen.css';
</style>
