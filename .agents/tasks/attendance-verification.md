# Attendance / Work Session & Productivity — Verification Note (iteration 1)

First iteration (no `attendance-review.json` existed). Implemented the full
feature from `attendance-plan.md` + `attendance-design.md`.

## Commands run (from `/Users/apple/Desktop/Reapirox dummy2/app`)

| Command | Result |
|---|---|
| `npx tsc --noEmit` | **PASS** — clean, 0 errors (run repeatedly after each step). |
| `npm run attendance:test` (`tsx --test src/lib/work-session.test.ts`) | **PASS** — 12 tests, 0 fail. Covers §3.5 tests 1–10 incl. the exact 9h/45m/8h15m worked example, the interrupted-cutoff (7a/7b assert `elapsedMs === lastSeenAt − start` with `nowMs` far past `lastSeenAt`), healthy-open (8, elapsed = now−start), midnight split (6), tz sensitivity (9), interrupted+midnight (10, `sum(parts) === lastSeenAt − start`, never `now`). |
| `npm run build` | **PASS** — `✓ Compiled successfully`. New routes compiled: `/account/productivity`, `/leads/productivity`, and `/api/work-session{,/start,/break/start,/break/end,/end,/touch,/range,/report,/correct}`. |

The only build warning (`Unsupported metadata themeColor …`) is a PRE-EXISTING
app-wide warning emitted for every route from the shared root layout metadata —
it is not introduced by these pages (which are client components with no
`metadata` export).

## What was built (per the design)

- **Migration `0075_work_sessions.sql`** — `work_sessions`, `work_session_breaks`
  (denormalized `branch_id`), `work_session_events` (audit; `session_id` on
  delete set null, `staff_id` restrict, `actor_staff_id` set null). Partial
  unique indexes (`one_open_per_staff`, `one_open_per_session`) + reporting
  indexes. `work_session_guard`/`work_break_guard` (ownership/stamping/close-
  legality/`work_session_locked`/`work_break_no_open_session`/`work_break_not_active`;
  service-role bypass via `auth.uid() is null`). AFTER event triggers. RLS via
  the shared helpers + the reusable `auth_work_sessions_see(staff,org,branch)`
  predicate (own-record OR owner-key branch, store-scoped corrector branch,
  append-only events). Default grant of `work_sessions_view_own` → `sales_agent`.
- **4 capability keys across all 5 layers** — union + `PERMISSION_GROUPS`
  (`permissions.ts`), `work_session` matrix module + preset entries
  (`permission-levels.ts`), `CAP.workSession` (`capabilities.ts`),
  `requirePermission` on owner routes, RLS. Sales Agents default View-Own; owner
  keys OFF for others. CAP ↔ RLS owner-key arrays kept identical (lockstep a).
- **Pure engine** `src/lib/work-session.ts` + tests. `STALE_MS = 30m`.
- **Dual-mode `WorkSessionProvider` + `useWorkSession()`** (`work-session-context.tsx`),
  mounted in `providers.tsx` inside `StoreSettingsProvider`. 3-layer idempotent
  auto-start + 60s heartbeat (`useWorkSessionAutoStart`) mounted once in
  `app-shell.tsx`. Dedicated own-rows realtime subscription with REQUIRED
  heartbeat-only suppression (patch `last_seen_at`, no refetch).
- **Self API routes** (`requireUser`, server `now()`): start/break-start/
  break-end/end/touch/range + GET. **Owner `report` route** (`requirePermission`,
  service-role admin client, hand-written scope predicate mirroring
  `auth_work_sessions_see` — lockstep b, marked in-code; agent set intersected
  with the eligible Sales-Agent directory; date/store filters). **`correct`
  route** (append-only, mandatory reason, `previous` snapshot, actor + ts).
- **Logout** (`topbar.tsx`): `handleLogout` is now `async`, closes the session
  via `Promise.race([endWork, 2500ms])` in `try/catch` BEFORE `logout()`; the
  JSX caller stays fire-and-forget (`close()` runs immediately).
- **Work controls** in the Online Users dropdown + profile menu (Working → Start
  Break; On Break → Resume Work; else Start Work; + Productivity link). The
  online count/roster/avatars/roles are UNCHANGED — only a separate current-user
  Work Status strip was added.
- **My Productivity** page (`/account/productivity`) — hero + Daily/Weekly/
  Monthly/Custom SegmentedTabs + date nav, TODAY KPI cards, display-only live
  timer, calendar (green/amber/gray/blue neutral indicators + numbers + legend),
  daily timeline, weekly/monthly summaries. All from the engine.
- **Owner Sales Agent Productivity** report (`/leads/productivity`, nav wired via
  BOTH the flat `navItems` + the PERFORMANCE group whitelist; icon `Clock` added
  to the sidebar ICONS map) — agent selector (eligible directory), store filter,
  date range, labeled sum/avg/count summary, daily comparison table (shared
  rox-table + detached Pagination + StoreContextCell when multi-store), View
  Details (no identity change).
- **HR/payroll export** — one shared row-builder (`work-session-report.ts`,
  `buildAttendanceExportRows`) consuming the SAME engine `summarize` over the
  SAME rows with the SAME `nowMs`/`STALE_MS` → export == on-screen. Excel (.xlsx)
  primary + CSV via the shared `csv-utils` helpers in the canonical two-item
  Dropdown. Columns: name, staff id, store, workdays, total session, total
  break, net productive (Hh Mm + decimal hours), completed count, interrupted
  count. Gated by `CAP.workSession.viewAll`.
- **Steering** at `/.kiro/steering/work-session-productivity.md` (repo root)
  with the full invariant set incl. both lockstep invariants and the
  "attendance data only — not official payroll" note.

## Regression

- Online Users (count/roster/avatars/roles) + `use-sales-presence` untouched —
  only a distinct current-user Work Status strip added to the dropdown.
- Auth/logout: only `handleLogout` became async; it always runs `logout()` +
  redirect to `/login` (bounded + caught). Login/secure-logout untouched.
- Nav: one item + one href added; existing PERFORMANCE items keep their order.
- Permission matrix: new `work_session` module + 4 keys reconcile across union /
  group-def / matrix; no empty-tier breakage (the `work` tier is omitted,
  matching the `sales_agent`/`account` precedent).

## Note on migration application
DB migration application is an environment concern; this iteration verifies
TS/build/engine-tests, not a live migration run. The SQL uses only the shared
helpers (`auth_member_of_org`, `auth_branch_visible`, `auth_has_any`,
`auth_staff_id`, `auth_org_id`, `auth_branch_id`) and columns that exist on each
row; it is additive + idempotent.
