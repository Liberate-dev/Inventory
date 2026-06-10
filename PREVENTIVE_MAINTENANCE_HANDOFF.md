# Preventive Maintenance (Pemeliharaan) Handoff

## Overview
This document captures the current implementation of the **Pemeliharaan** (Preventive Maintenance) feature.

The feature was originally referred to as "Preventive Maintenance" / "Pemeliharaan Preventif". Per user request, the visible menu name was simplified to **"Pemeliharaan"**.

The module supports two distinct flows:
1. **AI-generated recommendations** (automatic) — users can only accept or reject.
2. **Manual scheduling** — users can create new maintenance schedules themselves.

It follows the 5-module plan where maintenance (pemeliharaan) is separated from repair (perbaikan via service requests).

## Key User Clarifications Implemented
- AI recommendations must be **automatic**. Users (especially sarpras) should not create AI recommendations manually. They can only **accept/reject** AI suggestions.
- Manual creation is reserved for when the user wants to schedule maintenance on their own initiative.
- In the manual scheduling form:
  - Item selection must use a **dropdown** (not free text).
  - Selecting an item must **auto-fill** location/room and other details (e.g. current condition).
- Scheduled dates cannot be in the past (date picker is locked to today and future).
- Menu name simplified to **"Pemeliharaan"**.
- Removed the "Sumber" (AI vs Manual) column from the active schedule table for cleaner UI.
- Added **Edit** capability for active (scheduled) maintenance entries.
- When **canceling** an active schedule, a popup/modal is **required** to enter a reason (`cancelReason`).

## Files Changed / Key Locations
- `src/pages/admin/PreventiveMaintenancePage.tsx` — Main implementation (demo + full UI logic).
- `src/layouts/DashboardLayout.tsx` — Navigation item label changed to "Pemeliharaan".
- `src/context/AccessMatrixContext.tsx` — Feature label updated to "Pemeliharaan" (feature key remains `preventive_maintenance`).
- `src/App.tsx` — Route remains `/dashboard/preventive-maintenance` (protected by `InventoryRoute` + `FeatureRoute` for `preventive_maintenance`).

## Data Model
```ts
interface MaintenanceTask {
  id: string;
  itemId: string;
  itemName: string;
  roomName: string;
  reason: string;
  recommendedDate: string;
  status: 'pending' | 'scheduled' | 'completed' | 'cancelled' | 'rejected';
  source: 'ai' | 'manual';
  cancelReason?: string;   // populated when user cancels with reason
}
```

- Tasks are currently stored in local React state (demo only).
- `itemId` + `roomName` come from real inventory data.

## Core Flows

### 1. AI Recommendations (Automatic)
- Button: **"Minta Rekomendasi AI"** (only visible to users with edit rights).
- Generates 1–3 pending AI recommendations by analyzing available inventory items.
- Recommendations appear in the **"Rekomendasi dari AI"** section.
- Actions available:
  - **Terima & Jadwalkan** → moves the task to "scheduled" status.
  - **Tolak** → removes the recommendation.
- Users cannot create new AI-style recommendations manually.

### 2. Manual Scheduling
- Separate button: **"Jadwalkan Manual"**.
- Opens a modal with:
  - **Dropdown** of real items from `InventoryContext` (rooms → containers → items).
  - Auto-filled fields on selection: **Lokasi** and **Kondisi Saat Ini**.
  - Free-text **Alasan / Catatan**.
  - **Tanggal Pemeliharaan** with `min=today` (no past dates allowed).
- Creates a task with `source: 'manual'` and `status: 'scheduled'`.

### 3. Active Schedules ("Jadwal Pemeliharaan Aktif")
- Combined list of accepted AI recommendations + manually created schedules.
- Columns: Item | Lokasi | Alasan | Tanggal | Aksi (no "Sumber" column).
- Actions for managers:
  - **Edit** — opens modal to change reason and/or recommended date (item & location are read-only).
  - **Tandai Selesai** — sets status to `completed`.
  - **Batalkan** — opens required-reason modal (see below).

### 4. Cancel with Required Reason
- Clicking "Batalkan" on an active schedule opens a modal.
- User **must** provide a reason in a textarea.
- Reason is stored in `cancelReason`.
- Confirm button is disabled until a non-empty reason is entered.
- On confirm: status becomes `'cancelled'`.

## Access Control
Controlled via `AccessMatrixContext` (`preventive_maintenance` feature):
- `kepala_sekolah`: full
- `sarpras`: full
- Others: view or none (per matrix)

