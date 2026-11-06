<script lang="ts">
	import { onMount } from 'svelte';
	import { listFrames } from '#lib/utils/frameStorage';
	import type { PhotoFrame } from '#lib/types';

	let {
		onSelect,
		selectedId = null
	}: {
		onSelect: (frame: PhotoFrame) => void;
		selectedId?: string | null;
	} = $props();

	let frames = $state<PhotoFrame[]>([]);
	let loading = $state(true);

	onMount(async () => {
		frames = await listFrames();
		loading = false;
	});
</script>

<div class="frame-picker">
	{#if loading}
		<p class="frame-note font-mono">MEMUAT FRAME…</p>
	{:else if frames.length === 0}
		<div class="frame-empty">
			<p class="frame-note font-mono">BELUM ADA FRAME TERPASANG</p>
			<a class="frame-link font-mono" href="/admin/frames">BUKA FRAME STUDIO</a>
		</div>
	{:else}
		<div class="frame-grid" role="list">
			{#each frames as frame (frame.id)}
				<button
					type="button"
					class="frame-card"
					class:is-active={selectedId === frame.id}
					onclick={() => onSelect(frame)}
					aria-label="{frame.name}, {frame.slotCount} foto"
					aria-pressed={selectedId === frame.id}
				>
					<span class="frame-thumb">
						<img src={frame.artworkDataUrl} alt="" />
					</span>
					<span class="frame-meta">
						<span class="frame-name">{frame.name}</span>
						<span class="frame-count font-mono">{frame.slotCount} FOTO</span>
					</span>
				</button>
			{/each}
		</div>
		<a class="frame-link font-mono" href="/admin/frames">KELOLA FRAME</a>
	{/if}
</div>

<style>
	.frame-picker {
		width: 100%;
		min-width: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 12px;
	}

	.frame-grid {
		width: 100%;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(132px, 1fr));
		gap: 14px;
		max-height: min(52dvh, 460px);
		overflow-y: auto;
		padding: 4px 6px 10px;
		scrollbar-width: thin;
	}

	.frame-card {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 10px;
		border: 1px solid var(--hairline);
		border-radius: 12px;
		background: transparent;
		color: var(--fg);
		text-align: left;
		cursor: pointer;
		outline: none;
		transition:
			border-color 160ms ease,
			transform 160ms ease,
			box-shadow 160ms ease;
	}

	.frame-card:hover {
		border-color: var(--fg);
		transform: translateY(-2px);
	}

	.frame-card:focus-visible {
		outline: 2.5px solid var(--focus);
		outline-offset: 3px;
	}

	.frame-card.is-active {
		border-color: var(--fg);
		box-shadow: 0 0 0 4px var(--halo-h);
	}

	.frame-thumb {
		display: block;
		aspect-ratio: 1 / 2;
		border-radius: 8px;
		overflow: hidden;
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
		width: 100%;
		height: 100%;
		object-fit: contain;
	}

	.frame-meta {
		display: flex;
		flex-direction: column;
		gap: 3px;
	}

	.frame-name {
		font-size: 0.78rem;
		font-weight: 650;
		line-height: 1.25;
	}

	.frame-count {
		font-size: 0.56rem;
		font-weight: 700;
		letter-spacing: 0.18em;
		color: var(--fg-dim);
	}

	.frame-note {
		font-size: 0.62rem;
		font-weight: 700;
		letter-spacing: 0.22em;
		color: var(--fg-dim);
		margin: 0;
	}

	.frame-empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 14px;
		padding: 34px 0;
	}

	.frame-link {
		font-size: 0.6rem;
		font-weight: 700;
		letter-spacing: 0.2em;
		color: var(--fg-dim);
		text-decoration: none;
		border-bottom: 1px solid var(--hairline);
		padding-bottom: 3px;
	}

	.frame-link:hover {
		color: var(--fg);
		border-color: var(--fg);
	}

	@media (max-width: 900px) {
		.frame-grid {
			grid-template-columns: repeat(auto-fill, minmax(104px, 1fr));
			max-height: min(38dvh, 300px);
		}
	}
</style>
