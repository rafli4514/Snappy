# Gallery Google Drive Link & Mobile HTTPS Camera Implementation Plan

**Goal:** Add a Google Drive button to `/gallery/[id]`, support 3 QR modes (`smart`, `gallery`, `local`) + optional `publicBaseUrl`, fix mobile camera lock/fallback bugs, and add `npm run dev:https` for mobile LAN camera access.

**Architecture:** Extend `cloud_config` with `public_base_url` and 3-way `qr_mode`, wire `resolveGalleryUrl()` to honor `publicBaseUrl` and active `window.location.protocol`, surface a live-polled Google Drive pill button in `GalleryScreen.svelte` and dual-source switcher in `PrintScreen.svelte`, fix `camera.ts` + `CameraScreen.svelte` for Android/iOS cameras, and add conditional `@vitejs/plugin-basic-ssl` in `vite.config.ts` (`--mode https`).

**Tech Stack:** Rust (`axum 0.7`, `rusqlite 0.32`), SvelteKit 3 + Svelte 5 + Vite 8 + `@vitejs/plugin-basic-ssl`.

**Spec:** `docs/superpowers/specs/2026-11-23-gallery-drive-link-and-mobile-camera-design.md`

## Global Constraints

- Keep Indonesian UI copy (no `"kios"` in dashboard copy).
- Keep `npm run dev` on plain HTTP so existing Google OAuth `http://localhost:5173/api/cloud/google/callback` keeps working unchanged.
- Never show the Google Drive button on `/gallery/[id]` unless `sync.isPublic && sync.driveFolderUrl`.
- Keep `capture.ts` horizontal mirror selfie invariant unchanged.
- No `svelte.config.js`; configure SvelteKit inside `vite.config.ts`.

## Review Focus

1. **Invalid `publicBaseUrl` input:** Must reject or clear non-`http(s)://` values (e.g., `javascript:alert(1)`, `ftp://...`, random text) and strip trailing slashes cleanly.
2. **`qrMode = "gallery"` auto-sync behavior:** `POST /api/gallery` must still spawn background Google Drive auto-sync (so `/gallery/[id]` gets its Drive button!) while returning `cloudEligible: false` and `qrMode: "gallery"` so `/print` displays the `/gallery/[id]` QR immediately without waiting 8 seconds.
3. **Gallery page polling cleanup:** Leaving `/gallery/[id]` while Drive upload is still running must clear its timeout timer cleanly.
4. **Mobile `hasMultipleCameras()` without stream lock:** Never call a second `getUserMedia()` while an active camera stream is open; enumerate devices directly so iOS Safari and Android Chrome don't kill/lock the active stream.
5. **Vite 8 compatibility with `@vitejs/plugin-basic-ssl`:** Verify `npm run dev:https` starts cleanly over HTTPS and `npm run build` / `npm run check` remain error-free.

---

### Task 1: Backend `publicBaseUrl` & 3-Way `qrMode` (`smart` | `gallery` | `local`) (TDD)

**Files:**

- Modify: `backend/src/db/migrations.rs`
- Modify: `backend/src/routes/cloud.rs`
- Modify: `backend/src/routes/gallery.rs`
- Test: `backend/tests/cloud_drive_test.rs`

- [ ] **Step 1 (RED):** Add test `cloud_config_supports_gallery_qr_mode_and_sanitizes_public_base_url` in `backend/tests/cloud_drive_test.rs` covering:
  - Legacy DB migration adds `public_base_url` default `""`.
  - `PUT /api/cloud/google/config` accepts `qrMode: "gallery"` and `publicBaseUrl: "https://booth.example.com/"` -> stored trimmed as `"https://booth.example.com"`.
  - Non-http(s) `publicBaseUrl` (`"javascript:alert(1)"`) is rejected/sanitized to `""`.
  - `POST /api/gallery` with `qrMode: "gallery"` returns `qrMode: "gallery"` and `cloudEligible: false`.
  - `GET /api/cloud/sync/:id` returns `qrMode: "gallery"` and `publicBaseUrl: "https://booth.example.com"`.
- [ ] **Step 2:** Run `cargo test --manifest-path backend/Cargo.toml --test cloud_drive_test` and confirm RED.
- [ ] **Step 3 (GREEN):** Implement column migration (`cloud_config.public_base_url`), `sanitize_public_base_url`, 3-way `normalize_qr_mode` (`smart` | `gallery` | `local`), expose `publicBaseUrl` on `PublicCloudStatus` & `SessionCloudSyncResponse`, and return `qrMode` on `POST /api/gallery`.
- [ ] **Step 4:** Re-run full `cargo test --manifest-path backend/Cargo.toml` and confirm 18/18 GREEN.

