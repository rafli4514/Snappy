# Desain: Smart QR Google Drive untuk Tamu

Tanggal: 2026-11-23
Status: Menunggu Persetujuan

## Tujuan & Latar Belakang

Saat ini QR code di layar selesai (`/print`) selalu mengarah ke galeri lokal (`http://<LAN-IP>:5173/gallery/<id>`), sehingga tamu wajib tersambung ke Wi-Fi photobooth untuk mengunduh foto. Dengan Google Drive Sync yang sudah aktif, kita ingin tamu bisa memindai QR langsung dari **kuota data HP (4G/5G)** di luar Wi-Fi lokal, dengan fallback otomatis ke galeri LAN saat photobooth offline atau Google Drive tidak aktif.

## Ruang Lingkup

### Termasuk (Goals)

- Memberikan izin lihat publik (_anyone with the link = viewer_) secara otomatis **khusus pada folder sesi** (`sesi-<id>`), bukan pada folder root atau folder tanggal.
- Menambahkan pengaturan **Mode QR Tamu** (`Smart: Drive -> LAN` / `Lokal`) dan **Akses Publik Folder Sesi** di tab **Google Drive** pada `/dashboard/settings`.
- Menambahkan endpoint ringan untuk memantau status sinkronisasi & URL Drive per sesi.
- Memperbarui panel QR di `/print` memakai **Pendekatan 1** (siapkan folder Drive dulu ~2–3 detik, langsung tampilkan QR Drive sambil berkas foto/video lanjut diunggah di latar belakang, dengan fallback otomatis ke LAN jika offline/timeout dan tombol alih cepat `Google Drive` ↔ `Wi-Fi Lokal`).

### Tidak Termasuk (Non-Goals)

- Tidak membangun server/domain publik atau proxy galeri web baru (tamu membuka folder Google Drive secara langsung).
- Tidak meminta login ulang OAuth (scope `drive.file` yang sudah aktif sudah mendukung pembuatan izin publik pada folder buatan aplikasi).

### Anti-Goals

- Jangan pernah menampilkan QR Google Drive yang masih privat (akan memicu layar "Minta Akses" di HP tamu).
- Jangan pernah mengganti gambar QR secara tiba-tiba setelah fallback ke LAN tampil agar tamu tidak salah scan di tengah jalan.
- Jangan membocorkan kredensial/token OAuth di endpoint baru.

## Pendekatan yang Dipertimbangkan

1. **Siapkan Folder Drive dulu (~2–3 detik), tampilkan QR Drive sambil berkas diunggah (Dipilih)**
   - Begitu sesi disimpan, backend langsung membuat folder `sesi-<id>`, menerapkan izin publik `anyone:reader`, dan langsung menyimpan `drive_folder_url` + `is_public = 1` ke SQLite _sebelum_ mengunggah berkas foto/strip/video satu per satu.
   - `/print` menunggu singkat (maks. 8 detik) hingga folder publik siap, lalu menampilkan QR Drive + indikator progres unggah (`2/5 berkas`). Jika offline/gagal/timeout, otomatis fallback ke QR Wi-Fi Lokal.
   - _Alasan dipilih:_ Tamu tidak pernah salah scan link LAN saat online dan tidak perlu menunggu unggahan video MP4 selesai.
2. **Tampilkan QR LAN instan lalu ganti otomatis ke QR Drive**
   - Ditolak karena tamu yang langsung mengarahkan kamera HP di detik pertama bisa terlanjur memindai link LAN.
3. **Tunggu 100% berkas selesai terunggah baru tampilkan QR Drive**
   - Ditolak karena waktu tunggu 8–20 detik terlalu lama untuk antrean photobooth.

## Rancangan Teknis

### 1. Skema SQLite (`backend/src/db/migrations.rs`)

Migrasi kolom idempoten (cek `PRAGMA table_info` sebelum `ALTER TABLE ADD COLUMN`):

- Tabel `cloud_config`:
  - `public_share INTEGER NOT NULL DEFAULT 1`
  - `qr_mode TEXT NOT NULL DEFAULT 'smart'` (`'smart'` | `'local'`)
