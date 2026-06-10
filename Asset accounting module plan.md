# Rencana Modul Akuntansi Aset Tetap
> Ekstensi dari sistem inventaris yang sudah ada.  
> Dokumen ini adalah spesifikasi lengkap untuk implementasi — mencakup fitur, logika bisnis, skema database, form, dan laporan.

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

### Apa yang TIDAK berubah
- Tabel inventaris existing tidak dimodifikasi secara destructive
- Modul inventaris tetap berjalan mandiri
- Relasi ke inventaris bersifat **opsional** — aset bisa didaftarkan tanpa item inventaris yang sudah ada

### Siklus hidup aset yang ditopang sistem
```
Perolehan → Kapitalisasi → Penyusutan (berulang tiap periode) → [Perbaikan/Peningkatan] → Pelepasan
```

---

## 2. Entitas Database Baru

### 2.1 `asset_categories`
Kategori aset tetap yang menentukan aturan penyusutan default.

| Kolom | Tipe | Keterangan |
|---|---|---|
| `id` | UUID / PK | |
| `name` | VARCHAR(100) | Nama kategori, mis. "Peralatan IT" |
| `gl_account_code` | VARCHAR(20) | Kode akun buku besar untuk aset jenis ini |
| `accumulated_dep_account_code` | VARCHAR(20) | Kode akun akumulasi penyusutan |
| `depreciation_expense_account_code` | VARCHAR(20) | Kode akun beban penyusutan |
| `default_depreciation_method` | ENUM | `straight_line`, `declining_balance`, `units_of_production`, `sum_of_years` |
| `default_useful_life_months` | INT | Masa manfaat default dalam bulan |
| `default_salvage_value_pct` | DECIMAL(5,2) | Persentase nilai residu dari harga perolehan (0–100) |
| `default_depreciation_rate` | DECIMAL(5,2) | Tarif penyusutan per tahun (%) — dipakai untuk metode saldo menurun |
| `capitalization_threshold` | DECIMAL(15,2) | Nilai minimum agar aset dikapitalisasi, bukan langsung dibebankan |
| `is_depreciable` | BOOLEAN | False untuk tanah dan aset non-depreciable |
| `is_active` | BOOLEAN | |
| `created_at` | TIMESTAMP | |
| `updated_at` | TIMESTAMP | |

