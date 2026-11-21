<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { session } from '#lib/stores/session';

	const dispatch = createEventDispatcher<{ retake: number }>();

	let dialog: HTMLDialogElement;
	let url: string | null = null;
	let index = 0;
	let opener: HTMLElement | null = null;

	// `open()` menyimpan pemicunya — saat dialog ditutup fokus
	// dikembalikannya ke sana (R-32).
	export function open(photoUrl: string, photoIndex: number): void {
		url = photoUrl;
		index = photoIndex;
		opener = document.activeElement as HTMLElement | null;
		dialog.showModal();
	}

	function handleClose(): void {
		opener?.focus();
		opener = null;
	}

	function handleBackdropClick(e: MouseEvent): void {
		if (e.target === dialog) {
			dialog.close();
		}
	}

	function retake(): void {
		dialog.close();
		dispatch('retake', index);
	}
</script>

<dialog
	bind:this={dialog}
	class="zoom-modal"
	class:theme-light={$session.theme === 'light'}
	aria-label="Perbesar foto"
	on:close={handleClose}
	on:click={handleBackdropClick}
>
	<div class="zoom-box">
		<div class="zoom-header">
			<span class="zoom-label">Foto {index + 1}</span>
			<form method="dialog">
				<button type="submit" class="zoom-close" aria-label="Tutup">
					<svg
						viewBox="0 0 24 24"
						width="16"
						height="16"
						fill="none"
						stroke="currentColor"
						stroke-width="2.4"
						stroke-linecap="round"
						aria-hidden="true"
					>
						<path d="M6 6l12 12M18 6L6 18" />
					</svg>
				</button>
			</form>
		</div>

		{#if url}
			<div class="zoom-media">
				<img src={url} alt="Perbesar foto {index + 1}" />
			</div>
		{/if}

		<div class="zoom-footer">
			<button type="button" class="zoom-retake" on:click={retake}>
				<svg
					viewBox="0 0 24 24"
					width="14"
					height="14"
					fill="none"
					stroke="currentColor"
					stroke-width="2.2"
					stroke-linecap="round"
					stroke-linejoin="round"
					aria-hidden="true"
				>
					<path d="M1 4v6h6" />
					<path d="M3.51 15a9 9 0 1 0 .49-5.5" />
				</svg>
				Ambil Ulang Foto Ini
			</button>
		</div>
	</div>
</dialog>

<style>
	.zoom-modal {
		--modal-bg: #141210;
		--modal-media-bg: #0b0a09;
		--modal-fg: #fbf7f0;
		--modal-muted: #a8a29e;
		--modal-border: rgba(251, 247, 240, 0.16);
		--modal-btn-border: rgba(251, 247, 240, 0.28);
		--modal-backdrop: rgba(0, 0, 0, 0.78);
		--modal-focus: rgba(251, 247, 240, 0.9);

		border: none;
		padding: 16px;
		background: transparent;
		overflow: visible;
		margin: auto;
		max-width: 100vw;
		max-height: 100dvh;
		font-family: var(--font-body);
	}

	.zoom-modal.theme-light {
		--modal-bg: #ffffff;
		--modal-media-bg: #f8fafc;
		--modal-fg: #0f172a;
		--modal-muted: #64748b;
		--modal-border: #e5e7eb;
		--modal-btn-border: #cbd5e1;
		--modal-backdrop: rgba(15, 23, 42, 0.52);
		--modal-focus: #0f172a;
	}

	.zoom-modal::backdrop {
		background: var(--modal-backdrop);
		backdrop-filter: blur(6px);
		-webkit-backdrop-filter: blur(6px);
	}

	.zoom-box {
		width: min(92vw, 820px);
		padding: 14px;
		background: var(--modal-bg);
		color: var(--modal-fg);
		border: 1px solid var(--modal-border);
		border-radius: 18px;
		box-shadow: 0 24px 60px rgba(0, 0, 0, 0.35);
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.zoom-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0 4px;
	}

	.zoom-label {
		font-size: 0.92rem;
		font-weight: 700;
		letter-spacing: 0.01em;
		color: var(--modal-fg);
	}

	.zoom-close {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 36px;
		height: 36px;
		border: 1px solid var(--modal-border);
		border-radius: 999px;
		background: transparent;
		color: var(--modal-muted);
		cursor: pointer;
		transition:
			color 160ms ease,
			border-color 160ms ease,
			transform 120ms ease;
	}

	.zoom-close:hover {
		color: var(--modal-fg);
		border-color: var(--modal-fg);
	}

	.zoom-close:active {
		transform: scale(0.94);
	}

	.zoom-close:focus-visible {
		outline: 2.5px solid var(--modal-focus);
		outline-offset: 3px;
	}

	.zoom-media {
		border-radius: 12px;
		overflow: hidden;
		background: var(--modal-media-bg);
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.zoom-media img {
		display: block;
		width: 100%;
		height: auto;
		max-height: 70dvh;
		object-fit: contain;
	}

	.zoom-footer {
		display: flex;
		justify-content: center;
	}

	.zoom-retake {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		width: 100%;
		min-height: 44px;
		padding: 0 20px;
		border: 1px solid var(--modal-btn-border);
		border-radius: 999px;
		background: transparent;
		color: var(--modal-fg);
		font-family: var(--font-body);
		font-size: 0.8rem;
		font-weight: 700;
		letter-spacing: 0.04em;
		cursor: pointer;
		transition:
			background-color 160ms ease,
			color 160ms ease,
			border-color 160ms ease,
			transform 120ms ease;
	}

	.zoom-retake:hover {
		background: var(--modal-fg);
		color: var(--modal-bg);
		border-color: var(--modal-fg);
	}

	.zoom-retake:active {
		transform: scale(0.98);
	}

	.zoom-retake:focus-visible {
		outline: 2.5px solid var(--modal-focus);
		outline-offset: 3px;
	}

	@media (prefers-reduced-motion: reduce) {
		.zoom-close,
		.zoom-retake {
			transition: none;
		}
	}
</style>
