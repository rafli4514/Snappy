<script lang="ts">
	import { session, goTo, setFormat, setPhotoCount } from '#lib/stores/session';
	import ThemeToggle from '#lib/components/ui/ThemeToggle.svelte';

	interface StripOption {
		id: string;
		eyebrow: string;
		title: string;
		spec: string;
		image: string;
		formatId: string;
		photoCount: number;
	}

	const STRIP_OPTIONS: StripOption[] = [
		{
			id: '01-2x6-3foto',
			eyebrow: 'STRIP KLASIK',
			title: '2×6 · 3 FOTO',
			spec: 'Strip Tunggal · 3 Frame Besar · 2 × 6 in',
			image: '/strip-select/01-2x6-3foto.png',
			formatId: '2x6',
			photoCount: 3
		},
		{
			id: '02-2x6-4foto',
			eyebrow: 'PALING POPULER',
			title: '2×6 · 4 FOTO',
			spec: 'Strip Tunggal · 4 Frame · 2 × 6 in',
			image: '/strip-select/02-2x6-4foto.png',
			formatId: '2x6',
			photoCount: 4
		},
		{
			id: '03-2x8-4foto',
			eyebrow: 'STRIP TINGGI',
			title: '2×8 · 4 FOTO',
			spec: 'Strip Tinggi · 4 Frame Besar · 2 × 8 in',
			image: '/strip-select/03-2x8-4foto.png',
			formatId: '2x8',
			photoCount: 4
		},
		{
			id: '04-2x8-5foto',
			eyebrow: 'STRIP TINGGI',
			title: '2×8 · 5 FOTO',
			spec: 'Strip Tinggi · 5 Frame · 2 × 8 in',
			image: '/strip-select/04-2x8-5foto.png',
			formatId: '2x8',
			photoCount: 5
		},
		{
			id: '05-4r-double',
			eyebrow: 'CETAK GANDA',
			title: '4R DOUBLE',
			spec: '2 Strip × 4 Frame · 4 × 6 in',
			image: '/strip-select/05-4r-double.png',
			formatId: '4r-double',
			photoCount: 4
		},
		{
			id: '06-4r-6foto',
			eyebrow: 'KOLASE 4R',
			title: '4R · 6 FOTO',
			spec: 'Grid 3×2 · 6 Frame · 4 × 6 in',
			image: '/strip-select/06-4r-6foto.png',
			formatId: '4r-double',
			photoCount: 6
		},
		{
			id: '07-3r-portrait-3foto',
			eyebrow: 'KARTU POTRET',
			title: '3R PORTRAIT',
			spec: '1 Utama + 2 Frame · 3.5 × 5 in',
			image: '/strip-select/07-3r-portrait-3foto.png',
			formatId: '3r',
			photoCount: 3
		},
		{
			id: '08-5r-portrait-4foto',
			eyebrow: 'POTRET BESAR',
			title: '5R PORTRAIT',
			spec: 'Grid Potret 2×2 · 5 × 7 in',
			image: '/strip-select/08-5r-portrait-4foto.png',
			formatId: '5r',
			photoCount: 4
		},
		{
			id: '09-square-1x1-4foto',
			eyebrow: 'CETAK PERSEGI',
			title: 'SQUARE 1:1',
			spec: 'Grid Persegi 2×2 · 4 × 4 in',
			image: '/strip-select/09-square-1x1-4foto.png',
			formatId: 'square',
			photoCount: 4
		}
	];

	let navTimer: ReturnType<typeof setTimeout> | null = null;

	$effect(() => {
		return () => {
			if (navTimer) clearTimeout(navTimer);
		};
	});

	function isSelected(option: StripOption): boolean {
		return $session.formatId === option.formatId && $session.photoCount === option.photoCount;
	}

	function handleSelect(option: StripOption): void {
		setFormat(option.formatId);
		setPhotoCount(option.photoCount);
		if (navTimer) clearTimeout(navTimer);
		navTimer = setTimeout(() => {
			navTimer = null;
			goTo('camera');
		}, 160);
	}
</script>

<section
	class="strip-select-screen screen-enter kiosk-scope"
	class:theme-light={$session.theme === 'light'}
	aria-label="Tata letak strip foto"
>
	<img
		class="bg-frame"
		src="/strip-select/bg-frame.png"
		alt=""
		aria-hidden="true"
		draggable="false"
	/>

	<div class="frame-inner">
		<header class="top-bar">
			<div class="bar-left">
				<button
					type="button"
					class="brand-back-btn"
					onclick={() => goTo('start')}
					aria-label="Kembali ke halaman awal"
					title="Kembali ke halaman awal"
				>
					<img
						class="brand-logo"
						src="/landingPage/logo.svg"
						alt="DI'STUDIO"
						width="217"
						height="81"
						draggable="false"
					/>
				</button>
			</div>

			<h1 class="screen-title">STRIP KAMU</h1>

			<div class="bar-right">
				<ThemeToggle inline />
			</div>
		</header>

		<div class="header-divider" aria-hidden="true"></div>

		<div class="strip-grid" role="list" aria-label="Daftar tata letak strip">
			{#each STRIP_OPTIONS as option (option.id)}
				{@const selected = isSelected(option)}
				<button
					type="button"
					class="strip-card"
					class:is-selected={selected}
					onclick={() => handleSelect(option)}
					aria-pressed={selected}
					aria-label={`${option.title}, ${option.spec}`}
				>
					<span class="strip-thumb-box" aria-hidden="true">
						<img class="strip-thumb" src={option.image} alt="" draggable="false" />
					</span>

					<span class="strip-meta">
						<span class="strip-eyebrow">{option.eyebrow}</span>
						<span class="strip-title">{option.title}</span>
						<span class="strip-spec">{option.spec}</span>
					</span>
				</button>
			{/each}
		</div>

		<footer class="bottom-hint">
			<p>Ketuk salah satu tata letak strip di atas untuk memulai sesi fotobooth</p>
		</footer>
	</div>
</section>

<style>
	@import './_StripSelectScreen.css';
</style>
