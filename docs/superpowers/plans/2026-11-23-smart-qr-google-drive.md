# Smart QR Google Drive Implementation Plan

**Goal:** Enable guests at `/print` to scan a public Google Drive session folder QR from mobile data (outside booth Wi-Fi) with automatic offline LAN fallback, configurable from `/dashboard/settings?tab=cloud`.

**Architecture:** Extend `cloud_config` and `cloud_session_sync` in SQLite via idempotent `ALTER TABLE` migrations, apply `anyone:reader` permission strictly to the per-session Drive folder (`sesi-<id>`) immediately before file uploads begin, expose `GET /api/cloud/sync/:session_id` + `cloudEligible` on `POST /api/gallery`, and update `/dashboard/settings` and `/print` with Smart QR polling, progress feedback, LAN fallback, and a manual `Google Drive` ↔ `Wi-Fi Lokal` toggle.

**Tech Stack:** Rust (`axum 0.7`, `rusqlite 0.32`, `reqwest 0.12`), SvelteKit 3 + Svelte 5 + Tailwind 4/daisyUI.

**Spec:** `docs/superpowers/specs/2026-11-23-smart-qr-google-drive-design.md`

## Global Constraints

- UI copy must be in Indonesian (never use "kios" in dashboard copy).
- Never expose `clientSecret`, `accessToken`, or `refreshToken` in API responses or logs.
- Never apply public permissions to the root folder or date folder — ONLY to `sesi-<id>`.
- Never display a Google Drive QR unless `isPublic === true`.
- Never replace an already-shown LAN fallback QR mid-scan without explicit user click.
- Use `#lib/...` imports, Prettier (tabs, single quotes, no trailing comma, 100 cols), and keep SvelteKit config in `vite.config.ts`.

## Review Focus

1. **Existing SQLite database upgrade:** Existing `.gallery_cache/distudio.db` created before this change must seamlessly gain `public_share`, `qr_mode`, `is_public`, and `total_files` without losing data or failing `init_schema`.
2. **Drive permission API failure (e.g., Workspace org policy 403):** Must NOT set `is_public = 1`; `GET /api/cloud/sync/:id` must report `isPublic: false` so `/print` safely falls back to LAN instead of showing a private "Request Access" QR.
3. **Idempotent retry of permission grant:** Retrying an already-public session must NOT call Google Permissions API redundantly; retrying a previously-synced private session when `publicShare = true` MUST apply public permission.
4. **Invalid `qrMode` input or unsafe `session_id`:** `PUT /api/cloud/google/config` with arbitrary `qrMode` normalizes to `"smart"` (only `"local"` selects local); `GET /api/cloud/sync/:session_id` rejects path traversal / unsafe IDs with `400`.
5. **Unmounted `/print` screen during polling:** Leaving `/print` (clicking Back or Sesi Baru) must clear all polling timers and ignore stale async responses without errors.

---

### Task 1: SQLite Schema Migration & Cloud Config (`publicShare` / `qrMode`)

**Files:**

- Modify: `backend/src/db/migrations.rs`
- Modify: `backend/src/routes/cloud.rs`
- Test: `backend/tests/cloud_drive_test.rs`

**Interfaces:**

- Produces in `migrations.rs`: `ensure_column_exists(conn: &Connection, table: &str, column: &str, col_def: &str) -> rusqlite::Result<()>` invoked inside `init_schema`.
- Produces in `cloud.rs`:
  - `PublicCloudStatus` gains `public_share: bool` (`publicShare`) and `qr_mode: String` (`qrMode`).
  - `CloudConfigPatch` gains `public_share: Option<bool>` and `qr_mode: Option<String>`.
  - `pub fn is_cloud_qr_eligible(conn: &Connection) -> bool`

- [ ] **Step 1 (RED):** Add test `cloud_config_persists_public_share_and_qr_mode_and_migrates_legacy_db` in `backend/tests/cloud_drive_test.rs` asserting default `publicShare: true`, `qrMode: "smart"`, updating to `publicShare: false` + `qrMode: "local"`, normalizing unknown `qrMode` to `"smart"`, and upgrading an old SQLite DB lacking the new columns.
- [ ] **Step 2:** Run `cargo test --manifest-path backend/Cargo.toml --test cloud_drive_test` and confirm the new test fails.
- [ ] **Step 3 (GREEN):** Implement idempotent column migration in `backend/src/db/migrations.rs` (`cloud_config.public_share`, `cloud_config.qr_mode`, `cloud_session_sync.is_public`, `cloud_session_sync.total_files`) and wire `public_share`, `qr_mode`, and `is_cloud_qr_eligible()` in `backend/src/routes/cloud.rs`.
- [ ] **Step 4:** Re-run `cargo test --manifest-path backend/Cargo.toml --test cloud_drive_test` and confirm PASS.

---

### Task 2: Public Session Folder Permission & Sync Status API

**Files:**

- Modify: `backend/src/routes/cloud.rs`
- Modify: `backend/src/routes/gallery.rs`
- Modify: `backend/src/routes/mod.rs`
- Test: `backend/tests/cloud_drive_test.rs`

**Interfaces:**

