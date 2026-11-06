<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { session } from '#lib/stores/session';
	import EditorScreen from '#lib/page/editor/EditorScreen.svelte';

	// Guard: editor butuh N foto yang sudah dipilih.
	onMount(() => {
		if ($session.photos.length === 0) void goto('/', { replace: true });
		else if ($session.selectedPhotoIndices.length !== $session.photoCount)
			void goto('/review', { replace: true });
	});
</script>

<EditorScreen />
