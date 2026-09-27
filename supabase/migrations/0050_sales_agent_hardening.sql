-- ############################################################################
-- 0050_sales_agent_hardening.sql
--
-- REPAIROX — LEAD MANAGEMENT PHASE 1 · hardening pass on 0049
-- (independent review findings). Additive + idempotent.
--
--   1. Sales Agents can READ lead_options (Source / Region / Status …
--      dropdowns) — 0002 only allowed manage_sales / reports / settings keys,
--      which left the Lead Form empty for a Sales Agent.
--   2. A follow-up record can't be re-pointed at another lead (lead_id /
--      org / branch / created_by are frozen on UPDATE, and the new row must
--      still belong to a visible lead). A follow-up grants lead visibility, so
--      repointing one would have been a privilege escalation.
--   3. lead_assignment_history is TRIGGER-ONLY — the client insert policy is
--      dropped so the ownership trail can't be forged.
--   4. Ownership guard refinements:
--        • `leads_assign` lets a user hand off leads they OWN or CREATED (or
--          any lead when they have a see-all key); changing the owner of
--          someone else's lead — e.g. as its follow-up agent — needs
--          `leads_reassign` / `assign` / `manage_sales` (or admin).
--        • the cached AGENTS label (`agent`) is frozen unless the owner changes;
--        • moving a lead to another store re-validates owner + follow-up agent;
--        • restoring a soft-deleted lead needs the Delete capability too;
--        • the assignment reason is taken exactly as written with the change.
-- ############################################################################


-- ============================================================================
-- SECTION 1 — lead_options: readable by lead workers
-- ============================================================================
drop policy if exists lead_options_sel on public.lead_options;
create policy lead_options_sel on public.lead_options for select to authenticated
using (
  public.auth_member_of_org(organization_id)
  and public.auth_branch_visible(branch_id)
  and public.auth_has_any(array[
    'leads_view', 'leads_create', 'leads_edit',
    'manage_sales', 'view_sales_reports', 'manage_settings', 'view_only'
  ])
);


-- ============================================================================
-- SECTION 2 — Follow-up records: frozen identity + re-validated agent
-- ============================================================================
create or replace function public.lead_followup_guard()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_lead record;
  v_me   uuid := public.auth_staff_id();
begin
  if auth.uid() is null then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    -- A follow-up belongs to ONE lead forever; who created it is history.
    new.lead_id         := old.lead_id;
    new.organization_id := old.organization_id;
    new.branch_id       := old.branch_id;
    new.created_by      := old.created_by;
    new.created_by_name := old.created_by_name;
    if new.followup_user_id is distinct from old.followup_user_id
       and coalesce(old.status, 'scheduled') <> 'scheduled' then
      raise exception 'lead_followup_closed: a completed or cancelled follow-up can''t be reassigned'
        using errcode = '23514';
    end if;
  end if;

  select l.organization_id, l.branch_id into v_lead from public.leads l where l.id = new.lead_id;

  if tg_op = 'INSERT' then
    new.created_by      := v_me;
    new.created_by_name := (select s.name from public.staff s where s.id = v_me);
  end if;

  if new.followup_user_id is not null
     and (tg_op = 'INSERT' or new.followup_user_id is distinct from old.followup_user_id) then
    if not public.lead_agent_eligible(new.followup_user_id, v_lead.branch_id, v_lead.organization_id) then
      raise exception 'lead_followup_agent_not_eligible: the follow-up agent must be an active Sales Agent authorized for this store'
        using errcode = '23514';
    end if;
  end if;
  -- The cached name always follows the id (never client free text).
  new.followup_user_name := case
    when new.followup_user_id is null then null
    else (select s.name from public.staff s where s.id = new.followup_user_id)
  end;
  return new;
end;
$$;

drop policy if exists lead_followup_history_upd on public.lead_followup_history;
create policy lead_followup_history_upd on public.lead_followup_history for update to authenticated
using (
  public.auth_member_of_org(organization_id)
  and public.auth_branch_visible(branch_id)
  and (
    public.is_admin()
    or public.auth_has_any(array['manage_reports', 'manage_users'])
    or (public.auth_has_any(array['leads_followup', 'leads_edit', 'manage_sales'])
        and public.auth_lead_visible(lead_id))
  )
)
with check (
  organization_id = public.auth_org_id()
  and public.auth_branch_visible(branch_id)
  and public.auth_lead_visible(lead_id)
);


-- ============================================================================
-- SECTION 3 — Assignment history is written ONLY by the DB trigger
-- ============================================================================
drop policy if exists lead_assignment_history_ins on public.lead_assignment_history;


-- ============================================================================
-- SECTION 4 — Ownership guard (supersedes the 0049 definition)
-- ============================================================================
create or replace function public.leads_ownership_guard()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_me         uuid := public.auth_staff_id();
  v_me_name    text;
  v_changed    boolean := false;
  v_fu_changed boolean := false;
  v_mine       boolean := false;
  v_broad      boolean := false;
