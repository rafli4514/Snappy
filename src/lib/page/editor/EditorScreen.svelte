<script lang="ts">
  import { onMount } from 'svelte';
  import {
    session,
    goTo,
    setCustomTemplate,
    swapPhotos,
    movePhoto
  } from '#lib/stores/session';
  import { PRODUK, renderStripPreview } from '#lib/utils/canvas';
  import {
    CATALOG_TEMPLATES
  } from '#lib/data/stripTemplates';
  import CustomTemplateBuilder from '#lib/features/editor/CustomTemplateBuilder.svelte';
  import TemplateLibraryModal from '#lib/features/editor/TemplateLibraryModal.svelte';
  import { getAllCustomTemplates } from '#lib/utils/customTemplateStorage';
  import type { CustomTemplate } from '#lib/types';

  let canvas: HTMLCanvasElement;

  $: theme = $session.theme;
  $: photos = $session.photos;
  $: photoCount = $session.photoCount;
  $: customTemplateData = $session.customTemplateData;
  $: caption = $session.caption;
  $: showDate = $session.showDate;

  $: activeTemplate = customTemplateData || $session.selectedTemplate;

  // ── Tab katalog: Cocok (default) · Template Saya · Semua ──
  type CatalogTab = 'cocok' | 'mine' | 'all';
  let activeTab: CatalogTab = 'cocok';

  interface GridTemplate {
    id: string;
    name: string;
    previewSvg: string;
    /** Jumlah slot alami; `adaptive` = artwork mengikuti jumlah foto apa pun. */
    slotCount: number;
    adaptive: boolean;
    isUser: boolean;
    matched: boolean;
    badge?: string;
    userTmpl?: CustomTemplate;
  }

  let customTemplatesList: CustomTemplate[] = [];

  /** Preview SVG mini untuk template buatan user (bg + bentuk slot bernomor). */
  function customPreviewSvg(t: CustomTemplate): string {
    const W = 100;
    const H = 270;
    const shapes = (t.slots || [])
      .map((s, i) => {
        const num = `<text x="${((s.x + s.width / 2) * W).toFixed(1)}" y="${((s.y + s.height / 2) * H + 4).toFixed(1)}" font-family="'Inter', sans-serif" font-size="20" font-weight="800" fill="#555" text-anchor="middle">${i + 1}</text>`;
        if (s.type === 'circle') {
          const cx = (s.x + s.width / 2) * W;
          const cy = (s.y + s.height / 2) * H;
          const r = Math.max(4, Math.min(s.width * W, s.height * H) / 2);
          return `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r.toFixed(1)}" fill="#DDDDDD"/>${num}`;
        }
        if (s.type === 'polygon' && Array.isArray(s.points) && s.points.length >= 3) {
          const pts = s.points
            .map((p) => `${(p.x * W).toFixed(1)},${(p.y * H).toFixed(1)}`)
            .join(' ');
          return `<polygon points="${pts}" fill="#DDDDDD"/>${num}`;
        }
        return `<rect x="${(s.x * W).toFixed(1)}" y="${(s.y * H).toFixed(1)}" width="${(s.width * W).toFixed(1)}" height="${(s.height * H).toFixed(1)}" rx="4" fill="#DDDDDD"/>${num}`;
      })
      .join('');
    return `<svg viewBox="0 0 ${W} ${H}" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg"><rect width="${W}" height="${H}" fill="${t.backgroundColor || '#FFFFFF'}"/>${shapes}</svg>`;
  }

  $: presetGrid = CATALOG_TEMPLATES.map((t): GridTemplate => {
    const adaptive = t.slotCount === undefined;
    return {
      id: t.id,
      name: t.name,
      previewSvg: t.previewSvg,
      slotCount: t.slotCount ?? photoCount,
      adaptive,
      isUser: false,
      matched: adaptive || t.slotCount === photoCount,
      badge: t.badge
    };
  });

  $: userGrid = customTemplatesList.map((t): GridTemplate => ({
    id: t.id,
    name: t.name,
    previewSvg: customPreviewSvg(t),
    slotCount: (t.slots || []).length,
    adaptive: false,
    isUser: true,
    matched: (t.slots || []).length === photoCount,
    userTmpl: t
  }));

  $: allTemplates = [...userGrid, ...presetGrid];
  $: visibleTemplates = activeTab === 'cocok'
    ? allTemplates.filter((t) => t.matched)
    : activeTab === 'mine'
      ? userGrid
      : allTemplates;

  // ── Preferensi workspace ──
  let showSlotNumbers = true;
  let canvasZoom = 1;
  const ZOOM_MIN = 0.5;
  const ZOOM_MAX = 2.5;

  function zoomIn(): void {
    canvasZoom = Math.min(ZOOM_MAX, Math.round(canvasZoom * 1.2 * 100) / 100);
  }
  function zoomOut(): void {
    canvasZoom = Math.max(ZOOM_MIN, Math.round((canvasZoom / 1.2) * 100) / 100);
  }
  function zoomFit(): void {
    canvasZoom = 1;
  }

  // ── Drag & drop reorder (fallback sentuh: tombol ▲▼) ──
  let draggedIdx: number | null = null;
  let dropTargetIdx: number | null = null;
  let dropAfter = false;

  function handleDragStart(e: DragEvent, index: number): void {
    draggedIdx = index;
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(index));
    }
  }

  function handleDragOver(e: DragEvent, index: number): void {
    if (draggedIdx === null) return;
    e.preventDefault();
    e.dataTransfer && (e.dataTransfer.dropEffect = 'move');
    dropTargetIdx = index;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    dropAfter = e.clientY > rect.top + rect.height / 2;
  }

  function handleDragLeave(index: number): void {
    if (dropTargetIdx === index) dropTargetIdx = null;
  }

  function handleDrop(e: DragEvent, index: number): void {
    e.preventDefault();
    if (draggedIdx !== null && draggedIdx !== index) {
      let toIdx = dropAfter ? index + 1 : index;
      if (draggedIdx < toIdx) toIdx -= 1;
      movePhoto(draggedIdx, toIdx);
      renderPreview();
    }
    draggedIdx = null;
    dropTargetIdx = null;
  }

  function handleDragEnd(): void {
    draggedIdx = null;
    dropTargetIdx = null;
  }

  // ── Render pratinjau strip ──
  $: if (canvas && photos.length) {
    renderPreview();
  }

  $: activeTemplate, caption, showDate, showSlotNumbers, canvas && renderPreview();

  async function renderPreview(): Promise<void> {
    if (!canvas) return;
    const p = PRODUK[$session.photoCount] || PRODUK[4];
    canvas.width = Math.round(p.pxW / 2);
    canvas.height = Math.round(p.pxH / 2);
    canvas.style.aspectRatio = `${p.pxW} / ${p.pxH}`;
    if (p.sheetOrient === 'landscape') {
      canvas.style.height = 'clamp(230px, 30vh, 320px)';
    } else {
      canvas.style.height = '';
    }
    await renderStripPreview(canvas, photos, activeTemplate, { caption, showDate, showSlotNumbers });
  }

  onMount(async () => {
    await refreshCustomTemplates();
    if (!customTemplateData) {
      // Template awal: preset pertama yang cocok jumlah slotnya dengan sesi
      const initialTmpl =
        CATALOG_TEMPLATES.find((t) => t.slotCount === undefined || t.slotCount === photoCount) ||
        CATALOG_TEMPLATES[0];
      if (initialTmpl) {
        setCustomTemplate(initialTmpl.buildTemplate(photoCount));
      }
    }
    await renderPreview();
  });

  async function refreshCustomTemplates(): Promise<void> {
    try {
      customTemplatesList = await getAllCustomTemplates();
    } catch (e) {
      console.error('Error refreshing custom templates:', e);
    }
  }

  function selectGridTemplate(item: GridTemplate): void {
    if (!item.matched) return;
    if (item.isUser && item.userTmpl) {
      setCustomTemplate(item.userTmpl);
    } else {
      const preset = CATALOG_TEMPLATES.find((t) => t.id === item.id);
      if (preset) setCustomTemplate(preset.buildTemplate(photoCount));
    }
    renderPreview();
  }

  function isSelected(item: GridTemplate): boolean {
    return customTemplateData ? customTemplateData.id === item.id : false;
  }

  function togglePanel(): void {
    isPanelCollapsed = !isPanelCollapsed;
  }

  let isPanelCollapsed = false;

  // Custom template modal states
  let showBuilderModal = false;
  let builderEditingTemplate: CustomTemplate | null = null;
  let showLibraryModal = false;

  // Photo zoom modal
  let previewPhotoUrl: string | null = null;
  let previewPhotoIndex: number | null = null;

  function openPhotoPreview(url: string, index: number): void {
    previewPhotoUrl = url;
    previewPhotoIndex = index;
  }

  function closePhotoPreview(): void {
    previewPhotoUrl = null;
    previewPhotoIndex = null;
  }

  function handleNext(): void {
    goTo('print');
  }

  function handleCustomTemplateSaved(savedTemplate: CustomTemplate): void {
    showBuilderModal = false;
    setCustomTemplate(savedTemplate);
    refreshCustomTemplates();
    renderPreview();
  }

  function handleSelectLibraryCustom(tmpl: CustomTemplate): void {
    setCustomTemplate(tmpl);
    showLibraryModal = false;
    renderPreview();
  }

  function openCreateCustomTemplate(): void {
    builderEditingTemplate = null;
    showBuilderModal = true;
    showLibraryModal = false;
  }