---

### Task 2: Gallery Google Drive Button, PrintScreen & Settings Updates

**Files:**

- Modify: `src/lib/services/gallery.ts`
- Modify: `src/lib/page/gallery/GalleryScreen.svelte`
- Modify: `src/lib/page/print/PrintScreen.svelte`
- Modify: `src/routes/dashboard/settings/+page.svelte`

- [ ] **Step 1:** Update `src/lib/services/gallery.ts`:
  - Update `SessionCloudSyncStatus` (`qrMode: 'smart' | 'gallery' | 'local'`, `publicBaseUrl?: string | null`) and `SaveGallerySessionResult` (`qrMode: 'smart' | 'gallery' | 'local'`, `cloudEligible: boolean`).
  - Fix `resolveGalleryUrl(sessionId)` to prefer configured `publicBaseUrl` (from `/api/cloud/google/status`) and otherwise preserve `window.location.protocol` (`https:` or `http:`) when swapping `localhost` to LAN IP.
- [ ] **Step 2:** Update `src/lib/page/gallery/GalleryScreen.svelte`:
  - Poll `fetchSessionCloudSync(sessionId)` on mount (up to 30s if `pending`/`processing`, cancelled on `onDestroy`).
  - Render a clean **"Google Drive"** pill link button in `.header-actions` next to `Unduh Semua` whenever `driveFolderUrl` is public (`isPublic && driveFolderUrl`).
- [ ] **Step 3:** Update `src/lib/page/print/PrintScreen.svelte`:
  - When `saved.qrMode === 'gallery'`, show the Galeri Web QR immediately (`activeQrSource = 'local'`) AND poll `fetchSessionCloudSync` quietly in background so once Google Drive is ready, the compact switcher (`Galeri Web` | `Google Drive`) appears without swapping the QR mid-scan.
  - Label the local/web source clearly (`Galeri Web` when `publicBaseUrl` or `gallery` mode, `Wi-Fi Lokal` when plain LAN).
- [ ] **Step 4:** Update `src/routes/dashboard/settings/+page.svelte` (Tab Google Drive):
  - Upgrade **Mode QR Tamu** segmented control to 3 options: `Smart (Drive)`, `Galeri Web + Drive`, `Wi-Fi Lokal`.
  - Add optional **URL Publik Galeri (HTTPS / Tunnel)** field saved via `PUT /api/cloud/google/config`.

---

### Task 3: Mobile Camera Fixes & Local HTTPS (`npm run dev:https`)

**Files:**

- Modify: `src/lib/services/camera.ts`
- Modify: `src/lib/page/camera/CameraScreen.svelte`
- Modify: `vite.config.ts`
- Modify: `package.json`

- [ ] **Step 1:** Update `src/lib/services/camera.ts`:
  - Check `!navigator.mediaDevices?.getUserMedia` / `!window.isSecureContext` and throw a typed `InsecureContextError` mapped to `'https_required'`.
  - Add graceful mobile constraint fallback (`ideal 1280×960` -> `{ facingMode }` -> `video: true`).
  - Remove the second `getUserMedia` call inside `hasMultipleCameras()`; use `enumerateDevices()` directly while the first stream is active.
- [ ] **Step 2:** Update `src/lib/page/camera/CameraScreen.svelte`:
  - Localize camera error screen to Indonesian, add dedicated `https_required` guidance (how to run `npm run dev:https` and open `https://<LAN-IP>:5173`), plus a quick **"Buka via HTTPS"** link when currently on non-localhost `http:`.
- [ ] **Step 3:** Install `@vitejs/plugin-basic-ssl` (`npm install -D @vitejs/plugin-basic-ssl`), wire conditional HTTPS mode (`mode === 'https' || process.env.DISTUDIO_HTTPS === '1'`) in `vite.config.ts`, and add `"dev:https": "vite dev --mode https"` to `package.json`.

---

### Task 4: Full Verification

- [ ] **Step 1:** Stop `distudio-server`, run `cargo build --manifest-path backend/Cargo.toml` and `cargo test --manifest-path backend/Cargo.toml` (all tests green, 0 warnings).
- [ ] **Step 2:** Run `npm run format`, `npm run lint`, `npm run check` (0 errors), `npm run build`.
- [ ] **Step 3:** Smoke-test `http://localhost:5173/api/cloud/google/status`, `GET /api/cloud/sync/seed-sess-01`, `GET /gallery/seed-sess-01`, and verify `vite dev --mode https` boots over HTTPS cleanly on a test port without disturbing the user's running `:5173` dev server.
