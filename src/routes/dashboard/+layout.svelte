<script lang="ts">
	import { page } from '$app/state';
	import type { Snippet } from 'svelte';
	import { session } from '#lib/stores/session';
	import ThemeToggle from '#lib/components/ui/ThemeToggle.svelte';
	import '#lib/features/dashboard/dashboard.css';
	import {
		LayoutDashboard,
		Camera,
		Images,
		Shapes,
		Frame,
		Ruler,
		Sticker,
		SlidersHorizontal,
		Sparkles,
		ListOrdered,
		Printer,
		Cloud,
		Upload,
		Settings,
		PanelLeftClose,
		PanelLeftOpen,
		Menu,
		X,
		ExternalLink,
		ChevronRight,
		type LucideIcon
	} from '@lucide/svelte';

	let { children }: { children?: Snippet } = $props();

	let collapsed = $state(false);
	let mobileOpen = $state(false);

	type SubItem = { href: string; label: string; icon: LucideIcon };
	type NavItem = {
		href: string;
		label: string;
		icon: LucideIcon;
		active: (p: string) => boolean;
		children?: SubItem[];
	};

	const NAV: NavItem[] = [
		{
			href: '/dashboard',
			label: 'Ringkasan',
			icon: LayoutDashboard,
			active: (p: string) => p === '/dashboard'
		},
		{
			href: '/dashboard/sessions',
			label: 'Sesi',
			icon: Camera,
			active: (p: string) => p.startsWith('/dashboard/sessions')
		},
		{
			href: '/dashboard/gallery',
			label: 'Galeri',
			icon: Images,
			active: (p: string) => p.startsWith('/dashboard/gallery')
		},
		{
			href: '/dashboard/assets',
			label: 'Aset',
			icon: Shapes,
			active: (p: string) => p.startsWith('/dashboard/assets'),
			children: [
				{ href: '/dashboard/assets/frames', label: 'Frame Studio', icon: Frame },
				{ href: '/dashboard/assets/frame-sizes', label: 'Ukuran Frame', icon: Ruler },
				{ href: '/dashboard/assets/stickers', label: 'Stiker', icon: Sticker },
				{ href: '/dashboard/assets/filters', label: 'Filter', icon: SlidersHorizontal },
				{ href: '/dashboard/assets/ar', label: 'Efek AR', icon: Sparkles }
			]
		},
		{
			href: '/dashboard/queue',
			label: 'Antrean',
			icon: ListOrdered,
			active: (p: string) => p.startsWith('/dashboard/queue'),
			children: [
				{ href: '/dashboard/queue/print', label: 'Cetak', icon: Printer },
				{ href: '/dashboard/queue/cloud-sync', label: 'Sinkron Cloud', icon: Cloud },
				{ href: '/dashboard/queue/upload', label: 'Unggah', icon: Upload }
			]
		},
		{
			href: '/dashboard/settings',
			label: 'Pengaturan',
			icon: Settings,
			active: (p: string) => p.startsWith('/dashboard/settings')
		}
	];

	const currentPath = $derived(page.url.pathname);
	const isLight = $derived($session.theme === 'light');

	const breadcrumbs = $derived.by(() => {
		const crumbs: { label: string; href: string }[] = [{ label: 'Dashboard', href: '/dashboard' }];
		if (currentPath === '/dashboard') return crumbs;
		for (const item of NAV) {
			if (item.href === '/dashboard') continue;
			if (item.active(currentPath)) {
				crumbs.push({ label: item.label, href: item.href });
				if (item.children) {
					const child = item.children.find(
						(c) => currentPath === c.href || currentPath.startsWith(c.href + '/')
					);
					if (child) crumbs.push({ label: child.label, href: child.href });
				}
				break;
			}
		}
		return crumbs;
	});

	function closeMobile(): void {
		mobileOpen = false;
	}
</script>

