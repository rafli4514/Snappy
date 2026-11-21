<script lang="ts">
	import { onMount } from 'svelte';
	import { listFrames } from '#lib/utils/frameStorage';
	import HBarChart from '#lib/features/dashboard/HBarChart.svelte';
	import SegmentBar from '#lib/features/dashboard/SegmentBar.svelte';
	import VBarChart from '#lib/features/dashboard/VBarChart.svelte';

	type SessionSummary = {
		id: string;
		createdAt?: string;
		photoCount?: number;
		templateKey?: string;
		formatId?: string;
		hasGif?: boolean;
		hasVideo?: boolean;
	};

	let frames = $state<Awaited<ReturnType<typeof listFrames>>>([]);
	let framesLoading = $state(true);
	let sessionsLoading = $state(true);
	let sessionsError = $state<string | null>(null);
	let sessions = $state<SessionSummary[]>([]);

	type TrendTab = 'hari' | 'minggu' | 'jam';
	let activeTrendTab = $state<TrendTab>('minggu');

	const TREND_TABS: { id: TrendTab; label: string }[] = [
		{ id: 'hari', label: 'Per Hari' },
		{ id: 'minggu', label: 'Per Minggu' },
		{ id: 'jam', label: 'Per Jam' }
	];

	const LIMIT = 200;
	const DAY_NAMES = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
	const MONTH_NAMES = [
		'Jan',
		'Feb',
		'Mar',
		'Apr',
		'Mei',
		'Jun',
		'Jul',
		'Agu',
		'Sep',
		'Okt',
		'Nov',
		'Des'
	];

	function startOfLocalDay(d: Date): Date {
		const x = new Date(d);
		x.setHours(0, 0, 0, 0);
		return x;
	}

	function dayKey(d: Date): string {
		const y = d.getFullYear();
		const m = String(d.getMonth() + 1).padStart(2, '0');
		const day = String(d.getDate()).padStart(2, '0');
		return `${y}-${m}-${day}`;
	}

	/** Senin 00:00 waktu lokal sebagai awal minggu. */
	function startOfLocalWeek(d: Date): Date {
		const x = startOfLocalDay(d);
		x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
		return x;
	}

	function parseDate(iso?: string): Date | null {
		if (!iso) return null;
		const d = new Date(iso);
		return Number.isFinite(d.getTime()) ? d : null;
	}

	const loadedCount = $derived(sessions.length);
	const todayKey = $derived(dayKey(startOfLocalDay(new Date())));

	const todayCount = $derived.by(() => {
		let n = 0;
		for (const s of sessions) {
			const d = parseDate(s.createdAt);
			if (d && dayKey(startOfLocalDay(d)) === todayKey) n++;
		}
		return n;
	});

	const last7Count = $derived.by(() => {
		const now = startOfLocalDay(new Date());
		const from = new Date(now);
		from.setDate(from.getDate() - 6);
		let n = 0;
		for (const s of sessions) {
			const d = parseDate(s.createdAt);
			if (!d) continue;
			const sd = startOfLocalDay(d);
			if (sd >= from && sd <= now) n++;
		}
		return n;
	});

	const timelapseCount = $derived(sessions.filter((s) => s.hasGif || s.hasVideo).length);
	const timelapsePct = $derived(loadedCount ? Math.round((timelapseCount / loadedCount) * 100) : 0);

	const perDay7 = $derived.by(() => {
		const now = startOfLocalDay(new Date());
		const days: { key: string; label: string; value: number }[] = [];
		const map = new Map<string, number>();
		for (let i = 6; i >= 0; i--) {
			const d = new Date(now);
			d.setDate(d.getDate() - i);
			const k = dayKey(d);
			map.set(k, 0);
			days.push({ key: k, label: `${DAY_NAMES[d.getDay()]} ${d.getDate()}`, value: 0 });
		}
		for (const s of sessions) {
			const d = parseDate(s.createdAt);
			if (!d) continue;
			const k = dayKey(startOfLocalDay(d));
			if (map.has(k)) map.set(k, (map.get(k) || 0) + 1);
		}
		return days.map((x) => ({ ...x, value: map.get(x.key) || 0 }));
	});

	const perWeek8 = $derived.by(() => {
		const thisWeek = startOfLocalWeek(new Date());
		const weeks: { key: string; label: string; sub: string; value: number }[] = [];
		const map = new Map<string, number>();
		for (let i = 7; i >= 0; i--) {
			const start = new Date(thisWeek);
			start.setDate(start.getDate() - i * 7);
			const end = new Date(start);
			end.setDate(end.getDate() + 6);
			const k = dayKey(start);
			map.set(k, 0);
			const startLabel = `${start.getDate()} ${MONTH_NAMES[start.getMonth()]}`;
			const endLabel = `${end.getDate()} ${MONTH_NAMES[end.getMonth()]}`;
			weeks.push({
				key: k,
				label: startLabel,
				sub: `${startLabel} – ${endLabel}`,
				value: 0
			});
		}
		for (const s of sessions) {
			const d = parseDate(s.createdAt);
			if (!d) continue;
			const k = dayKey(startOfLocalWeek(d));
			if (map.has(k)) map.set(k, (map.get(k) || 0) + 1);
		}
		return weeks.map((x) => ({ ...x, value: map.get(x.key) || 0 }));
	});

	const formatDist = $derived.by(() => {
		const counts = new Map<string, number>();
		for (const s of sessions) {
			const key = (s.formatId || s.templateKey || 'Tanpa format').trim() || 'Tanpa format';
			counts.set(key, (counts.get(key) || 0) + 1);
		}
		const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
		const top = sorted.slice(0, 6).map(([label, value]) => ({ label, value }));
		const rest = sorted.slice(6).reduce((sum, [, v]) => sum + v, 0);
		if (rest > 0) top.push({ label: 'Lainnya', value: rest });
		return top;
	});

	const photoDist = $derived.by(() => {
		const buckets = new Map<number, number>();
		for (let i = 1; i <= 6; i++) buckets.set(i, 0);
		for (const s of sessions) {
			const n = Math.round(Number(s.photoCount));
			if (Number.isFinite(n) && n >= 1 && n <= 6) buckets.set(n, (buckets.get(n) || 0) + 1);
		}
		return [1, 2, 3, 4, 5, 6].map((n) => ({ label: `${n} foto`, value: buckets.get(n) || 0 }));
	});

	const outputSegs = $derived.by(() => {
		let video = 0;
		let gifOnly = 0;
		let none = 0;
		for (const s of sessions) {
			if (s.hasVideo) video++;
			else if (s.hasGif) gifOnly++;
			else none++;
		}
		return [
			{ label: 'Video', value: video, color: '#2563eb' },
			{ label: 'GIF saja', value: gifOnly, color: '#d97706' },
			{ label: 'Tanpa timelapse', value: none, color: '#78716c' }
		];
	});

	const perHour = $derived.by(() => {
		const buckets = Array.from({ length: 24 }, (_, h) => ({
			label: String(h).padStart(2, '0'),
			value: 0
		}));
		for (const s of sessions) {
			const d = parseDate(s.createdAt);
			if (!d) continue;
			buckets[d.getHours()].value++;
		}
		return buckets;
	});

	const trendView = $derived.by(() => {
		if (activeTrendTab === 'hari') {
			return {
				items: perDay7,
				sub: '7 hari terakhir (termasuk hari ini), waktu lokal.',
				label: 'Jumlah sesi per hari, 7 hari terakhir',
				titleId: 'chart-trend-day'
			};
		}
		if (activeTrendTab === 'jam') {
			return {
				items: perHour,
				sub: 'Pola jam pemotretan dari sesi termuat (00–23), waktu lokal.',
				label: 'Distribusi sesi per jam dalam sehari',
				titleId: 'chart-trend-hour'
			};
		}
		return {
			items: perWeek8,
			sub: '8 minggu terakhir (Senin–Minggu), label = tanggal mulai minggu.',
			label: 'Jumlah sesi per minggu, 8 minggu terakhir',
			titleId: 'chart-trend-week'
		};
	});

	const trendTotal = $derived(trendView.items.reduce((sum, i) => sum + i.value, 0));

	function onTrendKeydown(e: KeyboardEvent, id: TrendTab) {
		const i = TREND_TABS.findIndex((t) => t.id === id);
		let next = i;
		if (e.key === 'ArrowRight') next = (i + 1) % TREND_TABS.length;
		else if (e.key === 'ArrowLeft') next = (i - 1 + TREND_TABS.length) % TREND_TABS.length;
		else if (e.key === 'Home') next = 0;
		else if (e.key === 'End') next = TREND_TABS.length - 1;
		else return;
		e.preventDefault();
		activeTrendTab = TREND_TABS[next].id;
		document.getElementById(`trend-tab-${TREND_TABS[next].id}`)?.focus();
	}

	onMount(async () => {
		try {
			frames = await listFrames();
		} catch {
			frames = [];
		} finally {
			framesLoading = false;
		}
		sessionsLoading = true;
		sessionsError = null;
		try {
			const res = await fetch(`/api/gallery?list=1&limit=${LIMIT}`);
			if (!res.ok) throw new Error('API tidak tersedia');
			const data = (await res.json()) as { sessions?: SessionSummary[] };
			sessions = Array.isArray(data.sessions) ? data.sessions : [];
		} catch (e) {
			sessions = [];
			sessionsError =
				e instanceof Error
					? 'Data sesi tidak terbaca (butuh Node + disk .gallery_cache).'
					: 'Data sesi tidak terbaca.';
		} finally {
			sessionsLoading = false;
		}
	});

	const frameCount = $derived(frames.length);