**Contoh data:**
```
"Peralatan IT"       → SL, 48 bulan, tarif 25%, threshold Rp 1.000.000
"Kendaraan"          → DB, 96 bulan, tarif 25%, threshold Rp 5.000.000
"Mesin & Alat"       → SL, 96 bulan, tarif 12.5%, threshold Rp 2.000.000
"Furnitur & Fixture" → SL, 60 bulan, tarif 20%, threshold Rp 500.000
"Bangunan"           → SL, 240 bulan, tarif 5%, threshold Rp 10.000.000
"Tanah"              → Non-depreciable, tidak ada penyusutan
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
| `depreciation_start_date` | DATE | Tanggal mulai dihitung penyusutan (biasanya bulan depan setelah perolehan, atau awal bulan berikutnya) |
| `location_id` | FK → tabel lokasi existing | Lokasi fisik saat ini |
| `responsible_user_id` | FK → tabel users | Penanggungjawab aset |
| `condition` | ENUM | `new`, `good`, `fair` |
| `status` | ENUM | `active`, `fully_depreciated`, `disposed`, `on_hold`, `under_maintenance` |
| `document_reference` | VARCHAR(100) | Nomor nota/invoice pembelian |
| `vendor_name` | VARCHAR(200) | Nama pemasok |
| `notes` | TEXT | Catatan tambahan |
| `created_by` | FK → `users` | |
| `approved_by` | FK → `users` | NULL jika belum perlu approval |
| `created_at` | TIMESTAMP | |
| `updated_at` | TIMESTAMP | |

**Constraint penting:**
- `asset_number` harus UNIQUE dan tidak boleh pernah diubah setelah disimpan
- `acquisition_cost` harus > 0
- `salvage_value` harus >= 0 dan < `acquisition_cost`
- `depreciation_start_date` tidak boleh sebelum `acquisition_date`
- Status `disposed` bersifat final — tidak bisa dikembalikan ke `active`

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
| `status` | ENUM | `scheduled`, `posted`, `adjusted` |
| `posted_at` | TIMESTAMP | Waktu jurnal diposting |
| `journal_entry_id` | FK → `journal_entries` | NULL sebelum diposting |
| `created_at` | TIMESTAMP | |

**Aturan generate jadwal:**
- Dibuat otomatis saat aset disimpan, mencakup seluruh masa manfaat
- Periode pertama: pro-rata jika `acquisition_date` bukan hari pertama bulan
- Periode terakhir: sisa nilai yang belum disusutkan (menghindari over-depreciation)
- Jika aset dilepaas di tengah masa manfaat, baris setelah tanggal pelepasan dihapus/void
- Jika ada kapitalisasi biaya tambahan, jadwal di-regenerate dari periode saat ini ke depan

**Formula per metode:**

*Garis Lurus (Straight-Line):*
```
monthly_dep = depreciable_amount / useful_life_months
```

*Saldo Menurun (Declining Balance):*
```
annual_dep = opening_book_value × depreciation_rate / 100
monthly_dep = annual_dep / 12
// Bulan terakhir: sisakan sampai salvage_value, tidak boleh kurang
```

*Unit Produksi:*
```
dep_per_unit = depreciable_amount / total_estimated_units
monthly_dep = dep_per_unit × actual_units_this_period
// Perlu input actual_units tiap periode (tidak bisa pre-generate penuh)
```

---

### 2.4 `depreciation_runs`
Header dari setiap batch depreciation run yang dijalankan finance.

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
| `is_included` | BOOLEAN | False jika di-exclude oleh finance saat review |
| `exclusion_reason` | TEXT | Alasan exclusion jika `is_included = false` |
| `override_amount` | DECIMAL(15,2) | Jika finance override jumlah (perlu dicatat untuk audit) |
| `override_reason` | TEXT | Alasan override |

---

### 2.6 `asset_disposals`
Pencatatan pelepasan aset (jual, hapus, tukar).

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
| `gain_loss` | DECIMAL(15,2) | `proceeds - book_value_at_disposal` (positif = laba, negatif = rugi) |
| `gain_loss_account_code` | VARCHAR(20) | Akun laba/rugi pelepasan di buku besar |
| `document_reference` | VARCHAR(100) | Nomor berita acara / BAST |
| `approved_by` | FK → `users` | Wajib diisi — tidak bisa disposal tanpa approval |
| `journal_entry_id` | FK → `journal_entries` | Jurnal yang dihasilkan |
| `created_by` | FK → `users` | |
| `created_at` | TIMESTAMP | |

---

### 2.7 `asset_improvements`
Pencatatan biaya pasca-perolehan yang dikapitalisasi (bukan dibebankan langsung).

| Kolom | Tipe | Keterangan |
|---|---|---|
| `id` | UUID / PK | |
| `asset_id` | FK → `assets` | |
| `improvement_date` | DATE | |
| `description` | TEXT | Deskripsi pekerjaan/perbaikan |
| `type` | ENUM | `capitalized` (peningkatan) atau `expensed` (perbaikan biasa) |
| `amount` | DECIMAL(15,2) | |
| `new_useful_life_months` | INT | Jika masa manfaat diperpanjang, isi nilai baru |
| `document_reference` | VARCHAR(100) | Nomor nota atau kontrak |
| `approved_by` | FK → `users` | |
| `journal_entry_id` | FK → `journal_entries` | |
| `recalculation_applied` | BOOLEAN | True jika jadwal penyusutan sudah di-regenerate |
| `created_by` | FK → `users` | |
| `created_at` | TIMESTAMP | |

**Logika kapitalisasi:**
- Jika `type = capitalized`: tambahkan `amount` ke `assets.acquisition_cost`, regenerate jadwal penyusutan dari bulan berjalan ke depan
- Jika `type = expensed`: catat hanya sebagai beban di jurnal, tidak ubah nilai aset

---

### 2.8 `journal_entries`
Header jurnal akuntansi yang dihasilkan oleh modul aset.

| Kolom | Tipe | Keterangan |
|---|---|---|
| `id` | UUID / PK | |
| `journal_number` | VARCHAR(30) | Auto-generate, contoh: `JRN-2025-04-0018` |
| `entry_date` | DATE | Tanggal jurnal |
| `period_year` | INT | |
| `period_month` | INT | |
| `type` | ENUM | `acquisition`, `depreciation`, `disposal`, `improvement`, `adjustment` |
| `reference_id` | UUID | ID dari tabel sumber (asset_id, disposal_id, run_id, dll.) |
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
| `event_type` | ENUM | `created`, `updated`, `depreciation_posted`, `disposal`, `improvement`, `location_changed`, `status_changed`, `document_uploaded` |
| `event_description` | TEXT | Narasi singkat kejadian |
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
| `document_type` | ENUM | `purchase_invoice`, `photo`, `contract`, `inspection_report`, `disposal_document`, `other` |
| `file_name` | VARCHAR(255) | |
| `file_path` | TEXT | Path/URL file di storage |
| `file_size_bytes` | INT | |
| `uploaded_by` | FK → `users` | |
| `uploaded_at` | TIMESTAMP | |
| `notes` | TEXT | |

---

### 2.12 `stock_opname_sessions`
Sesi stock opname aset.

| Kolom | Tipe | Keterangan |
|---|---|---|
| `id` | UUID / PK | |
| `session_name` | VARCHAR(100) | Nama/kode sesi opname |
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

**Trigger:** Staff input aset baru atau aset dari inventaris dinaikkan statusnya.

**Logika:**
1. Validasi nilai perolehan ≥ `capitalization_threshold` kategori. Jika di bawah threshold, sistem beri peringatan bahwa aset sebaiknya langsung dibebankan, bukan dikapitalisasi.
2. Hitung `depreciable_amount = acquisition_cost - salvage_value`.
3. Tentukan `depreciation_start_date`:
   - Default: tanggal 1 bulan berikutnya setelah `acquisition_date`
   - Bisa dikonfigurasi per perusahaan: "bulan perolehan" atau "bulan berikutnya"
4. Generate seluruh `depreciation_schedules` dari `depreciation_start_date` hingga akhir masa manfaat.
5. Untuk periode pertama: jika `acquisition_date` bukan hari pertama bulan dan aturan perusahaan adalah "bulan perolehan", hitung pro-rata:
   ```
   prorata_days = hari_tersisa_di_bulan_itu (termasuk hari perolehan)
   days_in_month = total_hari_di_bulan_tersebut
   dep_amount = monthly_dep × (prorata_days / days_in_month)
   ```
6. Simpan aset dengan status `active`.
7. Tulis ke `asset_audit_log` dengan `event_type = created`.
8. Generate nomor aset otomatis dengan format `AST-YYYY-NNNN` (4 digit, increment per tahun).

---

### 3.2 Batch Depreciation Run

**Trigger:** Finance membuka menu "Jalankan Penyusutan" dan memilih periode.

**Validasi awal (sebelum kalkulasi):**
- Pastikan tidak ada `depreciation_run` dengan status `posted` untuk periode yang sama
- Pastikan periode yang dipilih tidak di masa depan (tidak bisa pre-post)

**Fase 1 — Kalkulasi (tidak ada yang disimpan ke DB):**
1. Ambil semua aset dengan status `active` dan `fully_depreciated` (yang fully dep dimasukkan tapi dengan nilai 0 — untuk transparansi)
2. Untuk tiap aset, ambil baris `depreciation_schedules` yang sesuai periode
3. Tandai aset berdasarkan kondisi:
   - `normal`: proses seperti biasa
   - `prorata`: ada flag `is_prorata = true` di schedule
   - `fully_depreciated`: `closing_book_value` sudah 0 di schedule
   - `on_hold`: status aset adalah `on_hold` — otomatis di-exclude
   - `disposed`: status `disposed` — otomatis di-exclude
4. Untuk metode `units_of_production`: minta input `actual_units` periode ini (tidak bisa otomatis)
5. Return preview data ke UI tanpa menyimpan

**Fase 2 — Review (finance bisa intervensi):**
- Finance bisa exclude aset tertentu dengan mencatat alasan
- Finance bisa override jumlah penyusutan dengan mencatat alasan
- Semua intervensi ini wajib dicatat di `depreciation_run_items`

**Fase 3 — Posting:**
1. Buat record `depreciation_runs` dengan status `posted`
2. Buat `depreciation_run_items` untuk setiap aset yang diproses
3. Update `depreciation_schedules.status = posted` dan isi `journal_entry_id`
4. Buat satu `journal_entry` dengan baris:
   - Debit: Beban Penyusutan (per kategori atau satu baris total, sesuai konfigurasi)
   - Kredit: Akumulasi Penyusutan (per kategori)
5. Update `assets.status` menjadi `fully_depreciated` jika `closing_book_value = 0`
6. Tulis ke `asset_audit_log` untuk setiap aset yang diposting

**Constraint posting:**
- Setelah posted, periode **dikunci** — tidak bisa dirun ulang
- Koreksi hanya bisa melalui jurnal adjustment manual (fitur terpisah)

---

### 3.3 Pelepasan Aset (Disposal)

**Trigger:** Finance atau manajer memulai proses pelepasan aset.

**Validasi:**
- Aset tidak boleh berstatus `disposed`
- Harus ada approval dari user dengan role minimal `manager`
- Jika ada penyusutan bulan berjalan yang belum diposting dan tanggal pelepasan sudah lewat, sistem harus meminta penyusutan partial dulu (atau auto-hitung sisa hari)

**Logika:**
1. Hitung nilai buku pada tanggal pelepasan:
   ```
   Ambil closing_book_value dari schedule bulan sebelumnya
   Tambah penyusutan partial bulan berjalan jika disposal tidak di akhir bulan
   ```
2. Hitung laba/rugi:
   ```
   gain_loss = proceeds - book_value_at_disposal
   ```
3. Generate jurnal pelepasan:
   ```
   Dr. Kas / Piutang                    [sebesar proceeds]
   Dr. Akumulasi Penyusutan             [sebesar accumulated_dep_at_disposal]
   Dr. Rugi Pelepasan Aset              [jika gain_loss < 0, sebesar abs(gain_loss)]
     Cr. Aset Tetap — [kategori]        [sebesar acquisition_cost]
     Cr. Laba Pelepasan Aset            [jika gain_loss > 0, sebesar gain_loss]
   ```
4. Update `assets.status = disposed`
5. Void semua baris `depreciation_schedules` yang belum posted untuk aset ini
6. Tulis ke `asset_audit_log`

---

### 3.4 Kapitalisasi Biaya Perbaikan

**Trigger:** Finance mencatat pengeluaran pasca-perolehan untuk aset.

**Logika klasifikasi:**
- Sistem tidak bisa otomatis membedakan capex vs opex — ini keputusan finance
- Sistem menampilkan panduan: "Jika pengeluaran ini meningkatkan kapasitas, memperpanjang umur, atau menambah kemampuan aset, pilih Kapitalisasi. Jika hanya mengembalikan ke kondisi semula, pilih Bebankan."
- Finance wajib memilih salah satu

**Jika Kapitalisasi (`type = capitalized`):**
1. Tambahkan `amount` ke `assets.acquisition_cost`
2. Hitung ulang `assets.depreciable_amount`
3. Jika masa manfaat diperpanjang, update `assets.useful_life_months`
4. **Regenerate** `depreciation_schedules` dari bulan berjalan ke depan:
   - Ambil `opening_book_value` bulan berjalan (nilai buku saat ini + kapitalisasi baru)
   - Hitung ulang `monthly_dep` dengan sisa masa manfaat
   - Hapus baris jadwal yang belum posted, ganti dengan jadwal baru
5. Generate jurnal:
   ```
   Dr. Aset Tetap — [kategori]    [sebesar amount]
     Cr. Kas / Hutang             [sebesar amount]
   ```

**Jika Bebankan (`type = expensed`):**
1. Tidak ada perubahan ke data aset
2. Generate jurnal:
   ```
   Dr. Beban Perbaikan & Pemeliharaan   [sebesar amount]
     Cr. Kas / Hutang                   [sebesar amount]
   ```

---

### 3.5 Stock Opname Aset

**Trigger:** Admin atau manajer membuka sesi opname baru.

**Alur:**
1. Buat `stock_opname_sessions` dengan scope (semua / per lokasi / per kategori)
2. Sistem generate daftar semua aset aktif sesuai scope — ini checklist yang harus diverifikasi
3. Petugas lapangan scan barcode/QR aset satu per satu, isi kondisi dan lokasi aktual, upload foto
4. Aset yang tidak bisa ditemukan ditandai `not_found`
5. Setelah semua selesai, session di-close
6. Sistem generate laporan selisih otomatis

**Hasil opname:**
- Aset dengan status `not_found` setelah opname harus ditindaklanjuti:
  - Jika ditemukan kemudian: update status kembali normal
  - Jika hilang definitif: inisiasi proses disposal dengan `disposal_method = stolen_lost`
- Aset dengan `location_mismatch`: update lokasi di sistem mengikuti fakta lapangan

---

### 3.6 Nomor Aset (Asset Numbering)

**Format:** `AST-{YYYY}-{NNNN}`

**Logika generate:**
```
year = tahun acquisition_date
sequence = SELECT MAX(sequence_number) FROM assets WHERE year = year + 1
asset_number = "AST-" + year + "-" + LPAD(sequence, 4, '0')
```

Nomor ini harus di-lock setelah assigned — tidak bisa diubah meskipun data lain di-edit.

---

### 3.7 Konfigurasi Perusahaan

Tabel konfigurasi global yang mempengaruhi perilaku modul:

| Key | Nilai default | Keterangan |
|---|---|---|
| `dep_start_convention` | `next_month` | Kapan penyusutan mulai: `next_month` atau `acquisition_month` |
| `fiscal_year_start_month` | `1` | Bulan pertama tahun fiskal (1 = Januari) |
| `journal_level` | `by_category` | Level jurnal penyusutan: `total` (satu baris) atau `by_category` atau `by_asset` |
| `require_disposal_approval` | `true` | Apakah pelepasan aset butuh approval |
| `disposal_approval_role` | `manager` | Role minimum yang bisa approve disposal |
| `enable_opname` | `true` | Aktifkan fitur stock opname |
| `opname_frequency_months` | `12` | Frekuensi opname yang direkomendasikan sistem (untuk reminder) |

---

## 4. Form & Input

### 4.1 Form Tambah Aset Baru

**Step 1 — Identitas Fisik**

| Field | Tipe input | Validasi | Keterangan |
|---|---|---|---|
| Kategori aset | Tile/card selector | Wajib | Memicu auto-fill step 2 |
| Nama aset | Text | Wajib, min 3 karakter | |
| Deskripsi | Textarea | Opsional | Nomor seri, spesifikasi |
| Lokasi | Dropdown (dari data lokasi existing) | Wajib | |
| Penanggungjawab | Dropdown (dari data users) | Wajib | |
| Kondisi | Radio: Baru / Baik / Cukup | Wajib | |
| Foto & dokumen | File upload, multiple | Opsional | JPG, PNG, PDF, maks 10MB |

**Step 2 — Informasi Finansial**

| Field | Tipe input | Validasi | Keterangan |
|---|---|---|---|
| Tanggal perolehan | Date picker | Wajib, tidak boleh masa depan | |
| Nomor dokumen/nota | Text | Opsional | |
| Nama vendor | Text | Opsional | |
| Harga perolehan | Number (currency) | Wajib, > 0 | Input formatted Rp |
| Nilai residu | Number (currency) | Opsional, default 0, < harga perolehan | |
| Metode penyusutan | Dropdown | Auto-fill dari kategori, bisa override | |
| Masa manfaat (bulan) | Number | Wajib, > 0 | Auto-fill dari kategori |
| Tarif penyusutan (%) | Number | Auto-fill, aktif jika metode = saldo menurun | |
| Preview penyusutan | Kalkulasi otomatis | Read-only | Tampil real-time saat harga & masa manfaat diisi |

**Step 3 — Konfirmasi**
- Ringkasan semua data yang diinput
- Tampilkan peringatan pro-rata jika tanggal perolehan bukan hari pertama bulan
- Tombol "Simpan Aset" — hanya aktif setelah user centang checkbox konfirmasi

**Perilaku form:**
- Pemilihan kategori memicu auto-fill metode, masa manfaat, dan tarif
- Preview penyusutan (beban/tahun, beban/bulan, mini chart 5 tahun pertama) muncul real-time
- Field metode dan tarif dikunci dengan badge "Auto dari kategori" — ada link "ubah manual" untuk override
- Jika harga perolehan di bawah `capitalization_threshold` kategori: tampilkan warning banner

---

### 4.2 Form Pelepasan Aset

| Field | Tipe input | Validasi | Keterangan |
|---|---|---|---|
| Aset | Read-only | — | Diisi dari konteks (user pilih aset dulu) |
| Tanggal pelepasan | Date picker | Wajib, tidak boleh masa depan | |
| Metode pelepasan | Dropdown | Wajib | Dijual / Dihapus / Ditukar / Dihibahkan / Hilang/Dicuri |
| Nilai jual/proceeds | Number (currency) | Wajib jika metode = Dijual | 0 jika metode lain |
| Alasan pelepasan | Textarea | Wajib | |
| Nomor dokumen | Text | Opsional | Nomor BAST/berita acara |
| Upload dokumen | File upload | Opsional | |

**Kalkulasi otomatis yang ditampilkan (read-only):**
- Nilai buku saat ini
- Akumulasi penyusutan saat ini
- Laba/Rugi pelepasan = Nilai jual − Nilai buku
- Preview jurnal yang akan dibuat

---

### 4.3 Form Kapitalisasi / Pencatatan Biaya Perbaikan

| Field | Tipe input | Validasi | Keterangan |
|---|---|---|---|
| Aset | Read-only | — | |
| Tanggal biaya | Date picker | Wajib | |
| Deskripsi pekerjaan | Textarea | Wajib | |
| Jumlah biaya (Rp) | Number (currency) | Wajib, > 0 | |
| Jenis | Radio: Kapitalisasi / Bebankan | Wajib | Dengan panduan teks pembantu |
| Masa manfaat baru (bulan) | Number | Aktif jika Kapitalisasi dan masa manfaat berubah | |
| Nomor dokumen | Text | Opsional | |
| Upload dokumen | File upload | Opsional | |

**Jika Kapitalisasi dipilih:**
- Tampilkan preview nilai aset baru setelah penambahan
- Tampilkan perbandingan jadwal penyusutan lama vs baru (sisa periode)

---

### 4.4 Form Batch Depreciation Run

**Step 1 — Pilih Periode**
- Grid kalender bulan (12 kotak per tahun)
- Bulan yang sudah diposting ditampilkan disabled dengan label "Sudah diposting"
- Bulan yang dipilih di-highlight

**Step 2 — Preview Kalkulasi (otomatis, tidak ada input)**
- Progress bar saat sistem menghitung
- Setelah selesai: tampil tabel semua aset dengan kolom:
  - Checkbox include/exclude (per aset)
  - Nomor aset, nama, kategori
  - Nilai buku sekarang
  - Beban penyusutan periode ini
  - Status (Normal / Pro-rata / Hold / Fully deprecated)
- Badge berwarna untuk setiap status
- Alert banner untuk aset yang perlu perhatian (pro-rata, hold, fully dep)
- Filter: cari nama, filter per status, filter per kategori
- Preview jurnal yang akan diposting (breakdown per kategori)
- Summary card: jumlah aset, total beban, jumlah yang perlu perhatian

**Step 3 — Konfirmasi Posting**
- Ringkasan: total aset, total beban, periode
- Warning: "Tindakan ini tidak bisa dibatalkan"
- Checkbox konfirmasi wajib dicentang
- Tombol posting berwarna merah (visual sinyal irreversible)

---

### 4.5 Form Stock Opname — Sesi Baru

| Field | Tipe input | Validasi |
|---|---|---|
| Nama sesi opname | Text | Wajib, contoh: "Opname Q1 2025" |
| Tanggal opname | Date | Wajib |
| Cakupan | Radio: Semua / Per lokasi / Per kategori | Wajib |
| Filter cakupan | Dropdown | Aktif jika bukan "Semua" |
| Catatan | Textarea | Opsional |

---

### 4.6 Form Verifikasi Aset (Saat Opname, Mobile-Friendly)

- Scan barcode/QR aset atau cari manual
- Setelah aset ditemukan, tampil:
  - Info aset dari sistem (nama, lokasi sistem, kondisi sistem)
  - Input kondisi aktual: Baik / Rusak Ringan / Rusak Berat
  - Input lokasi aktual (dropdown)
  - Upload foto (kamera langsung dari mobile)
  - Catatan
  - Tombol: "Sesuai" / "Ada Perbedaan" / "Tidak Ditemukan"

---

## 5. Laporan

### 5.1 Daftar Aset Tetap (Fixed Asset Register)

**Tujuan:** Laporan induk semua aset — dasar rekonsiliasi ke neraca.

**Kolom wajib:**
- No. Aset, Nama Aset, Kategori, Kode Akun
- Tanggal Perolehan, Harga Perolehan
- Akumulasi Penyusutan, Nilai Buku Bersih
- Metode Penyusutan, Sisa Masa Manfaat (bulan)
- Lokasi, Penanggungjawab, Status Aset

**Filter yang tersedia:**
- Per tanggal (as-of date) — wajib ada, default hari ini
- Per kategori aset
- Per lokasi / divisi
- Per status aset
- Per rentang harga perolehan

**Subtotal:** Per kategori, lalu grand total.

**Export:** Excel (format tabel penuh), PDF (siap cetak, ada header perusahaan & tanda tangan), CSV (untuk import ERP).

**Rekonsiliasi:** Total kolom "Nilai Buku Bersih" harus sama dengan saldo akun Aset Tetap Bersih di neraca.

---

### 5.2 Laporan Penyusutan Per Periode

**Tujuan:** Rekonsiliasi beban penyusutan ke laporan laba rugi.

**Kolom wajib:**
- No. Aset, Nama Aset, Kategori
- Harga Perolehan
- Akumulasi Awal Periode, Beban Dep. Periode Ini, Akumulasi Akhir Periode
- Nilai Buku Akhir
- No. Jurnal Posting, Tanggal Posting
- Metode, Tarif

**Filter:** Periode (bulan+tahun atau rentang), Kategori, Status posting.

**Export:** Excel, PDF, CSV per jurnal.

---

### 5.3 Laporan Mutasi Aset (Roll-Forward Schedule)

**Tujuan:** Rekonsiliasi pergerakan nilai aset antar periode — paling sering diminta auditor.

**Format:**

```
Kategori | Saldo Awal | + Perolehan | + Kapitalisasi | − Pelepasan | − Penyusutan | Saldo Akhir
```

**Baris:** Per kategori aset, grand total di bawah.

**Filter:** Periode (bulanan, kuartalan, tahunan, custom), per kategori.

**Validasi built-in:** `Saldo Awal + Penambahan − Pengurangan − Penyusutan = Saldo Akhir`. Jika tidak balance, sistem tampilkan peringatan.

---

### 5.4 Audit Trail Per Aset

**Tujuan:** Riwayat kronologis lengkap satu aset untuk keperluan audit.

**Konten:**
- Timeline semua kejadian dari `asset_audit_log`
- Setiap baris: timestamp, jenis kejadian, detail (nilai sebelum/sesudah), user, no. referensi jurnal
- Link ke dokumen pendukung per event

**Filter:** Cari per nomor aset, rentang tanggal, jenis kejadian.

**Export:** PDF (format kronologis siap serahkan ke auditor), Excel.

**Catatan implementasi:** Data diambil langsung dari `asset_audit_log` tanpa join ke tabel yang bisa diubah — memastikan data yang tampil adalah rekaman asli.

---

### 5.5 Laporan Hasil Opname & Selisih

**Tujuan:** Membandingkan fisik vs sistem setelah stock opname.

**Bagian 1 — Ringkasan:**
- Total aset yang diverifikasi
- Jumlah sesuai, beda lokasi, tidak ditemukan
- Persentase kecocokan

**Bagian 2 — Detail selisih:**
- Daftar aset dengan status bukan `matched`
- Kolom: No. Aset, Nama, Lokasi Sistem, Lokasi Aktual, Status Verifikasi, Kondisi Aktual, Foto
- Rekomendasi tindak lanjut per baris

**Bagian 3 — Aset tidak terdaftar:**
- Aset yang ditemukan secara fisik tapi tidak ada di sistem (temuan baru)

**Export:** Excel (dengan kolom tindak lanjut), PDF (Berita Acara Opname lengkap dengan tanda tangan), Ringkasan eksekutif 1 halaman.

---

### 5.6 Laporan Proyeksi Penggantian Aset

**Tujuan:** Perencanaan anggaran — aset mana yang perlu diganti dalam 12 bulan ke depan.

**Konten:**
- Daftar aset yang masa manfaatnya habis dalam rentang waktu yang dipilih
- Kolom: No. Aset, Nama, Kategori, Tanggal Habis Masa Manfaat, Nilai Buku Saat Ini, Nilai Perolehan Asli
- Estimasi biaya penggantian (input manual atau persentase dari harga perolehan)

**Filter:** Rentang waktu proyeksi (3/6/12/24 bulan ke depan), per kategori, per lokasi/divisi.

**Export:** Excel (untuk proposal anggaran), PDF.

---

### 5.7 Laporan Aset Fully Depreciated Masih Digunakan

**Tujuan:** Identifikasi aset yang nilai bukunya sudah nol tapi masih aktif dipakai — perlu keputusan manajemen.

**Kolom:** No. Aset, Nama, Kategori, Tanggal Habis Dep., Harga Perolehan, Kondisi Terakhir, Lokasi.

**Penggunaan:** Input untuk keputusan: perpanjang masa manfaat, lakukan revaluasi, atau segera disposal.

---

## 6. Alur Approval

### 6.1 Pendaftaran Aset Baru
```
Staff input → [opsional: review finance] → Tersimpan aktif
```
Untuk aset di bawah nilai tertentu (dikonfigurasi), bisa langsung tersimpan tanpa approval. Untuk aset di atas threshold approval, butuh verifikasi finance.

### 6.2 Pelepasan Aset
```
Staff/Finance ajukan disposal → Manajer review & approve/reject → 
  [Jika approve] → Finance posting jurnal → Aset disposed
  [Jika reject] → Kembali ke pengusul dengan catatan
