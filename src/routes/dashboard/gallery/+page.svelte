<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';

	onMount(() => {
		void goto('/dashboard/sessions?view=gallery', { replaceState: true });
	});
</script>

<div class="d-page">
	<div class="d-empty">Mengalihkan ke halaman Sesi (tampilan Galeri)…</div>
</div>
