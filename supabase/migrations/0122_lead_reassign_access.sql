-- ============================================================================
-- 0122 — Lead Reassignment access (`leads_reassign_access`).
--
-- ONE role permission governs every way of handing work to another agent:
--   • changing the owner of a lead that already has one (incl. clearing it);
--   • giving a follow-up to an agent other than yourself.
-- First-time assignment of an UNOWNED lead, creating a lead for yourself, and
-- the intake / pending-claim flows are NOT reassignment and are unchanged.
--
-- Managers / owners keep the ability (seeded below + full_access / admins pass
-- auth_has_any automatically). Sales Agents do NOT hold it: the UI shows the
-- controls locked, and these triggers are the real boundary.
--
-- Additive + idempotent. Does not touch leads_ownership_guard or
-- lead_followup_guard (separate triggers, so nothing is re-implemented).
-- ============================================================================

-- ── 1. Seed: every role that could reassign before, EXCEPT the Sales Agent role ─
insert into public.role_permissions (role_id, permission_key)
select distinct rp.role_id, 'leads_reassign_access'
  from public.role_permissions rp
 where rp.role_id <> 'sales_agent'
   and rp.permission_key in ('leads_reassign', 'manage_sales', 'leads_view_all', 'leads_view_team',
                             'full_access', '*', 'assign')
on conflict (role_id, permission_key) do nothing;

insert into public.role_permissions (role_id, permission_key)
select r.id, 'leads_reassign_access'
  from public.roles r
 where r.id in ('manager', 'master_shop_owner', 'platform_owner', 'shop_owner_branch_manager')
on conflict (role_id, permission_key) do nothing;

-- ── 2. leads: owner / follow-up agent changes ───────────────────────────────
create or replace function public.leads_reassign_access_guard()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := public.auth_staff_id();
begin
  if auth.uid() is null then
    return new;                                   -- service role / internal writes
  end if;
  if coalesce(public.auth_has_any(array['leads_reassign_access']), false) then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    -- Owner: only the FIRST assignment (old owner null) is free.
    if old.assigned_user_id is not null
       and new.assigned_user_id is distinct from old.assigned_user_id then
      raise exception 'lead_reassign_access_forbidden: you do not have access to reassign leads'
        using errcode = '42501';
    end if;
    -- Follow-up agent: may only stay with people already on the lead.
    if new.follow_up_agent_id is not null
       and new.follow_up_agent_id is distinct from old.follow_up_agent_id
       and new.follow_up_agent_id is distinct from v_me
       and new.follow_up_agent_id is distinct from new.assigned_user_id then
      raise exception 'lead_reassign_access_forbidden: you do not have access to hand a follow-up to another agent'
        using errcode = '42501';
    end if;
  else -- INSERT
    if new.follow_up_agent_id is not null
       and new.follow_up_agent_id is distinct from v_me
       and new.follow_up_agent_id is distinct from new.assigned_user_id then
      raise exception 'lead_reassign_access_forbidden: you do not have access to hand a follow-up to another agent'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists leads_zz_reassign_access_guard_trg on public.leads;
create trigger leads_zz_reassign_access_guard_trg
  before insert or update on public.leads
  for each row execute function public.leads_reassign_access_guard();

-- ── 3. follow-up records: who the follow-up is given to ─────────────────────
create or replace function public.lead_followup_reassign_access_guard()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_me   uuid := public.auth_staff_id();
  v_lead record;
begin
  if auth.uid() is null then
    return new;
  end if;
  if new.followup_user_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.followup_user_id is not distinct from old.followup_user_id then
    return new;
  end if;
  if coalesce(public.auth_has_any(array['leads_reassign_access']), false) then
    return new;
  end if;
  select l.assigned_user_id, l.follow_up_agent_id into v_lead from public.leads l where l.id = new.lead_id;
  if new.followup_user_id = v_me
     or new.followup_user_id = v_lead.assigned_user_id
     or new.followup_user_id = v_lead.follow_up_agent_id
     or exists (
       select 1 from public.lead_followup_history h
        where h.lead_id = new.lead_id and h.followup_user_id = new.followup_user_id and h.id <> new.id) then
    return new;
  end if;
  raise exception 'lead_reassign_access_forbidden: you do not have access to hand a follow-up to another agent'
    using errcode = '42501';
end;
$$;

drop trigger if exists lead_followup_zz_reassign_access_guard_trg on public.lead_followup_history;
create trigger lead_followup_zz_reassign_access_guard_trg
  before insert or update on public.lead_followup_history
  for each row execute function public.lead_followup_reassign_access_guard();