- Consumes: Task 1's `public_share`, `qr_mode`, `is_public`, `total_files`, `is_cloud_qr_eligible`.
- Produces:
  - `ensure_folder_public_read(client, endpoints, access_token, folder_id) -> Result<(), String>`
  - `GET /api/cloud/sync/:session_id` -> `SessionCloudSyncResponse` (`{ ok, sessionId, qrMode, cloudEligible, status, isPublic, driveFolderUrl, uploadedCount, totalFiles, error }`)
  - `POST /api/gallery` returns `{ ok: true, id, cloudEligible }`

- [ ] **Step 1 (RED):** Add tests in `backend/tests/cloud_drive_test.rs`:
  - `sync_grants_public_reader_only_on_session_folder_and_is_idempotent` (verifies `POST /drive/v3/files/{folderId}/permissions` called ONCE on `folder-sesi-seed-sess-01` with `{"role":"reader","type":"anyone"}`, NOT on root/date folders, NOT called a second time on retry, and `GET /api/cloud/sync/seed-sess-01` returns `isPublic: true`, `totalFiles: 4`, `uploadedCount: 4`, `status: "done"`).
  - `sync_permission_failure_keeps_is_public_false_and_gallery_post_reports_cloud_eligible` (verifies permission 403 keeps `isPublic: false`, `POST /api/gallery` returns `cloudEligible` matching config, and unsafe ID on `GET /api/cloud/sync/..` returns 400).
- [ ] **Step 2:** Run `cargo test --manifest-path backend/Cargo.toml --test cloud_drive_test` and confirm the new tests fail.
- [ ] **Step 3 (GREEN):**
  - Implement `ensure_folder_public_read()` in `backend/src/routes/cloud.rs`.
  - In `sync_session_with_endpoints`: compute `total_files = files_to_sync.len()`, grant public permission on `folder_id` right after folder resolution when `cfg.public_share && !is_public`, immediately `upsert_sync_state` (`status = "processing"`, `is_public`, `total_files`) BEFORE file upload loop.
  - Implement `get_session_cloud_sync` handler and register `.route("/api/cloud/sync/:session_id", get(cloud::get_session_cloud_sync))` in `backend/src/routes/mod.rs`.
  - Update `post_gallery` in `backend/src/routes/gallery.rs` to return `cloudEligible`.
- [ ] **Step 4:** Run full Rust test suite `cargo test --manifest-path backend/Cargo.toml` and confirm all tests pass with 0 warnings.

---

### Task 3: Dashboard Settings UI & PrintScreen Smart QR

**Files:**

- Modify: `src/routes/dashboard/settings/+page.svelte`
- Modify: `src/lib/services/gallery.ts`
- Modify: `src/lib/page/print/PrintScreen.svelte`
- Modify: `src/lib/page/print/_PrintScreen.css`

**Interfaces:**

- Consumes: `GET/PUT /api/cloud/google/{status,config}` (`publicShare`, `qrMode`), `POST /api/gallery` (`cloudEligible`), `GET /api/cloud/sync/:session_id`.
- Produces:
  - `SaveGallerySessionResult` (`{ id: string; cloudEligible: boolean }`) or helper `saveGallerySessionWithStatus(...)` + `fetchSessionCloudSync(sessionId: string)` in `src/lib/services/gallery.ts` (preserving `saveGallerySession` return type compatibility if referenced elsewhere).
  - Smart QR UI + mode switcher (`Google Drive` | `Wi-Fi Lokal`) + upload progress badge in `PrintScreen.svelte`.
  - **Mode QR Tamu** + **Akses Publik Folder Sesi** controls in `settings/+page.svelte` (Tab Google Drive).

- [ ] **Step 1:** Update `src/routes/dashboard/settings/+page.svelte` (`CloudStatus`, `DEFAULT_CLOUD`, `updateCloudPrefs`, and Preferensi Sinkronisasi card in Tab Google Drive) with Indonesian controls for **Mode QR Tamu** (`Smart (Drive → LAN)` / `Lokal (Wi-Fi LAN)`) and **Akses Publik Folder Sesi**.
- [ ] **Step 2:** Add `SessionCloudSyncStatus` type, `fetchSessionCloudSync(sessionId)`, and `cloudEligible` support in `src/lib/services/gallery.ts`.
- [ ] **Step 3:** Update `src/lib/page/print/PrintScreen.svelte` and `_PrintScreen.css` to implement Pendekatan 1:
  - Wait briefly (max 8s) for `isPublic && driveFolderUrl` when `cloudEligible === true`, then immediately render Drive QR while showing live upload progress (`Mengunggah ke Drive (2/5 berkas)…` → `Siap di Google Drive · bisa dibuka pakai kuota HP`).
  - Fall back cleanly to LAN QR if `cloudEligible === false`, sync fails before folder ready, or 8s timeout elapses (without unexpectedly swapping an already-shown LAN QR mid-scan; show an optional switch button if Drive becomes ready later).
  - Show compact `Google Drive` | `Wi-Fi Lokal` switch pill when both URLs are available.
  - Cancel all timers/polling safely in `onDestroy`.
- [ ] **Step 4:** Verify end-to-end:
  - Stop running `distudio-server`, run `cargo test --manifest-path backend/Cargo.toml` and `cargo build --manifest-path backend/Cargo.toml`.
  - Run `npm run format && npm run lint`, `npm run check`, `npm run build`.
  - Verify live on `http://localhost:5173`: `/api/cloud/google/status`, `/api/cloud/sync/seed-sess-01`, and test re-syncing `seed-sess-01` live to verify Google Drive API v3 accepts the `anyone:reader` permission with the existing OAuth token!
