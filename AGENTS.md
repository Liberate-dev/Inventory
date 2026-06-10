# AGENTS.md

## Dev Commands

```bash
# Frontend only
npm run lint    # ESLint (check for errors before committing)
npm run test    # Vitest unit tests
npm run build   # TypeScript check + Vite build
npm run dev     # Vite dev server

# Full stack (requires Docker)
docker compose up --build   # Starts PHP+Apache, MySQL 8.0, phpMyAdmin on :8080
```

## Validation Order

Run `lint` → `test` → `build` in sequence before submitting changes.

## Tech Stack

- **Frontend**: React 19 + Vite + TypeScript + Tailwind CSS v4
- **Backend**: Native PHP in `public/api/` (no framework)
- **Database**: MySQL 8.0 with 4 init scripts run in order:
  1. `docker/mysql/init/1-schema.sql`
  2. `docker/mysql/init/2-seed.sql`
  3. `docker/mysql/init/3-assets-schema.sql`
  4. `docker/mysql/init/4-assets-seed.sql`

## Docker Path Mount

Docker mounts the repo to `/var/www/html/Inventory` inside the container. PHP code references this path, so don't change the mount point.

## Seed Data

Regenerate with:
```bash
node scripts/generate_seed_data.js
```
This updates `docker/mysql/init/2-seed.sql`.

## ESLint Config

- Uses flat config (`eslint.config.js`) with `typescript-eslint`
- Ignores `dist/` folder
- `@typescript-eslint/no-explicit-any` and React hooks rules are warnings only

## Testing

- Vitest with jsdom environment
- Setup file: `src/test/setup.ts` (mocks ResizeObserver, IntersectionObserver, matchMedia, alert, confirm)
- Tests located in `src/test/`

## API Endpoints

- `public/api/auth/login.php` - Authentication
- `public/api/inventory/` - Items, rooms, containers
- `public/api/assets/` - Asset accounting (admin_nl only)
- `public/api/service_requests/requests.php` - Service requests
- `public/api/access_matrix/matrix.php` - Feature permissions

## Routes

- `/dashboard/*` - User portal (regular users)
- `/admin/*` - Admin portal (admin/admin_nl only)
- Access controlled via `FeatureRoute` and `AccessMatrixContext`

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **Inventory** (2524 symbols, 4619 relationships, 218 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

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
