# Asset Accounting Module - Implementation Plan

## Context

Implementasi modul Akuntansi Aset pada sistem inventaris existing. User memilih:
- **Backend:** PHP (extend existing)
- **Scope:** Core features only
- **DB:** Same MySQL, new tables

**Tujuan akhir:** Sistem dapat mencatat aset tetap, menghitung penyusutan, dan menghasilkan laporan keuangan.

---

## Phases

### Phase 1: Database & Foundation (Foundation)
**Goal:** Buat schema + seed data + base API

1. Buat `docker/mysql/init/3-assets-schema.sql`
   - 9 tables sesuai spec
   - Pattern sama dengan existing schema
   - Constraints untuk period locking & journal balancing

2. Buat `docker/mysql/init/4-assets-seed.sql`
   - Default asset categories (IT Equipment, Vehicles, Furniture, etc.)
   - Default asset_config

3. Buat PHP helper class
   - `public/api/assets/includes/depreciation_engine.php`
   - Fungsi untuk: straight-line, declining-balance, pro-rata calculation
   - Fungsi generate schedule

4. Test schema SQL run successfully

**Deliverables:** Schema SQL files, depreciation engine class

---

### Phase 2: Core PHP API (Backend Development)
**Goal:** CRUD endpoints untuk asset categories, assets, depreciation

1. `public/api/assets/categories.php`
   - GET (list), POST (create), PUT (update)
   - Auth: admin only

2. `public/api/assets/assets.php`
   - GET (list with filters), POST (create + generate schedules), PUT (update limited fields)
   - Auto-generate asset_number: `AST-YYYY-NNNN`
   - Trigger schedule generation on create
   - Auth: admin + finance

3. `public/api/assets/depreciation.php`
   - POST preview (calculate without saving)
   - POST post (save to DB + create journal)
   - GET list posted runs
   - Period locking validation

4. `public/api/assets/journal_entries.php`
   - GET (view journals)
   - POST (create journal on depreciation post)
   - Validate: total_debit = total_credit

5. `public/api/assets/audit.php`
   - GET (read-only audit log per asset)

**Deliverables:** 5 PHP endpoint files + test semua endpoint

---

### Phase 3: Reports API (Backend Development)
**Goal:** Laporan Fixed Asset Register + Depreciation per Period

1. `public/api/assets/reports.php`
   - GET `?type=fixed_asset_register` (as-of date filter, category filter)
   - GET `?type=depreciation_per_period` (period filter)
   - GET `?type=asset_mutations` (roll-forward)

**Deliverables:** Reports endpoint + sample data untuk test

---

### Phase 4: Frontend Context & UI (Frontend Development)
**Goal:** React components untuk admin panel

1. Update `src/context/AccessMatrixContext.tsx`
   - Add `asset_accounting` FeatureKey

2. Buat `src/context/AssetAccountingContext.tsx`
   - State: categories, assets, currentAsset, depreciationRuns
   - Actions: fetchCategories, createAsset, updateAsset, runDepreciation

3. Buat `src/pages/admin/AssetAccountingPage.tsx`
   - Layout: tabs (Daftar Aset | Kategori | Penyusutan | Laporan)
   - Asset list table dengan status badges
   - Search + filter

4. Buat `src/pages/admin/AssetForm.tsx`
   - Multi-step form (3 steps sesuai spec)
   - Real-time depreciation preview calculation

5. Buat `src/pages/admin/DepreciationRun.tsx`
   - Step 1: Pilih periode (calendar grid)
   - Step 2: Preview + review (exclude/override per asset)
   - Step 3: Posting confirmation

6. Buat `src/pages/admin/AssetReports.tsx`
   - Report selector
   - Filter controls
   - Export buttons (Excel/PDF)

**Deliverables:** 4 React files + context

---

### Phase 5: Integration & Routes (Frontend Integration)
**Goal:** Wire up routes + access control

1. Update `src/App.tsx`
   - Add routes: `/admin/assets`, `/admin/assets/new`, `/admin/assets/:id`
   - Add sidebar navigation link

2. Test full flow
   - Login → Admin → Navigate to Asset Accounting
   - Create category → Create asset → Run depreciation → View reports

**Deliverables:** Working end-to-end flow

---

## Workflow

```
[Database] → [Backend API] → [Reports API] → [Frontend UI] → [Integration]
   Phase 1       Phase 2          Phase 3        Phase 4         Phase 5
```

**Perubahan diuji setelah masing-masing phase selesai**

---

## Skills yang Relevan

| Skill | Usage |
|-------|-------|
| `database` | Desain schema + query optimization |
| `database-migrations-sql-migrations` | SQL migration patterns |
| `php-pro` | PHP backend patterns + security |
| `react-modernization` | React patterns |
| `frontend-ui-patterns` | Form + table components |
| `backend-architect` | API design decisions |
| `api-design-principles` | REST endpoint design |

---

## Files Summary

### Database (2 files)
```
docker/mysql/init/3-assets-schema.sql   ← baru
docker/mysql/init/4-assets-seed.sql     ← baru
```

### PHP Backend (6 files)
```
public/api/assets/
├── includes/
│   └── depreciation_engine.php          ← baru (helper class)
├── categories.php                      ← baru
├── assets.php                         ← baru
├── depreciation.php                   ← baru
├── journal_entries.php                ← baru
├── audit.php                          ← baru
└── reports.php                        ← baru
```

### React Frontend (5 files)
```
src/context/AssetAccountingContext.tsx  ← baru
src/pages/admin/AssetAccountingPage.tsx ← baru
src/pages/admin/AssetForm.tsx           ← baru
src/pages/admin/DepreciationRun.tsx    ← baru
src/pages/admin/AssetReports.tsx        ← baru
```

### Config Updates (2 files)
```
src/context/AccessMatrixContext.tsx      ← update (add feature key)
src/App.tsx                             ← update (add routes)
```

---

## Verification Checklist

- [ ] Schema SQL run tanpa error
- [ ] Asset categories CRUD works
- [ ] Asset registration + schedule generation works
- [ ] Asset number auto-generated (AST-YYYY-NNNN)
- [ ] Depreciation preview shows correct calculations
- [ ] Depreciation posting creates journal (balanced)
- [ ] Period locking prevents duplicate posts
- [ ] Fixed Asset Register report accurate
- [ ] Depreciation per Period report accurate
- [ ] Frontend loads without errors
- [ ] Full login → create → depreciate → report flow works

---

## Notes

**Yang belum diimplementasi (Phase 2+):**
- Asset disposal (pelepasan)
- Capitalization of improvements (kapitalisasi biaya)
- Stock opname
- Approval workflow
- Units of Production depreciation method
- Sum of Years digits depreciation method

**Asumsi:**
- Satu database (inventory_db) dengan prefix `asset_` untuk tabel baru
- Asset numbering lock setelah creation (tidak bisa diubah)
- Period locking via unique constraint di depreciation_runs
