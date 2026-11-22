# Desain: Link Google Drive di Galeri QR & Akses Kamera Mobile (HTTPS)

Tanggal: 2026-11-23
Status: Menunggu Persetujuan

## Tujuan & Latar Belakang

1. Saat tamu memindai QR galeri web (`/gallery/[id]`), mereka ingin tetap melihat halaman galeri interaktif DISTUDIO sekaligus memiliki tombol langsung untuk membuka folder **Google Drive** sesi tersebut.
2. Perangkat mobile (HP Android / iOS) yang membuka DISTUDIO di jaringan lokal harus dapat mengakses **kamera HP** dengan andal (tanpa diblokir `http://` dan tanpa layar hitam akibat pemanggilan ganda `getUserMedia`).

## Ruang Lingkup

### Termasuk (Goals)

- **Tombol Google Drive di `/gallery/[id]` ([GalleryScreen.svelte](file:///c:/Users/rapp/Documents/Projek/Snappy/src/lib/page/gallery/GalleryScreen.svelte)):** Otomatis memeriksa `GET /api/cloud/sync/[id]` (dengan polling ringan bila masih mengunggah) dan menampilkan tombol pill **"Google Drive"** tepat di sebelah tombol `Unduh Semua` begitu folder publik siap.
- **Mode QR 3-Pilihan + URL Publik Opsional:**
  - `cloud_config.qr_mode` mendukung `'smart'` (QR langsung ke Drive saat online, fallback Galeri Web), `'gallery'` (QR ke `/gallery/[id]` yang memuat tombol Drive), dan `'local'` (Wi-Fi Lokal).
  - Kolom baru `cloud_config.public_base_url` (migrasi SQLite idempoten) agar jika operator memakai Cloudflare Tunnel / VPS HTTPS (`https://...`), QR Galeri Web otomatis memakai alamat HTTPS publik tersebut.
  - Pengaturan di `/dashboard/settings?tab=cloud` dan panel QR `/print` mendukung ketiga mode tersebut.
- **Perbaikan Kamera Mobile ([camera.ts](file:///c:/Users/rapp/Documents/Projek/Snappy/src/lib/services/camera.ts), [CameraScreen.svelte](file:///c:/Users/rapp/Documents/Projek/Snappy/src/lib/page/camera/CameraScreen.svelte)):**
  - Hapus pemanggilan `getUserMedia` kedua di dalam `hasMultipleCameras()` (langsung pakai `enumerateDevices()` setelah stream pertama aktif) agar kamera Android/iOS tidak terkunci atau layar hitam.
  - Fallback constraint berjenjang (`ideal 1280×960` → `{ facingMode }` → `video: true`) jika kamera HP menolak resolusi tertentu.
  - Deteksi konteks tidak aman (`!window.isSecureContext` / `navigator.mediaDevices` kosong) dengan pesan error berbahasa Indonesia yang jelas + tombol buka versi `https://`.
- **Mode HTTPS Lokal (`npm run dev:https`):**
  - Tambahkan devDependency `@vitejs/plugin-basic-ssl` yang aktif hanya saat `--mode https` (`DISTUDIO_HTTPS=1`) di [vite.config.ts](file:///c:/Users/rapp/Documents/Projek/Snappy/vite.config.ts), sehingga `npm run dev` tetap HTTP (OAuth Google `http://localhost:5173` aman), sementara `npm run dev:https` langsung membuka `https://<IP-LAN>:5173` untuk kamera HP di 1 Wi-Fi.
  - Perbaiki `resolveGalleryUrl()` di [gallery.ts](file:///c:/Users/rapp/Documents/Projek/Snappy/src/lib/services/gallery.ts) agar memakai `publicBaseUrl` (jika diisi) atau `window.location.protocol` (bukan hardcode `http://`).

### Tidak Termasuk (Non-Goals)

- Tidak memasang binary eksternal (`cloudflared` / `mkcert`) ke OS; cukup menyiapkan dukungan `publicBaseUrl` dan `npm run dev:https`.
- Tidak mengubah perilaku mirror selfie di `capture.ts`.

### Anti-Goals

- Jangan merusak callback OAuth Google `http://localhost:5173/api/cloud/google/callback` saat menjalankan `npm run dev` normal.
- Jangan menampilkan tombol Google Drive di `/gallery/[id]` jika folder masih privat (`isPublic === false`).

## Pendekatan yang Dipertimbangkan

1. **Galeri Web + Tombol Google Drive + HTTPS Lokal (`@vitejs/plugin-basic-ssl`) & Opsional URL Publik (Dipilih)**
   - Tanpa instalasi tool eksternal, langsung bisa dipakai di 1 Wi-Fi (`npm run dev:https`), dan siap naik ke domain publik/tunnel kapan saja lewat field `URL Publik Galeri`.
2. **Cloudflare Quick Tunnel sebagai satu-satunya jalur HTTPS**
   - Ditolak sebagai ketergantungan wajib karena butuh install binary `cloudflared`, butuh internet aktif, dan URL berubah tiap restart.

## Verifikasi (TDD)

- Tes integrasi Rust di `backend/tests/cloud_drive_test.rs`:
  - Migrasi idempoten kolom `public_base_url`.
  - Validasi `qrMode` (`smart` | `gallery` | `local`) + normalisasi & sanitasi `publicBaseUrl` (hanya `http://`/`https://` atau kosong, hapus trailing slash).
  - `POST /api/gallery` mengembalikan `cloudEligible: false` saat `qrMode = "gallery"` (agar `/print` langsung tampilkan QR Galeri Web tanpa menunggu 8 detik, sementara auto-sync Drive tetap berjalan di background!).
  - `GET /api/cloud/sync/:id` tetap mengembalikan `driveFolderUrl` + `isPublic` untuk tombol Google Drive di `/gallery/[id]`.
- Verifikasi `cargo test`, `npm run lint`, `npm run check`, `npm run build`, dan cek startup `npm run dev:https`.
