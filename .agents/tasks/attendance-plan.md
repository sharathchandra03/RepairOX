# Implementation Plan — Sales Agent Attendance, Break Management & Productivity

Build the Work Session & Productivity feature from the fixed design
(`attendance-design.md`), covering every requirement including the HR/payroll
Excel+CSV export (requirements §K / AC 16–17). Work directly in the repo (NO
worktree). All `npm`/`npx` commands run from `/Users/apple/Desktop/Reapirox dummy2/app`.

## Authoritative references
- Build spec: `.agents/tasks/attendance-design.md`
- Requirements: `.agents/tasks/attendance-requirements.md`
- Codebase facts (exact paths/types/helpers): `.agents/tasks/attendance-codebase-notes.md`

## Verification commands (used throughout)
- Type check: `npx tsc --noEmit`
- Build: `npm run build`
- Time-engine unit tests: `npm run attendance:test` (added in item 2; `tsx --test`)

## Sequencing principle
The pure, dependency-free layers come first (permissions catalog, time engine)
so `tsc`/tests run early and often. The migration lands before the context/API
that depend on its tables/RLS. UI pages come after the context exposes data.
Export reuses the owner report's shared row-builder. Steering + final gate last.

## Regression surface that MUST keep working (verify after UI/logout/nav items)
- Online Users: online count, online/offline state, dropdown roster, avatars, roles (`sales-agents-online.tsx`, `use-sales-presence.ts` — unchanged behavior).
- Auth / logout / redirect to `/login` (only `handleLogout` becomes async; auth flow itself untouched).
- Sidebar navigation + existing permission gating (adding one nav item + one href to the whitelist must not hide or reorder existing items).
- Existing permission matrix UI (adding a new module + keys must not break `levelToKeys`/`supportedLevels`/coverage grep).

---

- [ ] 1. Register the 4 new capability keys across the permission catalog + matrix + CAP (layers 1–3; UI-independent, type-checkable immediately).
      Per design §2.1–§2.4. Add `work_sessions_view_own`, `work_sessions_view_team`, `work_sessions_view_all`, `work_sessions_correct`.
      - `src/lib/permissions.ts`: add the 4 keys to the `PermissionKey` union (new section comment `/* Work Session & Productivity (Attendance) */`) AND a new `PERMISSION_GROUPS` group `{ id: "work_sessions", label: "Attendance & Productivity", description: "...", permissions: [ {key,label} ×4 ] }` with the labels in §2.1. `ALL_PERMISSIONS`/`PERMISSION_LABEL` derive automatically.
      - `src/lib/permission-levels.ts`: add a NEW `work_session` module to `PERMISSION_MODULES` (`id:"work_session"`, label "Attendance & Productivity", icon "Clock") with tiers `view:["work_sessions_view_own"]`, `manage:["work_sessions_view_team","work_sessions_view_all"]`, `full:["work_sessions_correct"]` — OMIT the `work` tier entirely (precedent: `sales_agent`/`account` modules declare a subset). Add a `work_session` entry to EVERY `ROLE_PRESETS` entry's `levels` map: `preset_owner`→`"full"`, `preset_store_manager`→`"manage"`, `preset_sales`/`preset_reception`/`preset_technician`/`preset_senior_tech`/`preset_readonly` and all others→`"view"`.
      - `src/lib/capabilities.ts`: add the `CAP.workSession` block exactly as §2.4 (granular key(s) first, coarse `manage_attendance`/`view_sales_reports`/`manage_reports` fallbacks after): `viewOwn`, `viewTeam`, `viewAll`, `correct`. These fallback arrays MUST match the RLS `auth_has_any` arrays added in item 3 (lockstep).
      Files: `src/lib/permissions.ts`, `src/lib/permission-levels.ts`, `src/lib/capabilities.ts`
      Verify: `npx tsc --noEmit` passes. Run the permission-matrix coverage grep from the steering (`grep -oE '\{\s*key:\s*"[a-z0-9_]+"' src/lib/permissions.ts`) and confirm each of the 4 group-def keys also appears in a `PERMISSION_MODULES` level in `permission-levels.ts`; confirm no union key lacks a group def.

