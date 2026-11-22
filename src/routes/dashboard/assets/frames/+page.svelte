<script lang="ts">
	import FrameStudioScreen from '#lib/page/admin/FrameStudioScreen.svelte';
</script>

<div class="d-page">
	<header class="d-head">
		<div>
			<p class="d-eyebrow">Aset · Frame Studio</p>
			<h1 class="d-title">Frame Studio</h1>
			<p class="d-sub">
				Unggah artwork PNG transparan atau JPEG/SVG/WebP dari Canva, pilih lubang foto yang ingin
				diisi, lalu simpan sebagai template strip resmi.
			</p>
		</div>
		<div class="d-actions">
			<a class="d-btn" href="/dashboard/assets">Kembali</a>
			<a class="d-btn" href="/dashboard/assets/frame-sizes">Ukuran Frame</a>
		</div>
	</header>

	<FrameStudioScreen embedded={true} />
</div>