</script>

<div class="dash-page">
	<header class="dash-head">
		<p class="eyebrow font-mono">ADMIN · DASHBOARD</p>
		<h1 class="dash-title font-display">Dashboard</h1>
		<p class="dash-sub">
			Ringkasan sesi pemotretan dari server (<span class="font-mono">.gallery_cache</span>, Node +
			disk tulis). Grafik berdasarkan maks. {LIMIT} sesi terbaru yang termuat.
		</p>
	</header>

	<section class="dash-stats" aria-label="Indikator sesi">
		<div class="card border border-base-300 bg-base-200">
			<div class="card-body gap-1">
				<p class="stat-label font-mono">TOTAL SESI (TERMUAT)</p>
				<p class="font-display stat-value">{sessionsLoading ? '…' : loadedCount}</p>
				<p class="stat-hint">Maks. {LIMIT} sesi terbaru dari cache server.</p>
			</div>
		</div>
		<div class="card border border-base-300 bg-base-200">
			<div class="card-body gap-1">
				<p class="stat-label font-mono">HARI INI</p>
				<p class="font-display stat-value">{sessionsLoading ? '…' : todayCount}</p>
				<p class="stat-hint">Sesi dengan tanggal lokal hari ini.</p>
			</div>
		</div>
		<div class="card border border-base-300 bg-base-200">
			<div class="card-body gap-1">
				<p class="stat-label font-mono">7 HARI TERAKHIR</p>
				<p class="font-display stat-value">{sessionsLoading ? '…' : last7Count}</p>
				<p class="stat-hint">Termasuk hari ini (rolling).</p>
			</div>
		</div>
		<div class="card border border-base-300 bg-base-200">
			<div class="card-body gap-1">
				<p class="stat-label font-mono">OUTPUT TIMELAPSE</p>
				<p class="font-display stat-value">{sessionsLoading ? '…' : `${timelapsePct}%`}</p>
				<p class="stat-hint">
					{sessionsLoading ? '—' : `${timelapseCount} dari ${loadedCount} sesi punya GIF/video.`}
				</p>
			</div>
		</div>
	</section>

	{#if sessionsError}
		<div class="panel alert-panel" role="status">
			<p class="panel-note">{sessionsError} Grafik sesi tidak ditampilkan.</p>
		</div>
	{:else}
		<section class="charts-grid" aria-label="Grafik sesi pemotretan">
			<div class="panel span-2">
				<div class="panel-head panel-head-tabs">
					<div>
						<h2 class="section-title font-mono">AKTIVITAS SESI</h2>
						<p class="panel-sub">{trendView.sub}</p>
					</div>
					<div class="trend-tabs" role="tablist" aria-label="Rentang grafik aktivitas sesi">
						{#each TREND_TABS as tab (tab.id)}
							<button
								type="button"
								id={`trend-tab-${tab.id}`}
								class="trend-tab"
								class:active={activeTrendTab === tab.id}
								role="tab"
								aria-selected={activeTrendTab === tab.id}
								aria-controls="trend-panel"
								tabindex={activeTrendTab === tab.id ? 0 : -1}
								onclick={() => (activeTrendTab = tab.id)}
								onkeydown={(e) => onTrendKeydown(e, tab.id)}
							>
								{tab.label}
							</button>
						{/each}
					</div>
				</div>
				<div
					class="panel-body"
					id="trend-panel"
					role="tabpanel"
					aria-labelledby={`trend-tab-${activeTrendTab}`}
				>
					{#if sessionsLoading}
						<p class="panel-note">Memuat grafik…</p>
					{:else if trendTotal === 0}
						<p class="panel-note">
							Tidak ada sesi pada rentang ini (dari maks. {LIMIT} sesi terbaru).
						</p>
					{:else}
						<VBarChart
							items={trendView.items}
							titleId={trendView.titleId}
							label={trendView.label}
						/>
					{/if}
				</div>
			</div>

			<div class="panel">
				<div class="panel-head">
					<div>
						<h2 class="section-title font-mono">DISTRIBUSI FORMAT</h2>
						<p class="panel-sub">Berdasarkan formatId (fallback templateKey).</p>
					</div>
				</div>
				<div class="panel-body">
					{#if sessionsLoading}
						<p class="panel-note">Memuat grafik…</p>
					{:else}
						<HBarChart
							items={formatDist}
							titleId="chart-format"
							label="Distribusi format sesi"
							empty="Belum ada sesi."
						/>
					{/if}
				</div>
			</div>

			<div class="panel">
				<div class="panel-head">
					<div>
						<h2 class="section-title font-mono">JUMLAH FOTO PER SESI</h2>
						<p class="panel-sub">Distribusi 1–6 foto.</p>
					</div>
				</div>
				<div class="panel-body">
					{#if sessionsLoading}
						<p class="panel-note">Memuat grafik…</p>
					{:else}
						<HBarChart
							items={photoDist}
							titleId="chart-photo-count"
							label="Distribusi jumlah foto per sesi"
							empty="Belum ada sesi."
						/>
					{/if}
				</div>
			</div>

			<div class="panel">
				<div class="panel-head">
					<div>
						<h2 class="section-title font-mono">KELENGKAPAN OUTPUT</h2>
						<p class="panel-sub">Kategori eksklusif: Video / GIF saja / Tanpa timelapse.</p>
					</div>
				</div>
				<div class="panel-body">
					{#if sessionsLoading}
						<p class="panel-note">Memuat grafik…</p>
					{:else}
						<SegmentBar
							segments={outputSegs}
							titleId="chart-output"
							label="Komposisi output timelapse sesi"
						/>
					{/if}
				</div>
			</div>
		</section>
	{/if}

	<section aria-label="Akses cepat">
		<h2 class="section-title font-mono">MENU</h2>
		<div class="quick-grid">
			<a class="quick-card" href="/dashboard/sessions"
				><p class="quick-name">Session</p>
				<p class="quick-desc">Riwayat sesi dan output foto.</p></a
			>
			<a class="quick-card" href="/dashboard/gallery"
				><p class="quick-name">Gallery</p>
				<p class="quick-desc">Kelola sesi via QR dan tautan.</p></a
			>
			<a class="quick-card" href="/dashboard/assets"
				><p class="quick-name">Asset</p>
				<p class="quick-desc">Frame, size, sticker, filter, AR.</p></a
			>
			<a class="quick-card" href="/dashboard/queue"
				><p class="quick-name">Queue</p>
				<p class="quick-desc">Print, cloud sync, upload.</p></a
			>
			<a class="quick-card" href="/dashboard/settings"
				><p class="quick-name">Setting</p>
				<p class="quick-desc">Tema, kamera, dan operasional.</p></a
			>
		</div>
	</section>

	<section aria-label="Status frame">
		<h2 class="section-title font-mono">FRAME</h2>
		<p class="panel-note">
			{framesLoading
				? 'Memuat frame…'
				: frameCount > 0
					? `${frameCount} frame tersimpan di browser (IndexedDB).`
					: 'Belum ada frame custom tersimpan.'}
		</p>
		<a class="btn btn-outline btn-sm" href="/dashboard/assets/frames">Buka Frame Studio</a>
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
		opacity: 0.6;
	}
	.dash-title {
		margin: 6px 0 0;
		font-size: 2rem;
		line-height: 1.1;
	}
	.dash-sub {
		margin: 8px 0 0;
		max-width: 72ch;
		font-size: 0.85rem;
		line-height: 1.55;
		opacity: 0.75;
	}
	.dash-stats {
		display: grid;
		gap: 12px;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
	}
	.stat-label {
		margin: 0;
		font-size: 0.62rem;
		font-weight: 700;
		letter-spacing: 0.16em;
		opacity: 0.6;
	}
	.stat-value {
		margin: 2px 0 0;
		font-size: 2rem;
		line-height: 1;
	}
	.stat-hint {
		margin: 4px 0 0;
		font-size: 0.76rem;
		line-height: 1.45;
		opacity: 0.7;
	}
	.charts-grid {
		display: grid;
		gap: 12px;
		grid-template-columns: 1fr;
	}
	.panel {
		border: 1px solid var(--color-base-300, #d6d3d1);
		border-radius: var(--radius-box, 12px);
		background: var(--color-base-200, #f5f5f4);
		overflow: hidden;
	}
	.panel-head {
		padding: 14px 16px 0;
	}
	.panel-head-tabs {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-start;
		justify-content: space-between;
		gap: 10px;
	}
	.trend-tabs {
		display: flex;
		flex-wrap: wrap;
		gap: 2px;
		padding: 3px;
		border-radius: var(--radius-pill, 9999px);
		background: color-mix(in srgb, var(--color-base-content, #1c1917) 7%, transparent);
	}
	.trend-tab {
		min-height: 44px;
		padding: 0 14px;
		border: 1px solid transparent;
		border-radius: var(--radius-pill, 9999px);
		background: transparent;
		color: inherit;
		font-family: inherit;
		font-size: 0.76rem;
		font-weight: 600;
		cursor: pointer;
		opacity: 0.75;
	}
	.trend-tab:hover {
		opacity: 1;
	}
	.trend-tab.active {
		background: var(--color-base-100, #fafaf9);
		border-color: var(--color-base-300, #d6d3d1);
		color: var(--color-base-content, #1c1917);
		opacity: 1;
	}
	.trend-tab:focus-visible {
		outline: 2px solid var(--color-primary, #d97706);
		outline-offset: 2px;
	}
	.panel-body {
		padding: 12px 16px 16px;
	}
	.section-title {
		margin: 0;
		font-size: 0.66rem;
		font-weight: 700;
		letter-spacing: 0.22em;
		opacity: 0.65;
	}
	.panel-sub {
		margin: 4px 0 0;
		font-size: 0.76rem;
		line-height: 1.45;
		opacity: 0.7;
	}
	.panel-note {
		margin: 0;
		font-size: 0.82rem;
		opacity: 0.75;
	}
	.alert-panel .panel-note {
		padding: 14px 16px;
	}
	.quick-grid {
		display: grid;
		gap: 10px;
		grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
		margin-top: 10px;
	}
	.quick-card {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 14px;
		border: 1px solid var(--color-base-300, #d6d3d1);
		border-radius: var(--radius-box, 12px);
		background: var(--color-base-200, #f5f5f4);
		text-decoration: none;
		color: inherit;
	}
	.quick-card:hover {
		border-color: var(--color-base-content, #1c1917);
	}
	.quick-name {
		margin: 0;
		font-size: 0.9rem;
		font-weight: 700;
	}
	.quick-desc {
		margin: 0;
		font-size: 0.72rem;
		line-height: 1.45;
		opacity: 0.7;
	}
	@media (min-width: 900px) {
		.charts-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
		.span-2 {
			grid-column: span 2;
		}
	}
</style>
