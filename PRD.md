# Product Requirements Document (PRD)
## Inventory Lab — Sistem Manajemen Inventaris Sekolah

**Versi:** 1.0  
**Tanggal:** 20 Maret 2026  
**Status:** Draft

---

## 1. Ringkasan Eksekutif

**Inventory Lab** adalah aplikasi web untuk manajemen inventaris sekolah/laboratorium. Sistem ini memungkinkan pencatatan, pemantauan, dan pengelolaan aset sekolah secara digital—mulai dari peralatan lab komputer, lab IPA, hingga perlengkapan kelas—dengan kontrol akses berbasis peran yang terperinci.

### Masalah yang Diselesaikan
- Pencatatan inventaris sekolah masih manual (kertas/Excel), rawan kehilangan data
- Tidak ada visibilitas kondisi barang secara real-time
- Proses permintaan perbaikan (service request) tidak terstruktur
- Sulit mencetak label/kartu aset secara massal

---

## 2. Visi & Tujuan Produk

| Aspek | Detail |
|-------|--------|
| **Visi** | Satu platform digital untuk seluruh siklus hidup aset sekolah |
| **Target Pengguna** | Sekolah menengah dengan laboratorium komputer, IPA, dan kelas |
| **Pengguna Akhir** | Kepala lab, guru, sarpras, kepala sekolah, admin sistem |

### Tujuan Utama
1. Mendigitalisasi pencatatan inventaris per ruangan → per container → per item
2. Memberikan visibilitas kondisi aset secara real-time kepada seluruh pemangku kepentingan
3. Menyederhanakan alur permintaan dan penyelesaian perbaikan barang
4. Menghasilkan laporan inventaris otomatis dan label aset yang dapat dicetak

---

## 3. Peran Pengguna (User Roles)

Sistem memiliki **5 peran pengguna** dengan hak akses yang berbeda:

### 3.1 Admin
> Pengelola sistem, bukan pengelola inventaris.

- **Tanggung Jawab:** Manajemen akun pengguna, pengaturan hak akses, pemantauan log sistem
- **Cakupan Akses:** Panel admin terpisah (`/admin`)
- **Tidak Dapat Mengakses:** Modul inventaris, ruangan, laporan barang

### 3.2 Kepala Lab (`kepala_lab`)
> Pengelola utama inventaris laboratorium.

- **Tanggung Jawab:** CRUD ruangan & container, manajemen item, laporan bulanan, operasional
- **Cakupan Akses:** Semua fitur inventaris (full access)
- **Tidak Dapat Mengakses:** Manajemen pengguna, log sistem, cetak label/kartu aset

### 3.3 Guru (`guru`)
> Pengguna aktif lab, pelapor kondisi barang.

- **Tanggung Jawab:** Menginput kondisi barang, membuat service request, memantau dashboard
- **Cakupan Akses:** Ruangan (full), manajemen item (full), operasional (full)
- **Tidak Dapat Mengakses:** Laporan, cetak label, manajemen pengguna

### 3.4 Kepala Sekolah (`kepala_sekolah`)
> Pemangku kepentingan tingkat manajemen, akses baca saja.

- **Tanggung Jawab:** Memantau kondisi inventaris, melihat laporan, menyetujui service request
- **Cakupan Akses:** Dashboard, ruangan (view), item (view), laporan (full), cetak label (view)
- **Tidak Dapat Mengakses:** Operasional, manajemen pengguna

### 3.5 Sarpras (`sarpras`)
> Tim sarana & prasarana, pengelola perbaikan dan pengadaan.

- **Tanggung Jawab:** Mengelola service request, manajemen barang, mencetak label/kartu aset, laporan
- **Cakupan Akses:** Service requests (full), manajemen barang (full), laporan (full), cetak label (full)
- **Tidak Dapat Mengakses:** Operasional, manajemen pengguna, log sistem

---

## 4. Matriks Akses Fitur

Tingkat akses: `full` = baca + tulis | `view` = baca saja | `none` = tidak ada akses

| Fitur | Admin | Kepala Lab | Guru | Kepala Sekolah | Sarpras |
|-------|-------|------------|------|----------------|---------|
| Dashboard | full | full | full | full | full |
| Ruangan & Inventaris | none | full | full | view | view |
| Permintaan Layanan | none | view | view | view | full |
| Manajemen Barang | none | full | full | view | full |
| Operasional | none | full | full | none | none |
| Laporan Bulanan | none | full | none | full | full |
| Cetak Label & Kode | none | none | none | view | full |
| Manajemen Pengguna | full | none | none | none | none |
| Log Sistem | full | none | none | none | none |

> **Catatan:** Admin memiliki portal terpisah `/admin`. Matriks akses dapat dikonfigurasi ulang oleh Admin melalui panel `Access Matrix`.

---

## 5. Modul & Fitur Utama

### 5.1 Autentikasi (`/login`)
- Login dengan username & password
- JWT token disimpan di `localStorage`
- Redirect otomatis berdasarkan peran: Admin → `/admin`, lainnya → `/`
- Logout hapus token & sesi

