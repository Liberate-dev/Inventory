# Product Requirements Document (PRD) - Sistem Manajemen Inventaris

## 1. Pendahuluan
**Sistem Manajemen Inventaris** ini adalah aplikasi berbasis web yang dirancang untuk mengelola aset, ruangan, dan barang-barang inventaris di lingkungan instansi pendidikan (sekolah/laboratorium). Sistem ini memungkinkan pelacakan barang secara detail dari tingkat ruangan hingga ke dalam kontainer (penyimpanan) tertentu.

**Tech Stack:**
- **Frontend:** React, TypeScript, Vite, Tailwind CSS
- **Backend:** Native PHP (REST API, direktori `public/api/`)
- **Database:** MySQL

## 2. Aktor & Hak Akses (User Roles)
Sistem ini menggunakan *Role-Based Access Control* (RBAC) dengan peran-peran berikut:
1. **Admin:** Memiliki akses penuh terhadap sistem, termasuk manajemen pengguna (User Management) dan pengaturan global.
2. **Kepala Lab:** Mengelola inventaris pada lingkup laboratorium tertentu (contoh: Komputer, Biologi, Fisika, dll.).
3. **Guru:** Dapat melihat ketersediaan barang laboratorium dan membuat permintaan perbaikan atau layanan (Service Requests).
4. **Kepala Sekolah:** Memiliki akses tingkat eksekutif untuk melihat laporan (Reports) dan ringkasan (Overview).
5. **Sarpras (Sarana & Prasarana):** Mengelola ruangan non-lab, memantau aset secara keseluruhan, dan menangani serta menyetujui permintaan layanan (Service Requests) atas barang rusak.

## 3. Fitur Utama (Core Features)

### 3.1. Autentikasi & Authorization
- Login menggunakan pengamanan sistem *hashing* (bcrypt default PHP).
- *Landing Page / Portal Selection* yang mengarahkan pengguna ke *dashboard* yang sesuai dengan role serta mencegah akses ilegal menggunakan proteksi *routing* di sisi frontend.
- Pengaturan profil pengguna untuk mengelola informasi pribadi.

### 3.2. Manajemen Ruangan (Room Management)
- Mengklasifikasikan ruangan menjadi 2 kategori utama: ruang laboratorium (`lab`) dan bukan laboratorium (`non-lab`).
- Mendefinisikan tipe spesifik ruangan (komputer, fisika, biologi, kelas reguler, gudang, ruang kantor).
- Mengelola kapasitas dan detail untuk masing-masing ruangan.

### 3.3. Manajemen Kontainer (Container Management)
- Setiap ruangan bisa memiliki *container* untuk penyimpanan spesifik: meja, lemari, rak.
- Melacak posisi spasial kontainer di dalam ruang (`position_x`, `position_y`) memungkinkan pemetaan visual atau denah interaktif.
- Memantau kondisi kontainer itu sendiri (Status: baik, peringatan, error/rusak).

### 3.4. Manajemen Barang (Item Management)
- Mengelola barang yang diletakkan di dalam berbagai jenis *container*.
- Menyimpan parameter barang: spesifikasi teknis (disimpan dinamis lewat tipe JSON parameter), nama gambar, stok (*min_stock* & kuantitas berjalan), kategori, dan nomor SKU (*Stock Keeping Unit*).
- Status ketersediaan berlapis: status *inventory* (ketersediaan, dalam penggunaan, maintenance, bilang) vs kondisi fisik (barang baik, servis, patah, rusak ringan).
- Dukungan untuk tipe barang *Consumable* (barang habis pakai yang memengaruhi kalkulasi stok yang keluar/masuk) dan non-consumable (alat praktikum dll.).

### 3.5. Permintaan/Keluhan Layanan (Service Requests)
- Memungkinkan para guru/staf untuk melaporkan kerusakan instrumen secara sistematis agar diperbaiki oleh teknisi/Sarpras.
- *Workflow* pelacakan masalah otomatis: Menunggu/Pending ->  Diterima/Ditolak -> Terselesaikan (Completed).
- Mencakup laporan *history* perbaikan dan alasan saat permintaan layanan *maintenance* ditolak.

### 3.6. Laporan & Riwayat Aktivitas Log (Reports, Logs/Tracking)
- *Activity Log* barang/aset yang sangat padat (*Item Logs*) setiap kali barang ditambahkan, dipugar, atau diganti jumlahnya, mengutip ID pengguna yang membuat pembaruan (*full audit trail*).
- Halaman *Overview* yang menyajikan visualisasi/metrik penting saat pengguna baru *login*.
- Fitur pelaporan inventaris berkala kepada direktur sekolah (*Kepala Sekolah*).

## 4. Struktur Halaman & Navigasi (Sitemap)
Aplikasi dibangun sebagai *Single Page Application* (SPA):

- `/login` - Pintu Masuk
- `/` - Halaman Portal/Landing 
- `/dashboard/` - Tampilan Evaluasi/Ringkasan 
- `/dashboard/rooms` - Master Data Ruangan
- `/dashboard/rooms/:roomId` - Menampilkan Layout/Kontainer yang ada dalam satu buah ruangan
- `/dashboard/service-requests` - Halaman persetujuan & pencatatan keluhan perawatan alat
- `/dashboard/profile` - Akun Saya
- `/dashboard/admin/users` - Mengatur pengguna (*Hanya Admin*)
- `/dashboard/reports` - Generator Pelaporan
- `/dashboard/operations` - Menu Operasional Global (*Log masuk barang dll.*)