- [ ] 2. Create the pure, tested time-calculation engine `src/lib/work-session.ts` + co-located `src/lib/work-session.test.ts`, and add the `attendance:test` npm script.
      Per design §3 (no DB, no React imports). Export the types (`BreakInterval`, `WorkSessionRecord`, `SessionDurations`) and the module constant `STALE_MS` (default 30 min, chosen > presence `IDLE_MS` 5 min). Implement the pure functions: `elapsedMs(session, nowMs, staleMs)` with the conditional cutoff `end = endedAt ?? (isInterrupted ? lastSeenAt : now)`; `breakMs` (sum of CLOSED breaks only; open break contributes 0); optional `provisionalBreakMs`; `netMs = max(0, elapsed − break)`; confidence (`confirmed`/`provisional`/`estimated`); `aggregateDay(sessions, dateISO, tz)`; `splitAcrossLocalDates(session, tz)` (local-midnight boundaries via `Intl.DateTimeFormat` with `timeZone: tz`, never fabricating events); `summarize`, `weeklyBuckets`, `monthlyBuckets`, `calendarCells(..., tz)` returning the `tone` enum (`green|amber|gray|blue`) + numbers.
      Write `work-session.test.ts` covering §3.5 tests 1–10, including the exact 09:00/breaks/18:00 → elapsed 9h / break 45m / net 8h15m assert, the interrupted-cutoff tests (7a/7b assert `elapsedMs === lastSeenAt − startedAt` with `nowMs` set far past `lastSeenAt`), the healthy-open test (8, elapsed === now − start), midnight split (6), tz sensitivity (9), and the interrupted+midnight test (10, `sum(splitParts) === lastSeenAt − startedAt`, no part references `now`).
      Add to `package.json` scripts: `"attendance:test": "tsx --test src/lib/work-session.test.ts"` (mirrors `leads:intelligence:test`).
      Files: `src/lib/work-session.ts`, `src/lib/work-session.test.ts`, `package.json`
      Verify: `npm run attendance:test` — all 10 tests pass. `npx tsc --noEmit` passes.