### 5.2 Portal Selection (Landing Page)
- Pengguna non-admin memilih portal aktif: **Lab** atau **Non-Lab**
- Portal menentukan filter ruangan yang ditampilkan

### 5.3 Dashboard (`/dashboard`)
- Statistik ringkas: total ruangan, total aset, kondisi aset (good/service/damaged/broken)
- Skor kesehatan inventaris (0–100%) berdasarkan persentase barang kondisi baik
- Log aktivitas terbaru (item masuk service, barang diperbarui, dll.)
- Notifikasi real-time: item masuk service, service request baru (per peran)

### 5.4 Ruangan & Inventaris (`/dashboard/rooms`)

#### Hierarki Data
```
Ruangan (Room)
  └── Container (Meja / Lemari / Rak)
        └── Item (Barang/Aset)
              └── Log Aktivitas Item
```

#### Manajemen Ruangan
- Daftar semua ruangan (difilter per portal: lab / non-lab)
- Tipe ruangan: `computer`, `physics`, `biology`, `classroom`, `office`, `warehouse`, `other`
- CRUD ruangan: tambah, edit, hapus
- Kapasitas ruangan

#### Manajemen Container
- Tipe container: `table` (meja), `cupboard` (lemari), `shelf` (rak)
- Posisi drag-and-drop di dalam layout ruangan
- Tambah container secara bulk
- Reorder container

#### Manajemen Item (dalam Container)
- Atribut item: nama, tipe, kondisi, status, spesifikasi, SKU, kategori
- **Kondisi:** `good` | `service` | `damaged` | `broken`
- **Status:** `available` | `in_use` | `maintenance` | `missing`
- Dukungan consumable (stok dengan satuan, minimum stok)
- Parameter custom (label-value pairs)
- Riwayat log per item (action + tanggal + detail)
- Foto/gambar item

### 5.5 Permintaan Layanan / Service Request (`/dashboard/service-requests`)

#### Alur Status
```
Guru/Kepala Lab mengajukan → pending
  → Sarpras menerima → accepted
    → Sarpras menyelesaikan → completed (outcome: repaired / broken)
  → Sarpras menolak → denied (dengan alasan penolakan)
```

- Notifikasi otomatis saat status berubah (kepala_lab dan sarpras)
- Filter berdasarkan status, ruangan, tanggal
- Catatan penolakan wajib diisi jika request ditolak
- Outcome resolusi: `repaired` (berhasil diperbaiki) atau `broken` (tidak bisa diperbaiki)

### 5.6 Manajemen Barang (`/dashboard/items`)
- Daftar semua item lintas ruangan
- Filter berdasarkan kondisi, status, kategori, tipe
- Soft delete: item dapat dinonaktifkan tanpa dihapus permanen
- Riwayat item yang dihapus/dinonaktifkan

### 5.7 Operasional (`/dashboard/operations`)
- Modul untuk kepala lab dan guru
- Aktivitas operasional harian: peminjaman, pengembalian, mutasi barang
- Log operasional

### 5.8 Laporan Bulanan (`/dashboard/reports`)
- Laporan inventaris per periode
- Rekap kondisi barang
- Tersedia untuk kepala lab, kepala sekolah, sarpras
- Kemungkinan ekspor (PDF/Excel)

### 5.9 Cetak Label & Kode (`/dashboard/print-assets`)
- **Cetak Label Aset:** Stiker untuk ditempelkan pada barang
- **Cetak Kartu Aset:** Kartu identifikasi barang
- **Kode Inventaris:** Generate dan cetak kode unik per item (QR/barcode)
- Sarpras: full access (generate + cetak)
- Kepala Sekolah: view only (tidak bisa generate baru)

### 5.10 Panel Admin (`/admin`)

#### Dashboard Admin
- Statistik pengguna aktif
- Overview kesehatan sistem

#### Manajemen Pengguna (`/admin/users`)
- CRUD pengguna: tambah, edit, hapus
- Assign peran: admin, kepala_lab, guru, kepala_sekolah, sarpras
- `labScope`: opsional, membatasi kepala_lab ke lab tertentu
- Upload avatar pengguna

#### Access Matrix (`/admin/access-matrix` via UI)
- Konfigurasi hak akses per fitur per peran (full/view/none)
- Reset matrix ke default
- Perubahan berlaku real-time

#### Log Sistem (`/admin/system-logs`)
- Audit trail seluruh aktivitas sistem
- Filter berdasarkan tanggal, aksi, pengguna

### 5.11 Profil Pengguna (`/dashboard/profile`, `/admin/profile`)
- Edit nama, email, nomor telepon, avatar
- Ganti password

---

## 6. Model Data

### Entitas Utama