```
Approval wajib untuk semua pelepasan tanpa pengecualian.

### 6.3 Kapitalisasi Biaya Perbaikan
```
Staff/Finance input → Finance klasifikasi (capex/opex) → 
  [Jika capex > threshold] → Manajer approve → Posting & regenerate jadwal
  [Jika opex atau capex kecil] → Finance langsung posting
```

### 6.4 Penghapusan Aset (Write-off karena rusak/hilang)
```
Staff lapor kondisi + foto → Finance draft write-off → 
Manajer approve → Finance posting jurnal
```

**Catatan implementasi approval:**
- Notifikasi approval via sistem (in-app notification) dan opsional email
- Approver bisa approve atau reject dengan wajib mengisi catatan
- Ada batas waktu: jika dalam 7 hari tidak direspons, sistem kirim reminder
- Semua keputusan approval dicatat di `asset_audit_log`

---

## 7. Audit Trail

### 7.1 Event yang Wajib Dicatat

Setiap event berikut harus otomatis menulis ke `asset_audit_log`:

| Event | Trigger | Detail yang dicatat |
|---|---|---|
| `created` | Aset baru disimpan | Semua nilai awal |
| `updated` | Perubahan data aset | Field yang berubah, nilai lama vs baru |
| `depreciation_posted` | Batch run diposting | Periode, jumlah, no. jurnal |
| `disposal` | Pelepasan dikonfirmasi | Metode, proceeds, laba/rugi, no. jurnal |
| `improvement_capitalized` | Kapitalisasi biaya | Jumlah ditambahkan, jadwal diregenerasi |
| `improvement_expensed` | Biaya dibebankan | Jumlah, no. jurnal |
| `location_changed` | Perpindahan lokasi | Lokasi lama vs baru, PIC lama vs baru |
| `status_changed` | Perubahan status | Status lama vs baru, alasan |
| `document_uploaded` | Dokumen diupload | Nama file, jenis dokumen |
| `approval_granted` | Approval diberikan | Approver, untuk transaksi apa |
| `approval_rejected` | Approval ditolak | Approver, alasan penolakan |
| `schedule_regenerated` | Jadwal penyusutan dihitung ulang | Alasan regenerasi, periode mulai |

### 7.2 Aturan Implementasi

- Tulis ke `asset_audit_log` dalam satu transaksi database yang sama dengan perubahan utama — jangan pisahkan, agar tidak ada perubahan yang tidak tercatat jika transaksi sebagian gagal
- Log harus ditulis bahkan jika proses utama gagal (misalnya: catat "percobaan disposal gagal karena tidak ada approval")
- Jangan pernah expose endpoint DELETE atau UPDATE untuk tabel ini di API
- Untuk keamanan ekstra: pertimbangkan membuat database user terpisah untuk tabel ini yang hanya punya hak INSERT dan SELECT

---

## 8. Integrasi dengan Modul Inventaris

### 8.1 Titik integrasi

**Dari inventaris ke aset:**
- Saat item inventaris memenuhi kriteria kapitalisasi (nilai di atas threshold, masa manfaat > 1 tahun), tampilkan tombol "Jadikan Aset Tetap" di halaman detail item inventaris
- Tombol ini membuka form tambah aset dengan beberapa field pre-filled dari data inventaris (nama, kategori, lokasi, penanggungjawab)
- Setelah aset disimpan, `assets.inventory_item_id` diisi dengan ID item inventaris

**Sinkronisasi data:**
- Perubahan lokasi di modul aset **tidak** otomatis update data inventaris (dan sebaliknya) — keduanya punya data terpisah. Rekonsiliasi dilakukan manual lewat opname.
- Kondisi aset di modul aset dan kondisi barang di inventaris adalah dua field terpisah yang bisa berbeda

**Tampilan lintas modul:**
- Di halaman detail item inventaris: jika item terhubung ke aset, tampilkan ringkasan data aset (nilai buku, status) dan link ke detail aset
- Di halaman detail aset: tampilkan link ke item inventaris terkait

### 8.2 Tidak ada duplikasi data master

- Tabel `locations` dan `users` tetap milik modul inventaris/shared — modul aset hanya reference lewat FK
- Tabel `asset_categories` adalah baru dan terpisah dari kategori inventaris, meskipun nama bisa mirip

---

## 9. Aturan & Constraint Bisnis

### 9.1 Aturan Nilai
- `acquisition_cost` tidak boleh diubah setelah aset disimpan, kecuali melalui fitur `asset_improvements` yang tercatat
- `asset_number` tidak boleh berubah setelah disimpan — ever
- `salvage_value` harus < `acquisition_cost`
- Nilai buku tidak boleh di bawah `salvage_value` (cegah over-depreciation)
- Pada saldo menurun: ketika nilai buku mendekati `salvage_value`, beban penyusutan dikurangi agar tidak melewati `salvage_value`

### 9.2 Aturan Status
```
Transisi status yang diizinkan:
active          → fully_depreciated (otomatis saat nilai buku = salvage_value)
active          → on_hold           (manual, perlu alasan)
active          → disposed          (melalui proses disposal + approval)
active          → under_maintenance (opsional, jika dikonfigurasi)
on_hold         → active            (cancel hold)
on_hold         → disposed          (melalui proses disposal + approval)
fully_depreciated → disposed        (melalui proses disposal)
under_maintenance → active          (setelah selesai)

