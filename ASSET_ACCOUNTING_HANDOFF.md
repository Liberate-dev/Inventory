# Asset Accounting Module - Handoff Document

## Overview

Phase 1 core implementation: asset registration, depreciation calculation, batch depreciation run, basic reports.

## Latest Update - Inventory Schema, Access Matrix, Seed Data, and Reports

Status: implemented. Active Docker database has been seeded, and the latest frontend build passed.

### Completed in this update
- Inventory schema compatibility:
  - Added runtime compatibility helper `public/api/inventory/schema_compat.php`.
  - `items`, `rooms`, and `containers` now get the expected `deleted_at` column when an older DB is missing it.
  - `items` also gets `source`, `acquisition_date`, and `acquisition_cost` when an older DB is missing those fields.
  - Applied compatibility checks in inventory item, room, inventory code, and service request APIs.
- Item source and acquisition information:
  - Inventory item normalization now preserves `source`, `acquisitionDate`, `acquisitionCost`, and snake_case API aliases.
  - Item form loading reads both camelCase and snake_case acquisition fields.
  - Container item save payload now sends acquisition/source fields, so "Asal Barang" and "Informasi Perolehan" persist after save.
  - Room/container sync accepts both frontend and backend field naming.
- Access matrix:
  - Added `asset_accounting` to the access matrix feature list used by user management.
  - Default permission remains `admin_nl: full`; other roles are `none` unless changed through matrix management.
- Asset accounting seed data:
  - Added 5 relevant fixed asset examples to `docker/mysql/init/4-assets-seed.sql`.
  - Added `scripts/seed_asset_samples.sql` so the same sample data can be imported into an already-running Docker DB without recreating the volume.
  - Imported the sample assets into the active `inventory-db-1` database.
- Professional reports:
  - Replaced the raw JSON report output in `src/pages/admin/AssetAccountingPage.tsx` with a structured report view.
  - Added report selector, parameter controls, report metadata, summary cards, and tabular output.
  - Covered dashboard, fixed asset register, depreciation per period, asset mutations, replacement projection, fully depreciated in use, and disposal summary.

### Active database seed status
- Imported `scripts/seed_asset_samples.sql` into Docker MySQL container `inventory-db-1`.
- Verified active DB contents:
  - 5 assets
  - 6 depreciation schedule rows
  - 1 disposal record
- Sample assets now present:
  - `AST-2026-0001` Server Rack Pembelajaran Digital
  - `AST-2026-0002` Mikroskop Trinokuler Digital
  - `AST-2026-0003` Lemari Arsip Tahan Api
  - `AST-2026-0004` Bed Pemeriksaan UKS Elektrik
  - `AST-2026-0005` Sepeda Motor Operasional Lama

### Previous asset form fixes retained
- `src/pages/admin/AssetForm.tsx`
  - Tanggal Mulai Penyusutan defaults to the same date as Tanggal Perolehan.
  - When Tanggal Perolehan changes, Tanggal Mulai Penyusutan follows it automatically unless manually edited.
  - No. Dokumen uses preview instead of generate, so opening the form does not consume document numbers.
- `public/api/assets/document_numbers.php`
  - Added `POST action=preview` for non-consuming document number preview.
  - Kept `POST action=generate` for actual number reservation.
- `public/api/assets/assets.php`
  - Backend fallback uses `acquisition_date` as `depreciation_start_date` when omitted.
  - Depreciation start date cannot be before acquisition date.
  - Duplicate document reference is checked before insert.

### Verification status
- `npm run build`: passed after the latest asset accounting/report changes.
- Active Docker DB seed: verified with direct MySQL query.
- `npm run lint`: currently blocked by existing unrelated lint errors in `.claude/helpers/statusline.cjs` and `src/pages/admin/OperationsPage.tsx`, plus warnings.
- Vitest: not rerun end-to-end in this update; earlier focused run hit `spawn EPERM` while loading Vite/esbuild in the sandbox.
- Manual UI test: pending user direct testing.

## Access Control

Admin non-lab only (`admin_nl: 'full'`). Admin IT (super admin): `none`. Other roles: `none`.

```typescript
// src/context/AccessMatrixContext.tsx
asset_accounting: { admin: 'none', kepala_lab: 'none', guru: 'none', kepala_sekolah: 'none', sarpras: 'none', admin_nl: 'full' }
```

**Backend auth.php also updated** with `asset_accounting` feature key.

## Database

