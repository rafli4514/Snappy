<div class="dash-page">
	<header class="dash-head">
		<p class="eyebrow font-mono">ADMIN · ASSET</p>
		<h1 class="dash-title font-display">Asset</h1>
		<p class="dash-sub">
			Kelola aset kreatif: frame template strip, frame size, sticker, filter, dan AR. Bawaan
			terkunci; ukuran/sticker/filter/overlay AR custom dapat dikelola (upload & edit) sesuai MVP.
		</p>
	</header>

	<section class="asset-grid" aria-label="Daftar asset">
		<a class="asset-card" href="/dashboard/assets/frames">
			<p class="asset-name">Frame</p>
			<p class="asset-desc">Template strip dari artwork frame.</p>
			<span class="asset-status">Studio</span>
		</a>
		<a class="asset-card" href="/dashboard/assets/frame-sizes">
			<p class="asset-name">Frame size</p>
			<p class="asset-desc">Ukuran format standar dan custom.</p>
			<span class="asset-status">Katalog</span>
		</a>
		<a class="asset-card" href="/dashboard/assets/stickers">
			<p class="asset-name">Sticker</p>
			<p class="asset-desc">Sticker bawaan + upload custom (muncul di editor/dekorasi).</p>
			<span class="asset-status">Custom</span>
		</a>
		<a class="asset-card" href="/dashboard/assets/filters">
			<p class="asset-name">Filter</p>
			<p class="asset-desc">Preset bawaan + filter custom (cssFilter pratinjau).</p>
			<span class="asset-status">Custom</span>
		</a>
		<a class="asset-card" href="/dashboard/assets/ar">
			<p class="asset-name">AR</p>
			<p class="asset-desc">Kelola aset overlay AR. Realtime tracking belum ada (MVP).</p>
			<span class="asset-status">MVP</span>
		</a>
	</section>
</div>

<style>
	.dash-page {
		display: flex;
		flex-direction: column;
		gap: 22px;
	}

	.dash-head .eyebrow {
		margin: 0;
		font-size: 0.66rem;
		font-weight: 700;
		letter-spacing: 0.22em;
		text-transform: uppercase;
		color: var(--color-base-content, #1c1917);
		opacity: 0.6;
	}

	.dash-title {
		margin: 6px 0 0;
		font-size: 2rem;
		line-height: 1.1;
		color: var(--color-base-content, #1c1917);
	}

	.dash-sub {
		margin: 8px 0 0;
		max-width: 62ch;
		font-size: 0.85rem;
		line-height: 1.55;
		color: var(--color-base-content, #1c1917);
		opacity: 0.7;
	}

	.asset-grid {
		display: grid;
		gap: 12px;
		grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
	}

	.asset-card {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 16px;
		border: 1px solid var(--color-base-300, #d6d3d1);
		border-radius: var(--radius-box, 12px);
		background: var(--color-base-200, #f5f5f4);
		text-decoration: none;
		color: var(--color-base-content, #1c1917);
	}

	.asset-card:hover {
		border-color: var(--color-base-content, #1c1917);
	}

	.asset-name {
		margin: 0;
		font-size: 1rem;
		font-weight: 700;
	}

	.asset-desc {
		margin: 0;
		font-size: 0.76rem;
		line-height: 1.45;
		opacity: 0.7;
	}

	.asset-status {
		align-self: flex-start;
		margin-top: 6px;
		padding: 3px 8px;
		border-radius: 9999px;
		border: 1px solid var(--color-base-300, #d6d3d1);
		font-size: 0.62rem;
		font-weight: 700;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}
</style>
