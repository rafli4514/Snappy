<script lang="ts">
	/**
	 * Miniatur template: kanvas kosong dengan layout slot yang sebenarnya.
	 * Preset kertas mengikuti ukuran produk aktif, template buatan sendiri
	 * mengikuti jumlah slot miliknya — tidak ada artwork yang dipaksa melar.
	 */
	import { renderStripPreview, getProductForCount } from '#lib/utils/canvas';
	import type { CustomTemplate } from '#lib/types';

	export let template: string | CustomTemplate;
	export let count: number;

	let canvas: HTMLCanvasElement;
	let seq = 0;

	$: if (canvas && template && count) void draw();

	async function draw(): Promise<void> {
		const current = ++seq;
		const product = getProductForCount(count);
		canvas.width = Math.round(product.pxW / 6);
		canvas.height = Math.round(product.pxH / 6);
		await renderStripPreview(
			canvas,
			Array(count).fill(null),
			template,
			{ showSlotNumbers: false },
			() => current !== seq
		);
	}
</script>

<canvas bind:this={canvas} aria-hidden="true"></canvas>

<style>
	canvas {
		display: block;
		max-width: 100%;
		max-height: 100%;
		width: auto;
		height: auto;
		border-radius: 3px;
		box-shadow:
			0 0 0 1px var(--ring-line),
			0 4px 12px rgba(11, 10, 9, 0.18);
	}
</style>
