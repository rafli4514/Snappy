<script lang="ts">
	type Seg = { label: string; value: number; color: string };
	let {
		segments = [],
		titleId = 'seg-title',
		label = 'Komposisi output'
	}: { segments?: Seg[]; titleId?: string; label?: string } = $props();

	const total = $derived(segments.reduce((s, x) => s + x.value, 0));
	const safe = $derived(segments.filter((x) => x.value > 0));
</script>

<div class="seg" role="img" aria-labelledby={titleId}>
	<span id={titleId} class="sr-only">{label}</span>
	{#if total === 0}
		<p class="empty">Belum ada data sesi.</p>
	{:else}
		<div class="bar" aria-hidden="true">
			{#each safe as seg}
				<div
					class="part"
					style="width:{(seg.value / total) * 100}%; background:{seg.color}"
					title="{seg.label}: {seg.value}"
				></div>
			{/each}
		</div>
		<ul class="legend">
			{#each segments as seg}
				<li class="leg">
					<span class="dot" style="background:{seg.color}" aria-hidden="true"></span>
					<span class="lname">{seg.label}</span>
					<span class="lval font-mono"
						>{seg.value}
						<span class="pct">({total ? Math.round((seg.value / total) * 100) : 0}%)</span></span
					>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.seg {
		width: 100%;
	}
	.bar {
		display: flex;
		width: 100%;
		height: 14px;
		border-radius: 999px;
		overflow: hidden;
		background: color-mix(in srgb, var(--color-base-content, #1c1917) 8%, transparent);
	}
	.part {
		height: 100%;
		min-width: 0;
	}
	.legend {
		margin: 12px 0 0;
		padding: 0;
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.leg {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 0.78rem;
	}
	.dot {
		width: 10px;
		height: 10px;
		border-radius: 999px;
		flex-shrink: 0;
	}
	.lname {
		flex: 1;
		min-width: 0;
		font-weight: 600;
	}
	.lval {
		font-size: 0.72rem;
		opacity: 0.8;
	}
	.pct {
		opacity: 0.75;
	}
	.empty {
		margin: 0;
		font-size: 0.82rem;
		opacity: 0.7;
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}
</style>
