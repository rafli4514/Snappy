<script lang="ts">
  import { onMount } from 'svelte';
  import {
    session,
    goTo,
    setCaption,
    toggleDate,
    setCustomTemplate,
    swapPhotos,
    movePhoto
  } from '#lib/stores/session';
  import { PRODUK, renderStripPreview } from '#lib/utils/canvas';
  import {
    CATALOG_TEMPLATES
  } from '#lib/data/stripTemplates';
  import ThemeToggle from '#lib/components/ui/ThemeToggle.svelte';
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
  $: produk = PRODUK[$session.photoCount] || PRODUK[4];

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

  const todayStr = new Date().toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });

  let enableCaption = Boolean($session.caption);

  function toggleCaptionEnable(): void {
    enableCaption = !enableCaption;
    if (!enableCaption) {
      setCaption('');
    }
  }

  function handleCaption(e: Event): void {
    setCaption((e.currentTarget as HTMLInputElement).value);
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
  let showFiltersDrawer = false;

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
  <!-- Top Navigation Header -->
  <header class="editor-head">
    <button
      type="button"
      class="ghost-cta font-mono"
      on:click={() => goTo('review')}
      aria-label="Kembali ke review foto"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M15 18l-6-6 6-6" />
      </svg>
      <span>Review</span>
    </button>

    <div class="editor-head-center">
      <h1 class="editor-head-title font-display">Design Strip</h1>
      <span class="editor-product-tag font-mono">{produk.nama.toUpperCase()} • {produk.cm} CM</span>
    </div>

    <div class="editor-head-actions">
      <button
        type="button"
        class="ghost-cta font-mono"
        class:is-active={showFiltersDrawer}
        on:click={() => showFiltersDrawer = !showFiltersDrawer}
        aria-label="Pengaturan teks dan tanggal"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="3"/>
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
        </svg>
        <span>Detail</span>
      </button>

      <div class="theme-toggle-wrap">
        <ThemeToggle />
      </div>
    </div>
  </header>

  <!-- Expandable Detail Settings (Date & Caption) -->
  {#if showFiltersDrawer}
    <div class="detail-drawer">
      <div class="detail-drawer-inner">
        <!-- Date Stamp Toggle -->
        <button
          type="button"
          class="drawer-pill font-mono"
          class:is-active={showDate}
          on:click={toggleDate}
        >
          <span class="drawer-check" class:is-checked={showDate}>
            {#if showDate}✓{/if}
          </span>
          <span>Date Stamp ({todayStr})</span>
        </button>

        <!-- Caption Toggle & Input -->
        <button
          type="button"
          class="drawer-pill font-mono"
          class:is-active={enableCaption}
          on:click={toggleCaptionEnable}
        >
          <span class="drawer-check" class:is-checked={enableCaption}>
            {#if enableCaption}✓{/if}
          </span>
          <span>Add Caption</span>
        </button>

        {#if enableCaption}
          <div class="drawer-input-box">
            <input
              type="text"
              class="drawer-text-input font-mono"
              placeholder="Ketik caption strip..."
              value={caption}
              on:input={handleCaption}
              maxlength="30"
              aria-label="Teks caption strip"
            />
            <span class="drawer-count font-mono">{caption.length}/30</span>
          </div>
        {/if}

        <button
          type="button"
          class="drawer-link font-mono"
          on:click={() => { showLibraryModal = true; showFiltersDrawer = false; }}
        >
          Custom Builder ›
        </button>

        <button
          type="button"
          class="drawer-close"
          on:click={() => showFiltersDrawer = false}
          aria-label="Tutup pengaturan"
        >
          ✕
        </button>
      </div>
    </div>
  {/if}

  <!-- Main 3-Column Stage -->
  <div class="editor-stage" class:is-collapsed={isPanelCollapsed}>
    <!-- 1. LEFT COLUMN: Captured Photos Sidebar — drag & drop reorder -->
    <aside class="photos-column" aria-label="Koleksi foto sesi">
      <div class="photos-column-head">
        <span class="column-eyebrow font-mono">FOTO SESI ({photos.length})</span>
        <span class="column-hint font-mono">Tarik foto untuk mengatur urutan slot</span>
      </div>

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
            <div class="photo-cell-main">
              <button
                type="button"
                class="photo-cell-btn"
                on:click={() => openPhotoPreview(photo, i)}
                aria-label="Perbesar foto nomor {i + 1}"
              >
                <img src={photo} alt="Foto {i + 1}" class="photo-cell-img" />
                <span class="photo-tag font-mono">#{i + 1}</span>
              </button>

              <!-- Fallback kios layar sentuh: tukar posisi tanpa drag -->
              <div class="photo-cell-tools">
                <button
                  type="button"
                  class="swap-btn"
                  disabled={i === 0}
                  on:click={() => swapPhotos(i, i - 1)}
                  aria-label="Geser foto {i + 1} ke urutan {i}"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <polyline points="18 15 12 9 6 15"/>
                  </svg>
                </button>
                <button
                  type="button"
                  class="swap-btn"
                  disabled={i === photos.length - 1}
                  on:click={() => swapPhotos(i, i + 1)}
                  aria-label="Geser foto {i + 1} ke urutan {i + 2}"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                </button>
              </div>
            </div>
          </div>
        {/each}
      </div>
    </aside>

    <!-- 2. CENTER COLUMN: Big Strip Canvas Preview -->
    <main class="strip-column" aria-label="Pratinjau strip foto">
      <!-- Toolbar kanvas: nomor slot · zoom · dimensi cetak -->
      <div class="canvas-toolbar">
        <button
          type="button"
          class="tool-pill font-mono"
          class:is-active={showSlotNumbers}
          on:click={() => showSlotNumbers = !showSlotNumbers}
          aria-pressed={showSlotNumbers}
          aria-label="Tampilkan nomor slot di kanvas"
        >
          [123] Nomor Slot
        </button>

        <div class="zoom-group" role="group" aria-label="Zoom kanvas">
          <button type="button" class="zoom-btn" on:click={zoomOut} aria-label="Perkecil kanvas" disabled={canvasZoom <= ZOOM_MIN}>−</button>
          <span class="zoom-level font-mono">{Math.round(canvasZoom * 100)}%</span>
          <button type="button" class="zoom-btn" on:click={zoomIn} aria-label="Perbesar kanvas" disabled={canvasZoom >= ZOOM_MAX}>+</button>
          <button type="button" class="zoom-btn zoom-fit font-mono" on:click={zoomFit} aria-label="Kembalikan kanvas ke ukuran pas">Fit</button>
        </div>

        <span class="dim-tag font-mono">{produk.cm} CM • 300 DPI</span>
      </div>

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

  .editor-head-center {
    display: flex;
    align-items: baseline;
    gap: 10px;
  }

  .editor-head-title {
    margin: 0;
    font-size: 1.15rem;
    font-weight: 500;
    color: var(--fg);
    letter-spacing: 0.01em;
  }

  .editor-product-tag {
    font-size: 0.65rem;
    font-weight: 700;
    letter-spacing: 0.16em;
    color: var(--fg-dim);
  }

  .editor-head-actions {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .theme-toggle-wrap {
    position: relative;
    width: 44px;
    height: 44px;
  }

  /* Override ThemeToggle styling inside editor header to fit nicely */
  .theme-toggle-wrap :global(.theme-toggle) {
    position: static;
    width: 44px;
    height: 44px;
  }

  /* ── Ghost CTA & Capsule CTA (Identitas Kios Snappy) ── */
  .ghost-cta {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    min-height: 44px;
    padding: 0 14px;
    border: 1px solid var(--hairline);
    border-radius: 999px;
    background: transparent;
    color: var(--fg-dim);
    font-size: 0.66rem;
    font-weight: 700;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    cursor: pointer;
    transition: color 160ms ease, border-color 160ms ease, background-color 160ms ease, transform 120ms ease;
  }

  .ghost-cta:hover,
  .ghost-cta.is-active {
    color: var(--fg);
    border-color: var(--fg);
    background: var(--ring-line);
  }

  .ghost-cta:active {
    transform: scale(0.96);
  }

  .ghost-cta:focus-visible {
    outline: 2.5px solid var(--focus);
    outline-offset: 3px;
  }

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

  /* ── Detail Drawer ── */
  .detail-drawer {
    background: var(--veil-mid);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border-bottom: 1px solid var(--ring-line);
    padding: 10px 18px;
    animation: slideDown 160ms ease-out;
    z-index: 15;
  }

  @keyframes slideDown {
    from { opacity: 0; transform: translateY(-8px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .detail-drawer-inner {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
    max-width: 1200px;
    margin: 0 auto;
  }

  .drawer-pill {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    min-height: 44px;
    padding: 6px 14px;
    border-radius: 999px;
    border: 1px solid var(--hairline);
    background: transparent;
    color: var(--fg-dim);
    font-size: 0.64rem;
    font-weight: 700;
    letter-spacing: 0.14em;
    cursor: pointer;
    transition: all 160ms ease;
  }

  .drawer-pill.is-active {
    border-color: var(--fg);
    color: var(--fg);
    background: var(--ring-line);
  }

  .drawer-check {
    width: 13px;
    height: 13px;
    border-radius: 3px;
    border: 1px solid var(--hairline);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 9px;
    color: var(--bg);
  }

  .drawer-check.is-checked {
    background: var(--fg);
    border-color: var(--fg);
  }

  .drawer-input-box {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    border: 1px solid var(--hairline);
    border-radius: 999px;
    padding: 4px 12px;
    background: var(--bg);
  }

  .drawer-text-input {
    background: transparent;
    border: none;
    color: var(--fg);
    font-size: 0.7rem;
    outline: none;
    width: 200px;
  }

  .drawer-count {
    font-size: 0.6rem;
    color: var(--fg-dim);
  }

  .drawer-link {
    background: none;
    border: none;
    color: var(--fg);
    font-size: 0.66rem;
    font-weight: 700;
    letter-spacing: 0.14em;
    cursor: pointer;
    margin-left: auto;
    text-decoration: underline;
    text-underline-offset: 3px;
  }

  .drawer-close {
    width: 44px;
    height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: none;
    color: var(--fg-dim);
    font-size: 14px;
    cursor: pointer;
  }

  .drawer-close:hover {
    color: var(--fg);
  }

  /* ── 3-Column Kiosk Stage ── */
  .editor-stage {
    flex: 1;
    display: grid;
    grid-template-columns: 186px 1fr 370px;
    height: calc(100vh - 52px);
    height: calc(100dvh - 52px);
    overflow: hidden;
    transition: grid-template-columns 220ms ease;
  }

  .editor-stage.is-collapsed {
    grid-template-columns: 186px 1fr 0px;
  }

  /* ── 1. KOLOM KIRI: Foto Sesi (drag & drop reorder) ── */
  .photos-column {
    background: var(--bg);
    border-right: 1px solid var(--ring-line);
    overflow-y: auto;
    padding: 14px 10px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-height: 0;
  }

  .photos-column-head {
    padding: 2px 4px 6px;
    border-bottom: 1px solid var(--ring-line);
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .column-eyebrow {
    font-size: 0.6rem;
    font-weight: 700;
    letter-spacing: 0.22em;
    color: var(--fg-dim);
  }

  .column-hint {
    font-size: 0.56rem;
    letter-spacing: 0.06em;
    color: var(--fg-dim);
    opacity: 0.75;
  }

  .photos-scroll {
    display: flex;
    flex-direction: column;
    gap: 10px;
    overflow-y: auto;
  }

  .photo-cell {
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

  .photo-cell-main {
    display: flex;
    align-items: stretch;
    gap: 6px;
  }

  .photo-cell-btn {
    position: relative;
    flex: 1;
    min-width: 0;
    aspect-ratio: 4 / 3;
    padding: 0;
    border: 1.5px solid var(--hairline);
    border-radius: 8px;
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
    top: 5px;
    left: 5px;
    background: var(--bg);
    color: var(--fg);
    border: 1px solid var(--hairline);
    border-radius: 4px;
    font-size: 0.62rem;
    font-weight: 800;
    padding: 1px 6px;
  }

  /* Target sentuh minimum 44px (kios layar sentuh) */
  .photo-cell-tools {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    gap: 4px;
  }

  .swap-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    min-height: 44px;
    padding: 0;
    border: 1px solid var(--hairline);
    border-radius: 6px;
    background: transparent;
    color: var(--fg-dim);
    cursor: pointer;
    transition: color 160ms ease, border-color 160ms ease, background-color 160ms ease;
  }

  .swap-btn:hover:not(:disabled) {
    color: var(--fg);
    border-color: var(--fg);
    background: var(--ring-line);
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
    padding: 10px 18px 18px;
    min-height: 0;
  }

  /* ── Toolbar kanvas ── */
  .canvas-toolbar {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    justify-content: center;
    padding: 6px 0 12px;
    flex-shrink: 0;
  }

  .tool-pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 44px;
    padding: 0 13px;
    border-radius: 999px;
    border: 1px solid var(--hairline);
    background: transparent;
    color: var(--fg-dim);
    font-size: 0.62rem;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    cursor: pointer;
    transition: all 160ms ease;
  }

  .tool-pill.is-active {
    background: var(--fg);
    color: var(--bg);
    border-color: var(--fg);
  }

  .tool-pill:hover {
    border-color: var(--fg);
    color: var(--fg);
  }

  .tool-pill.is-active:hover {
    color: var(--bg);
  }

  .tool-pill:focus-visible {
    outline: 2.5px solid var(--focus);
    outline-offset: 3px;
  }

  .zoom-group {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    border: 1px solid var(--hairline);
    border-radius: 999px;
    padding: 2px 6px;
  }

  /* Target sentuh minimum 44px di kios — tombol ringan tapi kepjar penuh */
  .zoom-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 44px;
    min-height: 44px;
    padding: 0 8px;
    border: none;
    border-radius: 999px;
    background: transparent;
    color: var(--fg-dim);
    font-size: 0.8rem;
    font-weight: 800;
    cursor: pointer;
    transition: color 140ms ease, background-color 140ms ease;
  }

  .zoom-btn:hover:not(:disabled) {
    color: var(--fg);
    background: var(--ring-line);
  }

  .zoom-btn:disabled {
    opacity: 0.3;
    cursor: default;
  }

  .zoom-btn:focus-visible {
    outline: 2.5px solid var(--focus);
    outline-offset: 2px;
  }

  .zoom-level {
    min-width: 44px;
    text-align: center;
    font-size: 0.62rem;
    color: var(--fg-dim);
  }

  .dim-tag {
    font-size: 0.6rem;
    font-weight: 700;
    letter-spacing: 0.14em;
    color: var(--fg-dim);
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
    height: clamp(340px, 74dvh, 700px);
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
    gap: 6px;
    padding: 10px 12px;
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
    padding: 10px 12px;
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
    padding: 0 14px;
    border: 1.5px dashed var(--hairline);
    border-radius: 10px;
    background: transparent;
    color: var(--fg-dim);
    font-size: 0.64rem;
    font-weight: 700;
    letter-spacing: 0.16em;
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
    padding: 12px 10px;
    min-height: 0;
  }

  .templates-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
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

    .photos-column-head {
      display: none;
    }

    .photos-scroll {
      flex-direction: row;
      width: max-content;
    }

    .photo-cell {
      width: 90px;
      flex-shrink: 0;
    }

    .strip-column {
      height: 56vh;
      padding: 10px;
    }

    .templates-column {
      height: 380px;
      border-left: none;
      border-top: 1px solid var(--ring-line);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .editor-screen,
    .ghost-cta,
    .capsule-cta,
    .template-card,
    .photo-cell-btn,
    .strip-canvas-zoom {
      transition: none;
    }
  }
</style>
