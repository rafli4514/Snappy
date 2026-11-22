<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { PHOTO_FILTERS, type FilterCategory, type PhotoFilter } from '#lib/data/filters';
	import { customFiltersStore, loadCustomAssets } from '#lib/services/customAssets';
	import {
		Plus,
		Search,
		Pencil,
		Trash2,
		Lock,
		X,
		Eye,
		EyeOff,
		SlidersHorizontal,
		RotateCcw,
		Image as ImageIcon,
		Copy,
		ChevronLeft,
		ChevronRight
	} from '@lucide/svelte';

	type FilterItem = PhotoFilter & { isCustom: boolean };

	type Sliders = {
		brightness: number; // 50..160 (default 100)
		contrast: number; // 50..180 (default 100)
		saturate: number; // 0..200 (default 100)
		sepia: number; // 0..100 (default 0)
		grayscale: number; // 0..100 (default 0)
		hue: number; // -180..180 (default 0)
		blur: number; // 0..6 (default 0)
	};

	const DEFAULT_SLIDERS: Sliders = {
		brightness: 100,
		contrast: 100,
		saturate: 100,
		sepia: 0,
		grayscale: 0,
		hue: 0,
		blur: 0
	};

	const CATEGORIES: (FilterCategory | 'Custom')[] = [
		'Custom',
		'Essential',
		'Retro',
		'Fun',
		'Distort',
		'Black & White'
	];

	const QUICK_PRESETS: { label: string; sliders: Partial<Sliders> }[] = [
		{ label: 'Film Hangat', sliders: { sepia: 28, contrast: 108, saturate: 118, brightness: 103 } },
		{ label: 'Pastel Lembut', sliders: { brightness: 110, contrast: 92, saturate: 88, sepia: 12 } },
		{ label: 'Moody Gelap', sliders: { brightness: 86, contrast: 124, saturate: 82 } },
		{ label: 'Analog 90s', sliders: { sepia: 42, contrast: 115, saturate: 110, hue: -8 } },
		{ label: 'Monokrom Tajam', sliders: { grayscale: 100, contrast: 138, brightness: 102 } }
	];

	const FALLBACK_PREVIEW_CSS: Record<string, string> = {
		warm: 'sepia(0.22) saturate(1.18) brightness(1.03)',
		cool: 'hue-rotate(14deg) saturate(0.92) brightness(1.03)',
		'warm-tones': 'sepia(0.32) contrast(1.08) saturate(1.24)'
	};

	const PAGE_SIZES = [12, 24, 48];

	const SAMPLE_SCENE_URL = '/placeholders/filter-sample.jpg';

	const builtinList: FilterItem[] = PHOTO_FILTERS.map((f) => ({ ...f, isCustom: false }));

	let loading = $state(true);
	let saving = $state(false);
	let togglingKey = $state<string | null>(null);
	let deletingKey = $state<string | null>(null);
	let confirmDeleteKey = $state<string | null>(null);
	let error = $state<string | null>(null);
	let notice = $state<string | null>(null);

	let query = $state('');
	let activeCategory = $state<string>('all');
	let pageSize = $state(12);
	let currentPage = $state(1);

	// Foto uji lokal opsional untuk melihat efek filter di foto nyata
	let samplePhotoUrl = $state<string | null>(null);
	let sampleInput = $state<HTMLInputElement | null>(null);

	// Modal Editor Filter Kustom
	let showEditorModal = $state(false);
	let editingKey = $state<string | null>(null);
	let showRawCss = $state(false);
	let sliders = $state<Sliders>({ ...DEFAULT_SLIDERS });
	let form = $state({
		name: '',
		category: 'Custom' as string,
		cssFilter: '',
		ffmpeg: '',
		enabled: true
	});

	// Modal Pratinjau Filter Bawaan
	let inspectingFilter = $state<FilterItem | null>(null);

	const customList = $derived.by((): FilterItem[] =>
		$customFiltersStore.map((f) => ({ ...f, isCustom: true }))
	);

	const allFilters = $derived.by(() => [...customList, ...builtinList]);

	const filteredFilters = $derived.by(() => {
		const q = query.trim().toLowerCase();
		return allFilters.filter((f) => {
			if (activeCategory === 'custom' && !f.isCustom) return false;
			if (activeCategory !== 'all' && activeCategory !== 'custom') {
				if (String(f.category) !== activeCategory) return false;
			}
			if (!q) return true;
			return (
				f.name.toLowerCase().includes(q) ||
				f.key.toLowerCase().includes(q) ||
				String(f.category).toLowerCase().includes(q) ||
				(f.cssFilter || '').toLowerCase().includes(q)
			);
		});
	});

	const totalPages = $derived(Math.max(1, Math.ceil(filteredFilters.length / pageSize)));
	const safePage = $derived(Math.min(currentPage, totalPages));
	const pageStart = $derived(filteredFilters.length === 0 ? 0 : (safePage - 1) * pageSize + 1);
	const pageEnd = $derived(Math.min(filteredFilters.length, safePage * pageSize));
	const pagedFilters = $derived(
		filteredFilters.slice((safePage - 1) * pageSize, safePage * pageSize)
	);

	$effect(() => {
		void query;
		void activeCategory;
		void pageSize;
		currentPage = 1;
	});

	function previewCssFor(item: Pick<PhotoFilter, 'key' | 'cssFilter'>): string {
		if (item.cssFilter && item.cssFilter.trim()) return item.cssFilter;
		return FALLBACK_PREVIEW_CSS[item.key] ?? 'none';
	}

	function slidersToCss(s: Sliders): string {
		const parts: string[] = [];
		if (s.brightness !== 100) parts.push(`brightness(${(s.brightness / 100).toFixed(2)})`);
		if (s.contrast !== 100) parts.push(`contrast(${(s.contrast / 100).toFixed(2)})`);
		if (s.saturate !== 100) parts.push(`saturate(${(s.saturate / 100).toFixed(2)})`);
		if (s.sepia > 0) parts.push(`sepia(${(s.sepia / 100).toFixed(2)})`);
		if (s.grayscale > 0) parts.push(`grayscale(${(s.grayscale / 100).toFixed(2)})`);
		if (s.hue !== 0) parts.push(`hue-rotate(${Math.round(s.hue)}deg)`);
		if (s.blur > 0) parts.push(`blur(${s.blur}px)`);
		return parts.join(' ');
	}

	function cssToSliders(css: string): Sliders {
		const out: Sliders = { ...DEFAULT_SLIDERS };
		const num = (re: RegExp, scale: number, fallback: number): number => {
			const m = re.exec(css);
			if (!m) return fallback;
			const v = parseFloat(m[1]);
			if (!Number.isFinite(v)) return fallback;
			return m[2] === '%' ? Math.round(v) : Math.round(v * scale);
		};
		out.brightness = num(/brightness\(\s*([0-9.]+)(%?)\s*\)/i, 100, 100);
		out.contrast = num(/contrast\(\s*([0-9.]+)(%?)\s*\)/i, 100, 100);
		out.saturate = num(/saturate\(\s*([0-9.]+)(%?)\s*\)/i, 100, 100);
		out.sepia = num(/sepia\(\s*([0-9.]+)(%?)\s*\)/i, 100, 0);
		out.grayscale = num(/grayscale\(\s*([0-9.]+)(%?)\s*\)/i, 100, 0);
		const hueMatch = /hue-rotate\(\s*(-?[0-9.]+)deg\s*\)/i.exec(css);
		if (hueMatch) out.hue = Math.round(parseFloat(hueMatch[1]) || 0);
		const blurMatch = /blur\(\s*([0-9.]+)px\s*\)/i.exec(css);
		if (blurMatch) out.blur = Math.min(6, Math.max(0, Number(blurMatch[1]) || 0));
		return out;
	}

	function syncCssFromSliders(): void {
		form.cssFilter = slidersToCss(sliders);
	}

	function applyQuickPreset(preset: Partial<Sliders>): void {
		sliders = { ...DEFAULT_SLIDERS, ...preset };
		syncCssFromSliders();
	}

	function resetSliders(): void {
		sliders = { ...DEFAULT_SLIDERS };
		syncCssFromSliders();
	}

	function openCreateModal(seed?: FilterItem): void {
		error = null;
		notice = null;
		inspectingFilter = null;
		editingKey = null;
		showRawCss = false;
		const seedCss = seed ? seed.cssFilter || FALLBACK_PREVIEW_CSS[seed.key] || '' : '';
		sliders = cssToSliders(seedCss);
		form = {
			name: seed ? `${seed.name} Kustom` : '',
			category: 'Custom',
			cssFilter: seedCss,
			ffmpeg: seed?.ffmpeg ?? '',
			enabled: true
		};
		showEditorModal = true;
	}

	function openEditModal(item: FilterItem): void {
		error = null;
		notice = null;
		confirmDeleteKey = null;
		editingKey = item.key;
		showRawCss = false;
		sliders = cssToSliders(item.cssFilter || '');
		form = {
			name: item.name,
			category: String(item.category || 'Custom'),
			cssFilter: item.cssFilter || '',
			ffmpeg: item.ffmpeg || '',
			enabled: item.enabled !== false
		};
		showEditorModal = true;
	}

	function closeEditorModal(): void {
		if (saving) return;
		showEditorModal = false;
		editingKey = null;
	}

	async function saveFilter(e: SubmitEvent): Promise<void> {
		e.preventDefault();
		const name = form.name.trim();
		if (!name) {
			error = 'Nama filter wajib diisi.';
			return;
		}
		saving = true;
		error = null;
		notice = null;
		try {
			const method = editingKey ? 'PUT' : 'POST';
			const key =
				editingKey ||
				name
					.toLowerCase()
					.replace(/[^a-z0-9_-]+/g, '-')
					.replace(/^-+|-+$/g, '');
			const res = await fetch('/api/assets/filters', {
				method,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ key, ...form, name })
			});
			const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
			if (!res.ok || !data.ok) throw new Error(data.error || 'Gagal menyimpan filter.');
			await loadCustomAssets(true);
			notice = editingKey ? `Filter "${name}" diperbarui.` : `Filter "${name}" ditambahkan.`;
			showEditorModal = false;
			editingKey = null;
		} catch (err) {
			error = err instanceof Error ? err.message : 'Gagal menyimpan filter.';
		} finally {
			saving = false;
		}
	}

	async function quickToggleEnabled(item: FilterItem): Promise<void> {
		if (!item.isCustom || togglingKey !== null) return;
		togglingKey = item.key;
		error = null;
		const nextEnabled = item.enabled === false;
		try {
			const res = await fetch('/api/assets/filters', {
				method: 'PUT',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					key: item.key,
					name: item.name,
					category: item.category,
					cssFilter: item.cssFilter,
					ffmpeg: item.ffmpeg,
					enabled: nextEnabled
				})
			});
			const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
			if (!res.ok || !data.ok) throw new Error(data.error || 'Gagal mengubah status filter.');
			await loadCustomAssets(true);
		} catch (err) {
			error = err instanceof Error ? err.message : 'Gagal mengubah status filter.';
		} finally {
			togglingKey = null;
		}
	}

	async function removeFilter(key: string, label: string): Promise<void> {
		deletingKey = key;
		error = null;
		notice = null;
		try {
			const res = await fetch('/api/assets/filters', {
				method: 'DELETE',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ key })
			});
			const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
			if (!res.ok || !data.ok) throw new Error(data.error || 'Gagal menghapus filter.');
			confirmDeleteKey = null;
			if (editingKey === key) closeEditorModal();
			await loadCustomAssets(true);
			notice = `Filter "${label}" dihapus.`;
		} catch (err) {
			error = err instanceof Error ? err.message : 'Gagal menghapus filter.';
		} finally {
			deletingKey = null;
		}
	}

	function handleSamplePhotoChange(e: Event): void {
		const input = e.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file || !file.type.startsWith('image/')) return;
		if (samplePhotoUrl) URL.revokeObjectURL(samplePhotoUrl);
		samplePhotoUrl = URL.createObjectURL(file);
	}

	function clearSamplePhoto(): void {
		if (samplePhotoUrl) URL.revokeObjectURL(samplePhotoUrl);
		samplePhotoUrl = null;
	}

	function handleWindowKeydown(e: KeyboardEvent): void {
		if (e.key === 'Escape') {
			if (showEditorModal) closeEditorModal();
			else if (inspectingFilter) inspectingFilter = null;
		}
	}

	onMount(async () => {
		try {
			await loadCustomAssets(true);
		} finally {
			loading = false;
		}
	});

	onDestroy(() => {
		if (samplePhotoUrl) URL.revokeObjectURL(samplePhotoUrl);
	});