- Tabel `cloud_session_sync`:
  - `is_public INTEGER NOT NULL DEFAULT 0`
  - `total_files INTEGER NOT NULL DEFAULT 0`

### 2. Backend Rust (`backend/src/routes/cloud.rs`, `gallery.rs`, `mod.rs`)

- **Drive Permissions API:** Tambah fungsi `ensure_folder_public_read()` yang memanggil `POST {drive_files_url}/{folder_id}/permissions?fields=id` dengan `{ "role": "reader", "type": "anyone" }` tepat setelah folder `sesi-<id>` dibuat (dan juga saat retry bila `public_share = true` dan `is_public = false`).
- **Urutan Sync Worker:** Setelah folder siap & izin publik diterapkan, segera `upsert_sync_state` (`status = 'processing'`, `drive_folder_url`, `is_public`, `total_files`) sebelum loop unggah berkas dimulai.
- **Konfigurasi:** `GET /api/cloud/google/status` dan `PUT /api/cloud/google/config` menambahkan field `publicShare` dan `qrMode`.
- **Respons Simpan Sesi:** `POST /api/gallery` menambahkan field `cloudEligible: bool` (`qr_mode == 'smart' && auto_sync && connected && !needs_reconnect && public_share`) agar `/print` langsung tahu apakah perlu menunggu Drive atau langsung menampilkan QR LAN tanpa jeda.
- **Endpoint Status Sesi Baru:** `GET /api/cloud/sync/:session_id` mengembalikan `{ ok, sessionId, qrMode, cloudEligible, status, isPublic, driveFolderUrl, uploadedCount, totalFiles, error }`.

### 3. Frontend (`PrintScreen.svelte`, `gallery.ts`, `settings/+page.svelte`)

- **Pengaturan (`/dashboard/settings?tab=cloud`):** Tambah pilihan **Mode QR Tamu** (`Smart (Drive → LAN)` | `Lokal (Wi-Fi LAN)`) dan toggle **Akses Publik Folder Sesi** di kartu _Preferensi Sinkronisasi_.
- **Layar Cetak (`/print`):**
  - Render strip + simpan `POST /api/gallery` terlebih dahulu sambil menyiapkan URL LAN lokal.
  - Jika `cloudEligible` = `false` → langsung tampilkan QR Wi-Fi Lokal.
  - Jika `cloudEligible` = `true` → polling `GET /api/cloud/sync/:session_id` (tiap 700ms, batas tunggu awal 8 detik):
    - Begitu `driveFolderUrl` ada dan `isPublic === true`, langsung render QR Google Drive + badge progres unggah hingga `done`.
    - Jika `failed` atau lewat 8 detik, fallback ke QR Wi-Fi Lokal. Jika Drive baru siap belakangan setelah fallback, tampilkan tombol ganti ke QR Drive tanpa memaksa QR melompat otomatis.
  - Saat kedua URL tersedia (Drive publik & LAN lokal), tampilkan tombol kecil `Google Drive` | `Wi-Fi Lokal` di kartu QR.

### 4. Verifikasi (TDD)

- Tambah tes integrasi Rust di `backend/tests/cloud_drive_test.rs`:
  1. Konfigurasi `publicShare` & `qrMode` tersimpan dan muncul di `/api/cloud/google/status`.
  2. Sync membuat izin publik `anyone:reader` pada folder sesi (bukan folder tanggal/root), mencatat `isPublic: true` + `totalFiles`, dan tidak memanggil API permissions dua kali saat retry.
  3. Endpoint `GET /api/cloud/sync/:session_id` mengembalikan progres dan status akurat (termasuk saat gagal / belum publik).
  4. `POST /api/gallery` mengembalikan `cloudEligible` sesuai konfigurasi.
- Jalankan `cargo test`, `npm run lint`, `npm run check`, `npm run build`, dan uji langsung di `/dashboard/settings?tab=cloud` + `/print`.
