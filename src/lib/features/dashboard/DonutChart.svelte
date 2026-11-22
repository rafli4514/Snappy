<script lang="ts">
	export interface DonutSegment {
		label: string;
		value: number;
		color: string;
	}

	let {
		segments = [],
		centerLabel = 'Total',
		titleId = 'donut-title',
		label = 'Diagram donat',
		empty = 'Belum ada data.'
	}: {
		segments?: DonutSegment[];
		centerLabel?: string;
		titleId?: string;
		label?: string;
		empty?: string;
	} = $props();

	const R = 52;
	const C = 2 * Math.PI * R;

	const total = $derived(segments.reduce((s, x) => s + x.value, 0));
	const arcs = $derived.by(() => {
		let offset = 0;
		return segments.map((seg) => {
			const len = total ? (seg.value / total) * C : 0;
			const arc = { ...seg, len, offset };
			offset += len;
			return arc;
		});
	});
</script>

{#if total === 0}
	<p class="donut-empty">{empty}</p>
{:else}
	<div class="donut">
		<svg viewBox="0 0 140 140" class="donut-svg" role="img" aria-labelledby={titleId}>
			<title id={titleId}>{label}</title>
			<circle cx="70" cy="70" r={R} class="track" />
			{#each arcs as a (a.label)}
				{#if a.len > 0}
					<circle
						cx="70"
						cy="70"
						r={R}
						fill="none"
						stroke={a.color}
						stroke-width="16"
						stroke-dasharray="{Math.max(0, a.len - 2)} {C}"
						stroke-dashoffset={-a.offset}
						transform="rotate(-90 70 70)"
						stroke-linecap="butt"
					>
						<title>{a.label}: {a.value}</title>
					</circle>
				{/if}
			{/each}
			<text x="70" y="68" text-anchor="middle" class="c-val">{total}</text>
			<text x="70" y="86" text-anchor="middle" class="c-lab">{centerLabel}</text>
		</svg>

		<ul class="legend">
			{#each segments as s (s.label)}
				<li>
					<span class="sw" style="background:{s.color}"></span>
					<span class="lg-name">{s.label}</span>
					<span class="lg-val">
						{s.value}
						<small>{total ? Math.round((s.value / total) * 100) : 0}%</small>
					</span>
				</li>
			{/each}
		</ul>
	</div>
{/if}

<style>
	.donut {
		display: flex;
		align-items: center;
		gap: 18px;
		flex-wrap: wrap;
	}

	.donut-svg {
		width: 132px;
		height: 132px;
		flex-shrink: 0;
	}

	.track {
		fill: none;
		stroke: var(--d-surface-2, #f1f5f9);
		stroke-width: 16;
	}

	.c-val {
		fill: var(--d-ink, #0f172a);
		font-family: var(--font-body);
		font-size: 24px;
		font-weight: 800;
		font-variant-numeric: tabular-nums;
	}

	.c-lab {
		fill: var(--d-muted, #64748b);
		font-family: var(--font-body);
		font-size: 9.5px;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.legend {
		flex: 1;
		min-width: 150px;
		margin: 0;
		padding: 0;
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.legend li {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 0.8rem;
	}

	.sw {
		width: 10px;
		height: 10px;
		border-radius: 3px;
		flex-shrink: 0;
	}

	.lg-name {
		flex: 1;
		color: var(--d-ink, #0f172a);
		font-weight: 600;
	}

	.lg-val {
		font-weight: 800;
		font-variant-numeric: tabular-nums;
		color: var(--d-ink, #0f172a);
	}

	.lg-val small {
		margin-left: 4px;
		font-weight: 600;
		color: var(--d-muted, #64748b);
	}

	.donut-empty {
		margin: 0;
		padding: 28px 0;
		text-align: center;
		font-size: 0.82rem;
		color: var(--d-muted, #64748b);
	}
</style>
