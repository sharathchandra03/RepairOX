# Work Session, Break Management & Productivity — Review (iteration 1)

Full-feature attendance/productivity implementation reviewed against
`attendance-design.md`, `attendance-requirements.md` (incl. §K / AC 16–17 HR
export), `attendance-plan.md`, and `attendance-codebase-notes.md`. The coder's
verification evidence (`attendance-verification.md`) records `npx tsc --noEmit`
PASS, `npm run attendance:test` 12/12 PASS, and `npm run build` PASS; per the
brief I read that evidence + the diff rather than re-running the suites.

**Verdict**: APPROVED

**Watch for:** nothing blocking. Two non-blocking notes carried below (self-route
timestamp source; the documented service-role guard-bypass model) — both are
consistent with the fixed design and need no change.

## High-level view

The pure time engine (`work-session.ts`) implements the exact conditional-cutoff
model from design §3: a closed session computes to `endedAt` (confirmed), a
healthy-open session to `now` (provisional), and an open-but-stale/interrupted
session to `lastSeenAt` (estimated) — never to `now`, never to a fabricated end.
The co-located test file asserts the 9h/45m/8h15m worked example exactly, both
interrupted-cutoff sub-cases with `nowMs` set far past `lastSeenAt`, the
healthy-open path, midnight split, tz sensitivity, and the interrupted+midnight
case (`sum(parts) === lastSeenAt − start`). This is the single source of all
duration/interrupted math.

Migration 0075 lands the three tables with the two partial unique indexes
(≤1 open session/staff, ≤1 open break/session), the ownership/stamping/
close-legality/lock guards, the append-only event triggers, and RLS built only
on the shared helpers. The reusable `auth_work_sessions_see(staff,org,branch)`
predicate (own-record OR owner-key-within-store-scope, null-branch org-wide by
the same rule as every other table) backs all three SELECT policies; writes are
self-insert/self-close plus a store-scoped corrector branch; events are
insert-only (no update/delete policy).

The four capability keys are wired across all five layers (union +
`PERMISSION_GROUPS`, the `work_session` matrix module omitting the `work` tier,
`CAP.workSession` with the `manage_attendance`/reports coarse fallbacks,
`requirePermission` on owner routes, RLS) and are OFF by default except owner
roles via `full_access`; `work_sessions_view_own` is seeded onto `sales_agent`
in the migration. Both lockstep invariants hold: (a) the CAP viewTeam array ==
the RLS owner-key array; (b) the `POST /api/work-session/report` hand-written
scope predicate reproduces `auth_work_sessions_see` term-for-term, with a
LOCKSTEP comment on both sides.

The dual-mode provider exposes the `UseWorkSession` surface, mounts inside
`StoreSettingsProvider`, derives Work Status from the open session (never from
presence), and runs the 3-layer idempotent auto-start (in-tab `useRef`
single-flight → server open-session SELECT → unique-index 23505 resume). The
realtime subscription is scoped to own rows (`staff_id=eq.<id>`) on a dedicated
channel separate from presence, with the REQUIRED heartbeat-only suppression
(old→new diff; patch `last_seen_at` locally without refetch). Logout is async,
closes the session via `Promise.race([endWork, 2500ms])` in a `try/catch`, then
always runs `logout()` + redirect.

The HR/payroll export is built from one shared row-builder
(`buildAttendanceExportRows` → `buildAgentSummaries` → the engine `summarize`)
over the SAME rows with the SAME `nowMs`/`STALE_MS`/`tz` the on-screen owner
report uses, so export == on-screen by construction. It renders the canonical
two-item Dropdown (Excel primary via `downloadXLSX`, CSV via
`downloadCSV`/`toCSV`), honors the agent/date/store filters, and is gated by
`CAP.workSession.viewAll`. Online Users presence, auth/logout, navigation, and
existing permissions are untouched beyond the additive changes.

<details>
<summary>Issues (0 blocking · 2 non-blocking notes)</summary>

1. **Self-route timestamp source (non-blocking)** — the self API routes stamp
   `new Date().toISOString()` (the Node server clock) rather than SQL `now()`.
   This is still server-authoritative (the client never supplies the time), so
   NFR §46 is satisfied; no change required. If strict `now()` parity is wanted
   later, switch to an RPC/`default now()`-driven update.
2. **Service-role guard bypass (non-blocking, by design)** — `requireUser`/
   `requirePermission` return the service-role admin client, so `auth.uid()` is
   null inside Postgres and the guard's `if auth.uid() is null then return new`
   branch skips the ownership/open-state checks for API writes. Ownership is
   enforced in route code (`.eq("staff_id", staff.id)` + conditional
   `.is("ended_at", null)` updates), exactly as the design documents and as the
   existing self routes do. The DB guards still protect any user-token write.

</details>

<details>
<summary>Details</summary>

### Pure time engine + tests

