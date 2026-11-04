<script lang="ts">
	import { onMount } from 'svelte';
	import { session } from '#lib/stores/session';
	import {
		getAllCustomTemplates,
		deleteCustomTemplate,
		duplicateCustomTemplate,
		exportTemplateFile,
		importTemplateFile
	} from '#lib/utils/customTemplateStorage';
	import type { CustomTemplate } from '#lib/types';

	export let onClose: () => void = () => {};
	export let onSelectTemplate: (template: CustomTemplate) => void = () => {};
	export let onEditTemplate: (template: CustomTemplate) => void = () => {};
	export let onCreateNew: () => void = () => {};

	let templates: CustomTemplate[] = [];
	let isLoading = true;
	let importError = '';

	/** Nama berkas panduan SVG per jumlah foto (ukuran nyata PRODUK). */
	const NAMA_BERKAS: Record<number, string> = {
		1: 'bigshot',
		2: 'twoup',
		3: 'threeup',
		4: 'twobytwo',
		5: 'fiveup',
		6: 'sixup'
	};

	onMount(async () => {
		await loadTemplates();
	});

	async function loadTemplates(): Promise<void> {
		isLoading = true;
		try {
			templates = await getAllCustomTemplates();
		} catch (e: unknown) {
			console.error('Failed to load custom templates:', e);
		} finally {
			isLoading = false;
		}
	}

	async function handleDelete(id: string): Promise<void> {
		if (!confirm('Hapus template ini? Tindakan ini tidak bisa dibatalkan.')) return;
		await deleteCustomTemplate(id);
		await loadTemplates();
	}

	async function handleDuplicate(id: string): Promise<void> {
		const copy = await duplicateCustomTemplate(id);
		if (copy) {
			await loadTemplates();
		}
	}

	function handleExport(template: CustomTemplate): void {
		exportTemplateFile(template);
	}

	async function handleImportFile(event: Event): Promise<void> {
		const targetEl = event.target as HTMLInputElement | null;
		const file = (targetEl?.files && targetEl.files[0]) || null;
		if (!file) return;

		importError = '';
		try {
			const imported = await importTemplateFile(file);
			await loadTemplates();
			onSelectTemplate(imported);
		} catch (err: unknown) {
			console.error('Failed to import template package:', err);
			importError =
				'Berkas template tidak valid: ' + (err instanceof Error ? err.message : String(err));
		}
	}
</script>

