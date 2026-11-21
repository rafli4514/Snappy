<script lang="ts">
	import FrameStudioScreen from '#lib/page/admin/FrameStudioScreen.svelte';
</script>

<div class="dash-page">
	<header class="dash-head">
		<p class="eyebrow font-mono">ADMIN · ASSET · FRAME</p>
		<h1 class="dash-title font-display">Frame</h1>
		<p class="dash-sub">
			Unggah dan kelola frame template strip (Frame Studio) langsung di dashboard.
		</p>
	</header>
	<FrameStudioScreen embedded={true} />
</div>

<style>
	.dash-page {
		display: flex;
		flex-direction: column;
		gap: 18px;
	}
	.dash-head .eyebrow {
		margin: 0;
		font-size: 0.66rem;
		font-weight: 700;
		letter-spacing: 0.22em;
		opacity: 0.6;
	}
	.dash-title {
		margin: 6px 0 0;
		font-size: 2rem;
		line-height: 1.1;
	}
	.dash-sub {
		margin: 8px 0 0;
		max-width: 62ch;
		font-size: 0.85rem;
		line-height: 1.55;
		opacity: 0.7;
	}
</style>
