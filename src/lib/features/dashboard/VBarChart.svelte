<script lang="ts">
	export interface VBarItem {
		label: string;
		value: number;
		sub?: string;
	}

	let {
		items = [],
		titleId = 'vbar-title',
		label = 'Grafik batang',
		empty = 'Belum ada data pada rentang ini.'
	}: {
		items?: VBarItem[];
		titleId?: string;
		label?: string;
		empty?: string;
	} = $props();

	const W = 680;
	const H = 228;
	const PAD_L = 34;
	const PAD_R = 12;
	const PAD_T = 22;
	const PAD_B = 34;
	const PLOT_W = W - PAD_L - PAD_R;
	const PLOT_H = H - PAD_T - PAD_B;

	const maxVal = $derived(Math.max(1, ...items.map((i) => i.value)));
	const hasData = $derived(items.some((i) => i.value > 0));
	const step = $derived(items.length > 12 ? 3 : items.length > 8 ? 2 : 1);
	const ticks = $derived.by(() => {
		const m = maxVal;
		const vals = [0, Math.round(m / 2), m];
		return [...new Set(vals)].sort((a, b) => a - b);
	});
</script>

{#if !items.length || !hasData}
	<p class="vbar-empty">{empty}</p>
{:else}
	<div class="vbar-wrap">
		<svg
			viewBox="0 0 {W} {H}"
			class="vbar-svg"
			role="img"
			aria-labelledby={titleId}
			preserveAspectRatio="xMidYMid meet"
		>
			<title id={titleId}>{label}</title>

			{#each ticks as t (t)}
				{@const y = PAD_T + PLOT_H - (t / maxVal) * PLOT_H}
				<line x1={PAD_L} y1={y} x2={W - PAD_R} y2={y} class="gridline" />
				<text x={PAD_L - 8} y={y + 3.5} text-anchor="end" class="axis-text">{t}</text>
			{/each}

			{#each items as item, idx (item.label + '-' + idx)}
				{@const slotW = PLOT_W / items.length}
				{@const barW = Math.max(8, Math.min(36, slotW * 0.56))}
				{@const x = PAD_L + idx * slotW + (slotW - barW) / 2}
				{@const h = item.value > 0 ? Math.max(5, (item.value / maxVal) * PLOT_H) : 0}
				{@const y = PAD_T + PLOT_H - h}
				<g class="bar-group">
					<title>{item.sub ?? item.label}: {item.value}</title>
					{#if h > 0}
						<rect {x} {y} width={barW} height={h} rx="5" class="bar-fill" />
						<text x={x + barW / 2} y={y - 6} text-anchor="middle" class="val-text">
							{item.value}
						</text>
					{/if}
					{#if idx % step === 0}
						<text x={x + barW / 2} y={H - 10} text-anchor="middle" class="axis-text">
							{item.label}
						</text>
					{/if}
				</g>
			{/each}
		</svg>
	</div>
{/if}

<style>
	.vbar-wrap {
		width: 100%;
		overflow-x: auto;
	}

	.vbar-svg {
		display: block;
		width: 100%;
		min-width: 420px;
		height: auto;
	}

	.gridline {
		stroke: var(--d-border, rgba(148, 163, 184, 0.2));
		stroke-width: 1;
		stroke-dasharray: 3 4;
	}

	.axis-text {
		fill: var(--d-muted, #64748b);
		font-family: var(--font-body);
		font-size: 10.5px;
		font-weight: 600;
	}

	.val-text {
		fill: var(--d-ink, #0f172a);
		font-family: var(--font-body);
		font-size: 10.5px;
		font-weight: 700;
	}

	.bar-fill {
		fill: var(--d-ink, #0f172a);
		fill-opacity: 0.85;
		transition: fill-opacity 150ms ease;
	}

	.bar-group:hover .bar-fill {
		fill-opacity: 1;
	}

	.vbar-empty {
		margin: 0;
		padding: 24px 0;
		text-align: center;
		font-size: 0.82rem;
		color: var(--d-muted, #64748b);
	}
</style>