begin
  if auth.uid() is null then
    return new;
  end if;
  select s.name into v_me_name from public.staff s where s.id = v_me;

  if tg_op = 'INSERT' then
    -- created_by is ALWAYS the signed-in user (never client-supplied).
    new.created_by := v_me;
    -- Default owner = the creating Sales Agent (IVR / phone capture flow).
    if new.assigned_user_id is null
       and v_me is not null
       and public.lead_agent_eligible(v_me, new.branch_id, new.organization_id) then
      new.assigned_user_id := v_me;
    end if;
    v_changed := new.assigned_user_id is not null;
    -- Creating a lead OWNED BY SOMEONE ELSE is an assignment.
    if v_changed
       and new.assigned_user_id is distinct from v_me
       and not public.auth_has_any(array['leads_assign', 'assign', 'manage_sales']) then
      raise exception 'lead_assign_forbidden: you can only create leads owned by yourself'
        using errcode = '42501';
    end if;
    v_fu_changed := new.follow_up_agent_id is not null;
    if not v_changed then
      new.assigned_to      := null;
      new.assigned_to_name := null;
      new.assigned_by      := null;
      new.assigned_by_name := null;
      new.assigned_at      := null;
    end if;
  else
    -- created_by is immutable.
    new.created_by := old.created_by;
    v_changed := new.assigned_user_id is distinct from old.assigned_user_id;
    if v_changed then
      -- `leads_assign` covers leads the caller owns or created (hand-off), or
      -- any visible lead for see-all roles. Everything else — e.g. a follow-up
      -- agent taking someone else's lead — needs a reassign-level key.
      -- (coalesce: a NULL comparison must never read as "allowed")
      v_mine  := coalesce(old.assigned_user_id = v_me, false) or coalesce(old.created_by = v_me, false);
      v_broad := coalesce(public.auth_has_any(array['leads_reassign', 'assign', 'manage_sales']), false);
      if not coalesce(
           v_broad
           or (public.auth_has_any(array['leads_assign']) and (v_mine or public.auth_lead_see_all())),
           false) then
        if old.assigned_user_id is null then
          raise exception 'lead_assign_forbidden: you are not allowed to assign this lead'
            using errcode = '42501';
        else
          raise exception 'lead_reassign_forbidden: you are not allowed to change the owner of this lead'
            using errcode = '42501';
        end if;
      end if;
    else
      -- Ownership metadata (incl. the cached AGENTS label) only ever changes
      -- together with the owner.
      new.assigned_to      := old.assigned_to;
      new.assigned_to_name := old.assigned_to_name;
      new.assigned_by      := old.assigned_by;
      new.assigned_by_name := old.assigned_by_name;
      new.assigned_at      := old.assigned_at;
      new.agent            := old.agent;
      new.last_assignment_reason := null;
      -- Moving the lead to another store must keep its owner eligible there.
      if new.branch_id is distinct from old.branch_id
         and new.assigned_user_id is not null
         and not public.lead_agent_eligible(new.assigned_user_id, new.branch_id, new.organization_id) then
        raise exception 'lead_owner_not_eligible: the lead owner must be an active Sales Agent authorized for this store'
          using errcode = '23514';
      end if;
    end if;
    v_fu_changed := new.follow_up_agent_id is distinct from old.follow_up_agent_id
                 or (new.branch_id is distinct from old.branch_id and new.follow_up_agent_id is not null);
    -- Soft delete AND restore are the Delete capability, not a plain edit.
    if (old.deleted_at is null) <> (new.deleted_at is null)
       and not public.auth_has_any(array['leads_delete', 'manage_sales']) then
      raise exception 'lead_delete_forbidden: you are not allowed to delete or restore leads'
        using errcode = '42501';
    end if;
  end if;

  if v_changed then
    if new.assigned_user_id is not null
       and not public.lead_agent_eligible(new.assigned_user_id, new.branch_id, new.organization_id) then
      raise exception 'lead_owner_not_eligible: the lead owner must be an active Sales Agent authorized for this store'
        using errcode = '23514';
    end if;
    new.assigned_to      := new.assigned_user_id;
    new.assigned_to_name := (select s.name from public.staff s where s.id = new.assigned_user_id);
    new.agent            := new.assigned_to_name;   -- cached display label of AGENTS
    new.assigned_by      := v_me;
    new.assigned_by_name := v_me_name;
    new.assigned_at      := case when new.assigned_user_id is null then null else now() end;
  end if;

  if v_fu_changed then
    if new.follow_up_agent_id is not null then
      if not public.lead_agent_eligible(new.follow_up_agent_id, new.branch_id, new.organization_id) then
        raise exception 'lead_followup_agent_not_eligible: the follow-up agent must be an active Sales Agent authorized for this store'
          using errcode = '23514';
      end if;
      new.follow_up_agent := (select s.name from public.staff s where s.id = new.follow_up_agent_id);
    elsif tg_op = 'UPDATE' then
      new.follow_up_agent := null;
    end if;
  elsif new.follow_up_agent_id is not null
        and tg_op = 'UPDATE'
        and new.follow_up_agent is distinct from old.follow_up_agent then
    -- The cached name always follows the id (never free text when an id exists).
    new.follow_up_agent := (select s.name from public.staff s where s.id = new.follow_up_agent_id);
  end if;

  return new;
end;
$$;

-- (Trigger leads_tz_ownership_guard_trg from 0049 already points at this function.)


-- ============================================================================
-- Done. Sales Agents can fill the Lead Form, follow-ups can't be used to reach
-- other leads, the ownership trail is trigger-only, and a follow-up agent can't
-- take ownership of a lead they don't own without a reassign-level permission.
-- ============================================================================
