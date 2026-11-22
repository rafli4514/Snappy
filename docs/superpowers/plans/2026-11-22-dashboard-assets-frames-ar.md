# Server-Backed Frame Studio & Live AR Camera Overlay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate Frame Studio from browser-only IndexedDB to server disk (`/api/assets/frames`) with active/inactive toggle and inline rename so frames sync across LAN devices, auto-log all asset uploads to the Upload Queue, and enable selecting & capturing live static AR overlays on the `/camera` screen.

**Architecture:** `framesStore.ts` stores frame metadata in `.gallery_cache/_custom_frames.json` and PNG/SVG artwork binaries in `.gallery_cache/custom-assets/frames/` following the exact pattern of `customAssetsStore.ts`. `frameStorage.ts` switches to server-first API reads/writes with a transparent one-time migration helper for legacy IndexedDB frames and offline cache fallback. On `/camera`, `CameraScreen.svelte` loads enabled AR assets from `customArStore`, displays a live overlay picker on the viewfinder, and passes the selected overlay `HTMLImageElement` into `captureFrame()` (`src/lib/utils/capture.ts`) to bake it cleanly onto each captured photo.

**Tech Stack:** SvelteKit 3, Svelte 5 (runes), TypeScript, Tailwind CSS 4 + daisyUI 5, Canvas 2D API, Node.js `v26.12.1` (`node:fs`, `node:test`).

