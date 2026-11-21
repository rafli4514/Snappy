<script lang="ts">
	import { createEventDispatcher } from 'svelte';

	export let photo: string | null = null;
	export let index = 0;

	const dispatch = createEventDispatcher<{ zoom: void; retake: void }>();

	function handleZoom(): void {
		if (!photo) return;
		dispatch('zoom');
	}

	function handleRetake(e: MouseEvent): void {
		e.stopPropagation();
		dispatch('retake');
	}
</script>

<article class="photo-card">
	<button
		type="button"
		class="photo-hit"
		disabled={!photo}
		aria-label="Perbesar foto {index + 1}"
		on:click={handleZoom}
	>
		{#if photo}
			<img src={photo} alt="Hasil foto {index + 1}" draggable="false" />
		{:else}
			<span class="slot-empty">Foto {index + 1}</span>
		{/if}
	</button>

	<span class="photo-num" aria-hidden="true">{index + 1}</span>

	<button
		type="button"
		class="retake-chip"
		aria-label="Ambil ulang foto {index + 1}"
		title="Ambil ulang"
		on:click={handleRetake}
	>
		<svg
			viewBox="0 0 24 24"
			width="14"
			height="14"
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
	</button>
</article>

<style>
	.photo-card {
		position: relative;
		width: 100%;
		height: 100%;
		min-height: 0;
		border: 1px solid var(--card-border);
		border-radius: 14px;
		overflow: hidden;
		background: var(--media-bg);
		transition:
			border-color 160ms ease,
			box-shadow 180ms ease,
			transform 160ms ease;
	}

	.photo-card:hover {
		border-color: var(--card-border-hover);
		box-shadow: var(--card-shadow);
		transform: translateY(-2px);
	}

	.photo-hit {
		display: block;
		width: 100%;
		height: 100%;
		padding: 0;
		border: none;
		background: transparent;
		cursor: pointer;
		outline: none;
	}

	.photo-hit:disabled {
		cursor: default;
	}

	.photo-hit:focus-visible {
		outline: 2.5px solid var(--focus);
		outline-offset: -3px;
		border-radius: 14px;
	}

	.photo-hit img {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
		transition: transform 240ms ease;
	}

	.photo-card:hover .photo-hit img {
		transform: scale(1.02);
	}

	.slot-empty {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 0.82rem;
		font-weight: 600;
		color: var(--muted-ink);
	}

	.photo-num {
		position: absolute;
		top: 10px;
		left: 10px;
		min-width: 26px;
		height: 26px;
		padding: 0 7px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border-radius: 999px;
		background: rgba(15, 23, 42, 0.56);
		color: #ffffff;
		font-size: 0.72rem;
		font-weight: 700;
		backdrop-filter: blur(8px);
		-webkit-backdrop-filter: blur(8px);
		pointer-events: none;
	}

	.retake-chip {
		position: absolute;
		right: 10px;
		bottom: 10px;
		width: 34px;
		height: 34px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border: 1px solid rgba(255, 255, 255, 0.24);
		border-radius: 999px;
		background: rgba(15, 23, 42, 0.58);
		color: #ffffff;
		backdrop-filter: blur(8px);
		-webkit-backdrop-filter: blur(8px);
		cursor: pointer;
		outline: none;
		transition:
			background-color 150ms ease,
			transform 140ms ease;
	}

	.retake-chip:hover {
		background: rgba(15, 23, 42, 0.84);
		transform: scale(1.06);
	}

	.retake-chip:active {
		transform: scale(0.95);
	}

	.retake-chip:focus-visible {
		outline: 2.5px solid var(--focus);
		outline-offset: 2px;
	}

	@media (prefers-reduced-motion: reduce) {
		.photo-card,
		.photo-hit img,
		.retake-chip {
			transition: none;
		}
	}
</style>
