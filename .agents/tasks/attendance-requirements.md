# RepairOX — Sales Agent Attendance, Break Management & Productivity — Requirements

## Summary

Add a first-class **Work Session & Productivity** feature to RepairOX for Sales Agents (built on a reusable, employee-keyed engine so it can later extend to any staff member). On successful authentication the signed-in user's **work session** starts automatically (idempotently); the user can start/end breaks and finish the session on logout. Durations are computed from **server-authoritative persisted timestamps**, never a client timer. The user gets a **My Productivity** page (daily/weekly/monthly history + calendar + KPIs); an authorized Owner/manager gets a **Sales Agent Productivity** report (select agent + date range + store) and an **HR/payroll export** (Excel primary + CSV).

This feature reuses — and must never fork — the existing RepairOX authentication, the signed-in user identity (`staff.id` + org + `branch_id`), the Online Users presence system, the permission system (`permissions.ts` catalog → `permission-levels.ts` matrix → `CAP` in `capabilities.ts` → `requirePermission` server guard → RLS), the dual-mode (Supabase / localStorage) context pattern, and the shared view/table/filter UI primitives.

### Three concepts kept strictly independent (never merged)

| Concept | Values | Source | Notes |
|---|---|---|---|
| **Online Presence** | Online / Offline | existing `useSalesPresence` channel (unchanged) | app-wide, idle-timeout driven; a user may be Online while On Break |
| **Work Status** | Working / On Break / Logged Out / Interrupted (Needs Review) | derived from the open Work Session + its breaks | shown separately from presence |
| **Work Session** | start ts, end ts, break intervals, computed durations | new persisted records (DB table in Supabase mode; localStorage in local mode) | the authoritative record of worked time |

**Online ≠ Working.** The feature must never equate presence with active work; it displays Work Status as a distinct piece of information in the existing Online Users control and (for the signed-in user) in the profile menu.

---

## Functional Requirements

### A. Identity & data ownership

1. Work records are keyed by the **authenticated RepairOX user id** (`staff.id`, matching the id space used by `useSession().id` / `SalesAgent.id` / presence `PresenceMeta.id`), plus the user's **organization** and **home store (`branch_id`)** for scoping. Never key records by display name or role name.
2. Two employees sharing the same role have **fully independent** records. Reuse the existing org/tenant + staff + store (`branches` / `user_stores`) relationships; never create a parallel employee/auth database.
3. Repeated page loads, refreshes, route changes, and multiple open tabs for the same user must map to the **same** open work session — never a per-tab/per-refresh record.

### B. Auto-start on login (idempotent)

4. On successful authentication + app initialization (hook mounted app-wide in the app shell, alongside `useSalesPresenceTracker` / `useSessionTracker`), the system checks whether the current user already has an **open** work session.
5. If no open session exists → create one with a **server-authoritative start timestamp** and set Work Status = **Working**.
6. If a valid open session exists → **resume** it (do not create a duplicate).
7. The resulting status is visible to the user immediately (profile menu + Online Users control + My Productivity live indicator).
8. Idempotency holds across refresh / route-change / multiple tabs / reconnect. A single-flight guard + an "open session per user" uniqueness guarantee (DB partial-unique index in Supabase mode) prevent duplicates even under concurrent requests.

### C. Work controls in the existing top navigation (no redesign)

9. The existing **Online pill / Sales Agents dropdown** (`sales-agents-online.tsx`) is the natural entry point. For the current user it additionally shows their **Work Status** and the context-appropriate actions; it must not redesign the overall navigation.
10. Actions by state:
    - **Working** → `Start Break`, `Productivity` (link to My Productivity).
    - **On Break** → `End Break / Resume Work`, `Productivity`.
    - **Logged out of work session but still authenticated** → a clear `Start Work` action.
    - The existing **Log out** action remains and must end the active work session (and close any open break) **before** terminating auth.
11. The current user's **Work Status** also appears in the profile menu (`topbar.tsx`) with the same actions, so the control is discoverable where logout already lives. The Online Users list continues to show each agent's presence; it may additionally surface a non-identifying Work Status chip for the current user and (to authorized owners) for others — without implying presence = working.

### D. Start Break

12. On `Start Break`: record the break start timestamp, associate it with the currently open session, set Work Status = **On Break**, preserve the original session start timestamp, make the status immediately visible, and **prevent a second simultaneous active break**.
13. Confirmation/feedback uses existing RepairOX patterns (toast + immediate optimistic status, reconciled with the server result).

### E. End Break / Resume Work

14. On `End Break / Resume Work`: record the break end timestamp, compute that break's duration from the two timestamps, close the active break interval, set Work Status = **Working**, and **continue the same session** (never create a new one).
15. **Multiple breaks per session** are supported.

### F. Logout

