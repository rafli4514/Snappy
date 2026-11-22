<script lang="ts">
	import { onMount } from 'svelte';
	import { listFrames } from '#lib/utils/frameStorage';
	import { getProductForCount } from '#lib/utils/canvas';
	import { allFormats, type StandardFormat } from '#lib/data/standardFormats';
	import { customFrameSizes, loadCustomFrameSizes } from '#lib/services/frameSizes';
	import {
		customStickersStore,
		customFiltersStore,
		customArStore,
		loadCustomAssets
	} from '#lib/services/customAssets';
	import Sparkline from '#lib/features/dashboard/Sparkline.svelte';
	import MultiSeriesChart, {
		type SeriesDef
	} from '#lib/features/dashboard/MultiSeriesChart.svelte';
	import {
		RefreshCw,
		ChevronRight,
		ExternalLink,
		X,
		Printer,
		Cloud,
		Frame,
		Ruler,
		Sticker,
		SlidersHorizontal,
		Sparkles,
		TrendingUp,
		TrendingDown,
		Minus
	} from '@lucide/svelte';

	type SessionSummary = {
		id: string;
		createdAt?: string;
		photoCount?: number;
		templateKey?: string;
		formatId?: string;
	};
	type QueueItem = {
		id: string;
		type: 'print' | 'cloud-sync' | 'upload';
		status: string;
		createdAt: string;
	};
	type QueueStat = { total: number; pending: number; failed: number; done: number };

	type MainTab = 'ringkasan' | 'tren' | 'eksplorasi' | 'operasional';
	type RangePreset = '7d' | '14d' | '30d' | 'all';
	type ExploreMetric = 'photos' | 'sessions';
	type ExploreGroup = 'frameSize' | 'photoCount' | 'template';
	type ExploreRollup = 'daily' | 'weekly' | 'hourly';
	type ExploreSort = 'sum' | 'avg' | 'max';

	const LIMIT = 200;
	const PALETTE = [
		'#84cc16',
		'#c084fc',
		'#f472b6',
		'#38bdf8',
		'#fb923c',
		'#34d399',
		'#facc15',
		'#818cf8'
	];

	const MONTHS = [
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

	const PRESET_LABELS: Record<string, string> = {
		classic: 'Classic',
		cobalt: 'Cobalt',
		darkroom: 'Dark Room',
		lavender: 'Lavender',
		custom: 'Frame Kustom'
	};

	const MAIN_TABS: { id: MainTab; label: string }[] = [
		{ id: 'ringkasan', label: 'Ringkasan' },
		{ id: 'tren', label: 'Tren' },
		{ id: 'eksplorasi', label: 'Eksplorasi' },
		{ id: 'operasional', label: 'Operasional' }
	];

	const RANGE_OPTIONS: { id: RangePreset; short: string; label: string; days: number }[] = [
		{ id: '7d', short: '7 Hari', label: '7 Hari Terakhir', days: 7 },
		{ id: '14d', short: '14 Hari', label: '14 Hari Terakhir', days: 14 },
		{ id: '30d', short: '30 Hari', label: '30 Hari Terakhir', days: 30 },
		{ id: 'all', short: 'Semua', label: 'Seluruh Data', days: 30 }
	];

	// ── State utama ──
	let activeTab = $state<MainTab>('ringkasan');
	let rangePreset = $state<RangePreset>('30d');
	let showCallout = $state(true);

	let sessions = $state<SessionSummary[]>([]);
	let queueItems = $state<QueueItem[]>([]);
	let queueSummary = $state<Record<string, QueueStat>>({});
	let frameCount = $state(0);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let now = $state(new Date());

	// ── State tab Tren & Eksplorasi ──
	let trendMetricSize = $state<ExploreMetric>('sessions');
	let trendMetricPhoto = $state<ExploreMetric>('photos');
	let trendMetricTemplate = $state<ExploreMetric>('sessions');

	let exMetric = $state<ExploreMetric>('photos');
	let exGroup = $state<ExploreGroup>('frameSize');
	let exRollup = $state<ExploreRollup>('daily');
	let exTop = $state<number>(10);
	let exSort = $state<ExploreSort>('sum');

	const customSizesCount = $derived($customFrameSizes.length);
	const customStickersCount = $derived($customStickersStore.length);
	const customFiltersCount = $derived($customFiltersStore.length);
	const customArCount = $derived($customArStore.length);

	const currentRange = $derived(
		RANGE_OPTIONS.find((r) => r.id === rangePreset) ?? RANGE_OPTIONS[2]
	);

	// ── Utilitas tanggal ──
	function startOfDay(d: Date): Date {
		const x = new Date(d);
		x.setHours(0, 0, 0, 0);
		return x;
	}
	function startOfWeek(d: Date): Date {
		const x = startOfDay(d);
		x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
		return x;
	}
	function dayKey(d: Date): string {
		const y = d.getFullYear();
		const m = String(d.getMonth() + 1).padStart(2, '0');
		const day = String(d.getDate()).padStart(2, '0');
		return `${y}-${m}-${day}`;
	}
	function parseDate(iso?: string): Date | null {
		if (!iso) return null;
		const d = new Date(iso);
		return Number.isFinite(d.getTime()) ? d : null;
	}

	// ── Pemetaan Ukuran Frame, Paket Foto & Template ──
	const formatsById = $derived.by(() => {
		void $customFrameSizes;
		return new Map<string, StandardFormat>(allFormats().map((f) => [f.id, f]));
	});

	function resolveFrameSizeInfo(s: SessionSummary): { label: string; spec: string } {
		const fid = (s.formatId || '').trim();
		if (fid && formatsById.has(fid)) {
			const fmt = formatsById.get(fid)!;
			return {
				label: fmt.label,
				spec: `${fmt.cm} · ${fmt.pxW} × ${fmt.pxH} px`
			};
		}
		const n = Math.max(1, Math.min(6, Math.round(Number(s.photoCount) || 4)));
		const prod = getProductForCount(n);
		return {
			label: `${prod.nama} (${prod.cm} cm)`,
			spec: `${prod.pxW} × ${prod.pxH} px · ${prod.sheetOrient === 'landscape' ? 'Landscape' : 'Portrait'}`
		};
	}

	function frameSizeLabel(s: SessionSummary): string {
		return resolveFrameSizeInfo(s).label;
	}

	function photoBucketLabel(s: SessionSummary): string {
		const n = Math.round(Number(s.photoCount));
		return Number.isFinite(n) && n >= 1 && n <= 6 ? `${n} Foto` : 'Lainnya';
	}

	function templateLabel(s: SessionSummary): string {
		const raw = (s.templateKey || '').trim();
		if (!raw) return 'Classic';
		const lower = raw.toLowerCase();
		if (PRESET_LABELS[lower]) return PRESET_LABELS[lower];
		return raw.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
	}

	function shortId(id: string): string {
		const clean = id.replace(/^session[-_]?/i, '');
		return `#${clean.slice(-6).toUpperCase()}`;
	}

	const rtf = new Intl.RelativeTimeFormat('id-ID', { numeric: 'auto' });
	function timeAgo(iso?: string): string {
		const d = parseDate(iso);
		if (!d) return '—';
		const sec = Math.round((d.getTime() - now.getTime()) / 1000);
		const abs = Math.abs(sec);
		if (abs < 60) return 'baru saja';
		if (abs < 3600) return rtf.format(Math.round(sec / 60), 'minute');
		if (abs < 86400) return rtf.format(Math.round(sec / 3600), 'hour');
		if (abs < 86400 * 7) return rtf.format(Math.round(sec / 86400), 'day');
		return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
	}

	// ── Filter rentang waktu & pembanding periode sebelumnya ──
	const datedSessions = $derived(
		sessions
			.map((s) => ({ s, d: parseDate(s.createdAt) }))
			.filter((x): x is { s: SessionSummary; d: Date } => x.d !== null)
	);

	const periodBounds = $derived.by(() => {
		const end = new Date(startOfDay(now));
		end.setDate(end.getDate() + 1);
		if (rangePreset === 'all') {
			return {
				start: null as Date | null,
				end,
				prevStart: null as Date | null,
				prevEnd: null as Date | null
			};
		}
		const days = currentRange.days;
		const start = new Date(end);
		start.setDate(start.getDate() - days);
		const prevEnd = new Date(start);
		const prevStart = new Date(prevEnd);
		prevStart.setDate(prevStart.getDate() - days);
		return { start, end, prevStart, prevEnd };
	});

	const currentSessions = $derived.by(() => {
		const { start, end } = periodBounds;
		if (!start) return datedSessions;
		return datedSessions.filter(({ d }) => d >= start && d < end);
	});

	const priorSessions = $derived.by(() => {
		const { prevStart, prevEnd } = periodBounds;
		if (!prevStart || !prevEnd) return [];
		return datedSessions.filter(({ d }) => d >= prevStart && d < prevEnd);
	});

	// ── Bucket waktu ──
	const dailyBuckets = $derived.by(() => {
		const days = rangePreset === 'all' ? 30 : currentRange.days;
		const today = startOfDay(now);
		const out: { key: string; label: string; sub: string }[] = [];
		for (let i = days - 1; i >= 0; i--) {
			const d = new Date(today);
			d.setDate(d.getDate() - i);
			const short = `${MONTHS[d.getMonth()]} ${d.getDate()}`;
			out.push({
				key: dayKey(d),
				label: short,
				sub: `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
			});
		}
		return out;
	});

	const weeklyBuckets = $derived.by(() => {
		const thisWeek = startOfWeek(now);
		const count = rangePreset === '7d' ? 4 : 8;
		const out: { key: string; label: string; sub: string }[] = [];
		for (let i = count - 1; i >= 0; i--) {
			const start = new Date(thisWeek);
			start.setDate(start.getDate() - i * 7);
			const end = new Date(start);
			end.setDate(end.getDate() + 6);
			const sLab = `${MONTHS[start.getMonth()]} ${start.getDate()}`;
			const eLab = `${MONTHS[end.getMonth()]} ${end.getDate()}`;
			out.push({ key: dayKey(start), label: sLab, sub: `${sLab} – ${eLab}` });
		}
		return out;
	});

	const hourlyBuckets = $derived(
		Array.from({ length: 24 }, (_, h) => {
			const hh = String(h).padStart(2, '0');
			return { key: hh, label: hh, sub: `Pukul ${hh}.00 – ${hh}.59` };
		})
	);

	// ── KPI Utama + Sparklines ──
	function compareText(cur: number, prev: number): { text: string; tone: 'up' | 'down' | 'none' } {
		if (rangePreset === 'all' || prev === 0) {
			return { text: '— Belum ada data sebelumnya', tone: 'none' };
		}
		const pct = Math.round(((cur - prev) / prev) * 100);
		if (pct === 0) return { text: '0% vs periode sebelumnya', tone: 'none' };
		return {
			text: `${pct > 0 ? '+' : ''}${pct}% vs periode sebelumnya`,
			tone: pct > 0 ? 'up' : 'down'
		};
	}

	const curTotalSessions = $derived(currentSessions.length);
	const prevTotalSessions = $derived(priorSessions.length);

	const curTotalPhotos = $derived(
		currentSessions.reduce((sum, { s }) => sum + (Number(s.photoCount) || 0), 0)
	);
	const prevTotalPhotos = $derived(
		priorSessions.reduce((sum, { s }) => sum + (Number(s.photoCount) || 0), 0)
	);

	const curAvgPhotos = $derived(curTotalSessions ? curTotalPhotos / curTotalSessions : 0);
	const prevAvgPhotos = $derived(prevTotalSessions ? prevTotalPhotos / prevTotalSessions : 0);

	const topFrameSizeList = $derived.by(() => {
		const map = new Map<string, { spec: string; sessions: number; photos: number }>();
		for (const { s } of currentSessions) {
			const info = resolveFrameSizeInfo(s);
			const prev = map.get(info.label) ?? { spec: info.spec, sessions: 0, photos: 0 };
			prev.sessions += 1;
			prev.photos += Number(s.photoCount) || 0;
			map.set(info.label, prev);
		}
		return [...map.entries()]
			.sort((a, b) => b[1].sessions - a[1].sessions || b[1].photos - a[1].photos)
			.slice(0, 6)
			.map(([label, st]) => ({
				label,
				spec: st.spec,
				sessions: st.sessions,
				photos: st.photos,
				pct: curTotalSessions ? Math.round((st.sessions / curTotalSessions) * 100) : 0
			}));
	});

	const topFrameSize = $derived(topFrameSizeList[0] ?? null);

	const printStat = $derived(queueSummary.print ?? { total: 0, pending: 0, failed: 0, done: 0 });
	const cloudStat = $derived(
		queueSummary['cloud-sync'] ?? { total: 0, pending: 0, failed: 0, done: 0 }
	);

	const dSess = $derived(compareText(curTotalSessions, prevTotalSessions));
	const dPhoto = $derived(compareText(curTotalPhotos, prevTotalPhotos));
	const dAvg = $derived(compareText(curAvgPhotos, prevAvgPhotos));
	const pBadge = $derived(queuePill(printStat));
	const cBadge = $derived(queuePill(cloudStat));

	const sparkSessions = $derived.by(() => {
		const map = new Map(dailyBuckets.map((b) => [b.key, 0]));
		for (const { d } of currentSessions) {
			const k = dayKey(startOfDay(d));
			if (map.has(k)) map.set(k, (map.get(k) ?? 0) + 1);
		}
		return dailyBuckets.map((b) => map.get(b.key) ?? 0);
	});

	const sparkPhotos = $derived.by(() => {
		const map = new Map(dailyBuckets.map((b) => [b.key, 0]));
		for (const { s, d } of currentSessions) {
			const k = dayKey(startOfDay(d));
			if (map.has(k)) map.set(k, (map.get(k) ?? 0) + (Number(s.photoCount) || 0));
		}
		return dailyBuckets.map((b) => map.get(b.key) ?? 0);
	});

	const sparkAvgPhotos = $derived.by(() => {
		const cnt = new Map(dailyBuckets.map((b) => [b.key, 0]));
		const sum = new Map(dailyBuckets.map((b) => [b.key, 0]));
		for (const { s, d } of currentSessions) {
			const k = dayKey(startOfDay(d));
			if (!cnt.has(k)) continue;
			cnt.set(k, (cnt.get(k) ?? 0) + 1);
			sum.set(k, (sum.get(k) ?? 0) + (Number(s.photoCount) || 0));
		}
		return dailyBuckets.map((b) => {
			const c = cnt.get(b.key) ?? 0;
			return c ? Number(((sum.get(b.key) ?? 0) / c).toFixed(2)) : 0;
		});
	});

	const sparkTopSize = $derived.by(() => {
		const topLabel = topFrameSize?.label;
		const map = new Map(dailyBuckets.map((b) => [b.key, 0]));
		if (!topLabel) return dailyBuckets.map(() => 0);
		for (const { s, d } of currentSessions) {
			if (frameSizeLabel(s) !== topLabel) continue;
			const k = dayKey(startOfDay(d));
			if (map.has(k)) map.set(k, (map.get(k) ?? 0) + 1);
		}
		return dailyBuckets.map((b) => map.get(b.key) ?? 0);
	});

	function queueSpark(type: 'print' | 'cloud-sync'): number[] {
		const map = new Map(dailyBuckets.map((b) => [b.key, 0]));
		for (const q of queueItems) {
			if (q.type !== type || q.status !== 'done') continue;
			const d = parseDate(q.createdAt);
			if (!d) continue;
			const k = dayKey(startOfDay(d));
			if (map.has(k)) map.set(k, (map.get(k) ?? 0) + 1);
		}
		return dailyBuckets.map((b) => map.get(b.key) ?? 0);
	}

	const sparkPrint = $derived(queueSpark('print'));
	const sparkCloud = $derived(queueSpark('cloud-sync'));

	// ── Builder Multi-Series generik ──
	function dimensionOf(s: SessionSummary, group: ExploreGroup): string {
		if (group === 'photoCount') return photoBucketLabel(s);
		if (group === 'template') return templateLabel(s);
		return frameSizeLabel(s);
	}

	function metricValue(s: SessionSummary, metric: ExploreMetric): number {
		if (metric === 'photos') return Number(s.photoCount) || 0;
		return 1;
	}

	function bucketKeyFor(d: Date, rollup: ExploreRollup): string {
		if (rollup === 'hourly') return String(d.getHours()).padStart(2, '0');
		if (rollup === 'weekly') return dayKey(startOfWeek(d));
		return dayKey(startOfDay(d));
	}

	function buildGroupedSeries(opts: {
		group: ExploreGroup;
		metric: ExploreMetric;
		rollup: ExploreRollup;
		topN: number;
		sortBy?: ExploreSort;
	}): {
		buckets: { key: string; label: string; sub: string }[];
		series: SeriesDef[];
		table: {
			key: string;
			label: string;
			color: string;
			min: number;
			max: number;
			avg: number;
			sum: number;
			pct: number;
		}[];
		grandTotal: number;
	} {
		const buckets =
			opts.rollup === 'hourly'
				? hourlyBuckets
				: opts.rollup === 'weekly'
					? weeklyBuckets
					: dailyBuckets;
		const keyToIdx = new Map(buckets.map((b, i) => [b.key, i]));

		const byGroup = new Map<string, number[]>();
		for (const { s, d } of currentSessions) {
			const idx = keyToIdx.get(bucketKeyFor(d, opts.rollup));
			if (idx === undefined) continue;
			const g = dimensionOf(s, opts.group);
			let arr = byGroup.get(g);
			if (!arr) {
				arr = new Array(buckets.length).fill(0);
				byGroup.set(g, arr);
			}
			arr[idx] += metricValue(s, opts.metric);
		}

		const rowsRaw = [...byGroup.entries()].map(([label, values]) => {
			const sum = values.reduce((a, b) => a + b, 0);
			const min = values.length ? Math.min(...values) : 0;
			const max = values.length ? Math.max(...values) : 0;
			const avg = values.length ? sum / values.length : 0;
			return { key: label, label, values, min, max, avg, sum };
		});

		const grandTotal = rowsRaw.reduce((a, r) => a + r.sum, 0);
		const sortBy = opts.sortBy ?? 'sum';
		rowsRaw.sort((a, b) => b[sortBy] - a[sortBy] || b.sum - a.sum);

		const sliced = opts.topN > 0 ? rowsRaw.slice(0, opts.topN) : rowsRaw;
		const series: SeriesDef[] = sliced.map((r, i) => ({
			key: r.key,
			label: r.label,
			color: PALETTE[i % PALETTE.length],
			values: r.values
		}));

		const table = sliced.map((r, i) => ({
			key: r.key,
			label: r.label,
			color: PALETTE[i % PALETTE.length],
			min: r.min,
			max: r.max,
			avg: r.avg,
			sum: r.sum,
			pct: grandTotal ? (r.sum / grandTotal) * 100 : 0
		}));

		return { buckets, series, table, grandTotal };
	}

	// ── Data Ringkasan ──
	const recentList = $derived(currentSessions.slice(0, 5).map((x) => x.s));

	const ovPhotosByPack = $derived(
		buildGroupedSeries({ group: 'photoCount', metric: 'photos', rollup: 'daily', topN: 6 })
	);
	const ovSessionsBySize = $derived(
		buildGroupedSeries({ group: 'frameSize', metric: 'sessions', rollup: 'daily', topN: 6 })
	);
	const ovSessionsByPack = $derived(
		buildGroupedSeries({ group: 'photoCount', metric: 'sessions', rollup: 'daily', topN: 6 })
	);
	const ovPhotosByHour = $derived(
		buildGroupedSeries({ group: 'frameSize', metric: 'photos', rollup: 'hourly', topN: 6 })
	);

	// ── Data Tab Tren ──
	const trendSizeData = $derived(
		buildGroupedSeries({
			group: 'frameSize',
			metric: trendMetricSize,
			rollup: 'daily',
			topN: 6
		})
	);
	const trendPhotoData = $derived(
		buildGroupedSeries({
			group: 'photoCount',
			metric: trendMetricPhoto,
			rollup: 'daily',
			topN: 6
		})
	);
	const trendTemplateData = $derived(
		buildGroupedSeries({
			group: 'template',
			metric: trendMetricTemplate,
			rollup: 'daily',
			topN: 5
		})
	);

	function computeTrendsDelta(group: ExploreGroup, metric: ExploreMetric) {
		if (!priorSessions.length) return [];
		const curMap = new Map<string, number>();
		const prevMap = new Map<string, number>();
		for (const { s } of currentSessions) {
			const g = dimensionOf(s, group);
			curMap.set(g, (curMap.get(g) ?? 0) + metricValue(s, metric));
		}
		for (const { s } of priorSessions) {
			const g = dimensionOf(s, group);
			prevMap.set(g, (prevMap.get(g) ?? 0) + metricValue(s, metric));
		}
		const keys = new Set([...curMap.keys(), ...prevMap.keys()]);
		return [...keys]
			.map((label) => {
				const cur = curMap.get(label) ?? 0;
				const prev = prevMap.get(label) ?? 0;
				const diff = cur - prev;
				const pct = prev > 0 ? Math.round((diff / prev) * 100) : cur > 0 ? 100 : 0;
				return { label, cur, prev, diff, pct };
			})
			.filter((x) => x.diff !== 0)
			.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))
			.slice(0, 4);
	}

	const sizeMovers = $derived(computeTrendsDelta('frameSize', trendMetricSize));
	const photoMovers = $derived(computeTrendsDelta('photoCount', trendMetricPhoto));
	const templateMovers = $derived(computeTrendsDelta('template', trendMetricTemplate));

	// ── Data Tab Eksplorasi ──
	const exploreData = $derived(
		buildGroupedSeries({
			group: exGroup,
			metric: exMetric,
			rollup: exRollup,
			topN: exTop,
			sortBy: exSort
		})
	);

	const exploreUnit = $derived(exMetric === 'photos' ? 'foto' : 'sesi');

	const exploreDimLabel = $derived(
		exGroup === 'photoCount'
			? 'Paket Foto'
			: exGroup === 'template'
				? 'Template Strip'
				: 'Ukuran Frame'
	);

	function openExplore(
		group: ExploreGroup,
		metric: ExploreMetric = 'photos',
		rollup: ExploreRollup = 'daily'
	): void {
		exGroup = group;
		exMetric = metric;
		exRollup = rollup;
		activeTab = 'eksplorasi';
	}

	function queuePill(stat: QueueStat): { label: string; cls: string } {
		if (stat.failed > 0) return { label: `${stat.failed} gagal`, cls: 'd-pill d-pill-err' };
		if (stat.pending > 0) return { label: `${stat.pending} tertunda`, cls: 'd-pill d-pill-warn' };
		if (stat.total > 0) return { label: 'Normal', cls: 'd-pill d-pill-ok' };
		return { label: 'Kosong', cls: 'd-pill' };
	}

	async function loadAll(): Promise<void> {
		loading = true;
		error = null;
		const [framesRes, queueRes, galleryRes] = await Promise.all([
			listFrames().catch(() => []),
			fetch('/api/queue?limit=200')
				.then((r) => (r.ok ? r.json() : null))
				.catch(() => null),
			fetch(`/api/gallery?list=1&limit=${LIMIT}`)
				.then(async (r) => {
					if (!r.ok) throw new Error('API galeri tidak tersedia');
					return (await r.json()) as { sessions?: SessionSummary[] };
				})
				.catch(() => null),
			loadCustomFrameSizes(true).catch(() => undefined),
			loadCustomAssets(true).catch(() => undefined)
		]);

		frameCount = framesRes.length;
		if (queueRes) {
			const q = queueRes as {
				items?: QueueItem[];
				summary?: Record<string, QueueStat>;
			};
			queueItems = Array.isArray(q.items) ? q.items : [];
			queueSummary = q.summary ?? {};
		} else {
			queueItems = [];
			queueSummary = {};
		}

		if (galleryRes) {
			sessions = Array.isArray(galleryRes.sessions) ? galleryRes.sessions : [];
		} else {
			sessions = [];
			error = 'Data sesi tidak terbaca. Pastikan aplikasi berjalan pada runtime Node.';
		}

		now = new Date();
		loading = false;
	}

	onMount(() => {
		void loadAll();
		const t = setInterval(() => (now = new Date()), 60_000);
		return () => clearInterval(t);
	});
</script>

<div class="or-page">
	<!-- ═══ Header Aktivitas ═══ -->
	<header class="or-head">
		<div class="or-head-copy">
			<h1 class="or-title">Aktivitas</h1>
			<p class="or-sub">Ringkasan volume foto, ukuran frame terpopuler, dan operasional studio.</p>
		</div>

		<div class="or-controls">
			<div class="or-range-seg" role="group" aria-label="Pilih rentang waktu">
				{#each RANGE_OPTIONS as opt (opt.id)}
					<button
						type="button"
						class="or-range-btn"
						class:is-active={rangePreset === opt.id}
						aria-pressed={rangePreset === opt.id}
						title={opt.label}
						onclick={() => (rangePreset = opt.id)}
					>
						{opt.short}
					</button>
				{/each}
			</div>

			<button
				type="button"
				class="or-refresh-btn"
				onclick={loadAll}
				disabled={loading}
				aria-label="Muat ulang data aktivitas"
				title="Muat ulang data"
			>
				<span class="or-spin" class:is-spinning={loading}><RefreshCw size={14} /></span>
				<span>Muat Ulang</span>
			</button>
		</div>
	</header>

	<!-- ═══ Banner Info Opsional (bisa ditutup) ═══ -->
	{#if showCallout && activeTab === 'ringkasan'}
		<div class="or-callout" role="region" aria-label="Informasi integrasi studio">
			<div class="or-callout-left">
				<div class="or-callout-icons" aria-hidden="true">
					<span class="or-ci"><Frame size={13} /></span>
					<span class="or-ci"><Printer size={13} /></span>
					<span class="or-ci"><Cloud size={13} /></span>
				</div>
				<div class="or-callout-copy">
					<p class="or-callout-title">
						Kelola frame Canva, atur ukuran cetak, dan pantau antrean studio
					</p>
					<p class="or-callout-desc">
						Gunakan tab di bawah untuk meninjau tren ukuran frame, eksplorasi jumlah foto, hingga
						status cetak dan cloud.
					</p>
				</div>
			</div>
			<div class="or-callout-right">
				<a class="d-btn d-btn-sm" href="/dashboard/assets/frames">Buka Frame Studio</a>
				<button
					type="button"
					class="or-dismiss"
					onclick={() => (showCallout = false)}
					aria-label="Tutup banner"
				>
					<X size={15} />
				</button>
			</div>
		</div>
	{/if}

	<!-- ═══ Tab Section Garis Bawah ═══ -->
	<div class="or-tabs" role="tablist" aria-label="Bagian halaman aktivitas">
		{#each MAIN_TABS as tab (tab.id)}
			<button
				type="button"
				role="tab"
				class="or-tab"
				class:is-active={activeTab === tab.id}
				aria-selected={activeTab === tab.id}
				onclick={() => (activeTab = tab.id)}
			>
				{tab.label}
			</button>
		{/each}
	</div>

	{#if error}
		<div class="d-banner d-banner-warn" role="alert"><span>{error}</span></div>
	{/if}

	<!-- ══════════════════════════════════════════════════
	     TAB 1: RINGKASAN (KPI → Daftar Terpisah → Grafik Terpisah)
	     ══════════════════════════════════════════════════ -->
	{#if activeTab === 'ringkasan'}
		<!-- 1A. 6 Kartu KPI Seimbang (3×2 desktop) + Sparkline -->
		<section class="or-kpi-grid" aria-label="Metrik utama">
			<div class="or-kpi-card">
				<div class="or-kpi-left">
					<span class="or-kpi-label">Total Foto</span>
					<strong class="or-kpi-val d-num">{loading ? '—' : curTotalPhotos}</strong>
					<span class="or-kpi-delta is-{dPhoto.tone}">{dPhoto.text}</span>
				</div>
				<div class="or-kpi-spark">
					<Sparkline values={sparkPhotos} id="sp-photo" color="#84cc16" />
				</div>
			</div>

			<div class="or-kpi-card">
				<div class="or-kpi-left">
					<span class="or-kpi-label">Total Sesi</span>
					<strong class="or-kpi-val d-num">{loading ? '—' : curTotalSessions}</strong>
					<span class="or-kpi-delta is-{dSess.tone}">{dSess.text}</span>
				</div>
				<div class="or-kpi-spark">
					<Sparkline values={sparkSessions} id="sp-sess" color="#38bdf8" />
				</div>
			</div>

			<div class="or-kpi-card">
				<div class="or-kpi-left">
					<span class="or-kpi-label">Rata-rata Foto / Sesi</span>
					<strong class="or-kpi-val d-num">
						{loading ? '—' : curAvgPhotos.toLocaleString('id-ID', { maximumFractionDigits: 1 })}
					</strong>
					<span class="or-kpi-delta is-{dAvg.tone}">{dAvg.text}</span>
				</div>
				<div class="or-kpi-spark">
					<Sparkline values={sparkAvgPhotos} id="sp-avg" color="#c084fc" />
				</div>
			</div>

			<div class="or-kpi-card">
				<div class="or-kpi-left">
					<span class="or-kpi-label">Ukuran Frame Terlaris</span>
					<strong class="or-kpi-val or-kpi-val-sm" title={topFrameSize?.label ?? '—'}>
						{loading ? '—' : (topFrameSize?.label ?? 'Belum ada')}
					</strong>
					<span class="or-kpi-delta is-none d-num">
						{#if topFrameSize}
							{topFrameSize.sessions} sesi ({topFrameSize.pct}%) · {topFrameSize.photos} foto
						{:else}
							— Belum ada data
						{/if}
					</span>
				</div>
				<div class="or-kpi-spark">
					<Sparkline values={sparkTopSize} id="sp-topsize" color="#f472b6" />
				</div>
			</div>

			<div class="or-kpi-card">
				<div class="or-kpi-left">
					<span class="or-kpi-label">Cetak Selesai</span>
					<strong class="or-kpi-val d-num">{loading ? '—' : printStat.done}</strong>
					<span class="or-kpi-delta is-none d-num">
						{printStat.pending} tertunda · {printStat.failed} gagal
					</span>
				</div>
				<div class="or-kpi-spark">
					<Sparkline values={sparkPrint} id="sp-print" color="#fb923c" />
				</div>
			</div>

			<div class="or-kpi-card">
				<div class="or-kpi-left">
					<span class="or-kpi-label">Sinkronisasi Cloud</span>
					<strong class="or-kpi-val d-num">{loading ? '—' : cloudStat.done}</strong>
					<span class="or-kpi-delta is-none d-num">
						{cloudStat.pending} tertunda · {cloudStat.failed} gagal
					</span>
				</div>
				<div class="or-kpi-spark">
					<Sparkline values={sparkCloud} id="sp-cloud" color="#34d399" />
				</div>
			</div>
		</section>

		<!-- 1B. Seksi Daftar (Terpisah bersih dari Grafik) -->
		<section class="or-two-col" aria-label="Daftar ukuran frame terpopuler dan sesi terbaru">
			<article class="d-card">
				<div class="or-card-head">
					<h2 class="or-card-title">Ukuran Frame Terpopuler</h2>
					<button
						type="button"
						class="or-explore-btn"
						onclick={() => openExplore('frameSize', 'sessions', 'daily')}
					>
						Eksplorasi <ChevronRight size={13} />
					</button>
				</div>
				{#if loading}
					<div class="or-pad"><div class="or-skel or-skel-list"></div></div>
				{:else if topFrameSizeList.length === 0}
					<p class="or-empty-inline">Belum ada sesi pada rentang waktu ini.</p>
				{:else}
					<ol class="or-rank-list">
						{#each topFrameSizeList as item, idx (item.label)}
							<li class="or-rank-row">
								<span class="or-rank-num d-num">{idx + 1}</span>
								<div class="or-rank-info">
									<span class="or-rank-name">{item.label}</span>
									<span class="or-rank-sub d-num">{item.spec} · {item.pct}% dari sesi</span>
								</div>
								<div class="or-rank-stat d-num">
									<strong>{item.sessions} sesi</strong>
									<span>{item.photos} foto</span>
								</div>
							</li>
						{/each}
					</ol>
				{/if}
			</article>

			<article class="d-card">
				<div class="or-card-head">
					<h2 class="or-card-title">Sesi Terbaru</h2>
					<a class="or-explore-btn" href="/dashboard/sessions">
						Lihat semua <ChevronRight size={13} />
					</a>
				</div>
				{#if loading}
					<div class="or-pad"><div class="or-skel or-skel-list"></div></div>
				{:else if recentList.length === 0}
					<p class="or-empty-inline">Belum ada riwayat pemotretan.</p>
				{:else}
					<ol class="or-rank-list">
						{#each recentList as s, idx (s.id)}
							<li class="or-rank-row">
								<span class="or-rank-num d-num">{idx + 1}</span>
								<a
									class="or-rank-info or-row-link"
									href="/dashboard/sessions?id={encodeURIComponent(s.id)}"
								>
									<span class="or-rank-name">
										{frameSizeLabel(s)}
										<span class="or-id-tag d-num">{shortId(s.id)}</span>
									</span>
									<span class="or-rank-sub">
										{timeAgo(s.createdAt)} · {templateLabel(s)}
									</span>
								</a>
								<div class="or-row-end">
									<span class="d-pill d-num">{s.photoCount ?? 0} foto</span>
									<a
										class="or-ext"
										href="/gallery/{encodeURIComponent(s.id)}"
										target="_blank"
										rel="noopener noreferrer"
										title="Buka Galeri QR"
										aria-label="Buka Galeri QR {s.id}"
									>
										<ExternalLink size={13} />
									</a>
								</div>
							</li>
						{/each}
					</ol>
				{/if}
			</article>
		</section>

		<!-- 1C. Seksi Grafik (Terpisah bersih di bawah Daftar) -->
		<section class="or-two-col" aria-label="Grafik jumlah foto dan ukuran frame">
			<article class="d-card">
				<div class="or-card-head">
					<h2 class="or-card-title">Volume Foto Harian</h2>
					<button
						type="button"
						class="or-explore-btn"
						onclick={() => openExplore('photoCount', 'photos', 'daily')}
					>
						Eksplorasi <ChevronRight size={13} />
					</button>
				</div>
				<div class="or-pad">
					<MultiSeriesChart
						buckets={ovPhotosByPack.buckets}
						series={ovPhotosByPack.series}
						titleId="ov-ch-photos"
						label="Volume foto harian berdasarkan paket jumlah foto"
						mode="bar"
						height={215}
						unit="foto"
					/>
				</div>
			</article>

			<article class="d-card">
				<div class="or-card-head">
					<h2 class="or-card-title">Ukuran Frame yang Digunakan</h2>
					<button
						type="button"
						class="or-explore-btn"
						onclick={() => openExplore('frameSize', 'sessions', 'daily')}
					>
						Eksplorasi <ChevronRight size={13} />
					</button>
				</div>
				<div class="or-pad">
					<MultiSeriesChart
						buckets={ovSessionsBySize.buckets}
						series={ovSessionsBySize.series}
						titleId="ov-ch-size"
						label="Sesi berdasarkan ukuran frame"
						mode="bar"
						height={215}
						unit="sesi"
					/>
				</div>
			</article>

			<article class="d-card">
				<div class="or-card-head">
					<h2 class="or-card-title">Sesi berdasarkan Paket Jumlah Foto</h2>
					<button
						type="button"
						class="or-explore-btn"
						onclick={() => openExplore('photoCount', 'sessions', 'daily')}
					>
						Eksplorasi <ChevronRight size={13} />
					</button>
				</div>
				<div class="or-pad">
					<MultiSeriesChart
						buckets={ovSessionsByPack.buckets}
						series={ovSessionsByPack.series}
						titleId="ov-ch-pack"
						label="Sesi berdasarkan paket 1 sampai 6 foto"
						mode="bar"
						height={215}
						unit="sesi"
					/>
				</div>
			</article>

			<article class="d-card">
				<div class="or-card-head">
					<h2 class="or-card-title">Volume Foto per Jam</h2>
					<button
						type="button"
						class="or-explore-btn"
						onclick={() => openExplore('frameSize', 'photos', 'hourly')}
					>
						Eksplorasi <ChevronRight size={13} />
					</button>
				</div>
				<div class="or-pad">
					<MultiSeriesChart
						buckets={ovPhotosByHour.buckets}
						series={ovPhotosByHour.series}
						titleId="ov-ch-hour"
						label="Distribusi volume foto per jam"
						mode="bar"
						height={215}
						unit="foto"
					/>
				</div>
			</article>
		</section>

		<!-- ══════════════════════════════════════════════════
		     TAB 2: TREN (Ukuran Frame · Paket Foto · Template)
		     ══════════════════════════════════════════════════ -->
	{:else if activeTab === 'tren'}
		<!-- Seksi Tren 1: Ukuran Frame -->
		<section class="or-trend-section">
			<div class="or-sec-bar">
				<h2 class="or-sec-title">Ukuran Frame</h2>
				<select
					class="or-mini-select"
					bind:value={trendMetricSize}
					aria-label="Metrik tren ukuran frame"
				>
					<option value="sessions">Jumlah Sesi</option>
					<option value="photos">Total Foto</option>
				</select>
			</div>

			<article class="d-card">
				<div class="or-card-head">
					<h3 class="or-card-title">
						{trendMetricSize === 'photos'
							? 'Total foto per ukuran frame dari waktu ke waktu'
							: 'Pemakaian ukuran frame dari waktu ke waktu'}
					</h3>
					<button
						type="button"
						class="or-explore-btn"
						onclick={() => openExplore('frameSize', trendMetricSize, 'daily')}
					>
						Eksplorasi <ChevronRight size={13} />
					</button>
				</div>
				<div class="or-pad">
					<MultiSeriesChart
						buckets={trendSizeData.buckets}
						series={trendSizeData.series}
						titleId="tr-ch-size"
						label="Tren ukuran frame dari waktu ke waktu"
						mode="line"
						height={240}
						allowToggleMode={true}
						unit={trendMetricSize === 'photos' ? 'foto' : 'sesi'}
					/>
				</div>
			</article>

			<article class="d-card">
				<div class="or-card-head">
					<h3 class="or-card-title">Perubahan Tren</h3>
					<button
						type="button"
						class="or-explore-btn"
						onclick={() => openExplore('frameSize', trendMetricSize, 'daily')}
					>
						Eksplorasi <ChevronRight size={13} />
					</button>
				</div>
				{#if sizeMovers.length === 0}
					<p class="or-empty-inline">
						Belum ada perubahan tren signifikan dibanding periode sebelumnya.
					</p>
				{:else}
					<div class="or-movers">
						{#each sizeMovers as m (m.label)}
							<div class="or-mover-row">
								<span class="or-mover-name">{m.label}</span>
								<span class="or-mover-nums d-num">
									{m.prev} → <strong>{m.cur}</strong>
								</span>
								<span
									class="or-mover-badge d-num"
									class:is-up={m.diff > 0}
									class:is-down={m.diff < 0}
								>
									{#if m.diff > 0}
										<TrendingUp size={12} />
									{:else if m.diff < 0}
										<TrendingDown size={12} />
									{:else}
										<Minus size={12} />
									{/if}
									{m.pct > 0 ? '+' : ''}{m.pct}%
								</span>
							</div>
						{/each}
					</div>
				{/if}
			</article>
		</section>

		<!-- Seksi Tren 2: Paket Jumlah Foto -->
		<section class="or-trend-section">
			<div class="or-sec-bar">
				<h2 class="or-sec-title">Paket Jumlah Foto (1–6 Foto)</h2>
				<select
					class="or-mini-select"
					bind:value={trendMetricPhoto}
					aria-label="Metrik tren paket foto"
				>
					<option value="photos">Total Foto</option>
					<option value="sessions">Jumlah Sesi</option>
				</select>
			</div>

			<article class="d-card">
				<div class="or-card-head">
					<h3 class="or-card-title">
						{trendMetricPhoto === 'photos'
							? 'Jumlah foto per paket dari waktu ke waktu'
							: 'Pilihan paket foto dari waktu ke waktu'}
					</h3>
					<button
						type="button"
						class="or-explore-btn"
						onclick={() => openExplore('photoCount', trendMetricPhoto, 'daily')}
					>
						Eksplorasi <ChevronRight size={13} />
					</button>
				</div>
				<div class="or-pad">
					<MultiSeriesChart
						buckets={trendPhotoData.buckets}
						series={trendPhotoData.series}
						titleId="tr-ch-photo"
						label="Tren paket jumlah foto dari waktu ke waktu"
						mode="line"
						height={240}
						allowToggleMode={true}
						unit={trendMetricPhoto === 'photos' ? 'foto' : 'sesi'}
					/>
				</div>
			</article>

			<article class="d-card">
				<div class="or-card-head">
					<h3 class="or-card-title">Perubahan Tren</h3>
				</div>
				{#if photoMovers.length === 0}
					<p class="or-empty-inline">
						Belum ada perubahan tren signifikan dibanding periode sebelumnya.
					</p>
				{:else}
					<div class="or-movers">
						{#each photoMovers as m (m.label)}
							<div class="or-mover-row">
								<span class="or-mover-name">{m.label}</span>
								<span class="or-mover-nums d-num">
									{m.prev} → <strong>{m.cur}</strong>
								</span>
								<span
									class="or-mover-badge d-num"
									class:is-up={m.diff > 0}
									class:is-down={m.diff < 0}
								>
									{m.pct > 0 ? '+' : ''}{m.pct}%
								</span>
							</div>
						{/each}
					</div>
				{/if}
			</article>
		</section>

		<!-- Seksi Tren 3: Template Strip -->
		<section class="or-trend-section">
			<div class="or-sec-bar">
				<h2 class="or-sec-title">Template &amp; Gaya Strip</h2>
				<select
					class="or-mini-select"
					bind:value={trendMetricTemplate}
					aria-label="Metrik tren template"
				>
					<option value="sessions">Jumlah Sesi</option>
					<option value="photos">Total Foto</option>
				</select>
			</div>

			<article class="d-card">
				<div class="or-card-head">
					<h3 class="or-card-title">Penggunaan template dari waktu ke waktu</h3>
					<button
						type="button"
						class="or-explore-btn"
						onclick={() => openExplore('template', trendMetricTemplate, 'daily')}
					>
						Eksplorasi <ChevronRight size={13} />
					</button>
				</div>
				<div class="or-pad">
					<MultiSeriesChart
						buckets={trendTemplateData.buckets}
						series={trendTemplateData.series}
						titleId="tr-ch-template"
						label="Tren template strip dari waktu ke waktu"
						mode="line"
						height={240}
						allowToggleMode={true}
						unit={trendMetricTemplate === 'photos' ? 'foto' : 'sesi'}
					/>
				</div>
			</article>

			<article class="d-card">
				<div class="or-card-head">
					<h3 class="or-card-title">Perubahan Tren</h3>
				</div>
				{#if templateMovers.length === 0}
					<p class="or-empty-inline">
						Belum ada perubahan tren signifikan dibanding periode sebelumnya.
					</p>
				{:else}
					<div class="or-movers">
						{#each templateMovers as m (m.label)}
							<div class="or-mover-row">
								<span class="or-mover-name">{m.label}</span>
								<span class="or-mover-nums d-num">
									{m.prev} → <strong>{m.cur}</strong>
								</span>
								<span
									class="or-mover-badge d-num"
									class:is-up={m.diff > 0}
									class:is-down={m.diff < 0}
								>
									{m.pct > 0 ? '+' : ''}{m.pct}%
								</span>
							</div>
						{/each}
					</div>
				{/if}
			</article>
		</section>

		<!-- ══════════════════════════════════════════════════
		     TAB 3: EKSPLORASI (Query Bar + Grafik Penuh + Tabel Rincian)
		     ══════════════════════════════════════════════════ -->
	{:else if activeTab === 'eksplorasi'}
		<div class="or-query-bar" role="region" aria-label="Pengaturan eksplorasi data">
			<div class="or-qgroup">
				<select class="or-qselect" bind:value={exMetric} aria-label="Metrik">
					<option value="photos">Total Foto</option>
					<option value="sessions">Total Sesi</option>
				</select>
				<span class="or-qsep">berdasarkan</span>
				<select class="or-qselect" bind:value={exGroup} aria-label="Kelompokkan berdasarkan">
					<option value="frameSize">Ukuran Frame</option>
					<option value="photoCount">Paket Foto</option>
					<option value="template">Template Strip</option>
				</select>
			</div>

			<div class="or-qgroup">
				<span class="or-qsep">Rollup:</span>
				<select class="or-qselect" bind:value={exRollup} aria-label="Interval rollup">
					<option value="daily">Harian</option>
					<option value="weekly">Mingguan</option>
					<option value="hourly">Per Jam</option>
				</select>
			</div>

			<div class="or-qgroup">
				<span class="or-qsep">Top</span>
				<select class="or-qselect" bind:value={exTop} aria-label="Jumlah baris teratas">
					<option value={5}>5</option>
					<option value={10}>10</option>
					<option value={0}>Semua</option>
				</select>
				<span class="or-qsep">Urutkan:</span>
				<select class="or-qselect" bind:value={exSort} aria-label="Urutkan berdasarkan">
					<option value="sum">Total</option>
					<option value="avg">Rata-rata</option>
					<option value="max">Maksimum</option>
				</select>
			</div>
		</div>

		<!-- Grafik Penuh -->
		<article class="d-card">
			<div class="or-pad">
				<MultiSeriesChart
					buckets={exploreData.buckets}
					series={exploreData.series}
					titleId="ex-main-chart"
					label="Grafik eksplorasi data"
					mode="bar"
					height={275}
					allowToggleMode={true}
					unit={exploreUnit}
				/>
			</div>
		</article>

		<!-- Tabel Rincian Statistik Terpisah -->
		<article class="d-card">
			<div class="or-table-scroll">
				<table class="or-table">
					<thead>
						<tr>
							<th>{exploreDimLabel}</th>
							<th class="is-right">Min</th>
							<th class="is-right">Maks</th>
							<th class="is-right">Rata-rata</th>
							<th class="is-right">Total</th>
							<th class="is-right">Periode Ini</th>
							<th class="is-right">% dari Total</th>
						</tr>
					</thead>
					<tbody>
						{#if exploreData.table.length === 0}
							<tr>
								<td colspan="7" class="or-table-empty">
									Belum ada data pada rentang waktu yang dipilih.
								</td>
							</tr>
						{:else}
							{#each exploreData.table as row (row.key)}
								<tr>
									<td>
										<span class="or-tbl-dim">
											<span class="or-tbl-dot" style="background:{row.color}"></span>
											<span>{row.label}</span>
										</span>
									</td>
									<td class="is-right d-num">{row.min}</td>
									<td class="is-right d-num">{row.max}</td>
									<td class="is-right d-num">
										{row.avg.toLocaleString('id-ID', { maximumFractionDigits: 1 })}
									</td>
									<td class="is-right d-num"><strong>{row.sum}</strong></td>
									<td class="is-right d-num">{row.sum} {exploreUnit}</td>
									<td class="is-right d-num">{row.pct.toFixed(1)}%</td>
								</tr>
							{/each}
						{/if}
					</tbody>
				</table>
			</div>
			<div class="or-table-foot d-num">
				<span>{exploreData.table.length} baris</span>
				<span>·</span>
				<span>{currentRange.label}</span>
				<span>·</span>
				<span>Total {exploreData.grandTotal} {exploreUnit}</span>
			</div>
		</article>

		<!-- ══════════════════════════════════════════════════
		     TAB 4: OPERASIONAL (Antrean & Katalog Aset Terpisah)
		     ══════════════════════════════════════════════════ -->
	{:else}
		<section class="or-trend-section">
			<div class="or-sec-bar">
				<h2 class="or-sec-title">Antrean &amp; Sinkronisasi</h2>
			</div>

			<article class="d-card">
				<div class="or-table-scroll">
					<table class="or-table">
						<thead>
							<tr>
								<th>Layanan Antrean</th>
								<th class="is-right">Total</th>
								<th class="is-right">Selesai</th>
								<th class="is-right">Tertunda</th>
								<th class="is-right">Gagal</th>
								<th>Status</th>
								<th class="is-right">Aksi</th>
							</tr>
						</thead>
						<tbody>
							<tr>
								<td>
									<span class="or-tbl-dim">
										<Printer size={15} />
										<span>Antrean Cetak Frame</span>
									</span>
								</td>
								<td class="is-right d-num">{printStat.total}</td>
								<td class="is-right d-num">{printStat.done}</td>
								<td class="is-right d-num">{printStat.pending}</td>
								<td class="is-right d-num">{printStat.failed}</td>
								<td><span class={pBadge.cls}>{pBadge.label}</span></td>
								<td class="is-right">
									<a class="or-explore-btn" href="/dashboard/queue/print">
										Kelola <ChevronRight size={13} />
									</a>
								</td>
							</tr>

							<tr>
								<td>
									<span class="or-tbl-dim">
										<Cloud size={15} />
										<span>Sinkronisasi Cloud</span>
									</span>
								</td>
								<td class="is-right d-num">{cloudStat.total}</td>
								<td class="is-right d-num">{cloudStat.done}</td>
								<td class="is-right d-num">{cloudStat.pending}</td>
								<td class="is-right d-num">{cloudStat.failed}</td>
								<td><span class={cBadge.cls}>{cBadge.label}</span></td>
								<td class="is-right">
									<a class="or-explore-btn" href="/dashboard/queue/cloud-sync">
										Kelola <ChevronRight size={13} />
									</a>
								</td>
							</tr>
						</tbody>
					</table>
				</div>
			</article>
		</section>

		<section class="or-trend-section">
			<div class="or-sec-bar">
				<h2 class="or-sec-title">Katalog Aset Studio</h2>
			</div>

			<article class="d-card">
				<div class="or-table-scroll">
					<table class="or-table">
						<thead>
							<tr>
								<th>Jenis Aset</th>
								<th>Keterangan</th>
								<th class="is-right">Jumlah Kustom</th>
								<th class="is-right">Aksi</th>
							</tr>
						</thead>
						<tbody>
							<tr>
								<td>
									<span class="or-tbl-dim"><Frame size={15} /><span>Frame Studio</span></span>
								</td>
								<td class="or-tbl-muted">Template bingkai strip dari Canva (PNG/SVG)</td>
								<td class="is-right d-num"><strong>{frameCount}</strong> frame</td>
								<td class="is-right">
									<a class="or-explore-btn" href="/dashboard/assets/frames">
										Buka <ChevronRight size={13} />
									</a>
								</td>
							</tr>
							<tr>
								<td>
									<span class="or-tbl-dim"><Ruler size={15} /><span>Ukuran Frame</span></span>
								</td>
								<td class="or-tbl-muted">Format kertas cetak 300 DPI &amp; rasio digital</td>
								<td class="is-right d-num"><strong>{customSizesCount}</strong> kustom</td>
								<td class="is-right">
									<a class="or-explore-btn" href="/dashboard/assets/frame-sizes">
										Buka <ChevronRight size={13} />
									</a>
								</td>
							</tr>
							<tr>
								<td>
									<span class="or-tbl-dim"><Sticker size={15} /><span>Stiker Dekorasi</span></span>
								</td>
								<td class="or-tbl-muted">Stiker transparan tambahan di editor strip</td>
								<td class="is-right d-num"><strong>{customStickersCount}</strong> kustom</td>
								<td class="is-right">
									<a class="or-explore-btn" href="/dashboard/assets/stickers">
										Buka <ChevronRight size={13} />
									</a>
								</td>
							</tr>
							<tr>
								<td>
									<span class="or-tbl-dim"
										><SlidersHorizontal size={15} /><span>Filter Foto</span></span
									>
								</td>
								<td class="or-tbl-muted">Preset warna CSS kustom dengan pratinjau langsung</td>
								<td class="is-right d-num"><strong>{customFiltersCount}</strong> kustom</td>
								<td class="is-right">
									<a class="or-explore-btn" href="/dashboard/assets/filters">
										Buka <ChevronRight size={13} />
									</a>
								</td>
							</tr>
							<tr>
								<td>
									<span class="or-tbl-dim"><Sparkles size={15} /><span>Overlay AR</span></span>
								</td>
								<td class="or-tbl-muted">Aset overlay transparan siap integrasi kamera</td>
								<td class="is-right d-num"><strong>{customArCount}</strong> aset</td>
								<td class="is-right">
									<a class="or-explore-btn" href="/dashboard/assets/ar">
										Buka <ChevronRight size={13} />
									</a>
								</td>
							</tr>
						</tbody>
					</table>
				</div>
			</article>
		</section>
	{/if}
</div>

<style>
	.or-page {
		display: flex;
		flex-direction: column;
		gap: 20px;
	}

	/* ── Header Aktivitas ── */
	.or-head {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		justify-content: space-between;
		gap: 14px 20px;
	}

	.or-head-copy {
		min-width: 0;
		flex: 1 1 280px;
	}

	.or-title {
		margin: 0;
		font-size: clamp(1.45rem, 2.2vw, 1.8rem);
		font-weight: 800;
		letter-spacing: -0.025em;
		line-height: 1.15;
		color: var(--d-ink);
	}

	.or-sub {
		margin: 5px 0 0;
		font-size: 0.84rem;
		line-height: 1.45;
		color: var(--d-muted);
	}

	.or-controls {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
		flex-shrink: 0;
	}

	.or-range-seg {
		display: inline-flex;
		align-items: center;
		gap: 2px;
		height: 36px;
		padding: 3px;
		border: 1px solid var(--d-border);
		border-radius: 10px;
		background: var(--d-surface);
	}

	.or-range-btn {
		height: 100%;
		padding: 0 11px;
		border: none;
		border-radius: 7px;
		background: transparent;
		color: var(--d-muted);
		font-family: var(--font-body);
		font-size: 0.76rem;
		font-weight: 700;
		white-space: nowrap;
		cursor: pointer;
		transition:
			background-color 140ms ease,
			color 140ms ease;
	}

	.or-range-btn:hover:not(.is-active) {
		color: var(--d-ink);
		background: var(--d-surface-2);
	}

	.or-range-btn.is-active {
		background: var(--d-ink);
		color: var(--d-bg);
	}

	.or-range-btn:focus-visible,
	.or-refresh-btn:focus-visible {
		outline: 2px solid var(--d-ink);
		outline-offset: 2px;
	}

	.or-refresh-btn {
		display: inline-flex;
		align-items: center;
		gap: 7px;
		height: 36px;
		padding: 0 13px;
		border: 1px solid var(--d-border);
		border-radius: 10px;
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

	.or-refresh-btn:hover:not(:disabled) {
		background: var(--d-surface-2);
		border-color: var(--d-border-strong);
	}

	.or-refresh-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.or-spin {
		display: inline-grid;
	}

	.or-spin.is-spinning {
		animation: orSpin 900ms linear infinite;
	}

	@keyframes orSpin {
		to {
			transform: rotate(360deg);
		}
	}

	/* ── Callout Banner opsional ── */
	.or-callout {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 14px;
		padding: 14px 18px;
		border: 1px solid color-mix(in srgb, var(--d-info) 30%, var(--d-border));
		border-radius: 14px;
		background: color-mix(in srgb, var(--d-info) 7%, var(--d-surface));
	}

	.or-callout-left {
		display: flex;
		align-items: center;
		gap: 14px;
		min-width: 0;
		flex: 1;
	}

	.or-callout-icons {
		display: flex;
		align-items: center;
		flex-shrink: 0;
	}

	.or-ci {
		width: 28px;
		height: 28px;
		border-radius: 50%;
		border: 1px solid var(--d-border-strong);
		background: var(--d-surface-2);
		color: var(--d-ink);
		display: grid;
		place-items: center;
		margin-left: -6px;
	}

	.or-ci:first-child {
		margin-left: 0;
	}

	.or-callout-copy {
		min-width: 0;
	}

	.or-callout-title {
		margin: 0;
		font-size: 0.84rem;
		font-weight: 700;
		color: var(--d-ink);
	}

	.or-callout-desc {
		margin: 2px 0 0;
		font-size: 0.76rem;
		color: var(--d-muted);
	}

	.or-callout-right {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.or-dismiss {
		width: 30px;
		height: 30px;
		border: none;
		border-radius: 8px;
		background: transparent;
		color: var(--d-muted);
		display: grid;
		place-items: center;
		cursor: pointer;
	}

	.or-dismiss:hover {
		background: var(--d-surface-2);
		color: var(--d-ink);
	}

	/* ── Underline Tabs ── */
	.or-tabs {
		display: flex;
		align-items: center;
		gap: 24px;
		border-bottom: 1px solid var(--d-border);
		overflow-x: auto;
	}

	.or-tab {
		position: relative;
		padding: 10px 2px 12px;
		border: none;
		background: transparent;
		color: var(--d-muted);
		font-family: var(--font-body);
		font-size: 0.85rem;
		font-weight: 700;
		cursor: pointer;
		white-space: nowrap;
		transition: color 140ms ease;
	}

	.or-tab:hover {
		color: var(--d-ink);
	}

	.or-tab.is-active {
		color: var(--d-accent);
	}

	.or-tab.is-active::after {
		content: '';
		position: absolute;
		left: 0;
		right: 0;
		bottom: -1px;
		height: 2px;
		border-radius: 2px 2px 0 0;
		background: var(--d-accent);
	}

	/* ── KPI Grid 3×2 dengan Sparkline ── */
	.or-kpi-grid {
		display: grid;
		gap: 14px;
		grid-template-columns: repeat(3, minmax(0, 1fr));
	}

	.or-kpi-card {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 14px;
		padding: 18px 20px;
		border: 1px solid var(--d-border);
		border-radius: 14px;
		background: var(--d-surface);
		min-width: 0;
	}

	.or-kpi-left {
		display: flex;
		flex-direction: column;
		gap: 5px;
		min-width: 0;
		flex: 1;
	}

	.or-kpi-label {
		font-size: 0.76rem;
		font-weight: 600;
		color: var(--d-muted);
	}

	.or-kpi-val {
		font-size: 1.75rem;
		font-weight: 800;
		letter-spacing: -0.03em;
		line-height: 1.05;
		color: var(--d-ink);
	}

	.or-kpi-val-sm {
		font-size: 1.05rem;
		line-height: 1.25;
		letter-spacing: -0.015em;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.or-kpi-delta {
		font-size: 0.71rem;
		font-weight: 600;
		color: var(--d-muted);
	}

	.or-kpi-delta.is-up {
		color: var(--d-ok);
	}

	.or-kpi-delta.is-down {
		color: var(--d-err);
	}

	.or-kpi-spark {
		width: 96px;
		flex-shrink: 0;
	}

	/* ── Grid 2 Kolom (Daftar & Grafik terpisah) ── */
	.or-two-col {
		display: grid;
		gap: 14px;
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.or-card-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		padding: 15px 18px 12px;
		border-bottom: 1px solid var(--d-border);
	}

	.or-card-title {
		margin: 0;
		font-size: 0.88rem;
		font-weight: 700;
		color: var(--d-ink);
	}

	.or-explore-btn {
		display: inline-flex;
		align-items: center;
		gap: 3px;
		padding: 0;
		border: none;
		background: transparent;
		color: var(--d-muted);
		font-family: var(--font-body);
		font-size: 0.76rem;
		font-weight: 700;
		text-decoration: none;
		cursor: pointer;
		transition: color 140ms ease;
	}

	.or-explore-btn:hover {
		color: var(--d-ink);
	}

	.or-pad {
		padding: 16px 18px 18px;
	}

	.or-empty-inline {
		margin: 0;
		padding: 26px 18px;
		text-align: center;
		font-size: 0.8rem;
		color: var(--d-muted);
	}

	/* ── Daftar Peringkat & Riwayat ── */
	.or-rank-list {
		margin: 0;
		padding: 4px 0;
		list-style: none;
		display: flex;
		flex-direction: column;
	}

	.or-rank-row {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 11px 18px;
		border-bottom: 1px solid var(--d-border);
		transition: background-color 130ms ease;
	}

	.or-rank-row:last-child {
		border-bottom: none;
	}

	.or-rank-row:hover {
		background: var(--d-surface-hover);
	}

	.or-rank-num {
		width: 20px;
		font-size: 0.78rem;
		font-weight: 700;
		color: var(--d-muted);
		flex-shrink: 0;
	}

	.or-rank-info {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.or-row-link {
		color: inherit;
		text-decoration: none;
	}

	.or-rank-name {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 0.84rem;
		font-weight: 700;
		color: var(--d-ink);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.or-id-tag {
		font-size: 0.68rem;
		font-weight: 700;
		padding: 1px 6px;
		border-radius: 5px;
		background: var(--d-surface-2);
		color: var(--d-muted);
	}

	.or-rank-sub {
		font-size: 0.73rem;
		color: var(--d-muted);
	}

	.or-rank-stat {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 1px;
		flex-shrink: 0;
	}

	.or-rank-stat strong {
		font-size: 0.82rem;
		font-weight: 800;
		color: var(--d-ink);
	}

	.or-rank-stat span {
		font-size: 0.7rem;
		font-weight: 600;
		color: var(--d-muted);
	}

	.or-row-end {
		display: flex;
		align-items: center;
		gap: 6px;
		flex-shrink: 0;
	}

	.or-ext {
		width: 26px;
		height: 26px;
		border-radius: 7px;
		border: 1px solid var(--d-border);
		display: grid;
		place-items: center;
		color: var(--d-muted);
		text-decoration: none;
	}

	.or-ext:hover {
		color: var(--d-ink);
		border-color: var(--d-ink);
	}

	/* ── Seksi Tab Tren ── */
	.or-trend-section {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.or-sec-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
	}

	.or-sec-title {
		margin: 0;
		font-size: 0.98rem;
		font-weight: 800;
		color: var(--d-ink);
	}

	.or-mini-select {
		height: 32px;
		padding: 0 10px;
		border: 1px solid var(--d-border);
		border-radius: 8px;
		background: var(--d-surface);
		color: var(--d-ink);
		font-family: var(--font-body);
		font-size: 0.76rem;
		font-weight: 700;
		outline: none;
		cursor: pointer;
	}

	.or-movers {
		display: flex;
		flex-direction: column;
	}

	.or-mover-row {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 11px 18px;
		border-bottom: 1px solid var(--d-border);
		font-size: 0.82rem;
	}

	.or-mover-row:last-child {
		border-bottom: none;
	}

	.or-mover-name {
		flex: 1;
		font-weight: 700;
		color: var(--d-ink);
	}

	.or-mover-nums {
		font-size: 0.78rem;
		color: var(--d-muted);
	}

	.or-mover-nums strong {
		color: var(--d-ink);
	}

	.or-mover-badge {
		display: inline-flex;
		align-items: center;
		gap: 3px;
		padding: 2px 8px;
		border-radius: 999px;
		font-size: 0.72rem;
		font-weight: 800;
		background: var(--d-surface-2);
		color: var(--d-muted);
	}

	.or-mover-badge.is-up {
		background: var(--d-ok-soft);
		color: var(--d-ok);
	}

	.or-mover-badge.is-down {
		background: var(--d-err-soft);
		color: var(--d-err);
	}

	/* ── Query Bar Tab Eksplorasi ── */
	.or-query-bar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 10px;
	}

	.or-qgroup {
		display: inline-flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px;
		padding: 4px 10px;
		border: 1px solid var(--d-border);
		border-radius: 10px;
		background: var(--d-surface);
	}

	.or-qsep {
		font-size: 0.74rem;
		font-weight: 600;
		color: var(--d-muted);
	}

	.or-qselect {
		height: 28px;
		padding: 0 4px;
		border: none;
		background: transparent;
		color: var(--d-ink);
		font-family: var(--font-body);
		font-size: 0.78rem;
		font-weight: 700;
		outline: none;
		cursor: pointer;
	}

	.or-qselect option {
		background: var(--d-surface);
		color: var(--d-ink);
	}

	/* ── Tabel Data Rincian ── */
	.or-table-scroll {
		width: 100%;
		overflow-x: auto;
	}

	.or-table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.81rem;
	}

	.or-table th {
		padding: 11px 16px;
		text-align: left;
		font-size: 0.72rem;
		font-weight: 700;
		color: var(--d-muted);
		border-bottom: 1px solid var(--d-border);
		white-space: nowrap;
	}

	.or-table td {
		padding: 12px 16px;
		color: var(--d-ink);
		border-bottom: 1px solid var(--d-border);
		white-space: nowrap;
	}

	.or-table tbody tr:last-child td {
		border-bottom: none;
	}

	.or-table tbody tr:hover {
		background: var(--d-surface-hover);
	}

	.or-table .is-right {
		text-align: right;
	}

	.or-tbl-dim {
		display: inline-flex;
		align-items: center;
		gap: 9px;
		font-weight: 700;
	}

	.or-tbl-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.or-tbl-muted {
		color: var(--d-muted);
		font-size: 0.76rem;
	}

	.or-table-empty {
		text-align: center;
		color: var(--d-muted);
		padding: 28px 16px !important;
	}

	.or-table-foot {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 10px 16px;
		border-top: 1px solid var(--d-border);
		font-size: 0.72rem;
		font-weight: 600;
		color: var(--d-muted);
	}

	/* ── Skeleton ── */
	.or-skel {
		border-radius: 10px;
		background: linear-gradient(
			90deg,
			var(--d-surface-2) 0%,
			var(--d-surface-hover) 50%,
			var(--d-surface-2) 100%
		);
		background-size: 200% 100%;
		animation: orShimmer 1.3s ease-in-out infinite;
	}

	.or-skel-list {
		height: 180px;
	}

	@keyframes orShimmer {
		from {
			background-position: 200% 0;
		}
		to {
			background-position: -200% 0;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.or-skel,
		.or-spin.is-spinning {
			animation: none;
		}
	}

	/* ── Responsif ── */
	@media (max-width: 1120px) {
		.or-kpi-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}

	@media (max-width: 960px) {
		.or-two-col {
			grid-template-columns: minmax(0, 1fr);
		}
	}

	@media (max-width: 600px) {
		.or-controls {
			width: 100%;
			justify-content: space-between;
		}

		.or-range-seg {
			flex: 1 1 auto;
		}

		.or-range-btn {
			flex: 1;
			padding: 0 8px;
		}

		.or-kpi-grid {
			grid-template-columns: minmax(0, 1fr);
		}

		.or-tabs {
			gap: 16px;
		}
	}
</style>