</script>

<section
  class="editor-screen screen-enter kiosk-scope"
  class:theme-light={theme === 'light'}
  aria-label="Desain Strip Foto"
>
  <!-- Top Navigation Header — minimal -->
  <header class="editor-head">
    <button
      type="button"
      class="head-back-btn"
      on:click={() => goTo('review')}
      aria-label="Kembali ke review foto"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M15 18l-6-6 6-6" />
      </svg>
    </button>

    <h1 class="editor-head-title font-display">Design Strip</h1>

    <span class="head-balance" aria-hidden="true"></span>
  </header>

  <!-- Main 3-Column Stage -->
  <div class="editor-stage" class:is-collapsed={isPanelCollapsed}>
    <!-- 1. LEFT COLUMN: Captured Photos Sidebar — drag & drop reorder -->
    <aside class="photos-column" aria-label="Koleksi foto sesi">
      <div class="photos-scroll" role="list">
        {#each photos as photo, i}
          <div
            class="photo-cell"
            class:is-dragging={draggedIdx === i}
            class:drop-above={dropTargetIdx === i && !dropAfter}
            class:drop-below={dropTargetIdx === i && dropAfter}
            draggable="true"
            on:dragstart={(e) => handleDragStart(e, i)}
            on:dragover={(e) => handleDragOver(e, i)}
            on:dragleave={() => handleDragLeave(i)}
            on:drop={(e) => handleDrop(e, i)}
            on:dragend={handleDragEnd}
            role="listitem"
          >
            <button
              type="button"
              class="photo-cell-btn"
              on:click={() => openPhotoPreview(photo, i)}
              aria-label="Perbesar foto nomor {i + 1}"
            >
              <img src={photo} alt="Foto {i + 1}" class="photo-cell-img" />
              <span class="photo-tag font-mono">#{i + 1}</span>
            </button>

            <!-- Overlay kios layar sentuh: tukar posisi tanpa drag -->
            <div class="photo-cell-tools">
              <button
                type="button"
                class="swap-btn"
                disabled={i === 0}
                on:click={() => { swapPhotos(i, i - 1); renderPreview(); }}
                aria-label="Geser foto {i + 1} ke urutan {i}"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <polyline points="18 15 12 9 6 15"/>
                </svg>
              </button>
              <button
                type="button"
                class="swap-btn"
                disabled={i === photos.length - 1}
                on:click={() => { swapPhotos(i, i + 1); renderPreview(); }}
                aria-label="Geser foto {i + 1} ke urutan {i + 2}"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </button>
            </div>
          </div>
        {/each}
      </div>
    </aside>

    <!-- 2. CENTER COLUMN: Big Strip Canvas Preview -->
    <main class="strip-column" aria-label="Pratinjau strip foto">
      <div class="strip-center-box">
        <div class="strip-paper-frame">
          <div class="strip-canvas-zoom" style="transform: scale({canvasZoom});">
            <canvas
              bind:this={canvas}
              class="strip-canvas"
              width="300"
              height="900"
              aria-label="Photo strip canvas"
            ></canvas>
          </div>
        </div>
      </div>

      <!-- Pill melayang: nomor slot · zoom -->
      <div class="canvas-fab" role="group" aria-label="Kontrol kanvas">
        <button
          type="button"
          class="fab-btn font-mono"
          class:is-active={showSlotNumbers}
          on:click={() => { showSlotNumbers = !showSlotNumbers; renderPreview(); }}
          aria-pressed={showSlotNumbers}
          aria-label="Tampilkan nomor slot di kanvas"
        >
          123
        </button>
        <span class="fab-sep" aria-hidden="true"></span>
        <button type="button" class="fab-btn" on:click={zoomOut} aria-label="Perkecil kanvas" disabled={canvasZoom <= ZOOM_MIN}>−</button>
        <button type="button" class="fab-btn fab-level font-mono" on:click={zoomFit} aria-label="Kembalikan kanvas ke ukuran pas">
          {Math.round(canvasZoom * 100)}%
        </button>
        <button type="button" class="fab-btn" on:click={zoomIn} aria-label="Perbesar kanvas" disabled={canvasZoom >= ZOOM_MAX}>+</button>
      </div>

      <!-- Collapse / Expand chevron button on boundary -->
      <button
        type="button"
        class="stage-chevron-btn"
        on:click={togglePanel}
        aria-label={isPanelCollapsed ? 'Tampilkan panel template' : 'Sembunyikan panel template'}
        title={isPanelCollapsed ? 'Tampilkan Template' : 'Sembunyikan Panel'}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          {#if isPanelCollapsed}
            <polyline points="15 18 9 12 15 6"/>
          {:else}
            <polyline points="9 18 15 12 9 6"/>
          {/if}
        </svg>
      </button>
    </main>

    <!-- 3. RIGHT COLUMN: Template Inspector & NEXT -->
    {#if !isPanelCollapsed}
      <aside class="templates-column" aria-label="Pilih desain strip">
        <!-- Tab: Cocok (N Foto) · Template Saya · Semua -->
        <div class="categories-header" role="tablist" aria-label="Filter katalog template">
          <button
            type="button"
            class="category-pill font-mono"
            class:is-active={activeTab === 'cocok'}
            on:click={() => activeTab = 'cocok'}
            role="tab"
            aria-selected={activeTab === 'cocok'}
          >
            Cocok ({photoCount} Foto)
          </button>
          <button
            type="button"
            class="category-pill font-mono"
            class:is-active={activeTab === 'mine'}
            on:click={() => activeTab = 'mine'}
            role="tab"
            aria-selected={activeTab === 'mine'}
          >
            Template Saya ({userGrid.length})
          </button>
          <button
            type="button"
            class="category-pill font-mono"
            class:is-active={activeTab === 'all'}
            on:click={() => activeTab = 'all'}
            role="tab"
            aria-selected={activeTab === 'all'}
          >
            Semua
          </button>
        </div>

        <!-- Quick create: builder terprekonfigurasi N slot -->
        <div class="create-template-row">
          <button
            type="button"
            class="create-template-btn font-mono"
            on:click={openCreateCustomTemplate}
          >
            + Buat Template ({photoCount} Foto)
          </button>
        </div>

        <!-- Template Grid -->
        <div class="templates-grid-scroll">
          <div class="templates-grid" role="group" aria-label="Daftar template pilihan">
            {#each visibleTemplates as item (item.id)}
              <button
                type="button"
                class="template-card"
                class:is-selected={isSelected(item)}
                class:is-locked={!item.matched}
                on:click={() => selectGridTemplate(item)}
                aria-label="{item.name}{item.matched ? '' : ' — butuh ' + item.slotCount + ' foto'}"
                aria-pressed={isSelected(item)}
                disabled={!item.matched}
              >
                <div class="template-aspect">
                  {@html item.previewSvg}
                  <span class="template-slot-badge font-mono">
                    {item.adaptive ? 'SEMUA' : item.slotCount + ' SLOT'}
                  </span>
                  {#if item.isUser}
                    <span class="template-user-badge font-mono">SAYA</span>
                  {/if}
                  {#if item.badge}
                    <span class="template-badge font-mono">{item.badge}</span>
                  {/if}
                </div>
              </button>
            {/each}

            {#if visibleTemplates.length === 0}
              <p class="empty-catalog font-mono">Belum ada template di tab ini — buat lewat tombol di atas.</p>
            {/if}
          </div>
        </div>

        <!-- Bottom Action Button: LANJUT CETAK -->
        <footer class="templates-footer">
          <button
            type="button"
            id="btn-next"
            class="capsule-cta font-mono"
            on:click={handleNext}
          >
            LANJUT CETAK
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </footer>
      </aside>
    {/if}
  </div>
</section>

<!-- Photo Zoom Modal Dialog -->
{#if previewPhotoUrl}
  <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-noninteractive-element-interactions -->
  <dialog class="zoom-dialog" open on:click={closePhotoPreview}>
    <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
    <div class="zoom-box" on:click|stopPropagation role="document">
      <div class="zoom-box-head font-mono">
        <span>FOTO #{(previewPhotoIndex ?? 0) + 1}</span>
        <button type="button" class="zoom-close-btn" on:click={closePhotoPreview} aria-label="Tutup pratinjau">
          ✕
        </button>
      </div>
      <div class="zoom-box-img">
        <img src={previewPhotoUrl} alt="Foto #{(previewPhotoIndex ?? 0) + 1}" class="zoom-img" />
      </div>
    </div>
  </dialog>
{/if}

<!-- Custom Template Builder Modal -->
{#if showBuilderModal}
  <CustomTemplateBuilder
    initialTemplate={builderEditingTemplate}
    initialSlotCount={photoCount}
    onClose={() => { showBuilderModal = false; }}
    onSaveAndApply={handleCustomTemplateSaved}
  />
{/if}

<!-- Custom Template Library Modal -->
{#if showLibraryModal}
  <TemplateLibraryModal
    onClose={() => { showLibraryModal = false; }}
    onSelectTemplate={handleSelectLibraryCustom}
    onEditTemplate={(tmpl) => {
      builderEditingTemplate = tmpl;
      showLibraryModal = false;
      showBuilderModal = true;
    }}
    onCreateNew={openCreateCustomTemplate}
  />
{/if}

<style>
  /* ==========================================================================
     Editor Screen — Snappy / DiStudio Kiosk Theme Integration
     Uses --bg, --fg, --fg-dim, --hairline, --ring-line, --focus tokens.
     ========================================================================== */

  .editor-screen {
    position: relative;
    height: 100dvh;
    height: 100vh;
    display: flex;
    flex-direction: column;
    background: var(--bg);
    color: var(--fg);
    overflow: hidden;
    user-select: none;
    transition: background-color 220ms ease, color 220ms ease;
  }

  /* ── Header ── */
  .editor-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 52px;
    padding: 0 18px;
    border-bottom: 1px solid var(--ring-line);
    background: var(--bg);
    flex-shrink: 0;
    z-index: 20;
    transition: background-color 220ms ease, border-color 220ms ease;
  }

  .editor-head-title {
    margin: 0;
    font-size: 1.15rem;
    font-weight: 500;
    color: var(--fg);
    letter-spacing: 0.01em;
  }

  .head-back-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    padding: 0;
    border: none;
    border-radius: 999px;
    background: transparent;
    color: var(--fg-dim);
    cursor: pointer;
    transition: color 140ms ease, background-color 140ms ease;
  }

  .head-back-btn:hover {
    color: var(--fg);
    background: var(--ring-line);
  }

  .head-back-btn:focus-visible {
    outline: 2.5px solid var(--focus);
    outline-offset: 2px;
  }

  .head-balance {
    width: 44px;
    height: 44px;
    flex-shrink: 0;
  }

  /* ── Capsule CTA (Identitas Kios Snappy) ── */
  .capsule-cta {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    width: 100%;
    min-height: 44px;
    padding: 0 24px;
    border: none;
    border-radius: 999px;
    background: var(--fg);
    color: var(--bg);
    font-size: 0.72rem;
    font-weight: 800;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    cursor: pointer;
    transition: background-color 200ms ease, color 200ms ease, box-shadow 200ms ease, transform 160ms ease;
  }

  .capsule-cta:hover {
    background: transparent;
    color: var(--fg);
    box-shadow: inset 0 0 0 2px var(--fg), 0 0 0 5px var(--halo-h);
    transform: translateY(-2px);
  }

  .capsule-cta:active {
    transform: translateY(0) scale(0.98);
  }

  .capsule-cta:focus-visible {
    outline: 2.5px solid var(--focus);
    outline-offset: 4px;
  }

  /* ── 3-Column Kiosk Stage ── */
  .editor-stage {
    flex: 1;
    display: grid;
    grid-template-columns: 200px 1fr 370px;
    height: calc(100vh - 52px);
    height: calc(100dvh - 52px);
    overflow: hidden;
    transition: grid-template-columns 220ms ease;
  }

  .editor-stage.is-collapsed {
    grid-template-columns: 200px 1fr 0px;
  }

  /* ── 1. KOLOM KIRI: Foto Sesi (drag & drop reorder) ── */
  .photos-column {
    background: var(--bg);
    border-right: 1px solid var(--ring-line);
    overflow-y: auto;
    padding: 12px 12px;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  .photos-scroll {
    display: flex;
    flex-direction: column;
    gap: 10px;
    overflow-y: auto;
  }

  .photo-cell {
    position: relative;
    width: 100%;
    cursor: grab;
  }

  .photo-cell.is-dragging {
    opacity: 0.55;
  }

  .photo-cell.drop-above {
    box-shadow: 0 -3px 0 0 var(--fg);
  }

  .photo-cell.drop-below {
    box-shadow: 0 3px 0 0 var(--fg);
  }

  .photo-cell-btn {
    position: relative;
    width: 100%;
    aspect-ratio: 4 / 3;
    padding: 0;
    border: 1.5px solid var(--hairline);
    border-radius: 10px;
    overflow: hidden;
    background: var(--veil-edge);
    cursor: pointer;
    display: block;
    transition: border-color 160ms ease, transform 160ms ease, opacity 160ms ease;
  }

  .photo-cell-btn:hover {
    border-color: var(--fg);
    transform: scale(1.02);
  }

  .photo-cell-btn:focus-visible {
    outline: 2.5px solid var(--focus);
    outline-offset: 2px;
  }

  .photo-cell-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  .photo-tag {
    position: absolute;
    top: 6px;
    left: 6px;
    background: var(--bg);
    color: var(--fg);
    border: 1px solid var(--hairline);
    border-radius: 4px;
    font-size: 0.62rem;
    font-weight: 800;
    padding: 1px 6px;
    pointer-events: none;
  }

  /* Overlay tukar posisi — kaca tipis di atas thumbnail, target sentuh 44px */
  .photo-cell-tools {
    position: absolute;
    right: 6px;
    bottom: 6px;
    display: flex;
    gap: 4px;
    z-index: 2;
  }

  .swap-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    padding: 0;
    border: 1px solid var(--ring-line);
    border-radius: 8px;
    background: color-mix(in srgb, var(--bg) 72%, transparent);
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
    color: var(--fg);
    cursor: pointer;
    transition: color 160ms ease, border-color 160ms ease, background-color 160ms ease;
  }

  .swap-btn:hover:not(:disabled) {
    border-color: var(--fg);
    background: color-mix(in srgb, var(--bg) 90%, transparent);
  }

  .swap-btn:disabled {
    opacity: 0.3;
    cursor: default;
  }

  .swap-btn:focus-visible {
    outline: 2.5px solid var(--focus);
    outline-offset: 2px;
  }

  /* ── 2. KOLOM TENGAH: Preview Strip ── */
  .strip-column {
    position: relative;
    background: var(--bg);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    padding: 18px;
    min-height: 0;
  }

  /* ── Pill melayang kanvas: nomor slot · zoom ── */
  .canvas-fab {
    position: absolute;
    right: 20px;
    bottom: 20px;
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 4px;
    border-radius: 999px;
    border: 1px solid var(--hairline);
    background: var(--bg);
    box-shadow: 0 12px 32px rgba(11, 10, 9, 0.28);
    z-index: 12;
  }

  .theme-light .canvas-fab {
    box-shadow: 0 12px 32px rgba(28, 25, 23, 0.14);
  }

  .fab-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 44px;
    min-height: 44px;
    padding: 0 10px;
    border: none;
    border-radius: 999px;
    background: transparent;
    color: var(--fg-dim);
    font-size: 0.82rem;
    font-weight: 800;
    cursor: pointer;
    transition: color 140ms ease, background-color 140ms ease;
  }

  .fab-btn:hover:not(:disabled) {
    color: var(--fg);
    background: var(--ring-line);
  }

  .fab-btn:disabled {
    opacity: 0.3;
    cursor: default;
  }

  .fab-btn:focus-visible {
    outline: 2.5px solid var(--focus);
    outline-offset: 2px;
  }

  .fab-btn.is-active {
    background: var(--fg);
    color: var(--bg);
  }

  .fab-btn.is-active:hover {
    background: var(--fg);
    color: var(--bg);
  }

  .fab-level {
    font-size: 0.64rem;
    letter-spacing: 0.08em;
    color: var(--fg);
  }

  .fab-sep {
    width: 1px;
    height: 20px;
    background: var(--hairline);
    margin: 0 2px;
    flex-shrink: 0;
  }

  .strip-center-box {
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 1;
    width: 100%;
    min-height: 0;
  }

  .strip-paper-frame {
    position: relative;
    height: clamp(360px, 78dvh, 760px);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .strip-canvas-zoom {
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: transform 180ms ease;
  }

  .strip-canvas {
    height: 100%;
    width: auto;
    aspect-ratio: 1 / 3;
    border-radius: 8px;
    box-shadow:
      0 24px 60px rgba(11, 10, 9, 0.45),
      0 4px 16px rgba(11, 10, 9, 0.25),
      0 0 0 1px var(--ring-line);
    display: block;
    object-fit: contain;
    transition: box-shadow 220ms ease;
  }

  .theme-light .strip-canvas {
    box-shadow:
      0 24px 60px rgba(28, 25, 23, 0.16),
      0 4px 16px rgba(28, 25, 23, 0.08),
      0 0 0 1px var(--ring-line);
  }

  .stage-chevron-btn {
    position: absolute;
    right: 12px;
    top: 50%;
    transform: translateY(-50%);
    width: 44px;
    height: 44px;
    border-radius: 50%;
    background: var(--bg);
    border: 1px solid var(--hairline);
    color: var(--fg-dim);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    backdrop-filter: blur(8px);
    transition: color 160ms ease, border-color 160ms ease, transform 160ms ease;
    z-index: 10;
  }

  .stage-chevron-btn:hover {
    color: var(--fg);
    border-color: var(--fg);
    transform: translateY(-50%) scale(1.08);
  }

  .stage-chevron-btn:focus-visible {
    outline: 2.5px solid var(--focus);
    outline-offset: 3px;
  }

  /* ── 3. KOLOM KANAN: Template Inspector & LANJUT CETAK ── */
  .templates-column {
    background: var(--bg);
    border-left: 1px solid var(--ring-line);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    min-height: 0;
  }

  .categories-header {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 8px 10px;
    border-bottom: 1px solid var(--ring-line);
    overflow-x: auto;
    scrollbar-width: none;
    flex-shrink: 0;
  }

  .categories-header::-webkit-scrollbar {
    display: none;
  }

  .category-pill {
    padding: 6px 12px;
    min-height: 44px;
    border-radius: 999px;
    background: transparent;
    border: 1px solid transparent;
    color: var(--fg-dim);
    font-size: 0.62rem;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    cursor: pointer;
    white-space: nowrap;
    transition: all 160ms ease;
  }

  .category-pill:hover {
    color: var(--fg);
    background: var(--ring-line);
  }

  .category-pill.is-active {
    background: var(--fg);
    color: var(--bg);
    border-color: var(--fg);
  }

  .category-pill:focus-visible {
    outline: 2.5px solid var(--focus);
    outline-offset: 2px;
  }

  .create-template-row {
    padding: 8px 10px;
    border-bottom: 1px solid var(--ring-line);
    flex-shrink: 0;
  }

  .create-template-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    width: 100%;
    min-height: 44px;
    padding: 0 12px;
    border: 1px solid var(--hairline);
    border-radius: 8px;
    background: transparent;
    color: var(--fg-dim);
    font-size: 0.6rem;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    cursor: pointer;
    transition: all 160ms ease;
  }

  .create-template-btn:hover {
    color: var(--fg);
    border-color: var(--fg);
    background: var(--ring-line);
  }

  .create-template-btn:focus-visible {
    outline: 2.5px solid var(--focus);
    outline-offset: 3px;
  }

  /* Template Grid */
  .templates-grid-scroll {
    flex: 1;
    overflow-y: auto;
    padding: 10px 8px;
    min-height: 0;
  }

  .templates-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 6px;
  }

  .template-card {
    position: relative;
    border-radius: 8px;
    overflow: hidden;
    background: var(--veil-edge);
    border: 2px solid var(--ring-line);
    cursor: pointer;
    padding: 0;
    display: block;
    transition: transform 160ms ease, border-color 160ms ease, box-shadow 160ms ease, opacity 160ms ease;
  }

  .template-card:hover:not(:disabled) {
    transform: translateY(-2px);
    border-color: var(--hairline);
  }

  .template-card.is-selected {
    border-color: var(--fg);
    box-shadow: 0 0 0 3px var(--halo-h);
    transform: scale(1.02);
  }

  /* Template yang butuh jumlah foto berbeda — tak bisa dipakai */
  .template-card.is-locked {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .template-card:focus-visible {
    outline: 2.5px solid var(--focus);
    outline-offset: 2px;
  }

  .template-aspect {
    width: 100%;
    aspect-ratio: 100 / 270;
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .template-slot-badge,
  .template-user-badge,
  .template-badge {
    position: absolute;
    background: var(--fg);
    color: var(--bg);
    font-size: 7px;
    font-weight: 800;
    padding: 1px 4px;
    border-radius: 3px;
    letter-spacing: 0.05em;
  }

  .template-slot-badge {
    top: 4px;
    left: 4px;
  }

  .template-user-badge {
    top: 4px;
    right: 4px;
    background: var(--focus);
    color: var(--bg);
  }

  .template-badge {
    bottom: 4px;
    right: 4px;
    opacity: 0.85;
  }

  .empty-catalog {
    grid-column: 1 / -1;
    text-align: center;
    font-size: 0.64rem;
    color: var(--fg-dim);
    padding: 20px 10px;
  }

  /* Bottom Actions LANJUT CETAK button */
  .templates-footer {
    padding: 12px 14px 16px;
    border-top: 1px solid var(--ring-line);
    background: var(--bg);
    flex-shrink: 0;
  }

  /* ── Zoom Dialog ── */
  .zoom-dialog {
    border: none;
    padding: 0;
    background: transparent;
    max-width: 100vw;
    max-height: 100dvh;
    margin: auto;
  }

  .zoom-dialog::backdrop {
    background: var(--veil-mid, rgba(11, 10, 9, 0.85));
  }

  .zoom-box {
    width: min(90vw, 560px);
    background: var(--bg);
    border: 1px solid var(--hairline);
    border-radius: 14px;
    overflow: hidden;
    box-shadow: 0 24px 60px rgba(11, 10, 9, 0.5);
  }

  .zoom-box-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 16px;
    font-size: 0.68rem;
    font-weight: 700;
    letter-spacing: 0.18em;
    color: var(--fg);
    border-bottom: 1px solid var(--ring-line);
  }

  .zoom-close-btn {
    min-width: 44px;
    min-height: 44px;
    border-radius: 50%;
    background: transparent;
    border: 1px solid var(--hairline);
    color: var(--fg-dim);
    font-size: 11px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: color 140ms ease, border-color 140ms ease;
  }

  .zoom-close-btn:hover {
    color: var(--fg);
    border-color: var(--fg);
  }

  .zoom-box-img {
    background: #000;
  }

  .zoom-img {
    width: 100%;
    max-height: 72vh;
    object-fit: contain;
    display: block;
  }

  /* ── Responsive Mobile / Small Screen ── */
  @media (max-width: 860px) {
    .editor-stage {
      display: flex;
      flex-direction: column;
      height: auto;
      overflow-y: auto;
    }

    .photos-column {
      width: 100%;
      height: auto;
      overflow-x: auto;
      flex-direction: row;
      border-right: none;
      border-bottom: 1px solid var(--ring-line);
    }

    .photos-scroll {
      flex-direction: row;
      width: max-content;
    }

    .photo-cell {
      width: 120px;
      flex-shrink: 0;
    }

    .strip-column {
      height: 56vh;
      padding: 10px;
    }

    .canvas-fab {
      right: 10px;
      bottom: 10px;
    }

    .templates-column {
      height: 380px;
      border-left: none;
      border-top: 1px solid var(--ring-line);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .editor-screen,
    .fab-btn,
    .capsule-cta,
    .template-card,
    .photo-cell-btn,
    .strip-canvas-zoom {
      transition: none;
    }
  }
</style>