Transisi yang TIDAK diizinkan:
disposed        → [apapun]          (final, tidak bisa dibalik)
```

### 9.3 Aturan Periode
- Satu periode (bulan+tahun) hanya boleh punya satu `depreciation_run` dengan status `posted`
- Periode yang sudah diposting dikunci untuk modifikasi — koreksi hanya lewat jurnal adjustment
- Tidak bisa mem-posting penyusutan untuk periode di masa depan

### 9.4 Aturan Jurnal
- Setiap jurnal harus balance: `total_debit = total_credit`
- Jika tidak balance, transaksi dibatalkan dan error dilaporkan
- Jurnal yang sudah `posted` tidak bisa diubah atau dihapus — hanya bisa dibuat jurnal pembalikan (reversal)

---

## 10. Referensi Istilah

| Istilah | Definisi |
|---|---|
| **Harga Perolehan** | Total biaya yang dikeluarkan sampai aset siap digunakan, termasuk harga beli, pajak, ongkir, instalasi |
| **Nilai Residu (Salvage Value)** | Estimasi nilai aset di akhir masa manfaatnya |
| **Depreciable Amount** | Harga Perolehan dikurangi Nilai Residu — jumlah yang akan disusutkan selama masa manfaat |
| **Nilai Buku (Book Value)** | Harga Perolehan dikurangi Akumulasi Penyusutan |
| **Akumulasi Penyusutan** | Total beban penyusutan yang sudah dibebankan dari awal hingga tanggal tertentu |
| **Fully Depreciated** | Kondisi di mana nilai buku aset sudah sama dengan nilai residu (atau nol jika nilai residu nol) |
| **Pro-rata** | Perhitungan penyusutan proporsional berdasarkan jumlah hari dalam suatu periode |
| **Kapitalisasi** | Mencatat pengeluaran sebagai aset (masuk neraca), bukan sebagai beban |
| **Write-off** | Menghapus nilai aset dari neraca karena rusak, hilang, atau tidak bernilai |
| **Disposal** | Proses mengeluarkan aset dari neraca — bisa melalui penjualan, write-off, tukar tambah, atau hibah |
| **Roll-forward** | Format laporan yang menunjukkan saldo awal + mutasi = saldo akhir |
| **Capex** | Capital expenditure — pengeluaran yang dikapitalisasi karena meningkatkan nilai/umur aset |
| **Opex** | Operational expenditure — pengeluaran operasional yang langsung dibebankan |
| **Opname** | Stock opname — proses verifikasi fisik aset dengan cara membandingkan kondisi lapangan dan catatan sistem |
| **Immutable** | Tidak bisa diubah — sifat yang wajib dimiliki oleh audit trail |