**Spec:** [2026-11-22-dashboard-management-spec.md](file:///c:/Users/rapp/Documents/Projek/Snappy/docs/superpowers/specs/2026-11-22-dashboard-management-spec.md)

## Global Constraints

- Depends on Plan 1 (`authPolicy.ts` Admin RBAC for asset mutations, `cacheDir.ts` `getCacheDir()`).
- Import app modules via `#lib/...` only; UI copy strictly Indonesian without `"kios"`.
- Keep `capture.ts` selfie horizontal mirror on the camera video feed while drawing AR overlay graphics **un-mirrored** so text/logos on AR frames read correctly.
- Zero monospace fonts; use `.d-*` classes, inline delete confirmations (no `window.confirm`), and semantic `<form>` elements.
- Verify with `node --test`, `npm run lint`, `npm run check` (0 errors, 0 new warnings), and `npm run build`.

## Review Focus

1. **Path Traversal on Frame Asset Serving:** `GET /api/assets/frames/[file]` must reject `../`, slashes, and non-whitelisted extensions so only files inside `.gallery_cache/custom-assets/frames/` can be read (pinned in Task 1).
2. **SVG XSS Sanitization on Server:** Server-side `POST /api/assets/frames` must strip `<script>`, `on*=` attributes, and `javascript:` URIs from uploaded SVG buffers before writing to disk (not rely solely on client sanitization) (pinned in Task 1).
3. **One-Time IndexedDB Migration Idempotency:** Running the legacy IndexedDB → Server frame migration twice must NOT duplicate frames on the server (matched by `frame.id`) (pinned in Task 2).
4. **Disabled Frame Filtering in Photobooth:** Frames toggled to `enabled: false` in Frame Studio must still appear in `/dashboard/assets/frames` for editing, but MUST be omitted from `GET /api/assets/frames?enabled=1` used by `/strip` and `/editor` (pinned in Task 1).
5. **AR Overlay Aspect / Mirroring Fidelity:** When an AR overlay image is active on `/camera`, `captureFrame()` must mirror the video frame (selfie view) and composite the overlay image _after_ restoring the canvas transform so the overlay is NOT flipped backwards, and gracefully fall back to plain capture if the overlay image hasn't finished loading (pinned in Task 3).

---

### Task 1: Server Frame Store & API (`/api/assets/frames`)

**Files:**

- Create: `src/lib/server/framesStore.ts`
- Create: `src/routes/api/assets/frames/+server.ts`
- Create: `src/routes/api/assets/frames/[file]/+server.ts`
- Test: `tests/server/framesStore.test.ts`

**Interfaces:**

- Consumes: `getCacheDir`, `ensureCacheDir`, `readCacheJson`, `writeCacheJson` (`cacheDir.ts`), `enqueue` (`queueStore.ts`), `PhotoFrame` (`#lib/types`)
- Produces:
  - `export interface StoredFrameRecord extends Omit<PhotoFrame, 'artworkDataUrl'> { file: string; artworkUrl: string; mime: string; enabled: boolean }`
  - `export function sanitizeSvgServer(svg: string): string`
  - `export function listServerFrames(opts?: { enabledOnly?: boolean }): StoredFrameRecord[]`
  - `export function upsertServerFrame(input: { id?: string; name: string; slotCount: number; designWidth: number; designHeight: number; slots: PhotoFrame['slots']; focal: 'center' | 'top'; formatId?: string | null; enabled?: boolean; artworkDataUrl?: string }): StoredFrameRecord`
  - `export function updateServerFrameMeta(id: string, patch: { name?: string; enabled?: boolean; focal?: 'center' | 'top'; formatId?: string | null }): StoredFrameRecord | null`
  - `export function deleteServerFrame(id: string): boolean`
  - `export function resolveFrameFilePath(file: string): string | null`

- [ ] **Step 1: Write failing unit tests in `tests/server/framesStore.test.ts`**

```ts
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let tmpDir = '';
beforeEach(() => {
	tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'distudio-frames-'));
	process.env.DISTUDIO_CACHE_DIR = tmpDir;
});
afterEach(() => {
	delete process.env.DISTUDIO_CACHE_DIR;
	fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('framesStore', async () => {
	const store = await import('../../src/lib/server/framesStore.ts');

	it('saves, filters enabledOnly, renames, and deletes a server frame', () => {
		const saved = store.upsertServerFrame({
			id: 'frame-test-1',
			name: 'Bingkai Wisuda',
			slotCount: 4,
			designWidth: 1200,
			designHeight: 1800,
			slots: [],
			focal: 'center',
			artworkDataUrl: 'data:image/png;base64,iVBORw0KGgo='
		});
		assert.equal(saved.enabled, true);
		assert.ok(store.resolveFrameFilePath(saved.file));
		assert.equal(store.resolveFrameFilePath('../_auth.json'), null);

		store.updateServerFrameMeta(saved.id, { name: 'Wisuda 2026', enabled: false });
		assert.equal(store.listServerFrames({ enabledOnly: false })[0]?.name, 'Wisuda 2026');
		assert.equal(store.listServerFrames({ enabledOnly: true }).length, 0);

		assert.equal(store.deleteServerFrame(saved.id), true);
		assert.equal(store.listServerFrames().length, 0);
	});

	it('strips script tags and event handlers from SVG artwork', () => {
		const dirty =
			'<svg onload="alert(1)"><script>evil()</script><rect width="10" height="10"/></svg>';
		const clean = store.sanitizeSvgServer(dirty);
		assert.doesNotMatch(clean, /<script/i);
		assert.doesNotMatch(clean, /onload=/i);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/server/framesStore.test.ts`
Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Implement `src/lib/server/framesStore.ts` and `/api/assets/frames` endpoints**

- `GET /api/assets/frames` supports `?enabled=1`.
- `GET /api/assets/frames/[file]` serves binary file via `resolveFrameFilePath()` with strict basename check & `Content-Security-Policy: default-src 'none'` on SVG responses.
- `POST /api/assets/frames` (Admin) saves frame and logs `enqueue({ type: 'upload', status: 'done', title: 'Frame: ' + frame.name, source: 'assets/frames' })`.
- `PUT /api/assets/frames` (Admin) updates metadata (`name`, `enabled`, `focal`, `formatId`).
- `DELETE /api/assets/frames` (Admin) removes metadata + file.

- [ ] **Step 4: Run tests and `npm run check`**

Run: `node --test tests/server/framesStore.test.ts; if ($LASTEXITCODE -eq 0) { npm run check }`
Expected: PASS and `0 errors`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/framesStore.ts src/routes/api/assets/frames tests/server/framesStore.test.ts
git commit -m "feat(assets): add server-backed frame store and API endpoints"
```

---

### Task 2: Client Frame Storage Migration & Upload Queue Audit Logging

**Files:**

- Modify: `src/lib/utils/frameStorage.ts:1-121`
- Modify: `src/lib/page/admin/FrameStudioScreen.svelte`
- Modify: `src/routes/api/assets/stickers/+server.ts`
- Modify: `src/routes/api/assets/filters/+server.ts`
- Modify: `src/routes/api/assets/ar/+server.ts`
- Test: `tests/client/frameMigration.test.ts`

**Interfaces:**

- Consumes: `/api/assets/frames`
- Produces:
  - `export function selectFramesToMigrate<T extends { id: string }>(localFrames: T[], serverIds: Iterable<string>): T[]`
  - `export async function listFrames(opts?: { enabledOnly?: boolean }): Promise<PhotoFrame[]>` (reads `/api/assets/frames`, mirrors to IndexedDB cache for offline resilience)
  - `export async function saveFrame(frame: PhotoFrame): Promise<void>` (POSTs to `/api/assets/frames`)
  - `export async function updateFrame(id: string, patch: { name?: string; enabled?: boolean; focal?: 'center' | 'top'; formatId?: string | null }): Promise<void>` (PUTs to `/api/assets/frames`)
  - `export async function deleteFrame(id: string): Promise<void>` (DELETEs from `/api/assets/frames`)
  - `export async function migrateLegacyIndexedDbFrames(): Promise<number>` (one-time idempotent upload of pre-existing local IndexedDB frames whose `id` is absent on server)

- [ ] **Step 1: Write failing idempotency test in `tests/client/frameMigration.test.ts`**

```ts
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { selectFramesToMigrate } from '../../src/lib/utils/frameMigration.ts';

describe('selectFramesToMigrate', () => {
	it('excludes frames already present on server so repeated runs never duplicate', () => {
		const local = [{ id: 'f1' }, { id: 'f2' }];
		const pending = selectFramesToMigrate(local, ['f1']);
		assert.deepEqual(pending, [{ id: 'f2' }]);
		assert.deepEqual(selectFramesToMigrate(local, ['f1', 'f2']), []);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/client/frameMigration.test.ts`
Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Implement `src/lib/utils/frameMigration.ts` and update `src/lib/utils/frameStorage.ts`**

Map `artworkUrl` returned by `/api/assets/frames` into `PhotoFrame.artworkDataUrl` (canvas rendering accepts same-origin URLs seamlessly via `Image.src`). Use `selectFramesToMigrate()` inside `migrateLegacyIndexedDbFrames()` so repeated runs upload `0` duplicates.

- [ ] **Step 4: Upgrade `src/lib/page/admin/FrameStudioScreen.svelte`**

- On mount, run `migrateLegacyIndexedDbFrames()` (show subtle Indonesian notice if legacy frames were migrated to server) then `listFrames()`.
- Add active/inactive `toggle toggle-sm` switch and inline rename edit button per saved frame card calling `updateFrame()`.

- [ ] **Step 5: Auto-log asset uploads in Upload Queue**

Add `enqueue({ type: 'upload', status: 'done', title: ..., source: ... })` inside `POST` handlers of `/api/assets/stickers`, `/api/assets/filters`, and `/api/assets/ar` so `/dashboard/queue/upload` automatically displays real upload history.

- [ ] **Step 6: Run test and `npm run check`**

Run: `node --test tests/client/frameMigration.test.ts; if ($LASTEXITCODE -eq 0) { npm run check }`
Expected: PASS and `0 errors`.

- [ ] **Step 7: Commit**

```bash
git add src/lib/utils/frameMigration.ts src/lib/utils/frameStorage.ts src/lib/page/admin/FrameStudioScreen.svelte src/routes/api/assets/stickers/+server.ts src/routes/api/assets/filters/+server.ts src/routes/api/assets/ar/+server.ts tests/client/frameMigration.test.ts
git commit -m "feat(assets): migrate Frame Studio to server storage with toggle/rename and upload queue logging"
```

---

### Task 3: AR Overlay Capture Utility & Live `/camera` Integration

**Files:**

- Modify: `src/lib/utils/capture.ts:1-59`
- Modify: `src/lib/stores/session.ts`
- Modify: `src/lib/types/index.ts`
- Modify: `src/lib/page/camera/CameraScreen.svelte`
- Modify: `src/lib/page/camera/_CameraScreen.css`
- Test: `tests/client/captureOverlay.test.ts`

**Interfaces:**

- Consumes: `customArStore`, `loadCustomAssets` (`#lib/services/customAssets`)
- Produces:
  - `export function drawOverlayContain(ctx: CanvasRenderingContext2D, overlay: CanvasImageSource, imgW: number, imgH: number, canvasW: number, canvasH: number): void`
  - Extended `captureFrame(videoEl: HTMLVideoElement, targetAspectRatio?: number | null, filterString?: string, overlayImage?: HTMLImageElement | null): string`
  - `CameraSettings.arOverlayId?: string | null`

- [ ] **Step 1: Write failing unit test for overlay geometry & non-mirrored compositing in `tests/client/captureOverlay.test.ts`**

```ts
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeOverlayRect } from '../../src/lib/utils/captureOverlay.ts';

describe('computeOverlayRect', () => {
	it('fits overlay proportionally inside target canvas without distortion', () => {
		const r = computeOverlayRect(1000, 1000, 1280, 960);
		assert.equal(r.w, 960);
		assert.equal(r.h, 960);
		assert.equal(r.x, 160);
		assert.equal(r.y, 0);
	});

	it('covers matching aspect ratios edge-to-edge', () => {
		const r = computeOverlayRect(800, 600, 1200, 900);
		assert.deepEqual(r, { x: 0, y: 0, w: 1200, h: 900 });
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/client/captureOverlay.test.ts`
Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Implement `src/lib/utils/captureOverlay.ts` and extend `captureFrame()` in `src/lib/utils/capture.ts`**

- `captureFrame()` keeps `ctx.save(); ctx.scale(-1, 1); ctx.drawImage(videoEl, ...); ctx.restore();` for selfie video, then **after** `ctx.restore()` (un-mirrored, with `ctx.filter = 'none'`), draws `overlayImage` using `computeOverlayRect()` if `overlayImage?.complete && overlayImage.naturalWidth > 0`.

- [ ] **Step 4: Add AR overlay selector & live viewfinder layer to `CameraScreen.svelte` & update `/dashboard/assets/ar` copy**

- Load active AR assets on mount via `loadCustomAssets()`.
- Render a compact toggleable AR strip in the camera toolbar (`Tanpa AR` + enabled AR thumbnails); only show the AR button when at least 1 active AR asset exists.
- Render selected AR PNG/WebP/SVG over the viewfinder (`pointer-events: none; object-fit: contain`) and pass the loaded `HTMLImageElement` into `captureFrame()` on shutter capture.
- Update `/dashboard/assets/ar/+page.svelte` info banner to reflect that active overlays now appear directly on the `/camera` viewfinder and captured photos (static overlay mode; face tracking remains future enhancement).

- [ ] **Step 5: Run full verification suite**

Run: `node --test tests/server/*.test.ts tests/client/*.test.ts; if ($LASTEXITCODE -eq 0) { npm run format }; if ($LASTEXITCODE -eq 0) { npm run lint }; if ($LASTEXITCODE -eq 0) { npm run check }; if ($LASTEXITCODE -eq 0) { npm run build }`
Expected: All unit tests PASS, Prettier clean, `svelte-check` 0 errors & 0 new warnings, production build PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/utils/captureOverlay.ts src/lib/utils/capture.ts src/lib/types/index.ts src/lib/stores/session.ts src/lib/page/camera src/routes/dashboard/assets/ar/+page.svelte tests/client/captureOverlay.test.ts
git commit -m "feat(ar): integrate live static AR overlay picker and capture compositing on camera screen"
```