<div class="library-overlay" role="dialog" aria-modal="true" aria-label="Perpustakaan template">
	<div class="library-card">
		<header class="library-header">
			<div>
				<h2 class="library-title">Template Strip Tersimpan</h2>
				<p class="library-subtitle">Bingkai dan tata letak slot buatanmu, siap dipakai ulang.</p>
			</div>

			<button class="btn btn-ghost btn-sm" on:click={onClose} aria-label="Tutup perpustakaan">
				<svg
					width="20"
					height="20"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					aria-hidden="true"
				>
					<line x1="18" y1="6" x2="6" y2="18" />
					<line x1="6" y1="6" x2="18" y2="18" />
				</svg>
			</button>
		</header>

		<!-- Top Action Bar -->
		<div class="library-toolbar">
			<button id="btn-create-new-template" class="btn btn-primary btn-sm" on:click={onCreateNew}>
				+ Buat Template
			</button>

			<div class="toolbar-right">
				<label for="import-template-file" class="import-label btn btn-secondary btn-sm">
					<svg
						width="15"
						height="15"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						aria-hidden="true"
					>
						<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
						<polyline points="17 8 12 3 7 8" />
						<line x1="12" y1="3" x2="12" y2="15" />
					</svg>
					Impor JSON
				</label>
				<input
					type="file"
					id="import-template-file"
					accept=".json,application/json"
					on:change={handleImportFile}
					class="hidden-file-input"
				/>

				<div class="guide-variants" aria-label="Panduan layout per jumlah foto">
					<span class="guide-variants-label">📥 Panduan ukuran:</span>
					{#each [1, 2, 3, 4, 5, 6] as n (n)}
						<a
							href={`/templates/strip-template-${NAMA_BERKAS[n]}.svg`}
							download={`distudio-strip-${NAMA_BERKAS[n]}.svg`}
							class="btn btn-ghost btn-xs"
							title={`Unduh panduan layout ${n} foto`}>{n}</a
						>
					{/each}
				</div>
			</div>
		</div>

		{#if importError}
			<div class="alert alert-error" role="alert">
				<span>⚠️ {importError}</span>
			</div>
		{/if}

		<!-- Templates Grid -->
		<div class="library-grid">
			{#if isLoading}
				<div class="loading-state">
					<span>Memuat template…</span>
				</div>
			{:else if templates.length === 0}
				<div class="empty-state">
					<p>Belum ada template tersimpan.</p>
					<button class="btn btn-primary btn-sm" on:click={onCreateNew}
						>Buat Template Pertama</button
					>
				</div>
			{:else}
				{#each templates as tmpl (tmpl.id)}
					<div class="template-card" class:active={$session.selectedTemplate === tmpl.id}>
						<button
							type="button"
							class="card-preview-area"
							style="background-color: {tmpl.backgroundColor || '#FFFFFF'};"
							on:click={() => onSelectTemplate(tmpl)}
							aria-label="Pakai {tmpl.name}"
						>
							<!-- Slots wireframe preview -->
							<svg viewBox="0 0 600 1800" class="mini-svg" preserveAspectRatio="none">
								{#if tmpl.slots}
									{#each tmpl.slots as slot, sIdx}
										{#if slot.type === 'polygon' && slot.points}
											<polygon
												points={slot.points.map((p) => `${p.x * 600},${p.y * 1800}`).join(' ')}
												fill="#2563EB33"
												stroke="#2563EB"
												stroke-width="12"
											/>
										{:else}
											<rect
												x={slot.x * 600}
												y={slot.y * 1800}
												width={slot.width * 600}
												height={slot.height * 1800}
												rx="16"
												fill="#2563EB33"
												stroke="#2563EB"
												stroke-width="12"
											/>
										{/if}
									{/each}
								{/if}
							</svg>

							{#if tmpl.artworkDataUrl}
								<img
									src={tmpl.artworkDataUrl}
									alt="Bingkai template"
									class="mini-artwork-overlay"
								/>
							{/if}
						</button>

						<!-- Card Info -->
						<div class="card-info">
							<h4 class="card-name" title={tmpl.name}>{tmpl.name}</h4>
							<p class="card-meta">
								{tmpl.slots?.length || 0} slot · {tmpl.artworkDataUrl
									? 'Dengan bingkai'
									: 'Slot saja'}
							</p>

							<!-- Card Actions -->
							<div class="card-action-bar">
								<button
									class="select-btn btn btn-primary btn-xs"
									on:click={() => onSelectTemplate(tmpl)}
								>
									{$session.selectedTemplate === tmpl.id ? '✓ Dipakai' : 'Pakai'}
								</button>
								<button
									class="btn btn-secondary btn-xs"
									on:click={() => onEditTemplate(tmpl)}
									title="Ubah tata letak & slot"
								>
									Ubah
								</button>
								<button
									class="btn btn-ghost btn-xs"
									on:click={() => handleDuplicate(tmpl.id)}
									title="Duplikat template"
								>
									Salin
								</button>
								<button
									class="btn btn-ghost btn-xs"
									on:click={() => handleExport(tmpl)}
									title="Ekspor JSON"
								>
									Ekspor
								</button>
								<button
									class="delete-btn btn btn-ghost btn-xs"
									on:click={() => handleDelete(tmpl.id)}
									title="Hapus template"
								>
									✕
								</button>
							</div>
						</div>
					</div>
				{/each}
			{/if}
		</div>
	</div>
</div>

<style>
	.library-overlay {
		position: fixed;
		inset: 0;
		z-index: 1000;
		background: rgba(15, 23, 42, 0.7);
		backdrop-filter: blur(6px);
		display: flex;
		align-items: center;
		justify-content: center;
		padding: var(--space-4);
	}

	.library-card {
		background: var(--color-bg);
		width: 100%;
		max-width: 860px;
		max-height: 88vh;
		border-radius: var(--radius-xl);
		border: 1.5px solid var(--color-border);
		box-shadow: var(--shadow-2xl);
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.library-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--space-4) var(--space-5);
		background: var(--color-surface);
		border-bottom: 1.5px solid var(--color-border);
	}

	.library-title {
		font-family: var(--font-display);
		font-size: var(--text-xl);
		font-weight: 700;
		color: var(--color-ink);
		margin: 0;
	}

	.library-subtitle {
		font-size: var(--text-xs);
		color: var(--color-ink-light);
		margin: 4px 0 0 0;
	}

	.library-toolbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--space-3) var(--space-5);
		background: var(--color-bg);
		border-bottom: 1px solid var(--color-border);
		gap: var(--space-3);
		flex-wrap: wrap;
	}

	.toolbar-right {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	.hidden-file-input {
		display: none;
	}

	.guide-variants {
		display: inline-flex;
		align-items: center;
		gap: 2px;
	}

	.guide-variants-label {
		font-size: var(--text-xs);
		font-weight: 600;
		color: var(--color-ink-light);
		margin-right: 4px;
	}

	.import-label {
		cursor: pointer;
		display: flex;
		align-items: center;
		gap: 6px;
		margin: 0;
	}

	.library-grid {
		flex: 1;
		overflow-y: auto;
		padding: var(--space-5);
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
		gap: var(--space-4);
	}

	.template-card {
		background: var(--color-surface);
		border: 1.5px solid var(--color-border);
		border-radius: var(--radius-lg);
		overflow: hidden;
		display: flex;
		flex-direction: column;
		transition: all 0.2s ease;
	}

	.template-card.active {
		border-color: var(--color-accent);
		box-shadow: 0 0 0 2px var(--color-accent);
	}

	.template-card:hover {
		transform: translateY(-2px);
		box-shadow: var(--shadow-md);
	}

	.card-preview-area {
		width: 100%;
		aspect-ratio: 1 / 1.7;
		position: relative;
		cursor: pointer;
		overflow: hidden;
		border-bottom: 1px solid var(--color-border);
		background: #f1f5f9;
	}

	.mini-svg {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
	}

	.mini-artwork-overlay {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: fill;
		pointer-events: none;
	}

	.card-info {
		padding: var(--space-3);
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.card-name {
		font-size: var(--text-sm);
		font-weight: 700;
		color: var(--color-ink);
		margin: 0;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.card-meta {
		font-size: 11px;
		color: var(--color-muted);
		margin: 0;
	}

	.card-action-bar {
		display: flex;
		align-items: center;
		gap: 4px;
		margin-top: 4px;
	}

	.select-btn {
		flex: 1;
	}

	.btn-xs {
		padding: 3px 8px;
		font-size: 11px;
	}

	.delete-btn {
		color: #dc2626;
	}

	.empty-state,
	.loading-state {
		grid-column: 1 / -1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: var(--space-8);
		color: var(--color-muted);
		gap: var(--space-3);
	}

	.alert-error {
		margin: var(--space-3) var(--space-5) 0 var(--space-5);
		background: #fef2f2;
		color: #dc2626;
		border: 1px solid #fecaca;
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-sm);
		font-size: 11px;
	}
</style>
