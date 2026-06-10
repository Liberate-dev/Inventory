# Rencana Modul Akuntansi Aset Tetap
> Ekstensi dari sistem inventaris sekolah yang sudah ada.  
> Dokumen ini adalah spesifikasi lengkap untuk implementasi — mencakup fitur, logika bisnis, skema database, form, dan laporan.

**Konteks entitas:** Sekolah (negeri atau swasta/yayasan) — entitas non-profit, non-manufaktur.  
**Pengguna utama sistem:** Operator TU, Bendahara, Kepala Sekolah — bukan akuntan profesional.  
**Prinsip desain UI:** Jurnal dan istilah akuntansi disembunyikan dari user biasa. Yang ditampilkan adalah bahasa operasional: nilai aset, kondisi, perlu diganti, dan sebagainya.

---

## Daftar Isi

1. [Konteks & Ruang Lingkup](#1-konteks--ruang-lingkup)
2. [Entitas Database Baru](#2-entitas-database-baru)
3. [Fitur & Logika Bisnis](#3-fitur--logika-bisnis)
4. [Form & Input](#4-form--input)
5. [Laporan](#5-laporan)
6. [Alur Approval](#6-alur-approval)
7. [Audit Trail](#7-audit-trail)
8. [Integrasi dengan Modul Inventaris](#8-integrasi-dengan-modul-inventaris)
9. [Aturan & Constraint Bisnis](#9-aturan--constraint-bisnis)
10. [Referensi Istilah](#10-referensi-istilah)

---

## 1. Konteks & Ruang Lingkup

### Yang sudah ada (modul inventaris)
- Data barang/item dengan lokasi, kondisi, dan penanggungjawab
- Pencatatan stok masuk dan keluar
- Kategorisasi barang
- Manajemen lokasi dan pengguna

### Yang akan ditambahkan (modul akuntansi aset)
Modul ini menambahkan lapisan **finansial** di atas data inventaris yang sudah ada. Sebuah item inventaris dapat "dinaikkan" menjadi **aset tetap** jika memenuhi kriteria kapitalisasi, setelah itu berlaku siklus akuntansi aset penuh.

Tujuan utama modul ini untuk konteks sekolah:
- Mengetahui **nilai riil aset sekolah** yang masih tersedia (bukan nilai beli asli)
- Merencanakan **anggaran penggantian** aset (RKAS) berdasarkan data yang akurat
- Menyediakan **laporan pertanggungjawaban** ke dinas pendidikan, yayasan, BPK, atau komite sekolah
- Memastikan **jejak audit** yang bersih untuk setiap perubahan aset

### Apa yang TIDAK berubah
- Tabel inventaris existing tidak dimodifikasi secara destructive
- Modul inventaris tetap berjalan mandiri
- Relasi ke inventaris bersifat **opsional** — aset bisa didaftarkan tanpa item inventaris yang sudah ada

### Siklus hidup aset yang ditopang sistem
```
Perolehan → Aktif (penyusutan berjalan tiap periode)
                ↓ [jika rusak/tidak dipakai]
            Tidak Aktif (menunggu keputusan)
                ↓ [setelah ada keputusan resmi]
            Pelepasan (dijual / dihapus / dihibahkan)
```

Catatan khusus sekolah: aset yang rusak atau tidak lagi dipakai **tidak langsung dihapus**. Ada tahap "Tidak Aktif" sebagai jeda sebelum keputusan resmi diambil. Ini penting agar laporan aset aktif tidak menyesatkan — aset rusak tidak boleh kelihatan sebagai kapasitas aktif sekolah.

---

## 2. Entitas Database Baru

### 2.1 `asset_categories`
Kategori aset tetap yang menentukan aturan penyusutan default. Contoh data sudah disesuaikan untuk kebutuhan umum sekolah.

| Kolom | Tipe | Keterangan |
|---|---|---|
| `id` | UUID / PK | |
| `name` | VARCHAR(100) | Nama kategori, mis. "Peralatan Komputer" |
| `gl_account_code` | VARCHAR(20) | Kode akun buku besar untuk aset jenis ini |
| `accumulated_dep_account_code` | VARCHAR(20) | Kode akun akumulasi penyusutan |
| `depreciation_expense_account_code` | VARCHAR(20) | Kode akun beban penyusutan |
| `default_depreciation_method` | ENUM | `straight_line`, `declining_balance` |
| `default_useful_life_months` | INT | Masa manfaat default dalam bulan |
| `default_salvage_value_pct` | DECIMAL(5,2) | Persentase nilai residu dari harga perolehan (0–100) |
| `default_depreciation_rate` | DECIMAL(5,2) | Tarif penyusutan per tahun (%) — untuk metode saldo menurun |
| `capitalization_threshold` | DECIMAL(15,2) | Nilai minimum agar aset dikapitalisasi, bukan langsung dibebankan |
| `is_depreciable` | BOOLEAN | False untuk tanah |
| `is_active` | BOOLEAN | |
| `created_at` | TIMESTAMP | |
| `updated_at` | TIMESTAMP | |

**Contoh data untuk sekolah:**
```
"Tanah"                    → Non-depreciable, threshold Rp 0
"Bangunan & Gedung"        → SL, 240 bulan (20 thn), tarif 5%, threshold Rp 10.000.000
"Peralatan Komputer & IT"  → SL, 48 bulan (4 thn), tarif 25%, threshold Rp 1.000.000
"Perabot & Furnitur"       → SL, 60 bulan (5 thn), tarif 20%, threshold Rp 500.000
"Peralatan Laboratorium"   → SL, 96 bulan (8 thn), tarif 12.5%, threshold Rp 1.000.000
"Peralatan Olahraga"       → SL, 60 bulan (5 thn), tarif 20%, threshold Rp 500.000
"Kendaraan Operasional"    → DB, 96 bulan (8 thn), tarif 25%, threshold Rp 5.000.000
"Peralatan Dapur/UKS"      → SL, 60 bulan (5 thn), tarif 20%, threshold Rp 300.000
"Buku Perpustakaan"        → SL, 60 bulan (5 thn), tarif 20%, threshold Rp 100.000
```

---

### 2.2 `assets`
Tabel induk aset tetap. Ini adalah tabel inti modul ini.

| Kolom | Tipe | Keterangan |
|---|---|---|
| `id` | UUID / PK | |
| `asset_number` | VARCHAR(30) | Nomor aset unik, auto-generate, contoh: `AST-2025-0001` |
| `name` | VARCHAR(200) | Nama aset lengkap |
| `description` | TEXT | Spesifikasi, nomor seri, warna, keterangan lain |
| `asset_category_id` | FK → `asset_categories` | |
| `inventory_item_id` | FK → tabel inventaris existing | NULL jika tidak terhubung ke inventaris |
| `acquisition_date` | DATE | Tanggal aset resmi dimiliki/diterima |
| `acquisition_cost` | DECIMAL(15,2) | Harga perolehan penuh (termasuk pajak, ongkir, instalasi) |
| `salvage_value` | DECIMAL(15,2) | Estimasi nilai residu di akhir masa manfaat |
| `depreciable_amount` | DECIMAL(15,2) | `acquisition_cost - salvage_value`, dihitung otomatis |
| `depreciation_method` | ENUM | Mengikuti kategori, tapi bisa di-override per aset |
| `useful_life_months` | INT | Masa manfaat dalam bulan |
| `depreciation_rate` | DECIMAL(5,2) | Tarif per tahun (%) — untuk metode saldo menurun |
| `depreciation_start_date` | DATE | Tanggal mulai dihitung penyusutan |
| `location_id` | FK → tabel lokasi existing | Lokasi fisik saat ini |
| `responsible_user_id` | FK → tabel users | Penanggungjawab aset |
| `condition` | ENUM | `new`, `good`, `fair`, `damaged` |
| `status` | ENUM | `active`, `inactive`, `fully_depreciated`, `disposed` |
| `inactive_reason` | TEXT | Wajib diisi jika status = `inactive` |
| `inactive_date` | DATE | Tanggal aset mulai tidak aktif |
| `document_reference` | VARCHAR(100) | Nomor nota/invoice/BAST pembelian |
| `funding_source` | ENUM | `dana_bos`, `dana_komite`, `hibah`, `apbd`, `yayasan`, `lainnya` |
| `vendor_name` | VARCHAR(200) | Nama pemasok |
| `notes` | TEXT | Catatan tambahan |
| `created_by` | FK → `users` | |
| `approved_by` | FK → `users` | NULL jika belum perlu approval |
| `created_at` | TIMESTAMP | |
| `updated_at` | TIMESTAMP | |

**Catatan kolom `funding_source`:**  
Kolom ini khusus untuk konteks sekolah. Aset yang dibeli dari Dana BOS, hibah dinas, atau komite sekolah punya implikasi pelaporan yang berbeda. Sumber dana dicatat agar laporan bisa difilter per sumber.

**Constraint penting:**
- `asset_number` harus UNIQUE dan tidak boleh pernah diubah setelah disimpan
- `acquisition_cost` harus > 0
- `salvage_value` harus >= 0 dan < `acquisition_cost`
- `depreciation_start_date` tidak boleh sebelum `acquisition_date`
- Status `disposed` bersifat final — tidak bisa dikembalikan ke status apapun
- Jika status diubah ke `inactive`, `inactive_reason` dan `inactive_date` wajib diisi

---

### 2.3 `depreciation_schedules`
Jadwal penyusutan per periode per aset, di-generate otomatis saat aset pertama kali disimpan.

| Kolom | Tipe | Keterangan |
|---|---|---|
| `id` | UUID / PK | |
| `asset_id` | FK → `assets` | |
| `period_year` | INT | Tahun periode, contoh: 2025 |
| `period_month` | INT | Bulan periode (1–12) |
| `opening_book_value` | DECIMAL(15,2) | Nilai buku di awal periode |
| `depreciation_amount` | DECIMAL(15,2) | Beban penyusutan periode ini |
| `accumulated_depreciation` | DECIMAL(15,2) | Total akumulasi sampai akhir periode ini |
| `closing_book_value` | DECIMAL(15,2) | Nilai buku di akhir periode |
| `is_prorata` | BOOLEAN | True jika periode ini dihitung pro-rata |
| `prorata_days` | INT | Jumlah hari yang dihitung (jika pro-rata) |
| `status` | ENUM | `scheduled`, `posted`, `voided` |
| `posted_at` | TIMESTAMP | Waktu jurnal diposting |
| `journal_entry_id` | FK → `journal_entries` | NULL sebelum diposting |
| `created_at` | TIMESTAMP | |

**Aturan generate jadwal:**
- Dibuat otomatis saat aset disimpan, mencakup seluruh masa manfaat
- Periode pertama: pro-rata jika `acquisition_date` bukan hari pertama bulan
- Periode terakhir: sisa nilai yang belum disusutkan (menghindari over-depreciation)
- Jika aset dilepas di tengah masa manfaat, baris setelah tanggal pelepasan di-void
- Jika ada kapitalisasi biaya tambahan, jadwal di-regenerate dari periode saat ini ke depan
- Aset dengan status `inactive` tetap dihitung penyusutannya — penyusutan baru berhenti saat `disposed`

**Formula per metode:**

*Garis Lurus (Straight-Line):*
```
monthly_dep = depreciable_amount / useful_life_months
```

*Saldo Menurun (Declining Balance):*
```
annual_dep  = opening_book_value × depreciation_rate / 100
monthly_dep = annual_dep / 12
// Bulan terakhir: sisakan sampai salvage_value, tidak boleh kurang
```

---

### 2.4 `depreciation_runs`
Header dari setiap batch depreciation run yang dijalankan bendahara/TU.

| Kolom | Tipe | Keterangan |
|---|---|---|
| `id` | UUID / PK | |
| `period_year` | INT | |
| `period_month` | INT | |
| `status` | ENUM | `draft`, `reviewed`, `posted`, `cancelled` |
| `total_assets_processed` | INT | Jumlah aset yang diproses |
| `total_depreciation_amount` | DECIMAL(15,2) | Total beban yang diposting |
| `run_by` | FK → `users` | User yang menjalankan kalkulasi |
| `reviewed_by` | FK → `users` | User yang me-review sebelum posting |
| `posted_by` | FK → `users` | User yang mengkonfirmasi posting |
| `run_at` | TIMESTAMP | Waktu kalkulasi dijalankan |
| `posted_at` | TIMESTAMP | Waktu posting dikonfirmasi |
| `notes` | TEXT | Catatan review jika ada |

**Constraint:**
- Hanya boleh ada **satu** `depreciation_run` per `period_year + period_month` dengan status `posted`
- Jika status `posted`, periode tersebut **dikunci** — tidak bisa ada run kedua
- Status `draft` boleh dibuat ulang jika run sebelumnya di-cancel sebelum posting

---

### 2.5 `depreciation_run_items`
Detail per aset dalam satu depreciation run.

| Kolom | Tipe | Keterangan |
|---|---|---|
| `id` | UUID / PK | |
| `depreciation_run_id` | FK → `depreciation_runs` | |
| `asset_id` | FK → `assets` | |
| `depreciation_schedule_id` | FK → `depreciation_schedules` | Baris jadwal yang dieksekusi |
| `depreciation_amount` | DECIMAL(15,2) | Beban yang diposting untuk aset ini |
| `is_included` | BOOLEAN | False jika di-exclude saat review |
| `exclusion_reason` | TEXT | Alasan exclusion jika `is_included = false` |
| `override_amount` | DECIMAL(15,2) | Jika operator override jumlah (perlu dicatat untuk audit) |
| `override_reason` | TEXT | Alasan override |

---

### 2.6 `asset_disposals`
Pencatatan pelepasan aset (jual, hapus, tukar, hibah).

| Kolom | Tipe | Keterangan |
|---|---|---|
| `id` | UUID / PK | |
| `asset_id` | FK → `assets` | |
| `disposal_date` | DATE | Tanggal pelepasan efektif |
| `disposal_method` | ENUM | `sold`, `written_off`, `traded_in`, `donated`, `stolen_lost` |
| `disposal_reason` | TEXT | Penjelasan alasan pelepasan |
| `book_value_at_disposal` | DECIMAL(15,2) | Nilai buku aset pada tanggal pelepasan (dihitung otomatis) |
| `accumulated_dep_at_disposal` | DECIMAL(15,2) | Akumulasi penyusutan pada tanggal pelepasan |
| `proceeds` | DECIMAL(15,2) | Nilai penjualan/penggantian (0 jika dihapus/dihibahkan) |
| `surplus_deficit` | DECIMAL(15,2) | `proceeds - book_value_at_disposal` — positif = surplus, negatif = defisit |
| `surplus_deficit_account_code` | VARCHAR(20) | Akun surplus/defisit pelepasan di buku besar |
| `document_reference` | VARCHAR(100) | Nomor berita acara / BAST penghapusan |
| `approved_by` | FK → `users` | Wajib diisi — tidak bisa disposal tanpa approval |
| `journal_entry_id` | FK → `journal_entries` | Jurnal yang dihasilkan |
| `created_by` | FK → `users` | |
| `created_at` | TIMESTAMP | |

**Catatan `surplus_deficit`:**  
Istilah "laba/rugi" diganti menjadi "surplus/defisit" karena sekolah adalah entitas non-profit. Secara akuntansi perlakuannya sama, hanya terminologi yang berbeda.

---

### 2.7 `asset_improvements`
Pencatatan biaya pasca-perolehan yang dikapitalisasi atau dibebankan langsung.

| Kolom | Tipe | Keterangan |
|---|---|---|
| `id` | UUID / PK | |
| `asset_id` | FK → `assets` | |
| `improvement_date` | DATE | |
| `description` | TEXT | Deskripsi pekerjaan/perbaikan |
| `type` | ENUM | `capitalized` (peningkatan) atau `expensed` (perbaikan biasa) |
| `amount` | DECIMAL(15,2) | |
| `funding_source` | ENUM | Sumber dana perbaikan (sama dengan opsi di `assets`) |
| `new_useful_life_months` | INT | Jika masa manfaat diperpanjang, isi nilai baru |
| `document_reference` | VARCHAR(100) | Nomor nota atau kontrak |
| `approved_by` | FK → `users` | |
| `journal_entry_id` | FK → `journal_entries` | |
| `recalculation_applied` | BOOLEAN | True jika jadwal penyusutan sudah di-regenerate |
| `created_by` | FK → `users` | |
| `created_at` | TIMESTAMP | |

---

### 2.8 `journal_entries`
Header jurnal akuntansi yang dihasilkan oleh modul aset. Tabel ini ada di belakang layar — tidak ditampilkan ke operator TU biasa, hanya ke bendahara dan kepala sekolah jika diperlukan.

| Kolom | Tipe | Keterangan |
|---|---|---|
| `id` | UUID / PK | |
| `journal_number` | VARCHAR(30) | Auto-generate, contoh: `JRN-2025-04-0018` |
| `entry_date` | DATE | Tanggal jurnal |
| `period_year` | INT | |
| `period_month` | INT | |
| `type` | ENUM | `acquisition`, `depreciation`, `disposal`, `improvement`, `adjustment` |
| `reference_id` | UUID | ID dari tabel sumber |
| `reference_type` | VARCHAR(50) | Nama tabel sumber |
| `description` | TEXT | Narasi jurnal |
| `total_debit` | DECIMAL(15,2) | Harus sama dengan `total_credit` |
| `total_credit` | DECIMAL(15,2) | |
| `status` | ENUM | `draft`, `posted` |
| `created_by` | FK → `users` | |
| `posted_by` | FK → `users` | |
| `posted_at` | TIMESTAMP | |
| `created_at` | TIMESTAMP | |

---

### 2.9 `journal_entry_lines`
Baris detail jurnal (debit/kredit per akun).

| Kolom | Tipe | Keterangan |
|---|---|---|
| `id` | UUID / PK | |
| `journal_entry_id` | FK → `journal_entries` | |
| `line_number` | INT | Urutan baris dalam jurnal |
| `account_code` | VARCHAR(20) | Kode akun buku besar |
| `account_name` | VARCHAR(100) | Nama akun (snapshot saat posting) |
| `debit_amount` | DECIMAL(15,2) | 0 jika baris kredit |
| `credit_amount` | DECIMAL(15,2) | 0 jika baris debit |
| `asset_id` | FK → `assets` | NULL jika baris agregat |
| `description` | TEXT | Narasi per baris |

---

### 2.10 `asset_audit_log`
Log immutable semua perubahan yang terjadi pada data aset.

| Kolom | Tipe | Keterangan |
|---|---|---|
| `id` | UUID / PK | |
| `asset_id` | FK → `assets` | |
| `event_type` | ENUM | Lihat daftar lengkap di Bagian 7 |
| `event_description` | TEXT | Narasi singkat kejadian dalam bahasa Indonesia yang mudah dipahami |
| `field_changed` | VARCHAR(100) | Nama field yang berubah (jika update) |
| `old_value` | TEXT | Nilai sebelum perubahan |
| `new_value` | TEXT | Nilai setelah perubahan |
| `reference_id` | UUID | ID dari transaksi terkait |
| `reference_type` | VARCHAR(50) | |
| `performed_by` | FK → `users` | |
| `ip_address` | VARCHAR(45) | |
| `user_agent` | TEXT | |
| `created_at` | TIMESTAMP | Waktu kejadian — tidak pernah diupdate |

**Aturan mutlak:**
- Tabel ini **tidak boleh ada operasi UPDATE atau DELETE** dari aplikasi
- Hanya INSERT yang diizinkan
- Hak akses ke tabel ini harus dibatasi di level database

---

### 2.11 `asset_documents`
Dokumen pendukung yang dilampirkan ke aset.

| Kolom | Tipe | Keterangan |
|---|---|---|
| `id` | UUID / PK | |
| `asset_id` | FK → `assets` | |
| `document_type` | ENUM | `purchase_invoice`, `bast`, `photo`, `inspection_report`, `disposal_document`, `other` |
| `file_name` | VARCHAR(255) | |
| `file_path` | TEXT | Path/URL file di storage |
| `file_size_bytes` | INT | |
| `uploaded_by` | FK → `users` | |
| `uploaded_at` | TIMESTAMP | |
| `notes` | TEXT | |

---

### 2.12 `stock_opname_sessions`
Sesi opname/inventarisasi aset.

| Kolom | Tipe | Keterangan |
|---|---|---|
| `id` | UUID / PK | |
| `session_name` | VARCHAR(100) | Nama sesi, contoh: "Inventarisasi Semester Ganjil 2025" |
| `opname_date` | DATE | |
| `scope` | ENUM | `all`, `by_location`, `by_category` |
| `scope_filter_id` | UUID | ID lokasi atau kategori jika bukan `all` |
| `status` | ENUM | `open`, `in_progress`, `completed`, `cancelled` |
| `created_by` | FK → `users` | |
| `completed_by` | FK → `users` | |
| `completed_at` | TIMESTAMP | |
| `notes` | TEXT | |

---

### 2.13 `stock_opname_items`
Hasil verifikasi per aset dalam satu sesi opname.

| Kolom | Tipe | Keterangan |
|---|---|---|
| `id` | UUID / PK | |
| `session_id` | FK → `stock_opname_sessions` | |
| `asset_id` | FK → `assets` | |
| `expected_location_id` | FK → lokasi | Lokasi di sistem sebelum opname |
| `actual_location_id` | FK → lokasi | Lokasi fisik saat ditemukan |
| `verification_status` | ENUM | `matched`, `location_mismatch`, `condition_mismatch`, `not_found` |
| `actual_condition` | ENUM | `good`, `fair`, `damaged`, `unusable` |
| `verified_by` | FK → `users` | Petugas yang melakukan verifikasi fisik |
| `verified_at` | TIMESTAMP | |
| `photo_document_id` | FK → `asset_documents` | Foto saat verifikasi |
| `notes` | TEXT | |

---

## 3. Fitur & Logika Bisnis

### 3.1 Pendaftaran Aset Baru

**Trigger:** Operator TU input aset baru atau aset dari inventaris dinaikkan statusnya.

**Logika:**
1. Validasi nilai perolehan ≥ `capitalization_threshold` kategori. Jika di bawah threshold, sistem beri peringatan bahwa barang ini sebaiknya dicatat sebagai barang pakai habis di inventaris, bukan sebagai aset tetap.
2. Hitung `depreciable_amount = acquisition_cost - salvage_value`.
3. Tentukan `depreciation_start_date`:
   - Default: tanggal 1 bulan berikutnya setelah `acquisition_date`
   - Bisa dikonfigurasi per sekolah: "bulan perolehan" atau "bulan berikutnya"
4. Generate seluruh `depreciation_schedules` dari `depreciation_start_date` hingga akhir masa manfaat.
5. Untuk periode pertama: jika `acquisition_date` bukan hari pertama bulan dan aturan sekolah adalah "bulan perolehan", hitung pro-rata:
   ```
   prorata_days = hari_tersisa_di_bulan_itu (termasuk hari perolehan)
   days_in_month = total_hari_di_bulan_tersebut
   dep_amount = monthly_dep × (prorata_days / days_in_month)
   ```
6. Simpan aset dengan status `active`.
7. Tulis ke `asset_audit_log` dengan `event_type = created`.
8. Generate nomor aset otomatis dengan format `AST-YYYY-NNNN`.

---

### 3.2 Perubahan Status ke Tidak Aktif (Inactive)

**Trigger:** Operator TU atau guru melaporkan aset rusak, tidak layak pakai, atau sedang dalam evaluasi sebelum dihapus.

**Tujuan:** Memisahkan aset yang masih produktif dari yang tidak — agar laporan kapasitas aset sekolah akurat. Ini tahap wajib sebelum disposal, menggantikan alur lama yang langsung dari `active` ke `disposed`.

**Logika:**
1. User pilih aset, pilih "Tandai Tidak Aktif"
2. Wajib isi `inactive_reason` (contoh: "Layar rusak", "Tidak berfungsi") dan `inactive_date`
3. Opsional: upload foto kondisi terkini
4. Status berubah ke `inactive`
5. Aset **tetap dihitung penyusutannya** selama status `inactive` — karena keputusan penghapusan belum resmi
6. Aset `inactive` **tidak muncul** di laporan kapasitas aktif, tapi **tetap muncul** di daftar aset total dan neraca
7. Tulis ke `asset_audit_log` dengan `event_type = status_changed`

**Tindak lanjut dari status `inactive`:**
- Aset ditemukan bisa diperbaiki → status kembali ke `active` (dengan catatan perbaikan)
- Aset memang harus dihapus → lanjut ke proses disposal dengan approval

---

### 3.3 Batch Depreciation Run

**Trigger:** Bendahara atau operator TU yang ditunjuk membuka menu "Hitung Penyusutan Aset" dan memilih periode. Di konteks sekolah, ini bisa dijadikan otomatis bulanan jika tidak ada user yang menjalankan manual.

**Validasi awal:**
- Pastikan tidak ada run dengan status `posted` untuk periode yang sama
- Pastikan periode yang dipilih tidak di masa depan

**Fase 1 — Kalkulasi (tidak ada yang disimpan ke DB):**
1. Ambil semua aset dengan status `active`, `inactive`, dan `fully_depreciated`
2. Untuk tiap aset, ambil baris `depreciation_schedules` yang sesuai periode
3. Tandai aset berdasarkan kondisi:
   - `normal`: aset aktif, proses biasa
   - `inactive`: aset tidak aktif, tetap dihitung tapi diberi label khusus
   - `prorata`: ada flag `is_prorata = true` di schedule
   - `fully_depreciated`: nilai 0, tetap tampil untuk transparansi
   - `disposed`: otomatis di-exclude
4. Return preview data ke UI tanpa menyimpan

**Fase 2 — Review:**
- Operator bisa exclude aset tertentu dengan mencatat alasan
- Semua intervensi dicatat di `depreciation_run_items`

**Fase 3 — Posting:**
1. Buat record `depreciation_runs` dengan status `posted`
2. Buat `depreciation_run_items` per aset
3. Update `depreciation_schedules.status = posted`
4. Buat `journal_entry` (di belakang layar, tidak ditampilkan ke operator):
   - Debit: Beban Penyusutan (per kategori)
   - Kredit: Akumulasi Penyusutan (per kategori)
5. Update `assets.status` menjadi `fully_depreciated` jika `closing_book_value = 0`
6. Tulis ke `asset_audit_log` untuk setiap aset yang diposting

**Otomatisasi untuk sekolah:**
Tambahkan opsi di konfigurasi: `auto_run_depreciation = true`. Jika aktif, sistem otomatis menjalankan batch run di hari terakhir tiap bulan tanpa perlu tindakan manual. Notifikasi dikirim ke bendahara setelah berhasil.

---

### 3.4 Pelepasan Aset (Disposal)

**Trigger:** Bendahara atau kepala sekolah memulai proses setelah keputusan resmi diambil. Aset harus sudah berstatus `inactive` sebelum bisa di-dispose.

**Validasi:**
- Aset harus berstatus `inactive` terlebih dahulu — tidak bisa langsung dari `active`
- Harus ada approval dari kepala sekolah
- Jika aset berasal dari Dana BOS atau hibah pemerintah, perlu field tambahan: nomor surat penghapusan dari dinas

**Logika:**
1. Hitung nilai buku pada tanggal pelepasan:
   ```
   Ambil closing_book_value dari schedule bulan sebelumnya
   Tambah penyusutan partial bulan berjalan jika disposal tidak di akhir bulan
   ```
2. Hitung surplus/defisit:
   ```
   surplus_deficit = proceeds - book_value_at_disposal
   ```
3. Generate jurnal pelepasan (di belakang layar):
   ```
   Dr. Kas / Rekening Sekolah           [sebesar proceeds, jika dijual]
   Dr. Akumulasi Penyusutan             [sebesar accumulated_dep_at_disposal]
   Dr. Defisit Pelepasan Aset           [jika surplus_deficit < 0]
     Cr. Aset Tetap — [kategori]        [sebesar acquisition_cost]
     Cr. Surplus Pelepasan Aset         [jika surplus_deficit > 0]
   ```
4. Update `assets.status = disposed`
5. Void semua baris `depreciation_schedules` yang belum posted
6. Tulis ke `asset_audit_log`

**Penting:** Surplus atau defisit dari pelepasan aset sekolah harus **ditampilkan secara eksplisit** di laporan ringkasan disposal — bukan hanya ada di jurnal. Ini untuk keperluan pertanggungjawaban ke komite sekolah dan dinas.

---

### 3.5 Kapitalisasi Biaya Perbaikan

**Trigger:** Bendahara mencatat pengeluaran untuk perbaikan atau peningkatan aset.

**Logika klasifikasi:**
- Sistem menampilkan panduan sederhana: "Apakah perbaikan ini membuat aset jadi lebih baik dari sebelumnya, atau hanya mengembalikan ke kondisi normal?"
  - Lebih baik / memperpanjang umur → Kapitalisasi (masuk nilai aset)
  - Kembalikan ke kondisi normal → Bebankan langsung

**Jika Kapitalisasi:**
1. Tambahkan `amount` ke `assets.acquisition_cost`
2. Hitung ulang `assets.depreciable_amount`
3. Jika masa manfaat diperpanjang, update `assets.useful_life_months`
4. Regenerate `depreciation_schedules` dari bulan berjalan ke depan
5. Generate jurnal (di belakang layar)

**Jika Bebankan:**
1. Tidak ada perubahan ke data aset
2. Generate jurnal beban pemeliharaan (di belakang layar)

---

### 3.6 Stock Opname / Inventarisasi Aset

**Trigger:** Kepala sekolah atau TU membuka sesi inventarisasi baru. Di sekolah biasanya dilakukan per semester atau per tahun ajaran.

**Alur:**
1. Buat sesi opname dengan nama, tanggal, dan cakupan (semua / per ruangan / per kategori)
2. Sistem generate checklist aset aktif + tidak aktif sesuai cakupan
3. Petugas scan barcode atau cari manual, isi kondisi aktual, lokasi aktual, upload foto
4. Aset tidak ditemukan → tandai `not_found`
5. Setelah selesai, session di-close dan laporan selisih di-generate otomatis

**Tindak lanjut hasil opname:**
- `not_found` definitif → inisiasi proses inactive dulu, baru disposal dengan metode `stolen_lost`
- `location_mismatch` → update lokasi di sistem
- `condition_mismatch` → update kondisi, jika rusak berat pertimbangkan ubah ke `inactive`

---

### 3.7 Nomor Aset (Asset Numbering)

**Format:** `AST-{YYYY}-{NNNN}`

```
year = tahun acquisition_date
sequence = MAX(sequence_number) untuk tahun tersebut + 1
asset_number = "AST-" + year + "-" + LPAD(sequence, 4, '0')
```

Nomor ini dikunci setelah assigned — tidak bisa diubah meski data lain diedit.

---

### 3.8 Konfigurasi Sekolah

| Key | Nilai default | Keterangan |
|---|---|---|
| `school_name` | — | Nama sekolah untuk header laporan |
| `school_npsn` | — | NPSN untuk identifikasi laporan |
| `dep_start_convention` | `next_month` | Kapan penyusutan mulai: `next_month` atau `acquisition_month` |
| `fiscal_year_start_month` | `7` | Bulan pertama tahun ajaran (7 = Juli, sesuai kalender sekolah) |
| `journal_level` | `by_category` | Level jurnal: `by_category` atau `by_asset` |
| `require_disposal_approval` | `true` | Pelepasan aset wajib approval kepala sekolah |
| `disposal_approval_role` | `principal` | Role yang bisa approve disposal |
| `auto_run_depreciation` | `false` | Jika true, batch run otomatis tiap akhir bulan |
| `enable_opname` | `true` | Aktifkan fitur inventarisasi |
| `opname_frequency_months` | `6` | Frekuensi inventarisasi — default per semester |
| `require_inactive_before_disposal` | `true` | Aset harus `inactive` sebelum bisa di-dispose |

---

## 4. Form & Input

### 4.1 Form Tambah Aset Baru

**Prinsip desain:** Operator TU tidak harus paham akuntansi. Form ini harus bisa diisi dengan mudah — penyusutan dihitung otomatis di belakang layar.

**Step 1 — Identitas Aset**

| Field | Tipe input | Validasi | Keterangan |
|---|---|---|---|
| Kategori aset | Tile/card selector | Wajib | Memicu auto-fill penyusutan |
| Nama aset | Text | Wajib, min 3 karakter | |
| Deskripsi / spesifikasi | Textarea | Opsional | Nomor seri, merek, warna |
| Ruangan / lokasi | Dropdown (dari data lokasi existing) | Wajib | |
| Penanggungjawab | Dropdown (dari data users) | Wajib | |
| Kondisi saat diterima | Radio: Baru / Baik / Cukup | Wajib | |
| Foto aset | File upload, multiple | Opsional | JPG, PNG, maks 5MB |

**Step 2 — Informasi Pembelian**

| Field | Tipe input | Validasi | Keterangan |
|---|---|---|---|
| Tanggal perolehan | Date picker | Wajib, tidak boleh masa depan | |
| Sumber dana | Dropdown | Wajib | Dana BOS / Dana Komite / Hibah / APBD / Yayasan / Lainnya |
| Nomor nota / BAST | Text | Opsional | |
| Nama vendor / toko | Text | Opsional | |
| Harga perolehan (Rp) | Number (currency) | Wajib, > 0 | |
| Nilai residu (Rp) | Number (currency) | Opsional, default 0 | Estimasi nilai sisa di akhir umur |
| Upload nota/dokumen | File upload | Opsional | JPG, PNG, PDF |

**Step 2 juga menampilkan (read-only, dihitung otomatis):**
- Metode penyusutan (dari kategori)
- Masa manfaat (dari kategori, bisa di-override)
- Perkiraan penyusutan per tahun dan per bulan
- Mini chart nilai buku dari tahun ke tahun

**Step 3 — Konfirmasi**
- Ringkasan semua data
- Peringatan pro-rata jika tanggal bukan hari pertama bulan
- Checkbox konfirmasi wajib
- Tombol simpan

---

### 4.2 Form Tandai Aset Tidak Aktif

| Field | Tipe input | Validasi | Keterangan |
|---|---|---|---|
| Aset | Read-only | — | Dari konteks |
| Tanggal tidak aktif | Date picker | Wajib | |
| Alasan tidak aktif | Dropdown + textarea | Wajib | Rusak / Tidak berfungsi / Hilang sementara / Dalam evaluasi / Lainnya |
| Kondisi saat ini | Radio: Rusak ringan / Rusak berat / Tidak berfungsi sama sekali | Wajib | |
| Foto kondisi | File upload | Disarankan | Bukti visual untuk audit |
| Catatan tambahan | Textarea | Opsional | |

**Tampilan otomatis (read-only):**
- Nilai buku saat ini
- Informasi bahwa penyusutan tetap berjalan selama status ini
- Langkah selanjutnya: "Setelah status ini, aset dapat diperbaiki (kembali aktif) atau dihapuskan dari catatan (perlu persetujuan kepala sekolah)"

---

### 4.3 Form Pelepasan Aset

**Catatan:** Form ini hanya bisa diakses jika aset sudah berstatus `inactive`. Jika aset masih `active`, sistem arahkan ke form "Tandai Tidak Aktif" dulu.

| Field | Tipe input | Validasi | Keterangan |
|---|---|---|---|
| Aset | Read-only | — | |
| Tanggal pelepasan | Date picker | Wajib | |
| Metode pelepasan | Dropdown | Wajib | Dijual / Dihapus / Ditukar / Dihibahkan / Hilang/Dicuri |
| Nilai jual (Rp) | Number (currency) | Wajib jika metode = Dijual | |
| Alasan pelepasan | Textarea | Wajib | |
| Nomor berita acara / BAST | Text | Disarankan | Nomor surat penghapusan |
| Nomor surat dinas | Text | Wajib jika sumber dana = Dana BOS atau Hibah | |
| Upload dokumen | File upload | Disarankan | Berita acara, foto kondisi akhir |

**Kalkulasi otomatis (read-only):**
- Nilai buku saat pelepasan
- Akumulasi penyusutan saat pelepasan
- Surplus/Defisit = Nilai jual − Nilai buku
- Penjelasan dalam bahasa sederhana: "Aset ini dijual seharga Rp X. Nilai bukunya saat ini Rp Y. Terdapat surplus/defisit sebesar Rp Z."

---

### 4.4 Form Biaya Perbaikan Aset

| Field | Tipe input | Validasi | Keterangan |
|---|---|---|---|
| Aset | Read-only | — | |
| Tanggal biaya | Date picker | Wajib | |
| Deskripsi perbaikan | Textarea | Wajib | |
| Jumlah biaya (Rp) | Number (currency) | Wajib, > 0 | |
| Sumber dana | Dropdown | Wajib | |
| Jenis pencatatan | Radio | Wajib | Dengan panduan teks |
| Masa manfaat baru (bulan) | Number | Aktif jika Kapitalisasi + masa manfaat berubah | |
| Nomor dokumen | Text | Opsional | |
| Upload dokumen | File upload | Opsional | |

**Teks panduan untuk pilihan Jenis pencatatan (bahasa sederhana):**
- **"Tambah ke nilai aset"** — Pilih ini jika perbaikan membuat aset lebih baik dari sebelumnya, memperpanjang umur, atau menambah kemampuan baru.
- **"Catat sebagai biaya operasional"** — Pilih ini jika perbaikan hanya mengembalikan kondisi aset ke normal, misalnya servis rutin atau ganti suku cadang kecil.

---

### 4.5 Form Batch Depreciation Run

**Step 1 — Pilih Periode**
- Grid kalender 12 bulan
- Bulan yang sudah diposting: disabled, label "Sudah dihitung"
- Bulan yang dipilih: di-highlight

**Step 2 — Preview**
- Progress bar saat hitung berlangsung
- Tabel aset dengan kolom: nama aset, ruangan, nilai buku sekarang, penyusutan bulan ini, status
- Badge untuk status: Normal / Tidak Aktif / Sudah Habis / Pro-rata
- Alert untuk aset yang perlu perhatian
- Summary: jumlah aset, total penyusutan bulan ini
- **Catatan:** istilah "jurnal" tidak ditampilkan ke operator TU

**Step 3 — Konfirmasi**
- Ringkasan singkat
- Warning "Setelah dikonfirmasi, periode ini dikunci"
- Checkbox konfirmasi
- Tombol konfirmasi

---

### 4.6 Form Inventarisasi Aset (Opname)

**Form buka sesi:**

| Field | Tipe input | Validasi |
|---|---|---|
| Nama kegiatan | Text | Wajib, contoh: "Inventarisasi Semester Ganjil 2025/2026" |
| Tanggal | Date | Wajib |
| Cakupan | Radio: Semua / Per ruangan / Per kategori | Wajib |
| Filter cakupan | Dropdown | Aktif jika bukan "Semua" |
| Catatan | Textarea | Opsional |

**Form verifikasi per aset (mobile-friendly):**
- Scan barcode/QR atau cari manual
- Tampil info aset dari sistem
- Input kondisi aktual: Baik / Rusak Ringan / Rusak Berat
- Input lokasi aktual
- Upload foto dari kamera
- Tombol: Sesuai / Ada Perbedaan / Tidak Ditemukan

---

## 5. Laporan

Urutan ini mencerminkan prioritas kebutuhan di sekolah — dari yang paling sering dipakai ke yang lebih jarang.

---

### 5.1 Laporan Kondisi & Nilai Aset (Dashboard Utama)

**Tujuan:** Gambaran cepat untuk kepala sekolah — kondisi riil aset sekolah saat ini.

**Konten:**
- Total nilai perolehan seluruh aset
- Total akumulasi penyusutan
- Total nilai buku bersih (nilai yang masih tersedia)
- Jumlah aset per status: Aktif / Tidak Aktif / Sudah Habis Umur
- Jumlah aset per kondisi: Baik / Cukup / Rusak
- Jumlah aset yang perlu perhatian (fully deprecated tapi masih dipakai, atau inactive > 3 bulan)

**Format:** Dashboard/ringkasan, bukan tabel panjang. Cocok untuk ditampilkan di halaman utama modul aset.

---

### 5.2 Daftar Aset Tetap (Fixed Asset Register)

**Tujuan:** Laporan lengkap semua aset — dasar untuk audit dinas, BPK, dan pertanggungjawaban yayasan.

**Kolom wajib:**
- No. Aset, Nama Aset, Kategori, Sumber Dana
- Ruangan / Lokasi, Penanggungjawab
- Tanggal Perolehan, Harga Perolehan
- Akumulasi Penyusutan, Nilai Buku Bersih
- Metode Penyusutan, Sisa Masa Manfaat (bulan)
- Status Aset, Kondisi Terakhir

**Filter:**
- Per tanggal (as-of date)
- Per kategori
- Per ruangan / lokasi
- Per status
- Per sumber dana (penting untuk pelaporan Dana BOS terpisah)

**Subtotal:** Per kategori, per sumber dana, lalu grand total.

**Export:** Excel, PDF (dengan header sekolah, NPSN, tanda tangan kepala sekolah dan bendahara).

---

### 5.3 Laporan Proyeksi Penggantian Aset

**Tujuan:** Input utama untuk penyusunan RKAS (Rencana Kegiatan dan Anggaran Sekolah).

**Konten:**
- Daftar aset yang masa manfaatnya habis dalam rentang waktu yang dipilih
- Kolom: No. Aset, Nama, Kategori, Tanggal Habis Masa Manfaat, Nilai Buku Saat Ini, Harga Perolehan Asli
- Estimasi biaya penggantian (input manual per baris, atau auto-fill dari harga perolehan asli sebagai referensi)
- Total estimasi kebutuhan anggaran per kategori

**Filter:** 6 bulan / 12 bulan / 24 bulan ke depan, per kategori, per ruangan.

**Export:** Excel (untuk disalin ke format RKAS), PDF (untuk lampiran proposal anggaran).

---

### 5.4 Laporan Aset Fully Depreciated Masih Digunakan

**Tujuan:** Daftar aset yang nilai bukunya sudah nol tapi masih aktif dipakai — perlu keputusan kepala sekolah.

**Kolom:** No. Aset, Nama, Kategori, Ruangan, Tanggal Habis Dep., Harga Perolehan, Kondisi Terakhir.

**Tindak lanjut yang bisa dipilih langsung dari laporan:**
- Perpanjang masa manfaat (buka form perbaikan/kapitalisasi)
- Tandai tidak aktif
- Pertahankan (tandai sebagai "dipertahankan dengan sadar" + catatan alasan)

---

### 5.5 Laporan Mutasi Aset

**Tujuan:** Rekonsiliasi pergerakan nilai aset — untuk audit tahunan dan laporan ke dinas/yayasan.

**Format roll-forward:**
```
Kategori | Saldo Awal | + Perolehan | + Kapitalisasi | − Pelepasan | − Penyusutan | Saldo Akhir
```

**Filter:** Tahun ajaran atau rentang tanggal, per kategori.

**Validasi:** `Saldo Awal + Penambahan − Pengurangan − Penyusutan = Saldo Akhir`. Jika tidak balance, sistem tampilkan peringatan.

**Export:** Excel, PDF.

---

### 5.6 Laporan Pelepasan Aset & Surplus/Defisit

**Tujuan:** Ringkasan semua aset yang dilepaskan dalam satu periode, termasuk surplus atau defisit yang timbul. Dibutuhkan untuk pertanggungjawaban ke komite dan dinas.

**Kolom:**
- No. Aset, Nama, Kategori, Sumber Dana
- Tanggal Pelepasan, Metode Pelepasan
- Harga Perolehan, Akumulasi Penyusutan, Nilai Buku Saat Pelepasan
- Nilai Jual / Proceeds
- Surplus / Defisit
- No. Berita Acara, Disetujui Oleh

**Filter:** Periode, metode pelepasan, sumber dana.

**Export:** Excel, PDF (dengan kolom tanda tangan kepala sekolah).

---

### 5.7 Laporan Penyusutan Per Periode

**Tujuan:** Rekonsiliasi beban penyusutan — untuk bendahara dan audit.

**Kolom:** No. Aset, Nama, Kategori, Harga Perolehan, Akumulasi Awal, Beban Periode Ini, Akumulasi Akhir, Nilai Buku Akhir.

**Filter:** Periode, kategori.

**Catatan tampilan:** Kolom "No. Jurnal" tersembunyi secara default — hanya tampil jika user dengan role bendahara atau admin mengaktifkannya. Ini agar operator TU tidak bingung dengan nomor jurnal.

**Export:** Excel, PDF.

---

### 5.8 Laporan Hasil Inventarisasi & Selisih

**Tujuan:** Rekap hasil opname fisik — untuk berita acara dan tindak lanjut.

**Bagian 1 — Ringkasan:**
- Total aset diverifikasi, sesuai, beda lokasi, tidak ditemukan
- Persentase kesesuaian

**Bagian 2 — Detail selisih:**
- Aset dengan status bukan `matched`
- Kolom: No. Aset, Nama, Lokasi Sistem, Lokasi Aktual, Kondisi Aktual, Foto
- Kolom rekomendasi tindak lanjut

**Bagian 3 — Aset tidak terdaftar:**
- Barang ditemukan di lapangan tapi tidak ada di sistem

**Export:** Excel, PDF (format Berita Acara Inventarisasi lengkap dengan nama petugas dan tanda tangan kepala sekolah).

---

### 5.9 Audit Trail Per Aset

**Tujuan:** Riwayat lengkap satu aset dari pertama dicatat sampai dilepas. Untuk BPK atau pengawas dinas saat audit.

**Konten:** Timeline kronologis semua kejadian — perolehan, setiap penyusutan yang diposting, pindah ruangan, perbaikan, perubahan status, hingga pelepasan.

**Setiap baris:** tanggal & jam, kejadian (dalam bahasa sederhana), user yang melakukan, referensi dokumen.

**Export:** PDF (format kronologis siap serahkan ke auditor).

---

## 6. Alur Approval

### 6.1 Pendaftaran Aset Baru
```
Operator TU input aset → [Opsional: verifikasi bendahara untuk aset > nilai tertentu] → Tersimpan aktif
```

### 6.2 Tandai Aset Tidak Aktif
```
Operator TU / Guru lapor → Isi form + foto → Tersimpan sebagai inactive
```
Tidak perlu approval khusus — tapi semua perubahan status tercatat di audit log.

### 6.3 Pelepasan Aset
```
Bendahara ajukan disposal → Kepala Sekolah review & setujui/tolak →
  [Jika disetujui] → Sistem proses pelepasan + buat jurnal di belakang layar
  [Jika ditolak]   → Kembali ke bendahara dengan catatan
```
Approval kepala sekolah **wajib** untuk semua pelepasan.

### 6.4 Kapitalisasi Biaya Perbaikan
```
Bendahara input biaya → Pilih jenis (kapitalisasi/bebankan) →
  [Kapitalisasi > threshold] → Kepala sekolah approve → Sistem update nilai aset
  [Bebankan / nilai kecil]  → Langsung diproses
```

**Catatan implementasi:**
- Notifikasi approval via sistem (in-app) dan opsional WhatsApp/email
- Approver bisa setujui atau tolak dengan catatan wajib
- Semua keputusan approval tercatat di `asset_audit_log`
- Jika dalam 7 hari tidak ada respons, sistem kirim reminder

---

## 7. Audit Trail

### 7.1 Event yang Wajib Dicatat

| Event | Trigger | Detail yang dicatat |
|---|---|---|
| `created` | Aset baru disimpan | Semua nilai awal |
| `updated` | Perubahan data aset | Field yang berubah, nilai lama vs baru |
| `status_changed` | Perubahan status (termasuk ke inactive) | Status lama, status baru, alasan, tanggal |
| `depreciation_posted` | Batch run diposting | Periode, jumlah, no. jurnal |
| `disposal` | Pelepasan dikonfirmasi | Metode, proceeds, surplus/defisit, no. jurnal, no. berita acara |
| `improvement_capitalized` | Kapitalisasi biaya | Jumlah ditambahkan, jadwal diregenerasi |
| `improvement_expensed` | Biaya dibebankan | Jumlah, no. jurnal |
| `location_changed` | Perpindahan ruangan/lokasi | Lokasi lama vs baru, PIC lama vs baru |
| `condition_updated` | Kondisi fisik diperbarui | Kondisi lama vs baru |
| `document_uploaded` | Dokumen/foto diupload | Nama file, jenis dokumen |
| `approval_granted` | Approval diberikan | Approver, untuk transaksi apa |
| `approval_rejected` | Approval ditolak | Approver, alasan penolakan |
| `schedule_regenerated` | Jadwal penyusutan dihitung ulang | Alasan regenerasi, periode mulai |
| `reactivated` | Aset kembali aktif dari inactive | Alasan reaktivasi, kondisi baru |

### 7.2 Aturan Implementasi

- Tulis ke `asset_audit_log` dalam satu transaksi database yang sama dengan perubahan utama
- Log tetap ditulis bahkan jika proses utama gagal — catat kejadian dan alasan kegagalan
- Jangan pernah expose endpoint DELETE atau UPDATE untuk tabel ini di API
- Narasi `event_description` ditulis dalam bahasa Indonesia yang mudah dipahami — bukan kode teknis
  - Contoh buruk: `status: active → inactive`
  - Contoh baik: `"Aset ditandai tidak aktif oleh Budi Santoso pada 15 Mei 2025. Alasan: Layar rusak tidak bisa diperbaiki."`

---

## 8. Integrasi dengan Modul Inventaris

### 8.1 Titik integrasi

**Dari inventaris ke aset:**
- Saat item inventaris memenuhi kriteria kapitalisasi (nilai di atas threshold, masa manfaat > 1 tahun), tampilkan tombol "Daftarkan sebagai Aset Tetap" di halaman detail item
- Tombol ini membuka form tambah aset dengan beberapa field pre-filled dari data inventaris
- Setelah aset disimpan, `assets.inventory_item_id` diisi dengan ID item inventaris

**Sinkronisasi data:**
- Perubahan lokasi di modul aset **tidak** otomatis update data inventaris (dan sebaliknya) — rekonsiliasi dilakukan lewat opname
- Kondisi aset di modul aset dan kondisi barang di inventaris adalah dua field terpisah

**Tampilan lintas modul:**
- Di halaman detail item inventaris: jika terhubung ke aset, tampilkan ringkasan (nilai buku, status) dan link ke detail aset
- Di halaman detail aset: tampilkan link ke item inventaris terkait

### 8.2 Tidak ada duplikasi data master

- Tabel `locations` dan `users` tetap milik modul inventaris/shared — modul aset reference lewat FK
- Tabel `asset_categories` terpisah dari kategori inventaris

---

## 9. Aturan & Constraint Bisnis

### 9.1 Aturan Nilai
- `acquisition_cost` tidak boleh diubah langsung — hanya bisa berubah melalui fitur `asset_improvements`
- `asset_number` tidak boleh berubah setelah disimpan, selamanya
- `salvage_value` harus < `acquisition_cost`
- Nilai buku tidak boleh di bawah `salvage_value` (cegah over-depreciation)
- Pada saldo menurun: ketika nilai buku mendekati `salvage_value`, beban dikurangi agar tidak melewati `salvage_value`

### 9.2 Aturan Status
```
Transisi yang DIIZINKAN:
active            → inactive          (manual, wajib ada alasan + tanggal)
active            → fully_depreciated (otomatis saat nilai buku = salvage_value)
inactive          → active            (reaktivasi, wajib ada catatan)
inactive          → disposed          (melalui proses disposal + approval kepala sekolah)
fully_depreciated → inactive          (manual, aset sudah habis umur dan tidak dipakai)
fully_depreciated → disposed          (melalui proses disposal)

Transisi yang TIDAK DIIZINKAN:
active   → disposed                   (harus lewat inactive dulu)
disposed → [apapun]                   (final, tidak bisa dibalik)
```

### 9.3 Aturan Periode
- Satu periode hanya boleh punya satu `depreciation_run` dengan status `posted`
- Periode yang sudah diposting dikunci — koreksi hanya lewat jurnal adjustment
- Tidak bisa posting penyusutan untuk periode di masa depan

### 9.4 Aturan Jurnal
- Setiap jurnal harus balance: `total_debit = total_credit`
- Jurnal yang sudah `posted` tidak bisa diubah atau dihapus
- Jurnal tidak ditampilkan ke operator TU — hanya ke bendahara dan admin

### 9.5 Aturan Khusus Sekolah
- Aset dengan `funding_source = dana_bos` atau `dana_hibah_pemerintah`: field nomor surat dinas wajib diisi saat disposal
- Laporan aset Dana BOS harus bisa di-generate terpisah dari sumber dana lain — karena pelaporan ke dinas seringkali memisahkan ini
- Tahun fiskal mengikuti tahun ajaran (Juli–Juni), bukan tahun kalender — konfigurasi `fiscal_year_start_month = 7`

---

## 10. Referensi Istilah

| Istilah Sistem | Istilah di UI untuk User | Definisi |
|---|---|---|
| **Harga Perolehan** | Harga Beli | Total biaya sampai aset siap digunakan, termasuk pajak, ongkir, instalasi |
| **Nilai Residu** | Perkiraan Nilai Sisa | Estimasi nilai aset di akhir masa pakainya |
| **Depreciable Amount** | *(tersembunyi)* | Harga perolehan dikurangi nilai residu — jumlah yang akan disusutkan |
| **Nilai Buku** | Nilai Saat Ini | Harga perolehan dikurangi akumulasi penyusutan |
| **Akumulasi Penyusutan** | Total Penyusutan | Total nilai yang sudah berkurang sejak aset dibeli |
| **Fully Depreciated** | Habis Masa Pakai | Nilai buku sudah nol atau sama dengan nilai residu |
| **Pro-rata** | *(tersembunyi, dihitung otomatis)* | Penyusutan proporsional berdasarkan jumlah hari |
| **Kapitalisasi** | Tambah ke Nilai Aset | Mencatat biaya perbaikan sebagai penambah nilai aset |
| **Write-off / Disposal** | Hapus dari Catatan | Mengeluarkan aset dari daftar resmi sekolah |
| **Surplus Pelepasan** | Kelebihan dari Penjualan | Hasil jual lebih tinggi dari nilai buku |
| **Defisit Pelepasan** | Kekurangan dari Penjualan | Hasil jual lebih rendah dari nilai buku — atau nol jika dimusnahkan |
| **Roll-forward** | *(tersembunyi)* | Format laporan mutasi: saldo awal + perubahan = saldo akhir |
| **Batch Run** | Hitung Penyusutan Bulanan | Proses menghitung dan mencatat penyusutan semua aset sekaligus |
| **Opname** | Inventarisasi | Pengecekan fisik kondisi dan lokasi aset di lapangan |
| **Inactive** | Tidak Aktif | Status aset yang sudah tidak dipakai, menunggu keputusan penghapusan |
| **Immutable** | *(tersembunyi)* | Data yang tidak bisa diubah — berlaku untuk audit trail |
| **Jurnal** | *(tersembunyi dari TU)* | Catatan akuntansi di belakang layar |
