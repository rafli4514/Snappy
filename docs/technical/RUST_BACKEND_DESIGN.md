# Desain Teknis Core Backend Rust (`Axum` + `SQLite`) — DISTUDIO Photobooth

Dokumen ini menjadi spesifikasi teknis **Tahap 1** untuk migrasi backend DISTUDIO Photobooth dari penyimpanan file JSON SvelteKit ke core server Rust (`Axum` + `SQLite`), sesuai rancangan arsitektur di papan Miro (**Frame 4–7**).

---

## 1. Arsitektur Hybrid (1 Codebase, 3 Mode Eksekusi)

Satu crate library `distudio_backend` (`backend/`) menjadi pusat API dan persistensi untuk seluruh mode:

1. **Development Mode (HMR + API Proxy):** Frontend berjalan di Vite (`0.0.0.0:5173`), sedangkan request `/api/*` diteruskan oleh `src/hooks.server.ts` ke server Rust (`127.0.0.1:3001`, otomatis dinyalakan jika belum berjalan).
2. **Production Web App (LAN Booth atau VPS Publik):** Binary `distudio-server` menyajikan `/api/*` sekaligus static build frontend pada satu port tanpa membutuhkan Node.js.
3. **Desktop Mode Windows (`.exe` via Tauri v2 — Tahap 2):** Aplikasi Tauri memanggil `distudio_backend::start_server(config)` di thread background sehingga kiosk fullscreen dan QR galeri LAN langsung aktif tanpa terminal.

---

## 2. Tata Letak Penyimpanan Disk (`.gallery_cache/`)

Seluruh payload biner besar (foto kamera, strip, GIF, video MP4, artwork frame, stiker, AR overlay, thumbnail ukuran kustom) dipisah dari database agar kueri SQLite tetap cepat:

```text
.gallery_cache/
├── distudio.db                  # Single-file SQLite database (metadata & relasi)
├── sessions/
│   └── <session_id>/
│       ├── strip.<ext>          # File biner hasil photo strip (PNG/JPG/WebP)
│       ├── photo-0.<ext>        # Foto asli kamera berurutan
│       ├── timelapse.gif        # Opsional animasi GIF
│       └── timelapse.mp4        # Opsional video timelapse MP4
└── custom-assets/
    ├── frames/                  # Artwork PNG/SVG template Frame Studio
    ├── stickers/                # Stiker PNG/WebP/GIF/SVG kustom
    ├── ar/                      # Overlay AR kamera transparan
    └── thumbnails/              # Thumbnail kustom ukuran frame
```

---

## 3. Skema Database SQLite (`distudio.db`)

Engine menggunakan `rusqlite` dengan fitur `bundled` (tertanam langsung ke binary) dan konfigurasi koneksi:

```sql
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;
```

### 9 Tabel Inti

| Tabel              | Primary Key      | Fungsi                                                                                                                                                  |
| :----------------- | :--------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `gallery_sessions` | `id TEXT`        | Indeks sesi galeri, `format_id`, `template_key`, path biner relatif `strip_path`, `gif_path`, `video_path`, `photo_count`, `created_at`                 |
| `gallery_photos`   | `id INTEGER`     | Foto jepretan per sesi (`session_id` FK ON DELETE CASCADE, `sort_order`, `file_path`, `mime_type`, `bytes`)                                             |
| `frame_sizes`      | `id TEXT`        | Ukuran frame kustom (`label`, `kind`, `px_w`, `px_h`, `cm`, `photos_json`, `default_count`, `thumbnail_path`)                                           |
| `frames`           | `id TEXT`        | Template Frame Studio (`name`, `format_id`, `slot_count`, `design_width`, `design_height`, `artwork_path`, `slots_json`, `focal`, `source`, `enabled`)  |
| `stickers`         | `db_id INTEGER`  | Katalog stiker kustom (`name`, `category`, `file_name`, `width`, `height`, `active`, `enabled`)                                                         |
| `filters`          | `key TEXT`       | Preset filter warna CSS/FFmpeg kustom (`name`, `category`, `css_filter`, `ffmpeg`, `enabled`)                                                           |
| `ar_assets`        | `id TEXT`        | Overlay AR kamera kustom (`name`, `file_name`, `mime_type`, `width`, `height`, `enabled`)                                                               |
| `queue_items`      | `id TEXT`        | Log antrean `print`, `cloud-sync`, dan `upload` (`status`, `title`, `ref_id`, `detail`, `source`)                                                       |
| `device_config`    | `id INTEGER = 1` | Pengaturan printer & layout cetak perangkat (`print_mode`, `printer_name`, `layout_mode`, `split_mode`, `auto_rotate`, `copies`, `fallback_to_browser`) |

---

## 4. Migrasi Otomatis Startup (Idempoten)

Saat server Rust menyala (`migrations::migrate_legacy_cache`):

