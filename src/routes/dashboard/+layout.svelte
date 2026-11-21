<script lang="ts">
	import { page } from '$app/state';
	import type { Snippet } from 'svelte';
	import {
		LayoutDashboard,
		Camera,
		Images,
		Shapes,
		Printer,
		Settings,
		PanelLeftClose,
		PanelLeftOpen,
		type LucideIcon
	} from '@lucide/svelte';

	let { children }: { children?: Snippet } = $props();

	let sidebarHidden = $state(false);

	type NavItem = {
		href: string;
		label: string;
		icon: LucideIcon;
		active: (p: string) => boolean;
		children?: { href: string; label: string }[];
	};

	const NAV: NavItem[] = [
		{
			href: '/dashboard',
			label: 'Dashboard',
			icon: LayoutDashboard,
			active: (p: string) => p === '/dashboard'
		},
		{
			href: '/dashboard/sessions',
			label: 'Session',
			icon: Camera,
			active: (p: string) => p.startsWith('/dashboard/sessions')
		},
		{
			href: '/dashboard/gallery',
			label: 'Gallery',
			icon: Images,
			active: (p: string) => p.startsWith('/dashboard/gallery')
		},
		{
			href: '/dashboard/assets',
			label: 'Asset',
			icon: Shapes,
			active: (p: string) => p.startsWith('/dashboard/assets'),
			children: [
				{ href: '/dashboard/assets/frames', label: 'Frame' },
				{ href: '/dashboard/assets/frame-sizes', label: 'Frame size' },
				{ href: '/dashboard/assets/stickers', label: 'Sticker' },
				{ href: '/dashboard/assets/filters', label: 'Filter' },
				{ href: '/dashboard/assets/ar', label: 'AR' }
			]
		},
		{
			href: '/dashboard/queue',
			label: 'Queue',
			icon: Printer,
			active: (p: string) => p.startsWith('/dashboard/queue'),
			children: [
				{ href: '/dashboard/queue/print', label: 'Print' },
				{ href: '/dashboard/queue/cloud-sync', label: 'Cloud sync' },
				{ href: '/dashboard/queue/upload', label: 'Upload' }
			]
		},
		{
			href: '/dashboard/settings',
			label: 'Setting',
			icon: Settings,
			active: (p: string) => p.startsWith('/dashboard/settings')
		}
	];

	const currentPath = $derived(page.url.pathname);
</script>

