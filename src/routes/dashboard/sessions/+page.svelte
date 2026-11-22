<script lang="ts">
	import { onMount } from 'svelte';
	import { cubicOut } from 'svelte/easing';
	import type { TransitionConfig } from 'svelte/transition';
	import { page } from '$app/state';
	import type { GallerySession } from '#lib/types';
	import { getProductForCount } from '#lib/utils/canvas';
	import { allFormats, type StandardFormat } from '#lib/data/standardFormats';
	import { customFrameSizes, loadCustomFrameSizes } from '#lib/services/frameSizes';
	import { buildQRCodeDataUrl, resolveGalleryUrl } from '#lib/services/gallery';
	import {
		RefreshCw,
		Search,
		ExternalLink,
		Camera,
		Film,
		Image as ImageIcon,
		Copy,
		Check,
		Download,
		Printer,
		Trash2,
		QrCode,
		X,
		RotateCcw,
		ChevronLeft,
		ChevronRight,
		List,
		LayoutGrid
	} from '@lucide/svelte';

	type SessionSummary = {
		id: string;
		createdAt?: string;
		photoCount?: number;
		templateKey?: string;
		formatId?: string;
	};

	type RangePreset = '7d' | '14d' | '30d' | 'all';
	type SortOrder = 'newest' | 'oldest' | 'photos';
	type DetailTab = 'strip' | 'photos' | 'qr' | 'timelapse';
	type ViewMode = 'list' | 'gallery';

	const LIMIT = 200;

	const PRESET_LABELS: Record<string, string> = {
		classic: 'Classic',
		cobalt: 'Cobalt',
		darkroom: 'Dark Room',
		lavender: 'Lavender',
		custom: 'Frame Kustom'
	};

	const RANGE_OPTIONS: { id: RangePreset; short: string; label: string; days: number }[] = [
		{ id: '7d', short: '7 Hari', label: '7 Hari Terakhir', days: 7 },
		{ id: '14d', short: '14 Hari', label: '14 Hari Terakhir', days: 14 },
		{ id: '30d', short: '30 Hari', label: '30 Hari Terakhir', days: 30 },
		{ id: 'all', short: 'Semua', label: 'Seluruh Data', days: 30 }
	];

	// ── State daftar & filter ──
	let list = $state<SessionSummary[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let now = $state(new Date());

	let rangePreset = $state<RangePreset>('all');
	let viewMode = $state<ViewMode>('gallery');
	let modalOpen = $state(false);
	let query = $state('');
	let sizeFilter = $state('all');
	let photoFilter = $state('all');
	let sortOrder = $state<SortOrder>('newest');
	const PAGE_SIZES = [15, 30, 45] as const;
	let pageSize = $state<number>(15);
	let currentPage = $state<number>(1);
	let filterBarEl = $state<HTMLElement | null>(null);

	// ── State detail inspektor ──
	let selectedId = $state<string | null>(null);
	let detail = $state<GallerySession | null>(null);
	let detailLoading = $state(false);
	let detailError = $state<string | null>(null);
	let detailTab = $state<DetailTab>('strip');

	// ── State QR, lightbox & aksi ──
	let qrUrl = $state('');
	let qrDataUrl = $state('');
	let qrLoading = $state(false);
	let copiedLink = $state(false);
	let copiedCardId = $state<string | null>(null);
	let reprinting = $state(false);
	let confirmDelete = $state(false);
	let deleting = $state(false);
	let actionNotice = $state<{
		tone: 'ok' | 'err';
		text: string;
		linkHref?: string;
		linkLabel?: string;
	} | null>(null);
	let lightboxPhoto = $state<{ src: string; index: number } | null>(null);

	// ── State spotlight foto (gaya halaman Review) ──
	const AUTO_SLIDE_MS = 3000;
	let activePhotoIdx = $state(0);
	let slideDir = $state<1 | -1>(1);
	let photoAspect = $state(4 / 3);
	let progressKey = $state(0);
	let photoHovering = $state(false);
	let swipeStartX: number | null = null;
	let swipeStartY: number | null = null;
	let suppressZoom = false;

	let detailSeq = 0;
	let qrSeq = 0;

	// ── Utilitas tanggal & label ──
	function startOfDay(d: Date): Date {
		const x = new Date(d);
		x.setHours(0, 0, 0, 0);
		return x;
	}

	function parseDate(iso?: string): Date | null {
		if (!iso) return null;
		const d = new Date(iso);
		return Number.isFinite(d.getTime()) ? d : null;
	}

	function formatDate(iso?: string): string {
		const d = parseDate(iso);
		if (!d) return '—';
		return d.toLocaleString('id-ID', {
			day: '2-digit',
			month: 'short',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
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

	function shortId(id: string): string {
		const clean = id.replace(/^session[-_]?/i, '');
		return `#${clean.slice(-8).toUpperCase()}`;
	}

	function templateLabel(rawKey?: string): string {
		const raw = (rawKey || '').trim();
		if (!raw) return 'Classic';
		const lower = raw.toLowerCase();
		if (PRESET_LABELS[lower]) return PRESET_LABELS[lower];
		return raw.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
	}

	const formatsById = $derived.by(() => {
		void $customFrameSizes;
		return new Map<string, StandardFormat>(allFormats().map((f) => [f.id, f]));
	});

	function resolveFrameSize(
		formatId?: string,
		photoCount?: number
	): { label: string; spec: string } {
		const fid = (formatId || '').trim();
		if (fid && formatsById.has(fid)) {
			const fmt = formatsById.get(fid)!;
			return {
				label: fmt.label,
				spec: `${fmt.pxW} × ${fmt.pxH} px`
			};
		}
		const n = Math.max(1, Math.min(6, Math.round(Number(photoCount) || 4)));
		const prod = getProductForCount(n);
		return {
			label: `${prod.nama} (${prod.cm} cm)`,
			spec: `${prod.pxW} × ${prod.pxH} px · ${prod.sheetOrient === 'landscape' ? 'Landscape' : 'Portrait'}`
		};
	}

	// ── Filter periode & statistik KPI ──
	const currentRange = $derived(
		RANGE_OPTIONS.find((r) => r.id === rangePreset) ?? RANGE_OPTIONS[3]
	);

	const periodSessions = $derived.by(() => {
		if (rangePreset === 'all') return list;
		const end = new Date(startOfDay(now));
		end.setDate(end.getDate() + 1);
		const start = new Date(end);
		start.setDate(start.getDate() - currentRange.days);
		return list.filter((s) => {
			const d = parseDate(s.createdAt);
			return d !== null && d >= start && d < end;
		});
	});

	const availableFrameSizes = $derived.by(() => {
		const counts = new Map<string, number>();
		for (const s of periodSessions) {
			const label = resolveFrameSize(s.formatId, s.photoCount).label;
			counts.set(label, (counts.get(label) ?? 0) + 1);
		}
		return [...counts.entries()]
			.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
			.map(([label, count]) => ({ label, count }));
	});

	const totalPhotosInPeriod = $derived(
		periodSessions.reduce((acc, s) => acc + (Number(s.photoCount) || 0), 0)
	);

	const avgPhotosInPeriod = $derived(
		periodSessions.length ? totalPhotosInPeriod / periodSessions.length : 0
	);

	const topFrameSize = $derived.by(() => {
		const top = availableFrameSizes[0];
		if (!top) return null;
		const pct = periodSessions.length ? Math.round((top.count / periodSessions.length) * 100) : 0;
		return { label: top.label, count: top.count, pct };
	});

	const todaySessions = $derived.by(() => {
		const todayStart = startOfDay(now);
		return list.filter((s) => {
			const d = parseDate(s.createdAt);
			return d !== null && d >= todayStart;
		});
	});

	const latestSessionTime = $derived(list[0]?.createdAt ? timeAgo(list[0].createdAt) : null);

	const hasActiveFilters = $derived(
		query.trim() !== '' || sizeFilter !== 'all' || photoFilter !== 'all' || sortOrder !== 'newest'
	);

	const filteredList = $derived.by(() => {
		const q = query.trim().toLowerCase();
		const filtered = periodSessions.filter((s) => {
			const frameInfo = resolveFrameSize(s.formatId, s.photoCount);
			const tpl = templateLabel(s.templateKey);
			const count = Math.round(Number(s.photoCount) || 0);

			if (sizeFilter !== 'all' && frameInfo.label !== sizeFilter) return false;
			if (photoFilter !== 'all' && String(count) !== photoFilter) return false;

			if (!q) return true;
			return (
				s.id.toLowerCase().includes(q) ||
				shortId(s.id).toLowerCase().includes(q) ||
				frameInfo.label.toLowerCase().includes(q) ||
				tpl.toLowerCase().includes(q) ||
				(s.formatId || '').toLowerCase().includes(q)
			);
		});

		const sorted = [...filtered];
		if (sortOrder === 'oldest') {
			sorted.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
		} else if (sortOrder === 'photos') {
			sorted.sort(
				(a, b) =>
					(Number(b.photoCount) || 0) - (Number(a.photoCount) || 0) ||
					(b.createdAt || '').localeCompare(a.createdAt || '')
			);
		} else {
			sorted.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
		}
		return sorted;
	});

	// ── Paginasi (batasan item per halaman) ──
	const totalPages = $derived(Math.max(1, Math.ceil(filteredList.length / pageSize)));
	const safePage = $derived(Math.min(currentPage, totalPages));
	const pageStartIdx = $derived((safePage - 1) * pageSize);
	const pagedList = $derived(filteredList.slice(pageStartIdx, pageStartIdx + pageSize));
	const showingFrom = $derived(filteredList.length ? pageStartIdx + 1 : 0);
	const showingTo = $derived(Math.min(filteredList.length, pageStartIdx + pageSize));

	const pageNumbers = $derived.by((): (number | 'ellipsis')[] => {
		const total = totalPages;
		const cur = safePage;
		if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
		const pages: (number | 'ellipsis')[] = [1];
		const start = Math.max(2, cur - 1);
		const end = Math.min(total - 1, cur + 1);
		if (start > 2) pages.push('ellipsis');
		for (let i = start; i <= end; i++) pages.push(i);
		if (end < total - 1) pages.push('ellipsis');
		pages.push(total);
		return pages;
	});

	$effect(() => {
		void rangePreset;
		void query;
		void sizeFilter;
		void photoFilter;
		void sortOrder;
		void pageSize;
		currentPage = 1;
	});

	function goToPage(p: number): void {
		const next = Math.max(1, Math.min(totalPages, p));
		if (next === safePage) return;
		currentPage = next;
		filterBarEl?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
	}

	const detailFrameInfo = $derived(
		detail ? resolveFrameSize(detail.formatId, detail.photos?.length) : null
	);

	const detailPhotos = $derived(detail?.photos ?? []);
	const activePhoto = $derived(detailPhotos[activePhotoIdx] ?? null);
	const detailHasTimelapse = $derived(Boolean(detail?.videoDataUrl || detail?.gifDataUrl));

	const selectedIndex = $derived(
		selectedId ? filteredList.findIndex((s) => s.id === selectedId) : -1
	);
	const hasPrevSession = $derived(selectedIndex > 0);
	const hasNextSession = $derived(selectedIndex >= 0 && selectedIndex < filteredList.length - 1);

	$effect(() => {
		const len = detailPhotos.length;
		const visible = viewMode === 'list' || modalOpen;
		void activePhotoIdx;
		void progressKey;
		if (!visible || detailTab !== 'photos' || len <= 1 || photoHovering || lightboxPhoto) return;
		const timer = setTimeout(() => {
			if (swipeStartX !== null) return;
			slideDir = 1;
			activePhotoIdx = (activePhotoIdx + 1) % len;
			progressKey += 1;
		}, AUTO_SLIDE_MS);
		return () => clearTimeout(timer);
	});

	function handleSpotImgLoad(e: Event): void {
		const img = e.currentTarget as HTMLImageElement;
		if (img.naturalWidth > 0 && img.naturalHeight > 0) {
			photoAspect = img.naturalWidth / img.naturalHeight;
		}
	}

	function slidePhoto(
		_node: Element,
		{ dir, kind }: { dir: 1 | -1; kind: 'in' | 'out' }
	): TransitionConfig {
		const reduced =
			typeof window !== 'undefined' &&
			window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		if (reduced) return { duration: 0 };
		return {
			duration: kind === 'in' ? 320 : 280,
			easing: cubicOut,
			css: (t, u) => {
				const shift = kind === 'in' ? dir * u * 26 : -dir * u * 26;
				const scale = 0.96 + 0.04 * t;
				return `transform: translate3d(${shift}%, 0, 0) scale(${scale}); opacity: ${t};`;
			}
		};
	}

	function selectPhoto(index: number): void {
		if (index < 0 || index >= detailPhotos.length || index === activePhotoIdx) return;
		slideDir = index > activePhotoIdx ? 1 : -1;
		activePhotoIdx = index;
		progressKey += 1;
	}

	function prevPhoto(): void {
		if (detailPhotos.length <= 1) return;
		slideDir = -1;
		activePhotoIdx = (activePhotoIdx - 1 + detailPhotos.length) % detailPhotos.length;
		progressKey += 1;
	}

	function nextPhoto(): void {
		if (detailPhotos.length <= 1) return;
		slideDir = 1;
		activePhotoIdx = (activePhotoIdx + 1) % detailPhotos.length;
		progressKey += 1;
	}

	function handleSpotPointerDown(e: PointerEvent): void {
		if (detailPhotos.length <= 1 || e.button !== 0) return;
		if ((e.target as HTMLElement | null)?.closest('button.ses-rv-dl')) return;
		swipeStartX = e.clientX;
		swipeStartY = e.clientY;
	}

	function handleSpotPointerUp(e: PointerEvent): void {
		if (swipeStartX === null || swipeStartY === null) return;
		const dx = e.clientX - swipeStartX;
		const dy = e.clientY - swipeStartY;
		swipeStartX = null;
		swipeStartY = null;
		if (Math.abs(dx) >= 48 && Math.abs(dx) > Math.abs(dy) * 1.2) {
			suppressZoom = true;
			if (dx < 0) nextPhoto();
			else prevPhoto();
		}
	}

	function handleSpotClick(): void {
		if (suppressZoom) {
			suppressZoom = false;
			return;
		}
		if (activePhoto) {
			lightboxPhoto = { src: activePhoto, index: activePhotoIdx };
		}
	}

	function resetFilters(): void {
		query = '';
		sizeFilter = 'all';
		photoFilter = 'all';
		sortOrder = 'newest';
	}

	// ── Memuat data & detail ──
	async function loadList(): Promise<void> {
		loading = true;
		error = null;
		try {
			const [res] = await Promise.all([
				fetch(`/api/gallery?list=1&limit=${LIMIT}`),
				loadCustomFrameSizes(true).catch(() => undefined)
			]);
			if (!res.ok) throw new Error('Daftar sesi tidak tersedia');
			const data = (await res.json()) as { sessions?: SessionSummary[] };
			list = Array.isArray(data.sessions) ? data.sessions : [];
			now = new Date();
		} catch (e) {
			list = [];
			error = e instanceof Error ? e.message : 'Gagal memuat daftar sesi.';
		} finally {
			loading = false;
		}
	}

	async function prepareQr(sessionId: string): Promise<void> {
		const seq = ++qrSeq;
		qrLoading = true;
		qrUrl = '';
		qrDataUrl = '';
		try {
			const url = await resolveGalleryUrl(sessionId);
			if (seq !== qrSeq) return;
			qrUrl = url;
			const dataUrl = await buildQRCodeDataUrl(url, 440);
			if (seq !== qrSeq) return;
			qrDataUrl = dataUrl;
		} finally {
			if (seq === qrSeq) qrLoading = false;
		}
	}

	async function openDetail(id: string, initialTab: DetailTab = 'strip'): Promise<void> {
		const seq = ++detailSeq;
		selectedId = id;
		detail = null;
		detailError = null;
		detailLoading = true;
		detailTab = initialTab;
		confirmDelete = false;
		copiedLink = false;
		actionNotice = null;
		lightboxPhoto = null;
		activePhotoIdx = 0;
		photoAspect = 4 / 3;
		photoHovering = false;
		progressKey += 1;

		void prepareQr(id);

		try {
			const res = await fetch(`/api/gallery/${encodeURIComponent(id)}`);
			if (seq !== detailSeq) return;
			if (!res.ok) throw new Error('Detail sesi tidak ditemukan');
			detail = (await res.json()) as GallerySession;
		} catch (e) {
			if (seq !== detailSeq) return;
			detailError = e instanceof Error ? e.message : 'Gagal memuat detail sesi.';
		} finally {
			if (seq === detailSeq) detailLoading = false;
		}
	}

	function inspectFromGallery(id: string, tab: DetailTab = 'strip'): void {
		modalOpen = true;
		if (selectedId === id && detail && !detailLoading) {
			detailTab = tab;
			confirmDelete = false;
			return;
		}
		void openDetail(id, tab);
	}

	function closeModal(): void {
		modalOpen = false;
		confirmDelete = false;
	}

	function stepSession(delta: -1 | 1): void {
		const nextIdx = selectedIndex + delta;
		if (nextIdx < 0 || nextIdx >= filteredList.length) return;
		currentPage = Math.floor(nextIdx / pageSize) + 1;
		void openDetail(filteredList[nextIdx].id, detailTab);
	}

	function switchView(mode: ViewMode): void {
		viewMode = mode;
		modalOpen = false;
		confirmDelete = false;
		if (mode === 'list' && !selectedId && filteredList.length > 0) {
			void openDetail(filteredList[0].id);
		}
	}

	async function copySessionLink(id: string): Promise<void> {
		try {
			const url = await resolveGalleryUrl(id);
			await navigator.clipboard.writeText(url);
			copiedCardId = id;
			setTimeout(() => {
				if (copiedCardId === id) copiedCardId = null;
			}, 2000);
		} catch {
			error = 'Gagal menyalin tautan galeri.';
		}
	}

	// ── Aksi operator ──
	function downloadDataUrl(dataUrl: string, filename: string): void {
		if (!dataUrl) return;
		const a = document.createElement('a');
		a.href = dataUrl;
		a.download = filename;
		document.body.appendChild(a);
		a.click();
		a.remove();
	}

	async function copyGalleryLink(): Promise<void> {
		if (!detail) return;
		try {
			const url = qrUrl || (await resolveGalleryUrl(detail.id));
			qrUrl = url;
			await navigator.clipboard.writeText(url);
			copiedLink = true;
			actionNotice = {
				tone: 'ok',
				text: `Tautan galeri ${shortId(detail.id)} disalin.`
			};
			setTimeout(() => {
				copiedLink = false;
			}, 2200);
		} catch {
			actionNotice = {
				tone: 'err',
				text: 'Gagal menyalin tautan. Salin manual dari tab QR Galeri.'
			};
		}
	}

	async function enqueueReprint(): Promise<void> {
		if (!detail || reprinting) return;
		reprinting = true;
		actionNotice = null;
		try {
			const info = resolveFrameSize(detail.formatId, detail.photos?.length);
			const photoTotal = detail.photos?.length ?? 0;
			const res = await fetch('/api/queue', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					type: 'print',
					status: 'pending',
					title: `Cetak ulang ${shortId(detail.id)}`,
					ref: detail.id,
					detail: `${info.label} · ${photoTotal} foto · ${templateLabel(detail.templateKey)}`,
					source: 'dashboard/sessions'
				})
			});
			if (!res.ok) throw new Error('Gagal menambahkan ke antrean cetak.');
			actionNotice = {
				tone: 'ok',
				text: `Sesi ${shortId(detail.id)} masuk antrean cetak.`,
				linkHref: '/dashboard/queue/print',
				linkLabel: 'Lihat Antrean'
			};
		} catch (e) {
			actionNotice = {
				tone: 'err',
				text: e instanceof Error ? e.message : 'Gagal mengirim permintaan cetak ulang.'
			};
		} finally {
			reprinting = false;
		}
	}

	async function deleteActiveSession(): Promise<void> {
		if (!detail || deleting) return;
		deleting = true;
		actionNotice = null;
		const targetId = detail.id;
		const label = shortId(targetId);
		try {
			const res = await fetch(`/api/gallery/${encodeURIComponent(targetId)}`, {
				method: 'DELETE'
			});
			if (!res.ok) throw new Error('Gagal menghapus sesi.');
			list = list.filter((s) => s.id !== targetId);
			confirmDelete = false;
			if (viewMode === 'gallery') {
				modalOpen = false;
				selectedId = null;
				detail = null;
				return;
			}
			const next = filteredList[0];
			if (next) {
				await openDetail(next.id);
				actionNotice = { tone: 'ok', text: `Sesi ${label} dihapus.` };
			} else {
				selectedId = null;
				detail = null;
				actionNotice = { tone: 'ok', text: `Sesi ${label} dihapus.` };
			}
		} catch (e) {
			actionNotice = {
				tone: 'err',
				text: e instanceof Error ? e.message : 'Gagal menghapus sesi.'
			};
		} finally {
			deleting = false;
		}
	}

	function handleWindowKeydown(e: KeyboardEvent): void {
		if (e.key === 'Escape') {
			if (lightboxPhoto) {
				lightboxPhoto = null;
				return;
			}
			if (modalOpen) {
				closeModal();
				return;
			}
		}
		const tag = (e.target as HTMLElement | null)?.tagName;
		if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
		if (lightboxPhoto && detailPhotos.length > 1) {
			if (e.key === 'ArrowLeft') {
				e.preventDefault();
				const nextIdx = (lightboxPhoto.index - 1 + detailPhotos.length) % detailPhotos.length;
				lightboxPhoto = { src: detailPhotos[nextIdx], index: nextIdx };
			} else if (e.key === 'ArrowRight') {
				e.preventDefault();
				const nextIdx = (lightboxPhoto.index + 1) % detailPhotos.length;
				lightboxPhoto = { src: detailPhotos[nextIdx], index: nextIdx };
			}
			return;
		}
		if ((viewMode === 'list' || modalOpen) && detailTab === 'photos' && detailPhotos.length > 1) {
			if (e.key === 'ArrowLeft') {
				e.preventDefault();
				prevPhoto();
			} else if (e.key === 'ArrowRight') {
				e.preventDefault();
				nextPhoto();
			}
		}
	}

	onMount(() => {
		const init = async () => {
			const targetId = page.url.searchParams.get('id');
			const requestedView = page.url.searchParams.get('view');
			if (requestedView === 'list') {
				viewMode = 'list';
			}
			await loadList();
			if (targetId) {
				if (viewMode === 'gallery') {
					modalOpen = true;
				}
				void openDetail(targetId);
			} else if (viewMode === 'list' && list.length > 0) {
				void openDetail(list[0].id);
			}
		};
		void init();
		const t = setInterval(() => (now = new Date()), 60_000);
		return () => clearInterval(t);
	});
</script>

<svelte:window onkeydown={handleWindowKeydown} />

<div class="ses-page">
	<!-- ═══ Header Sesi ═══ -->
	<header class="ses-head">
		<div class="ses-head-copy">
			<h1 class="ses-title">Sesi</h1>
			<p class="ses-sub">Riwayat pemotretan, ukuran frame terpakai, dan aksi cetak ulang.</p>
		</div>

		<div class="ses-controls">
			<div class="ses-range-seg" role="group" aria-label="Pilih rentang waktu sesi">
				{#each RANGE_OPTIONS as opt (opt.id)}
					<button
						type="button"
						class="ses-range-btn"
						class:is-active={rangePreset === opt.id}
						aria-pressed={rangePreset === opt.id}
						title={opt.label}
						onclick={() => {
							rangePreset = opt.id;
							sizeFilter = 'all';
						}}
					>
						{opt.short}
					</button>
				{/each}
			</div>

			<button
				type="button"
				class="ses-refresh-btn"
				onclick={loadList}
				disabled={loading}
				aria-label="Muat ulang daftar sesi"
				title="Muat ulang data"
			>
				<span class="ses-spin" class:is-spinning={loading}><RefreshCw size={14} /></span>
				<span>Muat Ulang</span>
			</button>
		</div>
	</header>

	{#if error}
		<div class="d-banner d-banner-err" role="alert"><span>{error}</span></div>
	{/if}

	<!-- ═══ 4 Kartu Ringkasan Ringkas ═══ -->
	<section class="ses-kpi-grid" aria-label="Ringkasan sesi">
		<article class="ses-kpi-card">
			<span class="ses-kpi-label">Total Sesi</span>
			<strong class="ses-kpi-val d-num">{periodSessions.length}</strong>
			<span class="ses-kpi-meta d-num">
				{rangePreset === 'all' ? `${list.length} tersimpan` : currentRange.label}
			</span>
		</article>

		<article class="ses-kpi-card">
			<span class="ses-kpi-label">Total Foto</span>
			<strong class="ses-kpi-val d-num">{totalPhotosInPeriod}</strong>
			<span class="ses-kpi-meta d-num">Rata-rata {avgPhotosInPeriod.toFixed(1)} foto / sesi</span>
		</article>

		<article class="ses-kpi-card">
			<span class="ses-kpi-label">Ukuran Terbanyak</span>
			<strong class="ses-kpi-val is-text" title={topFrameSize?.label ?? ''}>
				{topFrameSize ? topFrameSize.label : '—'}
			</strong>
			<span class="ses-kpi-meta d-num">
				{topFrameSize ? `${topFrameSize.count} sesi (${topFrameSize.pct}%)` : 'Belum ada data'}
			</span>
		</article>

		<article class="ses-kpi-card">
			<span class="ses-kpi-label">Sesi Hari Ini</span>
			<strong class="ses-kpi-val d-num">{todaySessions.length}</strong>
			<span class="ses-kpi-meta">
				{latestSessionTime ? `Terakhir ${latestSessionTime}` : 'Belum ada sesi'}
			</span>
		</article>
	</section>

	<!-- ═══ Bar Pencarian & Filter ═══ -->
	<section class="ses-filter-bar" bind:this={filterBarEl} aria-label="Pencarian dan filter sesi">
		<div class="ses-search">
			<Search size={14} />
			<input
				type="search"
				class="ses-search-input"
				placeholder="Cari ID sesi, ukuran frame, atau template…"
				bind:value={query}
				aria-label="Cari sesi"
			/>
		</div>

		<div class="ses-filter-selects">
			<label class="ses-select-pill">
				<span>Ukuran</span>
				<select bind:value={sizeFilter} aria-label="Filter ukuran frame">
					<option value="all">Semua</option>
					{#each availableFrameSizes as sz (sz.label)}
						<option value={sz.label}>{sz.label} ({sz.count})</option>
					{/each}
				</select>
			</label>

			<label class="ses-select-pill">
				<span>Foto</span>
				<select bind:value={photoFilter} aria-label="Filter jumlah foto">
					<option value="all">Semua</option>
					<option value="1">1 Foto</option>
					<option value="2">2 Foto</option>
					<option value="3">3 Foto</option>
					<option value="4">4 Foto</option>
					<option value="5">5 Foto</option>
					<option value="6">6 Foto</option>
				</select>
			</label>

			<label class="ses-select-pill">
				<span>Urut</span>
				<select bind:value={sortOrder} aria-label="Urutkan sesi">
					<option value="newest">Terbaru</option>
					<option value="oldest">Terlama</option>
					<option value="photos">Foto terbanyak</option>
				</select>
			</label>

			{#if hasActiveFilters}
				<button type="button" class="ses-reset-btn" onclick={resetFilters}>
					<RotateCcw size={12} />
					Reset
				</button>
			{/if}

			<div class="ses-view-seg" role="group" aria-label="Mode tampilan sesi">
				<button
					type="button"
					class="ses-view-btn"
					class:is-active={viewMode === 'gallery'}
					aria-pressed={viewMode === 'gallery'}
					onclick={() => switchView('gallery')}
				>
					<LayoutGrid size={13} />
					Galeri
				</button>
				<button
					type="button"
					class="ses-view-btn"
					class:is-active={viewMode === 'list'}
					aria-pressed={viewMode === 'list'}
					onclick={() => switchView('list')}
				>
					<List size={13} />
					Daftar
				</button>
			</div>
		</div>
	</section>

	{#if viewMode === 'gallery'}
		<!-- ═══ Mode Galeri: Katalog Visual Strip & Akses QR Cepat ═══ -->
		{#if loading}
			<div class="ses-gal-grid">
				{#each Array(8) as _, idx (idx)}
					<div class="ses-gal-skel"></div>
				{/each}
			</div>
		{:else if filteredList.length === 0}
			<section class="d-card">
				<div class="ses-empty">
					<Camera size={24} />
					<p class="ses-empty-title">Tidak ada sesi cocok</p>
					{#if hasActiveFilters}
						<button type="button" class="d-btn d-btn-sm" onclick={resetFilters}>
							Reset Filter
						</button>
					{/if}
				</div>
			</section>
		{:else}
			<section class="ses-gal-grid" aria-label="Galeri visual sesi">
				{#each pagedList as s (s.id)}
					{@const info = resolveFrameSize(s.formatId, s.photoCount)}
					<article class="ses-gal-card">
						<button
							type="button"
							class="ses-gal-media"
							onclick={() => inspectFromGallery(s.id, 'strip')}
							aria-label="Lihat detail sesi {shortId(s.id)}"
						>
							<img
								src={`/api/gallery/${encodeURIComponent(s.id)}/strip`}
								alt="Hasil strip sesi {shortId(s.id)}"
								loading="lazy"
								draggable="false"
							/>
							<span class="ses-gal-badge d-num">{s.photoCount ?? 0} foto</span>
						</button>

						<div class="ses-gal-foot">
							<div class="ses-row-line">
								<span class="ses-row-id d-num">{shortId(s.id)}</span>
								<span class="ses-row-time" title={formatDate(s.createdAt)}>
									{timeAgo(s.createdAt)}
								</span>
							</div>
							<p class="ses-gal-frame" title={info.label}>{info.label}</p>

							<div class="ses-gal-acts">
								<button
									type="button"
									class="ses-gal-btn"
									onclick={() => inspectFromGallery(s.id, 'qr')}
									title="Tampilkan kode QR galeri"
								>
									<QrCode size={12} />
									QR
								</button>
								<button
									type="button"
									class="ses-gal-btn"
									onclick={() => copySessionLink(s.id)}
									title="Salin tautan galeri tamu"
								>
									{#if copiedCardId === s.id}
										<Check size={12} />
										Tersalin
									{:else}
										<Copy size={12} />
										Salin
									{/if}
								</button>
								<a
									class="ses-gal-icon"
									href={`/gallery/${encodeURIComponent(s.id)}`}
									target="_blank"
									rel="noopener noreferrer"
									title="Buka halaman galeri tamu"
									aria-label="Buka galeri {shortId(s.id)}"
								>
									<ExternalLink size={12} />
								</a>
							</div>
						</div>
					</article>
				{/each}
			</section>

			<!-- Bar Paginasi Galeri -->
			<nav class="ses-pager" aria-label="Navigasi halaman sesi">
				<span class="ses-pager-info d-num">
					Menampilkan <strong>{showingFrom}–{showingTo}</strong> dari
					<strong>{filteredList.length}</strong> sesi
				</span>

				<div class="ses-pager-right">
					<label class="ses-select-pill">
						<span>Per halaman</span>
						<select bind:value={pageSize} aria-label="Jumlah sesi per halaman">
							{#each PAGE_SIZES as n (n)}
								<option value={n}>{n}</option>
							{/each}
						</select>
					</label>

					{#if totalPages > 1}
						<div class="ses-page-btns">
							<button
								type="button"
								class="ses-page-btn"
								onclick={() => goToPage(safePage - 1)}
								disabled={safePage <= 1}
								aria-label="Halaman sebelumnya"
							>
								<ChevronLeft size={14} />
							</button>

							{#each pageNumbers as item, idx (idx)}
								{#if item === 'ellipsis'}
									<span class="ses-page-dots" aria-hidden="true">…</span>
								{:else}
									<button
										type="button"
										class="ses-page-btn d-num"
										class:is-active={item === safePage}
										aria-current={item === safePage ? 'page' : undefined}
										onclick={() => goToPage(item)}
									>
										{item}
									</button>
								{/if}
							{/each}

							<button
								type="button"
								class="ses-page-btn"
								onclick={() => goToPage(safePage + 1)}
								disabled={safePage >= totalPages}
								aria-label="Halaman berikutnya"
							>
								<ChevronRight size={14} />
							</button>
						</div>
					{/if}
				</div>
			</nav>
		{/if}
	{:else}
		<!-- ═══ Workspace Split: Daftar Ringkas & Inspektor Ringkas ═══ -->
		<div class="ses-split">
			<!-- Kolom Kiri: Daftar Sesi (Compact 2-baris) -->
			<section class="d-card ses-list-panel" aria-label="Daftar sesi">
				<div class="ses-panel-head">
					<h2 class="ses-panel-title">Daftar Sesi</h2>
					<span class="ses-count-chip d-num">
						{filteredList.length === periodSessions.length
							? periodSessions.length
							: `${filteredList.length} / ${periodSessions.length}`}
					</span>
				</div>

				{#if loading}
					<div class="ses-skel-list">
						{#each Array(7) as _, idx (idx)}
							<div class="ses-skel-row"></div>
						{/each}
					</div>
				{:else if filteredList.length === 0}
					<div class="ses-empty">
						<Camera size={22} />
						<p class="ses-empty-title">Tidak ada sesi cocok</p>
						{#if hasActiveFilters}
							<button type="button" class="d-btn d-btn-sm" onclick={resetFilters}>
								Reset Filter
							</button>
						{/if}
					</div>
				{:else}
					<div class="ses-scroll">
						{#each pagedList as s (s.id)}
							{@const info = resolveFrameSize(s.formatId, s.photoCount)}
							<button
								type="button"
								class="ses-row"
								class:is-active={selectedId === s.id}
								onclick={() => openDetail(s.id)}
							>
								<div class="ses-row-line">
									<span class="ses-row-id d-num">{shortId(s.id)}</span>
									<span class="ses-row-time" title={formatDate(s.createdAt)}>
										{timeAgo(s.createdAt)}
									</span>
								</div>
								<div class="ses-row-line">
									<span class="ses-row-frame">{info.label}</span>
									<span class="ses-row-count d-num">{s.photoCount ?? 0} foto</span>
								</div>
							</button>
						{/each}
					</div>

					{#if totalPages > 1}
						<nav class="ses-list-pager" aria-label="Halaman daftar sesi">
							<span class="ses-list-pager-meta d-num">
								{showingFrom}–{showingTo} / {filteredList.length}
							</span>
							<div class="ses-page-btns">
								<button
									type="button"
									class="ses-page-btn is-sm"
									onclick={() => goToPage(safePage - 1)}
									disabled={safePage <= 1}
									aria-label="Halaman sebelumnya"
								>
									<ChevronLeft size={13} />
								</button>
								<span class="ses-list-pager-num d-num">{safePage} / {totalPages}</span>
								<button
									type="button"
									class="ses-page-btn is-sm"
									onclick={() => goToPage(safePage + 1)}
									disabled={safePage >= totalPages}
									aria-label="Halaman berikutnya"
								>
									<ChevronRight size={13} />
								</button>
							</div>
						</nav>
					{/if}
				{/if}
			</section>

			<!-- Kolom Kanan: Inspektor Sesi -->
			<section class="d-card ses-detail-panel" aria-label="Inspektor detail sesi">
				{@render inspectorContent(false)}
			</section>
		</div>
	{/if}
</div>

{#snippet inspectorContent(inModal: boolean)}
	{#if !selectedId}
		<div class="ses-empty is-tall">
			<ImageIcon size={26} />
			<p class="ses-empty-title">Pilih sesi di sebelah kiri</p>
			<span class="ses-empty-desc">
				Pratinjau strip, informasi sesi, foto satuan, dan QR galeri tampil di sini.
			</span>
		</div>
	{:else if detailLoading}
		<div class="ses-detail-loading">
			<div class="ses-skel-bar"></div>
			<div class="ses-skel-stage"></div>
		</div>
	{:else if detailError}
		<div class="d-card-body">
			<div class="d-banner d-banner-err" role="alert"><span>{detailError}</span></div>
		</div>
	{:else if detail}
		<!-- Header Inspektor 1 Baris Ringkas -->
		<div class="ses-detail-bar">
			<div class="ses-detail-ident">
				{#if inModal && filteredList.length > 1}
					<div class="ses-step-group">
						<button
							type="button"
							class="ses-icon-btn"
							onclick={() => stepSession(-1)}
							disabled={!hasPrevSession}
							title="Sesi sebelumnya"
							aria-label="Sesi sebelumnya"
						>
							<ChevronLeft size={14} />
						</button>
						<button
							type="button"
							class="ses-icon-btn"
							onclick={() => stepSession(1)}
							disabled={!hasNextSession}
							title="Sesi berikutnya"
							aria-label="Sesi berikutnya"
						>
							<ChevronRight size={14} />
						</button>
					</div>
				{/if}
				<h2 class="ses-detail-title d-num">Sesi {shortId(detail.id)}</h2>
			</div>

			<div class="ses-detail-actions">
				<a
					class="ses-act-btn is-primary"
					href={`/gallery/${encodeURIComponent(detail.id)}`}
					target="_blank"
					rel="noopener noreferrer"
				>
					<ExternalLink size={13} />
					Buka Galeri
				</a>

				<button
					type="button"
					class="ses-icon-btn"
					onclick={copyGalleryLink}
					title={copiedLink ? 'Tautan tersalin' : 'Salin tautan galeri'}
					aria-label="Salin tautan galeri"
				>
					{#if copiedLink}
						<Check size={14} />
					{:else}
						<Copy size={14} />
					{/if}
				</button>

				{#if !confirmDelete}
					<button
						type="button"
						class="ses-icon-btn is-danger"
						onclick={() => (confirmDelete = true)}
						title="Hapus sesi"
						aria-label="Hapus sesi"
					>
						<Trash2 size={14} />
					</button>
				{:else}
					<div class="ses-confirm-group">
						<button
							type="button"
							class="ses-act-btn is-danger-solid"
							onclick={deleteActiveSession}
							disabled={deleting}
						>
							{deleting ? 'Menghapus…' : 'Hapus?'}
						</button>
						<button
							type="button"
							class="ses-act-btn"
							onclick={() => (confirmDelete = false)}
							disabled={deleting}
						>
							Batal
						</button>
					</div>
				{/if}

				{#if inModal}
					<button
						type="button"
						class="ses-icon-btn"
						onclick={closeModal}
						title="Tutup detail"
						aria-label="Tutup detail"
					>
						<X size={15} />
					</button>
				{/if}
			</div>
		</div>

		<!-- Sub-Tab Garis Bawah -->
		<div class="ses-subtabs" role="tablist" aria-label="Tampilan output sesi">
			<button
				type="button"
				role="tab"
				class="ses-subtab"
				class:is-active={detailTab === 'strip'}
				aria-selected={detailTab === 'strip'}
				onclick={() => (detailTab = 'strip')}
			>
				Strip Final
			</button>
			<button
				type="button"
				role="tab"
				class="ses-subtab"
				class:is-active={detailTab === 'photos'}
				aria-selected={detailTab === 'photos'}
				onclick={() => (detailTab = 'photos')}
			>
				Foto ({detail.photos?.length ?? 0})
			</button>
			<button
				type="button"
				role="tab"
				class="ses-subtab"
				class:is-active={detailTab === 'qr'}
				aria-selected={detailTab === 'qr'}
				onclick={() => (detailTab = 'qr')}
			>
				QR Galeri
			</button>
			{#if detailHasTimelapse}
				<button
					type="button"
					role="tab"
					class="ses-subtab"
					class:is-active={detailTab === 'timelapse'}
					aria-selected={detailTab === 'timelapse'}
					onclick={() => (detailTab = 'timelapse')}
				>
					Timelapse
				</button>
			{/if}
		</div>

		{#if actionNotice}
			<div class="ses-notice-wrap">
				<div
					class="d-banner {actionNotice.tone === 'ok' ? 'd-banner-ok' : 'd-banner-err'}"
					role="status"
				>
					<span>{actionNotice.text}</span>
					{#if actionNotice.linkHref && actionNotice.linkLabel}
						<a class="ses-notice-link" href={actionNotice.linkHref}>
							{actionNotice.linkLabel}
						</a>
					{/if}
				</div>
			</div>
		{/if}

		<!-- Konten Sub-Tab -->
		<div class="ses-detail-body">
			{#if detailTab === 'strip'}
				<!-- Tata letak berdampingan: Strip di kiri, Info & Aksi di kanan -->
				<div class="ses-strip-layout">
					<div class="ses-strip-stage">
						{#if detail.stripDataUrl}
							<img
								src={detail.stripDataUrl}
								alt="Hasil strip sesi {detail.id}"
								class="ses-strip-img"
							/>
						{:else}
							<div class="ses-empty">
								<ImageIcon size={24} />
								<p class="ses-empty-title">Strip tidak tersedia</p>
							</div>
						{/if}
					</div>

					<aside class="ses-info-rail" aria-label="Ringkasan informasi sesi">
						<dl class="ses-dl">
							<div class="ses-dl-row">
								<dt>Waktu</dt>
								<dd class="d-num">{formatDate(detail.createdAt)}</dd>
							</div>
							<div class="ses-dl-row">
								<dt>Ukuran</dt>
								<dd>{detailFrameInfo?.label}</dd>
							</div>
							<div class="ses-dl-row">
								<dt>Resolusi</dt>
								<dd class="d-num">{detailFrameInfo?.spec}</dd>
							</div>
							<div class="ses-dl-row">
								<dt>Jumlah Foto</dt>
								<dd class="d-num">{detail.photos?.length ?? 0} foto</dd>
							</div>
							<div class="ses-dl-row">
								<dt>Template</dt>
								<dd>{templateLabel(detail.templateKey)}</dd>
							</div>
						</dl>

						<div class="ses-rail-actions">
							{#if detail.stripDataUrl}
								<button
									type="button"
									class="ses-rail-btn is-primary"
									onclick={() =>
										downloadDataUrl(detail!.stripDataUrl, `distudio-strip-${detail!.id}.png`)}
								>
									<Download size={14} />
									Unduh Strip PNG
								</button>
							{/if}

							<button
								type="button"
								class="ses-rail-btn"
								onclick={enqueueReprint}
								disabled={reprinting}
							>
								<Printer size={14} />
								{reprinting ? 'Mengantre…' : 'Cetak Ulang'}
							</button>
						</div>
					</aside>
				</div>
			{:else if detailTab === 'photos'}
				{#if detailPhotos.length}
					<!-- Spotlight Foto bergaya halaman Review -->
					<div class="ses-rv-layout">
						<div class="ses-rv-stage">
							{#if detailPhotos.length > 1}
								<button
									type="button"
									class="ses-rv-arrow is-prev"
									onclick={prevPhoto}
									aria-label="Foto sebelumnya"
								>
									<ChevronLeft size={18} />
								</button>
							{/if}

							<div class="ses-rv-slot">
								<div
									class="ses-rv-card"
									style="--photo-ar: {photoAspect};"
									role="region"
									aria-roledescription="carousel"
									aria-label="Pratinjau foto sesi"
									onpointerdown={handleSpotPointerDown}
									onpointerup={handleSpotPointerUp}
									onpointercancel={() => {
										swipeStartX = null;
										swipeStartY = null;
									}}
									onpointerenter={() => (photoHovering = true)}
									onpointerleave={() => (photoHovering = false)}
								>
									{#if activePhoto}
										{#key activePhotoIdx}
											<button
												type="button"
												class="ses-rv-hit"
												in:slidePhoto={{ dir: slideDir, kind: 'in' }}
												out:slidePhoto={{ dir: slideDir, kind: 'out' }}
												onclick={handleSpotClick}
												aria-label="Perbesar foto {activePhotoIdx + 1}"
											>
												<img
													src={activePhoto}
													alt="Hasil foto {activePhotoIdx + 1} sesi {detail.id}"
													class="ses-rv-img"
													onload={handleSpotImgLoad}
													draggable="false"
												/>
											</button>
										{/key}
									{/if}

									<span class="ses-rv-counter d-num" aria-live="polite">
										Foto {activePhotoIdx + 1} / {detailPhotos.length}
									</span>

									{#if activePhoto}
										<button
											type="button"
											class="ses-rv-dl"
											onclick={() =>
												downloadDataUrl(
													activePhoto,
													`distudio-${detail!.id}-foto-${activePhotoIdx + 1}.jpg`
												)}
											aria-label="Unduh foto {activePhotoIdx + 1}"
										>
											<Download size={13} />
											Unduh Foto {activePhotoIdx + 1}
										</button>
									{/if}

									{#if detailPhotos.length > 1 && !photoHovering && !lightboxPhoto}
										<div class="ses-rv-autobar" aria-hidden="true">
											{#key `${activePhotoIdx}-${progressKey}`}
												<span class="ses-rv-autofill" style="animation-duration: {AUTO_SLIDE_MS}ms;"
												></span>
											{/key}
										</div>
									{/if}
								</div>
							</div>

							{#if detailPhotos.length > 1}
								<button
									type="button"
									class="ses-rv-arrow is-next"
									onclick={nextPhoto}
									aria-label="Foto berikutnya"
								>
									<ChevronRight size={18} />
								</button>
							{/if}
						</div>

						{#if detailPhotos.length > 1}
							<div class="ses-rv-thumbs" role="tablist" aria-label="Pilih foto untuk ditinjau">
								{#each detailPhotos as photo, i (i)}
									<button
										type="button"
										role="tab"
										class="ses-rv-thumb"
										class:is-active={i === activePhotoIdx}
										aria-selected={i === activePhotoIdx}
										aria-label="Lihat foto {i + 1}"
										onclick={() => selectPhoto(i)}
									>
										<img src={photo} alt="" draggable="false" />
										<span class="ses-rv-thumb-num d-num" aria-hidden="true">{i + 1}</span>
									</button>
								{/each}
							</div>
						{/if}
					</div>
				{:else}
					<div class="ses-empty">
						<Camera size={22} />
						<p class="ses-empty-title">Tidak ada foto individu tersimpan</p>
					</div>
				{/if}
			{:else if detailTab === 'qr'}
				<div class="ses-qr-panel">
					<div class="ses-qr-box">
						{#if qrLoading}
							<div class="ses-qr-skel"></div>
						{:else if qrDataUrl}
							<img src={qrDataUrl} alt="Kode QR galeri sesi {detail.id}" class="ses-qr-img" />
						{:else}
							<QrCode size={64} />
						{/if}
					</div>

					<p class="ses-qr-hint">Pindai QR untuk mengunduh foto &amp; strip</p>

					{#if qrUrl}
						<div class="ses-qr-url-box">{qrUrl}</div>
					{/if}

					<div class="ses-qr-actions">
						<button type="button" class="ses-act-btn is-primary" onclick={copyGalleryLink}>
							{#if copiedLink}
								<Check size={13} />
								Tersalin
							{:else}
								<Copy size={13} />
								Salin Tautan
							{/if}
						</button>
						{#if qrDataUrl}
							<button
								type="button"
								class="ses-act-btn"
								onclick={() => downloadDataUrl(qrDataUrl, `distudio-qr-${detail!.id}.png`)}
							>
								<Download size={13} />
								Unduh QR
							</button>
						{/if}
						<a
							class="ses-act-btn"
							href={`/gallery/${encodeURIComponent(detail.id)}`}
							target="_blank"
							rel="noopener noreferrer"
						>
							<ExternalLink size={13} />
							Buka Galeri
						</a>
					</div>
				</div>
			{:else if detailTab === 'timelapse'}
				<div class="ses-tl-grid">
					{#if detail.videoDataUrl}
						<div class="ses-tl-card">
							<div class="ses-tl-head">
								<span class="ses-tl-label"><Film size={14} /> Video MP4</span>
								<button
									type="button"
									class="ses-photo-dl"
									onclick={() =>
										downloadDataUrl(detail!.videoDataUrl!, `distudio-${detail!.id}.mp4`)}
								>
									<Download size={12} />
									Unduh
								</button>
							</div>
							<!-- svelte-ignore a11y_media_has_caption -->
							<video src={detail.videoDataUrl} controls loop muted playsinline class="ses-tl-media"
							></video>
						</div>
					{/if}

					{#if detail.gifDataUrl}
						<div class="ses-tl-card">
							<div class="ses-tl-head">
								<span class="ses-tl-label"><ImageIcon size={14} /> Animasi GIF</span>
								<button
									type="button"
									class="ses-photo-dl"
									onclick={() => downloadDataUrl(detail!.gifDataUrl!, `distudio-${detail!.id}.gif`)}
								>
									<Download size={12} />
									Unduh
								</button>
							</div>
							<img
								src={detail.gifDataUrl}
								alt="Animasi GIF sesi {detail.id}"
								class="ses-tl-media"
							/>
						</div>
					{/if}
				</div>
			{/if}
		</div>
	{/if}
{/snippet}

<!-- Modal Inspektor saat membuka kartu dari Mode Galeri -->
{#if viewMode === 'gallery' && modalOpen}
	<div class="ses-modal" role="dialog" aria-modal="true" aria-label="Inspektor detail sesi">
		<button
			type="button"
			class="ses-modal-backdrop"
			aria-label="Tutup detail sesi"
			onclick={closeModal}
		></button>
		<div class="d-card ses-modal-dialog">
			{@render inspectorContent(true)}
		</div>
	</div>
{/if}

<!-- Lightbox Pratinjau Foto Penuh -->
{#if lightboxPhoto && detail}
	<div class="ses-lightbox" role="dialog" aria-modal="true" aria-label="Pratinjau foto penuh">
		<button
			type="button"
			class="ses-lightbox-backdrop"
			aria-label="Tutup pratinjau"
			onclick={() => (lightboxPhoto = null)}
		></button>
		<div class="ses-lightbox-dialog">
			<div class="ses-lightbox-bar">
				<span class="ses-lightbox-title d-num">
					Sesi {shortId(detail.id)} · Foto #{lightboxPhoto.index + 1}
				</span>
				<div class="ses-lightbox-actions">
					<button
						type="button"
						class="ses-act-btn"
						onclick={() =>
							downloadDataUrl(
								lightboxPhoto!.src,
								`distudio-${detail!.id}-foto-${lightboxPhoto!.index + 1}.jpg`
							)}
					>
						<Download size={13} />
						Unduh Foto
					</button>
					<button
						type="button"
						class="ses-icon-btn"
						aria-label="Tutup"
						onclick={() => (lightboxPhoto = null)}
					>
						<X size={15} />
					</button>
				</div>
			</div>
			<img
				src={lightboxPhoto.src}
				alt="Pratinjau foto {lightboxPhoto.index + 1}"
				class="ses-lightbox-img"
			/>
		</div>
	</div>
{/if}

<style>
	.ses-page {
		display: flex;
		flex-direction: column;
		gap: 14px;
	}

	/* ── Header Sesi ── */
	.ses-head {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		justify-content: space-between;
		gap: 12px 18px;
	}

	.ses-head-copy {
		min-width: 0;
		flex: 1 1 260px;
	}

	.ses-title {
		margin: 0;
		font-size: clamp(1.4rem, 2vw, 1.7rem);
		font-weight: 800;
		letter-spacing: -0.025em;
		line-height: 1.15;
		color: var(--d-ink);
	}

	.ses-sub {
		margin: 4px 0 0;
		font-size: 0.82rem;
		line-height: 1.4;
		color: var(--d-muted);
	}

	.ses-controls {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
		flex-shrink: 0;
	}

	.ses-range-seg {
		display: inline-flex;
		align-items: center;
		gap: 2px;
		height: 34px;
		padding: 3px;
		border: 1px solid var(--d-border);
		border-radius: 9px;
		background: var(--d-surface);
	}

	.ses-range-btn {
		height: 100%;
		padding: 0 10px;
		border: none;
		border-radius: 6px;
		background: transparent;
		color: var(--d-muted);
		font-family: var(--font-body);
		font-size: 0.74rem;
		font-weight: 700;
		white-space: nowrap;
		cursor: pointer;
		transition:
			background-color 140ms ease,
			color 140ms ease;
	}

	.ses-range-btn:hover:not(.is-active) {
		color: var(--d-ink);
		background: var(--d-surface-2);
	}

	.ses-range-btn.is-active {
		background: var(--d-ink);
		color: var(--d-bg);
	}

	.ses-refresh-btn {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		height: 34px;
		padding: 0 12px;
		border: 1px solid var(--d-border);
		border-radius: 9px;
		background: var(--d-surface);
		color: var(--d-ink);
		font-family: var(--font-body);
		font-size: 0.74rem;
		font-weight: 700;
		white-space: nowrap;
		cursor: pointer;
		transition:
			background-color 140ms ease,
			border-color 140ms ease,
			opacity 140ms ease;
	}

	.ses-refresh-btn:hover:not(:disabled) {
		background: var(--d-surface-2);
		border-color: var(--d-border-strong);
	}

	.ses-refresh-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.ses-spin {
		display: inline-grid;
	}

	.ses-spin.is-spinning {
		animation: sesSpin 900ms linear infinite;
	}

	@keyframes sesSpin {
		to {
			transform: rotate(360deg);
		}
	}

	/* ── 4 Kartu Ringkasan Compact ── */
	.ses-kpi-grid {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 10px;
	}

	.ses-kpi-card {
		display: flex;
		flex-direction: column;
		gap: 3px;
		padding: 12px 14px;
		border: 1px solid var(--d-border);
		border-radius: 12px;
		background: var(--d-surface);
		min-width: 0;
	}

	.ses-kpi-label {
		font-size: 0.71rem;
		font-weight: 600;
		color: var(--d-muted);
	}

	.ses-kpi-val {
		font-size: 1.38rem;
		font-weight: 800;
		letter-spacing: -0.025em;
		line-height: 1.2;
		color: var(--d-ink);
	}

	.ses-kpi-val.is-text {
		font-size: 0.94rem;
		line-height: 1.35;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		padding-top: 2px;
	}

	.ses-kpi-meta {
		font-size: 0.71rem;
		color: var(--d-muted);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	/* ── Filter Bar Compact ── */
	.ses-filter-bar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
	}

	.ses-search {
		position: relative;
		display: flex;
		align-items: center;
		flex: 1 1 220px;
		max-width: 340px;
		color: var(--d-muted);
	}

	.ses-search :global(svg) {
		position: absolute;
		left: 11px;
		pointer-events: none;
	}

	.ses-search-input {
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
		transition: border-color 140ms ease;
	}

	.ses-search-input:focus {
		border-color: var(--d-border-strong);
	}

	.ses-search-input::placeholder {
		color: var(--d-muted);
	}

	.ses-filter-selects {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px;
	}

	.ses-select-pill {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		height: 34px;
		padding: 0 9px;
		border: 1px solid var(--d-border);
		border-radius: 9px;
		background: var(--d-surface);
		font-size: 0.73rem;
		color: var(--d-muted);
	}

	.ses-select-pill select {
		border: none;
		background: transparent;
		color: var(--d-ink);
		font-family: var(--font-body);
		font-size: 0.74rem;
		font-weight: 700;
		outline: none;
		cursor: pointer;
		max-width: 155px;
	}

	.ses-select-pill select option {
		background: var(--d-surface);
		color: var(--d-ink);
	}

	.ses-reset-btn {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		height: 34px;
		padding: 0 10px;
		border: 1px solid var(--d-border);
		border-radius: 9px;
		background: transparent;
		color: var(--d-muted);
		font-family: var(--font-body);
		font-size: 0.73rem;
		font-weight: 700;
		cursor: pointer;
	}

	.ses-reset-btn:hover {
		background: var(--d-surface-2);
		color: var(--d-ink);
	}

	/* ── Toggle Mode Daftar / Galeri ── */
	.ses-view-seg {
		display: inline-flex;
		align-items: center;
		gap: 2px;
		height: 34px;
		padding: 3px;
		border: 1px solid var(--d-border);
		border-radius: 9px;
		background: var(--d-surface);
	}

	.ses-view-btn {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		height: 100%;
		padding: 0 10px;
		border: none;
		border-radius: 6px;
		background: transparent;
		color: var(--d-muted);
		font-family: var(--font-body);
		font-size: 0.73rem;
		font-weight: 700;
		white-space: nowrap;
		cursor: pointer;
		transition:
			background-color 140ms ease,
			color 140ms ease;
	}

	.ses-view-btn:hover:not(.is-active) {
		color: var(--d-ink);
		background: var(--d-surface-2);
	}

	.ses-view-btn.is-active {
		background: var(--d-ink);
		color: var(--d-bg);
	}

	/* ── Mode Galeri Visual ── */
	.ses-gal-grid {
		display: grid;
		gap: 12px;
		grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
	}

	.ses-gal-skel {
		height: 310px;
		border-radius: 14px;
		background: var(--d-surface-2);
	}

	.ses-gal-card {
		display: flex;
		flex-direction: column;
		border: 1px solid var(--d-border);
		border-radius: 14px;
		background: var(--d-surface);
		overflow: hidden;
		transition:
			border-color 150ms ease,
			box-shadow 180ms ease;
	}

	.ses-gal-card:hover {
		border-color: var(--d-border-strong);
		box-shadow: var(--d-shadow);
	}

	.ses-gal-media {
		position: relative;
		width: 100%;
		height: 224px;
		padding: 12px;
		border: none;
		background: var(--d-bg);
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		overflow: hidden;
	}

	.ses-gal-media img {
		max-width: 100%;
		max-height: 100%;
		width: auto;
		height: auto;
		border-radius: 5px;
		box-shadow: var(--d-shadow);
		transition: transform 200ms ease;
	}

	.ses-gal-media:hover img {
		transform: scale(1.03);
	}

	.ses-gal-badge {
		position: absolute;
		top: 9px;
		left: 9px;
		padding: 2px 8px;
		border-radius: 999px;
		background: rgba(15, 23, 42, 0.72);
		color: #ffffff;
		font-size: 0.66rem;
		font-weight: 700;
		backdrop-filter: blur(6px);
	}

	.ses-gal-foot {
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding: 10px 12px 11px;
		border-top: 1px solid var(--d-border);
	}

	.ses-gal-frame {
		margin: 0;
		font-size: 0.72rem;
		color: var(--d-muted);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.ses-gal-acts {
		display: flex;
		align-items: center;
		gap: 5px;
		margin-top: 6px;
	}

	.ses-gal-btn {
		flex: 1;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 5px;
		height: 28px;
		padding: 0 8px;
		border: 1px solid var(--d-border);
		border-radius: 7px;
		background: var(--d-surface-2);
		color: var(--d-ink);
		font-family: var(--font-body);
		font-size: 0.7rem;
		font-weight: 700;
		cursor: pointer;
		transition:
			background-color 140ms ease,
			border-color 140ms ease;
	}

	.ses-gal-btn:hover {
		background: var(--d-surface-hover);
		border-color: var(--d-border-strong);
	}

	.ses-gal-icon {
		width: 28px;
		height: 28px;
		border: 1px solid var(--d-border);
		border-radius: 7px;
		background: var(--d-surface-2);
		color: var(--d-ink);
		display: grid;
		place-items: center;
		text-decoration: none;
		flex-shrink: 0;
		transition:
			background-color 140ms ease,
			border-color 140ms ease;
	}

	.ses-gal-icon:hover {
		background: var(--d-surface-hover);
		border-color: var(--d-border-strong);
	}

	/* ── Paginasi (Batasan per Halaman) ── */
	.ses-pager {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 10px 14px;
		padding: 10px 14px;
		border: 1px solid var(--d-border);
		border-radius: 12px;
		background: var(--d-surface);
	}

	.ses-pager-info {
		font-size: 0.75rem;
		color: var(--d-muted);
	}

	.ses-pager-info strong {
		color: var(--d-ink);
		font-weight: 700;
	}

	.ses-pager-right {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
	}

	.ses-page-btns {
		display: inline-flex;
		align-items: center;
		gap: 4px;
	}

	.ses-page-btn {
		min-width: 32px;
		height: 32px;
		padding: 0 8px;
		border: 1px solid var(--d-border);
		border-radius: 8px;
		background: var(--d-surface-2);
		color: var(--d-ink);
		font-family: var(--font-body);
		font-size: 0.74rem;
		font-weight: 700;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		transition:
			background-color 130ms ease,
			border-color 130ms ease,
			opacity 130ms ease;
	}

	.ses-page-btn.is-sm {
		min-width: 28px;
		height: 28px;
		padding: 0 6px;
	}

	.ses-page-btn:hover:not(:disabled):not(.is-active) {
		background: var(--d-surface-hover);
		border-color: var(--d-border-strong);
	}

	.ses-page-btn.is-active {
		border-color: var(--d-ink);
		background: var(--d-ink);
		color: var(--d-bg);
	}

	.ses-page-btn:disabled {
		opacity: 0.38;
		cursor: not-allowed;
	}

	.ses-page-dots {
		padding: 0 4px;
		font-size: 0.75rem;
		color: var(--d-muted);
	}

	.ses-list-pager {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		padding: 8px 12px;
		border-top: 1px solid var(--d-border);
		background: var(--d-surface);
	}

	.ses-list-pager-meta,
	.ses-list-pager-num {
		font-size: 0.7rem;
		font-weight: 700;
		color: var(--d-muted);
		padding: 0 4px;
	}

	/* ── Master-Detail Split ── */
	.ses-split {
		display: grid;
		gap: 14px;
		grid-template-columns: 1fr;
		align-items: start;
	}

	/* ── Panel Kiri: Daftar Sesi Super Compact ── */
	.ses-panel-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		padding: 10px 13px;
		border-bottom: 1px solid var(--d-border);
	}

	.ses-panel-title {
		margin: 0;
		font-size: 0.8rem;
		font-weight: 800;
		color: var(--d-ink);
	}

	.ses-count-chip {
		padding: 2px 8px;
		border-radius: 999px;
		background: var(--d-surface-2);
		color: var(--d-muted);
		font-size: 0.68rem;
		font-weight: 700;
	}

	.ses-scroll {
		max-height: 64dvh;
		overflow-y: auto;
	}

	.ses-row {
		width: 100%;
		display: flex;
		flex-direction: column;
		gap: 3px;
		padding: 9px 13px;
		border: none;
		border-bottom: 1px solid var(--d-border);
		border-left: 3px solid transparent;
		background: transparent;
		color: var(--d-ink);
		text-align: left;
		cursor: pointer;
		transition:
			background-color 120ms ease,
			border-color 120ms ease;
	}

	.ses-row:last-child {
		border-bottom: none;
	}

	.ses-row:hover {
		background: var(--d-surface-hover);
	}

	.ses-row.is-active {
		background: var(--d-surface-2);
		border-left-color: var(--d-accent);
	}

	.ses-row-line {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		min-width: 0;
	}

	.ses-row-id {
		font-size: 0.8rem;
		font-weight: 800;
		color: var(--d-ink);
		white-space: nowrap;
	}

	.ses-row-time {
		font-size: 0.69rem;
		color: var(--d-muted);
		white-space: nowrap;
		flex-shrink: 0;
	}

	.ses-row-frame {
		font-size: 0.72rem;
		color: var(--d-muted);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		min-width: 0;
	}

	.ses-row-count {
		font-size: 0.69rem;
		font-weight: 700;
		color: var(--d-ink);
		opacity: 0.78;
		white-space: nowrap;
		flex-shrink: 0;
	}

	/* ── Panel Kanan: Inspektor Ringkas ── */
	.ses-detail-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		padding: 11px 16px;
		border-bottom: 1px solid var(--d-border);
	}

	.ses-detail-ident {
		display: flex;
		align-items: center;
		gap: 8px;
		min-width: 0;
	}

	.ses-step-group {
		display: inline-flex;
		align-items: center;
		gap: 4px;
	}

	.ses-detail-title {
		margin: 0;
		font-size: 0.94rem;
		font-weight: 800;
		letter-spacing: -0.015em;
		color: var(--d-ink);
	}

	.ses-detail-actions {
		display: flex;
		align-items: center;
		gap: 6px;
		flex-shrink: 0;
	}

	.ses-confirm-group {
		display: inline-flex;
		align-items: center;
		gap: 4px;
	}

	.ses-act-btn {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		height: 30px;
		padding: 0 11px;
		border: 1px solid var(--d-border);
		border-radius: 8px;
		background: var(--d-surface-2);
		color: var(--d-ink);
		font-family: var(--font-body);
		font-size: 0.73rem;
		font-weight: 700;
		text-decoration: none;
		white-space: nowrap;
		cursor: pointer;
		transition:
			background-color 140ms ease,
			border-color 140ms ease,
			opacity 140ms ease;
	}

	.ses-act-btn:hover:not(:disabled) {
		border-color: var(--d-border-strong);
		background: var(--d-surface-hover);
	}

	.ses-act-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.ses-act-btn.is-primary {
		border-color: var(--d-ink);
		background: var(--d-ink);
		color: var(--d-bg);
	}

	.ses-act-btn.is-primary:hover {
		opacity: 0.9;
		background: var(--d-ink);
	}

	.ses-act-btn.is-danger-solid {
		border-color: var(--d-err);
		background: var(--d-err);
		color: #ffffff;
	}

	.ses-act-btn.is-danger-solid:hover:not(:disabled) {
		opacity: 0.9;
		background: var(--d-err);
	}

	.ses-icon-btn {
		width: 30px;
		height: 30px;
		border: 1px solid var(--d-border);
		border-radius: 8px;
		background: var(--d-surface-2);
		color: var(--d-ink);
		display: grid;
		place-items: center;
		cursor: pointer;
		transition:
			background-color 140ms ease,
			border-color 140ms ease,
			color 140ms ease;
	}

	.ses-icon-btn:hover:not(:disabled) {
		border-color: var(--d-border-strong);
		background: var(--d-surface-hover);
	}

	.ses-icon-btn:disabled {
		opacity: 0.35;
		cursor: not-allowed;
	}

	.ses-icon-btn.is-danger {
		color: var(--d-err);
		background: transparent;
		border-color: color-mix(in srgb, var(--d-err) 35%, var(--d-border));
	}

	.ses-icon-btn.is-danger:hover {
		background: var(--d-err-soft);
		border-color: var(--d-err);
	}

	/* ── Sub-Tab Garis Bawah ── */
	.ses-subtabs {
		display: flex;
		align-items: center;
		gap: 18px;
		padding: 0 16px;
		border-bottom: 1px solid var(--d-border);
		overflow-x: auto;
	}

	.ses-subtab {
		position: relative;
		padding: 9px 2px;
		border: none;
		background: transparent;
		color: var(--d-muted);
		font-family: var(--font-body);
		font-size: 0.78rem;
		font-weight: 700;
		white-space: nowrap;
		cursor: pointer;
		transition: color 140ms ease;
	}

	.ses-subtab:hover {
		color: var(--d-ink);
	}

	.ses-subtab.is-active {
		color: var(--d-ink);
	}

	.ses-subtab.is-active::after {
		content: '';
		position: absolute;
		left: 0;
		right: 0;
		bottom: -1px;
		height: 2px;
		border-radius: 2px;
		background: var(--d-accent);
	}

	.ses-notice-wrap {
		padding: 10px 16px 0;
	}

	.ses-notice-link {
		color: inherit;
		font-weight: 800;
		text-decoration: underline;
		white-space: nowrap;
	}

	.ses-detail-body {
		padding: 14px 16px 16px;
	}

	/* ── Tab 1: Strip Final (Berdampingan: Pratinjau + Rail Info di Kanan) ── */
	.ses-strip-layout {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 232px;
		gap: 14px;
		align-items: stretch;
	}

	.ses-strip-stage {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 16px;
		border: 1px solid var(--d-border);
		border-radius: 12px;
		background: var(--d-bg);
		min-height: 360px;
	}

	.ses-strip-img {
		max-width: 100%;
		max-height: 410px;
		width: auto;
		height: auto;
		border-radius: 6px;
		box-shadow: var(--d-shadow);
	}

	.ses-info-rail {
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		gap: 14px;
		padding: 12px 14px;
		border: 1px solid var(--d-border);
		border-radius: 12px;
		background: var(--d-bg);
	}

	.ses-dl {
		margin: 0;
		display: flex;
		flex-direction: column;
	}

	.ses-dl-row {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 8px 0;
		border-bottom: 1px solid var(--d-border);
	}

	.ses-dl-row:first-child {
		padding-top: 0;
	}

	.ses-dl-row:last-child {
		padding-bottom: 0;
		border-bottom: none;
	}

	.ses-dl-row dt {
		font-size: 0.68rem;
		font-weight: 600;
		color: var(--d-muted);
	}

	.ses-dl-row dd {
		margin: 0;
		font-size: 0.78rem;
		font-weight: 700;
		color: var(--d-ink);
		line-height: 1.35;
	}

	.ses-rail-actions {
		display: flex;
		flex-direction: column;
		gap: 7px;
		padding-top: 10px;
		border-top: 1px solid var(--d-border);
	}

	.ses-rail-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 7px;
		width: 100%;
		height: 34px;
		padding: 0 12px;
		border: 1px solid var(--d-border);
		border-radius: 8px;
		background: var(--d-surface);
		color: var(--d-ink);
		font-family: var(--font-body);
		font-size: 0.75rem;
		font-weight: 700;
		cursor: pointer;
		transition:
			background-color 140ms ease,
			border-color 140ms ease,
			opacity 140ms ease;
	}

	.ses-rail-btn:hover:not(:disabled) {
		background: var(--d-surface-2);
		border-color: var(--d-border-strong);
	}

	.ses-rail-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.ses-rail-btn.is-primary {
		border-color: var(--d-ink);
		background: var(--d-ink);
		color: var(--d-bg);
	}

	.ses-rail-btn.is-primary:hover {
		opacity: 0.9;
		background: var(--d-ink);
	}

	/* ── Tab 2: Spotlight Foto bergaya Halaman Review ── */
	.ses-rv-layout {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 12px;
		user-select: none;
	}

	.ses-rv-stage {
		width: 100%;
		height: clamp(270px, 44dvh, 410px);
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 12px;
	}

	.ses-rv-slot {
		flex: 1;
		min-width: 0;
		min-height: 0;
		height: 100%;
		container-type: size;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.ses-rv-card {
		position: relative;
		width: min(100cqw, calc(100cqh * var(--photo-ar, 1.3333)));
		height: min(100cqh, calc(100cqw / var(--photo-ar, 1.3333)));
		border: 1px solid var(--d-border);
		border-radius: 16px;
		background: var(--d-bg);
		overflow: hidden;
		touch-action: pan-y;
		box-shadow: var(--d-shadow);
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.ses-rv-hit {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		padding: 0;
		border: none;
		background: transparent;
		cursor: zoom-in;
		outline: none;
		will-change: transform, opacity;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.ses-rv-hit:focus-visible {
		outline: 2.5px solid var(--d-ink);
		outline-offset: -3px;
		border-radius: 16px;
	}

	.ses-rv-img {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.ses-rv-counter {
		position: absolute;
		top: 12px;
		left: 12px;
		z-index: 2;
		padding: 5px 12px;
		border: 1px solid rgba(255, 255, 255, 0.18);
		border-radius: 999px;
		background: rgba(15, 23, 42, 0.68);
		color: #ffffff;
		font-size: 0.72rem;
		font-weight: 700;
		backdrop-filter: blur(10px);
		-webkit-backdrop-filter: blur(10px);
		pointer-events: none;
	}

	.ses-rv-dl {
		position: absolute;
		top: 12px;
		right: 12px;
		z-index: 2;
		display: inline-flex;
		align-items: center;
		gap: 6px;
		min-height: 32px;
		padding: 0 12px;
		border: 1px solid rgba(255, 255, 255, 0.22);
		border-radius: 999px;
		background: rgba(15, 23, 42, 0.68);
		color: #ffffff;
		font-family: var(--font-body);
		font-size: 0.72rem;
		font-weight: 700;
		backdrop-filter: blur(10px);
		-webkit-backdrop-filter: blur(10px);
		cursor: pointer;
		outline: none;
		transition:
			background-color 150ms ease,
			transform 130ms ease;
	}

	.ses-rv-dl:hover {
		background: rgba(15, 23, 42, 0.88);
		transform: translateY(-1px);
	}

	.ses-rv-dl:active {
		transform: scale(0.97);
	}

	.ses-rv-autobar {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		height: 3px;
		background: rgba(255, 255, 255, 0.22);
		overflow: hidden;
		pointer-events: none;
		z-index: 2;
	}

	.ses-rv-autofill {
		display: block;
		width: 100%;
		height: 100%;
		background: #ffffff;
		opacity: 0.9;
		transform-origin: left center;
		animation: sesRvProgress linear forwards;
	}

	@keyframes sesRvProgress {
		from {
			transform: scaleX(0);
		}
		to {
			transform: scaleX(1);
		}
	}

	.ses-rv-arrow {
		flex-shrink: 0;
		width: 38px;
		height: 38px;
		border: 1px solid var(--d-border-strong);
		border-radius: 999px;
		background: var(--d-surface-2);
		color: var(--d-ink);
		display: inline-flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		outline: none;
		transition:
			border-color 150ms ease,
			background-color 150ms ease,
			transform 130ms ease;
	}

	.ses-rv-arrow:hover {
		border-color: var(--d-ink);
		transform: scale(1.05);
	}

	.ses-rv-arrow:active {
		transform: scale(0.95);
	}

	.ses-rv-thumbs {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		max-width: 100%;
		padding: 3px 2px;
		overflow-x: auto;
	}

	.ses-rv-thumb {
		position: relative;
		flex-shrink: 0;
		height: 62px;
		aspect-ratio: 4 / 3;
		padding: 0;
		border: 2px solid var(--d-border);
		border-radius: 10px;
		background: var(--d-surface-2);
		overflow: hidden;
		cursor: pointer;
		outline: none;
		opacity: 0.65;
		transition:
			opacity 150ms ease,
			border-color 150ms ease,
			transform 150ms ease,
			box-shadow 150ms ease;
	}

	.ses-rv-thumb:hover {
		opacity: 0.94;
		border-color: var(--d-border-strong);
		transform: translateY(-2px);
	}

	.ses-rv-thumb.is-active {
		opacity: 1;
		border-color: var(--d-ink);
		box-shadow: var(--d-shadow);
		transform: translateY(-2px);
	}

	.ses-rv-thumb img {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.ses-rv-thumb-num {
		position: absolute;
		top: 4px;
		left: 4px;
		min-width: 18px;
		height: 18px;
		padding: 0 4px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border-radius: 999px;
		background: rgba(15, 23, 42, 0.72);
		color: #ffffff;
		font-size: 0.62rem;
		font-weight: 700;
		pointer-events: none;
	}

	.ses-photo-dl {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 3px 7px;
		border: 1px solid var(--d-border);
		border-radius: 6px;
		background: var(--d-surface);
		color: var(--d-ink);
		font-family: var(--font-body);
		font-size: 0.69rem;
		font-weight: 700;
		cursor: pointer;
	}

	.ses-photo-dl:hover {
		background: var(--d-surface-2);
		border-color: var(--d-border-strong);
	}

	/* ── Tab 3: QR Galeri (Fokus QR Besar di Tengah) ── */
	.ses-qr-panel {
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		gap: 12px;
		padding: 22px 18px;
		border: 1px solid var(--d-border);
		border-radius: 12px;
		background: var(--d-bg);
	}

	.ses-qr-box {
		width: clamp(248px, 34vw, 316px);
		aspect-ratio: 1;
		padding: 14px;
		border: 1px solid var(--d-border);
		border-radius: 16px;
		background: #ffffff;
		color: #0f172a;
		box-shadow: var(--d-shadow);
		display: grid;
		place-items: center;
	}

	.ses-qr-img {
		width: 100%;
		height: 100%;
		object-fit: contain;
		image-rendering: pixelated;
		display: block;
	}

	.ses-qr-skel {
		width: 100%;
		height: 100%;
		border-radius: 8px;
		background: #e2e8f0;
	}

	.ses-qr-hint {
		margin: 2px 0 0;
		font-size: 0.78rem;
		font-weight: 600;
		color: var(--d-muted);
	}

	.ses-qr-url-box {
		max-width: 100%;
		padding: 6px 12px;
		border: 1px solid var(--d-border);
		border-radius: 8px;
		background: var(--d-surface);
		color: var(--d-ink);
		font-size: 0.73rem;
		font-weight: 600;
		word-break: break-all;
	}

	.ses-qr-actions {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 7px;
	}

	/* ── Tab 4: Timelapse ── */
	.ses-tl-grid {
		display: grid;
		gap: 12px;
		grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
	}

	.ses-tl-card {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 10px;
		border: 1px solid var(--d-border);
		border-radius: 12px;
		background: var(--d-bg);
	}

	.ses-tl-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
	}

	.ses-tl-label {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-size: 0.74rem;
		font-weight: 700;
		color: var(--d-ink);
	}

	.ses-tl-media {
		width: 100%;
		max-height: 300px;
		border-radius: 8px;
		object-fit: contain;
		background: #000000;
	}

	/* ── Empty & Skeleton ── */
	.ses-empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 6px;
		padding: 32px 16px;
		text-align: center;
		color: var(--d-muted);
	}

	.ses-empty.is-tall {
		min-height: 380px;
	}

	.ses-empty-title {
		margin: 2px 0 0;
		font-size: 0.84rem;
		font-weight: 800;
		color: var(--d-ink);
	}

	.ses-empty-desc {
		max-width: 36ch;
		font-size: 0.76rem;
		line-height: 1.45;
	}

	.ses-skel-list {
		padding: 10px;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.ses-skel-row {
		height: 46px;
		border-radius: 8px;
		background: var(--d-surface-2);
	}

	.ses-detail-loading {
		padding: 16px;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.ses-skel-bar {
		height: 40px;
		border-radius: 8px;
		background: var(--d-surface-2);
	}

	.ses-skel-stage {
		height: 340px;
		border-radius: 12px;
		background: var(--d-surface-2);
	}

	/* ── Modal Inspektor Galeri ── */
	.ses-modal {
		position: fixed;
		inset: 0;
		z-index: 80;
		display: grid;
		place-items: center;
		padding: 18px;
	}

	.ses-modal-backdrop {
		position: absolute;
		inset: 0;
		border: none;
		background: rgba(0, 0, 0, 0.62);
		backdrop-filter: blur(4px);
		-webkit-backdrop-filter: blur(4px);
		cursor: pointer;
	}

	.ses-modal-dialog {
		position: relative;
		z-index: 1;
		width: min(94vw, 860px);
		max-height: 90dvh;
		overflow-y: auto;
		box-shadow: 0 24px 64px rgba(0, 0, 0, 0.45);
	}

	/* ── Lightbox ── */
	.ses-lightbox {
		position: fixed;
		inset: 0;
		z-index: 95;
		display: grid;
		place-items: center;
		padding: 20px;
	}

	.ses-lightbox-backdrop {
		position: absolute;
		inset: 0;
		border: none;
		background: rgba(0, 0, 0, 0.78);
		cursor: pointer;
	}

	.ses-lightbox-dialog {
		position: relative;
		z-index: 1;
		max-width: min(92vw, 900px);
		max-height: 90dvh;
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding: 12px;
		border: 1px solid var(--d-border-strong);
		border-radius: 14px;
		background: var(--d-surface);
		box-shadow: var(--d-shadow);
	}

	.ses-lightbox-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
	}

	.ses-lightbox-title {
		font-size: 0.82rem;
		font-weight: 800;
		color: var(--d-ink);
	}

	.ses-lightbox-actions {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.ses-lightbox-img {
		max-width: 100%;
		max-height: calc(90dvh - 74px);
		object-fit: contain;
		border-radius: 8px;
		background: #000000;
	}

	@media (prefers-reduced-motion: reduce) {
		.ses-spin.is-spinning,
		.ses-rv-autofill {
			animation: none;
		}
		.ses-rv-dl,
		.ses-rv-arrow,
		.ses-rv-thumb {
			transition: none;
		}
	}

	/* ── Responsif ── */
	@media (min-width: 860px) {
		.ses-split {
			grid-template-columns: 268px minmax(0, 1fr);
		}
	}

	@media (max-width: 1080px) {
		.ses-kpi-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}

	@media (max-width: 720px) {
		.ses-strip-layout {
			grid-template-columns: minmax(0, 1fr);
		}
	}

	@media (max-width: 600px) {
		.ses-controls {
			width: 100%;
			justify-content: space-between;
		}

		.ses-range-seg {
			flex: 1 1 auto;
		}

		.ses-range-btn {
			flex: 1;
			padding: 0 8px;
		}

		.ses-kpi-grid {
			grid-template-columns: minmax(0, 1fr);
		}

		.ses-rv-stage {
			position: relative;
			gap: 0;
			height: 260px;
		}

		.ses-rv-arrow {
			position: absolute;
			top: 50%;
			transform: translateY(-50%);
			z-index: 3;
			width: 32px;
			height: 32px;
			background: rgba(15, 23, 42, 0.68);
			border-color: rgba(255, 255, 255, 0.22);
			color: #ffffff;
		}

		.ses-rv-arrow.is-prev {
			left: 8px;
		}

		.ses-rv-arrow.is-next {
			right: 8px;
		}

		.ses-rv-thumb {
			height: 52px;
		}
	}
</style>