```
User
  id, username, name, email, phone, role, labScope, avatar

Room
  id, name, category (lab/non-lab), type, customType, capacity
  └── containers[]

Container
  id, name, type (table/cupboard/shelf), status, position {x, y}
  └── items[]

Item
  id, name, type, category, SKU, condition, status,
  specs, isConsumable, quantity, unit, minStock,
  image_layer, parameters[]
  └── logs[]

ItemLog
  id, date, action, details

ServiceRequest
  id, componentId, componentName, stationId, stationName,
  roomId, roomName, description, requesterName, componentSku,
  componentCategory, status, requestDate, resolutionDate,
  rejectionReason, resolutionOutcome

AccessMatrix
  feature × role → level (full/view/none)
```

---

## 7. Alur Pengguna Utama

### Alur 1: Kepala Lab Menambah Item Baru
1. Login → Pilih portal (lab/non-lab)
2. Buka Ruangan → Pilih container
3. Klik "Tambah Item" → Isi form (nama, tipe, kondisi, dll.)
4. Simpan → Item muncul di container, log dibuat otomatis

### Alur 2: Guru Membuat Service Request
1. Login → Open room detail
2. Temukan item yang rusak/perlu perbaikan
3. Klik "Ajukan Perbaikan" → Isi deskripsi masalah
4. Submit → Status `pending`, notifikasi dikirim ke Sarpras

### Alur 3: Sarpras Mengelola Service Request
1. Login → Buka menu Permintaan Layanan
2. Lihat daftar `pending` request
3. Terima (`accepted`) atau Tolak (`denied`) dengan alasan
4. Jika diterima: Selesaikan (`completed`) dengan outcome perbaikan

### Alur 4: Admin Mengelola Pengguna
1. Login → Panel Admin (`/admin`)
2. Buka Manajemen Pengguna
3. Tambah/Edit/Hapus user, assign peran
4. Opsional: Sesuaikan Access Matrix jika diperlukan

---

## 8. Notifikasi & Real-Time

| Trigger | Penerima | Tipe |
|---------|----------|------|
| Item masuk kondisi `service` / status `maintenance` | Guru (di ruangan yang sama) | Warning toast + notification |
| Service request baru dibuat | Sarpras | Warning toast + notification |
| Service request `accepted` | Kepala Lab | Success toast + notification |
| Service request `denied` | Kepala Lab | Error toast + notification |

- Auto-refresh data inventaris setiap **15 detik** (jika tab aktif)
- Auto-refresh service requests setiap **15 detik** (jika tab aktif)

---

## 9. Non-Functional Requirements

| Aspek | Requirement |
|-------|-------------|
| **Autentikasi** | JWT Token, disimpan di localStorage, validasi di setiap request API |
| **Keamanan** | Endpoint backend memvalidasi token; role admin dikunci (tidak bisa diubah via matrix) |
| **Performa** | Auto-refresh berkala; optimistic update pada perubahan room |
| **Responsivitas** | Antarmuka responsif untuk desktop dan mobile |
| **Internasionalisasi** | Dukungan multi-bahasa via LanguageContext (Bahasa Indonesia default) |
| **Portabilitas** | Berjalan via Docker (web + MySQL + phpMyAdmin) atau XAMPP/Laragon |

---

## 10. Tech Stack

| Layer | Teknologi |
|-------|-----------|
| **Frontend** | React 18 + TypeScript + Vite |
| **Styling** | Tailwind CSS |
| **Routing** | React Router v6 |
| **State Management** | React Context API |
| **Backend** | PHP Native (REST API) |
| **Database** | MySQL |
| **Containerisasi** | Docker + Docker Compose |
| **Dev Tools** | phpMyAdmin, ESLint, Vitest |
| **Deployment** | Vercel (frontend), Docker (backend) |

### Struktur API Endpoint

| Path | Fungsi |
|------|--------|
| `POST /auth/login.php` | Login |
| `GET/POST/PUT/DELETE /users/users.php` | CRUD pengguna |
| `GET/POST/PUT/DELETE /inventory/rooms.php` | CRUD ruangan, container, item |
| `GET/POST/PUT /service_requests/requests.php` | CRUD service request |
| `GET/PUT/POST /access_matrix/matrix.php` | Baca & ubah access matrix |
| `GET /system_logs/logs.php` | Log sistem |
| `GET /preferences/...` | Preferensi pengguna |

---

## 11. Out of Scope (v1.0)

- Notifikasi email / push notification eksternal
- Integrasi dengan sistem keuangan / pengadaan
- Mobile native app (iOS/Android)
- Multi-sekolah / multi-tenant
- Offline mode / PWA

---

## 12. Kriteria Penerimaan (Acceptance Criteria)

| Fitur | Kriteria |
|-------|----------|
| Login | Pengguna berhasil login, token tersimpan, redirect sesuai role |
| CRUD Room | Admin room bisa tambah/edit/hapus; kepala sekolah hanya bisa lihat |
| Service Request | Guru bisa buat request; hanya sarpras bisa ubah status |
| Access Matrix | Admin bisa ubah; perubahan berlaku tanpa restart |
| Laporan | Kepala sekolah bisa lihat laporan; guru tidak bisa akses |
| Cetak Label | Sarpras bisa generate dan cetak; kepala sekolah view only |
| Auto-refresh | Data inventaris & request ter-update otomatis tiap 15 detik |