16. On explicit logout the system, in order: (1) records the session end timestamp, (2) closes any active break at the **same** logout timestamp, (3) computes the completed session duration, (4) marks the session **completed**, (5) updates presence per existing logout behavior, (6) terminates auth via the existing secure logout (`usePermissions().logout()` then route to `/login`).
17. The session-close is **persisted** (not merely a hidden button / frontend status). If the user logs out while on break, the break and session close at the same logout time — no time counted beyond logout.

### G. Backend-enforced state machine (not UI-only)

18. The following invalid transitions are rejected **on the backend** (and reflected in the UI), returning clear, friendly errors:
    - cannot start a second active work session while one is open;
    - cannot start a break without an active work session;
    - cannot start a second break while already on break;
    - cannot end a break that is not active;
    - a **completed** session is immutable to ordinary Start Break / End Break / Start Work actions (only an explicit admin correction may touch it — see §K);
    - repeated clicks / duplicate events do not create duplicate rows (idempotency keys + single-flight);
    - concurrent requests are handled safely (uniqueness constraints + conditional updates).
19. The UI mirrors these rules for good UX, but the **server/DB is the source of truth**: in Supabase mode via `requirePermission` + guard triggers + RLS; in local mode via equivalent guard logic in the context so the prototype behaves identically.

### H. Time calculation engine (server-authoritative)

20. All durations are computed from **persisted timestamps**, never from a frontend timer. Per session:
    - **Elapsed session duration** = `Session End − Session Start`
    - **Total break duration** = sum of all **closed** break intervals in the session
    - **Net working duration** = `Elapsed − Total breaks`
21. An **open** session shows elapsed time as **provisional / in-progress** (clearly labeled), computed as `now − start` for display only; it is never persisted as a final duration.
22. Timestamps are server-authoritative. Times display in the **organization's configured timezone**, falling back to the user's / existing RepairOX timezone convention.
23. **Multiple sessions per day** are supported and **aggregated** in the daily report without double-counting overlapping sessions. (Worked example: 09:00 login, breaks 11:00–11:15 and 14:00–14:30, 18:00 logout → elapsed 9h, breaks 45m, net 8h 15m.) A later logout/login the same day is a separate session, aggregated into the day's totals.
24. **Midnight-crossing** sessions/breaks are split across the relevant **local calendar dates** for daily reports using timezone-aware boundaries — without inventing new login/logout events, and never assigning an entire overnight session to only the login date.
25. **Interrupted / stale sessions** (browser closed, disconnected, no clean logout): the engine must **flag** them as `Interrupted / Needs Review` rather than fabricating an end timestamp. A session left open past a configurable staleness threshold is detectable and surfaced for review. Reports distinguish **confirmed** durations (clean start+end) from **estimated** ones (last-known-activity based), and never silently invent time. The pure engine is the single, tested source of these calculations.

### I. Individual **My Productivity** page

26. A dedicated full page under the app shell, built to the `view-detail-pages` standard (DetailHero/section primitives + `PinnedRail` where appropriate), with a header + subtitle, reachable from the Online Users control / profile menu "Productivity" action.
27. **Range control** as a single connected `SegmentedTabs`: Daily / Weekly / Monthly + a custom range (opens the shared date picker). (Never detached pill buttons.)
28. **TODAY KPI cards**: total session (elapsed) time, total break time, net working time, session count, and (if an open session exists) a **display-only live timer** showing provisional elapsed time, clearly marked "in progress". The live timer is presentation only; it never writes or determines any persisted duration.
29. **Calendar view** of work records using **restrained semantic colors** — green (worked / healthy), amber (short/partial or high-break), gray (no record), blue (today / in-progress). Colors must **never imply absence/leave/attendance-policy judgments**; they are neutral indicators of recorded activity only. Color is never the sole signal (always a label/number too).
30. **Daily detail timeline**: the day's sessions and break intervals in order, with per-session elapsed/break/net and the confirmed-vs-estimated distinction for any interrupted session.
31. **Weekly** and **Monthly** summaries: per-day and per-week totals (elapsed / break / net), session counts, and interrupted-session counts, aggregated from the canonical records.
32. The page shows only the **signed-in user's own** records (self-scoped), gated so every authenticated agent can view their own productivity.

### J. Owner / manager **Sales Agent Productivity** report (no impersonation)

