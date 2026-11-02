-- 0085 — Trash Bin foundation: who deleted, truthful audit trail, fast lookups
--
-- PROBLEM
--   Tickets / invoices / walk-ins / leads are SOFT-deleted (deleted_at = now()),
--   but nothing ever recorded WHO deleted them (deleted_by stayed NULL) and the
--   generic audit trigger logged the soft delete as a nameless "Update Lead
--   (<uuid>)", so the Activity Log never showed a deletion.
--
-- FIX (additive + idempotent; no data is changed or destroyed)
--   1. soft_delete_stamp(): BEFORE UPDATE trigger that stamps deleted_by =
--      auth_staff_id() the moment deleted_at flips NULL -> value (an end user
--      can never forge it), and clears it again on restore. Service-role
--      writes (auth.uid() is NULL) keep whatever the server route supplied.
--   2. fn_audit(): replaced so that
--        • a soft delete is logged as "<Module> Deleted"  (action_type DELETE)
--        • a restore     is logged as "<Module> Restored" (action_type RESTORE)
--        • both name the record ("T-1193 · Customer Name"), not a bare UUID
--        • when the write runs under the service role (auth.uid() is NULL) the
--          ACTOR is recovered from the row (deleted_by / updated_by /
--          created_by) instead of degrading to "System".
--      Every other table / operation keeps the exact 0069 behaviour.
--   3. Partial indexes so the Trash Bin list is fast.
-- ============================================================================

