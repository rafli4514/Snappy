<script lang="ts">
	import { FUNCAM_FRAMES, FRAME_CATEGORIES, frameToTemplate } from '#lib/data/funcamFrames';
	import { setCustomTemplate } from '#lib/stores/session';
	import type { FuncamFrame } from '#lib/data/funcamFrames';

	const { allowSelection = true } = $props();

	let activeCategory = $state('All');
	let selectedFrameId = $state<number | null>(null);
	let filteredFrames = $state<FuncamFrame[]>(FUNCAM_FRAMES);

	$effect(() => {
		if (activeCategory === 'All') {
			filteredFrames = FUNCAM_FRAMES;
		} else {
			filteredFrames = FUNCAM_FRAMES.filter((f) => f.category === activeCategory);
		}
	});

	function selectFrame(frame: FuncamFrame): void {
		if (!allowSelection) return;
		selectedFrameId = frame.id;
		setCustomTemplate(frameToTemplate(frame));
	}
</script>

<div class="frame-selector">
	<div class="frame-selector-header">
		<h3 class="frame-selector-title">Pilih Frame</h3>
		<p class="frame-selector-desc">24 frame siap pakai • koordinat presisi 591×1772</p>
	</div>

	<div class="frame-tabs" role="tablist" aria-label="Kategori frame">
		{#each FRAME_CATEGORIES as cat}
			<button
				type="button"
				class="frame-tab"
				class:active={activeCategory === cat}
				onclick={() => (activeCategory = cat)}
				role="tab"
				aria-selected={activeCategory === cat ? 'true' : 'false'}
			>
				{cat}
			</button>
		{/each}
		<button
			type="button"
			class="frame-tab"
			class:active={activeCategory === 'All'}
			onclick={() => (activeCategory = 'All')}
			role="tab"
			aria-selected={activeCategory === 'All' ? 'true' : 'false'}
		>
			All
		</button>
	</div>

	<div class="frame-grid">
		{#each filteredFrames as frame (frame.id)}
			<button
				type="button"
				class="frame-card"
				class:active={selectedFrameId === frame.id}
				onclick={() => selectFrame(frame)}
				aria-label="Frame {frame.name}, {frame.photoCount} foto, kategori {frame.category}"
				disabled={!allowSelection}
			>
				<div class="frame-thumb">
					<svg viewBox="0 0 591 1772" class="frame-thumb-svg" aria-hidden="true">
						<rect width="591" height="1772" fill="var(--p)" rx="0" />
						{#each frame.slots as slot, i (i)}
							{@const cx = ((slot.x + slot.w / 2) / 591) * 100}
							{@const cy = ((slot.y + slot.h / 2) / 1772) * 100}
							{@const sw = (slot.w / 591) * 100}
							{@const sh = (slot.h / 1772) * 100}
							<g transform="rotate({slot.rotation}, {cx}%, {cy}%)">
								<rect
									x={`${(slot.x / 591) * 100}%`}
									y={`${(slot.y / 1772) * 100}%`}
									width={`${sw}%`}
									height={`${sh}%`}
									fill="var(--accent)"
									fill-opacity="0.25"
									stroke="var(--accent)"
									stroke-width="3"
									rx="4"
								/>
							</g>
						{/each}
					</svg>
				</div>
				<div class="frame-info">
					<span class="frame-name">{frame.name}</span>
					<span class="frame-meta">
						<span class="frame-count">{frame.photoCount} foto</span>
						<span class="frame-cat">{frame.category}</span>
					</span>
				</div>
				{#if selectedFrameId === frame.id}
					<div class="frame-check" aria-hidden="true">✓</div>
				{/if}
			</button>
		{/each}
	</div>

	{#if !allowSelection}
		<p class="frame-locked">Frame dikunci oleh admin.</p>
	{/if}
</div>

<style>
	.frame-selector {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	.frame-selector-header {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.frame-selector-title {
		font-size: 1rem;
		font-weight: 700;
		color: var(--fg);
		margin: 0;
	}

	.frame-selector-desc {
		font-size: 0.75rem;
		color: var(--fg-dim);
		margin: 0;
	}

	.frame-tabs {
		display: flex;
		gap: 4px;
		flex-wrap: wrap;
	}

	.frame-tab {
		padding: 4px 12px;
		border-radius: 9999px;
		border: 1px solid var(--hairline);
		background: transparent;
		color: var(--fg-dim);
		font-size: 0.75rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 120ms ease;
	}

	.frame-tab:hover {
		border-color: var(--fg);
		color: var(--fg);
	}

	.frame-tab.active {
		background: var(--fg);
		border-color: var(--fg);
		color: var(--bg);
	}

	.frame-tab:focus-visible {
		outline: 2px solid var(--focus);
		outline-offset: 2px;
	}

	.frame-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
		gap: var(--space-2);
		max-height: 320px;
		overflow-y: auto;
		padding-right: 4px;
	}

	.frame-card {
		position: relative;
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 8px;
		border: 2px solid transparent;
		border-radius: 10px;
		background: var(--surface);
		cursor: pointer;
		transition: all 120ms ease;
		text-align: left;
	}

	.frame-card:hover {
		border-color: var(--fg-dim);
		transform: translateY(-1px);
	}

	.frame-card.active {
		border-color: var(--accent);
		box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 25%, transparent);
	}

	.frame-card:focus-visible {
		outline: 2px solid var(--focus);
		outline-offset: 2px;
	}

	.frame-card:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.frame-thumb {
		position: relative;
		width: 100%;
		aspect-ratio: 591 / 1772;
		border-radius: 6px;
		overflow: hidden;
		background: var(--veil-edge);
	}

	.frame-thumb-svg {
		width: 100%;
		height: 100%;
		display: block;
	}

	.frame-info {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-height: 0;
	}

	.frame-name {
		font-size: 0.7rem;
		font-weight: 700;
		color: var(--fg);
		line-height: 1.3;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
		line-clamp: 2;
		overflow: hidden;
	}

	.frame-meta {
		display: flex;
		gap: 6px;
		font-size: 0.6rem;
		color: var(--fg-dim);
	}

	.frame-count {
		background: var(--ring-line);
		padding: 1px 5px;
		border-radius: 4px;
		font-weight: 600;
	}

	.frame-cat {
		opacity: 0.7;
	}

	.frame-check {
		position: absolute;
		top: 6px;
		right: 6px;
		width: 20px;
		height: 20px;
		border-radius: 50%;
		background: var(--accent);
		color: var(--bg);
		font-size: 0.7rem;
		font-weight: 900;
		display: flex;
		align-items: center;
		justify-content: center;
		box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
	}

	.frame-locked {
		font-size: 0.75rem;
		color: var(--fg-dim);
		font-style: italic;
		padding: 8px;
		text-align: center;
		border-radius: 8px;
		background: var(--surface);
	}
</style>
