<script module lang="ts">
	// Tampilkan splash sekali per muat ulang halaman agar tidak mengganggu saat kembali ke awal.
	let splashPlayed = false;

	export function hasSplashPlayed(): boolean {
		return splashPlayed;
	}
</script>

<script lang="ts">
	import { createEventDispatcher, onMount } from 'svelte';
	import { session } from '#lib/stores/session';

	const FULL_TEXT = '“Abadikan momenmu denganku”';
	const START_DELAY_MS = 260;
	const CHAR_INTERVAL_MS = 54;
	const LOGO_DELAY_AFTER_TYPE_MS = 220;
	const HOLD_AFTER_TYPE_MS = 1900;
	const FADE_OUT_MS = 720;

	const dispatch = createEventDispatcher<{ reveal: void; done: void }>();

	let visible = !splashPlayed;
	let leaving = false;
	let typedCount = 0;
	let typingDone = false;
	let showLogo = false;

	let startTimer: ReturnType<typeof setTimeout> | null = null;
	let typeTimer: ReturnType<typeof setInterval> | null = null;
	let logoTimer: ReturnType<typeof setTimeout> | null = null;
	let holdTimer: ReturnType<typeof setTimeout> | null = null;
	let exitTimer: ReturnType<typeof setTimeout> | null = null;

	$: isLight = $session.theme === 'light';
	$: typedText = FULL_TEXT.slice(0, typedCount);

	function clearTimers(): void {
		if (startTimer) clearTimeout(startTimer);
		if (typeTimer) clearInterval(typeTimer);
		if (logoTimer) clearTimeout(logoTimer);
		if (holdTimer) clearTimeout(holdTimer);
		if (exitTimer) clearTimeout(exitTimer);
		startTimer = null;
		typeTimer = null;
		logoTimer = null;
		holdTimer = null;
		exitTimer = null;
	}

	function dismiss(): void {
		if (!visible || leaving) return;
		clearTimers();
		leaving = true;
		splashPlayed = true;
		dispatch('reveal');
		exitTimer = setTimeout(() => {
			visible = false;
			dispatch('done');
		}, FADE_OUT_MS);
	}

	function handleKeyDown(e: KeyboardEvent): void {
		if (!visible) return;
		if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') {
			dismiss();
		}
	}

	onMount(() => {
		if (!visible) return;

		const reduced =
			typeof window !== 'undefined' &&
			window.matchMedia('(prefers-reduced-motion: reduce)').matches;

		if (reduced) {
			typedCount = FULL_TEXT.length;
			typingDone = true;
			showLogo = true;
			holdTimer = setTimeout(dismiss, 1100);
			return clearTimers;
		}

		startTimer = setTimeout(() => {
			typeTimer = setInterval(() => {
				typedCount += 1;
				if (typedCount >= FULL_TEXT.length) {
					if (typeTimer) clearInterval(typeTimer);
					typeTimer = null;
					typingDone = true;
					logoTimer = setTimeout(() => {
						showLogo = true;
					}, LOGO_DELAY_AFTER_TYPE_MS);
					holdTimer = setTimeout(dismiss, HOLD_AFTER_TYPE_MS);
				}
			}, CHAR_INTERVAL_MS);
		}, START_DELAY_MS);

		return clearTimers;
	});
</script>

<svelte:window on:keydown={handleKeyDown} />

{#if visible}
	<button
		type="button"
		class="splash-loader"
		class:is-light={isLight}
		class:is-leaving={leaving}
		aria-label="Memuat DISTUDIO Photobooth, ketuk untuk melewati"
		on:click={dismiss}
	>
		<div class="splash-center" role="status" aria-live="polite">
			<p class="splash-quote" aria-label={FULL_TEXT}>
				<span class="quote-ghost" aria-hidden="true">{FULL_TEXT}</span>
				<span class="quote-typed" aria-hidden="true">
					{typedText}<span class="caret" class:is-done={typingDone}></span>
				</span>
			</p>

			<img
				class="splash-logo"
				class:is-visible={showLogo}
				src="/landingPage/logo.svg"
				alt="DI'STUDIO"
				width="217"
				height="81"
				draggable="false"
			/>
		</div>
	</button>
{/if}

<style>
	.splash-loader {
		position: fixed;
		inset: 0;
		z-index: 999;
		width: 100%;
		height: 100%;
		border: none;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 24px;
		background: #0b0a09;
		color: #fbf7f0;
		user-select: none;
		cursor: pointer;
		outline: none;
		opacity: 1;
		transition: opacity 720ms cubic-bezier(0.22, 1, 0.36, 1);
	}

	.splash-loader.is-light {
		background: #ffffff;
		color: #111827;
	}

	.splash-loader.is-leaving {
		opacity: 0;
		pointer-events: none;
	}

	.splash-center {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: clamp(18px, 3dvh, 28px);
		max-width: min(92vw, 760px);
		transition:
			transform 680ms cubic-bezier(0.22, 1, 0.36, 1),
			opacity 520ms ease;
	}

	.splash-loader.is-leaving .splash-center {
		transform: translateY(-26px) scale(0.96);
		opacity: 0;
	}

	.splash-quote {
		margin: 0;
		display: grid;
		font-family: var(--font-display);
		font-size: clamp(1.25rem, 3.1vw, 2.25rem);
		font-weight: 400;
		line-height: 1.3;
		letter-spacing: -0.01em;
		text-align: center;
	}

	/* Placeholder tak terlihat menjaga posisi tetap di tengah tanpa geser saat mengetik */
	.quote-ghost,
	.quote-typed {
		grid-area: 1 / 1;
	}

	.quote-ghost {
		visibility: hidden;
		pointer-events: none;
	}

	.quote-typed {
		text-align: left;
		white-space: pre-wrap;
	}

	.caret {
		display: inline-block;
		width: 2px;
		height: 1em;
		margin-left: 3px;
		vertical-align: -0.12em;
		background: currentColor;
		animation: caretBlink 0.72s steps(1, end) infinite;
		transition: opacity 280ms ease;
	}

	.caret.is-done {
		opacity: 0;
		animation: none;
	}

	.splash-logo {
		width: clamp(142px, 20vw, 224px);
		height: auto;
		filter: invert(1);
		opacity: 0;
		transform: translateY(12px) scale(0.97);
		transition:
			opacity 620ms ease,
			transform 640ms cubic-bezier(0.22, 1, 0.36, 1);
	}

	.splash-loader.is-light .splash-logo {
		filter: none;
	}

	.splash-logo.is-visible {
		opacity: 1;
		transform: translateY(0) scale(1);
	}

	@keyframes caretBlink {
		0%,
		49% {
			opacity: 1;
		}
		50%,
		100% {
			opacity: 0;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.splash-loader,
		.splash-center,
		.splash-logo,
		.caret {
			transition: none;
			animation: none;
		}
	}
</style>