### Tables (already created)
```
asset_categories       - category definitions (GL codes, depreciation rules)
assets                 - main asset table (number, cost, method, dates, status)
depreciation_schedules  - per-period rows auto-generated on asset create
depreciation_runs      - batch run header (period, status, totals)
depreciation_run_items - per-asset details (include/exclude/override)
journal_entries        - journal header (date, type, reference)
journal_entry_lines    - debit/credit lines per account
asset_audit_log        - immutable audit trail (INSERT only)
asset_config           - company settings
```

### Seeded Data
10 default categories with depreciation defaults:

| Kategori | Metode | Masa Manfaat | Salvage % |
|----------|--------|-------------|-----------|
| Tanah | straight_line | 0 bulan | 100% |
| Bangunan & Gedung | straight_line | 240 bulan | 0% |
| Peralatan Komputer & IT | straight_line | 48 bulan | 0% |
| Perabot & Furnitur | straight_line | 60 bulan | 0% |
| Peralatan Laboratorium | straight_line | 96 bulan | 0% |
| Peralatan Olahraga | straight_line | 60 bulan | 0% |
| Kendaraan Operasional | declining_balance | 96 bulan | 10% |
| Peralatan Dapur/UKS | straight_line | 60 bulan | 0% |
| Buku Perpustakaan | straight_line | 60 bulan | 0% |
| Aset Lainnya | straight_line | 60 bulan | 0% |

5 sample fixed assets are included in `docker/mysql/init/4-assets-seed.sql` and in the idempotent active-DB script `scripts/seed_asset_samples.sql`.

| Nomor Aset | Nama | Status | Nilai Perolehan |
|------------|------|--------|-----------------|
| AST-2026-0001 | Server Rack Pembelajaran Digital | active | Rp45.000.000 |
| AST-2026-0002 | Mikroskop Trinokuler Digital | active | Rp32.000.000 |
| AST-2026-0003 | Lemari Arsip Tahan Api | active | Rp8.500.000 |
| AST-2026-0004 | Bed Pemeriksaan UKS Elektrik | fully_depreciated | Rp12.000.000 |
| AST-2026-0005 | Sepeda Motor Operasional Lama | disposed | Rp18.000.000 |

## API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/public/api/assets/categories.php` | GET, POST, PUT | CRUD asset categories |
| `/public/api/assets/assets.php` | GET, POST, PUT | CRUD assets + auto-generate schedules |
| `/public/api/assets/depreciation.php` | GET, POST | List runs, preview, post |
| `/public/api/assets/journal_entries.php` | GET | Journal read-only |
| `/public/api/assets/reports.php?type=...` | GET | Dashboard, Fixed Asset Register, Depreciation per Period, Asset Mutations, Replacement Projection, Fully Depreciated in Use, Disposal Summary |
| `/public/api/assets/audit.php` | GET | Audit log read-only |
| `/public/api/users/lab_heads.php` | GET | List kepala_lab, kepala_sekolah, sarpras (for responsible user) |

## Frontend Components

| File | Purpose |
|------|---------|
| `src/context/AssetAccountingContext.tsx` | State management, API calls |
| `src/pages/admin/AssetAccountingPage.tsx` | Main page with tabs plus professional report renderer |
| `src/pages/admin/AssetForm.tsx` | 3-step form with inventory item integration |
| `src/pages/admin/DepreciationRun.tsx` | Batch run UI (Choose Period → Preview → Post) |

## Routes

```typescript
// src/App.tsx
<Route path="assets" element={<FeatureRoute feature="asset_accounting"><AssetAccountingPage /></FeatureRoute>} />
```

Sidebar: "Akuntansi Aset Tetap" with Building2 icon.

## Asset Form - Inventory Integration

### Features
1. **Link to Inventory Item** - Dropdown to select existing inventory items
2. **Auto-fill on Selection:**
   - Name → from item name
   - Description → from item specs and parameters (SKU, specifications, JSON parameters, condition, location, container)
   - Condition → from item condition
   - Location → from item's room (read-only)
   - Responsible User → auto-detected based on room type:
     - Lab rooms (biology/chemistry/physics/computer) → kepala_lab with matching lab_scope
     - Non-lab rooms → kepala_sekolah or sarpras
3. **Auto-calculate Salvage Value** - Based on category default_salvage_value_pct
4. **Currency Formatting** - Price inputs show thousand separators (IDR format)
5. **Preview Penyusutan** - Shows calculation formula (Garis Lurus / Saldo Menurun)
6. **Hover Tooltips** - Info icons on: Tanggal Perolehan, Nilai Residu, Masa Manfaat, Tarif, Tanggal Mulai Penyusutan