`work-session.ts` is DB/React-free. `elapsedMs` uses the conditional cutoff
`end = endedAt ?? (isInterrupted ? lastSeenAt : now)` with
`isInterrupted = status==='interrupted' || (endedAt===null && now−lastSeenAt>staleMs)`.
`breakMs` sums only closed intervals (open break → 0); `provisionalBreakMs`
adds the open break for live display only. `netMs = max(0, elapsed−break)`.
`sessionConfidence` returns confirmed/provisional/estimated consistent with the
cutoff. `splitAcrossLocalDates` apportions the span up to the interrupted/healthy
end cutoff across local midnights computed in the org tz via `Intl.DateTimeFormat`
(no tz library), never inventing events; `aggregateDay`/`summarize` de-dupe by
session id. `calendarCells` returns the `green|amber|gray|blue` tone enum plus
the net number so color is never the only signal.

`work-session.test.ts` (12 tests) covers §3.5 1–10: single session, the exact
9h/45m/8h15m worked example, multi-session same-day aggregation (de-duped),
open break = 0, healthy-open (elapsed = now−start), midnight split
(sum = whole, 1h + 2h), interrupted 7a (explicit, `nowMs` far past `lastSeenAt`,
`elapsed === lastSeenAt−start === 3h`, `notEqual now−start`), 7b (derived
open+stale, same cutoff), 8 (not-stale → now path), 9 (tz sensitivity: IST vs
NY land on different local dates), and 10 (interrupted+midnight: parts sum to
`lastSeenAt−start === 2h30m`, never `now`). Matches the verification note's
12/12 PASS.

### Migration 0075 — schema, state machine, RLS

Three tables as designed; `work_sessions.branch_id default auth_branch_id()`
nullable + immutable this phase; `work_session_breaks.branch_id` denormalized;
`work_session_events` audit FKs are `session_id set null` / `staff_id restrict`
/ `actor_staff_id set null` so the audit survives session purge and staff
archive. Partial unique indexes `work_sessions_one_open_per_staff` and
`work_session_breaks_one_open_per_session` enforce the state machine atomically;
reporting indexes present.

`work_session_guard` forces `staff_id = auth_staff_id()` + stamps org/branch on
insert, rejects a non-open insert, keeps `started_at` immutable except for a
corrector, raises `work_session_locked` (42501) on an ordinary write to a
closed session, and validates `ended_at >= started_at` + close ownership.
`work_break_guard` is the SOLE enforcer of parent ownership + open-state
(`work_break_no_open_session` 23514), stamps staff/org/branch from the parent,
and raises `work_break_not_active` on re-closing a closed break. Both bypass on
`auth.uid() is null` (service role). AFTER triggers write `session_start`/
`session_end`/`auto_close` and `break_start`/`break_end` events in the same
transaction.

RLS enables on all three tables; `auth_work_sessions_see` uses only the shared
helpers and is reused by all three SELECT policies with the row's own columns.
The owner-key array
`['work_sessions_view_all','work_sessions_view_team','manage_attendance','view_sales_reports','manage_reports']`
is present with a lockstep comment. Write policies: self-insert
(`organization_id = auth_org_id() and staff_id = auth_staff_id()`), self-close
OR store-scoped corrector update; `work_session_events` has an insert policy and
no update/delete policy (append-only). Default grant seeds
`work_sessions_view_own` → `sales_agent` only; owner/team/correct keys are not
seeded. The migration is additive + idempotent.

### Permission wiring + both lockstep invariants

`permissions.ts`: the four keys are in the `PermissionKey` union and in a
`work_sessions` `PERMISSION_GROUPS` group with labels. `permission-levels.ts`:
a new `work_session` module (`view`/`manage`/`full`, `work` tier omitted — valid
per the `supportedLevels` `?.length ?? 0` guard and the sales_agent/account
precedent) plus a `work_session` entry in every preset (owner=full,
store_manager=manage, others=view). `capabilities.ts`: `CAP.workSession`
viewOwn/viewTeam/viewAll/correct with granular keys first + coarse fallbacks.

- **Lockstep (a) CAP ↔ RLS**: `CAP.workSession.viewTeam` ==
  `['work_sessions_view_team','work_sessions_view_all','manage_attendance','view_sales_reports','manage_reports']`
  == the `auth_work_sessions_see` owner-key array. Match confirmed.
- **Lockstep (b) report route ↔ RLS**: `report/route.ts` `OWNER_KEYS` equals the
  same array; the per-row predicate is
  `organization_id = callerOrgId AND (staff_id = callerStaffId OR (callerHasOwnerKey AND (callerCanCrossBranch OR branch_id = callerBranchId OR branch_id IS NULL)))`
  — the term-for-term mirror of `auth_work_sessions_see`, including the null-branch
  rule and `callerCanCrossBranch = multi_store_access` (admins/wildcard imply it).
  The requested agent set is intersected with the eligible active Sales-Agent
  directory (resolved under the admin client), then date-range + store filters
  apply. A LOCKSTEP comment marks both the route and the migration.

