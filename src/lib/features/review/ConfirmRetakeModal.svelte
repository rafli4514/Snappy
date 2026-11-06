<script lang="ts">
	import { createEventDispatcher } from 'svelte';

	const dispatch = createEventDispatcher<{ confirm: void }>();

	let dialog: HTMLDialogElement;

	/** Jumlah foto yang akan terhapus; 0 = tampilkan kalimat umum. */
	export let count = 0;

	export function open(): void {
		dialog.showModal();
	}

	function yes(): void {
		dialog.close();
		dispatch('confirm');
	}
</script>

<dialog bind:this={dialog} class="confirm-modal" aria-labelledby="retake-all-title">
	<div class="confirm-box">
		<div class="confirm-icon" aria-hidden="true">
			<svg
				viewBox="0 0 24 24"
				width="26"
				height="26"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<path d="M1 4v6h6" />
				<path d="M23 20v-6h-6" />
				<path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4-4.64 4.36A9 9 0 0 1 3.51 15" />
			</svg>
		</div>
		<h2 id="retake-all-title" class="confirm-title font-display">Ambil Ulang Semua?</h2>
		<p class="confirm-body">
			{count > 0
				? `Semua ${count} foto yang sudah diambil akan dihapus, `
				: 'Semua foto yang sudah diambil akan dihapus, '}lalu sesi jepret dimulai dari awal.
		</p>
		<p class="confirm-note font-mono">Foto tidak bisa dikembalikan</p>
		<div class="confirm-actions">
			<form method="dialog">
				<button type="submit" class="ghost-btn font-mono">Batal</button>
			</form>
			<button type="button" class="capsule-btn font-mono" on:click={yes}>
				<svg
					viewBox="0 0 24 24"
					width="13"
					height="13"
					fill="none"
					stroke="currentColor"
					stroke-width="2.5"
					stroke-linecap="round"
					stroke-linejoin="round"
					aria-hidden="true"
				>
					<path d="M1 4v6h6" />
					<path d="M3.51 15a9 9 0 1 0 .49-5.5" />
				</svg>
				Ya, Ambil Ulang
			</button>
		</div>
	</div>
</dialog>

<style>
	.confirm-modal {
		border: none;
		padding: 0;
		background: transparent;
	}

	.confirm-modal::backdrop {
		background: var(--veil-mid, rgba(11, 10, 9, 0.82));
	}

	.confirm-box {
		width: min(92vw, 440px);
		padding: 28px 26px 24px;
		background: var(--bg);
		border: 1px solid var(--hairline);
		border-radius: 18px;
		color: var(--fg);
		box-shadow: 0 24px 60px rgba(11, 10, 9, 0.45);
		text-align: center;
	}

	.confirm-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 56px;
		height: 56px;
		margin: 0 auto 16px;
		border-radius: 50%;
		background: color-mix(in srgb, var(--fg) 7%, transparent);
		color: var(--fg);
	}

	.confirm-title {
		margin: 0 0 8px;
		color: var(--fg);
		font-size: 1.5rem;
		font-weight: 500;
		letter-spacing: 0.01em;
	}

	.confirm-body {
		margin: 0 auto 14px;
		max-width: 34ch;
		font-size: 0.9rem;
		line-height: 1.6;
		color: var(--fg-dim);
		text-wrap: balance;
	}

	.confirm-note {
		display: inline-block;
		margin: 0 0 20px;
		padding: 5px 12px;
		border-radius: 999px;
		border: 1px solid var(--hairline);
		font-size: 0.56rem;
		font-weight: 700;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		color: var(--fg-dim);
	}

	.confirm-actions {
		display: flex;
		justify-content: center;
		gap: 10px;
	}

	.confirm-actions form {
		display: contents;
	}

	/* Target sentuh minimum 44px (kios layar sentuh) */
	.ghost-btn,
	.capsule-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		min-height: 44px;
		padding: 0 18px;
		border-radius: 999px;
		font-size: 0.68rem;
		font-weight: 700;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		cursor: pointer;
		transition:
			transform 120ms ease,
			border-color 160ms ease,
			background-color 200ms ease,
			color 200ms ease;
	}

	.ghost-btn {
		border: 1px solid transparent;
		background: transparent;
		color: var(--fg-dim);
	}

	.ghost-btn:hover {
		color: var(--fg);
		border-color: var(--hairline);
	}

	/* Kapsul berinversi: isi vs latar saling menukar nilai */
	.capsule-btn {
		border: none;
		background: var(--fg);
		color: var(--bg);
	}

	.capsule-btn:hover {
		background: transparent;
		color: var(--fg);
		box-shadow: inset 0 0 0 2px var(--fg);
	}

	.ghost-btn:active,
	.capsule-btn:active {
		transform: scale(0.97);
	}

	.ghost-btn:focus-visible,
	.capsule-btn:focus-visible {
		outline: 2.5px solid var(--focus);
		outline-offset: 3px;
	}
</style>
