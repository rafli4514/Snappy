# Sessions, Active Events & Dual-Mode Print Queue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable Active Event/Acara session grouping, full session history management (search, date/event/status filters, reprint, download, Admin delete), hardened Windows Direct Silent Print with browser-print fallback, and real-time printer health + retryable Print Queue monitoring.

**Architecture:** `eventsStore.ts` tracks the active event (`_events.json`) and automatically tags every saved `GallerySession` on `POST /api/gallery`. `deviceConfigStore.ts` persists server-side printer settings (`_device_config.json`), while `printEngine.ts` safely invokes Windows PowerShell using temp PNG files and env vars (preventing injection and command-line length overflow). `export.ts` uses dual-mode printing (direct `/api/print` or `window.print()` fallback with automatic queue audit logging), and `/dashboard/sessions` + `/dashboard/queue/print` expose direct Reprint/Retry and Admin session deletion.

**Tech Stack:** SvelteKit 3, Svelte 5 (runes), TypeScript, Tailwind CSS 4 + daisyUI 5, Node.js `v26.12.1` (`node:child_process`, `node:fs`, `node:os`, `node:test`).

**Spec:** [2026-11-22-dashboard-management-spec.md](file:///c:/Users/rapp/Documents/Projek/Snappy/docs/superpowers/specs/2026-11-22-dashboard-management-spec.md)

## Global Constraints

- Depends on Plan 1 (`authPolicy.ts`, `hooks.server.ts`, `DeviceIntegrationsTab.svelte`) for Admin vs Operator RBAC.
- All server data lives in `.gallery_cache/` via `getCacheDir()` from `src/lib/server/cacheDir.ts`.
- Import app modules via `#lib/...` only; UI copy strictly Indonesian without `"kios"`.
- Zero monospace fonts; use `.d-*` tokens from `dashboard.css`, inline delete confirmations (no `window.confirm`), and semantic `<form>` elements.
- Verify with `node --test`, `npm run lint`, `npm run check` (0 errors, 0 new warnings), and `npm run build`.

## Review Focus

1. **PowerShell Command Injection via Printer Name:** A printer name containing `'`, `$`, `;`, or backticks must NEVER be interpolated into a PowerShell script string — always pass via `execFile` environment variables (`DISTUDIO_PRINTER_NAME`, `DISTUDIO_IMAGE_PATH`) (pinned in Task 3).
2. **Temp Print File Cleanup on Error:** Temporary PNG files written to `os.tmpdir()` before printing must always be unlinked in a `finally` block even when PowerShell throws or times out (pinned in Task 3).
3. **Path Traversal on `DELETE /api/gallery/[id]`:** Session IDs containing `../`, `/`, `\`, or starting with `_` (like `_auth` or `_queue`) must be rejected with `400` so gallery deletion can never erase system store files (pinned in Task 2).
4. **Non-Windows / No-Printer Fallback:** When running on Linux/macOS or when no Windows printer is selected, `GET /api/printers` returns `{ ok: true, supported: false, printers: [] }` cleanly and `printStrip()` falls back to `window.print()` + queue log without crashing (pinned in Task 3 & Task 4).
5. **Reprint Missing Session:** Calling `POST /api/print/reprint` for a deleted or strip-less session must return HTTP `404` / `400` cleanly without queueing a phantom print job (pinned in Task 4).

---

### Task 1: Active Event Store & API (`eventsStore.ts`, `/api/events`)

**Files:**

- Create: `src/lib/server/eventsStore.ts`
- Create: `src/routes/api/events/+server.ts`
- Create: `src/routes/api/events/active/+server.ts`
- Test: `tests/server/eventsStore.test.ts`

**Interfaces:**

- Consumes: `getCacheDir`, `readCacheJson`, `writeCacheJson` from `src/lib/server/cacheDir.ts`
- Produces:
  - `export interface PhotoEvent { id: string; name: string; slug: string; date: string; note?: string; archived: boolean; createdAt: string; updatedAt: string }`
  - `export function listEvents(includeArchived?: boolean): PhotoEvent[]`
  - `export function getActiveEvent(): PhotoEvent | null`
  - `export function setActiveEvent(eventId: string | null): PhotoEvent | null`
  - `export function createEvent(input: { name: string; date?: string; note?: string; activate?: boolean }): PhotoEvent`
  - `export function updateEvent(id: string, patch: { name?: string; date?: string; note?: string; archived?: boolean }): PhotoEvent | null`
  - `export function deleteEvent(id: string): boolean`

- [ ] **Step 1: Write failing unit tests in `tests/server/eventsStore.test.ts`**

```ts
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let tmpDir = '';
beforeEach(() => {
	tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'distudio-events-'));
	process.env.DISTUDIO_CACHE_DIR = tmpDir;
});
afterEach(() => {
	delete process.env.DISTUDIO_CACHE_DIR;
	fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('eventsStore', async () => {
	const store = await import('../../src/lib/server/eventsStore.ts');

	it('creates, activates, archives, and clears active event safely', () => {
		assert.equal(store.getActiveEvent(), null);
		const ev = store.createEvent({ name: 'Wedding Rina & Budi', activate: true });
		assert.equal(ev.slug, 'wedding-rina-budi');
		assert.equal(store.getActiveEvent()?.id, ev.id);

		store.updateEvent(ev.id, { archived: true });
		assert.equal(store.getActiveEvent(), null);
		assert.equal(store.listEvents(false).length, 0);
		assert.equal(store.listEvents(true).length, 1);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/server/eventsStore.test.ts`
Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Implement `src/lib/server/eventsStore.ts` and `/api/events` routes**

- Store in `path.join(getCacheDir(), '_events.json')`.
- Archiving or deleting the active event automatically sets `activeEventId = null`.
- `GET /api/events/active` (public) returns `{ ok: true, event: getActiveEvent() }`.
- `GET /api/events` (authenticated) returns `{ ok: true, activeEventId, events }`; `POST / PATCH / DELETE /api/events` (Admin) manage events and active event selection.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/server/eventsStore.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/eventsStore.ts src/routes/api/events tests/server/eventsStore.test.ts
git commit -m "feat(events): add active event store and API endpoints"
```

---

### Task 2: Gallery Session Tagging, Safe Deletion & Summary Enrichment

**Files:**

- Modify: `src/lib/types/index.ts:276-286`
- Modify: `src/lib/server/galleryStore.ts:1-103`
- Modify: `src/routes/api/gallery/+server.ts:1-31`
- Modify: `src/routes/api/gallery/[id]/+server.ts:1-17`
- Test: `tests/server/galleryStore.test.ts`

**Interfaces:**

- Consumes: `getActiveEvent` (`eventsStore.ts`), `getCacheDir` (`cacheDir.ts`)
- Produces:
  - Extended `GallerySession`: adds optional `eventId?: string | null`, `eventName?: string | null`, `cloudSync?: { status: 'none' | 'pending' | 'processing' | 'done' | 'failed'; driveFolderId?: string; driveFolderUrl?: string; uploadedFiles?: { name: string; driveFileId: string; webViewLink?: string }[]; lastError?: string; updatedAt?: string }`
  - `export function isValidSessionId(id: string): boolean`
  - `export function deleteServerSession(id: string): boolean`
  - `export function updateServerSessionMeta(id: string, patch: Partial<Pick<GallerySession, 'eventId' | 'eventName' | 'cloudSync'>>): GallerySession | null`
  - `DELETE /api/gallery/[id]` (Admin only)

- [ ] **Step 1: Write failing unit tests in `tests/server/galleryStore.test.ts`**

```ts
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let tmpDir = '';
beforeEach(() => {
	tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'distudio-gal-'));
	process.env.DISTUDIO_CACHE_DIR = tmpDir;
});
afterEach(() => {
	delete process.env.DISTUDIO_CACHE_DIR;
	fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('galleryStore security & deletion', async () => {
	const gal = await import('../../src/lib/server/galleryStore.ts');

	it('rejects traversal and underscore-prefixed system IDs', () => {
		assert.equal(gal.isValidSessionId('_auth'), false);
		assert.equal(gal.isValidSessionId('../_auth'), false);
		assert.equal(gal.isValidSessionId('a/b'), false);
		assert.equal(gal.isValidSessionId('ab12cd34'), true);
		fs.writeFileSync(path.join(tmpDir, '_auth.json'), '{"keep":true}');
		assert.equal(gal.deleteServerSession('_auth'), false);
		assert.equal(fs.existsSync(path.join(tmpDir, '_auth.json')), true);
	});

	it('saves, updates cloudSync meta, lists, and deletes a valid session', () => {
		gal.setServerSession({
			id: 'sess0001',
			createdAt: new Date().toISOString(),
			photos: ['data:image/png;base64,AA=='],
			stripDataUrl: 'data:image/png;base64,AA==',
			templateKey: 'classic',
			eventId: 'ev_1',
			eventName: 'Wisuda 2026'
		});
		const list = gal.listServerSessions(20);
		assert.equal(list[0]?.eventName, 'Wisuda 2026');
		assert.equal(gal.deleteServerSession('sess0001'), true);
		assert.equal(gal.getServerSession('sess0001'), null);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/server/galleryStore.test.ts`
Expected: FAIL (`isValidSessionId` and `deleteServerSession` not defined).

- [ ] **Step 3: Implement `galleryStore.ts` updates and `DELETE /api/gallery/[id]`**

- `isValidSessionId(id)` accepts only `/^[a-zA-Z0-9][a-zA-Z0-9_-]{3,63}$/` (blocks `_`-prefixed system files and any path separators).
- Use `getCacheDir()` dynamically inside `galleryStore.ts`.
- In `POST /api/gallery`: if `data.eventId` is absent, look up `getActiveEvent()` and attach `eventId` & `eventName`.
- Include `eventId`, `eventName`, and `cloudSyncStatus` / `driveFolderUrl` in `listServerSessions()` summaries.
- Add `DELETE` handler to `src/routes/api/gallery/[id]/+server.ts` returning `400` for invalid ID, `404` if missing, `200 { ok: true }` on success.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/server/galleryStore.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/types/index.ts src/lib/server/galleryStore.ts src/routes/api/gallery tests/server/galleryStore.test.ts
git commit -m "feat(sessions): tag sessions with active event and add safe session deletion"
```

---

### Task 3: Device Print Config & Hardened Windows Print Engine (`deviceConfigStore.ts`, `printEngine.ts`, `/api/printers`)

**Files:**

- Create: `src/lib/server/deviceConfigStore.ts`
- Create: `src/lib/server/printEngine.ts`
- Create: `src/routes/api/settings/device/+server.ts`
- Create: `src/routes/api/printers/+server.ts`
- Modify: `src/routes/api/print/+server.ts:1-191`
- Create: `src/routes/api/print/reprint/+server.ts`
- Test: `tests/server/printEngine.test.ts`

**Interfaces:**

- Consumes: `getCacheDir` (`cacheDir.ts`), `enqueue` (`queueStore.ts`), `getServerSession` (`galleryStore.ts`)
- Produces:
  - `export interface DevicePrintConfig { printMode: 'direct' | 'browser'; printerName: string; layoutMode: 'fit' | 'fill' | 'stretch'; autoRotate: boolean; splitMode: 'none' | '2-strip'; copies: number; fallbackToBrowser: boolean }`
  - `export function getDeviceConfig(): DevicePrintConfig`
  - `export function saveDeviceConfig(patch: Partial<DevicePrintConfig>): DevicePrintConfig`
  - `export interface PrinterInfo { name: string; isDefault: boolean; workOffline: boolean; statusCode: number; errorState: number; health: 'online' | 'offline' | 'error' }`
  - `export function parsePrintersJson(raw: string): PrinterInfo[]`
  - `export function decodeDataUrlPng(dataUrl: string): Buffer`
  - `export function buildStaticPrintScript(): string` (reads `$env:DISTUDIO_PRINTER_NAME`, `$env:DISTUDIO_IMAGE_PATH`, `$env:DISTUDIO_LAYOUT_MODE`, `$env:DISTUDIO_SPLIT_MODE`, `$env:DISTUDIO_AUTO_ROTATE`, `$env:DISTUDIO_COPIES` — zero string interpolation!)
  - `export async function executeDirectPrint(opts: { imageDataUrl: string; sessionId?: string; config?: Partial<DevicePrintConfig>; runner?: typeof execFileAsync }): Promise<{ ok: boolean; error?: string; printerName: string }>`

- [ ] **Step 1: Write failing tests in `tests/server/printEngine.test.ts`**

```ts
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
	buildStaticPrintScript,
	decodeDataUrlPng,
	executeDirectPrint,
	parsePrintersJson
} from '../../src/lib/server/printEngine.ts';

describe('printEngine', () => {
	it('does not interpolate printer name into PowerShell script and reads from $env:', () => {
		const script = buildStaticPrintScript();
		assert.match(script, /\$env:DISTUDIO_PRINTER_NAME/);
		assert.match(script, /\$env:DISTUDIO_IMAGE_PATH/);
		assert.doesNotMatch(script, /FromBaseString/);
		assert.doesNotMatch(script, /\$if\s*\(/);
	});

	it('cleans up temporary image file even when runner fails', async () => {
		let capturedPath = '';
		const fakeRunner = async (_cmd: string, _args: string[], opts: { env?: NodeJS.ProcessEnv }) => {
			capturedPath = opts.env?.DISTUDIO_IMAGE_PATH ?? '';
			assert.equal(opts.env?.DISTUDIO_PRINTER_NAME, "HP'; calc.exe");
			assert.equal(fs.existsSync(capturedPath), true);
			throw new Error('Printer offline');
		};
		const res = await executeDirectPrint({
			imageDataUrl: 'data:image/png;base64,iVBORw0KGgo=',
			config: { printerName: "HP'; calc.exe", copies: 1 },
			runner: fakeRunner as never
		});
		assert.equal(res.ok, false);
		assert.equal(fs.existsSync(capturedPath), false);
	});

	it('parses single-object and array Win32_Printer JSON cleanly', () => {
		const single = parsePrintersJson(
			JSON.stringify({
				Name: 'Canon SELPHY CP1500',
				Default: true,
				WorkOffline: false,
				PrinterStatus: 3,
				DetectedErrorState: 0
			})
		);
		assert.equal(single.length, 1);
		assert.equal(single[0].health, 'online');
		assert.ok(decodeDataUrlPng('data:image/png;base64,AAEC').length === 3);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/server/printEngine.test.ts`
Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Implement `deviceConfigStore.ts`, `printEngine.ts`, `/api/settings/device`, `/api/printers`, `/api/print`, and `/api/print/reprint`**

- `buildStaticPrintScript()` fixes all PowerShell bugs (`System.Drawing.Image::FromFile($env:DISTUDIO_IMAGE_PATH)`, `if (...)` without `$if`, explicit `Dispose()` before exit).
- `executeDirectPrint()` writes temp PNG to `path.join(os.tmpdir(), 'distudio-print-' + crypto.randomUUID() + '.png')`, passes untrusted inputs strictly via `env`, deletes temp file in `finally`, and logs structured entry to `queueStore` (`ref: sessionId`).
- `GET /api/printers` checks `process.platform === 'win32'`; on non-Windows returns `{ ok: true, supported: false, printers: [] }`.
- `POST /api/print/reprint` loads `getServerSession(sessionId)`, validates `stripDataUrl` exists (returns `404` / `400` otherwise), merges `getDeviceConfig()`, and invokes `executeDirectPrint()`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/server/printEngine.test.ts`
Expected: PASS (3/3 tests passing).

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/deviceConfigStore.ts src/lib/server/printEngine.ts src/routes/api/settings/device src/routes/api/printers src/routes/api/print tests/server/printEngine.test.ts
git commit -m "feat(print): harden Windows direct print engine, printer discovery, and reprint API"
```

---

### Task 4: Dual-Mode Client Printing (`export.ts` & `PrintScreen.svelte`)

**Files:**

- Modify: `src/lib/utils/export.ts:41-88`
- Modify: `src/lib/page/print/PrintScreen.svelte`

**Interfaces:**

- Consumes: `GET /api/settings/device`, `POST /api/print`, `POST /api/queue`
- Produces: `export async function printStrip(photoDataUrls: string[], templateKey: TemplateArg, options: RenderOptions & { sessionId?: string }): Promise<{ mode: 'direct' | 'browser'; fallbackUsed?: boolean }>`

- [ ] **Step 1: Update `printStrip()` in `src/lib/utils/export.ts`**

Fetch current device config (`GET /api/settings/device` — keep `GET` public or expose safe subset `{ printMode, printerName, layoutMode, autoRotate, copies, fallbackToBrowser }`).

- If `printMode === 'direct'` and `printerName` is set: `POST /api/print` with `{ image: dataUrl, sessionId, copies }`. If it succeeds, return `{ mode: 'direct' }`. If it fails and `fallbackToBrowser` is true, trigger `window.print()` and return `{ mode: 'browser', fallbackUsed: true }`.
- Otherwise (`browser` mode): run `window.print()` and fire-and-forget `POST /api/print` with `{ mode: 'browser-log', sessionId, copies }` (or log endpoint) so the browser print attempt is recorded in Print Queue!

- [ ] **Step 2: Pass `sessionId` from `PrintScreen.svelte` into `printStrip()` and show clear Indonesian status feedback (`Terkirim ke printer` vs `Dialog cetak dibuka`)**

- [ ] **Step 3: Verify with `npm run check`**

Run: `npm run check`
Expected: `0 errors` and `0 new warnings`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/utils/export.ts src/lib/page/print/PrintScreen.svelte
git commit -m "feat(print): connect photobooth print button to dual-mode print engine and queue logging"
```

---

### Task 5: Upgraded Sessions/Events UI, Print Queue UI & Printer Settings Panel

**Files:**

- Create: `src/lib/features/dashboard/settings/PrinterConfigCard.svelte`
- Modify: `src/lib/features/dashboard/settings/DeviceIntegrationsTab.svelte`
- Modify: `src/routes/dashboard/sessions/+page.svelte`
- Modify: `src/routes/dashboard/queue/print/+page.svelte`

**Interfaces:**

- Consumes: `/api/events`, `/api/gallery`, `DELETE /api/gallery/[id]`, `/api/printers`, `/api/settings/device`, `/api/print/reprint`, `authUser` (`#lib/services/auth`)
- Produces: Complete operational UI for Active Events, Session History management, Print Queue with live printer health & Reprint, and Printer Settings card inside Pengaturan -> Perangkat & Integrasi.

- [ ] **Step 1: Create `PrinterConfigCard.svelte` and mount inside `DeviceIntegrationsTab.svelte`**

Displays discovered Windows printers with live `Online` / `Offline` / `Error` pill, `Mode Cetak` tabs (`Direct Silent Print` | `Dialog Browser`), default printer selector, layout mode (`Fit`/`Fill`/`Stretch`), copies, `Fallback ke Dialog Browser` toggle, and **Simpan Konfigurasi Printer** (editable by Admin, read-only summary for Operator).

- [ ] **Step 2: Upgrade `src/routes/dashboard/sessions/+page.svelte`**

Add:

- **Event / Acara Aktif** top banner card: displays current active event pill, quick dropdown selector, inline **Buat Event Baru** form (Admin), and **Nonaktifkan Event** button.
- Enhanced filter bar: search input, Event dropdown, Date range pills (`Semua | Hari Ini | 7 Hari`), Media filter (`Semua | Video | GIF`), and Cloud status filter (`Semua | Terkirim | Belum/Gagal`).
- Action toolbar in selected session detail panel: **Cetak Ulang** (`POST /api/print/reprint`), **Unduh Strip PNG**, **Salin Link Galeri**, **Buka Galeri**, Cloud Drive status badge (+ link when synced), and Admin-only **Hapus Sesi** with inline confirmation (`DELETE /api/gallery/[id]`).

- [ ] **Step 3: Upgrade `src/routes/dashboard/queue/print/+page.svelte`**

Add live printer health strip at top (calling `GET /api/printers` + `GET /api/settings/device`), and per-item **Cetak Ulang / Coba Lagi** button when `item.ref` (sessionId) is present, invoking `POST /api/print/reprint`. Gate `Bersihkan Semua` and delete buttons to Admin role.

- [ ] **Step 4: Run full verification suite**

Run: `node --test tests/server/*.test.ts tests/client/*.test.ts; if ($LASTEXITCODE -eq 0) { npm run format }; if ($LASTEXITCODE -eq 0) { npm run lint }; if ($LASTEXITCODE -eq 0) { npm run check }; if ($LASTEXITCODE -eq 0) { npm run build }`
Expected: All tests PASS, Prettier clean, 0 errors & 0 new warnings, build PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/features/dashboard/settings src/routes/dashboard/sessions/+page.svelte src/routes/dashboard/queue/print/+page.svelte
git commit -m "feat(sessions,print): add active events, session management actions, and live print queue UI"
```