1. Membaca `_device_config.json`, `_queue.json`, `_custom_frame_sizes.json`, `_custom_stickers.json`, `_custom_filters.json`, dan `_custom_ar.json` jika ada lalu memasukkannya dengan `INSERT OR IGNORE` (atau mengisi konfigurasi default bila `device_config.updated_at` masih kosong).
2. Memindai `<session_id>.json` di `.gallery_cache/` (mengabaikan file berawalan `_`). ID sesi yang sudah ada di tabel `gallery_sessions` dilewati tanpa membaca ulang JSON multi-MB. Sesi baru didekode data URL-nya menjadi file biner di `.gallery_cache/sessions/<session_id>/` dan disimpan ke `gallery_sessions` + `gallery_photos`.
3. Di sisi frontend (`src/lib/utils/frameStorage.ts`), template Frame Studio yang tersimpan di browser `IndexedDB` otomatis disinkronkan sekali ke `/api/assets/frames` saat `listFrames()` dipanggil.

---

## 5. Kontrak REST API (34 Endpoint + `/api/health`)

| Modul        | Method & Endpoint                                | Perilaku Server Rust                                                                      |
| :----------- | :----------------------------------------------- | :---------------------------------------------------------------------------------------- |
| Sistem       | `GET /api/health`                                | Status kesehatan server Rust + SQLite WAL (`{ ok: true, status: "healthy" }`)             |
| Galeri       | `POST /api/gallery`                              | Decode data URL ke biner `sessions/<id>/` + simpan `gallery_sessions` & `gallery_photos`  |
| Galeri       | `GET /api/gallery?list=1&limit=50`               | Daftar ringkas sesi galeri dari SQLite (`ORDER BY created_at DESC`, maks 200)             |
| Galeri       | `GET /api/gallery/:id`                           | Metadata sesi + URL streaming media (`/api/gallery/:id/strip`, `/media/...`)              |
| Galeri       | `DELETE /api/gallery/:id`                        | Hapus record SQLite (cascade `gallery_photos`), folder biner sesi, dan JSON lama bila ada |
| Galeri       | `GET /api/gallery/:id/strip`                     | Stream file biner strip (atau foto pertama sebagai fallback) dengan `Cache-Control`       |
| Galeri       | `GET /api/gallery/:id/media/:file`               | Stream foto/GIF/MP4 dengan dukungan HTTP `Range` (`206 Partial Content`)                  |
| Frame Studio | `GET /api/assets/frames`                         | Daftar frame kustom SQLite (filter opsional `enabled=1`, `formatId`, `slotCount`)         |
| Frame Studio | `POST /api/assets/frames`                        | Simpan artwork PNG/SVG ke `custom-assets/frames/` + metadata & slot ke SQLite             |
| Frame Studio | `PUT /api/assets/frames`                         | Perbarui metadata, slot, artwork, atau toggle `enabled` di SQLite                         |
| Frame Studio | `DELETE /api/assets/frames`                      | Hapus record SQLite & file artwork terkait                                                |
| Frame Studio | `GET /api/assets/frames/:file`                   | Stream PNG/SVG artwork frame                                                              |
| Aset         | `GET /api/assets`                                | Gabungan `{ ok, stickers, filters, ar }` dari SQLite                                      |
| Aset         | `GET / POST / PUT / DELETE /api/assets/stickers` | Manajemen stiker kustom (upload multipart maks 4 MB + validasi dimensi)                   |
| Aset         | `GET /api/assets/stickers/:file`                 | Stream file stiker dari `custom-assets/stickers/`                                         |
| Aset         | `GET / POST / PUT / DELETE /api/assets/filters`  | Manajemen preset filter warna CSS/FFmpeg                                                  |
| Aset         | `GET / POST / PUT / DELETE /api/assets/ar`       | Manajemen overlay AR kamera (upload multipart maks 6 MB)                                  |
| Aset         | `GET /api/assets/ar/:file`                       | Stream file overlay AR dari `custom-assets/ar/`                                           |
| Aset         | `GET / POST / PUT / DELETE /api/frame-sizes`     | CRUD ukuran cetak/digital kustom + penyimpanan thumbnail                                  |
| Antrean      | `GET / POST / PATCH / DELETE /api/queue`         | CRUD log antrean (`print`, `cloud-sync`, `upload`) + KPI summary & context counts         |
| Printer      | `GET / PUT /api/settings/device`                 | Baca & simpan konfigurasi printer/layout cetak di `device_config`                         |
| Printer      | `GET /api/printers`                              | Enumerasi printer Windows via `Win32_Printer`                                             |
| Printer      | `POST /api/print`                                | Cetak langsung via Windows `System.Drawing.Printing.PrintDocument` + log ke `queue_items` |
| Printer      | `GET /api/network-ip`                            | Deteksi IPv4 LAN aktif untuk QR Galeri booth                                              |
