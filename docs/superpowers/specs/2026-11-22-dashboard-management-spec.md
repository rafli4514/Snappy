# DISTUDIO Photobooth — Dashboard Management Specification

**Date:** 2026-11-22  
**Status:** Approved via interactive design interview (`/grill-me`)  
**Scope:** End-to-end operational dashboard covering Authentication & RBAC, Account/Device Settings, Session & Active Event Management, Print Queue & Dual-Mode Printing, Google Drive OAuth 2.0 Cloud Sync, Server-Backed Frame Studio, and Live AR Camera Overlays.

---

## 1. Global Constraints

- **Runtime & Toolchain:** SvelteKit 3 + Svelte 5 (runes) + Tailwind CSS 4 + daisyUI 5 + TypeScript on Node.js (`v26.12.1`). No external database server required; all server persistence uses `.gallery_cache/` JSON + binary asset directories on writable local disk.
- **No `svelte.config.js`:** SvelteKit stays configured inside `vite.config.ts`.
- **Import Alias:** Always import app modules via `#lib/...` (never `$lib/...`).
- **UI Language & Copy:** All user-facing UI copy must be in **Indonesian**. Never use the word `"kios"` in dashboard UI copy (use `"Photobooth"`, `"Studio"`, or omit).
- **Typography & Styling:** `Plus Jakarta Sans` (`--font-body`) with `tabular-nums` (`.d-num`), zero monospace in UI. All dashboard styles live inside `.dash-shell` using `.d-*` classes from `src/lib/features/dashboard/dashboard.css` (and page-prefixed local classes) so there are zero collisions with daisyUI v5 classes (`.hero`, `.badge`, `.alert`, `.label`, `.skeleton`, etc.). Full dark & light theme parity.
- **Confirmations & Forms:** Never use `window.confirm()` / `confirm()`; always use inline confirmation controls and semantic `<form>` elements.
- **Client-Only Rendering Invariant:** `src/routes/+layout.ts` keeps `ssr = false` and `prerender = false` globally. Route authentication is enforced both at the server hook (`src/hooks.server.ts` for all `/api/**` and page requests) and verified client-side in `/dashboard/+layout.svelte` via `/api/auth/me`.
- **Formatting & Baseline Verification:** Prettier (tabs, single quotes, no trailing commas, 100 cols). Every milestone must pass `node --test`, `npm run lint`, `npm run check` (0 errors, 0 new warnings), and `npm run build`.
- **Zero Heavy Cloud/Auth Dependencies:** Use Node's native `node:crypto` (`scrypt`, `AES-256-GCM`, `timingSafeEqual`), native `fetch`, and native `node:test` instead of adding `bcrypt`, `googleapis`, or external DB drivers.

---

## 2. Subsystem 1 — Authentication, RBAC & Settings

### 2.1 User Accounts & Roles

- **Roles:** `'admin'` (Owner/Pemilik) and `'operator'` (Staff/Operator).
- **Local Store:** `.gallery_cache/_auth.json` storing:
  - `users`: `{ id, username, displayName, role, passwordHash, salt, active, createdAt, updatedAt, lastLoginAt? }[]`
  - `sessions`: `{ tokenHash, userId, userAgent, ip, createdAt, expiresAt, lastSeenAt }[]`
  - `encryptionKey`: 32-byte hex master key (or read from `DISTUDIO_SECRET` env var) for encrypting OAuth tokens at rest.
- **Password Hashing:** `crypto.scryptSync(password, salt, 64)` with 16-byte random salt and `crypto.timingSafeEqual` verification. Minimum password length: 8 characters.
- **Session Cookie:** `distudio_session` (`HttpOnly`, `SameSite=Lax`, `Path=/`, `Max-Age=604800` / 7 days; `Secure` only when request protocol is HTTPS so LAN HTTP works seamlessly).

### 2.2 First-Run Setup & Login Flow

- **First-run (`/dashboard/setup`):** When `users.length === 0`, accessing any `/dashboard/**` route redirects to `/dashboard/setup`. Submitting creates the first `admin` account, logs them in immediately, and permanently locks `/dashboard/setup` (API returns `403` once ≥ 1 user exists).
- **Login (`/dashboard/login`):** Username + password form with rate-limit guard (max 5 failed attempts per IP/username per 15 minutes → `429`), sets session cookie, redirects to `/dashboard` (or `?next=` safe internal path).
- **Logout (`POST /api/auth/logout`):** Deletes active session token from `_auth.json`, clears cookie, redirects to `/dashboard/login`. Also supports revoking other active sessions (`DELETE /api/auth/sessions/[id]`) or "Keluar dari Semua Perangkat".

