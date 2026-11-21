<script lang="ts">
	type Item = { label: string; value: number; sub?: string };
	let {
		items = [],
		titleId = 'vbar-title',
		label = 'Grafik batang'
	}: { items?: Item[]; titleId?: string; label?: string } = $props();

	const W = 520;
	const H = 180;
	const pad = { t: 12, r: 10, b: 34, l: 28 };
	const max = $derived(Math.max(1, ...items.map((i) => i.value)));
	const innerW = W - pad.l - pad.r;
	const innerH = H - pad.t - pad.b;
	const barW = $derived(items.length ? Math.min(44, (innerW / items.length) * 0.62) : 20);
	const gap = $derived(items.length ? innerW / items.length : innerW);

	function y(v: number) {
		return pad.t + innerH - (v / max) * innerH;
	}
	function h(v: number) {
		return Math.max(v > 0 ? 2 : 0, (v / max) * innerH);
	}
</script>

<svg
	viewBox={`0 0 ${W} ${H}`}
	class="chart-svg"
	role="img"
	aria-labelledby={titleId}
	preserveAspectRatio="xMidYMid meet"
>
	<title id={titleId}>{label}</title>
	{#each [0, 0.25, 0.5, 0.75, 1] as t}
		{@const gy = pad.t + innerH - t * innerH}
		<line x1={pad.l} x2={W - pad.r} y1={gy} y2={gy} class="grid" />
	{/each}
	{#each items as item, i}
		{@const cx = pad.l + i * gap + gap / 2}
		<rect
			x={cx - barW / 2}
			y={y(item.value)}
			width={barW}
			height={h(item.value)}
			rx="4"
			class="bar"
			class:zero={item.value === 0}
		>
			<title>{item.label}: {item.value} sesi{item.sub ? ` (${item.sub})` : ''}</title>
		</rect>
		{#if item.value > 0}
			<text x={cx} y={y(item.value) - 5} text-anchor="middle" class="val">{item.value}</text>
		{/if}
		{@const step = items.length > 12 ? Math.ceil(items.length / 8) : 1}
		{#if i % step === 0 || i === items.length - 1}
			<text x={cx} y={H - 12} text-anchor="middle" class="lbl">{item.label}</text>
		{/if}
	{/each}
</svg>

<style>
	.chart-svg {
		width: 100%;
		height: auto;
		display: block;
	}
	.grid {
		stroke: var(--color-base-content, #1c1917);
		stroke-opacity: 0.08;
		stroke-width: 1;
	}
	.bar {
		fill: #d97706;
		fill-opacity: 0.85;
	}
	.bar.zero {
		fill: var(--color-base-content, #1c1917);
		fill-opacity: 0.08;
	}
	.val {
		font: 700 10px var(--font-mono, ui-monospace, monospace);
		fill: var(--color-base-content, #1c1917);
		fill-opacity: 0.8;
	}
	.lbl {
		font: 600 10px var(--font-mono, ui-monospace, monospace);
		fill: var(--color-base-content, #1c1917);
		fill-opacity: 0.65;
	}
</style>