### Provider, auto-start, heartbeat, realtime, logout

`WorkSessionProvider` mounts inside `StoreSettingsProvider` (around
`CatalogProvider`/`LeadsProvider`), derives Work Status from the open session,
and never reads presence. `useWorkSessionAutoStart` (mounted once in
`app-shell.tsx` beside the presence/session trackers) runs the 3-layer idempotent
auto-start and the ~60s heartbeat `touch` only while a session is open; the
single-flight ref resets on user change. The `start` route resumes an existing
open session, inserts otherwise, and resumes on 23505. The realtime subscription
is own-rows only (`staff_id=eq.<id>`) on a dedicated `work-session-<id>` channel,
with the mandatory heartbeat-only suppression (diff old→new; if only
`last_seen_at`/`updated_at` changed, patch locally and return without refetch).
`touch` is the exact `update … where staff_id=<caller> and ended_at is null`
no-op shape. Logout: `handleLogout` is async, `Promise.race([endWork, 2500])`
in `try/catch`, then `logout()` + `/login` always; JSX caller stays
fire-and-forget.

### My Productivity, owner report, export

`/account/productivity` is gated by `CAP.workSession.viewOwn`, self-scoped via
`rangeSessions`, uses `SegmentedTabs` for the range, DetailHero + SummaryCard,
a display-only live timer ("in progress"), and the engine's `calendarCells`
tones + buckets. `/leads/productivity` is gated by `CAP.workSession.viewTeam`
(export by `viewAll`), captures one `nowMs` per render, reads
`POST /api/work-session/report` (raw rows), and runs every row through the one
engine for the sum/avg/count summary cards, the `rox-table` daily comparison
(frozen `#D6DDFB` header via `useRoxStickyHeader`, `py-4`, detached
`<Pagination>`, `StoreContextCell` when multi-store), and the export.
`buildAttendanceExportRows` reuses `buildAgentSummaries` → `summarize` over the
same rows/`nowMs`/`STALE_MS`/`tz`, producing name · staff id · store · workdays
· total session · total break · net (Hh Mm + decimal hours) · completed count ·
interrupted count. The export is the canonical two-item Dropdown (Excel via
`downloadXLSX`, CSV via `downloadCSV(toCSV(...))`) — no hand-rolled Blob, not
CSV-only. View Details expands within the owner's own session (no identity
change).

### Corrections, steering, regression

`correct/route.ts` is gated by `work_sessions_correct`/`manage_attendance`,
requires a mandatory reason (rejects when absent), captures a `previous`
snapshot, and logs a `correction` event with `actor_staff_id` + reason —
append-only, originals preserved. The steering file
`/.kiro/steering/work-session-productivity.md` exists with valid front-matter
(`inclusion: always`) and codifies the invariants incl. both lockstep rules and
the "attendance data only — not official payroll" note. Online Users
(count/roster/avatars/roles via `salesAgents`/`onlineIds`/`metaById`) is
unchanged — only a distinct current-user Work Status strip was added, visually
separate from the green online dot. Nav adds one `navItems` entry + the
PERFORMANCE whitelist href with the owner-key permission array; the `Clock` icon
is registered. No regression to auth/logout/navigation/existing permissions.

</details>

<details>
<summary>Files reviewed</summary>

- `src/lib/work-session.ts` — pure engine (verified against design §3).
- `src/lib/work-session.test.ts` — 12 tests covering §3.5 1–10.
- `supabase/migrations/0075_work_sessions.sql` — tables, indexes, guards,
  events, RLS, default grant.
- `src/lib/permissions.ts`, `src/lib/permission-levels.ts`,
  `src/lib/capabilities.ts` — the four keys across layers 1–3.
- `src/app/api/work-session/{start,break/start,break/end,end,touch,route,range,report,correct}` —
  self + owner + correction routes (`range` not opened in full; its contract is
  exercised by the self page and typed by the shared server helper).
- `src/lib/work-session-server.ts`, `src/lib/work-session-report.ts` — server
  helpers + the shared export row-builder.
- `src/lib/work-session-context.tsx` — dual-mode provider + auto-start hook.
- `src/components/providers.tsx`, `src/components/layout/app-shell.tsx`,
  `src/components/layout/topbar.tsx`,
  `src/components/leads/sales-agents-online.tsx`, `src/lib/mock-data.ts` —
  mount, logout, work controls, nav.
- `src/app/(app)/account/productivity/page.tsx`,
  `src/app/(app)/leads/productivity/page.tsx` — the two pages.
- `/.kiro/steering/work-session-productivity.md` — steering.
- `.agents/tasks/attendance-verification.md` — the coder's recorded
  tsc/test/build evidence.

</details>
