-- ============================================================================
-- 0127 — Loss & Damage: owners may review their OWN incident.
--
-- 0126 blocked every reporter from verifying/approving their own incident. That leaves a
-- one-owner shop unable to approve anything. Owners/admins (is_admin(), full_access, '*') may now
-- review their own report; the incident is flagged data.selfReviewed = true so it stays auditable.
-- Everyone else is still blocked. Re-creates the guard only (the trigger from 0126 is unchanged).
-- ============================================================================
create or replace function public.loss_damage_guard()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_me     uuid := public.auth_staff_id();
  v_old    public.inventory_docs;
  v_needs  text;
  v_legal  text[];
  v_report text;
begin
  if auth.uid() is null then
    return new;                                   -- service role / internal writes
  end if;

  if tg_op = 'UPDATE' then
    v_old := old;
  else
    select * into v_old from public.inventory_docs where id = new.id;
  end if;

  -- Not a Loss & Damage document before or after: nothing to enforce.
  if new.doc_type <> 'write_off' and coalesce(v_old.doc_type, '') <> 'write_off' then
    return new;
  end if;

  -- ── Brand-new incident
  if v_old.id is null then
    if not coalesce(public.auth_has_any(array['loss_damage_report']), false) then
      raise exception 'loss_damage_forbidden: you do not have access to report loss or damage' using errcode = '42501';
    end if;
    if new.status <> 'reported' then
      raise exception 'loss_damage_bad_status: a new incident must start as reported' using errcode = '23514';
    end if;
    -- The reporter id is server-stamped so it cannot be forged to dodge the self-approval rule.
    new.data := jsonb_set(coalesce(new.data, '{}'::jsonb), '{reportedById}', to_jsonb(coalesce(v_me::text, '')));
    return new;
  end if;

  -- ── Existing incident
  if v_old.doc_type is distinct from new.doc_type then
    raise exception 'loss_damage_locked: the document type cannot change' using errcode = '23514';
  end if;

  if v_old.status = new.status then
    if new.lines is distinct from v_old.lines or new.party is distinct from v_old.party or new.data is distinct from v_old.data then
      raise exception 'loss_damage_locked: an incident can only change by moving through the approval steps' using errcode = '23514';
    end if;
    return new;
  end if;

  v_legal := case v_old.status
    when 'reported'      then array['verified','investigating','rejected']
    when 'investigating' then array['verified','rejected']
    when 'verified'      then array['approved','quarantined','investigating','rejected']
    when 'quarantined'   then array['approved','restored']
    else array[]::text[]
  end;
  if not (new.status = any (v_legal)) then
    raise exception 'loss_damage_bad_transition: % cannot move to %', v_old.status, new.status using errcode = '23514';
  end if;

  v_needs := case new.status
    when 'verified'      then 'loss_damage_verify'
    when 'investigating' then 'loss_damage_verify'
    when 'approved'      then 'loss_damage_approve'
    when 'quarantined'   then 'loss_damage_approve'
    when 'restored'      then 'loss_damage_approve'
    when 'rejected'      then 'loss_damage_reject'
  end;
  if not coalesce(public.auth_has_any(array[v_needs]), false) then
    raise exception 'loss_damage_forbidden: you do not have access to move an incident to %', new.status using errcode = '42501';
  end if;

  -- A reporter never reviews their own incident.
  v_report := v_old.data ->> 'reportedById';
  if v_me is not null and coalesce(v_report, '') <> '' and v_report = v_me::text then
    -- auth_has_any() with a key nobody holds is true ONLY for owners/admins (is_admin, full_access, '*').
    -- Owners may review their own report (a one-owner shop has nobody else); it is flagged for audit.
    if coalesce(public.auth_has_any(array['__owner_only__']), false) then
      new.data := jsonb_set(coalesce(new.data, '{}'::jsonb), '{selfReviewed}', 'true'::jsonb);
    else
      raise exception 'loss_damage_self_approval_forbidden: another approver has to review an incident you reported' using errcode = '42501';
    end if;
  end if;

  -- The incident's identity is frozen: the stored reporter always wins (a stale client copy cannot
  -- change it). The quantity may change only while verifying.
  new.data := jsonb_set(coalesce(new.data, '{}'::jsonb), '{reportedById}', to_jsonb(coalesce(v_report, '')));
  if new.lines is distinct from v_old.lines then
    if new.status <> 'verified'
       or jsonb_array_length(new.lines) <> jsonb_array_length(v_old.lines)
       or (new.lines -> 0 ->> 'itemId') is distinct from (v_old.lines -> 0 ->> 'itemId')
       or coalesce((new.lines -> 0 ->> 'qty')::numeric, 0) <= 0 then
      raise exception 'loss_damage_locked: items can only be re-counted while verifying' using errcode = '23514';
    end if;
  end if;

  new.data := jsonb_set(new.data, '{decidedById}', to_jsonb(coalesce(v_me::text, '')));
  return new;
end;
$$;
