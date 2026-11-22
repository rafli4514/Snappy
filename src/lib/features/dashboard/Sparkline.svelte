<script lang="ts">
	let {
		values = [],
		id = 'spark',
		color = 'var(--d-muted, #94a3b8)'
	}: {
		values?: number[];
		id?: string;
		color?: string;
	} = $props();

	const W = 132;
	const H = 36;
	const PAD_Y = 4;

	const max = $derived(Math.max(0, ...values));
	const hasSpike = $derived(max > 0);
	const pts = $derived(
		values.map((v, i) => ({
			x: values.length <= 1 ? W / 2 : (i / (values.length - 1)) * W,
			y: hasSpike ? H - PAD_Y - (v / max) * (H - PAD_Y * 2) : H - PAD_Y
		}))
	);
	const line = $derived(
		pts.map((p, i) => `${i ? 'L' : 'M'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')
	);
</script>

{#if pts.length > 1}
	<svg
		class="spark"
		viewBox="0 0 {W} {H}"
		preserveAspectRatio="none"
		aria-hidden="true"
		data-spark={id}
	>
		<path d={line} class="spark-line" style="stroke:{color}" />
	</svg>
{:else}
	<div class="spark-dash" aria-hidden="true"></div>
{/if}

<style>
	.spark {
		display: block;
		width: 100%;
		height: 36px;
		overflow: visible;
	}

	.spark-line {
		fill: none;
		stroke-width: 1.6;
		stroke-linecap: round;
		stroke-linejoin: round;
		vector-effect: non-scaling-stroke;
	}

	.spark-dash {
		width: 100%;
		height: 36px;
		display: flex;
		align-items: flex-end;
		padding-bottom: 4px;
	}

	.spark-dash::after {
		content: '';
		display: block;
		width: 100%;
		height: 1.5px;
		background: var(--d-border-strong);
		opacity: 0.6;
	}
</style>
