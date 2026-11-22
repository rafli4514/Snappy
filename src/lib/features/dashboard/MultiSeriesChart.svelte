<script lang="ts">
	export interface SeriesDef {
		key: string;
		label: string;
		color: string;
		values: number[];
	}

	let {
		buckets = [],
		series = [],
		titleId = 'ms-chart',
		label = 'Grafik seri waktu',
		mode = 'bar',
		height = 230,
		allowToggleMode = false,
		unit = 'sesi',
		empty = 'Belum ada data pada rentang waktu ini.'
	}: {
		buckets?: { label: string; sub?: string }[];
		series?: SeriesDef[];
		titleId?: string;
		label?: string;
		mode?: 'bar' | 'line';
		height?: number;
		allowToggleMode?: boolean;
		unit?: string;
		empty?: string;
	} = $props();

	let chartMode = $state<'bar' | 'line'>('bar');
	let hiddenKeys = $state<Set<string>>(new Set());
	let hoverIdx = $state<number | null>(null);

	$effect(() => {
		chartMode = mode;
	});

	const W = 760;
	const PAD_L = 32;
	const PAD_R = 14;
	const PAD_T = 16;
	const PAD_B = 30;

	const H = $derived(height);
	const PLOT_W = W - PAD_L - PAD_R;
	const PLOT_H = $derived(H - PAD_T - PAD_B);

	const visibleSeries = $derived(series.filter((s) => !hiddenKeys.has(s.key)));

	const totalsPerBucket = $derived.by(() =>
		buckets.map((_, i) => visibleSeries.reduce((sum, s) => sum + (s.values[i] ?? 0), 0))
	);

	const maxLineVal = $derived(
		Math.max(1, ...visibleSeries.flatMap((s) => s.values.map((v) => v || 0)))
	);

	const maxStackVal = $derived(Math.max(1, ...totalsPerBucket));
	const yMax = $derived(chartMode === 'bar' ? maxStackVal : maxLineVal);
	const hasAnyData = $derived(totalsPerBucket.some((v) => v > 0));
	const tickStep = $derived(buckets.length > 20 ? 3 : buckets.length > 10 ? 2 : 1);

	const yTicks = $derived.by(() => {
		const vals = [0, Math.round(yMax / 2), yMax];
		return [...new Set(vals)].sort((a, b) => a - b);
	});

	const slotW = $derived(buckets.length > 0 ? PLOT_W / buckets.length : PLOT_W);

	function xCenter(idx: number): number {
		if (chartMode === 'line') {
			return buckets.length <= 1
				? PAD_L + PLOT_W / 2
				: PAD_L + (idx / (buckets.length - 1)) * PLOT_W;
		}
		return PAD_L + idx * slotW + slotW / 2;
	}

	function yPos(val: number): number {
		return PAD_T + PLOT_H - (val / yMax) * PLOT_H;
	}

	function linePath(vals: number[]): string {
		if (vals.length === 0) return '';
		return vals
			.map((v, i) => `${i === 0 ? 'M' : 'L'} ${xCenter(i).toFixed(1)} ${yPos(v).toFixed(1)}`)
			.join(' ');
	}

	function toggleSeries(key: string): void {
		const next = new Set(hiddenKeys);
		if (next.has(key)) {
			next.delete(key);
		} else {
			if (next.size < series.length - 1) next.add(key);
		}
		hiddenKeys = next;
	}

	const hoverBreakdown = $derived.by(() => {
		if (hoverIdx === null || !buckets[hoverIdx]) return null;
		const i = hoverIdx;
		const rows = visibleSeries
			.map((s) => ({ label: s.label, color: s.color, value: s.values[i] ?? 0 }))
			.filter((r) => r.value > 0)
			.sort((a, b) => b.value - a.value);
		const total = rows.reduce((sum, r) => sum + r.value, 0);
		return {
			title: buckets[i].sub ?? buckets[i].label,
			total,
			rows
		};
	});
</script>