33. A report surface where an authorized Owner/manager reviews **individual** Sales Agents without ever assuming their identity. The caller's session/user/role/grants/store scope remain unchanged — the selected agent is an **analytical subject** only.
34. **Agent selector** sourced from the **eligible, active Sales Agent directory** via the existing sales-agent eligibility RPC/predicate (`lead_sales_agents()` RPC / `lead_agent_eligible()` predicate — never a hardcoded or role-name list, never the whole staff list). Options: **All** agents (in authorized scope) + any **specific** agent.
35. **Filters**: date range (shared date picker) + **store** filter (`StoreMultiSelect` / `TableUtilityBar`, permission-aware, hidden/static for single-store users) + the agent selector. All filters combine (AND) and apply consistently to every panel.
36. **Owner summary** metrics clearly labeled as **sum / average / count** across the selected scope (e.g. total net hours = sum; average net per workday = avg; sessions = count; interrupted sessions = count). Never present an average as a total or vice-versa.
37. **Per-agent report** and a **daily comparison table** (one row per agent per day, or per agent for the range) built on the shared `rox-table` primitives (frozen brand header, `h-[68px]`/`py-4` rows, detached `<Pagination>`, Store Context column when multi-store). A **View Details** action opens the deeper per-agent breakdown and **must not change the owner's identity** (it navigates/expands within the owner's own session).
38. The report reads only records the caller is authorized to see (permission + org + store scope via RLS); it never exposes agents or stores outside the caller's authorized scope.

### K. HR / payroll **export** (new — carry through design → plan → build → validation)

39. The Owner/manager Sales Agent Productivity report supports an **HR/payroll export** for a selected period (**default: monthly**). It produces **one row per Sales Agent** with at least: Sales Agent **name**, their **user/staff id**, **store**, **workdays with recorded sessions**, **total session (elapsed) duration**, **total break duration**, **net productive hours**, **completed session count**, and **unresolved/interrupted session count**.
40. Every exported value comes from the **same canonical persisted work-session records** as the on-screen report — **never** the live UI timer and **never** fabricated time. Durations are exported in an **HR-friendly form**: an `"Hh Mm"` display column **and/or** a decimal-hours numeric column, so payroll can compute monthly pay.
41. The export honors the current **agent filter** (All or specific), **date range**, and **store filter**, and is gated by the **owner/team productivity capability + RLS** exactly like the on-screen report.
42. The export follows the repository's **mandatory spreadsheet standard** (`spreadsheet-import-export` rule): **Excel (.xlsx) is primary, CSV (.csv) is the alternative**, both produced from **one shared row-builder** via the shared `app/src/lib/csv-utils.ts` helpers (`downloadXLSX` for Excel, `downloadCSV(filename, toCSV(headers, rows))` for CSV), rendered as the canonical **two-item export `Dropdown`** (Excel then CSV). Never a hand-rolled `new Blob([...], {type:"text/csv"})`, never CSV-only.
43. This export is **attendance/productivity data only** — it is **not** official leave/payroll data by itself. This limitation must be stated in the steering standard.

### L. HRM-ready, reusable, and bounded

44. The work-session engine and data model are keyed by **employee (`staff.id`)**, not Sales-Agent-only, so a future HRM module can reuse them for any staff member without a schema rewrite. Sales-Agent gating applies only at the UI/permission surface for this phase.
45. The feature is kept **distinct** from leave, holiday, payroll, shift scheduling, and overtime. Do **not** invent those modules, fields, or policies now. The calendar colors and reports never make attendance-policy or leave judgments.

---

## Non-Functional Requirements

### Reliability & correctness
46. All mutations are backend-trusted; the server never trusts client-supplied durations or timestamps for the authoritative record (client may send intent, server stamps time with `now()` / server clock).
47. The pure time engine is deterministic and unit-testable in isolation (no DB, no React), covering: single session, multiple sessions/day aggregation, multiple breaks, open/provisional session, midnight crossing, and interrupted/estimated sessions.
48. Offline / reconnect handling: a dropped connection does not corrupt the open session; on reconnect the client reconciles with the server's authoritative state (resume the real open session; do not duplicate). Local mode behaves equivalently via localStorage.

### Security & isolation
49. UI = server = RLS must agree. In Supabase mode: org isolation (`auth_member_of_org`), own-record access for individuals (`auth_staff_id()` match), and permission-scoped owner/team access (`auth_has_any([...])` + `auth_branch_visible`) in RLS; `requirePermission` on any new API route. Hiding UI is never security.
50. Realtime work-status updates flow through the existing realtime pattern so the current user and authorized owners see status changes without a manual refresh.
51. Any admin correction is **append-only**: it never destroys the original values. A correction records the **reason**, the **original values**, the **editor's identity**, and a **timestamp**, and is gated by a dedicated **Review/Correct** capability. Ordinary users can never edit a completed session; corrections are an auditable superuser action only.

### UI/UX consistency
52. Reuse shared primitives: `SegmentedTabs` for range strips, `TableUtilityBar` + `StoreMultiSelect` + `TableSearch` for owner filters, `rox-table` for tables, `rox-filter` for any filter panel (close × + per-filter ×), `detail-page` primitives + `PinnedRail` for the pages, `Reveal` honoring `prefers-reduced-motion`. No new table style, no bespoke section cards.
53. Must remain usable at 1366×768 and 80–125% zoom per the compact-desktop density standard.