- [ ] 3. Create migration `supabase/migrations/0075_work_sessions.sql` (3 tables, indexes, guards, event triggers, RLS, default grant).
      Per design §1 (additive + idempotent; `create table if not exists`, `drop policy if exists`→`create policy`, `create or replace function … security definer set search_path = public`, `drop trigger if exists`→`create trigger`). Reuse ONLY the shared helpers (`auth_member_of_org`, `auth_branch_visible`, `auth_has_any`, `auth_staff_id`, `auth_org_id`, `auth_branch_id`, `is_admin`).
      - Tables: `work_sessions` (§1.1 columns incl. `branch_id default public.auth_branch_id()` nullable, `staff_id` identity, `status` CHECK `open|completed|interrupted`, `end_reason`, `last_seen_at`, `source`); `work_session_breaks` (incl. DENORMALIZED `branch_id`); `work_session_events` audit (FKs: `session_id on delete set null`, `staff_id on delete restrict`, `actor_staff_id on delete set null`; `kind` CHECK; `reason`, `previous jsonb`, `details jsonb`).
      - Partial unique indexes (§1.2): `work_sessions_one_open_per_staff (staff_id) where ended_at is null`; `work_session_breaks_one_open_per_session (session_id) where ended_at is null`. Plus the supporting non-unique reporting indexes listed in §1.2.
      - Guard triggers (§1.3): `work_session_guard()` BEFORE INSERT/UPDATE on `work_sessions` and `work_break_guard()` BEFORE INSERT/UPDATE on `work_session_breaks`, both bypassing end-user checks via `if auth.uid() is null then return new; end if;`. Enforce: force `staff_id = auth_staff_id()` + stamp org/branch from the caller's staff row on insert; break insert requires the parent session to be the caller's and OPEN (`work_break_no_open_session` errcode 23514) and stamps `staff_id/org/branch` from the parent session; closing legality (`ended_at >= started_at`); completed-session immutability for non-correctors (`work_session_locked` errcode 42501); `work_break_not_active` on re-closing a closed break; `started_at` immutable except by corrector.
      - Event triggers (§1.4): AFTER INSERT/UPDATE write `work_session_events` rows (`session_start`, `break_start`, `break_end`, `session_end`/`auto_close`) in the same transaction.
      - RLS (§1.5): enable on all 3 tables; create `auth_work_sessions_see(p_staff_id, p_org_id, p_branch_id)` SECURITY DEFINER using own-record OR owner-key branch (`auth_branch_visible(branch_id) AND auth_has_any(['work_sessions_view_all','work_sessions_view_team','manage_attendance','view_sales_reports','manage_reports'])`). SELECT policies for all 3 tables reuse it with the row's own columns. Write policies per §1.5: self-write insert/update + store-scoped corrector branch (`auth_has_any(['work_sessions_correct'])`); `work_session_events` insert-only (append-only, NO update/delete policy). The owner-key array here MUST match `CAP.workSession.viewTeam/viewAll` from item 1 (lockstep).
      - Default grant (§1.6): seed `work_sessions_view_own` onto the `sales_agent` role (guarded `where exists (... roles where id='sales_agent')`, `on conflict do nothing`). Do NOT seed the owner/team/correct keys.
      Files: `supabase/migrations/0075_work_sessions.sql`
      Verify: `npx tsc --noEmit` still passes (SQL only; no TS change). Visually confirm the migration parses as valid Postgres and every policy references only the shared helpers + columns that exist on the row. (DB apply is an environment concern; no migration runner is invoked here.)

- [ ] 4. Add the self-scoped work-session API routes under `src/app/api/work-session/` (Supabase mode).
      Per design §4.2. All use `requireUser(req)` from `src/lib/account-security.ts` (self-scoped, no permission key), resolve the caller's `staff` row, and server-stamp all timestamps with `now()`. Mirror the structure of `src/app/api/account/sessions/route.ts`.
      - `start/route.ts` (POST): idempotent auto-start — SELECT the open session; if found resume; else INSERT; on `23505` re-SELECT and resume.
      - `break/start/route.ts` (POST): insert a break for the caller's open session; map `23505`/`23514` to friendly errors.
      - `break/end/route.ts` (POST): `update … set ended_at=now() where session_id=<open session> and ended_at is null`.
      - `end/route.ts` (POST): close any active break at `now()`, then set session `ended_at=now(), status='completed', end_reason='logout'`; return the completed session.
      - `route.ts` (GET): the caller's current open session (if any) + today's sessions.
      - `touch/route.ts` (POST): exactly `update public.work_sessions set last_seen_at = now() where staff_id = <caller staff id> and ended_at is null;` — returns `200` with `{ session: <open>|null }`; guaranteed no-op on completed/absent session (never trips the locked guard).
      Files: `src/app/api/work-session/start/route.ts`, `src/app/api/work-session/break/start/route.ts`, `src/app/api/work-session/break/end/route.ts`, `src/app/api/work-session/end/route.ts`, `src/app/api/work-session/route.ts`, `src/app/api/work-session/touch/route.ts`
      Verify: `npx tsc --noEmit` passes; `npm run build` compiles all new route handlers without error.

