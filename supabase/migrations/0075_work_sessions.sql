-- ============================================================================
-- 0075 — Work Sessions (Attendance, Break Management & Productivity)
-- ----------------------------------------------------------------------------
-- A persisted, server-authoritative record of each employee's worked time,
-- keyed by staff.id. Auto-starts on login, tracks breaks, closes on logout,
-- feeds "My Productivity" (self) and the owner "Sales Agent Productivity"
-- report + HR/payroll export.
--
-- Design: .agents/tasks/attendance-design.md §1.
-- Additive + idempotent. Reuses ONLY the shared helpers:
--   auth_member_of_org, auth_branch_visible, auth_has_any, auth_staff_id,
--   auth_org_id, auth_branch_id, is_admin.
--
-- Three concepts stay separate: Online Presence (existing), Work Status
-- (derived from the open session), Work Session (these rows).
-- Employee-keyed (HRM-ready), not Sales-Agent-only — Sales-Agent restriction
-- lives only at the UI/permission surface this phase.
-- ============================================================================

-- ── SECTION 1 — Tables ──────────────────────────────────────────────────────

-- 1.1 work_sessions — one row per work session (login → logout).
create table if not exists public.work_sessions (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.auth_org_id() references public.organizations(id) on delete cascade,
  -- Home store at session start (store scope). Nullable by design for org-wide
  -- / multi-store staff whose staff.branch_id is null — exactly like every
  -- existing per-store table. Immutable after creation this phase.
  branch_id       uuid default public.auth_branch_id() references public.branches(id) on delete set null,
  staff_id        uuid not null references public.staff(id) on delete cascade,  -- the identity key
  started_at      timestamptz not null default now(),
  ended_at        timestamptz,                                                  -- null while open
  status          text not null default 'open'
                    check (status in ('open', 'completed', 'interrupted')),
  end_reason      text check (end_reason in ('logout', 'auto_close', 'correction')),
  last_seen_at    timestamptz not null default now(),  -- presence/heartbeat touch; NEVER a persisted duration
  source          text not null default 'web',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- 1.2 work_session_breaks — one row per break interval, child of a session.
create table if not exists public.work_session_breaks (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.auth_org_id() references public.organizations(id) on delete cascade,
  session_id      uuid not null references public.work_sessions(id) on delete cascade,
  staff_id        uuid not null references public.staff(id) on delete cascade,
  -- Denormalized from the parent session for store-scoped RLS without a join.
  -- Stamped by the guard from work_sessions.branch_id, never from the client.
  branch_id       uuid references public.branches(id) on delete set null,
  started_at      timestamptz not null default now(),
  ended_at        timestamptz,                                                  -- null while on break
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- 1.3 work_session_events — append-only audit of every transition + correction.
--   session_id    on delete set null  → audit survives a session delete.
--   staff_id      on delete restrict  → cannot silently erase audit history.
--   actor_staff_id on delete set null → audit survives an actor archive.
create table if not exists public.work_session_events (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.auth_org_id() references public.organizations(id) on delete cascade,
  session_id      uuid references public.work_sessions(id) on delete set null,
  staff_id        uuid not null references public.staff(id) on delete restrict,
  -- Denormalized from the parent session for store-scoped RLS without a join,
  -- exactly like work_session_breaks.branch_id. Stamped by the event-writing
  -- triggers from the parent work_sessions row, never from the client. A null
  -- branch (org-wide staff) is org-wide to key holders via auth_branch_visible.
  branch_id       uuid references public.branches(id) on delete set null,
  kind            text not null
                    check (kind in ('session_start', 'break_start', 'break_end',
                                    'session_end', 'auto_close', 'correction')),
  actor_staff_id  uuid references public.staff(id) on delete set null,
  at              timestamptz not null default now(),
  reason          text,
  previous        jsonb,
  details         jsonb,
  created_at      timestamptz not null default now()
);

-- Idempotency guard: ensure branch_id exists on an already-created events
-- table (additive; never drops or weakens anything).
alter table public.work_session_events
  add column if not exists branch_id uuid references public.branches(id) on delete set null;

-- ── SECTION 2 — Indexes (state-machine guarantees + reporting) ───────────────

-- At most ONE open session per employee (idempotent auto-start; no duplicate
-- sessions from refresh / multi-tab / concurrent requests). A racing INSERT
-- hits 23505 → the client treats it as "resume the existing open session".
create unique index if not exists work_sessions_one_open_per_staff
  on public.work_sessions (staff_id) where ended_at is null;

-- At most ONE open break per session (no second simultaneous break).
create unique index if not exists work_session_breaks_one_open_per_session
  on public.work_session_breaks (session_id) where ended_at is null;

create index if not exists work_sessions_staff_started_idx on public.work_sessions (staff_id, started_at);
create index if not exists work_sessions_org_started_idx   on public.work_sessions (organization_id, started_at);
create index if not exists work_sessions_branch_started_idx on public.work_sessions (branch_id, started_at);
create index if not exists work_session_breaks_session_idx  on public.work_session_breaks (session_id);
create index if not exists work_session_events_session_idx  on public.work_session_events (session_id, at);

-- ── SECTION 3 — Guard triggers (backend state machine) ──────────────────────

-- 3.1 work_session_guard — ownership + stamping + close-legality + lock.
--   Service-role writes (no end-user JWT) bypass end-user checks.
create or replace function public.work_session_guard()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_me     uuid := public.auth_staff_id();
  v_org    uuid;
  v_branch uuid;
begin
  if auth.uid() is null then
    -- Service-role write (API corrections / scripts): keep updated_at fresh.
    new.updated_at := now();
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- A user may only open their OWN session; org/branch stamped from staff.
    new.staff_id := v_me;
    select s.organization_id, s.branch_id into v_org, v_branch
      from public.staff s where s.id = v_me;
    new.organization_id := v_org;
    new.branch_id       := v_branch;
    -- A fresh insert must be an OPEN session (no pre-created completed row via
    -- the ordinary path).
    if new.status is distinct from 'open' or new.ended_at is not null then
      raise exception 'work_session_insert_must_be_open'
        using errcode = '23514';
    end if;
    new.created_at := now();
    new.updated_at := now();
    return new;
  end if;

  -- UPDATE
  new.updated_at := now();
  -- started_at is immutable except for a corrector.
  if new.started_at is distinct from old.started_at
     and not public.auth_has_any(array['work_sessions_correct']) then
    new.started_at := old.started_at;
  end if;

  if old.ended_at is not null then
    -- A completed/interrupted session is immutable to ordinary writes; only a
    -- corrector may change it.
    if not public.auth_has_any(array['work_sessions_correct']) then
      raise exception 'work_session_locked'
        using errcode = '42501';
    end if;
  end if;

  -- Closing a session.
  if old.ended_at is null and new.ended_at is not null then
    if not (
      old.staff_id = v_me
      or public.auth_has_any(array['work_sessions_correct'])
    ) then
      raise exception 'work_session_close_forbidden'
        using errcode = '42501';
    end if;
    if new.ended_at < new.started_at then
      raise exception 'work_session_end_before_start'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists work_session_guard_trg on public.work_sessions;
create trigger work_session_guard_trg
  before insert or update on public.work_sessions
  for each row execute function public.work_session_guard();

-- 3.2 work_break_guard — parent-session ownership + open-state (SOLE enforcer),
--   stamps staff/org/branch from the parent, close-legality.
--   NOTE: Postgres runs this BEFORE trigger first, then evaluates RLS WITH
--   CHECK on the POST-trigger row — so the break RLS policy sees the stamped
--   staff_id/org/branch and can trust them. RLS does NOT re-check the parent
--   session; this guard is the only place that does.
create or replace function public.work_break_guard()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_me      uuid := public.auth_staff_id();
  v_parent  public.work_sessions%rowtype;
begin
  if auth.uid() is null then
    new.updated_at := now();
    return new;
  end if;

  if tg_op = 'INSERT' then
    select * into v_parent from public.work_sessions where id = new.session_id;
    if not found then
      raise exception 'work_break_no_open_session'
        using errcode = '23514';
    end if;
    -- The parent session must be the caller's AND still open.
    if v_parent.staff_id is distinct from v_me or v_parent.ended_at is not null then
      raise exception 'work_break_no_open_session'
        using errcode = '23514';
    end if;
    -- Stamp identity/scope from the parent (client values ignored).
    new.staff_id        := v_parent.staff_id;
    new.organization_id := v_parent.organization_id;
    new.branch_id       := v_parent.branch_id;
    new.created_at      := now();
    new.updated_at      := now();
    return new;
  end if;

  -- UPDATE
  new.updated_at := now();
  -- Closing a break.
  if old.ended_at is null and new.ended_at is not null then
    if new.ended_at < new.started_at then
      raise exception 'work_break_end_before_start'
        using errcode = '23514';
    end if;
  elsif old.ended_at is not null and new.ended_at is distinct from old.ended_at then
    -- A break whose ended_at is already set cannot be re-closed (except by a
    -- corrector).
    if not public.auth_has_any(array['work_sessions_correct']) then
      raise exception 'work_break_not_active'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists work_break_guard_trg on public.work_session_breaks;
create trigger work_break_guard_trg
  before insert or update on public.work_session_breaks
  for each row execute function public.work_break_guard();

-- ── SECTION 4 — Event logging triggers (append-only audit, same txn) ─────────

create or replace function public.work_session_record_event()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.work_session_events (organization_id, branch_id, session_id, staff_id, kind, actor_staff_id, at)
      values (new.organization_id, new.branch_id, new.id, new.staff_id, 'session_start',
              coalesce(public.auth_staff_id(), new.staff_id), new.started_at);
  elsif tg_op = 'UPDATE' and old.ended_at is null and new.ended_at is not null then
    insert into public.work_session_events (organization_id, branch_id, session_id, staff_id, kind, actor_staff_id, at)
      values (new.organization_id, new.branch_id, new.id, new.staff_id,
              case when new.end_reason = 'auto_close' or new.status = 'interrupted'
                   then 'auto_close' else 'session_end' end,
              coalesce(public.auth_staff_id(), new.staff_id), new.ended_at);
  end if;
  return null;
end;
$$;

drop trigger if exists work_session_event_trg on public.work_sessions;
create trigger work_session_event_trg
  after insert or update on public.work_sessions
  for each row execute function public.work_session_record_event();

create or replace function public.work_break_record_event()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.work_session_events (organization_id, branch_id, session_id, staff_id, kind, actor_staff_id, at)
      values (new.organization_id, new.branch_id, new.session_id, new.staff_id, 'break_start',
              coalesce(public.auth_staff_id(), new.staff_id), new.started_at);
  elsif tg_op = 'UPDATE' and old.ended_at is null and new.ended_at is not null then
    insert into public.work_session_events (organization_id, branch_id, session_id, staff_id, kind, actor_staff_id, at)
      values (new.organization_id, new.branch_id, new.session_id, new.staff_id, 'break_end',
              coalesce(public.auth_staff_id(), new.staff_id), new.ended_at);
  end if;
  return null;
end;
$$;

drop trigger if exists work_break_event_trg on public.work_session_breaks;
create trigger work_break_event_trg
  after insert or update on public.work_session_breaks
  for each row execute function public.work_break_record_event();

-- ── SECTION 5 — RLS ──────────────────────────────────────────────────────────

alter table public.work_sessions       enable row level security;
alter table public.work_session_breaks enable row level security;
alter table public.work_session_events enable row level security;

-- Reusable visibility predicate: own-record OR permission-scoped owner/team
-- access, org- and store-isolated. A null branch_id (org-wide staff) passes
-- auth_branch_visible(null)=true, so it is org-wide productivity data visible
-- only to team/all/reports-key holders in the org — never to a plain Sales
-- Agent (who sees only their own records). The owner-key array below MUST stay
-- in lockstep with CAP.workSession.viewTeam/viewAll (app/src/lib/capabilities.ts)
-- AND with the hand-written scope predicate in POST /api/work-session/report.
create or replace function public.auth_work_sessions_see(p_staff_id uuid, p_org_id uuid, p_branch_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select
    public.auth_member_of_org(p_org_id)
    and (
      p_staff_id = public.auth_staff_id()
      or (
        public.auth_branch_visible(p_branch_id)
        and public.auth_has_any(array[
          'work_sessions_view_all',
          'work_sessions_view_team',
          'manage_attendance',
          'view_sales_reports',
          'manage_reports'
        ])
      )
    );
$$;
grant execute on function public.auth_work_sessions_see(uuid, uuid, uuid) to authenticated;

-- SELECT policies (all three reuse the identical predicate with the row's columns).
drop policy if exists work_sessions_sel on public.work_sessions;
create policy work_sessions_sel on public.work_sessions for select using (
  public.auth_work_sessions_see(staff_id, organization_id, branch_id)
);

drop policy if exists work_session_breaks_sel on public.work_session_breaks;
create policy work_session_breaks_sel on public.work_session_breaks for select using (
  public.auth_work_sessions_see(staff_id, organization_id, branch_id)
);

drop policy if exists work_session_events_sel on public.work_session_events;
create policy work_session_events_sel on public.work_session_events for select using (
  public.auth_work_sessions_see(staff_id, organization_id, branch_id)
);

-- Write policies. Insert = open only your OWN (guard re-stamps org/branch).
-- Update = self-close OR store-scoped corrector branch.
drop policy if exists work_sessions_ins on public.work_sessions;
create policy work_sessions_ins on public.work_sessions for insert with check (
  organization_id = public.auth_org_id() and staff_id = public.auth_staff_id()
);

drop policy if exists work_sessions_upd on public.work_sessions;
create policy work_sessions_upd on public.work_sessions for update using (
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

-- work_session_breaks (branch_id denormalized → same store-scoped corrector branch).
-- WITH CHECK runs on the POST-guard row: staff_id/branch_id/session_id are the
-- guard-stamped values. Parent-session ownership + open-state is enforced
-- SOLELY by work_break_guard, not by this policy.
drop policy if exists work_session_breaks_ins on public.work_session_breaks;
create policy work_session_breaks_ins on public.work_session_breaks for insert with check (
  organization_id = public.auth_org_id() and staff_id = public.auth_staff_id()
);

drop policy if exists work_session_breaks_upd on public.work_session_breaks;
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

-- work_session_events — append-only to end users (NO update/delete policy).
drop policy if exists work_session_events_ins on public.work_session_events;
create policy work_session_events_ins on public.work_session_events for insert with check (
  organization_id = public.auth_org_id() and actor_staff_id = public.auth_staff_id()
);

-- ── SECTION 6 — Default grants ───────────────────────────────────────────────

-- Every Sales Agent sees their own My Productivity by default. The owner/team/
-- correct keys are NOT seeded onto non-owner roles (owners hold them via
-- full_access; other roles get them only when an admin grants them).
insert into public.role_permissions (role_id, permission_key)
select 'sales_agent', 'work_sessions_view_own'
where exists (select 1 from public.roles where id = 'sales_agent')
on conflict (role_id, permission_key) do nothing;
