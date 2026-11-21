<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { session } from '#lib/stores/session';
	import EditScreen from '#lib/page/edit/EditScreen.svelte';

	// Guard: halaman decorate butuh set foto yang lengkap (sama seperti /edit).
	onMount(() => {
		if ($session.photos.length === 0) void goto('/', { replace: true });
		else if ($session.selectedPhotoIndices.length !== $session.photoCount)
			void goto('/review', { replace: true });
	});
</script>

<EditScreen mode="decorate" />
