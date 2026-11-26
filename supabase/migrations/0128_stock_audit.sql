-- ============================================================================
-- 0128 — Stock Audit: granular permissions + DB-enforced workflow.
--
-- Keys (granular-only; CAP.stockAudit in capabilities.ts must list the same):
--   stock_audit_view / _reports         see audits / accuracy + shrinkage reports
--   stock_audit_count / _export         enter physical counts / export count sheets + reports
--   stock_audit_create                  start an audit (scope, snapshot, blind mode)
--   stock_audit_see_system_qty          see the system quantity while an audit is blind
--   stock_audit_review                  request a recount, reject
--   stock_audit_approve                 approve the correction (posts the variance)
--   stock_audit_approve_high            approve an audit whose variance is above the high-variance limit
--   stock_audit_cancel                  cancel an audit
--
-- Workflow (inventory_docs.doc_type = 'stock_count'):
--   draft(counting) -> submitted -> approved | rejected | draft(recount)     any open state -> cancelled
-- Stock moves ONLY on approval (post_stock_adjust). Counters never approve their own count (owners may;
-- flagged data.selfReviewed). HIGH VARIANCE (same rule as lib/stock-audit.ts): any line off by >= 10 units,
-- or >= 25% of system with at least 2 units.
-- Service-role / direct writes (no end-user JWT) bypass the guard, as elsewhere.
-- ============================================================================
insert into public.role_permissions (role_id, permission_key)
select distinct rp.role_id, k.perm
  from public.role_permissions rp
  join (values
    ('stock_audit_view',          array['view_inventory','manage_inventory','adjust_stock','approve_inventory','full_access','*']),
    ('stock_audit_reports',       array['view_inventory_reports','manage_inventory','approve_inventory','full_access','*']),
    ('stock_audit_count',         array['adjust_stock','manage_inventory','full_access','*']),
    ('stock_audit_export',        array['manage_inventory','approve_inventory','full_access','*']),
    ('stock_audit_create',        array['approve_inventory','manage_inventory','full_access','*']),
    ('stock_audit_see_system_qty',array['approve_inventory','manage_inventory','full_access','*']),
    ('stock_audit_review',        array['approve_inventory','manage_inventory','full_access','*']),
    ('stock_audit_approve',       array['approve_inventory','manage_inventory','full_access','*']),
    ('stock_audit_approve_high',  array['full_access','*']),
    ('stock_audit_cancel',        array['full_access','*'])
  ) as k(perm, src) on rp.permission_key = any (k.src)
 where rp.role_id <> 'ninja'
on conflict (role_id, permission_key) do nothing;

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
    when p_type = 'stock_count' then
      case when p_write
        then public.auth_has_any(array['stock_audit_create','stock_audit_count','stock_audit_review','stock_audit_approve','stock_audit_approve_high','stock_audit_cancel'])
        else public.auth_has_any(array['stock_audit_view','stock_audit_reports','stock_audit_create','stock_audit_count','stock_audit_review','stock_audit_approve','stock_audit_approve_high','stock_audit_cancel'])
      end
    when p_write then
      public.auth_has_any(array['manage_inventory','adjust_stock','transfer_inventory','approve_inventory','create_item','edit_item','manage_purchases'])
    else
      public.auth_has_any(array['view_inventory','manage_inventory','adjust_stock','transfer_inventory','approve_inventory','create_item','edit_item','manage_purchases'])
  end;
$$;
grant execute on function public.inv_doc_allowed(text, boolean) to authenticated;

-- A line is high-variance when it is off by >= 10 units, or by >= 25% of system (and >= 2 units).
create or replace function public.stock_audit_is_high(p_lines jsonb)
returns boolean
language sql immutable as $$
  select coalesce(bool_or(
    abs(coalesce((l ->> 'counted')::numeric, 0) - coalesce((l ->> 'system')::numeric, 0)) >= 10
    or (coalesce((l ->> 'system')::numeric, 0) > 0
        and abs(coalesce((l ->> 'counted')::numeric, 0) - (l ->> 'system')::numeric) >= 2
        and abs(coalesce((l ->> 'counted')::numeric, 0) - (l ->> 'system')::numeric) * 4 >= (l ->> 'system')::numeric)
  ), false)
  from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) l
