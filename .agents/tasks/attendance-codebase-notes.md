# Attendance / Work Session — Codebase Notes (confirmed facts for downstream steps)

App root (run all npm/npx here): `/Users/apple/Desktop/Reapirox dummy2/app`
Steering lives at the **repo root**: `/Users/apple/Desktop/Reapirox dummy2/.kiro/steering/` (NOT under `app/`).
Tasks dir: `/Users/apple/Desktop/Reapirox dummy2/app/.agents/tasks/`.

## Identity

- `useSession()` → `src/lib/use-session.ts` returns `{ id?, name, email, organization, branch, roleId, avatarUrl, isAuthenticated }`. `id` = `currentUser.id` from `usePermissions()`. **This is `staff.id`** — the SAME id space as `SalesAgent.id` and presence `PresenceMeta.id`. Use `id` + org + `branch` for scoping; never name/role.
- `usePermissions()` (from `src/lib/permissions-context.tsx`) exposes `currentUser`, `authReady`, `logout`, `apiFetch`, `can`, `isDemoMode`, `getVisibilityByHref`. `apiFetch` is the authenticated fetch helper (sends the bearer token) used by `/api/account/*` routes.

## Presence / Online Users (reuse, do not fork)

- `src/lib/use-sales-presence.ts`:
  - `useSalesPresenceTracker({ id, name })` — mount ONCE app-wide (already mounted in app shell). Shared Realtime channel `"sales-agents-presence"`, idle timeout `IDLE_MS = 5min`. Dual-mode (Realtime vs localStorage heartbeat `repairox-sales-presence`).
  - `useSalesPresenceRoster()` → `{ onlineIds: Set<string>, metaById: Record<string, PresenceMeta> }`. `PresenceMeta = { id, name, onlineAt }`.
- `src/components/leads/sales-agents-online.tsx` → `<SalesAgentsOnline />` — the green Online pill + portalled dropdown (Active now / Offline), roster from `useLeads().salesAgents`, self id from `useSession().id`. **This is the entry point to extend with Work Status + work actions.**

## App shell mount point + logout

- `src/components/layout/app-shell.tsx` mounts `useSessionTracker()` and `useSalesPresenceTracker({ id: currentUser?.id, name: currentUser?.name })`. Add the new app-wide `useWorkSession(...)` auto-start hook here, alongside them, guarded by `authReady && currentUser`.
- `src/components/layout/topbar.tsx`: `handleLogout()` = `logout(); router.push("/login");`. The work-session end + open-break close must happen BEFORE `logout()`. The profile `Dropdown` (`@/components/ui/dropdown` → `Dropdown`, `MenuItem`, `MenuLabel`) is where "My Account" + "Log out" live — add Work Status + actions here for the current user.

## Session tracker precedent (per-device, authenticated API)