<div class="dashboard-shell">
	<aside class="sidebar" class:hidden={sidebarHidden}>
		<div class="sidebar-head">
			<a class="sidebar-brand" href="/dashboard" aria-label="DISTUDIO Dashboard">
				<img class="sidebar-logo" src="/landingPage/logo.svg" alt="" width="217" height="81" />
			</a>
			<button
				type="button"
				class="sidebar-collapse"
				onclick={() => (sidebarHidden = !sidebarHidden)}
				aria-expanded={!sidebarHidden}
				aria-controls="sidebar-nav"
				aria-label={sidebarHidden ? 'Tampilkan sidebar' : 'Sembunyikan sidebar'}
				title={sidebarHidden ? 'Tampilkan sidebar' : 'Sembunyikan sidebar'}
			>
				{#if sidebarHidden}
					<PanelLeftOpen size={18} />
				{:else}
					<PanelLeftClose size={18} />
				{/if}
			</button>
		</div>

		<nav id="sidebar-nav" class="sidebar-nav" aria-label="Navigasi dashboard">
			{#each NAV as item (item.href)}
				{@const groupActive = item.active(currentPath)}
				{@const Icon = item.icon}
				<div class="nav-group">
					<a
						class="sidebar-link"
						class:active={groupActive}
						class:icon-only={sidebarHidden}
						href={item.href}
						aria-label={item.label}
					>
						<Icon size={16} />
						{#if !sidebarHidden}
							<span>{item.label}</span>
						{/if}
					</a>
					{#if item.children?.length}
						<div class="sidebar-subnav" aria-label="Submenu {item.label}">
							{#each item.children as child (child.href)}
								<a
									class="sidebar-sublink"
									class:active={currentPath === child.href ||
										currentPath.startsWith(child.href + '/')}
									class:icon-only={sidebarHidden}
									href={child.href}
									aria-label={child.label}
								>
									{#if !sidebarHidden}
										<span>{child.label}</span>
									{/if}
								</a>
							{/each}
						</div>
					{/if}
				</div>
			{/each}
		</nav>

		<a class="sidebar-kiosk" href="/">Kembali ke kios</a>
	</aside>

	<div class="dashboard-main" class:hidden={sidebarHidden}>
		<div class="dashboard-content">
			{#if sidebarHidden}
				<div class="sidebar-reopen">
					<button
						type="button"
						class="sidebar-reopen-btn"
						onclick={() => (sidebarHidden = false)}
						aria-label="Tampilkan sidebar"
					>
						<PanelLeftOpen size={18} />
					</button>
				</div>
			{/if}
			{@render children?.()}
		</div>
	</div>
</div>

<style>
	.dashboard-shell {
		display: block;
		min-height: 100dvh;
		background: var(--color-base-100);
		color: var(--color-base-content);
	}

	.sidebar {
		display: block;
		border-bottom: 1px solid var(--color-base-300);
		background: var(--color-base-100);
	}

	.sidebar.hidden {
		display: none;
	}

	.sidebar-brand {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 14px;
		text-decoration: none;
		color: var(--color-base-content);
	}

	.sidebar-logo {
		display: block;
		width: 100px;
		height: auto;
	}

	.sidebar-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
	}

	.sidebar-collapse {
		flex-shrink: 0;
		width: 44px;
		height: 44px;
		display: grid;
		place-items: center;
		border: 1px solid var(--color-base-300);
		border-radius: var(--radius-md, 12px);
		background: transparent;
		color: var(--color-base-content);
		cursor: pointer;
	}

	.sidebar-collapse:hover {
		background: var(--color-base-200);
	}

	.sidebar-collapse:focus-visible {
		outline: 2px solid var(--color-primary, #d97706);
		outline-offset: 2px;
	}

	.sidebar-reopen {
		display: flex;
		justify-content: flex-end;
	}

	.sidebar-reopen-btn {
		width: 44px;
		height: 44px;
		display: grid;
		place-items: center;
		border: 1px solid var(--color-base-300);
		border-radius: var(--radius-md, 12px);
		background: transparent;
		color: var(--color-base-content);
		cursor: pointer;
	}

	.sidebar-nav {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-start;
		gap: 4px;
		padding: 0 14px 12px;
	}

	.nav-group {
		display: contents;
	}

	.sidebar-link {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 10px 14px;
		border-radius: var(--radius-pill, 9999px);
		border: 1px solid transparent;
		color: var(--color-base-content);
		text-decoration: none;
		font-size: 0.85rem;
		font-weight: 600;
	}

	.sidebar-link.icon-only {
		justify-content: center;
		padding: 11px 0;
	}

	.sidebar-link.icon-only span {
		display: none;
	}

	.sidebar-link:hover {
		background: var(--color-base-200);
	}

	.sidebar-link.active {
		background: var(--color-base-200);
		border-color: var(--color-base-300);
	}

	.sidebar-subnav {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
		flex-basis: 100%;
		padding: 2px 0 6px;
	}

	.sidebar-sublink {
		flex-shrink: 0;
		padding: 7px 12px;
		border-radius: var(--radius-pill, 9999px);
		color: var(--color-base-content);
		text-decoration: none;
		font-size: 0.78rem;
		font-weight: 600;
		border: 1px solid transparent;
		opacity: 0.85;
	}

	.sidebar-sublink.icon-only {
		justify-content: center;
		padding: 8px 0;
	}

	.sidebar-sublink.icon-only span {
		display: none;
	}

	.sidebar-sublink:hover {
		background: var(--color-base-200);
	}

	.sidebar-sublink.active {
		background: var(--color-base-200);
		border-color: var(--color-base-300);
		opacity: 1;
	}

	.sidebar-kiosk {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-height: 44px;
		margin: 0 14px 14px;
		padding: 10px;
		border-radius: var(--radius-md, 12px);
		border: 1px solid var(--color-base-300);
		background: transparent;
		color: var(--color-base-content);
		text-decoration: none;
		font-size: 0.8rem;
		font-weight: 700;
		text-align: center;
	}

	.dashboard-main {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}

	.dashboard-content {
		flex: 1;
		width: 100%;
		max-width: 1120px;
		margin: 0 auto;
		padding: 24px 20px 96px;
		box-sizing: border-box;
	}

	@media (min-width: 640px) {
		.dashboard-shell {
			display: flex;
			min-height: 100dvh;
		}

		.sidebar {
			position: fixed;
			inset: 0 auto 0 0;
			width: 200px;
			display: flex;
			flex-direction: column;
			border-bottom: none;
			border-right: 1px solid var(--color-base-300);
			padding: 20px 14px;
		}

		.sidebar.hidden {
			display: none;
		}

		.sidebar-brand {
			padding: 4px 10px 18px;
		}

		.sidebar-nav {
			flex-direction: column;
			flex-wrap: nowrap;
			gap: 2px;
			padding: 0;
			overflow: visible;
		}

		.nav-group {
			display: block;
		}

		.sidebar-link {
			display: flex;
			align-items: center;
			gap: 10px;
			padding: 11px 12px;
			border-radius: var(--radius-md, 12px);
			border: 1px solid transparent;
		}

		.sidebar-subnav {
			display: flex;
			flex-direction: column;
			flex-basis: auto;
			gap: 1px;
			padding: 0 0 6px 12px;
		}

		.sidebar-sublink {
			display: block;
			padding: 8px 10px;
			border-radius: var(--radius-md, 12px);
			font-size: 0.8rem;
		}

		.sidebar-kiosk {
			margin: auto 0 0;
		}

		.dashboard-main {
			flex: 1;
			min-width: 0;
			display: flex;
			flex-direction: column;
			margin-left: 200px;
		}

		.dashboard-main.hidden {
			margin-left: 0;
		}

		.dashboard-content {
			padding: 28px 28px 96px;
		}
	}
</style>
