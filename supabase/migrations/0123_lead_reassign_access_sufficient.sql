-- ============================================================================
-- 0123 — Lead Reassignment access is SUFFICIENT on its own.
--
-- 0122 added the `leads_reassign_access` switch as an extra gate. Turning it ON
-- for a role must also be enough to reassign (not only "allowed in addition to
-- leads_reassign"), so an admin who switches it back on for Sales Agents — or
-- for a custom role that never held leads_reassign — gets a working feature.
-- This is the live leads_ownership_guard with ONE change: the reassign-level key
-- list (v_broad) now also contains 'leads_reassign_access'.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.leads_ownership_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    new.created_by := v_me;
    if new.assigned_user_id is null
       and v_me is not null
       and public.lead_agent_eligible(v_me, new.branch_id, new.organization_id) then
      new.assigned_user_id := v_me;
    end if;
    v_changed := new.assigned_user_id is not null;
    if v_changed
       and new.assigned_user_id is distinct from v_me
       and not public.auth_has_any(array['leads_assign', 'leads_assign_intake', 'assign', 'manage_sales']) then
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
    new.created_by := old.created_by;
    v_changed := new.assigned_user_id is distinct from old.assigned_user_id;
    if v_changed then
      v_mine  := coalesce(old.assigned_user_id = v_me, false) or coalesce(old.created_by = v_me, false);
      v_broad := coalesce(public.auth_has_any(array['leads_reassign', 'assign', 'manage_sales', 'leads_reassign_access']), false);
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
      new.assigned_to      := old.assigned_to;
      new.assigned_to_name := old.assigned_to_name;
      new.assigned_by      := old.assigned_by;
      new.assigned_by_name := old.assigned_by_name;
      new.assigned_at      := old.assigned_at;
      new.agent            := old.agent;
      new.last_assignment_reason := null;
      if new.branch_id is distinct from old.branch_id
         and new.assigned_user_id is not null
         and not public.lead_agent_eligible(new.assigned_user_id, new.branch_id, new.organization_id) then
        raise exception 'lead_owner_not_eligible: the lead owner must be an active Sales Agent authorized for this store'
          using errcode = '23514';
      end if;
    end if;
    v_fu_changed := new.follow_up_agent_id is distinct from old.follow_up_agent_id
                 or (new.branch_id is distinct from old.branch_id and new.follow_up_agent_id is not null);
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
    new.agent            := new.assigned_to_name;
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
    new.follow_up_agent := (select s.name from public.staff s where s.id = new.follow_up_agent_id);
  end if;

  return new;
end;
$function$;