- `src/lib/use-session-tracker.ts` → `useSessionTracker()`; `getSessionToken()` (opaque localStorage handle `repairox-session-token`), `HEARTBEAT_MS = 60_000`. Calls `/api/account/sessions`. Good precedent for an app-wide heartbeat/lifecycle hook that also writes via `apiFetch`.
- API route precedent: `src/app/api/account/sessions/route.ts`. Server self-scoping helper `requireUser(req)` in `src/lib/account-security.ts` (verifies ANY signed-in user's bearer token, returns `UserGuard`). Also exports `parseUserAgent`, `extractIp`.

## Dual-mode context pattern (mirror this for a WorkSessionProvider)

- `src/lib/leads-context.tsx` is the canonical dual-mode context: `isSupabaseConfigured` + `supabase` from `@/lib/supabase`; Supabase-first writes with Realtime sync, localStorage fallback. Local keys like `repairox-leads`. Uses `usePermissions()`, `useSession()`, `demoKey()` (`@/lib/demo-mode`), `toast` (`@/components/ui/toaster`), `logActivity` (`@/lib/activity-log`), `notify` (`@/lib/notifications`).
- Provider mounting: `src/components/providers.tsx` — nested providers. Add a `WorkSessionProvider` (or similar) in the chain. Order: PermissionsProvider → ThemeProvider → ActiveStoreProvider → StoreProvider → StoreSettingsProvider → CatalogProvider → AccountingProvider → LeadsProvider → DealsProvider → QuotationsProvider → FieldProvider. A work-session provider only needs identity/permissions, so it can sit high (near LeadsProvider) — decide in design.

## Permission wiring (ALL layers must agree — see permission-matrix steering)

1. **Catalog** — `src/lib/permissions.ts`: add new key(s) to the `PermissionKey` union AND to a `PERMISSION_GROUPS` group def (with a human label). `ALL_PERMISSIONS` / `PERMISSION_LABEL` derive automatically.
2. **Matrix** — `src/lib/permission-levels.ts`: add each key to a `PERMISSION_MODULES` module + tier (`view`/`work`/`manage`/`full`). A likely home is a NEW module (e.g. `work_session` / "Attendance & Productivity") OR the existing `employees` module (which already has `manage_attendance` at the `manage` tier — consider reusing/extending). Decide in design; a key not in any module is ungrantable from the UI.
   - Suggested tiers: own "My Productivity" view = `view`/`work`; owner/team report + export = `manage`; admin Review/Correct of completed sessions = `manage`/`full`.
3. **CAP** — `src/lib/capabilities.ts`: add a `CAP.<group>` block, granular key(s) first then coarse fallback(s). `allow(can, CAP.x.y)` on the client; `<Can permission={CAP.x.y}>`. `full_access`/`*` already imply everything via `can()`.
4. **Server** — `src/lib/api-auth.ts`: `requirePermission(req, anyOf)` on any new `/api/**` route; resolves live from `role_permissions`. Delegation guard helpers: `keysBeyondAuthority`, `callerCanDelegateAll`. Admin roles: `master_shop_owner`, `platform_owner`, `developer_admin`.
5. **RLS** — new table policies using the shared helpers (below).
- Defaults OFF for new keys except owner roles (via `full_access`). The Sales Agent default grants are seeded in migration `0049` (SECTION 1) — if agents need "view own productivity" by default, add that key there (or in the new migration) following that pattern.

## Sales-Agent eligibility (owner agent selector) — RPC + predicate

- Migration `0049_sales_agent_lead_ownership.sql` defines:
  - `public.lead_sales_agents(p_branch_id uuid default null)` RPC → returns eligible, active Sales Agents (`staff_id, name, avatar_url, role_id, role_label, home_branch_id, store_ids`), store-scoped to the caller. `grant execute ... to authenticated`. **Use this for the owner's agent selector** (All + specific agent).
  - `public.lead_agent_eligible(p_staff_id, p_branch_id, p_org_id)` predicate — active + role holds exact key `leads_sales_agent` + authorized for the store. (Internal; not client-callable.)
  - `public.staff_store_ids(p_staff_id)` — a staff member's authorized store ids (internal).
- Client mirror helpers: `src/lib/sales-agents.ts` (`agentsForStore`, `isAgentEligible`, `rowToSalesAgent`, `SalesAgent`, `friendlyLeadOwnershipError`). `useLeads().salesAgents` / `salesAgentsFor(storeId)` already expose the directory.

## Shared RLS helpers (used across migrations; reuse — do NOT invent new scoping)

- `auth.uid()` → current auth user; `public.auth_staff_id()` → caller's `staff.id`.
- `public.auth_org_id()` / `public.auth_member_of_org(org_id)` → org isolation.
- `public.auth_branch_visible(branch_id)` → store scope (respects multi-store).
- `public.auth_has_any(array[...])` → permission check (honors `is_admin()`, `full_access`, `*`).
- `public.is_admin()` → built-in owner/admin roles (mirrors `ADMIN_ROLES` in `api-auth.ts`).
- `public.auth_can_cross_branch()` → requires `multi_store_access`.
- Service-role writes skip end-user guards by checking `if auth.uid() is null then return new;` (see `leads_ownership_guard`).

## Migration conventions

- Next migration number: **0075** (last existing is `0074_lead_multi_device.sql`).
- Style: additive + idempotent — `create table if not exists`, `add column if not exists`, `drop policy if exists` then `create policy`, `create or replace function ... security definer set search_path = public`, `drop trigger if exists` then `create trigger`.
- Per-user table + self-RLS precedent: `0066_user_table_preferences.sql` (keyed by `auth_user_id = auth.uid()`, four self-scoped policies). For work sessions, scope by `staff.id` via `auth_staff_id()` for the owner's own records, PLUS owner/team read via `auth_has_any([...])` + `auth_branch_visible`, PLUS org isolation.
- Enforce the state machine with BEFORE INSERT/UPDATE guard trigger(s) + a **partial unique index** to guarantee at most one OPEN session per user (e.g. `unique (staff_id) where ended_at is null`), and append-only break rows. Mirror the trigger style of `leads_ownership_guard` / `lead_followup_guard`.

## Time engine

- Put the pure calculation functions in a standalone module (e.g. `src/lib/work-session.ts`) with NO DB/React deps, and a `*.test.ts` beside it (repo uses `.test.ts` co-located, e.g. `src/lib/lead-intelligence.test.ts`). Formulas: elapsed = end−start; total break = sum of closed intervals; net = elapsed − total break; open session = provisional (now−start), never persisted; midnight split = timezone-aware per local date; interrupted = flagged + estimated, never fabricated.

## Spreadsheet export (MANDATORY standard) — HR/payroll export

- `src/lib/csv-utils.ts` exports (confirmed): `downloadXLSX(filename, headers, rows, sheetName?)` (line 242), `downloadXLSXWorkbook(filename, sheets[])` (272), `readSpreadsheetFileToCSV(file)` (304), `SPREADSHEET_ACCEPT` (228), `toCSV(headers, rows)` (197), `downloadCSV(filename, csv)` (204). SheetJS loaded on demand inside the helpers.
- Build the HR/payroll rows ONCE (one shared row-builder), then wire BOTH `downloadXLSX(...)` (Excel, primary) and `downloadCSV(name, toCSV(headers, rows))` (CSV, alt). Render as the canonical two-item `Dropdown` (`@/components/ui/dropdown`): `Excel (.xlsx)` (icon `FileSpreadsheet`) then `CSV (.csv)` (icon `FileText`). NEVER a raw `new Blob([...], {type:"text/csv"})`, NEVER CSV-only. Precedents: Customers page export dropdown, `src/lib/customer-csv.ts`.
- Export columns (one row per agent, period default monthly): name, user/staff id, store, workdays with sessions, total elapsed, total break, net productive hours (HR-friendly `"Hh Mm"` and/or decimal-hours numeric), completed session count, interrupted session count. All from canonical persisted records; honor agent/date/store filters; gate on the owner/team productivity capability + RLS. Export is NOT official leave/payroll data (note in steering).

## Shared UI primitives (reuse — see design-system + view-detail-pages steering)

- Detail/view pages: `src/components/common/detail-page.tsx` → `DetailHero`, `DetailSection` (props `icon,title,action?,id?,accent?,delay?`), `DetailField` (default box / `flat` variant), `SummaryCard`, `SectionEditButton`, `ACCENT`/`Accent`. Pinned rail: `src/components/common/pinned-rail.tsx` → `PinnedRail`.
- Tables: `src/components/ui/rox-table.tsx` (`RoxTableCard/Head/HeadRow/Row/Cell/Footer`, `useRoxStickyHeader`) + detached `src/components/ui/pagination.tsx` `<Pagination>`. Multi-store Store column: `src/components/common/store-context-cell.tsx` `StoreContextCell`.
- Range/tab strips: `src/components/ui/tabs.tsx` → `SegmentedTabs({ options, value, onChange, size })` (NEVER detached pills).
- Owner filters: `src/components/common/table-utility-bar.tsx` → `TableUtilityBar` (left slot + Store→Search), `TableSearch`; `src/components/common/store-multi-select.tsx` → `StoreMultiSelect`, `matchesStoreSelection(branchId, selected[])`. Filter panels: `src/components/ui/rox-filter.tsx` (`RoxFilterPanelHeader` close ×, `ActiveFilterChip`/`ActiveFiltersBar`).
- Motion: `src/components/common/reveal.tsx` → `Reveal` (honors `useReducedMotion()` from framer-motion). Date/time: shared `DateTimeField`/`DateTimeDialog` in `src/components/ui/date-time-picker.tsx`; time-only `TimePicker` in `src/components/ui/time-picker.tsx`.

## Nav

- Nav config: `src/lib/mock-data.ts` (`navGroups` keyed by `WorkspaceId` = `"leads" | "shop" | "operations"`, and `expandableNavGroups`). Workspace resolution for a path is in `app-shell.tsx` `workspaceForPath`. To add a "My Productivity" / owner report nav item, add it to the appropriate `navGroups`/`expandableNavGroups` entry and gate visibility by capability. The current-user Work Status + "Productivity" link can also live purely in the Online Users dropdown + profile menu without a nav item.