- [ ] 5. Add the owner report + correction API routes.
      Per design §4.2 (owner report Decision) + §4.6/§10. Use the service-role admin client via `requirePermission`.
      - `report/route.ts` (POST, or GET with query params): `requirePermission(req, ["work_sessions_view_team","work_sessions_view_all","manage_attendance","view_sales_reports","manage_reports"])`. Returns RAW, scope-constrained session + break rows (NO server-side duration/interrupted math). Resolve caller scope server-side with the admin client (caller `staff` row → `callerStaffId/callerOrgId/callerBranchId`; `callerCanCrossBranch = permissions.has('multi_store_access')`; `callerHasOwnerKey` from the same owner-key array). Apply the EXACT hand-written predicate from §4.2 (`organization_id = callerOrgId AND ( staff_id = callerStaffId OR ( callerHasOwnerKey AND ( callerCanCrossBranch OR branch_id = callerBranchId OR branch_id IS NULL ) ) )`) — the term-for-term mirror of `auth_work_sessions_see`. On top, intersect the requested agent set with `lead_sales_agents(branchId)`, apply date-range on `started_at` + the store filter; fetch breaks by `session_id IN (…)`. Add a comment marking this predicate as kept in LOCKSTEP with `auth_work_sessions_see`.
      - `correct/route.ts` (POST): `requirePermission(req, CAP.workSession.correct keys = ["work_sessions_correct","manage_attendance"])`. Append-only correction: capture the current session+breaks into a `work_session_events.previous` snapshot, apply new values, log a `correction` event with mandatory `reason` (reject if missing) + `actor_staff_id`. Never destroy original values.
      Files: `src/app/api/work-session/report/route.ts`, `src/app/api/work-session/correct/route.ts`
      Verify: `npx tsc --noEmit` passes; `npm run build` compiles both routes.

- [ ] 6. Create the dual-mode `WorkSessionProvider` + `useWorkSession()` and mount it in `providers.tsx`.
      Per design §4.1. New `src/lib/work-session-context.tsx` modeled on `leads-context.tsx`/`use-session-tracker.ts`. Read identity from `useSession()` and `usePermissions()` (`currentUser`, `authReady`, `apiFetch`), timezone from `useStoreSettings().timeZone`. Expose the `UseWorkSession` surface from §4.1 (`hydrated`, `status`, `openSession`, `todaySessions`, `startWork` [idempotent], `startBreak`, `endBreak`, `endWork(reason?)`, `rangeSessions(fromISO,toISO)`), all `() => Promise<void>`.
      - Supabase mode: writes via the §4 API routes using `apiFetch`; read current open session + today via `GET /api/work-session`.
      - Local mode: localStorage key `repairox-work-session::<staffId>` (array of `WorkSessionRecord`), replicating the guard logic (one open session, one open break); every op mutates synchronously and returns an already-resolved promise; stamp all timestamps from the client clock (the documented NFR §46 exception, local mode only).
      - Friendly error mapping (§4.6) via `@/components/ui/toaster`: `23505` on start → silent resume; `work_break_no_open_session`→"Start work before taking a break"; break `23505`→"You're already on a break"; `work_break_not_active`→"No active break to end"; `work_session_locked`→"This session is completed and can't be changed."
      - Realtime (§8): in Supabase mode subscribe to `postgres_changes` on `work_sessions`/`work_session_breaks` with `filter: staff_id=eq.<staffId>` (dedicated channel, NOT the presence channel). On an event, refetch/patch the open session. REQUIRED heartbeat suppression: compare `old`→`new`; when the ONLY changed columns are `last_seen_at`/`updated_at`, patch `last_seen_at` locally and do NOT refetch. In local mode use the `storage` event + a short poll.
      - Mount `<WorkSessionProvider>` in `src/components/providers.tsx` inside `StoreSettingsProvider`, near `LeadsProvider` (order per §4.1: `… StoreSettingsProvider → WorkSessionProvider → CatalogProvider → …`).
      Files: `src/lib/work-session-context.tsx`, `src/components/providers.tsx`
      Verify: `npx tsc --noEmit` passes; `npm run build` compiles. App boots in local mode without the new provider throwing (manual: load any page, no console error from the provider).

