# Inventory Lab

Frontend React + Vite dengan backend PHP native untuk manajemen inventaris sekolah/lab.

## Struktur penting

- `src/`: frontend React
- `public/api/`: endpoint PHP
- `docker-compose.yml`: stack lokal untuk web, MySQL, dan phpMyAdmin
- `docker/mysql/init/`: bootstrap schema + seed database
- `scripts/generate_seed_data.js`: generator seed SQL

## Menjalankan frontend

```bash
npm install
npm run dev
```

## Menjalankan backend + database dengan Docker

```bash
docker compose up --build
```

Service yang tersedia:

- App web/PHP: `http://localhost`
- phpMyAdmin: `http://localhost:8080`

## Database init

Docker akan menginisialisasi database kosong memakai file berikut:

- `docker/mysql/init/1-schema.sql`
- `docker/mysql/init/2-seed.sql`

Jika seed perlu digenerate ulang:

```bash
node scripts/generate_seed_data.js
```

## Validasi

```bash
npm run lint
npm run test
npm run build
```