### Responsible User Logic
| Room Type | Responsible |
|-----------|-------------|
| biology, chemistry, physics, computer (lab) | kepala_lab with matching lab_scope |
| classroom, office, warehouse, other | kepala_sekolah or sarpras |

## Key Implementation Details

### Asset Form (3 Steps)
- **Step 1 - Identitas**: Link inventory item, category, name, description (auto-fill from item), location, responsible, condition
- **Step 2 - Keuangan**: Tanggal perolehan, no dokumen, vendor, harga, nilai residu (auto from category), metode, masa manfaat, tarif, tanggal mulai penyusutan, preview dengan rumus
- **Step 3 - Konfirmasi**: Summary + checkbox konfirmasi (full Indo)

### Asset Numbering
Format: `AST-YYYY-NNNN` (auto-generated, locked after creation)

### Depreciation Methods
- `straight_line` - (Cost - Salvage) / Useful Life
- `declining_balance` - Book Value × Rate / 12

### Depreciation Run (Batch Posting)
- **Step 1**: Pilih periode (bulan/tahun)
- **Step 2**: Preview dengan checkbox select per aset, select all, selection summary
- **Step 3**: Konfirmasi posting dengan journal preview

### Pro-rata Handling
Mid-month acquisitions calculate partial first month based on days remaining.

### Period Locking
Prevent duplicate depreciation posts. Check `depreciation_schedules.status = 'posted'` before posting.

### Journal Generation
Per-category journal entries created on depreciation post. Jurnal number format: `JRN-YYYY-MM-NNNN`.

## Depreciation Engine

```php
// public/api/assets/includes/depreciation_engine.php
class DepreciationCalculator {
    static function straightLine($acquisitionCost, $salvageValue, $usefulLifeMonths): array
    static function decliningBalance($bookValue, $rate): float
    static function calculateProRata($monthlyDep, $acquisitionDate, $periodStart): float
    static function generateSchedule(array $asset): array  // generates all periods on asset create
}
```

## Verification

Automated/current checks:

1. `npm run build` passed after the latest report and access matrix changes.
2. Active Docker DB was verified directly in MySQL:
   - 5 assets
   - 6 depreciation schedule rows
   - 1 disposal record
3. `npm run lint` is currently blocked by existing unrelated errors in `.claude/helpers/statusline.cjs` and `src/pages/admin/OperationsPage.tsx`.
4. Vitest was not rerun end-to-end in this update because the earlier focused run hit `spawn EPERM` while loading Vite/esbuild in the sandbox.

Manual checks still recommended:

1. Login as admin_nl.
2. Navigate to `/dashboard/assets`.
3. Confirm the 5 seeded assets appear in the asset list.
4. Open Reports and check each report type renders as a professional report, not raw JSON.
5. Create or edit an inventory item and verify "Asal Barang" plus acquisition information persists after save/view.
6. Run depreciation preview and post in a test period, then verify journal creation and duplicate-period locking.

## Testing Credentials

Use existing admin_nl account. Token from login stored in `localStorage.auth_token`.

## Bug Fixes Applied

1. **Backend normalizeMatrix** - Removed admin role lock (super admin can now edit all roles)
2. **Backend authDefaultPermissionMatrix** - Added asset_accounting feature
3. **Items API** - Added `room_type` field, fixed reserved word backticks for `condition`, added `specs` and `parameters` fields
4. **Users API** - Created separate lab_heads.php endpoint (no user_management permission required)
5. **DepreciationRun** - Added checkbox selection for per-asset include/exclude before posting
6. **AssetForm** - Auto-fill description from inventory item specs and parameters
7. **Inventory schema compatibility** - Added runtime checks for missing `deleted_at`, source, and acquisition columns on older DBs
8. **Inventory acquisition persistence** - Preserved source/acquisition fields across normalization, form loading, and container item save
9. **Access matrix UI** - Added `asset_accounting` to the feature list shown in user management
10. **Asset seed data** - Added 5 relevant fixed assets and imported them into the active Docker DB
11. **Reports tab** - Replaced raw JSON rendering with professional report layout and parameter controls

## Open Issues

- Verify depreciation calculation accuracy
- Test journal entry balancing
- Test period locking prevents duplicate posts
- Manually verify inventory source/acquisition persistence in the UI
- Manually verify all asset report type selections with realistic date/category filters

Contact: David Augusto