- [ ] 7. Add the app-wide idempotent auto-start + heartbeat hook and mount it in `app-shell.tsx`.
      Per design §4.3 + §5. In `work-session-context.tsx` (or a sibling), add `useWorkSessionAutoStart()` guarded by `authReady && currentUser`: a `useRef` single-flight guard; on mount/reconnect call `startWork()` (idempotent via open-session SELECT → guarded create → unique-index resume); subscribe to the same activity signal the presence tracker uses and call the debounced `touch` once per `HEARTBEAT_MS` (~60s) (local mode: write `lastSeenAt` on the same cadence, no network). It must NOT create a session per render. Mount the hook ONCE in `src/components/layout/app-shell.tsx` beside `useSessionTracker()` / `useSalesPresenceTracker(...)`.
      Files: `src/lib/work-session-context.tsx` (add hook), `src/components/layout/app-shell.tsx`
      Verify: `npx tsc --noEmit` passes; `npm run build` compiles. Manual: Online Users count/roster still render identically (presence regression check).

- [ ] 8. Wire logout to close the work session BEFORE auth logout in `topbar.tsx`.
      Per design §4.4. Make `handleLogout` `async`; call `useWorkSession().endWork` inside `await Promise.race([endWork("logout"), new Promise(r => setTimeout(r, 2500))])` wrapped in `try/catch`; ALWAYS run `logout(); router.push("/login")` afterward. Keep the JSX caller fire-and-forget: `onClick={() => { handleLogout(); close(); }}`. This is the ONLY change to the logout path; auth/login/secure-logout are untouched.
      Files: `src/components/layout/topbar.tsx`
      Verify: `npx tsc --noEmit` passes; `npm run build` compiles. Manual: logout still redirects to `/login` even when the session-close is slow/failing (the timeout/catch never traps the user).

- [ ] 9. Extend the Online Users dropdown + profile menu with Work Status + context actions.
      Per design §4.5. In `src/components/leads/sales-agents-online.tsx`: for the current user's row show a Work Status chip (Working / On Break / Logged Out / Needs Review — visually distinct from the green online dot) and state-appropriate actions reading `useWorkSession()`: Working → `Start Break` + `Productivity`; On Break → `End Break / Resume Work` + `Productivity`; logged-out-of-session → `Start Work`. The online count + roster + avatars + roles stay UNCHANGED. In `src/components/layout/topbar.tsx` profile menu: add a `MenuLabel` with current Work Status + the same context actions + a `Productivity` `MenuItem` linking to `/account/productivity`, above the existing Log out item (keep My Account + Log out).
      Files: `src/components/leads/sales-agents-online.tsx`, `src/components/layout/topbar.tsx`
      Verify: `npx tsc --noEmit` passes; `npm run build` compiles. Manual regression: Online pill count, online/offline, dropdown roster, avatars, roles all behave exactly as before; the Work Status chip is separate from the online dot.

- [ ] 10. Build the self-service "My Productivity" page at `src/app/(app)/account/productivity/page.tsx`.
      Per design §6. Gated by `CAP.workSession.viewOwn` (data always self-scoped via RLS + the self API). Build with the shared `detail-page` primitives: `DetailHero` header ("My Productivity" + subtitle + current Work Status chip + open-session live indicator); a single connected `SegmentedTabs` range control (Daily/Weekly/Monthly + Custom opening the shared `DateTimeField`/date picker — never detached pills); TODAY KPI cards via `SummaryCard` (Total Session, Total Break, Net Working, Session count, and a display-only live timer `now − start` labeled "in progress" when open — presentation only, never persisted); a `DetailSection` (accent `violet`) calendar grid using the engine `tone` + a number/label per cell with a legend that the colors are neutral activity indicators; a daily timeline `DetailSection` (sessions + break intervals in order, per-session elapsed/break/net + confirmed-vs-estimated badge); weekly/monthly summary `DetailSection`s from the engine bucket builders. All values from `useWorkSession().rangeSessions(...)` fed through the pure engine with `StoreSettings.timeZone`; wrap sections in `Reveal`.
      Files: `src/app/(app)/account/productivity/page.tsx`
      Verify: `npx tsc --noEmit` passes; `npm run build` compiles the route. Manual: page renders self-scoped data in local mode; the live timer ticks in-component only and no report number is derived from it.

