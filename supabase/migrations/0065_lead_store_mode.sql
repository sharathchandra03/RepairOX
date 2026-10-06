-- ############################################################################
-- 0065_lead_store_mode.sql
--
-- REPAIROX — LEAD MANAGEMENT STORE MODE (Single-Store vs Multi-Store).
-- Additive + idempotent. Lets each organization configure HOW Lead Management
-- operates, WITHOUT changing the global multi-store architecture:
--
--   • SINGLE STORE  — all new leads are managed from ONE designated store
--                     (`default_lead_store_id`). The agent never picks a store.
--   • MULTI STORE   — authorized users may create/operate leads across their
--                     permitted stores (the existing behaviour).
--
-- The mode + default store are ORG-level config on organization_settings (NOT
-- per sales agent). NULL `lead_store_mode` is read by the app as the default
-- ('single'). This never touches historical lead data.
--
-- ── Why a server guard: hiding the Store field in the Lead Form is NOT
--    security. This trigger enforces the SAME rules in the DB so a client can
--    never post a raw payload to create a lead in a store the mode/scope does
--    not allow. It mirrors the client (useLeadStoreMode / lead-capture-flow):
--
--      SINGLE MODE  → every NEW lead's branch_id is FORCED to the org's
--                     configured default_lead_store_id. A client-supplied
--                     branch_id is ignored (overwritten) on INSERT.
--      MULTI MODE   → a NEW lead's branch_id must be one of the writer's
--                     authorized stores (auth_store_ids) UNLESS the writer has
--                     cross-store scope (auth_can_cross_branch) — then any
--                     active store in the org is allowed.
--
--    HISTORICAL SAFETY: on UPDATE the guard NEVER rewrites branch_id for a mode
--    change / default-store change. It only validates a branch_id that the
--    write itself is CHANGING, and only in multi mode. Existing leads keep
--    their stored branch_id forever (spec §21/§22/§36/§76).
--
--    Service-role writes (no end-user JWT — migrations, back-office jobs) skip
--    the guard, matching leads_ownership_guard (0049) / lead_qualification_guard
--    (0060).
-- ############################################################################

-- ── 1. Org-level configuration columns (NULL = app default) ─────────────────
alter table public.organization_settings
  add column if not exists lead_store_mode       text,
  add column if not exists default_lead_store_id uuid references public.branches(id) on delete set null;

-- Guard the mode value to the two supported modes (NULL allowed = 'single').
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'organization_settings_lead_store_mode_chk'
  ) then
    alter table public.organization_settings
      add constraint organization_settings_lead_store_mode_chk
      check (lead_store_mode is null or lead_store_mode in ('single', 'multi'));
  end if;
end$$;

comment on column public.organization_settings.lead_store_mode is
  'Lead Management operating mode: single | multi. NULL = app default (single). '
  'Single = all new leads use default_lead_store_id; Multi = authorized users '
  'pick an authorized store. Changing the mode never rewrites historical leads.';

comment on column public.organization_settings.default_lead_store_id is
  'In Single-Store Lead mode, the store every NEW lead is assigned to. Required '
  'for lead creation in single mode. Changing it only affects future leads.';

-- ── 2. Resolve an org's lead store mode + default store (helpers) ───────────
create or replace function public.lead_store_mode_for(p_org uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce(nullif(lower(os.lead_store_mode), ''), 'single')
    from public.organization_settings os
   where os.organization_id = p_org
   limit 1;
$$;
grant execute on function public.lead_store_mode_for(uuid) to authenticated;

create or replace function public.default_lead_store_for(p_org uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select os.default_lead_store_id
    from public.organization_settings os
   where os.organization_id = p_org
   limit 1;
$$;
grant execute on function public.default_lead_store_for(uuid) to authenticated;

-- ── 3. Store-mode guard on leads (enforce mode on CREATE / branch change) ───
create or replace function public.leads_store_mode_guard()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_org        uuid;
  v_mode       text;
  v_default    uuid;
  v_branch_chg boolean;
begin
  -- Skip service-role / non-end-user writes (no JWT) — migrations, jobs.
  if auth.uid() is null then
    return new;
  end if;

  v_org := coalesce(new.organization_id, public.auth_org_id());
  if v_org is null then
    return new; -- cannot resolve org (local/edge case) — leave as-is.
  end if;

  v_mode    := public.lead_store_mode_for(v_org);
  v_default := public.default_lead_store_for(v_org);

  if tg_op = 'INSERT' then
    if v_mode = 'single' then
      -- Single mode: FORCE the configured default store. A client-supplied
      -- branch_id is ignored. No default configured → block creation.
      if v_default is null then
        raise exception 'lead_default_store_not_configured: Lead Management is in Single-Store mode but no Default Lead Store is configured. An administrator must set one in Lead Settings before leads can be created.'
          using errcode = '23514';
      end if;
      new.branch_id := v_default;
    else
      -- Multi mode: a new lead must land in a store the writer may use.
      if new.branch_id is null then
        return new; -- unscoped lead permitted (assigned later); RLS still guards.
      end if;
      if not public.auth_can_cross_branch()
         and not (new.branch_id = any (public.auth_store_ids())) then
        raise exception 'lead_store_not_authorized: you are not authorized to create leads in that store'
          using errcode = '42501';
      end if;
    end if;
    return new;
  end if;

  -- UPDATE: NEVER rewrite branch_id for a mode / default change. Only VALIDATE
  -- a branch_id that this write is actually CHANGING, and only in multi mode
  -- (single mode keeps whatever the lead already had — historical safety).
  v_branch_chg := new.branch_id is distinct from old.branch_id;
  if v_branch_chg and v_mode = 'multi' and new.branch_id is not null then
    if not public.auth_can_cross_branch()
       and not (new.branch_id = any (public.auth_store_ids())) then
      raise exception 'lead_store_not_authorized: you are not authorized to move this lead to that store'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

comment on function public.leads_store_mode_guard() is
  'Server-side Lead Store Mode enforcement. INSERT: single mode forces '
  'branch_id = org default_lead_store_id (blocks when none configured); multi '
  'mode requires branch_id in the writer''s auth_store_ids unless cross-branch. '
  'UPDATE: validates only a CHANGED branch_id in multi mode; never rewrites a '
  'historical lead''s store on mode/default changes. Mirrors the client gate.';

-- Postgres fires BEFORE row triggers in alphabetical order by trigger name.
-- `leads_store_mode_guard_trg` sorts BEFORE `leads_tz_ownership_guard_trg`
-- (0049), so the store-mode guard forces/validates branch_id FIRST and the
-- ownership guard then validates the owner against the FINAL branch_id.
drop trigger if exists leads_store_mode_guard_trg on public.leads;
create trigger leads_store_mode_guard_trg
  before insert or update on public.leads
  for each row execute function public.leads_store_mode_guard();

-- ============================================================================
-- Done. Lead Management Store Mode is now enforced at the database layer, in
-- agreement with the Lead Settings UI + Lead Form.
-- ============================================================================