<div class="dash-shell" class:theme-light={isLight} class:is-collapsed={collapsed}>
	<!-- Backdrop drawer ponsel -->
	{#if mobileOpen}
		<button
			type="button"
			class="mobile-backdrop"
			aria-label="Tutup menu navigasi"
			onclick={closeMobile}
		></button>
	{/if}

	<!-- Sidebar -->
	<aside class="dash-sidebar" class:is-open={mobileOpen} aria-label="Menu admin">
		<div class="side-head">
			<a class="side-brand" href="/dashboard" onclick={closeMobile} aria-label="DISTUDIO Admin">
				<img
					class="side-logo"
					src="/landingPage/logo.svg"
					alt="DI'STUDIO"
					width="217"
					height="81"
					draggable="false"
				/>
				{#if !collapsed}
					<span class="side-badge">ADMIN</span>
				{/if}
			</a>

			<button
				type="button"
				class="side-toggle desktop-only"
				onclick={() => (collapsed = !collapsed)}
				aria-label={collapsed ? 'Perlebar sidebar' : 'Ringkas sidebar'}
				title={collapsed ? 'Perlebar sidebar' : 'Ringkas sidebar'}
			>
				{#if collapsed}
					<PanelLeftOpen size={17} />
				{:else}
					<PanelLeftClose size={17} />
				{/if}
			</button>

			<button
				type="button"
				class="side-toggle mobile-only"
				onclick={closeMobile}
				aria-label="Tutup sidebar"
			>
				<X size={18} />
			</button>
		</div>

		<nav class="side-nav" aria-label="Navigasi dashboard">
			{#each NAV as item (item.href)}
				{@const isGroupActive = item.active(currentPath)}
				{@const Icon = item.icon}
				<div class="nav-section">
					<a
						class="nav-item"
						class:is-active={isGroupActive}
						href={item.href}
						onclick={closeMobile}
						title={collapsed ? item.label : undefined}
						aria-current={currentPath === item.href ? 'page' : undefined}
					>
						<span class="nav-icon"><Icon size={17} /></span>
						{#if !collapsed}
							<span class="nav-label">{item.label}</span>
						{/if}
					</a>

					{#if item.children?.length && !collapsed}
						<div class="nav-children" aria-label="Submenu {item.label}">
							{#each item.children as child (child.href)}
								{@const ChildIcon = child.icon}
								{@const childActive =
									currentPath === child.href || currentPath.startsWith(child.href + '/')}
								<a
									class="nav-sub"
									class:is-active={childActive}
									href={child.href}
									onclick={closeMobile}
									aria-current={childActive ? 'page' : undefined}
								>
									<ChildIcon size={14} />
									<span>{child.label}</span>
								</a>
							{/each}
						</div>
					{/if}
				</div>
			{/each}
		</nav>

		<div class="side-foot">
			<a class="kiosk-link" href="/" title="Buka Photobooth">
				<ExternalLink size={15} />
				{#if !collapsed}
					<span>Buka Photobooth</span>
				{/if}
			</a>
		</div>
	</aside>

	<!-- Area Utama -->
	<div class="dash-main">
		<header class="dash-topbar">
			<div class="topbar-left">
				<button
					type="button"
					class="mobile-menu-btn"
					onclick={() => (mobileOpen = true)}
					aria-label="Buka menu navigasi"
				>
					<Menu size={18} />
				</button>

				<nav class="breadcrumbs" aria-label="Breadcrumb">
					{#each breadcrumbs as crumb, i (crumb.href)}
						{#if i > 0}
							<ChevronRight size={14} class="crumb-sep" aria-hidden="true" />
						{/if}
						{#if i === breadcrumbs.length - 1}
							<span class="crumb-current">{crumb.label}</span>
						{:else}
							<a class="crumb-link" href={crumb.href}>{crumb.label}</a>
						{/if}
					{/each}
				</nav>
			</div>

			<div class="topbar-right">
				<ThemeToggle inline />
			</div>
		</header>

		<main class="dash-content">
			{@render children?.()}
		</main>
	</div>
</div>

<style>
	.dash-shell {
		--side-w: 248px;
		display: flex;
		min-height: 100dvh;
	}

	.dash-shell.is-collapsed {
		--side-w: 72px;
	}

	.mobile-backdrop {
		position: fixed;
		inset: 0;
		z-index: 40;
		background: rgba(0, 0, 0, 0.52);
		backdrop-filter: blur(4px);
		border: none;
		padding: 0;
	}

	/* ── Sidebar ── */
	.dash-sidebar {
		position: fixed;
		inset: 0 auto 0 0;
		z-index: 50;
		width: var(--side-w);
		display: flex;
		flex-direction: column;
		border-right: 1px solid var(--d-border);
		background: var(--d-surface);
		transition:
			width 180ms ease,
			transform 220ms cubic-bezier(0.22, 1, 0.36, 1);
	}

	.side-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		min-height: 64px;
		padding: 12px 14px;
		border-bottom: 1px solid var(--d-border);
	}

	.is-collapsed .side-head {
		justify-content: center;
		padding: 12px 10px;
	}

	.side-brand {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		text-decoration: none;
		min-width: 0;
	}

	.is-collapsed .side-brand {
		display: none;
	}

	.side-logo {
		display: block;
		width: 96px;
		height: auto;
		filter: invert(1);
		transition: filter 200ms ease;
	}

	.theme-light .side-logo {
		filter: none;
	}

	.side-badge {
		padding: 2px 7px;
		border: 1px solid var(--d-border-strong);
		border-radius: 999px;
		font-size: 0.6rem;
		font-weight: 800;
		letter-spacing: 0.1em;
		color: var(--d-muted);
	}

	.side-toggle {
		width: 36px;
		height: 36px;
		border: 1px solid var(--d-border);
		border-radius: 10px;
		background: transparent;
		color: var(--d-muted);
		display: grid;
		place-items: center;
		cursor: pointer;
		flex-shrink: 0;
		transition:
			color 140ms ease,
			border-color 140ms ease,
			background-color 140ms ease;
	}

	.side-toggle:hover {
		color: var(--d-ink);
		border-color: var(--d-border-strong);
		background: var(--d-surface-2);
	}

	.mobile-only {
		display: none;
	}

	/* Navigasi */
	.side-nav {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		padding: 14px 10px;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.nav-section {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.nav-item {
		display: flex;
		align-items: center;
		gap: 10px;
		min-height: 40px;
		padding: 0 12px;
		border-radius: 11px;
		color: var(--d-muted);
		text-decoration: none;
		font-size: 0.83rem;
		font-weight: 700;
		transition:
			background-color 140ms ease,
			color 140ms ease;
	}

	.is-collapsed .nav-item {
		justify-content: center;
		padding: 0;
	}

	.nav-icon {
		display: grid;
		place-items: center;
		flex-shrink: 0;
	}

	.nav-item:hover {
		background: var(--d-surface-2);
		color: var(--d-ink);
	}

	.nav-item.is-active {
		background: var(--d-ink);
		color: var(--d-bg);
	}

	.nav-children {
		display: flex;
		flex-direction: column;
		gap: 1px;
		margin: 2px 0 6px 18px;
		padding-left: 10px;
		border-left: 1px solid var(--d-border);
	}

	.nav-sub {
		display: flex;
		align-items: center;
		gap: 8px;
		min-height: 34px;
		padding: 0 10px;
		border-radius: 9px;
		color: var(--d-muted);
		text-decoration: none;
		font-size: 0.78rem;
		font-weight: 600;
		transition:
			background-color 140ms ease,
			color 140ms ease;
	}

	.nav-sub:hover {
		background: var(--d-surface-2);
		color: var(--d-ink);
	}

	.nav-sub.is-active {
		background: var(--d-surface-2);
		color: var(--d-ink);
		font-weight: 700;
	}

	/* Footer sidebar */
	.side-foot {
		padding: 12px 10px 14px;
		border-top: 1px solid var(--d-border);
	}

	.kiosk-link {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		min-height: 40px;
		padding: 0 12px;
		border: 1px solid var(--d-border-strong);
		border-radius: 11px;
		background: transparent;
		color: var(--d-ink);
		text-decoration: none;
		font-size: 0.8rem;
		font-weight: 700;
		transition:
			background-color 140ms ease,
			border-color 140ms ease;
	}

	.kiosk-link:hover {
		background: var(--d-surface-2);
		border-color: var(--d-ink);
	}

	/* ── Area Utama & Topbar ── */
	.dash-main {
		flex: 1;
		min-width: 0;
		margin-left: var(--side-w);
		display: flex;
		flex-direction: column;
		transition: margin-left 180ms ease;
	}

	.dash-topbar {
		position: sticky;
		top: 0;
		z-index: 30;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		min-height: 64px;
		padding: 0 28px;
		border-bottom: 1px solid var(--d-border);
		background: color-mix(in srgb, var(--d-surface) 88%, transparent);
		backdrop-filter: blur(12px);
		-webkit-backdrop-filter: blur(12px);
	}

	.topbar-left,
	.topbar-right {
		display: flex;
		align-items: center;
		gap: 10px;
		min-width: 0;
	}

	.mobile-menu-btn {
		display: none;
		width: 38px;
		height: 38px;
		border: 1px solid var(--d-border-strong);
		border-radius: 10px;
		background: transparent;
		color: var(--d-ink);
		place-items: center;
		cursor: pointer;
	}

	.breadcrumbs {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 0.82rem;
		min-width: 0;
		overflow: hidden;
	}

	.crumb-link {
		color: var(--d-muted);
		text-decoration: none;
		font-weight: 600;
		white-space: nowrap;
	}

	.crumb-link:hover {
		color: var(--d-ink);
	}

	.crumb-current {
		color: var(--d-ink);
		font-weight: 800;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.dash-content {
		flex: 1;
		width: 100%;
		max-width: 1280px;
		margin: 0 auto;
		padding: 26px 28px 72px;
	}

	/* ── Tablet / Mobile drawer ── */
	@media (max-width: 960px) {
		.dash-shell,
		.dash-shell.is-collapsed {
			--side-w: 264px;
		}

		.dash-sidebar {
			transform: translateX(-100%);
			box-shadow: var(--d-shadow);
		}

		.dash-sidebar.is-open {
			transform: translateX(0);
		}

		.is-collapsed .side-brand {
			display: inline-flex;
		}

		.desktop-only {
			display: none;
		}

		.mobile-only {
			display: grid;
		}

		.mobile-menu-btn {
			display: grid;
		}

		.dash-main {
			margin-left: 0;
		}

		.dash-topbar {
			padding: 0 16px;
		}

		.dash-content {
			padding: 20px 16px 64px;
		}
	}
</style>
