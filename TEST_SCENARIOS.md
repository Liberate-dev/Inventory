# QA Checklist & Test Scenarios - Sistem Manajemen Inventaris

Dokumen ini memuat skenario pengujian utama (Test Cases) beserta checklist penyelesaian untuk memastikan seluruh fitur yang tercantum dalam PRD berjalan sesuai persyaratan.

---

## 1. Autentikasi & Otorisasi (*Authentication & Authorization*)

- [x] **TC-AUTH-01: Login dengan kredensial valid**
  - **Langkah:** Masukkan *username* dan konfirmasi *password* yang valid.
  - **Ekspektasi:** Pengguna berhasil masuk dan dialihkan ke Landing Page/Portal Selection.
- [x] **TC-AUTH-02: Login dengan kredensial tidak valid**
  - **Langkah:** Masukkan *username* atau *password* yang salah.
  - **Ekspektasi:** Sistem menampilkan pesan *error* (contoh: "Username atau password salah") dan menolak akses.
- [x] **TC-AUTH-03: Akses *route* yang dilindungi tanpa login**
  - **Langkah:** Buka URL `/dashboard` atau URL terlindungi lainnya di browser tanpa *login*.
  - **Ekspektasi:** Sistem melakukan *redirect* otomatis ke halaman `/login`.
- [x] **TC-AUTH-04: Akses fitur dibatasi *role* administrator**
  - **Langkah:** Login sebagai *Guru*, lalu coba buka URL `/dashboard/admin/users`.
  - **Ekspektasi:** Pengguna dihalangi atau mendapatkan peringatan "Akses ditolak" / UI *user management* disembunyikan.
- [x] **TC-AUTH-05: Membuat Semua Role Pengguna**
  - **Langkah:** Login sebagai Admin, akses halaman User Management (`/dashboard/admin/users`), dan buat 4 *user* baru masing-masing dengan role: `kepala_lab`, `guru`, `kepala_sekolah`, dan `sarpras`.
  - **Ekspektasi:** Keempat akun pengguna berhasil dibuat dan tersimpan di database.
- [x] **TC-AUTH-06: Verifikasi Akses Role `kepala_lab`**
  - **Langkah:** Login menggunakan akun `kepala_lab` yang baru dibuat.
  - **Ekspektasi:** Tampilan menu disesuaikan. Memiliki akses untuk mengelola Lab sesuai cakupannya (misal: hanya Lab Komputer), tanpa akses ke "User Management".
- [x] **TC-AUTH-07: Verifikasi Akses Role `guru`**
  - **Langkah:** Login menggunakan akun `guru` yang baru dibuat.
  - **Ekspektasi:** Tampilan Dashboard berbeda (biasanya hanya bisa membuat Service Requests dan melihat daftar barang). Tanpa akses manajemen user atau merubah data utama ruang.
- [x] **TC-AUTH-08: Verifikasi Akses Role `kepala_sekolah`**
  - **Langkah:** Login menggunakan akun `kepala_sekolah` yang baru dibuat.
  - **Ekspektasi:** Memiliki menu untuk melihat semua ruangan dan laporan lengkap, namun tidak memiliki opsi untuk mengedit/menambahkan data, juga tanpa akses "User Management".
- [x] **TC-AUTH-09: Verifikasi Akses Role `sarpras`**
  - **Langkah:** Login menggunakan akun `sarpras` yang baru dibuat.
  - **Ekspektasi:** Pengguna berhasil login. Memiliki menu untuk menyetujui "Service Requests" dan memantau seluruh aset/ruangan, tapi tanpa akses ke "User Management".
- [x] **TC-AUTH-10: *Logout* dari sistem**
  - **Langkah:** Klik tombol "Logout", lalu coba menekan "Back" di browser ke `/dashboard`.
  - **Ekspektasi:** Sesi dihancurkan, kembali ke halaman *login* dan halaman tertutup.

---

### C. Manajemen Ruangan (Rooms) & Wadah (Containers)
- [x] **TC-ROOM-01: Tambah Ruangan Baru**
  - **Langkah:** Login sebagai Admin, masuk ke menu "Ruang Lab", klik "Tambah Ruang". Isi data (contoh: "Lab Kimia", kapasitas 30). Simpan.
  - **Ekspektasi:** Data tersimpan. Ruangan baru muncul dalam grid/daftar ruangan dengan indikator kapasitas dan jenis lab yang sesuai.
- [x] **TC-ROOM-02: Edit Data Ruangan**
  - **Langkah:** Pilih satu ruangan, klik tombol edit, ubah kapasitas/nama. Simpan.
  - **Ekspektasi:** Perubahan tersimpan dan segera terlihat di daftar antarmuka.
- [x] **TC-ROOM-03: Hapus Ruangan (dengan Peringatan)**
  - **Langkah:** Klik tombol hapus (tong sampah) pada "Lab Kimia". (Pastikan ada validasi konfirmasi menggunakan *modal* peringatan).
  - **Ekspektasi:** Muncul *modal* konfirmasi. Jika ya, data terhapus.
