<script lang="ts">
	import { createEventDispatcher } from 'svelte';

	export let photo: string | null = null;
	export let index = 0;

	const dispatch = createEventDispatcher<{ zoom: void; retake: void }>();

	let ratio = '4 / 3';

	function handleImgLoad(e: Event): void {
		const target = e.target as HTMLImageElement | null;
		if (target?.naturalWidth && target?.naturalHeight) {
			ratio = `${target.naturalWidth} / ${target.naturalHeight}`;
		}
	}

	function handleActivate(): void {
		if (!photo) return;
		dispatch('zoom');
	}

	function handleKey(e: KeyboardEvent): void {
		if (!photo) return;
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			handleActivate();
		}
	}

	function handleRetake(e: MouseEvent): void {
		e.stopPropagation();
		dispatch('retake');
	}

	function handleRetakeKey(e: KeyboardEvent): void {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			e.stopPropagation();
			dispatch('retake');
		}
	}

	function handleZoom(e: MouseEvent): void {
		e.stopPropagation();
		dispatch('zoom');
	}

	function handleZoomKey(e: KeyboardEvent): void {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			e.stopPropagation();
			dispatch('zoom');
		}
	}
</script>

<div
	class="photo-slot"
	style="aspect-ratio: {ratio};"
	role="button"
	tabindex="0"
	aria-label="Lihat foto {index + 1} lebih besar"
	on:click={handleActivate}
	on:keydown={handleKey}
>
	{#if photo}
		<img src={photo} alt="Hasil foto {index + 1}" on:load={handleImgLoad} />

		<div class="card-tools">
			<button
				type="button"
				class="tool-btn font-mono"
				aria-label="Perbesar foto {index + 1}"
				on:click={handleZoom}
				on:keydown={handleZoomKey}
			>
				<svg
					viewBox="0 0 24 24"
					width="13"
					height="13"
					fill="none"
					stroke="currentColor"
					stroke-width="2.2"
					stroke-linecap="round"
					stroke-linejoin="round"
					aria-hidden="true"
				>
					<circle cx="11" cy="11" r="7" />
					<path d="m21 21-4.3-4.3" />
				</svg>
			</button>
			<button
				type="button"
				class="tool-btn font-mono"
				aria-label="Ambil ulang foto {index + 1}"
				on:click={handleRetake}
				on:keydown={handleRetakeKey}
			>
				<svg
					viewBox="0 0 24 24"
					width="12"
					height="12"
					fill="none"
					stroke="currentColor"
					stroke-width="2.5"
					stroke-linecap="round"
					stroke-linejoin="round"
					aria-hidden="true"
				>
					<path d="M1 4v6h6" />
					<path d="M3.51 15a9 9 0 1 0 .49-5.5" />
				</svg>
				Ulang
			</button>
		</div>
	{:else}
		<span class="slot-empty font-mono">Foto {index + 1}</span>
	{/if}
</div>

<style>
	.photo-slot {
		position: relative;
		width: 100%;
		border-radius: 8px;
		overflow: hidden;
		background: var(--veil-edge);
		cursor: pointer;
		outline: 2px solid transparent;
		outline-offset: 2px;
		transition: opacity 160ms ease;
	}

	.photo-slot:hover {
		opacity: 0.92;
	}

	.photo-slot:active {
		opacity: 0.85;
	}

	.photo-slot:focus-visible {
		outline: 2.5px solid var(--focus);
		outline-offset: 3px;
	}

	.photo-slot img {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.card-tools {
		position: absolute;
		right: 8px;
		bottom: 8px;
		display: flex;
		gap: 6px;
	}

	.tool-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 5px;
		min-width: 36px;
		min-height: 36px;
		padding: 0 10px;
		border: 1px solid rgba(255, 255, 255, 0.25);
		border-radius: 999px;
		background: rgba(11, 10, 9, 0.6);
		color: #fff;
		font-size: 0.6rem;
		font-weight: 700;
		letter-spacing: 0.15em;
		text-transform: uppercase;
		cursor: pointer;
		opacity: 0;
		transform: translateY(4px);
		transition:
			opacity 180ms ease,
			transform 180ms ease,
			background-color 160ms ease;
	}

	.photo-slot:hover .tool-btn,
	.photo-slot:focus-within .tool-btn {
		opacity: 1;
		transform: translateY(0);
	}

	.tool-btn:hover {
		background: rgba(11, 10, 9, 0.8);
	}

	.tool-btn:active {
		transform: scale(0.96);
	}

	.tool-btn:focus-visible {
		outline: 2.5px solid var(--focus);
		outline-offset: 3px;
		opacity: 1;
		transform: translateY(0);
	}

	.slot-empty {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 0.8rem;
		color: var(--fg-dim);
	}

	@media (prefers-reduced-motion: reduce) {
		.photo-slot,
		.tool-btn {
			transition: none;
		}
	}

	/* Touch devices: always show the controls */
	@media (hover: none) {
		.tool-btn {
			opacity: 1;
			transform: translateY(0);
		}
	}
</style>
