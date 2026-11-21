<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { session } from '#lib/stores/session';
	import TimelapseScreen from '#lib/page/timelapse/TimelapseScreen.svelte';

	// Guard: timelapse butuh set foto yang lengkap.
	onMount(() => {
		if ($session.photos.length === 0) void goto('/', { replace: true });
		else if ($session.selectedPhotoIndices.length !== $session.photoCount)
			void goto('/review', { replace: true });
	});
</script>

<TimelapseScreen />
