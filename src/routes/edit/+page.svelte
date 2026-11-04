<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { session } from '#lib/stores/session';
	import EditScreen from '#lib/page/edit/EditScreen.svelte';

	// Guard: halaman edit butuh set foto yang lengkap (sama seperti editor).
	onMount(() => {
		const photos = $session.photos;
		if (photos.length === 0) void goto('/', { replace: true });
		else if (photos.length < $session.photoCount) void goto('/review', { replace: true });
	});
</script>

<EditScreen />
