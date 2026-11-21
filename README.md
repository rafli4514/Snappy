# DISTUDIO Photobooth

Aplikasi kiosk photobooth layar sentuh modern berbasis web yang dibangun dengan **SvelteKit 3**, **Svelte 5 (Runes)**, dan **Tailwind CSS v4 + daisyUI**.

---

## Fitur Utama

- **Format Strip Lengkap (1–6 Foto)**:
  - _Big Shot_ (1 foto, landscape 1800×1200)
  - _Two Up_ (2 foto, 1200×1800 dengan 2-copy cut line di x=600)
  - _Three Up_ (3 foto, 1200×1800)
  - _Two by Two_ (4 foto, 1200×1800)
  - _Five Up_ (5 foto, 1200×1800)
  - _Six Up_ (6 foto, 1200×1800)
- **Kamera Interaktif**: Countdown otomatis, flash layar, auto-mirroring (selfie view), dan opsi ganti kamera.
- **Review & Retake**: Pratinjau hasil tangkapan foto dengan zoom modal dan opsi retake per frame tanpa mengulang seluruh sesi.
- **Editor & Decorate**: Penyesuaian frame, filter warna visual, stiker dekoratif, date stamp, dan caption teks kustom.
- **Rendering 300 DPI Presisi**: Mesin rendering kanvas terpusat (`#lib/utils/canvas`) untuk pratinjau, ekspor file PNG cetak, dan format strip kertas foto 4×6 inci.
- **Galeri QR & GIF Animasi**: Tamu dapat memindai QR code via smartphone di jaringan lokal (LAN) untuk mengunduh foto strip dan animasi GIF.
- **Admin Dashboard**: Manajemen aset (frame, filter, stiker), pemantauan antrean cetak, sinkronisasi cloud, dan riwayat sesi.

---

## Alur Kiosk

```
/ (Mulai) ──> /strip (Pilih Jumlah Foto) ──> /camera (Ambil Foto) ──> /review (Tinjau/Retake)
                                                                            │
/gallery/[id] (Tamu Scan QR) <── /print (Cetak) <── /decorate <── /edit <──┘
```

---

## Menjalankan Projek

### 1. Instalasi Dependensi

```sh
npm install
```

### 2. Mode Pengembangan (Development)

```sh
npm run dev
```

Server Vite akan berjalan di `0.0.0.0:5173` (host binding aktif agar ponsel dapat memindai dan membuka tautan galeri QR melalui jaringan Wi-Fi lokal).

### 3. Pemeriksaan Tipe & Linting

```sh
npm run check
npm run lint
```

### 4. Build Produksi

```sh
npm run build
```

---

## Catatan Teknis

- **Client-Side SPA**: Seluruh layar kiosk dirender di sisi client (`ssr = false`, `prerender = false` di `src/routes/+layout.ts`).
- **Penyimpanan Lokal**: Frame kustom dan aset berukuran besar disimpan di IndexedDB (`distudio_photobooth_db` dan `distudio-frames`), sedangkan sesi galeri sementara disimpan di `.gallery_cache/`.
- **Akses Kamera**: Pengambilan kamera via browser memerlukan koneksi aman (`localhost` atau `https://`).
