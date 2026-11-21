<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { session } from '#lib/stores/session';

	const dispatch = createEventDispatcher<{ confirm: void }>();

	let dialog: HTMLDialogElement;

	/** Jumlah foto yang akan terhapus; 0 = tampilkan kalimat umum. */
	export let count = 0;

	export function open(): void {
		dialog.showModal();
	}

	function handleBackdropClick(e: MouseEvent): void {
		if (e.target === dialog) {
			dialog.close();
		}
	}

	function yes(): void {
		dialog.close();
		dispatch('confirm');
	}
</script>

<dialog
	bind:this={dialog}
	class="confirm-modal"
	class:theme-light={$session.theme === 'light'}
	aria-labelledby="retake-all-title"
	on:click={handleBackdropClick}
>
	<div class="confirm-card">
		<div class="card-head">
			<h2 id="retake-all-title" class="title">AMBIL ULANG SEMUA?</h2>
			<form method="dialog">
				<button type="submit" class="close-btn" aria-label="Tutup">
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

		<div class="head-divider" aria-hidden="true"></div>

		<div class="card-body">
			<p class="desc">
				{count > 0
					? `Semua ${count} foto yang sudah diambil akan dihapus, lalu sesi kamera dimulai dari awal.`
					: 'Semua foto yang sudah diambil akan dihapus, lalu sesi kamera dimulai dari awal.'}
			</p>
		</div>

		<div class="card-actions">
			<form method="dialog">
				<button type="submit" class="btn-outline">Batal</button>
			</form>
			<button type="button" class="btn-solid" on:click={yes}> Ya, Ambil Ulang </button>
		</div>
	</div>
</dialog>

<style>
	.confirm-modal {
		--modal-bg: #141210;
		--modal-surface: rgba(251, 247, 240, 0.04);
		--modal-divider: rgba(251, 247, 240, 0.08);
		--modal-fg: #fbf7f0;
		--modal-muted: #a8a29e;
		--modal-border: rgba(251, 247, 240, 0.16);
		--modal-btn-border: rgba(251, 247, 240, 0.28);
		--modal-backdrop: rgba(0, 0, 0, 0.76);
		--modal-focus: rgba(251, 247, 240, 0.9);

		border: none;
		padding: 16px;
		background: transparent;
		margin: auto;
		max-width: 100vw;
		max-height: 100dvh;
		font-family: var(--font-body);
	}

	.confirm-modal.theme-light {
		--modal-bg: #ffffff;
		--modal-surface: #fafafa;
		--modal-divider: #f1f3f5;
		--modal-fg: #0f172a;
		--modal-muted: #64748b;
		--modal-border: #e5e7eb;
		--modal-btn-border: #cbd5e1;
		--modal-backdrop: rgba(15, 23, 42, 0.48);
		--modal-focus: #0f172a;
	}

	.confirm-modal::backdrop {
		background: var(--modal-backdrop);
		backdrop-filter: blur(6px);
		-webkit-backdrop-filter: blur(6px);
	}

	.confirm-card {
		width: min(92vw, 460px);
		padding: 20px 22px 22px;
		background: var(--modal-bg);
		color: var(--modal-fg);
		border: 1.5px solid var(--modal-border);
		border-radius: 16px;
		box-shadow: 0 24px 56px rgba(15, 23, 42, 0.22);
		display: flex;
		flex-direction: column;
		gap: 14px;
	}

	.card-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.close-btn {
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

	.close-btn:hover {
		color: var(--modal-fg);
		border-color: var(--modal-fg);
	}

	.close-btn:active {
		transform: scale(0.94);
	}

	.close-btn:focus-visible {
		outline: 2.5px solid var(--modal-focus);
		outline-offset: 3px;
	}

	.head-divider {
		width: 100%;
		height: 5px;
		border-radius: 999px;
		background: var(--modal-divider);
	}

	.card-body {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 4px 2px;
		text-align: left;
	}

	.eyebrow {
		font-size: 0.68rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--modal-muted);
	}

	.title {
		margin: 0;
		font-size: 1.32rem;
		font-weight: 800;
		letter-spacing: -0.01em;
		line-height: 1.2;
		color: var(--modal-fg);
	}

	.desc {
		margin: 0;
		font-size: 0.88rem;
		line-height: 1.55;
		color: var(--modal-muted);
	}

	.notice-strip {
		margin-top: 6px;
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 11px 14px;
		border: 1px solid var(--modal-border);
		border-radius: 12px;
		background: var(--modal-surface);
		color: var(--modal-muted);
		font-size: 0.78rem;
		font-weight: 600;
	}

	.notice-strip svg {
		flex-shrink: 0;
		color: var(--modal-fg);
	}

	.card-actions {
		display: grid;
		grid-template-columns: 1fr 1.35fr;
		gap: 10px;
		padding-top: 4px;
	}

	.card-actions form {
		display: contents;
	}

	.btn-outline,
	.btn-solid {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		width: 100%;
		min-height: 44px;
		padding: 0 18px;
		border-radius: 999px;
		font-family: var(--font-body);
		font-size: 0.78rem;
		font-weight: 700;
		letter-spacing: 0.04em;
		cursor: pointer;
		transition:
			transform 120ms ease,
			border-color 160ms ease,
			color 160ms ease,
			opacity 160ms ease;
	}

	.btn-outline {
		border: 1px solid var(--modal-btn-border);
		background: transparent;
		color: var(--modal-muted);
	}

	.btn-outline:hover {
		color: var(--modal-fg);
		border-color: var(--modal-fg);
	}

	.btn-solid {
		border: none;
		background: var(--modal-fg);
		color: var(--modal-bg);
	}

	.btn-solid:hover {
		opacity: 0.9;
		transform: translateY(-1px);
	}

	.btn-outline:active,
	.btn-solid:active {
		transform: scale(0.98);
	}

	.btn-outline:focus-visible,
	.btn-solid:focus-visible {
		outline: 2.5px solid var(--modal-focus);
		outline-offset: 3px;
	}

	@media (prefers-reduced-motion: reduce) {
		.close-btn,
		.btn-outline,
		.btn-solid {
			transition: none;
		}
	}

	@media (max-width: 440px) {
		.card-actions {
			grid-template-columns: 1fr;
		}
		.btn-solid {
			order: -1;
		}
	}
</style>