### 2.3 Access Protection & RBAC Matrix

- **Open (Guest / Photobooth):**
  - Pages: `/`, `/strip`, `/camera`, `/review`, `/editor`, `/edit`, `/decorate`, `/timelapse`, `/print`, `/gallery/[id]`
  - APIs: `POST /api/gallery`, `GET /api/gallery/[id]`, `POST /api/print`, `GET /api/settings/device`, `GET /api/assets`, `GET /api/assets/stickers/[file]`, `GET /api/assets/ar/[file]`, `GET /api/assets/frames`, `GET /api/assets/frames/[file]`, `GET /api/frame-sizes`, `GET /api/network-ip`, `GET /api/events/active`, `GET /api/auth/status`, `POST /api/auth/setup`, `POST /api/auth/login`.
- **Authenticated (`admin` + `operator`):**
  - Pages: `/dashboard`, `/dashboard/sessions`, `/dashboard/gallery`, `/dashboard/queue`, `/dashboard/queue/print`, `/dashboard/queue/cloud-sync`, `/dashboard/queue/upload`, `/dashboard/settings` (Profil & Keamanan tab + read-only Perangkat info).
  - APIs: `GET /api/auth/me`, `POST /api/auth/logout`, `PATCH /api/auth/profile`, `POST /api/auth/password`, `GET/DELETE /api/auth/sessions`, `GET /api/gallery?list=1`, `GET/POST/PATCH /api/queue`, `POST /api/print/reprint`, `POST /api/cloud/sync`, `GET /api/cloud/google/status`, `GET /api/printers`, `GET /api/events`.
- **Admin-Only (`admin`):**
  - Pages: `/dashboard/assets/**`, `/admin/frames`, `Kelola Pengguna` tab & credential/printer write sections in `/dashboard/settings`.
  - APIs: `GET/POST/PATCH/DELETE /api/users/**`, `DELETE /api/gallery/[id]`, `DELETE /api/queue`, `POST/PUT/DELETE` on `/api/assets/**` & `/api/frame-sizes`, `POST/PATCH/DELETE /api/events`, `POST/DELETE /api/cloud/google/**`, `PUT /api/settings/device`.
- Sidebar navigation hides Admin-only sections for `operator` users, and server hooks reject unauthorized API calls with `401` (unauthenticated) or `403` (forbidden role).

### 2.4 Tabbed Settings (`/dashboard/settings`)

1. **Profil & Keamanan:** Update display name & username, change password (requires current password; invalidates other sessions optionally), active sessions list with revoke button, prominent **Keluar (Logout)** button.
2. **Kelola Pengguna (Admin only):** List all accounts with role & status pills, create new Operator/Admin, toggle active/inactive, reset password, delete account (cannot delete or deactivate the last active Admin).
3. **Perangkat & Integrasi:**
   - Device preferences (Theme Light/Dark, Camera defaults, Timelapse defaults — preserved from existing settings).
   - **Printer (Admin writes, Operator views):** Mode cetak (`Direct Silent Print Windows` vs `Dialog Browser`), list & refresh Windows printers (`GET /api/printers`) with live Online/Offline/Error badge, default printer selector, layout mode (`fit`/`fill`/`stretch`), auto-rotate, default copies, test print button.
   - **Google Drive (Admin writes, Operator views):** OAuth Client ID/Secret config (or `.env` indicator), **Hubungkan Google Drive** / **Putuskan Koneksi**, connected Google account email, target root folder picker/ID, auto-sync toggle, and checkboxes for uploaded file types (`Strip PNG`, `Foto Satuan`, `GIF`, `Video MP4`).

---

## 3. Subsystem 2 — Session/Event Management & Dual-Mode Print Queue

### 3.1 Active Event / Acara Tagging (`eventsStore.ts`)

- Stored in `.gallery_cache/_events.json`: `{ activeEventId: string | null, events: PhotoEvent[] }`, where `PhotoEvent = { id, name, slug, date, note?, createdAt, archived }`.
- When a guest completes a session (`POST /api/gallery`), the server automatically attaches `eventId` and `eventName` from the currently active event (if set) onto `GallerySession`.
- Managed from a dedicated **"Event / Acara Aktif"** bar/panel at the top of `/dashboard/sessions`: quick switch active event, create new event, archive/clear active event.

### 3.2 Session & History Management (`/dashboard/sessions`)

