# Google Drive OAuth 2.0 Cloud Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect DISTUDIO to Google Drive via OAuth 2.0 (supporting personal Gmail accounts), automatically upload completed session files (`strip`, individual photos, `GIF`, `MP4`) into `<RootFolder>/<EventName>/YYYY-MM-DD/sesi-<id>/`, and provide live upload tracking, retry, and Drive links across `/dashboard/queue/cloud-sync`, `/dashboard/sessions`, and `/dashboard/settings`.

**Architecture:** `cloudStore.ts` persists OAuth credentials, encrypted access/refresh tokens (using `encryptSecret`/`decryptSecret` from Plan 1's `authStore.ts`), root folder config, and upload-type preferences in `.gallery_cache/_cloud.json`. `googleDrive.ts` talks directly to Google OAuth 2.0 and Drive API v3 via Node's native `fetch` (multipart upload + folder lookup/create + token refresh). `cloudSyncWorker.ts` orchestrates idempotent per-file uploads, updates both `galleryStore` (`session.cloudSync`) and `queueStore` (`type: 'cloud-sync'`), and runs non-blockingly when `POST /api/gallery` completes or when triggered manually via `POST /api/cloud/sync`.

**Tech Stack:** SvelteKit 3, Svelte 5 (runes), TypeScript, Node.js `v26.12.1` (native `fetch`, `node:crypto`, `node:test`).

**Spec:** [2026-11-22-dashboard-management-spec.md](file:///c:/Users/rapp/Documents/Projek/Snappy/docs/superpowers/specs/2026-11-22-dashboard-management-spec.md)

## Global Constraints

- Depends on Plan 1 (`authStore.ts` encryption helpers, `authPolicy.ts`, `DeviceIntegrationsTab.svelte`) and Plan 2 (`galleryStore.ts` `cloudSync` metadata & `eventName`).
- Zero external Google SDK packages (`googleapis` is NOT installed) — use native `fetch` against Google OAuth 2.0 and Drive API v3 REST endpoints.
- Never return decrypted tokens or `clientSecret` in any HTTP response or log.
- Import app modules via `#lib/...` only; UI copy strictly Indonesian without `"kios"`.
- Zero monospace fonts; use `.d-*` classes, inline confirmations, and semantic `<form>` elements.
- Verify with `node --test`, `npm run lint`, `npm run check` (0 errors, 0 new warnings), and `npm run build`.

## Review Focus

1. **OAuth CSRF / State Mismatch:** `GET /api/cloud/google/callback` must verify a signed/nonce `HttpOnly` cookie `distudio_oauth_state` against query `?state=`; missing or mismatched state must abort with HTTP `400` and never save tokens (pinned in Task 2).
2. **Idempotent Retry on Partial Failure:** If uploading `foto-3.png` fails mid-session after `strip.png` and `foto-1.png` succeeded, retrying that session must skip files already recorded in `session.cloudSync.uploadedFiles` instead of creating duplicates in Google Drive (pinned in Task 3).
3. **Expired / Revoked Refresh Token:** When Google returns `401` / `invalid_grant` during token refresh, the worker must mark the queue item `'failed'` with clear Indonesian guidance (`"Token Google Drive kedaluwarsa — hubungkan ulang di Pengaturan."`) and flag connection status `needsReconnect: true` without crashing the server (pinned in Task 2 & Task 3).
4. **Offline / Unconnected Photobooth Resilience:** `POST /api/gallery` must still return `200` immediately when Google Drive is disconnected or offline — sync runs asynchronously after the session is saved locally and never blocks guest QR generation (pinned in Task 3).
5. **Secret Redaction:** `GET /api/cloud/google/status` must return `hasClientSecret: boolean` and `connected: boolean`, NEVER raw `clientSecret`, `accessToken`, or `refreshToken` (pinned in Task 1).

---

### Task 1: Encrypted Cloud Config & Token Store (`cloudStore.ts`)

**Files:**

- Create: `src/lib/server/cloudStore.ts`
- Test: `tests/server/cloudStore.test.ts`

**Interfaces:**

- Consumes: `getCacheDir`, `readCacheJson`, `writeCacheJson` (`cacheDir.ts`), `encryptSecret`, `decryptSecret` (`authStore.ts`)
- Produces:
  - `export interface CloudUploadTypes { strip: boolean; photos: boolean; gif: boolean; video: boolean }`
  - `export interface PublicCloudStatus { configured: boolean; hasClientId: boolean; hasClientSecret: boolean; usingEnvCredentials: boolean; connected: boolean; needsReconnect: boolean; email: string | null; rootFolderId: string | null; rootFolderName: string; autoSync: boolean; uploadTypes: CloudUploadTypes; lastSyncAt?: string }`
  - `export function getCloudCredentials(): { clientId: string; clientSecret: string } | null`
  - `export function getCloudStatus(): PublicCloudStatus`
  - `export function saveCloudConfig(patch: { clientId?: string; clientSecret?: string; rootFolderId?: string | null; rootFolderName?: string; autoSync?: boolean; uploadTypes?: Partial<CloudUploadTypes> }): PublicCloudStatus`
  - `export function saveGoogleTokens(tokens: { accessToken: string; refreshToken?: string; expiresAt: string; email?: string | null }): void`
  - `export function getDecryptedTokens(): { accessToken: string; refreshToken: string; expiresAt: string } | null`
  - `export function markCloudNeedsReconnect(flag: boolean): void`
  - `export function clearGoogleTokens(): void`

- [ ] **Step 1: Write failing unit tests in `tests/server/cloudStore.test.ts`**

```ts
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let tmpDir = '';
beforeEach(() => {
	tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'distudio-cloud-'));
	process.env.DISTUDIO_CACHE_DIR = tmpDir;
});
afterEach(() => {
	delete process.env.DISTUDIO_CACHE_DIR;
	fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('cloudStore', async () => {
	const store = await import('../../src/lib/server/cloudStore.ts');

	it('encrypts secrets on disk and never leaks tokens in getCloudStatus()', () => {
		store.saveCloudConfig({
			clientId: 'cid-123.apps.googleusercontent.com',
			clientSecret: 'super-secret-val',
			rootFolderName: 'DISTUDIO'
		});
		store.saveGoogleTokens({
			accessToken: 'ya29.access',
			refreshToken: '1//refresh-secret',
			expiresAt: new Date(Date.now() + 3600_000).toISOString(),
			email: 'studio@gmail.com'
		});

		const rawOnDisk = fs.readFileSync(path.join(tmpDir, '_cloud.json'), 'utf8');
		assert.equal(rawOnDisk.includes('super-secret-val'), false);
		assert.equal(rawOnDisk.includes('1//refresh-secret'), false);

		const pub = store.getCloudStatus();
		assert.equal(pub.connected, true);
		assert.equal(pub.email, 'studio@gmail.com');
		assert.equal('clientSecret' in pub, false);
		assert.equal('refreshToken' in pub, false);

		const dec = store.getDecryptedTokens();
		assert.equal(dec?.refreshToken, '1//refresh-secret');
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/server/cloudStore.test.ts`
Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Implement `src/lib/server/cloudStore.ts`**

- Store in `path.join(getCacheDir(), '_cloud.json')`.
- Fall back to `process.env.GOOGLE_CLIENT_ID` / `process.env.GOOGLE_CLIENT_SECRET` when env vars are set.
- Default `uploadTypes: { strip: true, photos: true, gif: true, video: true }`, `autoSync: true`, `rootFolderName: 'DISTUDIO Photobooth'`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/server/cloudStore.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/cloudStore.ts tests/server/cloudStore.test.ts
git commit -m "feat(cloud): add encrypted Google Drive configuration and token store"
```

---

### Task 2: Native Google OAuth 2.0 & Drive API v3 Client (`googleDrive.ts`) + Auth Endpoints

**Files:**

- Create: `src/lib/server/googleDrive.ts`
- Create: `src/routes/api/cloud/google/auth/+server.ts`
- Create: `src/routes/api/cloud/google/callback/+server.ts`
- Create: `src/routes/api/cloud/google/status/+server.ts`
- Create: `src/routes/api/cloud/google/config/+server.ts`
- Create: `src/routes/api/cloud/google/disconnect/+server.ts`
- Create: `src/routes/api/cloud/google/folders/+server.ts`
- Test: `tests/server/googleDrive.test.ts`

**Interfaces:**

- Consumes: `cloudStore.ts`
- Produces:
  - `export function buildGoogleAuthUrl(opts: { clientId: string; redirectUri: string; state: string }): string`
  - `export async function exchangeCodeForTokens(opts: { code: string; redirectUri: string; fetchFn?: typeof fetch }): Promise<{ accessToken: string; refreshToken?: string; expiresAt: string; email: string | null }>`
  - `export async function getValidAccessToken(fetchFn?: typeof fetch): Promise<string>` (refreshes automatically if within 120s of expiry; marks `needsReconnect = true` on `invalid_grant`)
  - `export async function ensureDriveFolder(name: string, parentId: string | null, accessToken: string, fetchFn?: typeof fetch): Promise<{ id: string; webViewLink: string }>`
  - `export async function uploadFileMultipart(opts: { name: string; mimeType: string; data: Buffer; parentId: string; accessToken: string; fetchFn?: typeof fetch }): Promise<{ id: string; webViewLink: string }>`
  - `export async function listDriveFolders(accessToken: string, parentId?: string | null, fetchFn?: typeof fetch): Promise<{ id: string; name: string; webViewLink?: string }[]>`

- [ ] **Step 1: Write failing tests in `tests/server/googleDrive.test.ts`**

```ts
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let tmpDir = '';
beforeEach(() => {
	tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'distudio-gd-'));
	process.env.DISTUDIO_CACHE_DIR = tmpDir;
});
afterEach(() => {
	delete process.env.DISTUDIO_CACHE_DIR;
	fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('googleDrive client', async () => {
	const store = await import('../../src/lib/server/cloudStore.ts');
	const gd = await import('../../src/lib/server/googleDrive.ts');

	it('builds least-privilege OAuth URL with drive.file scope and offline access', () => {
		const url = new URL(
			gd.buildGoogleAuthUrl({
				clientId: 'cid-1',
				redirectUri: 'http://localhost:5173/api/cloud/google/callback',
				state: 'nonce123'
			})
		);
		assert.equal(url.origin, 'https://accounts.google.com');
		assert.equal(url.searchParams.get('access_type'), 'offline');
		assert.equal(url.searchParams.get('prompt'), 'consent');
		assert.match(url.searchParams.get('scope') ?? '', /drive\.file/);
		assert.equal(url.searchParams.get('state'), 'nonce123');
	});

	it('marks needsReconnect when token refresh returns invalid_grant', async () => {
		store.saveCloudConfig({ clientId: 'cid', clientSecret: 'sec' });
		store.saveGoogleTokens({
			accessToken: 'expired',
			refreshToken: 'bad-refresh',
			expiresAt: new Date(Date.now() - 60_000).toISOString(),
			email: 'test@gmail.com'
		});
		const fakeFetch = async () =>
			new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 });

		await assert.rejects(() => gd.getValidAccessToken(fakeFetch as never), /kedaluwarsa/i);
		assert.equal(store.getCloudStatus().needsReconnect, true);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/server/googleDrive.test.ts`
Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Implement `src/lib/server/googleDrive.ts` and all `/api/cloud/google/**` endpoints**

- `GET /api/cloud/google/auth`: generates 24-byte random hex `state`, sets `distudio_oauth_state` HttpOnly cookie (`Max-Age=600`, `SameSite=Lax`), redirects `302` to `buildGoogleAuthUrl(...)`.
- `GET /api/cloud/google/callback`: compares `?state=` against `distudio_oauth_state` via `timingSafeEqual` (rejects with `400` if invalid/missing), deletes state cookie, calls `exchangeCodeForTokens`, stores tokens via `saveGoogleTokens`, ensures default root folder exists, redirects to `/dashboard/settings?tab=device&cloud=connected`.
- `GET /api/cloud/google/folders` & `POST /api/cloud/google/folders`: list/create folders inside Google Drive so Admin can pick or create the root destination folder.

- [ ] **Step 4: Run tests and `npm run check`**

Run: `node --test tests/server/googleDrive.test.ts; if ($LASTEXITCODE -eq 0) { npm run check }`
Expected: PASS and `0 errors`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/googleDrive.ts src/routes/api/cloud/google tests/server/googleDrive.test.ts
git commit -m "feat(cloud): add Google OAuth 2.0 and Drive API v3 client and routes"
```

---

### Task 3: Idempotent Cloud Sync Worker & Auto-Trigger (`cloudSyncWorker.ts`, `/api/cloud/sync`)

**Files:**

- Create: `src/lib/server/cloudSyncWorker.ts`
- Create: `src/routes/api/cloud/sync/+server.ts`
- Modify: `src/routes/api/gallery/+server.ts`
- Test: `tests/server/cloudSyncWorker.test.ts`

**Interfaces:**

- Consumes: `cloudStore.ts`, `googleDrive.ts`, `galleryStore.ts` (`getServerSession`, `updateServerSessionMeta`), `queueStore.ts` (`enqueue`, `updateQueue`, `listQueue`)
- Produces:
  - `export interface SyncResult { ok: boolean; sessionId: string; status: 'done' | 'failed' | 'skipped'; uploadedCount: number; skippedCount: number; driveFolderUrl?: string; error?: string }`
  - `export async function syncSessionToDrive(sessionId: string, deps?: { getToken?: () => Promise<string>; ensureFolder?: typeof ensureDriveFolder; uploadFile?: typeof uploadFileMultipart }): Promise<SyncResult>`
  - `export function triggerAutoSyncAsync(sessionId: string): void`
  - `POST /api/cloud/sync` (`{ sessionId?: string, allPending?: boolean }`) → `{ ok: true, results: SyncResult[] }`

- [ ] **Step 1: Write failing unit tests in `tests/server/cloudSyncWorker.test.ts`**

```ts
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let tmpDir = '';
beforeEach(() => {
	tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'distudio-sync-'));
	process.env.DISTUDIO_CACHE_DIR = tmpDir;
});
afterEach(() => {
	delete process.env.DISTUDIO_CACHE_DIR;
	fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('cloudSyncWorker idempotent upload & retry', async () => {
	const gal = await import('../../src/lib/server/galleryStore.ts');
	const cloud = await import('../../src/lib/server/cloudStore.ts');
	const worker = await import('../../src/lib/server/cloudSyncWorker.ts');

	it('skips already-uploaded files when retrying after a partial failure', async () => {
		cloud.saveCloudConfig({
			clientId: 'cid',
			clientSecret: 'sec',
			rootFolderName: 'DISTUDIO',
			uploadTypes: { strip: true, photos: true, gif: false, video: false }
		});
		cloud.saveGoogleTokens({
			accessToken: 'tok',
			refreshToken: 'ref',
			expiresAt: new Date(Date.now() + 3600_000).toISOString(),
			email: 'studio@gmail.com'
		});
		gal.setServerSession({
			id: 'sync0001',
			createdAt: '2026-11-22T08:00:00.000Z',
			photos: ['data:image/png;base64,AA==', 'data:image/png;base64,BB=='],
			stripDataUrl: 'data:image/png;base64,CC==',
			templateKey: 'classic',
			eventName: 'Event A'
		});

		const uploaded: string[] = [];
		let failOnce = true;
		const deps = {
			getToken: async () => 'tok',
			ensureFolder: async (name: string) => ({
				id: `folder-${name}`,
				webViewLink: `https://drive.google.com/drive/folders/folder-${name}`
			}),
			uploadFile: async (opts: { name: string }) => {
				if (opts.name === 'foto-2.png' && failOnce) {
					failOnce = false;
					throw new Error('Network reset');
				}
				uploaded.push(opts.name);
				return {
					id: `file-${opts.name}`,
					webViewLink: `https://drive.google.com/file/${opts.name}`
				};
			}
		};

		const first = await worker.syncSessionToDrive('sync0001', deps);
		assert.equal(first.status, 'failed');
		assert.deepEqual(uploaded, ['strip.png', 'foto-1.png']);

		const second = await worker.syncSessionToDrive('sync0001', deps);
		assert.equal(second.status, 'done');
		assert.equal(second.skippedCount, 2);
		assert.deepEqual(uploaded, ['strip.png', 'foto-1.png', 'foto-2.png']);
		assert.equal(gal.getServerSession('sync0001')?.cloudSync?.status, 'done');
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/server/cloudSyncWorker.test.ts`
Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Implement `src/lib/server/cloudSyncWorker.ts`, `/api/cloud/sync`, and hook into `POST /api/gallery`**

- Build folder chain: `<rootFolderId or rootFolderName>` → `<eventName || 'Tanpa Event'>` → `YYYY-MM-DD` → `sesi-<id>`.
- Maintain in-memory `inFlight = new Set<string>()` lock per `sessionId` so double-clicking Sync never duplicates uploads.
- On `POST /api/gallery`, after `setServerSession(data)`, call `triggerAutoSyncAsync(data.id)` (non-blocking `void syncSessionToDrive(id).catch(...)` only when `connected && autoSync`).

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/server/cloudSyncWorker.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/cloudSyncWorker.ts src/routes/api/cloud/sync src/routes/api/gallery/+server.ts tests/server/cloudSyncWorker.test.ts
git commit -m "feat(cloud): add idempotent Google Drive sync worker and auto-sync hook"
```

---

### Task 4: Google Drive Settings Card & Live Cloud Sync Dashboard UI

**Files:**

- Create: `src/lib/features/dashboard/settings/GoogleDriveConfigCard.svelte`
- Modify: `src/lib/features/dashboard/settings/DeviceIntegrationsTab.svelte`
- Modify: `src/routes/dashboard/queue/cloud-sync/+page.svelte`
- Modify: `src/routes/dashboard/sessions/+page.svelte`

**Interfaces:**

- Consumes: `/api/cloud/google/status`, `/api/cloud/google/config`, `/api/cloud/google/auth`, `/api/cloud/google/disconnect`, `/api/cloud/google/folders`, `/api/cloud/sync`, `/api/queue?type=cloud-sync`
- Produces: Complete Google Drive setup & monitoring UX in Settings, Cloud Sync Queue, and Sessions detail panel.

- [ ] **Step 1: Create `GoogleDriveConfigCard.svelte` and mount in `DeviceIntegrationsTab.svelte`**

Includes:

- Connection status pill (`Terhubung` with Gmail email, `Perlu Hubungkan Ulang`, or `Belum Terhubung`).
- Collapsible **Kredensial Google OAuth** form (Admin only: Client ID, Client Secret, displays exact Redirect URI to copy into Google Cloud Console).
- **Hubungkan Google Drive** CTA (`href="/api/cloud/google/auth"`) and **Putuskan Koneksi** inline confirmation.
- **Folder Tujuan di Drive** selector + create-folder mini-form (`GET/POST /api/cloud/google/folders`).
- `Sinkronisasi Otomatis` toggle + file-type checkboxes (`Strip PNG`, `Foto Satuan`, `Animasi GIF`, `Video MP4`).

- [ ] **Step 2: Rebuild `src/routes/dashboard/queue/cloud-sync/+page.svelte` for real Google Drive monitoring**

Replace MVP placeholder notice with:

- Live Google Drive connection banner (account email + root folder + link to Settings if not connected).
- KPIs: `Sesi Lokal`, `Terkirim ke Drive`, `Tertunda / Proses`, `Gagal`.
- Top actions: **Sinkronkan Semua Tertunda** (`POST /api/cloud/sync { allPending: true }`), **Muat Ulang**, Admin-only **Bersihkan Riwayat**.
- Status filter tabs (`Semua | Terkirim | Tertunda | Gagal`) + per-item **Buka di Drive** link (`webViewLink`) and **Kirim Ulang / Coba Lagi** button (`POST /api/cloud/sync { sessionId: item.ref }`).

- [ ] **Step 3: Wire live "Kirim / Kirim Ulang ke Drive" button & Drive link in `src/routes/dashboard/sessions/+page.svelte`**

- [ ] **Step 4: Run full verification suite**

Run: `node --test tests/server/*.test.ts tests/client/*.test.ts; if ($LASTEXITCODE -eq 0) { npm run format }; if ($LASTEXITCODE -eq 0) { npm run lint }; if ($LASTEXITCODE -eq 0) { npm run check }; if ($LASTEXITCODE -eq 0) { npm run build }`
Expected: All tests PASS, Prettier clean, 0 errors & 0 new warnings, production build PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/features/dashboard/settings src/routes/dashboard/queue/cloud-sync/+page.svelte src/routes/dashboard/sessions/+page.svelte
git commit -m "feat(cloud): add Google Drive settings panel and live cloud sync queue UI"
```