- [ ] 11. Build the owner "Sales Agent Productivity" report at `src/app/(app)/leads/productivity/page.tsx` and wire its nav item.
      Per design §7. Gated by `CAP.workSession.viewTeam`/`viewAll`; analysis-only (the selected agent is an analytical subject; the caller's identity/session/scope never change). Structure: filters via `TableUtilityBar` — left slot = agent selector (All + specific, sourced from `lead_sales_agents(branchId)` via the existing directory, never a hardcoded/role/all-staff list); right slot = `StoreMultiSelect` (permission-aware; static chip for single-store) + a shared date-range picker; filters combine (AND). Owner summary `SummaryCard`s explicitly labeled sum/avg/count (total net hours = sum, avg net per workday = avg, sessions = count, interrupted = count). Daily comparison table on the shared `rox-table` primitives (frozen `bg-[#D6DDFB]` brand header via `useRoxStickyHeader`, `h-[68px]`/`py-4` rows, `border-t border-zinc-500`, detached `<Pagination>`, `StoreContextCell` when multi-store) with a `View Details` action that expands/navigates within the owner's own session (no identity change). Data from `POST /api/work-session/report` (raw rows); capture ONE `nowMs` per render + the shared `STALE_MS`, feed every row through the single pure engine for cards + table + export. Owner refresh = refetch-on-filter-change + an optional manual Refresh (no realtime broadcast dependency).
      Nav wiring in `src/lib/mock-data.ts` — BOTH edits (per §7): (1) add to the flat `navItems` array `{ href: "/leads/productivity", label: "Agent Productivity", icon: "Clock", permission: ["work_sessions_view_team","work_sessions_view_all","manage_attendance","view_sales_reports","manage_reports"] }`; (2) add `/leads/productivity` to the PERFORMANCE group's `items` whitelist in `navGroups.leads` (currently `["/leads/performance","/leads/intelligence","/leads/intelligence/agents"]`).
      Files: `src/app/(app)/leads/productivity/page.tsx`, `src/lib/mock-data.ts`
      Verify: `npx tsc --noEmit` passes; `npm run build` compiles the route. Manual: the nav item appears only for a role holding an owner/team key (hidden for a plain Sales Agent); existing PERFORMANCE items (Agent Performance, Intelligence) still render and are not reordered.

- [ ] 12. Implement the HR/payroll export (Excel primary + CSV) on the owner report, from one shared row-builder.
      Per design §9 + requirements §K / AC 16–17. In the report module (shared with item 11) add `buildAttendanceExportRows(agents, sessionsByAgent, range, tz, nowMs, staleMs)` → `{ headers, rows }` consuming the SAME pure-engine `summarize(...)` over the SAME raw rows with the SAME `nowMs`/`staleMs` the on-screen report used (export == on-screen by construction). One row per Sales Agent for the selected period (default monthly): name, user/staff id, store, workdays with sessions, total session (elapsed), total break, net productive hours (BOTH an `"Hh Mm"` display column AND a decimal-hours numeric column), completed session count, interrupted session count — all from canonical records via the engine, never the live timer.
      Render the canonical two-item `Dropdown` (`@/components/ui/dropdown`): `Excel (.xlsx)` (icon `FileSpreadsheet`) then `CSV (.csv)` (icon `FileText`). Excel handler: `async onExcel()` that `await`s `downloadXLSX("agent-productivity-<period>.xlsx", headers, rows, "Productivity")` in a `try/catch` toasting on SheetJS load failure. CSV handler: `downloadCSV("agent-productivity-<period>.csv", toCSV(headers, rows))`. Honor the current agent/date/store filters; gated by `CAP.workSession.viewAll` + RLS. NEVER a raw `new Blob`, NEVER CSV-only.
      Files: `src/app/(app)/leads/productivity/page.tsx` (+ a report helper module if extracted, e.g. `src/lib/work-session-report.ts`)
      Verify: `npx tsc --noEmit` passes; `npm run build` compiles. Manual: both menu items download a file; the exported totals/counts for a given filter match the on-screen summary cards exactly (same engine pass).

- [ ] 13. Add the permanent steering file `/.kiro/steering/work-session-productivity.md` (repo root, NOT under `app/`).
      Per design §11. Use the existing steering front-matter format (match a sibling file in `/Users/apple/Desktop/Reapirox dummy2/.kiro/steering/`). Codify all invariants: three concepts stay separate (Online ≠ Working); records keyed by `staff.id` + org + branch (HRM-ready, employee-keyed); server-authoritative timestamps + durations from the pure engine, live timer display-only; one open session per user / one open break per session (partial unique indexes + guards); auto-start idempotent, logout closes session (and open break) before auth logout; interrupted = flagged + estimated (presence-heartbeat + staleness threshold), never fabricated; the 4 permission keys registered end-to-end + OFF by default except owner roles (Sales Agents get View-Own); the TWO lockstep invariants ((a) CAP ↔ RLS owner-key arrays; (b) owner-report route scope predicate ↔ `auth_work_sessions_see`); corrections append-only + audited + gated by `work_sessions_correct`; owner report analysis-only (no impersonation), agent selector from the eligibility RPC, store scope independently enforced; export follows the spreadsheet standard (Excel primary + CSV, one row-builder, two-item Dropdown) and is attendance/productivity data only — NOT official leave/payroll data; the engine is reusable by a future HRM; daily/weekly/monthly/calendar/detail/export all use the same canonical records; out-of-scope list (leave/holiday/shift/overtime/payroll computation, auth replacement, second presence/employee/permission system, geofencing/biometric). Point reference implementations at the engine, context, migration 0075, the two pages, and the export row-builder.
      Files: `/Users/apple/Desktop/Reapirox dummy2/.kiro/steering/work-session-productivity.md`
      Verify: file exists with valid steering front-matter matching a sibling; `npx tsc --noEmit` unaffected.

- [ ] 14. Final full-feature gate.
      Run the whole verification suite and confirm no regressions in the surfaces listed above.
      Files: (none — verification only)
      Verify: from `/Users/apple/Desktop/Reapirox dummy2/app` run `npm run attendance:test` (all engine tests pass), `npx tsc --noEmit` (clean), and `npm run build` (succeeds). Manually confirm the regression surface: Online Users count/roster/avatars/roles unchanged; logout redirects to `/login`; navigation + existing permission gating intact; the permission matrix UI renders the new Attendance & Productivity module.

---

## Notes / assumptions carried from the design
- `staff.id` is the stable identity (`useSession().id` = presence `PresenceMeta.id` = `SalesAgent.id`). Scope by id + org + branch, never name/role.
- Org timezone = `StoreSettings.timeZone` (default `Asia/Kolkata`); the engine takes the IANA string as a parameter so it stays pure/testable.
- `STALE_MS` is a tunable code constant (default 30 min > presence `IDLE_MS` 5 min) — no settings UI this phase.
- No process writes `status='interrupted'`/`end_reason='auto_close'` in this phase; those enum values are reserved for a future service-role cleanup job gated by `work_sessions_correct`. Interrupted-ness is read-time derived only.
- The owner report/export route uses the service-role admin client and reproduces `auth_work_sessions_see` by hand (no RLS-active user-token client exists in the repo); the predicate MUST stay in lockstep with the RLS helper.
- DB migration application is an environment concern; this plan verifies TS/build/engine-tests, not a live migration run.
