<script lang="ts">
	/**
	 * Bingkai studio native 9-slice (CSS + SVG vektor):
	 * 4 garis tepi lurus seragam dengan margin luar + 4 sudut cekung 1:1
	 * dan bintang 4-sudut simetris agar tidak terdistorsi di rasio layar apa pun.
	 */
	import { session } from '#lib/stores/session';

	$: isLight = $session.theme === 'light';

	const CORNERS = ['tl', 'tr', 'bl', 'br'] as const;
</script>

<div class="studio-frame" class:is-light={isLight} aria-hidden="true">
	<span class="edge edge-top"></span>
	<span class="edge edge-right"></span>
	<span class="edge edge-bottom"></span>
	<span class="edge edge-left"></span>

	{#each CORNERS as pos (pos)}
		<svg class="corner corner-{pos}" viewBox="0 0 38 38" fill="none" focusable="false">
			<path
				class="corner-arc"
				d="M 0.75 38 L 0.75 37.25 A 36.5 36.5 0 0 0 37.25 0.75 L 38 0.75"
				stroke="currentColor"
				stroke-width="1.5"
				vector-effect="non-scaling-stroke"
			/>
			<path
				class="corner-sparkle"
				d="M 13.5 2.5 Q 13.5 13.5 24.5 13.5 Q 13.5 13.5 13.5 24.5 Q 13.5 13.5 2.5 13.5 Q 13.5 13.5 13.5 2.5 Z"
			/>
		</svg>
	{/each}
</div>

<style>
	.studio-frame {
		--frame-inset: clamp(10px, 1.3vmin, 16px);
		--frame-size: 38px;
		--frame-stroke-w: 1.5px;
		--frame-stroke: rgba(251, 247, 240, 0.16);
		--frame-sparkle: rgba(251, 247, 240, 0.42);

		position: absolute;
		inset: var(--frame-inset);
		z-index: 0;
		pointer-events: none;
		user-select: none;
		overflow: hidden;
	}

	.studio-frame.is-light {
		--frame-stroke: #d8dee6;
		--frame-sparkle: #94a3b8;
	}

	.edge {
		position: absolute;
		display: block;
		background: var(--frame-stroke);
		transition: background-color 220ms ease;
	}

	.edge-top {
		top: 0;
		left: calc(var(--frame-size) - 0.5px);
		right: calc(var(--frame-size) - 0.5px);
		height: var(--frame-stroke-w);
	}

	.edge-bottom {
		bottom: 0;
		left: calc(var(--frame-size) - 0.5px);
		right: calc(var(--frame-size) - 0.5px);
		height: var(--frame-stroke-w);
	}

	.edge-left {
		left: 0;
		top: calc(var(--frame-size) - 0.5px);
		bottom: calc(var(--frame-size) - 0.5px);
		width: var(--frame-stroke-w);
	}

	.edge-right {
		right: 0;
		top: calc(var(--frame-size) - 0.5px);
		bottom: calc(var(--frame-size) - 0.5px);
		width: var(--frame-stroke-w);
	}

	.corner {
		position: absolute;
		width: var(--frame-size);
		height: var(--frame-size);
		color: var(--frame-stroke);
		transition: color 220ms ease;
	}

	.corner-sparkle {
		fill: var(--frame-sparkle);
		transition: fill 220ms ease;
	}

	.corner-tl {
		top: 0;
		left: 0;
	}

	.corner-tr {
		top: 0;
		right: 0;
		transform: scaleX(-1);
	}

	.corner-bl {
		bottom: 0;
		left: 0;
		transform: scaleY(-1);
	}

	.corner-br {
		bottom: 0;
		right: 0;
		transform: scale(-1, -1);
	}

	@media (max-width: 680px) {
		.studio-frame {
			--frame-inset: 8px;
			--frame-size: 28px;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.edge,
		.corner,
		.corner-sparkle {
			transition: none;
		}
	}
</style>