- Filters: search (ID, format, template, event), Event dropdown, Date range (`Semua | Hari Ini | 7 Hari | Pilih Tanggal`), Media filter (`Semua | Video | GIF`), Cloud Sync filter (`Semua | Terkirim | Belum/Gagal`).
- Per-session metadata includes: `eventId`, `eventName`, `printCount`, `lastPrintStatus`, `cloudSyncStatus` (`none | pending | processing | done | failed`), `driveFolderUrl`.
- Actions on selected session:
  - **Cetak Ulang** (calls `POST /api/print/reprint` using stored `stripDataUrl` and current server printer config, or opens browser print fallback).
  - **Kirim / Kirim Ulang ke Drive** (calls `POST /api/cloud/sync` with `{ sessionId }`, shows live Drive folder link when `done`).
  - **Unduh Strip PNG** & individual photo download buttons.
  - **Salin Link Galeri QR** & **Buka Galeri**.
  - **Hapus Sesi** (Admin only, inline confirmation, calls `DELETE /api/gallery/[id]` removing JSON file from disk + in-memory cache + related queue refs).

### 3.3 Hardened Print Engine & Queue (`/api/printers`, `/api/print`, `/dashboard/queue/print`)

- Server device config stored in `.gallery_cache/_device_config.json`: `{ printMode: 'direct' | 'browser', printerName, layoutMode, autoRotate, copies, ... }`.
- `GET /api/printers`: Runs PowerShell `Get-CimInstance Win32_Printer | Select-Object Name, Default, WorkOffline, PrinterStatus, DetectedErrorState | ConvertTo-Json` (gracefully returns `{ supported: false, printers: [] }` on non-Windows).
- `POST /api/print` & `POST /api/print/reprint`:
  - Fixes existing PowerShell bugs: writes decoded PNG bytes to a secure temp file (`os.tmpdir()`) instead of interpolating multi-MB base64 into the PowerShell command line, uses `System.Drawing.Image::FromFile(...)`, fixes `if (...)` syntax, safely passes printer name via environment variable (prevents PowerShell injection!), cleans up temp file in `finally`.
  - Records queue entry with `sessionId` (`ref`), `printerName`, `copies`, `mode` (`direct` | `browser`), and error reason if failed.
  - `POST /api/print/reprint` accepts `{ sessionId, copies? }` or `{ queueItemId }`, reads `stripDataUrl` from `galleryStore`, re-executes print, and updates/enqueues log.
- `printStrip()` in `src/lib/utils/export.ts` checks server print config:
  - In `direct` mode (with printer configured): posts to `/api/print`; on failure, offers/falls back to `window.print()` if configured.
  - In `browser` mode: runs `window.print()` and posts a `done` audit entry to `/api/queue` (`type: 'print', source: 'browser-print'`).
- `/dashboard/queue/print` shows live printer status banner, KPI cards, status filter tabs, and per-item **Cetak Ulang / Coba Lagi** button alongside status actions.

---

## 4. Subsystem 3 — Google Drive OAuth 2.0 Cloud Sync

### 4.1 OAuth 2.0 Flow & Encrypted Token Storage (`cloudStore.ts`, `googleDrive.ts`)

- Stored in `.gallery_cache/_cloud.json` with `accessToken` and `refreshToken` encrypted using AES-256-GCM (`authStore` master key). Never expose tokens or `clientSecret` to client responses!
- Credentials source: `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` env vars OR encrypted overrides saved by Admin in Pengaturan -> Perangkat & Integrasi.
- OAuth Scope: `https://www.googleapis.com/auth/drive.file` (least-privilege — access only to folders/files created or selected by this app) + `https://www.googleapis.com/auth/userinfo.email` (to display connected Gmail address).
- Endpoints:
  - `GET /api/cloud/google/auth` (Admin): generates cryptographic `state` nonce cookie, redirects to Google consent screen (`access_type=offline&prompt=consent`).
  - `GET /api/cloud/google/callback`: verifies `state`, exchanges `code` for tokens via `https://oauth2.googleapis.com/token`, fetches user email, stores encrypted tokens, redirects to `/dashboard/settings?tab=device&cloud=connected`.
  - `GET /api/cloud/google/status`: returns `{ configured, connected, email, rootFolderId, rootFolderName, autoSync, uploadTypes }`.
  - `POST /api/cloud/google/config` (Admin): saves root folder, `autoSync`, `uploadTypes` (`strip`, `photos`, `gif`, `video`), and optional OAuth client credentials.
  - `POST /api/cloud/google/disconnect` (Admin): revokes token best-effort and clears stored tokens.
  - `GET /api/cloud/google/folders` (Admin): lists/creates folders in Drive so Admin can pick or create a destination folder (e.g., `DISTUDIO Photobooth`).

