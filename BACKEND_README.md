# Backend Setup Instructions

Backend memakai Native PHP di `public/api` dan MySQL.

## Opsi 1: Jalankan dengan Docker
1. Jalankan `docker compose up --build`.
2. MySQL akan bootstrap otomatis dari:
   - `docker/mysql/init/1-schema.sql`
   - `docker/mysql/init/2-seed.sql`
3. phpMyAdmin tersedia di `http://localhost:8080`.

## Opsi 2: Jalankan manual dengan XAMPP / Laragon
1. Start Apache dan MySQL.
2. Buat database `inventory_db`.
3. Import:
   - `docker/mysql/init/1-schema.sql`
   - `docker/mysql/init/2-seed.sql`

## API Configuration
Default konfigurasi database ada di `public/api/config/database.php`.
Sesuaikan host, username, password, dan nama database jika environment Anda berbeda.

## Testing API
Endpoint pengecekan backend tersedia di:
`http://localhost/projectpkl/Inventory/public/api/test.php`