---

## Acceptance Criteria

1. On successful login, a work session auto-starts with a server-authoritative start timestamp and Work Status becomes Working, visible immediately in the Online Users control and profile menu.
2. Refreshing, changing routes, and opening a second tab as the same user never create a second open session — the open session is resumed.
3. Start Break sets On Break, records a break start, and a second Start Break while on break is rejected by the backend.
4. End Break / Resume Work closes the active break, computes its duration, returns to Working, and keeps the same session; multiple breaks in one session are supported and summed.
5. Logout records the session end, closes any open break at the logout time, marks the session completed, persists it, then performs the existing secure auth logout and redirect to `/login`.
6. Logging out while on break closes both the break and the session at the same timestamp; no time is counted beyond logout.
7. Starting a break without an open session, ending a non-active break, or starting a second concurrent session are all rejected server-side with friendly errors, and the UI reflects the correct state.
8. Duplicate/rapid clicks and concurrent requests never create duplicate sessions or break rows (verified under concurrency).
9. The time engine computes elapsed = end−start, total break = sum of closed intervals, and net = elapsed − break; the worked example (9h / 45m / 8h 15m) matches exactly in a unit test.
10. An open session shows provisional in-progress elapsed time, clearly labeled, and never persists a final duration until closed.
11. Multiple same-day sessions aggregate into correct daily totals with no double-counting; a midnight-crossing session is split across both local dates without inventing login/logout events.
12. An interrupted session (no clean logout past the staleness threshold) is flagged Needs Review and shown as estimated (not confirmed), never fabricated.
13. My Productivity shows header/subtitle, Daily/Weekly/Monthly + custom range via `SegmentedTabs`, TODAY KPI cards, a display-only live timer for the open session, a semantic-colored calendar (green/amber/gray/blue that never imply absence), a daily timeline, and weekly/monthly summaries — all from real records, self-scoped.
14. The owner Sales Agent Productivity report lets an authorized user pick All or a specific agent (from the eligibility RPC/predicate), filter by date range and store, see sum/avg/count-labeled summary metrics, a per-agent report, and a daily comparison table; View Details never changes the owner's identity.
15. The owner report and export are gated by the owner/team productivity capability + RLS; an agent without that capability cannot access the owner report or another agent's data via UI or API.
16. The HR/payroll export produces one row per Sales Agent for the selected period (default monthly) with name, user/staff id, store, workdays, total elapsed, total break, net productive hours (HR-friendly "Hh Mm" and/or decimal-hours), completed session count, and interrupted session count — all from canonical persisted records.
17. The export offers Excel (.xlsx) primary and CSV (.csv) alternative from one shared row-builder via `csv-utils` helpers, rendered as the two-item export Dropdown; it honors the agent/date/store filters; it is not a hand-rolled CSV blob and not CSV-only.
18. New permission key(s) are registered end to end (union + `PERMISSION_GROUPS` def + `PERMISSION_MODULES` tier + `CAP` entry + `requirePermission` + RLS) and OFF by default except via granted role permissions (owner roles via `full_access`).
19. Online Users presence behavior is unchanged (count, roster, idle timeout); Work Status is shown as separate information and a user can be Online while On Break.
20. Auth, logout, navigation, and existing permissions are unaffected; a permanent steering doc for the Work Session & Productivity Standard exists under the repo `.kiro/steering`.
21. `npx tsc --noEmit` and the Next.js build both pass when run from `/Users/apple/Desktop/Reapirox dummy2/app`.

---

## Out of Scope (do not build in this phase)

- Leave, holiday, shift scheduling, overtime, and payroll **computation** modules/policies (the engine is HRM-ready and the export is payroll-friendly, but official payroll/leave data and their rules are explicitly out of scope).
- Any replacement or modification of the authentication/login/secure-logout flow itself.
- A second presence/online system, a second employee/auth database, or a second permission system.
- Geofencing, biometric/location-based attendance, or facial/biometric identification.
- Attendance-policy judgments (late/absent/half-day) in the calendar or reports.

---

## Assumptions

- `staff.id` is the stable authenticated user id shared by `useSession().id`, presence `PresenceMeta.id`, and sales-agent records; it is the correct identity key. (Confirmed in codebase.)
- The next Supabase migration number is **0075** (last is 0074). A new `work_sessions` + `work_session_breaks` schema with per-user/own + permission-scoped RLS follows the conventions in 0049 / 0066.
- Dual-mode (Supabase + localStorage) is required to match the rest of the app; local mode replicates the state-machine guards and the time engine so the prototype behaves identically.
- Organization timezone is read from the existing store/org settings; where unavailable, fall back to the user's / app convention (to be confirmed against `store-settings` during design).
- The steering file lives at the **repo root** `.kiro/steering/` (not under `app/`), matching the existing steering location.
