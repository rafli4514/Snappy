<script lang="ts">
	export interface AreaItem {
		label: string;
		value: number;
		sub?: string;
	}

	let {
		items = [],
		titleId = 'area-title',
		label = 'Grafik area',
		empty = 'Belum ada data pada rentang ini.'
	}: {
		items?: AreaItem[];
		titleId?: string;
		label?: string;
		empty?: string;
	} = $props();

	const W = 720;
	const H = 240;
	const PAD_L = 30;
	const PAD_R = 14;
	const PAD_T = 26;
	const PAD_B = 30;
	const PLOT_W = W - PAD_L - PAD_R;
	const PLOT_H = H - PAD_T - PAD_B;

	let hover = $state<number | null>(null);

	const maxVal = $derived(Math.max(1, ...items.map((i) => i.value)));
	const hasData = $derived(items.some((i) => i.value > 0));
	const step = $derived(items.length > 16 ? 3 : items.length > 9 ? 2 : 1);
	const gradId = $derived(`${titleId}-grad`);

	const points = $derived(
		items.map((item, i) => ({
			x: PAD_L + (items.length === 1 ? PLOT_W / 2 : (i / (items.length - 1)) * PLOT_W),
			y: PAD_T + PLOT_H - (item.value / maxVal) * PLOT_H,
			item
		}))
	);

	/** Kurva halus (Catmull-Rom → Bezier) tanpa overshoot berlebihan. */
	const linePath = $derived.by(() => {
		if (points.length === 0) return '';
		if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
		let d = `M ${points[0].x} ${points[0].y}`;
		for (let i = 0; i < points.length - 1; i++) {
			const p0 = points[i - 1] ?? points[i];
			const p1 = points[i];
			const p2 = points[i + 1];
			const p3 = points[i + 2] ?? p2;
			const t = 0.18;
			const c1x = p1.x + (p2.x - p0.x) * t;
			const c1y = Math.min(PAD_T + PLOT_H, p1.y + (p2.y - p0.y) * t);
			const c2x = p2.x - (p3.x - p1.x) * t;
			const c2y = Math.min(PAD_T + PLOT_H, p2.y - (p3.y - p1.y) * t);
			d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`;
		}
		return d;
	});

	const areaPath = $derived(
		points.length
			? `${linePath} L ${points[points.length - 1].x} ${PAD_T + PLOT_H} L ${points[0].x} ${PAD_T + PLOT_H} Z`
			: ''
	);

	const ticks = $derived([...new Set([0, Math.round(maxVal / 2), maxVal])].sort((a, b) => a - b));
	const slotW = $derived(items.length ? PLOT_W / Math.max(1, items.length - 1) : PLOT_W);
</script>

{#if !items.length || !hasData}
	<div class="area-empty">
		<svg width="44" height="44" viewBox="0 0 24 24" fill="none" aria-hidden="true">
			<path
				d="M3 17l5-5 4 4 8-8"
				stroke="currentColor"
				stroke-width="1.6"
				stroke-linecap="round"
				stroke-linejoin="round"
			/>
		</svg>
		<p>{empty}</p>
	</div>
{:else}
	<div class="area-wrap">
		<svg
			viewBox="0 0 {W} {H}"
			class="area-svg"
			role="img"
			aria-labelledby={titleId}
			preserveAspectRatio="xMidYMid meet"
		>
			<title id={titleId}>{label}</title>
			<defs>
				<linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
					<stop offset="0%" class="grad-top" />
					<stop offset="100%" class="grad-bottom" />
				</linearGradient>
			</defs>

			{#each ticks as t (t)}
				{@const y = PAD_T + PLOT_H - (t / maxVal) * PLOT_H}
				<line x1={PAD_L} y1={y} x2={W - PAD_R} y2={y} class="gridline" />
				<text x={PAD_L - 8} y={y + 3.5} text-anchor="end" class="axis-text">{t}</text>
			{/each}

			<path d={areaPath} fill="url(#{gradId})" class="area-fill" />
			<path d={linePath} class="area-line" />

			{#each points as p, idx (p.item.label + '-' + idx)}
				{#if idx % step === 0 || idx === points.length - 1}
					<text x={p.x} y={H - 8} text-anchor="middle" class="axis-text">{p.item.label}</text>
				{/if}
			{/each}

			{#if hover !== null && points[hover]}
				{@const p = points[hover]}
				{@const tipText = `${p.item.sub ?? p.item.label} · ${p.item.value} sesi`}
				{@const tipW = Math.max(84, tipText.length * 6.4 + 20)}
				{@const tipX = Math.min(Math.max(p.x - tipW / 2, PAD_L), W - PAD_R - tipW)}
				<line x1={p.x} y1={PAD_T} x2={p.x} y2={PAD_T + PLOT_H} class="hover-line" />
				<circle cx={p.x} cy={p.y} r="5.5" class="hover-dot" />
				<g class="tip">
					<rect x={tipX} y={Math.max(2, p.y - 38)} width={tipW} height="24" rx="8" />
					<text x={tipX + tipW / 2} y={Math.max(2, p.y - 38) + 16} text-anchor="middle">
						{tipText}
					</text>
				</g>
			{/if}

			{#each points as p, idx (p.item.label + '-hit-' + idx)}
				<rect
					x={p.x - slotW / 2}
					y={PAD_T}
					width={slotW}
					height={PLOT_H}
					class="hit"
					role="presentation"
					onmouseenter={() => (hover = idx)}
					onmouseleave={() => (hover = null)}
				/>
			{/each}
		</svg>
	</div>
{/if}

<style>
	.area-wrap {
		width: 100%;
		overflow-x: auto;
	}

	.area-svg {
		display: block;
		width: 100%;
		min-width: 460px;
		height: auto;
	}

	.grad-top {
		stop-color: var(--d-accent, #f59e0b);
		stop-opacity: 0.32;
	}

	.grad-bottom {
		stop-color: var(--d-accent, #f59e0b);
		stop-opacity: 0;
	}

	.area-line {
		fill: none;
		stroke: var(--d-accent, #f59e0b);
		stroke-width: 2.6;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	.gridline {
		stroke: var(--d-border, rgba(148, 163, 184, 0.2));
		stroke-width: 1;
		stroke-dasharray: 3 5;
	}

	.axis-text {
		fill: var(--d-muted, #64748b);
		font-family: var(--font-body);
		font-size: 10.5px;
		font-weight: 600;
	}

	.hover-line {
		stroke: var(--d-border-strong, #cbd5e1);
		stroke-width: 1;
	}

	.hover-dot {
		fill: var(--d-surface, #fff);
		stroke: var(--d-accent, #f59e0b);
		stroke-width: 2.6;
	}

	.tip rect {
		fill: var(--d-ink, #0f172a);
	}

	.tip text {
		fill: var(--d-bg, #fff);
		font-family: var(--font-body);
		font-size: 11px;
		font-weight: 700;
	}

	.hit {
		fill: transparent;
		cursor: crosshair;
	}

	.area-empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 8px;
		padding: 42px 0;
		color: var(--d-muted, #64748b);
		text-align: center;
	}

	.area-empty svg {
		opacity: 0.45;
	}

	.area-empty p {
		margin: 0;
		font-size: 0.82rem;
	}
</style>
