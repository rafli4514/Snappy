<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';

	// Halaman dekorasi sudah disatukan ke /edit.
	onMount(() => {
		void goto('/edit', { replaceState: true });
	});
</script>