Only users with `canEditFeature('preventive_maintenance')` see the generate/manual buttons and edit/cancel/complete actions.

## Current Status & Limitations (Demo)
- Fully functional as a rich frontend demo.
- AI recommendations are **simulated** (random selection + template reasons). Real AI integration is planned as **"direct call with user's key"** (OpenAI/Gemini/etc. from the browser using a key the user provides).
- No backend persistence for `MaintenanceTask` yet (tasks live in component state and reset on refresh).
- No automatic reminders, notifications, or item log updates on complete/cancel (placeholders exist in alerts).
- Uses real inventory data for the item dropdown and auto-fill via `InventoryContext`.
- Date validation and required-reason cancel are enforced on the UI.

## Integration Points
- **InventoryContext** — provides `rooms` (with nested containers/items) for the selectable items list and auto-fill.
- **AccessMatrixContext** — feature gating and `canSee` / `canEditFeature`.
- **AuthContext** — current user for access checks.
- Future: Should integrate with item logs (`PREVENTIVE_MAINTENANCE_COMPLETED`, status/condition updates) and a notifications system.

## Recommended Next Steps
1. Add real AI call (using user-provided API key as per original plan — input location still needs to be decided with user).
2. Persist maintenance schedules (new backend endpoint or reuse/extend item logs).
3. On "Tandai Selesai": append proper `ItemLog` entry and optionally update item condition.
4. Add history / completed + cancelled list with visible `cancelReason`.
5. Scheduled reminders/notifications (aligns with disposal "held jadwal" pattern).
6. Consider moving cancelled/completed tasks out of the main active table or add filtering/tabs.

## Quick Reference
- Main component: `src/pages/admin/PreventiveMaintenancePage.tsx`
- Nav label: `src/layouts/DashboardLayout.tsx`
- Feature label: `src/context/AccessMatrixContext.tsx`
- Route: `/dashboard/preventive-maintenance` (protected)

This handoff reflects the state after the latest clarifications around automatic AI recs, manual scheduling UX, date constraints, menu naming, column removal, edit capability, and mandatory cancel reason.

## Item Management Integration (Major Architecture Update - Post PM Work)

The inventory data model was significantly refactored to support "Item" (master/type) + "Label" (specific physical instance) separation, as requested for better code inventory integration and to avoid redundancy.

### New Model
- **Manajemen Barang** (ItemManagementPage) now **manages "Item" masters only** (e.g. "Meja", "Kursi"). These live in a dedicated `item_types` table (with name, type, category, specs, parameters).
  - Central category management section ("Kategori Barang") — categories are first-class, managed separately, and used as dropdowns everywhere (including add forms and AI prompts). Not free-text anymore.
  - "Tambah Item Baru (Tipe Master)" form for creating masters (with AI name suggestion button using central categories to avoid duplicates).
- **When adding items in containers** (by any actor, not just sarpras): 
  - "Pilih Item (Tipe)" dropdown is **optional**.
  - Choose existing master → auto-fills name + category.
  - Leave empty + enter name → creates a **new master on-the-fly** (via `createItemType`), which automatically appears in Manajemen Barang.
  - The specific unit is the "**label**" (distinguished by SKU/code). The SKU/label is what makes e.g. "Meja with label SEK-001 in Lab A" different from another.
- **All added items (instances/labels)** by any actor automatically appear in the **main list of Manajemen Barang** (no manual refresh).
  - Powered by `InventoryContext` (rooms tree) + SSE real-time events (`container_item_changed`, `item_type_created`, `category_created`, etc.) + optimistic updates + BroadcastChannel for cross-tab.
  - No client polling. Changes by sarpras (e.g. new category or master) instantly available in actor add forms and vice versa.
- **AI Integration in Manajemen Barang + Add Forms** (real, multi-provider fallback: Gemini primary → OpenRouter → Cerebras):
  - **Name suggestion** (Sparkles button): Avoids redundancy. Prompt explicitly reads from **managed categories in Manajemen Kategori** (not arbitrary). Suggests canonical name + category.
  - **Code/SKU generation**: `generateSmartCodeWithAI` (formula-aware: room shortcode + type shortcode + sequence, UPPERCASE, dash). Now also passes category from central management.
  - **Bulk auto-manage in MB**: "Auto Manage Semua Kode/Label dengan AI (sekali click)" button — one click runs AI over *all* items/instances, updates SKUs in the list (preview via local edited state). Sarpras can manually edit SKUs (flexible). AI suggestions respect Manajemen Kategori.
  - In add item form: After AI name suggestion (or choosing type), code auto-generates. When creating new master, the new type + instance both land in Manajemen Barang.
