<script lang="ts">
	type Item = { label: string; value: number };
	let {
		items = [],
		titleId = 'hbar-title',
		label = 'Grafik batang horizontal',
		empty = 'Tidak ada data.'
	}: { items?: Item[]; titleId?: string; label?: string; empty?: string } = $props();

	const max = $derived(Math.max(1, ...items.map((i) => i.value)));
	const total = $derived(items.reduce((s, i) => s + i.value, 0));
</script>

<div class="hbar" role="img" aria-labelledby={titleId}>
	<span id={titleId} class="sr-only">{label}</span>
	{#if items.length === 0 || total === 0}
		<p class="empty">{empty}</p>
	{:else}
		<ul class="rows">
			{#each items as item}
				{@const pct = (item.value / max) * 100}
				<li class="row">
					<span class="name" title={item.label}>{item.label}</span>
					<div class="track" aria-hidden="true">
						<div class="fill" style="width:{pct}%"></div>
					</div>
					<span class="num font-mono">{item.value}</span>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.hbar {
		width: 100%;
	}
	.rows {
		margin: 0;
		padding: 0;
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.row {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(80px, 1.6fr) auto;
		align-items: center;
		gap: 10px;
	}
	.name {
		font-size: 0.78rem;
		font-weight: 600;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		opacity: 0.9;
	}
	.track {
		height: 10px;
		border-radius: 999px;
		background: color-mix(in srgb, var(--color-base-content, #1c1917) 8%, transparent);
		overflow: hidden;
	}
	.fill {
		height: 100%;
		border-radius: 999px;
		background: #d97706;
		opacity: 0.85;
		min-width: 0;
	}
	.num {
		font-size: 0.72rem;
		font-weight: 700;
		min-width: 2ch;
		text-align: right;
		opacity: 0.8;
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
