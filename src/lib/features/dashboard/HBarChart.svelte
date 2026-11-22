<script lang="ts">
	export interface HBarItem {
		label: string;
		value: number;
	}

	let {
		items = [],
		titleId = 'hbar-title',
		label = 'Distribusi data',
		empty = 'Belum ada data.'
	}: {
		items?: HBarItem[];
		titleId?: string;
		label?: string;
		empty?: string;
	} = $props();

	const total = $derived(items.reduce((sum, i) => sum + i.value, 0));
	const maxVal = $derived(Math.max(1, ...items.map((i) => i.value)));
</script>

{#if !items.length || total === 0}
	<p class="hbar-empty">{empty}</p>
{:else}
	<div class="hbar-list" role="img" aria-labelledby={titleId}>
		<span id={titleId} class="sr-only">{label}</span>
		{#each items as item (item.label)}
			{@const pct = Math.round((item.value / maxVal) * 100)}
			{@const share = total > 0 ? Math.round((item.value / total) * 100) : 0}
			<div class="hbar-row" title="{item.label}: {item.value} ({share}%)">
				<span class="hbar-label">{item.label}</span>
				<div class="hbar-track" aria-hidden="true">
					<span class="hbar-fill" style="width: {item.value > 0 ? Math.max(4, pct) : 0}%;"></span>
				</div>
				<span class="hbar-val">{item.value}</span>
			</div>
		{/each}
	</div>
{/if}

<style>
	.hbar-list {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.hbar-row {
		display: grid;
		grid-template-columns: minmax(0, 110px) minmax(80px, 1fr) auto;
		align-items: center;
		gap: 10px;
	}

	.hbar-label {
		font-size: 0.78rem;
		font-weight: 600;
		color: var(--d-ink, currentColor);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.hbar-track {
		height: 8px;
		border-radius: 999px;
		background: var(--d-surface-2, rgba(148, 163, 184, 0.16));
		overflow: hidden;
	}

	.hbar-fill {
		display: block;
		height: 100%;
		border-radius: 999px;
		background: var(--d-ink, currentColor);
		opacity: 0.82;
		transition: width 260ms ease;
	}

	.hbar-val {
		min-width: 28px;
		text-align: right;
		font-size: 0.78rem;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		color: var(--d-muted, currentColor);
	}

	.hbar-empty {
		margin: 0;
		padding: 18px 0;
		text-align: center;
		font-size: 0.8rem;
		color: var(--d-muted, #64748b);
	}
</style>
