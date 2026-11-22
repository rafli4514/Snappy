<script lang="ts">
	export interface SegmentItem {
		label: string;
		value: number;
		color: string;
	}

	let {
		segments = [],
		titleId = 'seg-title',
		label = 'Komposisi data',
		empty = 'Belum ada data.'
	}: {
		segments?: SegmentItem[];
		titleId?: string;
		label?: string;
		empty?: string;
	} = $props();

	const total = $derived(segments.reduce((sum, s) => sum + s.value, 0));
</script>

{#if !segments.length || total === 0}
	<p class="seg-empty">{empty}</p>
{:else}
	<div class="seg-wrap" role="img" aria-labelledby={titleId}>
		<span id={titleId} class="sr-only">{label}</span>

		<div class="seg-track" aria-hidden="true">
			{#each segments as seg (seg.label)}
				{#if seg.value > 0}
					{@const pct = (seg.value / total) * 100}
					<span
						class="seg-part"
						style="width: {pct}%; background: {seg.color};"
						title="{seg.label}: {seg.value} ({Math.round(pct)}%)"
					></span>
				{/if}
			{/each}
		</div>

		<ul class="seg-legend">
			{#each segments as seg (seg.label)}
				{@const pct = total > 0 ? Math.round((seg.value / total) * 100) : 0}
				<li class="seg-item">
					<span class="seg-dot" style="background: {seg.color};" aria-hidden="true"></span>
					<span class="seg-name">{seg.label}</span>
					<span class="seg-num">{seg.value} <span class="seg-pct">({pct}%)</span></span>
				</li>
			{/each}
		</ul>
	</div>
{/if}

<style>
	.seg-wrap {
		display: flex;
		flex-direction: column;
		gap: 14px;
	}

	.seg-track {
		display: flex;
		height: 12px;
		width: 100%;
		border-radius: 999px;
		overflow: hidden;
		gap: 2px;
		background: var(--d-surface-2, rgba(148, 163, 184, 0.16));
	}

	.seg-part {
		display: block;
		height: 100%;
		min-width: 4px;
		transition: width 260ms ease;
	}

	.seg-legend {
		margin: 0;
		padding: 0;
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.seg-item {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 0.78rem;
	}

	.seg-dot {
		width: 9px;
		height: 9px;
		border-radius: 999px;
		flex-shrink: 0;
	}

	.seg-name {
		flex: 1;
		font-weight: 600;
		color: var(--d-ink, currentColor);
	}

	.seg-num {
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		color: var(--d-ink, currentColor);
	}

	.seg-pct {
		font-weight: 600;
		color: var(--d-muted, currentColor);
	}

	.seg-empty {
		margin: 0;
		padding: 18px 0;
		text-align: center;
		font-size: 0.8rem;
		color: var(--d-muted, #64748b);
	}
</style>
