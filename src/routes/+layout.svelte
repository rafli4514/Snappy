<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import type { Snippet } from 'svelte';
	import { session } from '#lib/stores/session';
	import { loadCustomFrameSizes } from '#lib/services/frameSizes';
	import { loadCustomAssets } from '#lib/services/customAssets';

	let { children }: { children: Snippet } = $props();

	onMount(() => {
		void loadCustomFrameSizes();
		void loadCustomAssets();
	});

	// Token daisyUI (bg-base-100, btn-primary, dst.) mengikuti data-theme di
	// <html> — satu sumber di sini agar semua layar ikut tema kios.
	$effect(() => {
		document.documentElement.dataset.theme =
			$session.theme === 'dark' ? 'distudio-dark' : 'distudio-light';
	});
</script>

<svelte:head>
	<link rel="icon" href="/favicon.svg" />
</svelte:head>

{@render children()}

<!-- Hidden print layout — shown only during print media -->
<div id="print-layout" style="display:none;" aria-hidden="true">
	<img alt="" />
</div>