$$;

create or replace function public.stock_audit_guard()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_me    uuid := public.auth_staff_id();
  v_old   public.inventory_docs;
  v_lines jsonb;
  v_legal text[];
  v_key   text[];
  v_bad   int;
begin
  if auth.uid() is null then
    return new;
  end if;
  if tg_op = 'UPDATE' then
    v_old := old;
  else
    select * into v_old from public.inventory_docs where id = new.id;
  end if;
  if new.doc_type <> 'stock_count' and coalesce(v_old.doc_type, '') <> 'stock_count' then
    return new;
  end if;
  -- New audit
  if v_old.id is null then
    if not coalesce(public.auth_has_any(array['stock_audit_create']), false) then
      raise exception 'stock_audit_forbidden: you do not have access to start a stock audit' using errcode = '42501';
    end if;
    if new.status <> 'draft' then
      raise exception 'stock_audit_bad_status: a new audit must start as draft' using errcode = '23514';
    end if;
    new.data := jsonb_set(coalesce(new.data, '{}'::jsonb), '{createdById}', to_jsonb(coalesce(v_me::text, '')));
    return new;
  end if;
  if v_old.doc_type is distinct from new.doc_type then
    raise exception 'stock_audit_locked: the document type cannot change' using errcode = '23514';
  end if;
  -- Closed audits are frozen.
  if v_old.status in ('approved', 'rejected', 'cancelled') then
    if new.status is distinct from v_old.status or new.lines is distinct from v_old.lines or new.data is distinct from v_old.data then
      raise exception 'stock_audit_locked: a closed audit cannot change' using errcode = '23514';
    end if;
    return new;
  end if;
  -- Identity is frozen: the stored creator always wins.
  new.data := jsonb_set(coalesce(new.data, '{}'::jsonb), '{createdById}', to_jsonb(coalesce(v_old.data ->> 'createdById', '')));
  -- Same status
  if v_old.status = new.status then
    if v_old.status = 'submitted' then
      if new.lines is distinct from v_old.lines or new.data is distinct from v_old.data or new.party is distinct from v_old.party then
        raise exception 'stock_audit_locked: a submitted audit can only move through review' using errcode = '23514';
      end if;
      return new;
    end if;
    -- draft: counting
    if not coalesce(public.auth_has_any(array['stock_audit_count','stock_audit_create']), false) then
      if new.lines is distinct from v_old.lines or new.data is distinct from v_old.data then
        raise exception 'stock_audit_forbidden: you do not have access to enter counts' using errcode = '42501';
      end if;
      return new;
    end if;
  else
    v_legal := case v_old.status
      when 'draft'     then array['submitted','cancelled']
      when 'submitted' then array['approved','rejected','draft','cancelled']
      else array[]::text[]
    end;
    if not (new.status = any (v_legal)) then
      raise exception 'stock_audit_bad_transition: % cannot move to %', v_old.status, new.status using errcode = '23514';
    end if;
    v_key := case
      when v_old.status = 'draft' and new.status = 'submitted' then array['stock_audit_count','stock_audit_create']
      when new.status = 'approved'  then array['stock_audit_approve','stock_audit_approve_high']
      when new.status = 'rejected'  then array['stock_audit_review','stock_audit_approve','stock_audit_approve_high']
      when new.status = 'draft'     then array['stock_audit_review']
      when new.status = 'cancelled' then array['stock_audit_cancel']
    end;
    if not coalesce(public.auth_has_any(v_key), false) then
      raise exception 'stock_audit_forbidden: you do not have access to move an audit to %', new.status using errcode = '42501';
    end if;
  end if;
  -- Server-stamp who entered each count (a client cannot attribute a count to someone else).
  select coalesce(jsonb_agg(
           case
             when (n.l ->> 'counted') is not null and (n.l ->> 'counted') is distinct from (o.l ->> 'counted')
               then jsonb_set(n.l, '{countedById}', to_jsonb(coalesce(v_me::text, '')))
             else jsonb_set(n.l, '{countedById}', coalesce(o.l -> 'countedById', to_jsonb(''::text)))
           end order by n.ord), '[]'::jsonb)
    into v_lines
    from jsonb_array_elements(coalesce(new.lines, '[]'::jsonb)) with ordinality n(l, ord)
    left join jsonb_array_elements(coalesce(v_old.lines, '[]'::jsonb)) with ordinality o(l, ord)
      on (o.l ->> 'itemId') = (n.l ->> 'itemId');
  new.lines := v_lines;
  if new.status = 'draft' and v_old.status = 'draft' then
    return new;
  end if;
  -- Submit: every line counted; a reason for every variance (not asked of blind counters).
  if v_old.status = 'draft' and new.status = 'submitted' then
    select count(*) into v_bad from jsonb_array_elements(new.lines) l where (l ->> 'counted') is null;
    if v_bad > 0 or jsonb_array_length(new.lines) = 0 then
      raise exception 'stock_audit_incomplete: count every item before submitting' using errcode = '23514';
    end if;
    select count(*) into v_bad from jsonb_array_elements(new.lines) l
     where coalesce((l ->> 'counted')::numeric, 0) <> coalesce((l ->> 'system')::numeric, 0)
       and coalesce(btrim(l ->> 'reason'), '') = ''
       and coalesce(v_old.data ->> 'blind', '') <> 'true';   -- blind counters cannot see differences
    if v_bad > 0 then
      raise exception 'stock_audit_reason_required: give a reason for every item with a difference' using errcode = '23514';
    end if;
    new.data := jsonb_set(coalesce(new.data, '{}'::jsonb), '{submittedById}', to_jsonb(coalesce(v_me::text, '')));
    return new;
  end if;
  -- Recount / reject / cancel keep the audit as the reviewer left it.
  if new.status = 'approved' then
    if new.lines is distinct from v_old.lines then
      raise exception 'stock_audit_locked: counts cannot change while approving' using errcode = '23514';
    end if;
    if public.stock_audit_is_high(new.lines) and not coalesce(public.auth_has_any(array['stock_audit_approve_high']), false) then
      raise exception 'stock_audit_high_variance: this audit has a high variance and needs a senior approver' using errcode = '42501';
    end if;
    if v_me is not null and (
         coalesce(v_old.data ->> 'submittedById', '') = v_me::text
         or exists (select 1 from jsonb_array_elements(v_old.lines) l where (l ->> 'countedById') = v_me::text)) then
      if coalesce(public.auth_has_any(array['__owner_only__']), false) then
        new.data := jsonb_set(coalesce(new.data, '{}'::jsonb), '{selfReviewed}', 'true'::jsonb);
      else
        raise exception 'stock_audit_self_approval_forbidden: another approver has to approve an audit you counted' using errcode = '42501';
      end if;
    end if;
  end if;
  new.data := jsonb_set(coalesce(new.data, '{}'::jsonb), '{decidedById}', to_jsonb(coalesce(v_me::text, '')));
  return new;
end;
$$;
drop trigger if exists stock_audit_guard_trg on public.inventory_docs;
create trigger stock_audit_guard_trg
  before insert or update on public.inventory_docs
  for each row execute function public.stock_audit_guard();

-- post_stock_adjust: also allow a Stock Audit approver (see header).
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
          -- A Stock Audit approver may post the variance of an audit that is awaiting approval, and nothing else.
          or (p_type = 'Adjustment'
              and public.auth_has_any(array['stock_audit_approve','stock_audit_approve_high'])
              and exists (select 1 from public.inventory_docs d
                           where d.id = split_part(coalesce(p_doc, ''), '/', 1)
                             and d.doc_type = 'stock_count'
                             and d.organization_id = v_org
                             and d.status = 'submitted'))
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
