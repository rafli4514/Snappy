<script lang="ts">
	import { onMount } from 'svelte';
	import {
		session,
		goTo,
		setFormat,
		setPhotoCount,
		setActiveFrame,
		setCustomTemplate
	} from '#lib/stores/session';
	import { listFrames } from '#lib/utils/frameStorage';
	import { STANDARD_FORMATS, formatById } from '#lib/data/standardFormats';
	import ThemeToggle from '#lib/components/ui/ThemeToggle.svelte';
	import type { PhotoFrame } from '#lib/types';

	const PRESET_KEY = 'distudio-standard-presets';

	let frames = $state<PhotoFrame[]>([]);
	let presetOn = $state<Record<string, boolean>>({});
	let selectedDesignId = $state<string | null>(null);

	const format = $derived(formatById($session.formatId));
	const allowedCounts = $derived(format.photos);
	const designs = $derived.by(() => {
		const out: { id: string; label: string; thumb: string | null; frame: PhotoFrame | null }[] = [];
		if (presetOn[$session.formatId] ?? true) {
			out.push({ id: 'builtin-classic', label: 'Classic', thumb: null, frame: null });
		}
		for (const f of frames) {
			if (f.formatId !== $session.formatId) continue;
			if (f.enabled === false) continue;
			if (f.slotCount !== $session.photoCount) continue;
			out.push({ id: f.id, label: f.name, thumb: f.artworkDataUrl, frame: f });
		}
		return out;
	});

	// Sinkronkan pilihan desain dengan state sesi saat format/count berubah.
	$effect(() => {
		const af = $session.activeFrame;
		if (af && af.formatId === $session.formatId) {
			selectedDesignId = af.id;
		} else if (af === null && $session.customTemplateData === null) {
			selectedDesignId = 'builtin-classic';
		}
	});

	onMount(async () => {
		frames = await listFrames();
		try {
			const raw = localStorage.getItem(PRESET_KEY);
			if (raw) presetOn = JSON.parse(raw) as Record<string, boolean>;
		} catch {
			/* ignore */
		}
	});

	function chooseFormat(id: string): void {
		setFormat(id);
		selectedDesignId = null;
	}

	function chooseCount(n: number): void {
		setPhotoCount(n);
		selectedDesignId = null;
	}

	function chooseDesign(design: { id: string; frame: PhotoFrame | null }): void {
		selectedDesignId = design.id;
		if (design.frame) {
			setActiveFrame(design.frame);
		} else {
			setActiveFrame(null);
			setCustomTemplate(null);
		}
	}

	function handleAmbil(): void {
		goTo('camera');
	}
</script>

<section
	class="strip-select-screen screen-enter kiosk-scope"
	class:theme-light={$session.theme === 'light'}
	aria-label="Pilih format dan jumlah foto"
>
	<button
		class="back-btn font-mono"
		onclick={() => goTo('start')}
		aria-label="Kembali ke halaman awal"
	>
		<svg
			viewBox="0 0 24 24"
			width="14"
			height="14"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
			aria-hidden="true"
		>
			<path d="M14.5 5l-7 7 7 7" />
		</svg>
		KEMBALI
	</button>

	<ThemeToggle />

	<header class="kepala">
		<h2 class="judul font-display">PILIH FORMAT</h2>
	</header>

	<div class="format-rail" role="tablist" aria-label="Format cetak">
		{#each STANDARD_FORMATS as f (f.id)}
			<button
				type="button"
				class="format-card"
				class:is-active={$session.formatId === f.id}
				onclick={() => chooseFormat(f.id)}
				role="tab"
				aria-selected={$session.formatId === f.id}
				aria-label={`${f.label}, ${f.cm}`}
			>
				<span class="format-thumb" style="height: {Math.round(124 * f.pxH / f.pxW)}px;" aria-hidden="true">
					<span class="format-thumb-label">{f.label.split('·')[0].trim()}</span>
				</span>
				<span class="format-meta">
					<span class="format-name">{f.label}</span>
					<span class="format-sub font-mono"
						>{f.cm} · {f.kind === 'digital' ? 'DIGITAL' : 'CETAK'}</span
					>
				</span>
			</button>
		{/each}
	</div>

	<div class="count-row" role="group" aria-label="Jumlah foto">
		{#each allowedCounts as n (n)}
			<button
				type="button"
				class="count-btn font-mono"
				class:is-active={$session.photoCount === n}
				onclick={() => chooseCount(n)}
				aria-pressed={$session.photoCount === n}
			>
				{n} FOTO
			</button>
		{/each}
	</div>

	<div class="design-grid" role="list">
		{#each designs as d (d.id)}
			<button
				type="button"
				class="design-card"
				class:is-active={selectedDesignId === d.id}
				onclick={() => chooseDesign(d)}
				aria-pressed={selectedDesignId === d.id}
				aria-label={d.label}
			>
				{#if d.thumb}
					<img src={d.thumb} alt="" class="design-thumb" />
				{:else}
					<span class="design-thumb design-thumb--builtin">
						<span>Classic</span>
					</span>
				{/if}
				<span class="design-name">{d.label}</span>
			</button>
		{/each}
	</div>

	<div class="aksi">
		<button
			type="button"
			class="ambil-cta btn font-mono"
			onclick={handleAmbil}
			aria-label="Ambil foto sekarang"
		>
			AMBIL FOTO
			<svg
				viewBox="0 0 24 24"
				width="18"
				height="18"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
				aria-hidden="true"
			>
				<path d="M4 12h15" />
				<path d="M13 6l6 6-6 6" />
			</svg>
		</button>
	</div>
</section>

<style>
	@import './_StripSelectScreen.css';
</style>
