-- ============================================================================
-- 0126 — Loss & Damage permissions (separate keys per step) + workflow guard.
--
-- Keys (all granular-only; CAP.lossDamage in capabilities.ts must list the same):
--   loss_damage_view / _reports        see the register / the reports tab
--   loss_damage_report / _export       report an incident / export to Excel+CSV
--   loss_damage_verify                 verify the count + cost, or send to investigation
--   loss_damage_approve                write stock off, quarantine, or restore a repaired part
--   loss_damage_reject                 reject an incident
--
-- 1. Seed existing roles so nobody loses today's access (additive, idempotent).
-- 2. inv_doc_allowed(): write_off documents are governed by the new keys.
-- 3. loss_damage_guard: DB-enforced workflow (legal transitions, a key per step,
--    reporter can never verify/approve their own incident, closed incidents are locked).
-- 4. post_stock_adjust(): a Loss & Damage approver may post the stock-out for an
--    incident that is waiting for that write-off.
-- Service-role / direct writes (no end-user JWT) bypass the guard, as elsewhere.
-- ============================================================================

-- ── 1. Seed ─────────────────────────────────────────────────────────────────
insert into public.role_permissions (role_id, permission_key)
select distinct rp.role_id, k.perm
  from public.role_permissions rp
  join (values
    ('loss_damage_view',    array['view_inventory','manage_inventory','adjust_stock','approve_inventory','full_access','*']),
    ('loss_damage_reports', array['view_inventory_reports','manage_inventory','approve_inventory','full_access','*']),
    ('loss_damage_report',  array['adjust_stock','manage_inventory','full_access','*']),
    ('loss_damage_export',  array['manage_inventory','approve_inventory','full_access','*']),
    ('loss_damage_verify',  array['approve_inventory','manage_inventory','full_access','*']),
    ('loss_damage_approve', array['approve_inventory','manage_inventory','full_access','*']),
    ('loss_damage_reject',  array['approve_inventory','manage_inventory','full_access','*'])
  ) as k(perm, src) on rp.permission_key = any (k.src)
 where rp.role_id <> 'ninja'
on conflict (role_id, permission_key) do nothing;

-- ── 2. Access helper: write_off is governed by its own keys ─────────────────
create or replace function public.inv_doc_allowed(p_type text, p_write boolean)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_type in ('purchase_order', 'grn', 'vendor_return') then
      public.auth_has_any(array['manage_purchases','manage_vendors','manage_inventory'])
    when p_type = 'write_off' then
      case when p_write
        then public.auth_has_any(array['loss_damage_report','loss_damage_verify','loss_damage_approve','loss_damage_reject'])
        else public.auth_has_any(array['loss_damage_view','loss_damage_reports','loss_damage_report','loss_damage_verify','loss_damage_approve','loss_damage_reject'])
      end
    when p_write then
      public.auth_has_any(array['manage_inventory','adjust_stock','transfer_inventory','approve_inventory','create_item','edit_item','manage_purchases'])
    else
      public.auth_has_any(array['view_inventory','manage_inventory','adjust_stock','transfer_inventory','approve_inventory','create_item','edit_item','manage_purchases'])
  end;
$$;
grant execute on function public.inv_doc_allowed(text, boolean) to authenticated;

-- ── 3. Workflow guard ───────────────────────────────────────────────────────
-- The app saves with an UPSERT. Postgres fires the BEFORE INSERT trigger first even when the row
-- already exists, so an insert for an existing id is treated as the UPDATE it really is.
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
    raise exception 'loss_damage_self_approval_forbidden: another approver has to review an incident you reported' using errcode = '42501';
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
drop trigger if exists loss_damage_guard_trg on public.inventory_docs;
create trigger loss_damage_guard_trg
  before insert or update on public.inventory_docs
  for each row execute function public.loss_damage_guard();

-- ── 4. post_stock_adjust: also allow a Loss & Damage approver (see header) ──
create or replace function public.post_stock_adjust(
  p_item_id   text,
  p_delta     numeric,
  p_label     text,
  p_type      text default 'Adjustment',
  p_unit_cost numeric default null,
  p_doc       text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org    uuid;
  v_branch uuid;
  v_store  text;
  v_cur    numeric;
  v_doc    text;
  v_cost   numeric;
begin
  if p_delta is null or p_delta = 0 then
    raise exception 'post_stock_adjust: delta must be non-zero' using errcode = '22023';
  end if;
  if p_type not in ('Inward','Outward','Adjustment','Transfer','Return') then
    raise exception 'post_stock_adjust: bad movement type' using errcode = '22023';
  end if;
  select organization_id, branch_id, store, coalesce(current_stock, 0)
    into v_org, v_branch, v_store, v_cur
    from public.inventory_items where id = p_item_id for update;
  if v_org is null then
    raise exception 'post_stock_adjust: item % not found', p_item_id using errcode = '23503';
  end if;
  if not public.auth_member_of_org(v_org)
     or not public.auth_branch_visible(v_branch)
     or not (
          public.auth_has_any(array['manage_inventory','adjust_stock','transfer_inventory','approve_inventory','manage_purchases'])
          -- A Loss & Damage approver may post the stock-out for an incident that is awaiting that write-off,
          -- and nothing else (no free-form stock changes).
          or (p_type = 'Adjustment' and p_delta < 0
              and public.auth_has_any(array['loss_damage_approve'])
              and exists (select 1 from public.inventory_docs d
                           where d.id = split_part(coalesce(p_doc, ''), '/', 1)
                             and d.doc_type = 'write_off'
                             and d.organization_id = v_org
                             and d.status in ('verified', 'quarantined')))
        ) then
    raise exception 'post_stock_adjust: not authorized' using errcode = '42501';
  end if;
  if p_delta < 0 and v_cur + p_delta < 0 then
    raise exception 'post_stock_adjust: only % unit(s) on hand', v_cur using errcode = '22023';
  end if;

  v_doc := coalesce(nullif(p_doc, ''), 'MOV-ADJ-' || replace(gen_random_uuid()::text, '-', ''));

  if p_delta > 0 then
    v_cost := coalesce(p_unit_cost, public.inventory_weighted_avg_cost(p_item_id), 0);
    insert into public.inventory_stock_layers
      (organization_id, branch_id, item_id, source, qty_in, qty_remaining, unit_cost, movement_doc_number)
    values (v_org, v_branch, p_item_id, 'adjustment', p_delta, p_delta, v_cost, v_doc);
  else
    perform public.inventory_deplete_layers(p_item_id, -p_delta);
  end if;

  insert into public.stock_movements
    (doc_number, organization_id, branch_id, from_store, to_store, items, movement_date, movement_user, movement_type, status, item_id)
  values (
    v_doc, v_org, v_branch,
    case when p_delta > 0 then coalesce(p_label, 'Adjustment') else v_store end,
    case when p_delta > 0 then v_store else coalesce(p_label, 'Adjustment') end,
    abs(p_delta), to_char(now(), 'DD/MM/YYYY'), '', p_type, 'completed', p_item_id
  );

  update public.inventory_items
     set current_stock = v_cur + p_delta, updated_at = now()
   where id = p_item_id;
  return v_doc;
end;
$$;
grant execute on function public.post_stock_adjust(text, numeric, text, text, numeric, text) to authenticated;