### 4.2 Automatic & Manual Sync Worker (`/api/cloud/sync`, `/dashboard/queue/cloud-sync`)

- Folder hierarchy in Google Drive: `<RootFolder>/<EventName or "Tanpa Event">/YYYY-MM-DD/sesi-<id>/`.
- Files uploaded per `uploadTypes` config: `strip.png`, `foto-1.png`..`foto-N.png`, `timelapse.gif`, `timelapse.mp4` (multipart upload to `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart`).
- Automatic trigger: `POST /api/gallery` creates a `cloud-sync` queue item (`status: 'pending'`, `ref: session.id`) and fires an in-process non-blocking worker when Drive is connected and `autoSync === true`.
- Idempotent per-file tracking: stores `uploadedFiles: { name, driveFileId, webViewLink }[]` and `driveFolderId` / `driveFolderUrl` on the session sync record so retrying a partially failed upload skips already-uploaded files!
- `/dashboard/queue/cloud-sync`: shows connected Google account badge, KPIs (`Terkirim`, `Tertunda`, `Gagal`, `Belum Sinkron`), **Sinkronkan Semua Tertunda** button, per-item **Coba Lagi** button, direct **Buka di Drive** link, and detailed error messages (e.g. token revoked / offline).

---

## 5. Subsystem 4 — Server-Backed Frame Studio & Live AR Camera Overlay

### 5.1 Server-Backed Frame Studio (`framesStore.ts`, `/api/assets/frames`)

- Storage: `.gallery_cache/custom-assets/frames/<id>.<ext>` + `.gallery_cache/_custom_frames.json`.
- Endpoints:
  - `GET /api/assets/frames` (open; supports `?enabled=1` for Photobooth screens).
  - `GET /api/assets/frames/[file]` (open; serves PNG/SVG with path-traversal protection & `Cache-Control`).
  - `POST /api/assets/frames` (Admin): saves frame artwork file + metadata (`name`, `slotCount`, `designWidth`, `designHeight`, `slots`, `focal`, `formatId`, `enabled: true`) and logs an entry to Upload Queue (`type: 'upload', status: 'done'`).
  - `PUT /api/assets/frames` (Admin): updates `name`, `enabled`, `focal`, `formatId`.
  - `DELETE /api/assets/frames` (Admin): removes metadata & artwork file.
- `src/lib/utils/frameStorage.ts`: switches to server API primary storage, with automatic one-time migration of any existing browser IndexedDB frames up to `/api/assets/frames` when an Admin visits Frame Studio, and offline IndexedDB read cache fallback.
- `FrameStudioScreen.svelte`: adds active/inactive toggle (`toggle toggle-sm`) and inline rename per saved frame.

### 5.2 Live Static AR Camera Overlay (`/camera` & `capture.ts`)

- Active AR assets from `customArStore` (`enabled !== false`) are loaded on `/camera`.
- Adds a compact AR overlay selector strip in `CameraScreen.svelte` (`Tanpa AR` + thumbnails of active uploaded AR PNG/WebP/SVG overlays).
- Selected overlay renders live on top of the `<video>` preview (matching viewport aspect ratio) and is composited directly onto the captured canvas inside `captureFrame()` in `src/lib/utils/capture.ts` (un-mirrored so text/graphics on overlays read naturally, while camera feed stays mirrored selfie view).
- Asset uploads on `/api/assets/stickers`, `/api/assets/filters`, `/api/assets/ar`, and `/api/assets/frames` automatically log real entries in `queueStore` (`type: 'upload', status: 'done'`) so `/dashboard/queue/upload` displays genuine upload history.

---

## 6. Modular Implementation Plan Index

Because these 4 subsystems are independently shippable and testable, implementation is split into 4 sequential plans:

1. [Plan 1: Auth, RBAC & Account Settings](file:///c:/Users/rapp/Documents/Projek/Snappy/docs/superpowers/plans/2026-11-22-dashboard-auth-settings.md)
2. [Plan 2: Sessions, Active Events & Dual-Mode Print Queue](file:///c:/Users/rapp/Documents/Projek/Snappy/docs/superpowers/plans/2026-11-22-dashboard-sessions-print.md)
3. [Plan 3: Google Drive OAuth 2.0 Cloud Sync](file:///c:/Users/rapp/Documents/Projek/Snappy/docs/superpowers/plans/2026-11-22-dashboard-cloud-drive.md)
4. [Plan 4: Server-Backed Frame Studio & Live AR Overlay](file:///c:/Users/rapp/Documents/Projek/Snappy/docs/superpowers/plans/2026-11-22-dashboard-assets-frames-ar.md)