- **Inventory Code Management**: Fully integrated with AI-generated codes. SKUs are always editable (in add forms and MB list). Sarpras has full flexibility to change/override AI results. No more hard "generate only" buttons that were buggy (removed refresh symbols per feedback).
- **Removed / Simplified** (per user feedback):
  - "Barang Habis Pakai?" toggle and associated "consumables / habis pakai" language from add item form.
  - "Stok minimum" (minStock) field from add item form.
  - Manual refresh icon/symbols in MB (buggy "ngeblink" failed to fetch; mechanism kept via context/SSE).
  - Long debug/keterangan text in PM and MB headers.

### Impact on Preventive Maintenance
- The item dropdown in PM scheduling now uses the new model: selectable items come from real instances (with proper `item_type_id` link to masters).
- `itemId` in MaintenanceTask still works, but items are now "labels" of masters. Auto-fill and location still function.
- When PM completes/cancels, it can still append to `item_logs` (PREVENTIVE_MAINTENANCE_* actions) — the underlying item is a specific labeled instance.
- AI recommendations in PM continue to analyze dates/condition/logs (real multi-provider AI supported; simulated fallback removed in favor of real calls where keys are set).

### Current Files & Integration Points (Updated)
- `src/pages/admin/ItemManagementPage.tsx` — Now primary for master "Item" + categories + instances list (derived live from contextRooms for auto visibility). Bulk AI, per-item AI code buttons + editable SKUs, create-master form with AI name helper.
- `src/components/inventory/ContainerDetailModal.tsx` — Add item form: optional "Pilih Item (Tipe)", AI name suggestion (reads central categories), AI code gen (auto after name/type), create-new-master-on-fly logic (calls `createItemType`).
- `src/context/InventoryContext.tsx` — `itemTypes`, `categories`, `createItemType`, `createCategory`, `deleteCategory`, `refresh*`. SSE listener for `inventory_events` (category_created, item_type_created, container_item_changed, etc.). Optimistic updates + BroadcastChannel. `rooms` tree now carries the instances.
- `src/utils/aiClient.ts` — `suggestCanonicalItemName` + `generateSmartCodeWithAI` (multi-provider, prompts updated to respect Manajemen Kategori, formula for codes).
- Backend: `public/api/inventory/item_types.php`, `categories.php` (with ensure + event logging), `rooms.php` (sync + event logging for instances), `events.php` (SSE endpoint).
- Schema: `item_types`, `item_categories`, `inventory_events` tables (ensured on-the-fly for existing DBs).
- Real-time: SSE + context means changes by sarpras (new category/master) or actors (new item/label in container) appear everywhere without refresh.

### Data Model Notes (Updated)
- Masters: `item_types` (id, name, type, category, specs, parameters...).
- Instances (what actors add): still in `items` table (now with `item_type_id` FK to master). SKU is the "label".
- In MB: Main list = instances (auto from context). Detail/labels view per master type.
- PM `MaintenanceTask` continues to reference specific instance `itemId` (now a labeled unit of a master).

### Current Status
- Full integration live: actors (any role with access) can add items (choose existing master or create new with AI name help). Everything surfaces in Manajemen Barang automatically.
- AI is real (user keys via .env), category-aware, bulk-capable in MB, and used for both name dedup and code gen.
- Codes are AI-generated by default but fully editable by sarpras (in forms + MB list).
- No polling, no manual refresh required for cross-actor/cross-view sync (SSE + context).
- Removed UI clutter as requested (consumable toggle, min stock, refresh icons).
- PM continues to work on top of the new model (item dropdown uses instances; logs still append correctly).

### Recommended Next Steps (Updated)
- Full persistence + editing for instances directly from MB list (currently mostly via container forms + context).
- Expose more granular SSE events or allow sarpras to "apply" bulk AI code changes directly to DB from MB.
- Extend AI in MB to also suggest new master types or bulk-normalize existing names across the system.
- For PM: wire real AI recommendations (already supported in client) + persist schedules to item_logs on complete/cancel.
- Consider a "Master Items" tab or secondary view in MB if the current instances-primary list becomes too crowded.

This handoff now captures both the original PM feature and the major item management / AI / real-time integration work that was requested afterward (including the full item/label split, central categories, AI name+code, bulk auto-manage, optional create-new in add forms, and auto visibility of all actor-added items in MB).

All changes follow the AGENTS.md rules (lint → test → build, GitNexus impact where symbols edited, etc.). Working tree clean at time of update.