- [x] **TC-CONT-01: CRUD Lemari/Wadah di dalam Ruang**
  - **Langkah:** Masuk ke dalam rincian atau denah ruangan (contoh "Lab Komputer 1"). Tambahkan sebuah wadah (misalnya Lemari). Edit namanya, lalu hapus wadah tersebut.
  - **Ekspektasi:** Pengguna dapat membuat wadah secara interaktif, perubahan atribut wadah tersimpan, dan wadah dapat dihapus beserta seluruh aset isinya.

---

## 3. Manajemen Barang (*Item Management*)

- [x] **TC-ITEM-01: Menambahkan barang non-consumable ke kontainer**
  - **Langkah:** Tambah aset baru (contoh: "Mikroskop") di "Lemari A", atur jenis `non-consumable`.
  - **Ekspektasi:** Status "available", atribut dan kuantitas berhasil tersimpan. Sistem meng-generate log pembuatan (`Activity Log: Ditambahkan`).
- [x] **TC-ITEM-02: Mendaftarkan barang habis pakai (*consumable*)**
  - **Langkah:** Tambahkan item dengan `is_consumable = 1` dengan stok 100 dan min. stok 10.
  - **Ekspektasi:** Format input dapat disesuaikan untuk tipe bahan pakai.
- [x] **TC-ITEM-03: Mengubah status barang dan kondisi fisik**
  - **Langkah:** Klik aksi *edit* item, ubah keadaan item menjadi `damaged` (rusak).
  - **Ekspektasi:** Riwayat tercatat secara otomatis dan antarmuka/label berubah warna atau status.

---

## 4. Service Requests (Keluhan & Perawatan)

- [ ] **TC-SERV-01: Membuat pengajuan layanan perbaikan**
  - **Langkah:** Login sebagai Guru, pilih salah satu aset, ajukan komplain bahwa aset patah.
  - **Ekspektasi:** *Request* baru masuk ke daftar status `pending`.
- [ ] **TC-SERV-02: Menyetujui Service Request (Admin/Sarpras)**
  - **Langkah:** Login pakai akun Sarpras, periksa *pending request*, lalu tekan "Approve/Terima".
  - **Ekspektasi:** Status permintaan menjadi `accepted`, kondisi pada aset otomatis dicatat "dalam servis" jika ada aturan otomatis.
- [ ] **TC-SERV-03: Menolak Service Request beserta Alasan**
  - **Langkah:** Tekan tolak komplain, masukkan alasan penolakan.
  - **Ekspektasi:** Permintaan diset `denied` (*rejection_reason* terisi) dan pemohon bisa melihatnya di *dashboard*.
- [ ] **TC-SERV-04: Menandai Service Request telah Selesai**
  - **Langkah:** Tandai tiket sebagai *Completed*.
  - **Ekspektasi:** Waktu pengerjaan dan parameter `resolution_date` tercatat di dalam basis data (timestamp).

---

## 5. Operasi & Validasi Transaksi (*Operations & Validation*)

- [x] **TC-OPS-01: Verifikasi Transaksi dengan Identitas Valid (Nama)**
  - **Langkah:** Lakukan form Transfer/Checkout. Pada modal verifikasi, masukkan Nama yang terdaftar di database.
  - **Ekspektasi:** Sistem mencocokkan nama dengan data user di database. Jika cocok, transaksi berhasil dan dilanjutkan.
- [x] **TC-OPS-02: Verifikasi Transaksi dengan Identitas Valid (Email/No. HP)**
  - **Langkah:** Lakukan form Transfer/Checkout. Pada modal verifikasi, masukkan Email atau Nomor HP yang terdaftar di database.
  - **Ekspektasi:** Sistem mencocokkan email/no. HP dengan database. Jika cocok, transaksi berhasil diproses.
- [x] **TC-OPS-03: Verifikasi Transaksi dengan Identitas Tidak Valid**
  - **Langkah:** Lakukan form Transfer/Checkout. Pada modal verifikasi, masukkan Nama/Email/No. HP acak yang tidak ada di database.
  - **Ekspektasi:** Tombol "Verifikasi" tidak memproses transaksi. Sistem menampilkan pesan error UI: "User tidak ditemukan di database. Pastikan Nama, Email, atau No HP benar.".

---

## 6. Log Aktivitas & Pelaporan (*Logs & Reports*)

- [ ] **TC-LOG-01: Otomatisasi pemicu Log**
  - **Langkah:** *Update* nama dan spesifikasi satu buah item. 
  - **Ekspektasi:** Periksa menu "Activity Log" (Tabel `item_logs`). Pastikan pembaruan tercantum bersama dengan ID User yang mengubahnya.
- [ ] **TC-REP-01: Generator Laporan Inventaris**
  - **Langkah:** Akses menu "Reports", jalankan filter laporan inventaris rusak / sehat.
  - **Ekspektasi:** Daftar diolah dan data ringkasan dipaparkan dengan benar.
- [ ] **TC-DASH-01: Halaman *Overview*/Ringkasan Beranda**
  - **Langkah:** Akses halaman muka beranda (*Dashboard View*).
  - **Ekspektasi:** Diagram atau kartu ringkasan menampilkan metrik (Total Ruangan, Total Barang, Jumlah *Pending Request*) dengan metrik angka yang sesuai data asli.