</script>

<svelte:window onkeydown={handleWindowKeydown} />

<input
	bind:this={sampleInput}
	type="file"
	class="fl-file-hidden"
	accept="image/*"
	onchange={handleSamplePhotoChange}
/>

{#snippet sampleVisual(cssFilter: string)}
	<div class="fl-scene" style="filter: {cssFilter || 'none'};">
		<img class="fl-scene-img" src={samplePhotoUrl ?? SAMPLE_SCENE_URL} alt="" draggable="false" />
	</div>
{/snippet}

<div class="fl-page">
	<header class="fl-head">
		<div class="fl-head-copy">
			<h1 class="fl-title">Filter Foto</h1>
			<p class="fl-sub">
				Preset warna untuk kamera dan editor strip. Atur slider secara langsung untuk membuat filter
				kustom.
			</p>
		</div>
		<div class="fl-head-actions">
			{#if samplePhotoUrl}
				<button type="button" class="fl-btn" onclick={clearSamplePhoto}>
					<RotateCcw size={13} />
					Reset Foto Uji
				</button>
			{:else}
				<button type="button" class="fl-btn" onclick={() => sampleInput?.click()}>
					<ImageIcon size={14} />
					Uji dengan Foto
				</button>
			{/if}
			<button
				type="button"
				class="fl-btn is-primary"
				onclick={() => openCreateModal()}
				disabled={saving}
			>
				<Plus size={15} />
				Buat Filter
			</button>
		</div>
	</header>

	{#if error}
		<div class="d-banner d-banner-err" role="alert"><span>{error}</span></div>
	{/if}
	{#if notice}
		<div class="d-banner d-banner-ok" role="status"><span>{notice}</span></div>
	{/if}

	<!-- Toolbar Filter Minimalis -->
	<div class="fl-toolbar">
		<div class="fl-search">
			<Search size={14} />
			<input
				type="search"
				class="fl-search-input"
				placeholder="Cari filter…"
				bind:value={query}
				aria-label="Cari filter foto"
			/>
		</div>

		<div class="fl-pills" role="group" aria-label="Filter kategori warna">
			<button
				type="button"
				class="fl-pill"
				class:is-active={activeCategory === 'all'}
				onclick={() => (activeCategory = 'all')}
			>
				Semua ({allFilters.length})
			</button>
			<button
				type="button"
				class="fl-pill"
				class:is-active={activeCategory === 'custom'}
				onclick={() => (activeCategory = 'custom')}
			>
				Kustom ({customList.length})
			</button>
			{#each ['Essential', 'Retro', 'Fun', 'Distort', 'Black & White'] as cat (cat)}
				<button
					type="button"
					class="fl-pill"
					class:is-active={activeCategory === cat}
					onclick={() => (activeCategory = cat)}
				>
					{cat}
				</button>
			{/each}
		</div>
	</div>

	{#if loading}
		<div class="fl-grid">
			{#each Array(8) as _, idx (idx)}
				<div class="fl-skel"></div>
			{/each}
		</div>
	{:else if filteredFilters.length === 0}
		<section class="fl-empty" aria-label="Daftar filter kosong">
			<SlidersHorizontal size={22} />
			<p class="fl-empty-title">
				{activeCategory === 'custom' ? 'Belum ada filter kustom' : 'Tidak ada filter yang cocok'}
			</p>
			<p class="fl-empty-sub">
				{activeCategory === 'custom'
					? 'Buat preset warna kustom dengan slider kecerahan, kontras, saturasi, dan nada warna.'
					: 'Coba ubah kata kunci pencarian atau pilih kategori lain.'}
			</p>
			{#if activeCategory === 'custom'}
				<button type="button" class="fl-btn is-primary" onclick={() => openCreateModal()}>
					<Plus size={14} />
					Buat Filter Pertama
				</button>
			{/if}
		</section>
	{:else}
		<section class="fl-grid" aria-label="Koleksi filter foto">
			{#each pagedFilters as item (`${item.isCustom ? 'c' : 'b'}-${item.key}`)}
				{@const isInactive = item.isCustom && item.enabled === false}
				{@const css = previewCssFor(item)}
				<article class="fl-card" class:is-inactive={isInactive}>
					<div class="fl-media">
						<button
							type="button"
							class="fl-media-btn"
							onclick={() => (item.isCustom ? openEditModal(item) : (inspectingFilter = item))}
							aria-label="Lihat pratinjau filter {item.name}"
						>
							{@render sampleVisual(css)}
						</button>

						<span class="fl-cat-badge" class:is-custom={item.isCustom}>
							{item.isCustom ? 'Kustom' : item.category}
						</span>

						{#if item.isCustom}
							<button
								type="button"
								class="fl-vis-btn"
								class:is-off={isInactive}
								disabled={togglingKey === item.key}
								onclick={() => quickToggleEnabled(item)}
								title={isInactive ? 'Aktifkan di editor' : 'Sembunyikan dari editor'}
								aria-label={isInactive ? `Aktifkan ${item.name}` : `Nonaktifkan ${item.name}`}
							>
								{#if isInactive}
									<EyeOff size={12} />
								{:else}
									<Eye size={12} />
								{/if}
							</button>
						{:else}
							<span class="fl-lock-dot" title="Filter bawaan terkunci" aria-label="Bawaan terkunci">
								<Lock size={11} />
							</span>
						{/if}
					</div>

					<div class="fl-body">
						<button
							type="button"
							class="fl-info-btn"
							onclick={() => (item.isCustom ? openEditModal(item) : (inspectingFilter = item))}
						>
							<h2 class="fl-name" title={item.name}>{item.name}</h2>
							<p class="fl-meta d-num">
								{item.category}{#if isInactive}
									· Nonaktif{/if}
							</p>
						</button>

						{#if item.isCustom}
							<div class="fl-card-actions">
								{#if confirmDeleteKey === item.key}
									<button
										type="button"
										class="fl-sm-btn is-danger"
										disabled={deletingKey === item.key}
										onclick={() => removeFilter(item.key, item.name)}
									>
										Hapus
									</button>
									<button
										type="button"
										class="fl-sm-btn"
										disabled={deletingKey === item.key}
										onclick={() => (confirmDeleteKey = null)}
									>
										Batal
									</button>
								{:else}
									<button
										type="button"
										class="fl-icon-btn"
										onclick={() => openEditModal(item)}
										title="Edit filter"
										aria-label="Edit filter {item.name}"
									>
										<Pencil size={13} />
									</button>
									<button
										type="button"
										class="fl-icon-btn is-danger"
										onclick={() => (confirmDeleteKey = item.key)}
										title="Hapus filter"
										aria-label="Hapus filter {item.name}"
									>
										<Trash2 size={13} />
									</button>
								{/if}
							</div>
						{/if}
					</div>
				</article>
			{/each}
		</section>

		<!-- Batasan Halaman (Pagination) -->
		<nav class="fl-pager" aria-label="Navigasi halaman filter">
			<span class="fl-pager-info d-num">
				Menampilkan {pageStart}–{pageEnd} dari {filteredFilters.length} filter
			</span>

			<div class="fl-pager-right">
				<div class="fl-pager-sizes" role="group" aria-label="Jumlah filter per halaman">
					{#each PAGE_SIZES as size (size)}
						<button
							type="button"
							class="fl-size-btn d-num"
							class:is-active={pageSize === size}
							onclick={() => (pageSize = size)}
						>
							{size}
						</button>
					{/each}
				</div>

				{#if totalPages > 1}
					<div class="fl-pager-nav">
						<button
							type="button"
							class="fl-nav-btn"
							disabled={safePage <= 1}
							onclick={() => (currentPage = Math.max(1, safePage - 1))}
							aria-label="Halaman sebelumnya"
						>
							<ChevronLeft size={14} />
						</button>
						<span class="fl-page-num d-num">{safePage} / {totalPages}</span>
						<button
							type="button"
							class="fl-nav-btn"
							disabled={safePage >= totalPages}
							onclick={() => (currentPage = Math.min(totalPages, safePage + 1))}
							aria-label="Halaman berikutnya"
						>
							<ChevronRight size={14} />
						</button>
					</div>
				{/if}
			</div>
		</nav>
	{/if}
</div>

<!-- Modal Buat / Edit Filter Kustom (dengan Slider Visual Live) -->
{#if showEditorModal}
	<div class="fl-modal" role="dialog" aria-modal="true" aria-label="Editor filter kustom">
		<button
			type="button"
			class="fl-modal-backdrop"
			aria-label="Tutup editor filter"
			onclick={closeEditorModal}
		></button>
		<div class="d-card fl-modal-box is-wide">
			<div class="fl-modal-head">
				<div>
					<h2 class="fl-modal-title">
						{editingKey ? 'Edit Filter Kustom' : 'Buat Filter Kustom'}
					</h2>
					<p class="fl-modal-sub">
						Geser slider atau pilih preset awal, lalu lihat perbandingan Asli vs Hasil langsung.
					</p>
				</div>
				<button type="button" class="fl-close-btn" onclick={closeEditorModal} aria-label="Tutup">
					<X size={15} />
				</button>
			</div>

			<form class="fl-editor-body" onsubmit={saveFilter}>
				{#if error}
					<div class="d-banner d-banner-err fl-span-full" role="alert"><span>{error}</span></div>
				{/if}

				<!-- Kiri: Perbandingan Asli vs Hasil + Preset Cepat -->
				<div class="fl-editor-left">
					<div class="fl-compare-grid">
						<div class="fl-compare-box">
							<div class="fl-compare-frame">
								{@render sampleVisual('none')}
							</div>
							<span class="fl-compare-cap">Asli</span>
						</div>
						<div class="fl-compare-box">
							<div class="fl-compare-frame">
								{@render sampleVisual(form.cssFilter || 'none')}
							</div>
							<span class="fl-compare-cap">Hasil Filter</span>
						</div>
					</div>

					<div class="fl-preset-bar">
						<span class="fl-label">Preset Cepat</span>
						<div class="fl-preset-chips">
							{#each QUICK_PRESETS as p (p.label)}
								<button type="button" class="fl-chip" onclick={() => applyQuickPreset(p.sliders)}>
									{p.label}
								</button>
							{/each}
							<button type="button" class="fl-chip" onclick={resetSliders}>Reset</button>
						</div>
					</div>

					<div class="fl-field-row">
						<div class="fl-field">
							<label class="fl-label" for="fl-ed-name">Nama Filter</label>
							<input
								id="fl-ed-name"
								type="text"
								class="fl-input"
								bind:value={form.name}
								placeholder="Contoh: Film Hangat"
								maxlength="80"
								required
							/>
						</div>
						<div class="fl-field">
							<label class="fl-label" for="fl-ed-cat">Kategori</label>
							<select id="fl-ed-cat" class="fl-input" bind:value={form.category}>
								{#each CATEGORIES as cat (cat)}
									<option value={cat}>{cat}</option>
								{/each}
							</select>
						</div>
					</div>

					<label class="fl-toggle-row">
						<input type="checkbox" class="toggle toggle-sm" bind:checked={form.enabled} />
						<span>Aktifkan di editor strip</span>
					</label>
				</div>

				<!-- Kanan: Slider Warna + Mode CSS Lanjutan -->
				<div class="fl-editor-right">
					<div class="fl-sliders">
						<div class="fl-slider-item">
							<div class="fl-slider-head">
								<label for="sl-bright">Kecerahan</label>
								<span class="d-num">{sliders.brightness}%</span>
							</div>
							<input
								id="sl-bright"
								type="range"
								min="50"
								max="160"
								step="1"
								class="fl-range"
								bind:value={sliders.brightness}
								oninput={syncCssFromSliders}
							/>
						</div>

						<div class="fl-slider-item">
							<div class="fl-slider-head">
								<label for="sl-contrast">Kontras</label>
								<span class="d-num">{sliders.contrast}%</span>
							</div>
							<input
								id="sl-contrast"
								type="range"
								min="50"
								max="180"
								step="1"
								class="fl-range"
								bind:value={sliders.contrast}
								oninput={syncCssFromSliders}
							/>
						</div>

						<div class="fl-slider-item">
							<div class="fl-slider-head">
								<label for="sl-sat">Saturasi</label>
								<span class="d-num">{sliders.saturate}%</span>
							</div>
							<input
								id="sl-sat"
								type="range"
								min="0"
								max="200"
								step="1"
								class="fl-range"
								bind:value={sliders.saturate}
								oninput={syncCssFromSliders}
							/>
						</div>

						<div class="fl-slider-item">
							<div class="fl-slider-head">
								<label for="sl-sepia">Sepia / Hangat</label>
								<span class="d-num">{sliders.sepia}%</span>
							</div>
							<input
								id="sl-sepia"
								type="range"
								min="0"
								max="100"
								step="1"
								class="fl-range"
								bind:value={sliders.sepia}
								oninput={syncCssFromSliders}
							/>
						</div>

						<div class="fl-slider-item">
							<div class="fl-slider-head">
								<label for="sl-gray">Hitam Putih</label>
								<span class="d-num">{sliders.grayscale}%</span>
							</div>
							<input
								id="sl-gray"
								type="range"
								min="0"
								max="100"
								step="1"
								class="fl-range"
								bind:value={sliders.grayscale}
								oninput={syncCssFromSliders}
							/>
						</div>

						<div class="fl-slider-item">
							<div class="fl-slider-head">
								<label for="sl-hue">Nada Warna (Hue)</label>
								<span class="d-num">{sliders.hue}°</span>
							</div>
							<input
								id="sl-hue"
								type="range"
								min="-180"
								max="180"
								step="2"
								class="fl-range"
								bind:value={sliders.hue}
								oninput={syncCssFromSliders}
							/>
						</div>

						<div class="fl-slider-item">
							<div class="fl-slider-head">
								<label for="sl-blur">Kelembutan (Blur)</label>
								<span class="d-num">{sliders.blur} px</span>
							</div>
							<input
								id="sl-blur"
								type="range"
								min="0"
								max="6"
								step="0.5"
								class="fl-range"
								bind:value={sliders.blur}
								oninput={syncCssFromSliders}
							/>
						</div>
					</div>

					<button type="button" class="fl-adv-toggle" onclick={() => (showRawCss = !showRawCss)}>
						{showRawCss ? 'Sembunyikan CSS lanjutan' : 'Edit CSS filter manual'}
					</button>

					{#if showRawCss}
						<div class="fl-field">
							<label class="fl-label" for="fl-ed-css">CSS Filter</label>
							<input
								id="fl-ed-css"
								type="text"
								class="fl-input d-num"
								bind:value={form.cssFilter}
								placeholder="sepia(0.35) contrast(1.1)"
							/>
						</div>
					{/if}
				</div>

				<div class="fl-modal-foot fl-span-full">
					<button type="button" class="fl-btn" onclick={closeEditorModal} disabled={saving}>
						Batal
					</button>
					<button type="submit" class="fl-btn is-primary" disabled={saving}>
						{saving ? 'Menyimpan…' : editingKey ? 'Simpan Perubahan' : 'Simpan Filter'}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}

<!-- Modal Pratinjau Filter Bawaan -->
{#if inspectingFilter}
	<div class="fl-modal" role="dialog" aria-modal="true" aria-label="Pratinjau filter bawaan">
		<button
			type="button"
			class="fl-modal-backdrop"
			aria-label="Tutup pratinjau filter"
			onclick={() => (inspectingFilter = null)}
		></button>
		<div class="d-card fl-modal-box">
			<div class="fl-modal-head">
				<div>
					<h2 class="fl-modal-title">{inspectingFilter.name}</h2>
					<p class="fl-modal-sub">
						{inspectingFilter.category} · Bawaan (terkunci)
					</p>
				</div>
				<button
					type="button"
					class="fl-close-btn"
					onclick={() => (inspectingFilter = null)}
					aria-label="Tutup"
				>
					<X size={15} />
				</button>
			</div>

			<div class="fl-inspect-body">
				<div class="fl-compare-grid">
					<div class="fl-compare-box">
						<div class="fl-compare-frame">
							{@render sampleVisual('none')}
						</div>
						<span class="fl-compare-cap">Asli</span>
					</div>
					<div class="fl-compare-box">
						<div class="fl-compare-frame">
							{@render sampleVisual(previewCssFor(inspectingFilter))}
						</div>
						<span class="fl-compare-cap">{inspectingFilter.name}</span>
					</div>
				</div>

				<dl class="fl-specs">
					<div class="fl-spec-row">
						<dt>Kunci</dt>
						<dd class="d-num">{inspectingFilter.key}</dd>
					</div>
					<div class="fl-spec-row">
						<dt>CSS Filter</dt>
						<dd class="d-num">{inspectingFilter.cssFilter || 'Original / Warna studio'}</dd>
					</div>
				</dl>

				<div class="fl-modal-foot">
					<button type="button" class="fl-btn" onclick={() => (inspectingFilter = null)}>
						Tutup
					</button>
					<button
						type="button"
						class="fl-btn is-primary"
						onclick={() => inspectingFilter && openCreateModal(inspectingFilter)}
					>
						<Copy size={13} />
						Duplikat jadi Kustom
					</button>
				</div>
			</div>
		</div>
	</div>
{/if}

<style>
	.fl-file-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}

	.fl-page {
		display: flex;
		flex-direction: column;
		gap: 18px;
	}

	/* ── Header Minimalis ── */
	.fl-head {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		justify-content: space-between;
		gap: 12px 18px;
	}

	.fl-head-copy {
		min-width: 0;
		flex: 1 1 240px;
	}

	.fl-title {
		margin: 0;
		font-size: clamp(1.4rem, 2vw, 1.7rem);
		font-weight: 800;
		letter-spacing: -0.025em;
		line-height: 1.15;
		color: var(--d-ink);
	}

	.fl-sub {
		margin: 4px 0 0;
		font-size: 0.82rem;
		color: var(--d-muted);
	}

	.fl-head-actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
	}

	.fl-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		height: 36px;
		padding: 0 14px;
		border: 1px solid var(--d-border);
		border-radius: 9px;
		background: var(--d-surface);
		color: var(--d-ink);
		font-family: var(--font-body);
		font-size: 0.76rem;
		font-weight: 700;
		white-space: nowrap;
		cursor: pointer;
		transition:
			background-color 140ms ease,
			border-color 140ms ease,
			opacity 140ms ease;
	}

	.fl-btn:hover:not(:disabled) {
		background: var(--d-surface-2);
		border-color: var(--d-border-strong);
	}

	.fl-btn:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}

	.fl-btn.is-primary {
		border-color: var(--d-ink);
		background: var(--d-ink);
		color: var(--d-bg);
	}

	.fl-btn.is-primary:hover:not(:disabled) {
		opacity: 0.9;
		background: var(--d-ink);
	}

	/* ── Toolbar ── */
	.fl-toolbar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
	}

	.fl-search {
		position: relative;
		display: flex;
		align-items: center;
		flex: 1 1 200px;
		max-width: 290px;
		color: var(--d-muted);
	}

	.fl-search :global(svg) {
		position: absolute;
		left: 11px;
		pointer-events: none;
	}

	.fl-search-input {
		width: 100%;
		height: 34px;
		padding: 0 11px 0 32px;
		border: 1px solid var(--d-border);
		border-radius: 9px;
		background: var(--d-surface);
		color: var(--d-ink);
		font-family: var(--font-body);
		font-size: 0.78rem;
		outline: none;
	}

	.fl-search-input:focus {
		border-color: var(--d-border-strong);
	}

	.fl-pills {
		display: flex;
		flex-wrap: wrap;
		gap: 5px;
	}

	.fl-pill {
		height: 30px;
		padding: 0 10px;
		border: 1px solid var(--d-border);
		border-radius: 8px;
		background: var(--d-surface);
		color: var(--d-muted);
		font-family: var(--font-body);
		font-size: 0.72rem;
		font-weight: 700;
		cursor: pointer;
	}

	.fl-pill:hover:not(.is-active) {
		color: var(--d-ink);
		border-color: var(--d-border-strong);
	}

	.fl-pill.is-active {
		border-color: var(--d-ink);
		background: var(--d-ink);
		color: var(--d-bg);
	}

	/* ── Grid Kartu Filter ── */
	.fl-grid {
		display: grid;
		gap: 12px;
		grid-template-columns: repeat(auto-fill, minmax(208px, 1fr));
	}

	.fl-skel {
		height: 215px;
		border-radius: 14px;
		background: var(--d-surface-2);
	}

	.fl-empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 8px;
		min-height: 260px;
		padding: 32px 20px;
		border: 1.5px dashed var(--d-border-strong);
		border-radius: 16px;
		background: var(--d-surface);
		color: var(--d-muted);
		text-align: center;
	}

	.fl-empty-title {
		margin: 4px 0 0;
		font-size: 0.92rem;
		font-weight: 800;
		color: var(--d-ink);
	}

	.fl-empty-sub {
		margin: 0 0 8px;
		max-width: 42ch;
		font-size: 0.78rem;
		line-height: 1.5;
	}

	.fl-card {
		display: flex;
		flex-direction: column;
		border: 1px solid var(--d-border);
		border-radius: 14px;
		background: var(--d-surface);
		overflow: hidden;
		transition:
			border-color 140ms ease,
			opacity 140ms ease;
	}

	.fl-card:hover {
		border-color: var(--d-border-strong);
	}

	.fl-card.is-inactive {
		opacity: 0.62;
	}

	.fl-media {
		position: relative;
		height: 146px;
		border-bottom: 1px solid var(--d-border);
		overflow: hidden;
		background: var(--d-bg);
	}

	.fl-media-btn {
		width: 100%;
		height: 100%;
		padding: 0;
		border: none;
		background: transparent;
		display: block;
		cursor: pointer;
	}

	.fl-scene {
		width: 100%;
		height: 100%;
		transition: transform 180ms ease;
	}

	.fl-media-btn:hover .fl-scene {
		transform: scale(1.03);
	}

	.fl-scene-img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}

	.fl-cat-badge {
		position: absolute;
		top: 8px;
		left: 8px;
		padding: 2px 7px;
		border-radius: 6px;
		background: rgba(15, 23, 42, 0.72);
		color: #ffffff;
		font-size: 0.64rem;
		font-weight: 700;
		backdrop-filter: blur(4px);
		pointer-events: none;
	}

	.fl-cat-badge.is-custom {
		background: rgba(37, 99, 235, 0.88);
	}

	.fl-vis-btn {
		position: absolute;
		top: 8px;
		right: 8px;
		width: 24px;
		height: 24px;
		border: none;
		border-radius: 6px;
		background: rgba(15, 23, 42, 0.72);
		color: #4ade80;
		display: grid;
		place-items: center;
		cursor: pointer;
		backdrop-filter: blur(4px);
	}

	.fl-vis-btn.is-off {
		color: #cbd5e1;
	}

	.fl-lock-dot {
		position: absolute;
		top: 8px;
		right: 8px;
		width: 22px;
		height: 22px;
		border-radius: 6px;
		background: rgba(15, 23, 42, 0.56);
		color: rgba(255, 255, 255, 0.85);
		display: grid;
		place-items: center;
		pointer-events: none;
	}

	.fl-body {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 6px;
		padding: 10px 12px;
	}

	.fl-info-btn {
		min-width: 0;
		flex: 1;
		padding: 0;
		border: none;
		background: transparent;
		text-align: left;
		cursor: pointer;
	}

	.fl-name {
		margin: 0;
		font-size: 0.82rem;
		font-weight: 800;
		color: var(--d-ink);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.fl-meta {
		margin: 2px 0 0;
		font-size: 0.7rem;
		color: var(--d-muted);
	}

	.fl-card-actions {
		display: inline-flex;
		align-items: center;
		gap: 3px;
		flex-shrink: 0;
	}

	.fl-icon-btn {
		width: 26px;
		height: 26px;
		border: 1px solid transparent;
		border-radius: 7px;
		background: transparent;
		color: var(--d-muted);
		display: grid;
		place-items: center;
		cursor: pointer;
	}

	.fl-icon-btn:hover {
		background: var(--d-surface-2);
		color: var(--d-ink);
	}

	.fl-icon-btn.is-danger:hover {
		background: var(--d-err-soft);
		color: var(--d-err);
	}

	.fl-sm-btn {
		height: 26px;
		padding: 0 8px;
		border: 1px solid var(--d-border);
		border-radius: 6px;
		background: var(--d-surface-2);
		color: var(--d-ink);
		font-family: var(--font-body);
		font-size: 0.69rem;
		font-weight: 700;
		cursor: pointer;
	}

	.fl-sm-btn.is-danger {
		border-color: var(--d-err);
		background: var(--d-err);
		color: #ffffff;
	}

	/* ── Pagination ── */
	.fl-pager {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 10px 14px;
		padding-top: 10px;
		border-top: 1px solid var(--d-border);
	}

	.fl-pager-info {
		font-size: 0.74rem;
		font-weight: 600;
		color: var(--d-muted);
	}

	.fl-pager-right {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 10px;
	}

	.fl-pager-sizes {
		display: inline-flex;
		padding: 2px;
		border: 1px solid var(--d-border);
		border-radius: 8px;
		background: var(--d-surface);
		gap: 2px;
	}

	.fl-size-btn {
		height: 24px;
		min-width: 30px;
		padding: 0 7px;
		border: none;
		border-radius: 6px;
		background: transparent;
		color: var(--d-muted);
		font-family: var(--font-body);
		font-size: 0.71rem;
		font-weight: 700;
		cursor: pointer;
	}

	.fl-size-btn.is-active {
		background: var(--d-ink);
		color: var(--d-bg);
	}

	.fl-pager-nav {
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}

	.fl-nav-btn {
		width: 30px;
		height: 30px;
		border: 1px solid var(--d-border);
		border-radius: 8px;
		background: var(--d-surface);
		color: var(--d-ink);
		display: grid;
		place-items: center;
		cursor: pointer;
	}

	.fl-nav-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.fl-page-num {
		min-width: 44px;
		text-align: center;
		font-size: 0.74rem;
		font-weight: 700;
		color: var(--d-ink);
	}

	/* ── Modal ── */
	.fl-modal {
		position: fixed;
		inset: 0;
		z-index: 80;
		display: grid;
		place-items: center;
		padding: 18px;
	}

	.fl-modal-backdrop {
		position: absolute;
		inset: 0;
		border: none;
		background: rgba(0, 0, 0, 0.56);
		backdrop-filter: blur(4px);
		cursor: pointer;
	}

	.fl-modal-box {
		position: relative;
		z-index: 1;
		width: min(94vw, 560px);
		max-height: 90dvh;
		display: flex;
		flex-direction: column;
		box-shadow: 0 24px 60px rgba(0, 0, 0, 0.4);
	}

	.fl-modal-box.is-wide {
		width: min(95vw, 760px);
	}

	.fl-modal-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 12px;
		padding: 14px 18px;
		border-bottom: 1px solid var(--d-border);
	}

	.fl-modal-title {
		margin: 0;
		font-size: 0.94rem;
		font-weight: 800;
		color: var(--d-ink);
	}

	.fl-modal-sub {
		margin: 2px 0 0;
		font-size: 0.74rem;
		color: var(--d-muted);
	}

	.fl-close-btn {
		width: 30px;
		height: 30px;
		border: 1px solid var(--d-border);
		border-radius: 8px;
		background: var(--d-surface-2);
		color: var(--d-ink);
		display: grid;
		place-items: center;
		cursor: pointer;
	}

	.fl-editor-body {
		overflow-y: auto;
		padding: 16px 18px 18px;
		display: grid;
		grid-template-columns: minmax(0, 1.1fr) minmax(0, 0.9fr);
		gap: 16px 18px;
		align-items: start;
	}

	.fl-span-full {
		grid-column: 1 / -1;
	}

	.fl-editor-left,
	.fl-editor-right {
		display: flex;
		flex-direction: column;
		gap: 12px;
		min-width: 0;
	}

	.fl-compare-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 10px;
	}

	.fl-compare-box {
		display: flex;
		flex-direction: column;
		gap: 5px;
	}

	.fl-compare-frame {
		aspect-ratio: 4 / 3;
		border-radius: 10px;
		border: 1px solid var(--d-border);
		overflow: hidden;
		background: var(--d-bg);
	}

	.fl-compare-cap {
		font-size: 0.69rem;
		font-weight: 700;
		color: var(--d-muted);
		text-align: center;
	}

	.fl-preset-bar {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.fl-preset-chips {
		display: flex;
		flex-wrap: wrap;
		gap: 5px;
	}

	.fl-chip {
		height: 25px;
		padding: 0 8px;
		border: 1px solid var(--d-border);
		border-radius: 6px;
		background: var(--d-bg);
		color: var(--d-ink);
		font-family: var(--font-body);
		font-size: 0.69rem;
		font-weight: 700;
		cursor: pointer;
	}

	.fl-chip:hover {
		background: var(--d-surface-2);
		border-color: var(--d-border-strong);
	}

	.fl-field-row {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 10px;
	}

	.fl-field {
		display: flex;
		flex-direction: column;
		gap: 5px;
		min-width: 0;
	}

	.fl-label {
		font-size: 0.72rem;
		font-weight: 700;
		color: var(--d-muted);
	}

	.fl-input {
		height: 35px;
		padding: 0 10px;
		border: 1px solid var(--d-border);
		border-radius: 9px;
		background: var(--d-bg);
		color: var(--d-ink);
		font-family: var(--font-body);
		font-size: 0.8rem;
		font-weight: 600;
		outline: none;
		width: 100%;
	}

	.fl-input:focus {
		border-color: var(--d-border-strong);
	}

	.fl-toggle-row {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 0.76rem;
		font-weight: 700;
		color: var(--d-ink);
		cursor: pointer;
	}

	.fl-sliders {
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding: 12px;
		border: 1px solid var(--d-border);
		border-radius: 12px;
		background: var(--d-bg);
	}

	.fl-slider-item {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.fl-slider-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		font-size: 0.72rem;
		font-weight: 700;
		color: var(--d-muted);
	}

	.fl-slider-head span {
		color: var(--d-ink);
	}

	.fl-range {
		width: 100%;
		accent-color: var(--d-ink);
		cursor: pointer;
	}

	.fl-adv-toggle {
		align-self: flex-start;
		border: none;
		padding: 0;
		background: transparent;
		color: var(--d-muted);
		font-family: var(--font-body);
		font-size: 0.72rem;
		font-weight: 700;
		cursor: pointer;
	}

	.fl-adv-toggle:hover {
		color: var(--d-ink);
		text-decoration: underline;
	}

	.fl-modal-foot {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
		padding-top: 10px;
		border-top: 1px solid var(--d-border);
	}

	.fl-inspect-body {
		overflow-y: auto;
		padding: 16px 18px 18px;
		display: flex;
		flex-direction: column;
		gap: 14px;
	}

	.fl-specs {
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 7px;
		padding: 11px 12px;
		border: 1px solid var(--d-border);
		border-radius: 10px;
		background: var(--d-bg);
	}

	.fl-spec-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		font-size: 0.74rem;
	}

	.fl-spec-row dt {
		color: var(--d-muted);
		font-weight: 600;
	}

	.fl-spec-row dd {
		margin: 0;
		color: var(--d-ink);
		font-weight: 700;
		text-align: right;
		word-break: break-word;
	}

	@media (max-width: 700px) {
		.fl-editor-body {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
