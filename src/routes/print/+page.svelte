<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { session } from '#lib/stores/session';
	import PrintScreen from '#lib/page/print/PrintScreen.svelte';

	// Guard: cetak butuh set foto yang lengkap.
	onMount(() => {
		if ($session.photos.length === 0) void goto('/', { replace: true });
		else if ($session.selectedPhotoIndices.length !== $session.photoCount)
			void goto('/review', { replace: true });
	});
</script>

<PrintScreen />