-- ── 1. deleted_by stamp ─────────────────────────────────────────────────────
create or replace function public.soft_delete_stamp()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Service role / server routes: keep the explicit values they set.
  if auth.uid() is null then
    return new;
  end if;

  if old.deleted_at is null and new.deleted_at is not null then
    new.deleted_by := public.auth_staff_id();
  elsif old.deleted_at is not null and new.deleted_at is null then
    new.deleted_by := null;
  end if;
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['tickets', 'invoices', 'walk_ins', 'leads'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_soft_delete_stamp', t);
    execute format(
      'create trigger %I before update on public.%I
         for each row when (old.deleted_at is distinct from new.deleted_at)
         execute function public.soft_delete_stamp()',
      t || '_soft_delete_stamp', t
    );
  end loop;
end $$;

-- ── 2. Truthful audit trigger ───────────────────────────────────────────────
create or replace function public.fn_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old    jsonb;
  v_new    jsonb;
  v_org    uuid;
  v_branch uuid;
  v_record text;
  v_module text := coalesce(nullif(TG_ARGV[0], ''), TG_TABLE_NAME);
  v_actor  uuid := auth.uid();
  v_name   text;
  v_role   text;
  v_bname  text;
  v_subject text;
  v_desc    text;
  v_op      text := TG_OP;       -- logged action_type (DELETE / RESTORE for soft ops)
  v_action  text;
  v_sev     text;
  v_soft    text := 'none';      -- 'delete' | 'restore' | 'none'
  v_ref     text;
  v_who     text;
  v_by_id   text;                -- staff id (as text) to attribute a service-role write to
begin
  if (TG_OP = 'DELETE') then
    v_old := to_jsonb(OLD); v_new := null;
  elsif (TG_OP = 'UPDATE') then
    v_old := to_jsonb(OLD); v_new := to_jsonb(NEW);
  else
    v_old := null; v_new := to_jsonb(NEW);
  end if;

  v_org    := coalesce(v_new->>'organization_id', v_old->>'organization_id')::uuid;
  v_branch := coalesce(v_new->>'branch_id',        v_old->>'branch_id')::uuid;
  v_record := coalesce(v_new->>'id', v_old->>'id',
                       v_new->>'doc_number', v_old->>'doc_number',
                       v_new->>'reference',  v_old->>'reference',
                       v_new->>'expense_id', v_old->>'expense_id');

  -- Soft delete / restore detection (tables that carry deleted_at).
  if (TG_OP = 'UPDATE') then
    if (v_old->>'deleted_at') is null and (v_new->>'deleted_at') is not null then
      v_soft := 'delete';
    elsif (v_old->>'deleted_at') is not null and (v_new->>'deleted_at') is null then
      v_soft := 'restore';
    end if;
  end if;

  -- Acting user (end-user JWT).
  select s.name, s.role_id, s.branch
    into v_name, v_role, v_bname
  from public.staff s
  where s.auth_user_id = v_actor
  limit 1;

  -- Service-role write (no JWT): recover the real actor from the row itself so
  -- the log never says "System" for a deletion / restore / creation.
  if v_name is null then
    v_by_id := case
      when v_soft = 'delete'  then v_new->>'deleted_by'
      when v_soft = 'restore' then v_new->>'updated_by'
      when TG_OP = 'INSERT'   then v_new->>'created_by'
      when TG_OP = 'UPDATE'   then v_new->>'updated_by'
      else null
    end;
    if v_by_id is not null then
      select s.name, s.role_id, s.branch
        into v_name, v_role, v_bname
      from public.staff s
      where s.id::text = v_by_id
      limit 1;
    end if;
  end if;

  -- ── staff / Employee special-casing (unchanged from 0069) ────────────────
  if (TG_TABLE_NAME = 'staff') then
    if (TG_OP = 'INSERT') then
      return NEW;
    end if;
    v_subject := coalesce(v_new->>'name', v_old->>'name', v_record);
  else
    v_subject := v_record;
  end if;

  v_action := initcap(lower(TG_OP)) || ' ' || v_module;
  v_sev    := case TG_OP when 'DELETE' then 'critical' when 'INSERT' then 'success' else 'info' end;
  v_desc   := v_module || ' ' || lower(TG_OP)
              || (case when v_subject is not null then ' (' || v_subject || ')' else '' end);

  if v_soft <> 'none' then
    v_ref := coalesce(
      nullif(coalesce(v_new->>'ticket_no', v_old->>'ticket_no'), ''),
      nullif(coalesce(v_new->>'lead_no',   v_old->>'lead_no'),   ''),
      nullif(coalesce(v_new->>'reference', v_old->>'reference'), ''),
      nullif(coalesce(v_new->>'doc_number', v_old->>'doc_number'), ''),
      v_record
    );
    v_who := coalesce(
      nullif(coalesce(v_new->>'customer', v_old->>'customer'), ''),
      nullif(coalesce(v_new->>'name',     v_old->>'name'),     '')
    );
    if v_soft = 'delete' then
      v_op := 'DELETE';
      v_action := v_module || ' Deleted';
      v_sev := 'critical';
      v_desc := v_module || ' deleted: ' || coalesce(v_ref, '')
                || (case when v_who is not null then ' · ' || v_who else '' end);
    else
      v_op := 'RESTORE';
      v_action := v_module || ' Restored';
      v_sev := 'success';
      v_desc := v_module || ' restored from Trash: ' || coalesce(v_ref, '')
                || (case when v_who is not null then ' · ' || v_who else '' end);
    end if;
  end if;

  insert into public.audit_log(
    organization_id, branch_id, module, entity_type, record_id, action_type,
    action, severity, description, previous_value, new_value,
    performed_by, actor, role, branch
  ) values (
    v_org, v_branch, v_module, TG_TABLE_NAME, v_record, v_op,
    v_action, v_sev, v_desc,
    v_old, v_new, v_actor, coalesce(v_name, 'System'), v_role, v_bname
  );

  if (TG_OP = 'DELETE') then return OLD; else return NEW; end if;
end;
$$;

-- ── 3. Trash Bin list indexes ───────────────────────────────────────────────
create index if not exists tickets_trash_idx   on public.tickets   (organization_id, deleted_at desc) where deleted_at is not null;
create index if not exists invoices_trash_idx  on public.invoices  (organization_id, deleted_at desc) where deleted_at is not null;
create index if not exists walk_ins_trash_idx  on public.walk_ins  (organization_id, deleted_at desc) where deleted_at is not null;
create index if not exists leads_trash_idx     on public.leads     (organization_id, deleted_at desc) where deleted_at is not null;