<div class="ms-root">
	<div class="ms-stage">
		{#if !buckets.length}
			<p class="ms-empty">{empty}</p>
		{:else}
			<div class="ms-scroll">
				<svg
					viewBox="0 0 {W} {H}"
					class="ms-svg"
					role="img"
					aria-labelledby={titleId}
					preserveAspectRatio="xMidYMid meet"
				>
					<title id={titleId}>{label}</title>

					<!-- Garis bantu horizontal tipis -->
					{#each yTicks as t (t)}
						{@const y = yPos(t)}
						<line x1={PAD_L} y1={y} x2={W - PAD_R} y2={y} class="ms-hgrid" />
						<text x={PAD_L - 8} y={y + 3.5} text-anchor="end" class="ms-axis">{t}</text>
					{/each}

					<!-- Garis vertikal putus-putus gaya OpenRouter -->
					{#each buckets as b, idx (b.label + '-v-' + idx)}
						{#if idx % tickStep === 0 || idx === buckets.length - 1}
							{@const x = xCenter(idx)}
							<line x1={x} y1={PAD_T} x2={x} y2={PAD_T + PLOT_H} class="ms-vgrid" />
							<text {x} y={H - 8} text-anchor="middle" class="ms-axis">{b.label}</text>
						{/if}
					{/each}

					<!-- Data Bar Tumpuk atau Multi-Garis -->
					{#if hasAnyData}
						{#if chartMode === 'bar'}
							{@const barW = Math.max(4, Math.min(26, slotW * 0.56))}
							{#each buckets as b, bIdx (b.label + '-b-' + bIdx)}
								{@const x = PAD_L + bIdx * slotW + (slotW - barW) / 2}
								{@const segs = (() => {
									let acc = 0;
									return visibleSeries.map((s) => {
										const v = s.values[bIdx] ?? 0;
										const yBottom = yPos(acc);
										acc += v;
										const yTop = yPos(acc);
										return {
											key: s.key,
											color: s.color,
											v,
											y: yTop,
											h: Math.max(0, yBottom - yTop)
										};
									});
								})()}
								{#each segs as seg (seg.key)}
									{#if seg.v > 0 && seg.h > 0}
										<rect
											{x}
											y={seg.y}
											width={barW}
											height={Math.max(2, seg.h)}
											rx="2"
											fill={seg.color}
											class="ms-bar"
											class:is-dim={hoverIdx !== null && hoverIdx !== bIdx}
										/>
									{/if}
								{/each}
							{/each}
						{:else}
							{#each visibleSeries as s (s.key)}
								<path d={linePath(s.values)} stroke={s.color} class="ms-line" />
								{#if hoverIdx !== null}
									{@const val = s.values[hoverIdx] ?? 0}
									{#if val > 0}
										<circle
											cx={xCenter(hoverIdx)}
											cy={yPos(val)}
											r="4"
											fill={s.color}
											class="ms-dot"
										/>
									{/if}
								{/if}
							{/each}
						{/if}
					{/if}

					<!-- Garis sorot hover -->
					{#if hoverIdx !== null && buckets[hoverIdx]}
						<line
							x1={xCenter(hoverIdx)}
							y1={PAD_T}
							x2={xCenter(hoverIdx)}
							y2={PAD_T + PLOT_H}
							class="ms-hover-line"
						/>
					{/if}

					<!-- Area hit interaksi -->
					{#each buckets as b, idx (b.label + '-hit-' + idx)}
						<rect
							x={PAD_L + idx * slotW}
							y={PAD_T}
							width={slotW}
							height={PLOT_H}
							class="ms-hit"
							role="presentation"
							onmouseenter={() => (hoverIdx = idx)}
							onmouseleave={() => (hoverIdx = null)}
						/>
					{/each}
				</svg>
			</div>

			{#if !hasAnyData}
				<p class="ms-zero-note">{empty}</p>
			{/if}

			{#if hoverBreakdown}
				<div class="ms-tooltip" role="status">
					<div class="ms-tt-head">
						<span>{hoverBreakdown.title}</span>
						<strong class="d-num">{hoverBreakdown.total} {unit}</strong>
					</div>
					{#if hoverBreakdown.rows.length > 0}
						<div class="ms-tt-rows">
							{#each hoverBreakdown.rows.slice(0, 5) as row (row.label)}
								<div class="ms-tt-row">
									<span class="ms-tt-dot" style="background:{row.color}"></span>
									<span class="ms-tt-name">{row.label}</span>
									<span class="ms-tt-val d-num">{row.value}</span>
								</div>
							{/each}
						</div>
					{/if}
				</div>
			{/if}
		{/if}
	</div>

	{#if series.length > 0}
		<div class="ms-legend-bar">
			<div class="ms-legend">
				{#each series as s (s.key)}
					{@const isHidden = hiddenKeys.has(s.key)}
					<button
						type="button"
						class="ms-leg-item"
						class:is-off={isHidden}
						onclick={() => toggleSeries(s.key)}
						aria-pressed={!isHidden}
					>
						<span class="ms-leg-dot" style="background:{s.color}"></span>
						<span>{s.label}</span>
					</button>
				{/each}
			</div>

			{#if allowToggleMode}
				<div class="ms-mode-switch" role="group" aria-label="Tipe grafik">
					<button
						type="button"
						class="ms-mode-btn"
						class:is-active={chartMode === 'bar'}
						onclick={() => (chartMode = 'bar')}
						title="Grafik Batang"
					>
						Batang
					</button>
					<button
						type="button"
						class="ms-mode-btn"
						class:is-active={chartMode === 'line'}
						onclick={() => (chartMode = 'line')}
						title="Grafik Garis"
					>
						Garis
					</button>
				</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	.ms-root {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.ms-stage {
		position: relative;
	}

	.ms-scroll {
		width: 100%;
		overflow-x: auto;
	}

	.ms-svg {
		display: block;
		width: 100%;
		min-width: 440px;
		height: auto;
	}

	.ms-hgrid {
		stroke: var(--d-border);
		stroke-width: 1;
	}

	.ms-vgrid {
		stroke: var(--d-border);
		stroke-width: 1;
		stroke-dasharray: 2 4;
		opacity: 0.7;
	}

	.ms-axis {
		fill: var(--d-muted);
		font-family: var(--font-body);
		font-size: 10.5px;
		font-weight: 600;
	}

	.ms-bar {
		transition: opacity 120ms ease;
	}

	.ms-bar.is-dim {
		opacity: 0.35;
	}

	.ms-line {
		fill: none;
		stroke-width: 2;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	.ms-dot {
		stroke: var(--d-surface);
		stroke-width: 2;
	}

	.ms-hover-line {
		stroke: var(--d-border-strong);
		stroke-width: 1;
	}

	.ms-hit {
		fill: transparent;
		cursor: crosshair;
	}

	.ms-empty,
	.ms-zero-note {
		margin: 4px 0 0;
		text-align: center;
		font-size: 0.78rem;
		color: var(--d-muted);
	}

	.ms-tooltip {
		position: absolute;
		top: 8px;
		right: 10px;
		min-width: 170px;
		max-width: 240px;
		padding: 10px 12px;
		border: 1px solid var(--d-border-strong);
		border-radius: 12px;
		background: color-mix(in srgb, var(--d-surface) 96%, transparent);
		backdrop-filter: blur(8px);
		box-shadow: var(--d-shadow);
		pointer-events: none;
		display: flex;
		flex-direction: column;
		gap: 6px;
		z-index: 4;
	}

	.ms-tt-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		font-size: 0.74rem;
		color: var(--d-muted);
		padding-bottom: 5px;
		border-bottom: 1px solid var(--d-border);
	}

	.ms-tt-head strong {
		color: var(--d-ink);
		font-weight: 800;
	}

	.ms-tt-rows {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.ms-tt-row {
		display: flex;
		align-items: center;
		gap: 7px;
		font-size: 0.74rem;
	}

	.ms-tt-dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.ms-tt-name {
		flex: 1;
		color: var(--d-ink);
		font-weight: 600;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.ms-tt-val {
		font-weight: 800;
		color: var(--d-ink);
	}

	.ms-legend-bar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		padding-top: 8px;
		border-top: 1px solid var(--d-border);
	}

	.ms-legend {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px 14px;
	}

	.ms-leg-item {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 2px 0;
		border: none;
		background: transparent;
		color: var(--d-ink);
		font-family: var(--font-body);
		font-size: 0.74rem;
		font-weight: 600;
		cursor: pointer;
		transition: opacity 140ms ease;
	}

	.ms-leg-item.is-off {
		opacity: 0.36;
		text-decoration: line-through;
	}

	.ms-leg-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.ms-mode-switch {
		display: inline-flex;
		align-items: center;
		gap: 2px;
		padding: 2px;
		border: 1px solid var(--d-border);
		border-radius: 8px;
		background: var(--d-bg);
	}

	.ms-mode-btn {
		padding: 3px 9px;
		border: none;
		border-radius: 6px;
		background: transparent;
		color: var(--d-muted);
		font-family: var(--font-body);
		font-size: 0.7rem;
		font-weight: 700;
		cursor: pointer;
	}

	.ms-mode-btn.is-active {
		background: var(--d-surface-2);
		color: var(--d-ink);
	}
</style>
