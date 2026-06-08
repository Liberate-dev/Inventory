# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Tech Stack

- **Frontend**: React 19 + Vite + TypeScript + Tailwind CSS v4
- **Backend**: Native PHP (no framework) in `public/api/`
- **Database**: MySQL 8.0
- **Dev Environment**: Docker Compose (web server, MySQL, phpMyAdmin)

## Commands

```bash
# Frontend development
npm install
npm run dev          # Start Vite dev server
npm run build        # Production build
npm run lint         # ESLint
npm run test         # Vitest unit tests

# Full stack (Docker)
docker compose up --build   # Start web + MySQL + phpMyAdmin
# App: http://localhost, phpMyAdmin: http://localhost:8080

# Seed data regeneration
node scripts/generate_seed_data.js
```

## Architecture

### Dual-Portal System

Two separate portals with different layouts:

1. **User Portal** (`/dashboard/*`): Regular users (teachers, lab heads, etc.)
   - Route guards via `InventoryRoute` and `FeatureRoute`
   - Uses `DashboardLayout`

2. **Admin Portal** (`/admin/*`): Admin users only
   - Protected by `AdminRoute`
   - Uses `AdminLayout`

### Feature Access Matrix

Role-based access control via `AccessMatrixContext`. Features are toggled per role with read/edit permissions. Feature gates in routes:

```tsx
<FeatureRoute feature="feature_name" requireEdit>
  <Component />
</FeatureRoute>
```

Roles: `admin`, `kepala_lab`, `guru`, `kepala_sekolah`, `sarpras`, `admin_nl`

### Context Hierarchy

```
AuthProvider
├── AccessMatrixProvider
│   └── PortalProvider
│       └── ToastProvider
│           └── NotificationProvider
│               └── InventoryProvider
│                   └── ServiceRequestProvider
│                       └── AssetAccountingProvider
```

### Database Schema

Four initialization files run in order:
1. `docker/mysql/init/1-schema.sql` - Core inventory schema
2. `docker/mysql/init/2-seed.sql` - Seed data
3. `docker/mysql/init/3-assets-schema.sql` - Asset accounting module
4. `docker/mysql/init/4-assets-seed.sql` - Asset seed data

### Key API Endpoints

- `public/api/auth/login.php` - Authentication
- `public/api/inventory/` - Items, rooms, inventory codes
- `public/api/assets/` - Asset accounting, depreciation, journal entries
- `public/api/service_requests/requests.php` - Service requests
- `public/api/access_matrix/matrix.php` - Feature permissions

### Asset Accounting Module

Asset depreciation and fixed asset management. Access: `admin_nl` only (full).

#### Access Control

```typescript
// src/context/AccessMatrixContext.tsx
asset_accounting: { admin: 'none', kepala_lab: 'none', guru: 'none', kepala_sekolah: 'full', sarpras: 'none', admin_nl: 'none' }
```

#### Database Tables

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

#### Seeded Categories

| Kategori | Metode | Masa Manfaat | Salvage % |
|----------|--------|-------------|-----------|
| Peralatan IT | straight_line | 48 bulan | 0% |
| Kendaraan | straight_line | 60 bulan | 10% |
| Mesin & Alat | straight_line | 48 bulan | 5% |
| Furnitur | straight_line | 48 bulan | 0% |
| Bangunan | straight_line | 240 bulan | 10% |
| Tanah | non-depreciable | - | 100% |
| Perangkat Komunikasi | straight_line | 48 bulan | 0% |
| Peralatan Olahraga | straight_line | 48 bulan | 0% |
| Alat Musik | straight_line | 48 bulan | 5% |
| Aset Lainnya | straight_line | 48 bulan | 0% |

#### API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/public/api/assets/categories.php` | GET, POST, PUT | CRUD asset categories |
| `/public/api/assets/assets.php` | GET, POST, PUT | CRUD assets + auto-generate schedules |
| `/public/api/assets/depreciation.php` | GET, POST | List runs, preview, post |
| `/public/api/assets/journal_entries.php` | GET | Journal read-only |
| `/public/api/assets/reports.php?type=...` | GET | Fixed Asset Register, Depreciation Report, Asset Mutations |
| `/public/api/assets/audit.php` | GET | Audit log read-only |
| `/public/api/users/lab_heads.php` | GET | List kepala_lab, kepala_sekolah, sarpras (for responsible user) |

#### Frontend Components

| File | Purpose |
|------|---------|
| `src/context/AssetAccountingContext.tsx` | State management, API calls |
| `src/pages/admin/AssetAccountingPage.tsx` | Main page with tabs (Assets, Categories, Depreciation, Reports) |
| `src/pages/admin/AssetForm.tsx` | 3-step form with inventory item integration |
| `src/pages/admin/DepreciationRun.tsx` | Batch run UI (Choose Period → Preview → Post) |

#### Asset Numbering

Format: `AST-YYYY-NNNN` (auto-generated, locked after creation).

#### Depreciation Methods

- `straight_line` - (Cost - Salvage) / Useful Life
- `declining_balance` - Book Value × Rate / 12

#### Pro-rata Handling

Mid-month acquisitions calculate partial first month based on days remaining.

#### Period Locking

Prevent duplicate depreciation posts. Check `depreciation_schedules.status = 'posted'` before posting.

#### Journal Generation

Per-category journal entries created on depreciation post. Format: `JRN-YYYY-MM-NNNN`.

#### Asset Form - Inventory Integration

1. **Link to Inventory Item** - Dropdown to select existing inventory items
2. **Auto-fill on Selection:**
   - Name → from item name
   - Condition → from item condition
   - Location → from item's room (read-only)
   - Responsible User → auto-detected based on room type:
     - Lab rooms (biology/chemistry/physics/computer) → kepala_lab with matching lab_scope
     - Non-lab rooms → kepala_sekolah or sarpras
3. **Auto-calculate Salvage Value** - Based on category default_salvage_value_pct
4. **Currency Formatting** - Price inputs show thousand separators (IDR format)

#### Responsible User Logic

| Room Type | Responsible |
|-----------|-------------|
| biology, chemistry, physics, computer (lab) | kepala_lab with matching lab_scope |
| classroom, office, warehouse, other | kepala_sekolah or sarpras |

#### Testing

1. Login as admin_nl
2. Navigate to `/dashboard/assets`
3. Create asset category (if needed)
4. Create asset:
   - Select inventory item → verify auto-fill
   - Enter price → verify salvage auto-calculated
   - Verify schedules auto-generated
5. Run depreciation preview → post → verify journal created
6. Check Fixed Asset Register report

#### Excluded from Phase 1

- asset_disposals (retirement/sale)
- asset_improvements (enhancements)
- stock_opname (physical verification)
- Units of Production depreciation method
- Sum of Years digits depreciation method

#### Open Issues

- Verify depreciation calculation accuracy
- Test journal entry balancing
- Test period locking prevents duplicate posts

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **Inventory** (2168 symbols, 3995 relationships, 187 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/Inventory/context` | Codebase overview, check index freshness |
| `gitnexus://repo/Inventory/clusters` | All functional areas |
| `gitnexus://repo/Inventory/processes` | All execution flows |
| `gitnexus://repo/Inventory/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
