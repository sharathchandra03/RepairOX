# RepairOX — Sales Agent Attendance, Break Management & Productivity — Technical Design

## Overview

This design turns the approved requirements into a concrete, buildable blueprint for a **Work Session & Productivity** feature. The feature adds a persisted, server-authoritative record of each employee's worked time, keyed by `staff.id`, that auto-starts on login, tracks breaks, closes on logout, and feeds a self-service **My Productivity** page and an authorized **Sales Agent Productivity** owner report (with an HR/payroll Excel/CSV export). It reuses — never forks — the existing authentication, the Online Users presence channel, the permission pipeline (catalog → matrix → `CAP` → `requirePermission` → RLS), the dual-mode (Supabase / localStorage) context pattern, and the shared view/table/filter UI primitives.

The three concepts in the requirements — **Online Presence** (existing `useSalesPresence`), **Work Status** (derived from the open session), and **Work Session** (new persisted records) — are kept strictly independent at every layer. Presence is never read to decide work status, and work status is never pushed into the presence channel.

The locked technology stack: **Next.js (App Router) + React client components + TypeScript**, **Supabase (Postgres + RLS + Realtime)** in Supabase mode with a **localStorage** fallback in local/demo mode, **framer-motion** for `Reveal` motion, and **SheetJS via `csv-utils.ts`** for the export. No new runtime dependencies are introduced. The pure time engine is plain TypeScript with a co-located `*.test.ts` run by `tsx --test` (the repo's existing test convention), added as an npm script.

The data model is deliberately **employee-keyed (HRM-ready)**, not Sales-Agent-only, so a future HRM module can reuse `work_sessions` for any staff member without a schema rewrite. Sales-Agent restriction applies only at the UI/permission surface in this phase.

---

## 1. Database schema — migration `0075_work_sessions.sql`

New file: `app/supabase/migrations/0075_work_sessions.sql`. Additive + idempotent, matching the style of 0049 / 0045 / 0034 / 0066 (`create table if not exists`, `add column if not exists`, `drop policy if exists` → `create policy`, `create or replace function … security definer set search_path = public`, `drop trigger if exists` → `create trigger`).

### 1.1 Three tables

**`work_sessions`** — one row per work session (login → logout).

| column | type | notes |
|---|---|---|
| `id` | `uuid PK default gen_random_uuid()` | |
| `organization_id` | `uuid not null references organizations(id) on delete cascade` | org isolation |
| `branch_id` | `uuid default public.auth_branch_id() references branches(id) on delete set null` | the user's home store at session start (store scope); **nullable by design** for org-wide / multi-store staff whose `staff.branch_id` is null — exactly like every existing per-store table (`leads`, `quotations`, `customers`, …). A null branch means "org-wide" and is visible to any org-member holding a team/all/reports key (see the null-branch visibility note in §1.5). `branch_id` is **immutable after creation** in this phase. |
| `staff_id` | `uuid not null references staff(id) on delete cascade` | **the identity key** — matches `auth_staff_id()` / `useSession().id` |
| `started_at` | `timestamptz not null default now()` | server-authoritative start |
| `ended_at` | `timestamptz` | null while open; set on logout/correction |
| `status` | `text not null default 'open'` | `'open' | 'completed' | 'interrupted'` (CHECK constraint) |
| `end_reason` | `text` | `'logout' | 'auto_close' | 'correction'` — how it ended; null while open |
| `last_seen_at` | `timestamptz not null default now()` | last presence/heartbeat touch — basis for interrupted detection; **never** used as a persisted duration |
| `source` | `text not null default 'web'` | future-proofing (web/mobile) |
| `created_at` / `updated_at` | `timestamptz not null default now()` | |

**`work_session_breaks`** — one row per break interval, child of a session.

| column | type | notes |
|---|---|---|
| `id` | `uuid PK default gen_random_uuid()` | |
| `organization_id` | `uuid not null references organizations(id) on delete cascade` | denormalized for RLS without a join |
| `session_id` | `uuid not null references work_sessions(id) on delete cascade` | |
| `staff_id` | `uuid not null references staff(id) on delete cascade` | denormalized for own-record RLS |
| `branch_id` | `uuid references branches(id) on delete set null` | **denormalized from the parent session for store-scoped RLS** — see Decision below; stamped from `work_sessions.branch_id` by the guard, never from the client. Nullable iff the parent session's branch is null (org-wide staff). |
| `started_at` | `timestamptz not null default now()` | break start |
| `ended_at` | `timestamptz` | null while on break |
| `created_at` / `updated_at` | `timestamptz not null default now()` | |

**`work_session_events`** — append-only audit of every transition and correction.

| column | type | notes |
|---|---|---|
| `id` | `uuid PK default gen_random_uuid()` | |
| `organization_id` | `uuid not null references organizations(id) on delete cascade` | |
| `session_id` | `uuid references work_sessions(id) on delete set null` | nullable so a failed-start attempt can still log; **`on delete set null`** (not cascade) so audit rows survive a session delete — the audit trail is never destroyed |
| `staff_id` | `uuid not null references staff(id) on delete restrict` | subject employee — **`on delete restrict`** (the default) so a staff archive cannot silently erase audit history; see Decision below |
| `kind` | `text not null` | `'session_start' | 'break_start' | 'break_end' | 'session_end' | 'auto_close' | 'correction'` (CHECK) |
| `actor_staff_id` | `uuid references staff(id) on delete set null` | who performed it (`auth_staff_id()`); = `staff_id` for self-actions, differs for a corrector; **`on delete set null`** so the audit row survives if the actor's staff record is later removed (the actor becomes "unknown" rather than deleting the audit) |
| `at` | `timestamptz not null default now()` | |
| `reason` | `text` | mandatory for `correction` (enforced by guard) |
| `previous` | `jsonb` | for corrections: the original `{ started_at, ended_at, status, breaks:[…] }` snapshot — never destroyed |
| `details` | `jsonb` | optional structured extras |

**Decision — why three tables, not one JSON blob.** Breaks are a 1-to-many child needing their own open/closed state and a partial-unique guarantee; events are append-only audit. Separating them lets the partial unique indexes (below) enforce the state machine in the database, which a single JSONB column could not. This mirrors the lead model's split of `leads` + `lead_followup_history` + `lead_assignment_history` and keeps reporting queries simple (`sum`/`count` over child rows).

**Decision — `work_session_events` FKs preserve the audit trail.** The sessions/breaks FKs use `on delete cascade` (a deleted session should take its live child rows with it). The **audit** table deliberately does not cascade: `session_id` → `on delete set null`, `staff_id` → `on delete restrict` (default — blocks deleting a staff who has audit history, which is desirable; staff are archived, not hard-deleted, per the store-administration standard), and `actor_staff_id` → `on delete set null`. This keeps the append-only audit intact even as sessions are purged or staff are archived, consistent with the "corrections never destroy original values" rule (NFR §51).

**Decision — denormalize `branch_id` onto `work_session_breaks` (same rationale as `organization_id`/`staff_id`).** Store-scoped RLS (`auth_branch_visible`) needs a branch column on the row it guards. Rather than force every break read/write policy — including the corrector path — through a parent-session subquery (which is easy to get wrong, e.g. an implementer writing `auth_branch_visible(branch_id)` against a column that doesn't exist), I denormalize `branch_id` onto the breaks row, stamped by the guard from the parent `work_sessions.branch_id` on insert (client value ignored). This lets the **identical** reusable predicate `auth_work_sessions_see(staff_id, organization_id, branch_id)` apply uniformly to sessions, breaks, and events — read AND correct — with no subquery and no store-scope gap. **Session `branch_id` is immutable after creation in this phase** (no store-move operation exists), so there is no cross-table re-stamp to perform: a break's `branch_id` is set once from the parent at insert and never needs to track a later parent change. (A future store-move feature would add an `AFTER UPDATE` trigger on `work_sessions` syncing `branch_id` onto child breaks in the same transaction; it is explicitly out of scope here, so the schema carries no such trigger yet.)

### 1.2 Partial unique indexes (the state-machine guarantees)

```sql
-- At most ONE open session per employee (idempotent auto-start + no duplicate
-- sessions from refresh / multi-tab / concurrent requests).
create unique index if not exists work_sessions_one_open_per_staff
  on public.work_sessions (staff_id) where ended_at is null;

-- At most ONE open break per session (no second simultaneous break).
create unique index if not exists work_session_breaks_one_open_per_session
  on public.work_session_breaks (session_id) where ended_at is null;
```

These are the authoritative concurrency guards: even if two tabs race to auto-start, the second INSERT violates `work_sessions_one_open_per_staff` and the client treats the violation as "an open session already exists → resume it". Error code `23505` (unique_violation) is caught and mapped to a resume, not an error toast.

Supporting non-unique indexes for reporting:
```sql
create index if not exists work_sessions_staff_started_idx on public.work_sessions (staff_id, started_at);
create index if not exists work_sessions_org_started_idx   on public.work_sessions (organization_id, started_at);
create index if not exists work_sessions_branch_started_idx on public.work_sessions (branch_id, started_at);
create index if not exists work_session_breaks_session_idx  on public.work_session_breaks (session_id);
create index if not exists work_session_events_session_idx  on public.work_session_events (session_id, at);
```

### 1.3 Guard trigger (backend state machine)

A `BEFORE INSERT/UPDATE` trigger `work_session_guard()` on `work_sessions` and a `work_break_guard()` on `work_session_breaks`, modeled on `leads_ownership_guard` / `lead_followup_guard`. Service-role writes bypass end-user checks via `if auth.uid() is null then return new; end if;` so server scripts/corrections through the admin client are not blocked.

`work_session_guard()` enforces:
- **INSERT**: `staff_id` is forced to `auth_staff_id()` (a user can only open their own session); `organization_id` / `branch_id` are stamped from the caller's `staff` row (client values for these are ignored); `status` must be `'open'` and `ended_at` must be null on a fresh insert (an insert may not pre-create a completed session except via a correction path with the Review/Correct capability).
- **UPDATE closing a session** (`old.ended_at is null and new.ended_at is not null`): allowed when the caller owns the session (self-close on logout) **or** holds the Review/Correct capability (`auth_has_any(['work_sessions_correct', …])`). `ended_at` must be `>= started_at`. `status` becomes `'completed'` (self/logout, `end_reason='logout'`) — the client sets this; the trigger validates it is a legal terminal state.
- **A completed/interrupted session is immutable** to ordinary field changes: once `old.ended_at is not null`, any UPDATE that is not a correction (caller lacks `work_sessions_correct`) is rejected (`raise exception 'work_session_locked' using errcode='42501'`). This is what makes "a completed session cannot be modified by ordinary Start Break / End Break actions" true at the DB layer.
- `started_at` is immutable after insert except by a corrector.

`work_break_guard()` enforces:
- **INSERT**: `session_id` must reference the caller's own session **and that session must be open** (`ended_at is null`); otherwise `raise exception 'work_break_no_open_session' using errcode='23514'` — this is "cannot start a break without an active work session". `staff_id`/`organization_id`/`branch_id` are all stamped from the parent `work_sessions` row (client values ignored), so the denormalized `branch_id` used by the break RLS policies (§1.5) always matches the owning session's store. The partial unique index rejects a second open break.

**Decision — RLS/guard division of responsibility + evaluation ordering (finding fix).** Postgres evaluates a BEFORE trigger **first** and then checks the RLS `WITH CHECK` against the **post-trigger** row. So on a break insert, `work_break_guard` runs first and stamps `staff_id`/`organization_id`/`branch_id`/validates `session_id`; the `work_session_breaks_ins` WITH CHECK then sees those **guard-stamped** values (not the raw client payload) — which is exactly why the policy can safely assert `staff_id = auth_staff_id()` and trust it. The two layers have **non-overlapping jobs, stated explicitly so neither is assumed to cover the other**: (1) **RLS** is the *row-visibility + org/store boundary* — "may this caller touch a row in this org/branch at all" (`organization_id = auth_org_id() and staff_id = auth_staff_id()` for self-writes, plus the store-scoped corrector branch). (2) **The guard** is the *sole enforcer of parent-session ownership and open-state* — "this break attaches to a session the caller owns AND that session is still open." RLS deliberately does **not** re-check parent-session ownership/open-state (it cannot see the parent without a subquery, and duplicating it would risk the two drifting); a future guard refactor must preserve that check because nothing else does. The same ordering guarantee applies to `work_sessions` inserts: the guard forces `staff_id = auth_staff_id()` and stamps org/branch before the `work_sessions_ins` WITH CHECK is evaluated.
- **UPDATE closing a break** (`old.ended_at is null and new.ended_at is not null`): `ended_at >= started_at`; a break whose `ended_at` is already set cannot be re-closed (`raise exception 'work_break_not_active'`) — this is "cannot end a break that is not active".
- Breaks are otherwise append-only (no delete via ordinary path; a corrector may adjust).

**Decision — guards + indexes, not just app logic.** Requirement §18–19 demands backend enforcement. The partial unique indexes handle concurrency atomically; the triggers handle the ownership/state-legality rules and friendly error codes. The client maps these PG error codes to friendly messages (see §4.6).

### 1.4 Event logging triggers

`AFTER INSERT/UPDATE` triggers write `work_session_events` rows in the same transaction (mirrors `leads_record_assignment`): a `session_start` on session insert, `session_end`/`auto_close` on close, and `break_start`/`break_end` on break insert/close. Corrections are logged by the correction API path (which captures `previous`). This keeps the audit append-only and un-skippable.

### 1.5 RLS policies

Enable RLS on all three tables. Use only the shared helpers (`auth_member_of_org`, `auth_branch_visible`, `auth_has_any`, `auth_staff_id`, `is_admin`). The visibility rule is **own-record OR permission-scoped owner/team access**, org- and store-isolated:

```sql
-- A reusable predicate: can the caller SEE this employee's work records?
create or replace function public.auth_work_sessions_see(p_staff_id uuid, p_org_id uuid, p_branch_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select
    public.auth_member_of_org(p_org_id)
    and (
      -- own records
      p_staff_id = public.auth_staff_id()
      -- OR owner/team productivity capability, within the caller's store scope
      or (
        public.auth_branch_visible(p_branch_id)
        and public.auth_has_any(array[
          'work_sessions_view_all',   -- all sales agents
          'work_sessions_view_team',  -- team (store) scope
          'manage_attendance',        -- coarse HR fallback
          'view_sales_reports', 'manage_reports'
        ])
      )
    );
$$;
```

**Null-branch visibility — explicit decision (finding fix).** `auth_branch_visible(b)` is defined as `auth_can_cross_branch() or b is null or b = auth_branch_id()`, so `auth_branch_visible(null)` returns **true for every caller**. A session whose `branch_id` is null (an org-wide / multi-store employee, §1.1) therefore passes the branch test for *any* org member who also holds a team/all/reports key. **This is intended, not a leak:** it is the identical behaviour every existing per-store table already exhibits for null-branch rows (org-wide leads, quotations, customers all use `branch_id default auth_branch_id()` and the same `auth_branch_visible` gate), and the caller still must (a) be a member of the same org (`auth_member_of_org`) AND (b) hold a team/all/reports capability. In other words: a null-branch work session is **org-wide productivity data visible only to team/all/reports-key holders in that org** — never to a plain Sales Agent (who sees only their own records via the `p_staff_id = auth_staff_id()` branch). Store isolation still fully applies to every session that *has* a concrete `branch_id`: a store manager with only `work_sessions_view_team` and no cross-branch scope sees in-store sessions plus org-wide (null-branch) ones, but not another concrete store's sessions. This resolves the earlier over-claim of "strict store isolation for all rows" — the accurate statement is "store-isolated for branch-stamped rows; org-wide for null-branch rows, by the same rule as every other RepairOX table."

Because `work_session_breaks` now carries a denormalized `branch_id` (§1.1), all three tables SELECT through the **identical** predicate with no subquery:

```sql
-- SELECT policies (all three reuse auth_work_sessions_see with the row's own columns)
create policy work_sessions_sel on public.work_sessions for select using (
  public.auth_work_sessions_see(staff_id, organization_id, branch_id)
);
create policy work_session_breaks_sel on public.work_session_breaks for select using (
  public.auth_work_sessions_see(staff_id, organization_id, branch_id)
);
create policy work_session_events_sel on public.work_session_events for select using (
  public.auth_work_sessions_see(staff_id, organization_id, branch_id)
);
```

Write policies — **the corrector branch is store-scoped on every table** (a `work_sessions_correct` holder can only touch rows whose `branch_id` passes `auth_branch_visible` for them — i.e. their own branch, any branch if they hold cross-branch scope, or a null-branch/org-wide row — closing the cross-store correction gap for branch-stamped rows; null-branch rows follow the same org-wide rule documented above):

```sql
-- A reusable corrector predicate: holds the correct key AND is inside this row's org+store.
-- (Inlined below rather than a helper so the policy intent is explicit; may be factored
--  into auth_work_sessions_correct(org,branch) in the migration if preferred.)

-- work_sessions
create policy work_sessions_ins on public.work_sessions for insert with check (
  organization_id = public.auth_org_id() and staff_id = public.auth_staff_id()   -- open only your own; guard re-stamps org/branch
);
create policy work_sessions_upd on public.work_sessions for update using (
  staff_id = public.auth_staff_id()                                              -- self-close on logout
  or (
    public.auth_member_of_org(organization_id)
    and public.auth_branch_visible(branch_id)
    and public.auth_has_any(array['work_sessions_correct'])                       -- corrector, store-scoped
  )
) with check (
  staff_id = public.auth_staff_id()
  or (
    public.auth_member_of_org(organization_id)
    and public.auth_branch_visible(branch_id)
    and public.auth_has_any(array['work_sessions_correct'])
  )
);

-- work_session_breaks (branch_id denormalized → same store-scoped corrector branch)
-- NOTE (§1.3 ordering): WITH CHECK below runs on the POST-BEFORE-trigger row, so
-- staff_id/branch_id/session_id here are the guard-stamped values. Parent-session
-- ownership + open-state is enforced SOLELY by work_break_guard, not by this policy.
create policy work_session_breaks_ins on public.work_session_breaks for insert with check (
  organization_id = public.auth_org_id() and staff_id = public.auth_staff_id()   -- break only on your own session; guard verifies open + stamps branch
);
create policy work_session_breaks_upd on public.work_session_breaks for update using (
  staff_id = public.auth_staff_id()
  or (
    public.auth_member_of_org(organization_id)
    and public.auth_branch_visible(branch_id)
    and public.auth_has_any(array['work_sessions_correct'])
  )
) with check (
  staff_id = public.auth_staff_id()
  or (
    public.auth_member_of_org(organization_id)
    and public.auth_branch_visible(branch_id)
    and public.auth_has_any(array['work_sessions_correct'])
  )
);

-- work_session_events — append-only to end users
create policy work_session_events_ins on public.work_session_events for insert with check (
  organization_id = public.auth_org_id() and actor_staff_id = public.auth_staff_id()
);
-- NO update/delete policy on work_session_events → append-only audit (service role may still write). Satisfies NFR §51.
```

`is_admin()`/`full_access`/`*` are honored inside `auth_has_any`, so owners get owner/team access automatically; the `work_sessions_correct` key defaults OFF for everyone except via `full_access`. The guards (§1.3) remain the state-machine enforcer (ownership, open/closed legality, completed-session immutability); these policies are the row-visibility + store-isolation boundary. UI (`CAP`) and RLS (`auth_has_any`) arrays are kept in lockstep (see §2.4 and finding-4 note).

### 1.6 Default grants (seed in 0075)

Mirror 0049 SECTION 1: grant **`work_sessions_view_own`** to the `sales_agent` role (and any role that should start/see its own productivity) so every Sales Agent sees their own My Productivity by default:

```sql
insert into public.role_permissions (role_id, permission_key)
select 'sales_agent', 'work_sessions_view_own'
where exists (select 1 from public.roles where id = 'sales_agent')
on conflict (role_id, permission_key) do nothing;
```

The owner/team keys (`work_sessions_view_team`, `work_sessions_view_all`, `work_sessions_correct`) are **not** seeded onto non-owner roles — owners hold them via `full_access`; other roles get them only when an admin grants them. This matches the "OFF by default except owner roles" rule.

---

## 2. Permission wiring (all layers must agree)

### 2.1 New capability keys (4)

| Key | Human label | Meaning |
|---|---|---|
| `work_sessions_view_own` | View Own Productivity | see & operate the signed-in user's own work sessions / My Productivity |
| `work_sessions_view_team` | View Team Productivity | owner/manager — see work records for agents in the caller's store scope |
| `work_sessions_view_all` | View All Sales Agent Productivity | owner — see every eligible Sales Agent's records in authorized stores + run the owner report/export |
| `work_sessions_correct` | Review / Correct Interrupted Sessions | the auditable superuser action to review & correct a completed/interrupted session (append-only) |

### 2.2 `permissions.ts`

Add the 4 keys to the `PermissionKey` union (new section comment `/* Work Session & Productivity (Attendance) */`). Add a **new `PERMISSION_GROUPS` group** so each is a labelled, selectable capability:

```ts
{
  id: "work_sessions",
  label: "Attendance & Productivity",
  description: "Work-session time tracking — own productivity vs team/all-agent review.",
  permissions: [
    { key: "work_sessions_view_own",  label: "View Own Productivity" },
    { key: "work_sessions_view_team", label: "View Team Productivity" },
    { key: "work_sessions_view_all",  label: "View All Sales Agent Productivity" },
    { key: "work_sessions_correct",   label: "Review / Correct Interrupted Sessions" },
  ],
},
```

`ALL_PERMISSIONS` / `PERMISSION_LABEL` derive automatically.

### 2.3 `permission-levels.ts` — new module (not reusing `employees`)

**Decision — a NEW `work_session` module, with `manage_attendance` as the coarse fallback in `CAP` only.** The codebase notes floated reusing the `employees` module (which has `manage_attendance` at Manage). I reject that for the *matrix tier* because the four keys have distinct audiences (own = every agent; team/all = owners; correct = superuser) that do not map cleanly onto the single `employees` row, and because putting own-productivity under "Employees & Payroll" would force a Sales Agent role to carry an HR module tier it should not have. Instead I add a dedicated module so the four tiers are individually grantable, and keep `manage_attendance` purely as a **coarse `CAP` fallback** so any pre-existing HR-manager role keeps owner access.

```ts
{
  id: "work_session",
  label: "Attendance & Productivity",
  blurb: "Work-time tracking — own productivity (View/Work) vs team/all-agent review (Manage) and corrections (Full).",
  icon: "Clock",
  levels: {
    view: ["work_sessions_view_own"],                        // see own productivity
    // NO `work` tier — own tracking (auto-start / break / logout) needs no extra
    // key; it is granted at `view` via work_sessions_view_own. The tier is OMITTED
    // (not `work: []`), matching the existing `sales_agent` and `account` modules
    // which likewise declare only the tiers they use.
    manage: ["work_sessions_view_team", "work_sessions_view_all"], // owner/team report + export
    full: ["work_sessions_correct"],                         // review/correct completed sessions
  },
},
```

The `work` tier is **omitted entirely** (own-tracking is granted at `view`), so a view-tier agent can still auto-start/break/logout their own session (those are self-scoped writes gated by `work_sessions_view_own`, not a separate work key). **Verified against the live `permission-levels.ts`:** `levels` is typed `Partial<Record<AccessLevel, PermissionKey[]>>`, the `sales_agent` module declares only `{ work: [...] }` and the `account` module only `{ work: [...] }` — so declaring a subset of tiers is the established pattern. `levelToKeys` guards with `if (keys)` and `supportedLevels` filters on `(module.levels[lv]?.length ?? 0) > 0`, so a missing (or even empty) tier is simply skipped by the matrix grid and the coverage grep — no empty-tier breakage. (An explicit `work: []` would behave identically because of the `?.length ?? 0` guard, but omission is the cleaner, precedent-matching form.) Add `work_session` to the `levels` map of **every `ROLE_PRESETS` entry**: `preset_owner`/`preset_store_manager` → `"full"`/`"manage"`; `preset_sales` and most others → `"view"`; `preset_readonly` → `"view"`. (A role absent from a module map simply has no access; but adding the entry keeps the matrix explicit and gives Sales Executive own-productivity.) The `sales_agent` built-in role gets `work_sessions_view_own` via the migration seed (not a preset).

### 2.4 `capabilities.ts` — new `CAP.workSession` block

```ts
workSession: {
  // See & operate one's OWN productivity. Any owner/team key implies it, plus
  // the coarse HR fallback so an attendance manager sees their own too.
  viewOwn:  ["work_sessions_view_own", "work_sessions_view_team", "work_sessions_view_all", "manage_attendance"],
  // Team (store-scoped) owner report.
  viewTeam: ["work_sessions_view_team", "work_sessions_view_all", "manage_attendance", "view_sales_reports", "manage_reports"],
  // All eligible Sales Agents (authorized stores) — owner report + export.
  viewAll:  ["work_sessions_view_all", "manage_attendance", "view_sales_reports", "manage_reports"],
  // Review / correct a completed or interrupted session (append-only).
  correct:  ["work_sessions_correct", "manage_attendance"],
},
```

Granular key first, coarse fallback after; `full_access`/`*` are implied by `can()`. The export reuses `CAP.workSession.viewAll` (same gate as the on-screen owner report). The CAP fallbacks must mirror the RLS `auth_has_any` arrays exactly so UI = RLS.

**Decision — Reports-capability holders intentionally inherit team/all productivity visibility (coarse fallback), matching the lead precedent.** Including `view_sales_reports` / `manage_reports` in `viewTeam`/`viewAll` (CAP) and in the `auth_work_sessions_see` owner branch (RLS) means a role granted either Reports key — even if it was never given anything in the new Attendance & Productivity module — can see team/all-agent productivity. This is deliberate and consistent with the existing `auth_lead_see_all()` precedent (which already folds `view_sales_reports`/`manage_reports` into lead see-all) and with Agent Intelligence's `CAP.lead.performanceAll`. It does **not** violate "owner access is OFF by default except via granted role permissions": a role that holds no Reports key and no owner/team Attendance key still sees nothing beyond its own records; only roles already trusted with sales reporting inherit the view. Because the matrix `work_session` module (§2.3) lists only the four `work_sessions_*` keys in its tiers, these two coarse keys are a cross-module *fallback*, never a toggle inside the Attendance module — so a `full_access` owner and a dedicated sales-reports manager both get the view, while a plain Sales Agent does not. (If a future requirement demands that productivity visibility be grantable *only* from the Attendance module, drop `view_sales_reports`/`manage_reports` from both the `CAP.workSession.viewTeam`/`viewAll` arrays and the RLS `auth_work_sessions_see` array in lockstep — the two must always match.)

### 2.5 Server guard

Any new `/api/**` route (see §4) calls `requirePermission(req, [...])` with the matching keys — e.g. the owner report/export aggregate route uses `["work_sessions_view_team","work_sessions_view_all","manage_attendance","view_sales_reports","manage_reports"]`. The self-service session routes use `requireUser(req)` (self-scoped, no permission key — identical to `/api/account/sessions`) because they only ever touch the caller's own records, and the guard trigger + RLS re-enforce ownership.

### 2.6 Coverage check

After editing: every new group-def key must appear in the `work_session` module (verified with the grep in the permission-matrix steering), and every union key must have a group def. The four keys satisfy both.

---

## 3. Time-calculation engine — `src/lib/work-session.ts` (pure, tested)

New file `app/src/lib/work-session.ts` with **no DB and no React imports** — pure functions over plain data, plus a co-located `src/lib/work-session.test.ts`. Add an npm script `"attendance:test": "tsx --test src/lib/work-session.test.ts"` (mirrors `leads:intelligence:test`).

### 3.1 Core types

```ts
export interface BreakInterval { startedAt: string; endedAt: string | null; } // ISO
export interface WorkSessionRecord {
  id: string; staffId: string; branchId: string | null;
  startedAt: string; endedAt: string | null;
  status: "open" | "completed" | "interrupted";
  breaks: BreakInterval[];
  lastSeenAt: string;
}
export interface SessionDurations {
  elapsedMs: number;        // end−start; end = endedAt ?? (isInterrupted ? lastSeenAt : now)
  breakMs: number;          // sum of CLOSED break intervals
  netMs: number;            // elapsed − break (never < 0)
  isOpen: boolean;          // true → elapsed is provisional
  isInterrupted: boolean;   // flagged, estimated — not confirmed
  confidence: "confirmed" | "provisional" | "estimated";
}
```

### 3.2 Formulas (requirement §20–25)

- `elapsedMs(session, nowMs, staleMs)` uses a **conditional end cutoff**, not a blanket `?? now`:
  ```
  isInterrupted = status === 'interrupted'
                  || (endedAt === null && (now − lastSeenAt) > staleMs)   // open & stale
  end = endedAt ?? (isInterrupted ? lastSeenAt : now)
  elapsedMs = end − startedAt
  ```
  So a **closed** session computes to `endedAt`; a **healthy open** session computes to `now` (provisional, `isOpen=true`); an **open-but-stale (interrupted)** session computes to `lastSeenAt` — never to `now`, never to a fabricated end. The pure function therefore takes `nowMs` **and** `staleMs` (or an already-computed `isInterrupted` flag) so the cutoff decision is deterministic and testable without any wall-clock dependency. This resolves the earlier contradiction where `(endedAt ?? now)` would have over-counted an interrupted open session to `now` instead of `lastSeenAt`.
- `breakMs(session)` = sum over breaks where `endedAt != null` of `(endedAt − startedAt)`. An **open** break (null `endedAt`) contributes **0** to the persisted break total; for a live display an optional `provisionalBreakMs(session, now)` adds `now − openBreak.start` but is clearly marked and never persisted.
- `netMs` = `max(0, elapsedMs − breakMs)`.
- **Confidence** (consistent with the conditional cutoff above): `confirmed` only when `status==='completed'` with a clean `endedAt` (elapsed = `endedAt − startedAt`); `provisional` while open and NOT stale (`isOpen=true`, elapsed = `now − startedAt`); `estimated` with `isInterrupted=true` when `status==='interrupted'` OR (open & stale per §6) — in which case `elapsed`/`net` are computed to `lastSeenAt`, never to `now`, never to a fabricated end.

### 3.3 Multi-session-per-day aggregation (§23) & midnight split (§24)

- `aggregateDay(sessions, dateISO, tz)` — sums elapsed/break/net across all sessions **attributed to that local calendar date**, with no double counting (sessions don't overlap by construction — one open session per user — but the function still de-dupes by session id and clamps overlaps defensively).
- `splitAcrossLocalDates(session, tz)` — returns `[{ date, elapsedMs, breakMs, netMs }]`, splitting a midnight-crossing session at the local-midnight boundary(ies) **computed in the org timezone** using `Intl.DateTimeFormat` with `timeZone: tz` (no external tz library needed — the engine takes the IANA tz string and the browser/Node resolves local midnights). It never invents login/logout events; it only apportions the already-recorded span across dates. Breaks are apportioned to the date they fall in.
- The engine takes `tz` as a parameter (resolved by callers from `StoreSettings.timeZone`, default `Asia/Kolkata`), so the engine stays pure and testable with any tz.
- The engine also takes `staleMs` (the §6 staleness threshold constant) as a parameter wherever interrupted-detection matters (`elapsedMs`, `summarize`, `calendarCells`, the bucket builders), so the pure functions decide the interrupted cutoff deterministically from data — no wall-clock, no React, no DB. Callers pass the shared `STALE_MS` constant and a single `nowMs` captured once per render.

### 3.4 Report builders (shared by page + owner report + export — one source)

- `summarize(sessions, nowMs)` → `{ totalElapsedMs, totalBreakMs, totalNetMs, sessionCount, completedCount, interruptedCount, workdays }`.
- `weeklyBuckets` / `monthlyBuckets` → per-day and per-week aggregates.
- `calendarCells(sessions, monthRange, tz)` → per-date `{ date, netMs, hasRecord, hasInterrupted, isToday, isOpen, tone }` where `tone` ∈ `green|amber|gray|blue` is a **neutral activity indicator**: `gray` = no record, `blue` = today/in-progress, `amber` = recorded but short/high-break, `green` = recorded healthy. The engine returns the tone enum + the numbers; the UI maps tone→color and **always** shows a number/label too (color is never the sole signal; never an absence/leave judgment).

### 3.5 Test matrix (`work-session.test.ts`)

Deterministic, no DB/React, using fixed ISO timestamps and a fixed `nowMs`:
1. Single session, no breaks → elapsed = net.
2. **Worked example §23**: 09:00 start, breaks 11:00–11:15 & 14:00–14:30, 18:00 end → `elapsed=9h`, `break=45m`, `net=8h 15m` (exact assert).
3. Multiple sessions same day → aggregated day totals; no double count.
4. Multiple breaks summed; an open break contributes 0 to persisted break.
5. Open session → `isOpen`, `confidence='provisional'`, elapsed = now−start.
6. Midnight crossing (23:00–02:00) → split across two local dates in `Asia/Kolkata`; sum of split parts = whole; no fabricated events.
7. Interrupted session, two sub-cases, both asserting the cutoff is `lastSeenAt`, **not** `now`:
   (a) explicit `status='interrupted'` with `endedAt=null` → `isInterrupted`, `confidence='estimated'`, `elapsedMs === lastSeenAt − startedAt` (exact assert, with `nowMs` set well past `lastSeenAt` to prove it is NOT used);
   (b) `status='open'`, `endedAt=null`, `now − lastSeenAt > staleMs` (derived-interrupted per §6) → same result: `isInterrupted=true`, `elapsedMs === lastSeenAt − startedAt`, never `now − startedAt`.
8. Open & NOT stale (`now − lastSeenAt <= staleMs`) → `isOpen`, `confidence='provisional'`, `elapsedMs === now − startedAt` (proving the healthy-open path still uses `now`).
9. tz sensitivity: same UTC span splits differently under two IANA tz strings.
10. **Interrupted + midnight crossing (finding fix):** an open session `startedAt` 23:00 local, `lastSeenAt` 01:30 the next local day, with `nowMs` set far later (e.g. +12h) and `now − lastSeenAt > staleMs` so it is derived-interrupted. Assert `splitAcrossLocalDates` apportions the span **up to `lastSeenAt`** (the estimated end), **never to `now`**: the parts land on the two local dates (23:00→local-midnight on day 1, local-midnight→01:30 on day 2), and `sum(split parts) === lastSeenAt − startedAt` exactly (2h 30m), with no part referencing `now` and no fabricated logout event. This locks the exact spot where the midnight-split and interrupted-cutoff rules could silently conflict.

---

## 4. Work-session context, provider & lifecycle

### 4.1 Dual-mode context — `src/lib/work-session-context.tsx`

A `WorkSessionProvider` + `useWorkSession()` hook modeled on `leads-context.tsx` / `use-lead-kanban.ts`:
- Reads identity from `useSession()` (`id`, `branch`, `organization`) and `usePermissions()` (`currentUser`, `authReady`, `apiFetch`).
- **Supabase mode** (`isSupabaseConfigured && supabase`): all writes go through self-scoped API routes (below) using `apiFetch`; the current open session + today's data are read via a `GET /api/work-session`. Realtime keeps status fresh (§8).
- **Local mode**: an equivalent state machine persists to `localStorage` key `repairox-work-session::<staffId>` (array of `WorkSessionRecord`), replicating the guard logic (one open session, one open break) so the prototype behaves identically.

**Decision — local-mode timestamps + synchronous close at logout (finding fix).** Every op in `UseWorkSession` is typed `() => Promise<void>` for a uniform surface, but in **local mode** each op (including `endWork`) performs its `localStorage` mutation **synchronously** and then returns an already-resolved promise — nothing is `await`ed, so at logout the completed-session write is flushed to `localStorage` **before** the promise resolves, and before `logout()` clears identity. Consequently the §4.4 `Promise.race([endWork, timeout])` resolves on the `endWork` branch effectively instantly and the 2.5s timeout **never fires** in local mode. Because local/demo mode has no server `now()`, it **stamps all timestamps (`startedAt`, break `startedAt`/`endedAt`, `endedAt`, `lastSeenAt`) from the client clock** — this is the **one documented exception to NFR §46** ("the server never trusts client-supplied time"): the authoritative-server-time rule applies to **Supabase mode only**; local mode is a prototype/demo fallback where the client clock is the only clock available. The engine math (§3) is identical in both modes — it operates on whatever ISO timestamps the record carries.

Exposed surface:
```ts
interface UseWorkSession {
  hydrated: boolean;
  status: "working" | "on_break" | "logged_out" | "interrupted";
  openSession: WorkSessionRecord | null;
  todaySessions: WorkSessionRecord[];
  startWork: () => Promise<void>;        // idempotent (auto-start uses this)
  startBreak: () => Promise<void>;
  endBreak: () => Promise<void>;
  endWork: (reason?: "logout") => Promise<void>;  // called before auth logout
  // read helpers for pages (self scope)
  rangeSessions: (fromISO: string, toISO: string) => Promise<WorkSessionRecord[]>;
}
```

**Decision — provider placement.** Mount `WorkSessionProvider` **near `LeadsProvider`** in `providers.tsx` (inside `StoreSettingsProvider` so it can read the org timezone, outside the lead/field data providers it doesn't depend on). It needs only identity + permissions + store settings. Order: `… StoreSettingsProvider → WorkSessionProvider → CatalogProvider → …`.

### 4.2 API routes (Supabase mode, self-scoped)

New routes under `src/app/api/work-session/`:
- **`POST /api/work-session/start`** — idempotent auto-start. `requireUser(req)`; resolve the caller's `staff` row (id/org/branch). Query for an existing open session (`ended_at is null`). If found → return it (resume). Else INSERT a new session; on `23505` (unique violation from a concurrent race) → re-select the now-existing open session and return it (resume). Returns the open session.
- **`POST /api/work-session/break/start`** — insert a break for the caller's open session; relies on the guard + partial index. On `23505`/`23514` return a friendly error.
- **`POST /api/work-session/break/end`** — close the caller's active break (`update … set ended_at=now() where session_id=<open session> and ended_at is null`).
- **`POST /api/work-session/end`** — close the open session: in one logical step close any active break at `ended_at=now()`, then set the session `ended_at=now(), status='completed', end_reason='logout'`. Returns the completed session.
- **`GET /api/work-session`** — the caller's current open session (if any) + today's sessions (self scope).
- **`POST /api/work-session/touch`** — the liveness heartbeat that keeps `last_seen_at` fresh for interrupted detection (§5). `requireUser(req)`; the body is empty. It runs exactly:
  ```sql
  update public.work_sessions set last_seen_at = now()
   where staff_id = <caller staff id> and ended_at is null;
  ```
  **Decision — why this exact shape (finding fix):**
  - **Self-scoped, no permission key** — like the other self routes, it only ever touches the caller's own rows.
  - **Guaranteed no-op on a completed/absent session** — the `ended_at is null` predicate means a touch after logout (or when the user has no open session) updates **zero rows**. It therefore **never hits the `work_session_locked` guard** (that guard only fires on an UPDATE that changes a row whose `ended_at` is already set; a WHERE that matches no row performs no UPDATE at all). So a stale heartbeat racing a just-completed logout cannot resurrect or alter the completed session, and the client never sees a 42501 to swallow.
  - **Returns `200` with `{ session: <open session> | null }`** — a touch with no open session is a success returning `null`, **not** an error toast.
  - **Client-debounced** to one call per `HEARTBEAT_MS` (~60s), driven by the same activity signal as the presence tracker (§5) — never per mouse-move / per render.
  - **No realtime churn (REQUIRED, not optional)** — the `last_seen_at`/`updated_at` bump would otherwise fire the `postgres_changes` subscription (§8) every 60s for the touching user. The realtime handler **MUST compare `old`→`new` and, when the only changed columns are `last_seen_at`/`updated_at`, patch `last_seen_at` locally WITHOUT a refetch** — so the heartbeat produces no refetch cycle and no live-indicator flicker. This heartbeat-only suppression is **mandatory**; it is not a default-with-fallback. (The pure engine math (§3) is unaffected either way — this rule is purely about avoiding avoidable refetch churn.)

All six use `requireUser` and scope every query to `user.id → staff.id`; the server stamps all timestamps with `now()` (never trusting a client-supplied time) per NFR §46. These mirror `/api/account/sessions` structure exactly.

A separate **owner** route:
- **`POST /api/work-session/report`** (or `GET` with query params) — `requirePermission(req, [team/all keys])`; returns **raw, scope-constrained session + break rows** (NOT pre-aggregated counts/durations) for the requested agent filter + date range + store filter. The export reads **this same route**, so export == on-screen by construction.

  **Decision — service-role client + a hand-written scope filter that provably reproduces `auth_work_sessions_see` (finding fix).** `requirePermission` (and `requireUser`) return a **service-role admin client that BYPASSES RLS** (verified: `createAdminClient()` in `app/src/lib/api-auth.ts` / `app/src/lib/account-security.ts`). The repo has **no user-token-bound, RLS-active Supabase client factory** — the browser client (`app/src/lib/supabase.ts`) uses the anon key, and every server route uses the service-role admin client — so the "just let RLS do the scoping" option is **not available** without inventing new infrastructure, and the existing self routes already set the precedent of **re-filtering by `staff_id` in application code** over the admin client. This route therefore **adopts the service-role client and reproduces the RLS predicate by hand**, spelled out below so the filter is provably equivalent to `auth_work_sessions_see` (§1.5).

  **How the route resolves the caller's scope server-side.** `staff_store_ids(uuid)` is `revoke all … from public, anon, authenticated` (migration 0049) and is **not callable as the user**, so the route cannot RPC it. Instead it resolves scope with the **admin client**, mirroring the existing admin-client routes:
  1. From the verified bearer user, read the caller's own `staff` row → `callerStaffId`, `callerOrgId = staff.organization_id`, `callerBranchId = staff.branch_id` (may be null).
  2. Resolve cross-branch scope from the caller's role grants: `callerCanCrossBranch = permissions.has('multi_store_access')` — the `permissions` Set already returned by `requirePermission` (plus the implicit `*`/`full_access`/owner-role path it already honors). This mirrors the DB `auth_can_cross_branch()` (= `multi_store_access`, migrations 0030/0034/0039).
  3. Determine the caller's capability tier from the same `permissions` Set: `callerHasOwnerKey = permissions.has(any of ['work_sessions_view_team','work_sessions_view_all','manage_attendance','view_sales_reports','manage_reports'])` — the **exact same array** as the RLS owner branch (§1.5) and `CAP.workSession.viewTeam/viewAll` (§2.4). (A caller that reached this route already passed `requirePermission` with the team/all keys, so this is the eligibility already established; it is re-derived here only to build the row predicate.)

  **The exact scope predicate the query applies** (the hand-written mirror of `auth_work_sessions_see(staff_id, organization_id, branch_id)`):

  ```
  organization_id = callerOrgId
  AND (
    staff_id = callerStaffId                              -- own records, always visible
    OR (
      callerHasOwnerKey                                   -- team/all/reports tier
      AND (                                               -- branch-visible test, INCLUDING null-branch rows:
        callerCanCrossBranch                              --   cross-branch scope sees every store
        OR branch_id = callerBranchId                     --   same store
        OR branch_id IS NULL                              --   org-wide / multi-store staff rows (§1.5 null-branch rule)
      )
    )
  )
  ```

  This is the **term-for-term** JS/SQL reproduction of `auth_work_sessions_see`: `auth_member_of_org` → `organization_id = callerOrgId`; the own-record branch → `staff_id = callerStaffId`; the owner branch → `callerHasOwnerKey` AND `auth_branch_visible(branch_id)` where `auth_branch_visible(b) = auth_can_cross_branch() or b is null or b = auth_branch_id()` is reproduced as `callerCanCrossBranch OR branch_id IS NULL OR branch_id = callerBranchId`. The **null-branch rule (§1.5)** is reproduced exactly (`branch_id IS NULL` is visible to any owner-key holder in the org), so the route does not diverge from RLS on org-wide rows.

  **On top of this scope predicate** the route then applies the request filters: the **requested agent set is intersected with the eligible active Sales-Agent directory** `lead_sales_agents(branchId)` (migration 0049, `grant execute … to authenticated` — so the route resolves the eligible set and restricts the returned `staff_id`s to it; requirement §34), plus the **date-range** filter on `started_at` and the **store** filter from `StoreMultiSelect`. The break rows for the returned sessions are fetched by `session_id IN (…)` (their denormalized `branch_id` matches the parent, §1.1, so they satisfy the same predicate).

  **Lockstep (MANDATORY).** This hand-written predicate **duplicates `auth_work_sessions_see` and MUST be kept in lockstep with it** — any change to the RLS helper's org/self/branch/owner-key logic (including the owner-key array and the null-branch rule) MUST be mirrored here in the same change, and vice-versa. This lockstep is recorded in the §11 steering lockstep section alongside the CAP↔RLS note.

  **Decision — ALL duration/interrupted derivation runs through the one pure engine on the client, with a single `nowMs`/`STALE_MS` per report render (finding fix).** The server does **no** elapsed/net/interrupted math — it returns rows only. The owner-report page captures **one `nowMs` once per report render** and imports the shared `STALE_MS` constant, then feeds every row through the exact same pure engine (§3) that the summary cards, the daily table, AND the export row-builder consume. Because the on-screen owner report and the HR/payroll export read from **this same route** and run through that single engine pass over the same rows with the same `nowMs`/`STALE_MS`, the **export "interrupted session count" and totals are provably identical to the on-screen values** (acceptance §12/§16) — there is exactly one place that computes interrupted-ness and durations (the engine), never a second server copy that could diverge. (If a future very-large-org requirement forces server-side aggregation, the server must capture **one `now()` per request** and import the **same `STALE_MS` constant** used by the engine, so the two implementations still produce byte-identical counts; this phase does not do that.)
- **`POST /api/work-session/correct`** — `requirePermission(req, CAP.workSession.correct keys)`; performs an append-only correction: captures the current session+breaks into a `work_session_events.previous` snapshot, applies the new values, logs a `correction` event with mandatory `reason` and `actor_staff_id`. Never destroys original values.

### 4.3 Auto-start hook — `useWorkSessionAutoStart()`

A small app-wide hook (in `work-session-context.tsx` or a sibling) mounted **once in `app-shell.tsx`** right beside `useSessionTracker()` and `useSalesPresenceTracker(...)`, guarded by `authReady && currentUser`. On mount (and on reconnect) it calls `startWork()` which is idempotent (open-session check → guarded create → unique-index resume). A `useRef` single-flight guard prevents duplicate in-flight calls within a tab; the DB partial unique index prevents duplicates across tabs/refreshes/concurrency (§5 requirement B/§8). It does **not** create a session on every render — it runs once per auth session and relies on the resume path thereafter.

**Idempotency summary (the three layers):** (1) in-tab `useRef` single-flight; (2) server open-session SELECT before INSERT; (3) `work_sessions_one_open_per_staff` partial unique index catching any race → resume. This satisfies "refresh / route change / multiple tabs / reconnect never create a duplicate".

### 4.4 Logout integration (close session BEFORE auth logout)

Verified: `topbar.tsx` `handleLogout()` is currently **synchronous** (`logout(); router.push("/login");`) and is invoked from a non-async JSX handler `onClick={() => { handleLogout(); close(); }}`. The change must (a) make `handleLogout` `async`, (b) guard `endWork` so a hanging or rejecting request can never trap the user at logout, and (c) keep `close()` firing immediately. Exact shape:

```tsx
async function handleLogout() {
  // Close the work session BEFORE auth logout, but never block logout on it.
  try {
    await Promise.race([
      endWork("logout"),
      new Promise((resolve) => setTimeout(resolve, 2500)), // bounded: don't hang on a dead network
    ]);
  } catch {
    // swallow — a failed close is recovered as an interrupted session (§6)
  }
  logout();
  router.push("/login");
}
// Caller stays fire-and-forget so the dropdown closes immediately:
onClick={() => { handleLogout(); close(); }}
```

`endWork` closes any open break and the session at the same server timestamp (in **local mode** it closes synchronously and stamps the client clock — see the §4.1 Decision — so the `Promise.race` resolves immediately and the timeout never fires); `logout()` + `router.push("/login")` ALWAYS run (whether `endWork` resolves, rejects, or times out), so the user is never trapped. If `endWork` never reached the server, that session is later detected as interrupted (§6). The caller remains `() => { handleLogout(); close(); }` — `close()` runs synchronously (the dropdown closes at once) while `handleLogout` continues its async work in the background; the handler is intentionally **not** `await`ed inside the JSX (JSX event handlers aren't async). This is the only change to the logout path; auth/login/secure-logout themselves are untouched (Out of Scope respected).

### 4.5 Work controls in the existing nav (no redesign)

- **`sales-agents-online.tsx`**: for the **current user's** row, show a small Work Status chip (Working / On Break / Logged Out / Needs Review) and, below the roster or in the current-user row, the state-appropriate actions: Working → `Start Break` + `Productivity`; On Break → `End Break / Resume Work` + `Productivity`; Logged-out-of-session → `Start Work`. These read `useWorkSession()`. The roster itself and the online count are **unchanged**; the Work Status chip is clearly separate from the green online dot (presence). For authorized owners, each roster row MAY show a non-identifying Work Status chip read from the owner report data — but presence (online dot) and work status (chip) remain visually and semantically distinct.
- **`topbar.tsx` profile menu**: add a `MenuLabel` showing current Work Status + the same context actions + a "Productivity" `MenuItem` linking to `/account/productivity` (the settled My Productivity route — see §6), above the existing Log out item. The existing "My Account" and "Log out" items stay.

### 4.6 Friendly error mapping

The context maps PG error codes from the guards to user-facing toasts (reusing `@/components/ui/toaster`): `23505` on start → silent resume (no error); `work_break_no_open_session` → "Start work before taking a break"; unique break violation (`23505`) → "You're already on a break"; `work_break_not_active` → "No active break to end"; `work_session_locked` → "This session is completed and can't be changed." The UI also disables actions that aren't valid for the current status (optimistic + reconciled with server result).

---

## 5. Interrupted / stale session detection (§6, §25)

**Decision — reuse the presence heartbeat as the liveness signal; detect staleness at read time, not with a cron.**

- The session's `last_seen_at` is touched whenever the app-wide presence tracker marks the user active (the auto-start hook subscribes to the same activity signal and calls a lightweight `touch` — debounced to once per `HEARTBEAT_MS`/60s via the existing session-tracker cadence, not on every mouse move) through the `POST /api/work-session/touch` route **fully specified in §4.2** (self-scoped `requireUser`; `update … where staff_id=<caller> and ended_at is null` so it is a guaranteed no-op on a completed/absent session and never trips the locked guard; returns 200/`null` when there is no open session; realtime ignores `last_seen_at`-only changes). This reuses the presence/heartbeat architecture rather than inventing a new one. In **local mode** the equivalent is an in-memory/localStorage write of `lastSeenAt` on the same cadence (no network).
- **Staleness threshold** = a tunable **code constant** `STALE_MS` (default e.g. 30 min, chosen > presence `IDLE_MS` of 5 min so a normal idle doesn't flip to interrupted). It is a module-level constant in this phase, **not** an admin setting — there is no settings UI for it (that would be a later HRM enhancement). A session is **interrupted** when it is still open (`ended_at is null`) and `now − last_seen_at > STALE_MS`. The constant is passed into the pure engine (§3) so detection stays testable.
- Detection is **derived at read time** by the engine/report builders (`status` stays `'open'` in the row; the engine computes `isInterrupted` from `last_seen_at` vs `now`). The engine never fabricates a clean end; interrupted durations are shown as **estimated** (computed to `last_seen_at`), clearly distinguished from **confirmed**. This satisfies "flag, don't fabricate".
- **Decision — no process writes `status='interrupted'` or `end_reason='auto_close'` in this phase (finding fix).** Interrupted-ness is **purely read-time derived**; there is **no cron, no background job, and no server actor** that mutates an open row into `'interrupted'`/`'auto_close'`. The `'interrupted'` status value and the `'auto_close'` end-reason/event-kind are present in the CHECK constraints and the enum **reserved for a future optional cleanup job** — which, when built, would run under the **service role** and be gated by `work_sessions_correct` (it is a correction-class write, auditable via a `work_session_events` `auto_close` row). Keeping the enum values forward-compatible costs nothing and avoids a later migration; but no code in this phase emits them, so there is no unspecified writer. (A completed/`'logout'` session is the only terminal state any end-user or logout path produces.)
- Offline/reconnect (NFR §48): a dropped connection just stops touching `last_seen_at`; on reconnect the auto-start hook's resume path finds the same open session (no duplicate) and resumes touching. Local mode behaves equivalently (the localStorage record keeps its `lastSeenAt`).

---

## 6. My Productivity page (self-service)

**Route** `src/app/(app)/account/productivity/page.tsx` (verified: `/account` already exists at `src/app/(app)/account/page.tsx`, so this is a valid self-service sub-route). **Decision — place it at `/account/productivity`** (a sub-route of the existing `/account` area so it inherits the "every authenticated user manages their own" pattern and needs no new top-level nav), reached from the Online Users dropdown + profile-menu "Productivity" action. (A nav item is optional and omitted to avoid cluttering the Leads nav; the entry points in §4.5 are sufficient per the codebase notes.) Gated so any user with `CAP.workSession.viewOwn` can view **their own** records; the data is always self-scoped (RLS + the self-service API).

Structure (view-detail-pages standard, shared `detail-page` primitives):
- **`DetailHero`** header: title "My Productivity", subtitle, current Work Status chip, and a live-indicator for an open session.
- **Range control**: a single connected `SegmentedTabs` — Daily / Weekly / Monthly + a Custom option that opens the shared `DateTimeField`/date picker (never detached pills).
- **TODAY KPI cards** via `SummaryCard`: Total Session (elapsed), Total Break, Net Working, Session count, and — if an open session exists — a **display-only live timer** (`now − start`, ticking in the component only) clearly labeled "in progress". The timer is presentation only; it never writes or determines any persisted duration (requirement §28).
- **Calendar view** (`DetailSection`, accent `violet`): month grid where each cell uses the engine's `tone` (green/amber/gray/blue) **plus a number/label** (net hours / "—"). A legend states the colors are neutral activity indicators, never absence/leave judgments.
- **Daily timeline** (`DetailSection`): the day's sessions + break intervals in order, each with elapsed/break/net and a confirmed-vs-estimated badge for interrupted sessions.
- **Weekly / Monthly summaries** (`DetailSection`): per-day and per-week totals + session/interrupted counts, from the engine's bucket builders.
- Wrap sections in `Reveal` (honors `prefers-reduced-motion`); use `PinnedRail` only if a utility column is warranted (optional for this page).

All values come from `useWorkSession().rangeSessions(...)` fed through the pure engine with `StoreSettings.timeZone`. No live timer feeds any report number.

---

## 7. Owner / manager Sales Agent Productivity report (no impersonation)

**Route** `src/app/(app)/leads/productivity/page.tsx` (Leads workspace, "PERFORMANCE" nav group).

**Decision — surfacing the nav item requires TWO coordinated edits in `src/lib/mock-data.ts`, not one.** Verified in `sidebar.tsx` (lines ~317–318, ~396): the sidebar builds `itemMap = Object.fromEntries(navItems.map((n) => [n.href, n]))` and then, per group, renders `group.items.map((href) => itemMap[href]).filter(visibleItem)`. So the flat `navItems` array is the only place that carries a `permission`, while each `navGroups.<workspace>` group's `items` is an **href whitelist** that decides what actually renders in that group. Adding only the flat definition (as the previous draft implied) would leave the owner report invisible because `/leads/productivity` is not in the PERFORMANCE group's `items`. Both edits are mandatory:

```ts
// EDIT 1 — add to the flat `navItems` array (this carries the permission gate):
{ href: "/leads/productivity", label: "Agent Productivity", icon: "Clock",
  permission: ["work_sessions_view_team", "work_sessions_view_all", "manage_attendance", "view_sales_reports", "manage_reports"] },

// EDIT 2 — add the href to the PERFORMANCE group's items whitelist in `navGroups.leads`
// (currently ["/leads/performance", "/leads/intelligence", "/leads/intelligence/agents"]):
{ label: "PERFORMANCE", items: ["/leads/performance", "/leads/intelligence", "/leads/intelligence/agents", "/leads/productivity"] },
```

The item appears only when `visibleItem` passes — i.e. the role holds one of the `permission` keys (`can()` honors `full_access`/`*`), so it is correctly gated by `CAP.workSession.viewTeam`/`viewAll` and hidden from view-tier/own-only users. (There is no `expandableNavGroups` involvement — PERFORMANCE is a flat group, not an ADMINISTRATION expandable; the earlier §6 reference to `expandableNavGroups` was incorrect and is removed.) Gated by `CAP.workSession.viewTeam`/`viewAll`. The report is **analysis only**: the selected agent is an analytical subject; the caller's session/user/role/grants/store scope never change (modeled on Agent Intelligence, which treats the agent id as a subject, not impersonation).

Structure:
- **Filters** via `TableUtilityBar`: left slot = the **agent selector** (All + specific agent) sourced from the eligibility RPC `lead_sales_agents(branchId)` (never a hardcoded/role list, never all staff); right slot = `StoreMultiSelect` (permission-aware; static chip for single-store users) + a shared date-range picker. All filters combine (AND) and apply to every panel. Filter panel uses `rox-filter` (close × + per-filter ×) if a popover is used.
- **Owner summary** cards (`SummaryCard`): total net hours (**sum**), average net per workday (**avg**), sessions (**count**), interrupted sessions (**count**) — each explicitly labeled sum/avg/count (never an average shown as a total).
- **Daily comparison table** on the shared `rox-table` primitives (frozen `bg-[#D6DDFB]` brand header via `useRoxStickyHeader`, `h-[68px]`/`py-4` rows, `border-t border-zinc-500`, detached `<Pagination>`, `StoreContextCell` Store column when multi-store): one row per agent per day (or per agent for the range). A **View Details** action expands/navigates to the per-agent breakdown **within the owner's own session** (no identity change).
- All data from `POST /api/work-session/report`, which returns **raw scope-constrained rows** (gated + scope-constrained server-side). The page captures **one `nowMs` per render** + the shared `STALE_MS` and feeds those rows through the **single pure engine** (§3) for the summary cards, the daily table, and the export row-builder alike — so on-screen and exported interrupted-counts/totals are provably identical (§4.2 Decision; acceptance §12/§16). No duration or interrupted-ness is computed on the server.

---

## 8. Realtime work-status propagation

**Decision — reuse the existing Supabase Realtime pattern (as leads-context does), on a dedicated postgres-changes subscription, NOT the presence channel.** Work Status must stay separate from presence, so we do **not** publish work status into `sales-agents-presence`. Instead:
- In Supabase mode, `WorkSessionProvider` subscribes to postgres changes **scoped to the current user's own rows** (`filter: staff_id=eq.<staffId>`) on `work_sessions` / `work_session_breaks` — the same `supabase.channel(...).on('postgres_changes', …)` approach the lead/deal contexts use. On an event it refetches/patches the open session so the current user's Work Status chip and the My Productivity live indicator update without a manual refresh (requirement §50, NFR §48). **Heartbeat-only events MUST be suppressed (required, not optional):** the handler **MUST compare `old`→`new`, and when an UPDATE's only changed columns are `last_seen_at`/`updated_at` (the §4.2 `touch` write), patch `last_seen_at` locally and NOT refetch** — so the 60s heartbeat produces no refetch cycle or indicator flicker (finding fix). This is the only live-update requirement (§50 is explicitly about the *current user's own* status).
- **Decision — the owner report does NOT rely on an RLS-scoped broadcast.** Supabase Realtime `postgres_changes` does not automatically mirror a table's SELECT RLS policies into the broadcast stream (it requires explicit Realtime publication + Realtime-RLS configuration, a known caveat), so claiming "a broader subscription scoped by RLS" for owners would be unreliable. Instead the owner `Sales Agent Productivity` report refreshes via **refetch-on-filter-change** (re-querying `POST /api/work-session/report`, which is already gated + scope-constrained server-side) plus an optional manual Refresh affordance. Owner-live is a nice-to-have, not a requirement; if it is added later, it must first configure the Realtime publication/RLS for these tables and still read through the gated API as the authority — never trust the raw broadcast for scope.
- In local mode, the `storage` event + a short poll (mirroring the presence local fallback) keep a single browser's tabs in sync.
- The existing presence roster/count behavior is untouched; the only addition is a separate work-status chip fed by this new subscription.

---

## 9. HR / payroll export (Excel primary + CSV)

Reuses `src/lib/csv-utils.ts` and the mandatory spreadsheet standard. **One shared row-builder** in the report module builds the rows once; both export handlers consume it.

- Row builder `buildAttendanceExportRows(agents, sessionsByAgent, range, tz, nowMs, staleMs)` → `{ headers, rows }`. It is **not** a separate calculation — it consumes the **same pure-engine summary** (`summarize(...)`) over the **same raw rows** with the **same `nowMs`/`staleMs`** the on-screen owner report used for that render (§4.2/§7 Decision), guaranteeing the exported counts match the screen exactly. One row per Sales Agent for the selected period (default monthly): **Sales Agent name, user/staff id, store, workdays with sessions, total session (elapsed), total break, net productive hours** (both an `"Hh Mm"` display column **and** a decimal-hours numeric column), **completed session count, interrupted session count** — all from the canonical persisted records via the engine (never the live UI timer, never fabricated).
- Excel handler (`downloadXLSX` is `async` — it lazy-loads SheetJS — so it must be awaited inside an async handler with a catch that toasts on load failure, never fire-and-forget):
  ```ts
  async function onExcel() {
    try { await downloadXLSX("agent-productivity-<period>.xlsx", headers, rows, "Productivity"); }
    catch { toast("Could not generate the Excel file. Please try again."); }
  }
  ```
- CSV handler: `downloadCSV("agent-productivity-<period>.csv", toCSV(headers, rows))` (synchronous, no await needed).
- Rendered as the canonical two-item `Dropdown` (`@/components/ui/dropdown`): `Excel (.xlsx)` (icon `FileSpreadsheet`) then `CSV (.csv)` (icon `FileText`). Never a raw `new Blob(...)`, never CSV-only.
- Honors the current agent filter (All/specific), date range, store filter; gated by `CAP.workSession.viewAll` + RLS exactly like the on-screen report. A note in the UI + steering states this is attendance/productivity data only, **not** official leave/payroll data.

---

## 10. Validation / error handling summary (per operation)

| Operation | Failure conditions | Recoverable? | Caller receives | Logged |
|---|---|---|---|---|
| Auto-start | concurrent race (23505) | yes — resume | the existing open session | `session_start` event (once) |
| Auto-start | server/network down | yes | retry on next mount/reconnect; status unknown shown as last-known | no |
| Start break | no open session (23514) | yes | "Start work before a break" | — |
| Start break | already on break (23505) | yes | "You're already on a break" | — |
| End break | no active break | yes | "No active break to end" | — |
| End work (logout) | network fails before close | yes | logout still proceeds; session later flagged interrupted | event on success only |
| Any write on completed session (non-corrector) | locked (42501) | no | "This session is completed and can't be changed" | — |
| Correction (corrector) | missing reason | no (reject) | "A reason is required" | `correction` event with `previous` |
| Owner report/export | lacks capability | no | 403 | — |

Timestamps are always server-stamped (`now()`); the client never supplies the authoritative time. All duration math is in the pure engine (testable in isolation).

---

## 11. Steering doc plan

Add a permanent steering file at the **repo root** `/.kiro/steering/work-session-productivity.md` (matching the existing steering location, NOT under `app/`). It will codify, as repository-defined rules:
1. **Three concepts stay separate** — Online Presence (existing presence channel), Work Status (derived from the open session), Work Session (persisted records). Online ≠ Working.
2. Work records are **keyed by `staff.id`** + org + branch; never name/role; HRM-ready (employee-keyed, not Sales-Agent-only).
3. **Server-authoritative timestamps**; durations from the pure engine (`src/lib/work-session.ts`), never a frontend timer; the live timer is display-only.
4. **One open session per user / one open break per session**, enforced by partial unique indexes + guard triggers (backend is the source of truth).
5. **Auto-start is idempotent**; logout closes the session (and any open break) **before** auth logout.
6. **Interrupted = flagged + estimated, never fabricated**; detection reuses the presence heartbeat + a staleness threshold.
7. **Permission keys** (`work_sessions_view_own/_team/_all/_correct`) registered end-to-end (union + group + `work_session` matrix module + `CAP.workSession` + `requirePermission` + RLS), OFF by default except owner roles (`full_access`); Sales Agents get View-Own. **Two lockstep invariants** that MUST be enforced together on any change: (a) **CAP ↔ RLS** — the `CAP.workSession.viewTeam/viewAll` fallback arrays and the `auth_has_any([...])` owner-key array inside `auth_work_sessions_see` MUST stay identical (drop/add `view_sales_reports`/`manage_reports` from both together); and (b) **owner-report route ↔ RLS** — the hand-written scope predicate in `POST /api/work-session/report` (§4.2) is a service-role (RLS-bypassing) reproduction of `auth_work_sessions_see`, so any change to that helper's org/self/branch-visible(incl. null-branch)/owner-key logic MUST be mirrored in the route's predicate in the same change, and vice-versa. The owner-report route and RLS must never diverge.
8. **Corrections are append-only + audited** (reason, original values, editor, timestamp) and gated by `work_sessions_correct`.
9. **Owner report is analysis only** (no impersonation); agent selector from the eligibility RPC; store scope independently enforced.
10. **Export** follows the spreadsheet standard (Excel primary + CSV, one row-builder, two-item Dropdown) and is **attendance/productivity data only — not official leave/payroll data**.
11. **Out of scope**: leave/holiday/shift/overtime/payroll computation, auth replacement, second presence/employee/permission system, geofencing/biometric.
Reference implementations will point to the engine, context, migration 0075, the two pages, and the export row-builder.

---

## Testability notes

- **Unit-testable without a frontend timer**: the entire engine (`work-session.ts`) is pure and covered by `work-session.test.ts` (§3.5), including the exact 9h/45m/8h15m worked example, midnight split, multi-session aggregation, and interrupted/estimated cases. Run via `npm run attendance:test` (`tsx --test`).
- **Integration-testable**: the state-machine guards + partial indexes can be exercised with a `scripts/*.mjs` verifier (mirroring `leads:verify`) running the invalid transitions as a real user inside a rolled-back transaction — recommended for the build/validation phase (not required by this design, but the schema supports it).
- Final gate: `npx tsc --noEmit` and `npm run build` from `/Users/apple/Desktop/Reapirox dummy2/app`, plus `npm run attendance:test`.

---

## Open assumptions carried forward (explicit, low-risk)

- `staff.id` is the stable identity shared by `useSession().id` / presence `PresenceMeta.id` / `SalesAgent.id` (confirmed in the codebase notes and `use-sales-presence.ts`).
- Org timezone = `StoreSettings.timeZone` (confirmed present, default `Asia/Kolkata`); the engine takes the IANA string as a parameter so it stays pure.
- `STALE_MS` default (e.g. 30 min) is a tunable **code constant** chosen > presence `IDLE_MS` (5 min); it is not an admin setting in this phase (no settings UI) and is not a schema concern.
- The My Productivity route lives at `/account/productivity`; the owner report at `/leads/productivity`. If the implementer prefers a dedicated top-level nav item for My Productivity, it can be added to `mock-data.ts` gated by `work_sessions_view_own` without any other change.

---

## Responses to design review findings — revision pass 1

All 11 findings from the first review were resolved. Each was verified against the live repository before editing.

- **#1 [HIGH] Owner nav item not wired (missing navGroups href-whitelist edit) — ADDRESSED.** §7 now specifies BOTH mandatory edits in `mock-data.ts`: (1) the flat `navItems` definition carrying the `permission` array, and (2) adding `/leads/productivity` to the PERFORMANCE group's `items` whitelist in `navGroups.leads`. Verified against `sidebar.tsx` (`itemMap` from `navItems` + per-group `items.map(href → itemMap[href])`) and `mock-data.ts` line ~1922. The incorrect `expandableNavGroups` reference was removed (PERFORMANCE is a flat group).

- **#2 [HIGH] Break RLS store-scope not expressible (no `branch_id`) — ADDRESSED via option (a).** §1.1 adds a denormalized `branch_id` to `work_session_breaks` (stamped by the guard from the parent session, §1.3), with an explicit Decision note. §1.5 is rewritten to give full, concrete SQL for all SELECT and write policies, with every table reusing the identical `auth_work_sessions_see(staff_id, organization_id, branch_id)` predicate — no parent-session subquery, no non-existent-column hazard.

- **#3 [MEDIUM] Corrector UPDATE crosses store scope — ADDRESSED.** The corrector branch on both `work_sessions_upd` and `work_session_breaks_upd` is now `auth_member_of_org(organization_id) and auth_branch_visible(branch_id) and auth_has_any(['work_sessions_correct'])`, mirrored in USING and WITH CHECK (written out as SQL in §1.5).

- **#4 [MEDIUM] Reports-capability cross-module implication unstated — ADDRESSED (kept + documented).** §2.4 adds a Decision explaining that `view_sales_reports`/`manage_reports` holders intentionally inherit team/all productivity visibility as a coarse fallback (matching the `auth_lead_see_all` precedent), why this does not violate "owner access OFF by default," and the explicit lockstep instruction to drop both keys from CAP+RLS together if the policy ever changes.

- **#5 [MEDIUM] Logout async signature + failure guard — ADDRESSED.** §4.4 now gives the concrete `async handleLogout()` with `Promise.race([endWork("logout"), timeout])` inside `try/catch`, always running `logout(); router.push("/login")`, and confirms the caller stays `() => { handleLogout(); close(); }` (fire-and-forget so `close()` runs immediately). Verified `topbar.tsx` is currently synchronous.

- **#6 [MEDIUM] `elapsedMs` computed to `now` for interrupted-open — ADDRESSED.** §3.2 replaces `(endedAt ?? now)` with the conditional `end = endedAt ?? (isInterrupted ? lastSeenAt : now)`, passes `staleMs`/`isInterrupted` into the pure engine, and makes the confidence note consistent. §3.5 test 7 now asserts `elapsedMs === lastSeenAt − startedAt` for both explicit and derived interrupted cases (with `nowMs` set past `lastSeenAt`), and new test 8 asserts the healthy-open path still uses `now`.

- **#7 [NIT] `downloadXLSX` not awaited — ADDRESSED.** §9 shows an `async onExcel()` that `await`s `downloadXLSX` inside `try/catch` with a toast on SheetJS load failure. Verified `downloadXLSX` is `export async function`.

- **#8 [NIT] events FK on-delete unstated — ADDRESSED.** §1.1 events table now specifies `session_id on delete set null`, `staff_id on delete restrict`, `actor_staff_id on delete set null`, with a Decision explaining the audit-preservation intent.

- **#9 [NIT] `STALE_MS` "configurable" overstated — ADDRESSED.** §5 and the carried-forward assumptions reword it as a tunable **code constant** with no settings UI this phase.

- **#10 [NIT] Owner realtime "RLS-scoped" claim — ADDRESSED.** §8 scopes the realtime subscription to the current user's own rows (`staff_id=eq.<staffId>`), and a Decision states the owner report refreshes via refetch-on-filter-change through the gated API rather than a broadcast, noting the Realtime publication/RLS prerequisite if owner-live is added later.

- **#11 [NIT] My Productivity ellipsis path — ADDRESSED.** §6 writes the concrete `src/app/(app)/account/productivity/page.tsx`, and the §4.5 menu reference now points to §6 (not the earlier incorrect §7).

---

## Responses to design review findings — revision pass 2

Verdict `CHANGES_REQUESTED` (5 MEDIUM + 4 NIT). All 9 findings resolved. The pass-2 review confirmed every repository claim in the design is accurate and all 11 pass-1 fixes still hold; these 9 items were specification gaps, each closed below. Codebase facts underpinning the fixes were re-verified against live source before editing.

- **#1 [MEDIUM] Null-`branch_id` sessions visible org-wide via `auth_branch_visible(null)=true` — ADDRESSED via option (a), with §1.1 ↔ §1.5 made consistent.** Verified against live source: `auth_branch_visible(b) = auth_can_cross_branch() or b is null or b = auth_branch_id()` (migration 0001), and **every** existing per-store table (`leads`, `quotations`, `customers`, …) uses `branch_id default auth_branch_id()` (nullable) under the identical gate. §1.1 now declares `branch_id default auth_branch_id()`, **nullable by design**, immutable after creation. §1.5 adds an explicit **Null-branch visibility** decision: a null-branch session is **org-wide productivity visible only to org members holding a team/all/reports key** (never a plain Sales Agent, who sees only own records), exactly matching how org-wide leads behave. The over-claim of "strict store isolation for all rows" is corrected to "store-isolated for branch-stamped rows; org-wide for null-branch rows, by the same rule as every other RepairOX table."

- **#2 [MEDIUM] Break RLS/guard division of responsibility + WITH-CHECK ordering unstated — ADDRESSED.** §1.3 adds a Decision stating Postgres runs the BEFORE guard **first**, then evaluates RLS `WITH CHECK` on the **post-trigger** row — so the guard-stamped `staff_id`/`org`/`branch`/validated `session_id` are what the policy sees. It states the explicit non-overlapping split: **RLS** = org/store + self-write boundary; **the guard alone** enforces parent-session ownership + open-state (RLS deliberately does not, and a future guard refactor must preserve it). §1.5 adds a cross-reference NOTE on `work_session_breaks_ins`.

- **#3 [MEDIUM] `last_seen_at` touch route load-bearing but unspecified — ADDRESSED.** §4.2 now fully specifies `POST /api/work-session/touch`: `requireUser`; `update … set last_seen_at=now() where staff_id=<caller> and ended_at is null` (guaranteed no-op on completed/absent session → never hits the `work_session_locked` guard, no 42501 to swallow); returns `200`/`{session:null}` when no open session; client-debounced to `HEARTBEAT_MS`; and the realtime handler **ignores `last_seen_at`/`updated_at`-only changes** (local patch, no refetch churn) with the 60s cadence stated as acceptable fallback otherwise. §5's reference now points at the specified route (including a local-mode equivalent).

- **#4 [MEDIUM] Local-mode `endWork` synchronous flush + client-clock stamping (NFR §46 exception) unspecified — ADDRESSED.** §4.1 adds a Decision: local-mode ops mutate `localStorage` **synchronously** and return an already-resolved promise, so at logout the completed-session write is flushed before `logout()` and the §4.4 `Promise.race` timeout never fires; local mode **stamps timestamps from the client clock** as the **one documented exception to NFR §46** (server-authoritative time applies to Supabase mode only). §4.4 references it inline.

- **#5 [MEDIUM] Server-vs-client interrupted/duration boundary for owner report + export ambiguous (export==on-screen at risk) — ADDRESSED.** §4.2 now states `POST /api/work-session/report` returns **raw, scope-constrained session+break rows** (no server math), and a Decision fixes that **all** elapsed/net/interrupted derivation — table, summary cards, and export row-builder — runs through the **one pure engine on the client** with a **single `nowMs` captured per report render** + the shared `STALE_MS`, guaranteeing export counts == on-screen counts (acceptance §12/§16). §7 and §9 reinforce it (the export row-builder consumes the same engine summary over the same rows with the same `nowMs`/`staleMs`). The future server-aggregation path is noted as needing one `now()`/shared `STALE_MS`, but is not used this phase.

- **#6 [NIT] Empty `work` tier in the new module not confirmed tolerated — ADDRESSED by omitting the tier.** Verified in live `permission-levels.ts`: `levels` is `Partial<Record<AccessLevel, PermissionKey[]>>`; the `sales_agent` and `account` modules both declare only a subset of tiers; `levelToKeys` guards `if (keys)` and `supportedLevels` filters `(module.levels[lv]?.length ?? 0) > 0` — so a missing (or empty) tier is simply skipped by the grid and coverage grep. §2.3 now **omits** the `work` tier (precedent-matching) rather than writing `work: []`, with the verification noted inline.

- **#7 [NIT] Correction-path re-stamp of child-break `branch_id` promised but unspecified — ADDRESSED via option (a).** §1.1 now declares session `branch_id` **immutable after creation** in this phase (no store-move op exists), deletes the re-stamp promise, and notes a future store-move would add an `AFTER UPDATE` sync trigger (explicitly out of scope — no such trigger in 0075).

- **#8 [NIT] `auto_close`/`status='interrupted'` writer actor/capability unstated — ADDRESSED.** §5 adds a Decision: **no process writes `'interrupted'`/`'auto_close'` in this phase** (read-time detection only, no cron); the enum/CHECK values are **reserved** for a future service-role cleanup job gated by `work_sessions_correct` (audited via an `auto_close` event). The only terminal state any path produces this phase is completed/`'logout'`.

- **#9 [NIT] Interrupted + midnight-crossing interaction untested — ADDRESSED.** §3.5 adds test 10: an interrupted session open since 23:00 local with `lastSeenAt` 01:30 next local day and `nowMs` far later splits across both local dates using **`lastSeenAt` as the end cutoff** (`sum(parts) === lastSeenAt − startedAt` exactly, never involving `now`, no fabricated events).

---

## Responses to design review findings — revision pass 4

Verdict `CHANGES_REQUESTED` (1 MEDIUM + 1 NIT). Both findings resolved. Pass 3 confirmed every repository claim is accurate against live source; these two items were the final specification gaps, each re-verified against live source before editing.

- **#1 [MEDIUM] Owner report/export route bypasses RLS (service-role client), replacement scope filter underspecified — ADDRESSED (service-role option, predicate spelled out).** Re-verified: `requireUser`/`requirePermission` both return a service-role admin client that bypasses RLS (`createAdminClient()`), and the repo has **no user-token-bound RLS-active client factory** (browser client uses the anon key; every server route uses the admin client), so the "use an RLS-active client" option is not available without new infrastructure — and the self routes already precedent re-filtering by `staff_id` in code. §4.2 therefore **adopts the service-role client** and now spells out the **exact hand-written scope predicate** that provably reproduces `auth_work_sessions_see`: `organization_id = callerOrgId AND ( staff_id = callerStaffId OR ( callerHasOwnerKey AND ( callerCanCrossBranch OR branch_id = callerBranchId OR branch_id IS NULL ) ) )`. It specifies **how the route resolves scope server-side** given `staff_store_ids(uuid)` is `revoke all … from authenticated` (migration 0049) and cannot be RPC'd as the user: resolve the caller's `staff` row (id/branch/org) via the admin client and derive cross-branch from the role's `multi_store_access` using the `permissions` Set already returned by `requirePermission` — mirroring the existing admin-client routes. The requested agent set is **intersected with `lead_sales_agents()`**; date-range and store filters apply on top. An **explicit statement** that this predicate duplicates `auth_work_sessions_see` and MUST be kept in lockstep with it was added to §4.2, and the lockstep was added to the §11 steering lockstep section alongside the CAP↔RLS note (invariant (b)). The on-screen owner report and the HR/payroll export read from this **same route**, and all duration/interrupted math runs through the one shared client-side pure engine pass (single `nowMs`/`STALE_MS`), so export == on-screen is preserved.

- **#2 [NIT] Touch-route realtime suppression stated as default-with-fallback — ADDRESSED (pinned as mandatory).** §4.2 (touch route) and §8 (realtime) are reworded so the heartbeat-only suppression is **REQUIRED**: the realtime handler **MUST** compare `old`→`new` and, when the only changed columns are `last_seen_at`/`updated_at`, patch `last_seen_at` locally **without** a refetch. The "acceptable churn" escape clause is **removed**; only a one-line note remains that the engine math is unaffected either way.
