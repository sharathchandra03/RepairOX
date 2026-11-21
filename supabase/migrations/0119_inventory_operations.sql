-- ============================================================================
-- 0119 — Inventory operations (Phases 2 + 3)
--
--   inventory_vendors   Vendor master
--   inventory_docs      ONE document table for every inventory workflow:
--                       purchase_order · grn · vendor_return · transfer ·
--                       stock_count · write_off · old_part · warranty_claim
--                       (typed key columns + `lines`/`data` jsonb)
--   inventory_serials   Serial / IMEI unit register
--   inventory_items     + grade, variant_group, warranty_months (part variants)
--   post_stock_adjust() Atomic stock +/- with cost-layer handling + movement row
--
-- COST SAFETY: purchase_order / grn / vendor_return documents carry unit costs.
-- They are readable/writable ONLY by purchasing keys (manage_purchases,
-- manage_vendors, manage_inventory) — never by a plain inventory viewer or a
-- Sales Agent. Every other document type carries quantities only.
--
-- Additive + idempotent. Reuses auth_member_of_org / auth_branch_visible /
-- auth_has_any / auth_org_id / auth_branch_id / auth_staff_id.
-- ============================================================================

-- ── 1. Variant columns on the item master ───────────────────────────────────
alter table public.inventory_items add column if not exists grade           text;
alter table public.inventory_items add column if not exists variant_group   text;
alter table public.inventory_items add column if not exists warranty_months integer;

-- ── 2. Access helper (type-aware) ───────────────────────────────────────────
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
    when p_write then
      public.auth_has_any(array['manage_inventory','adjust_stock','transfer_inventory','approve_inventory','create_item','edit_item','manage_purchases'])
    else
      public.auth_has_any(array['view_inventory','manage_inventory','adjust_stock','transfer_inventory','approve_inventory','create_item','edit_item','manage_purchases'])
  end;
$$;
grant execute on function public.inv_doc_allowed(text, boolean) to authenticated;

-- ── 3. Vendors ──────────────────────────────────────────────────────────────
create table if not exists public.inventory_vendors (
  id              text primary key,
  organization_id uuid not null default public.auth_org_id() references public.organizations(id) on delete cascade,
  branch_id       uuid default public.auth_branch_id() references public.branches(id) on delete set null,
  name            text not null,
  contact_person  text,
  phone           text,
  email           text,
  gst_number      text,
  address         text,
  payment_terms   text,
  lead_time_days  integer,
  notes           text,
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists inventory_vendors_org_idx on public.inventory_vendors(organization_id);

-- ── 4. Documents ────────────────────────────────────────────────────────────
create table if not exists public.inventory_docs (
  id              text primary key,                                   -- PO-0001, GRN-0001, …
  organization_id uuid not null default public.auth_org_id() references public.organizations(id) on delete cascade,
  branch_id       uuid default public.auth_branch_id() references public.branches(id) on delete set null,
  doc_type        text not null check (doc_type in
                    ('purchase_order','grn','vendor_return','transfer','stock_count','write_off','old_part','warranty_claim')),
  status          text not null default 'draft',
  party           text,                                               -- vendor / destination store / ticket ref
  ref             text,                                               -- linked document or ticket id
  lines           jsonb not null default '[]'::jsonb,
  data            jsonb not null default '{}'::jsonb,
  created_by      uuid default public.auth_staff_id() references public.staff(id) on delete set null,
  created_by_name text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists inventory_docs_org_type_idx on public.inventory_docs(organization_id, doc_type, created_at desc);
create index if not exists inventory_docs_ref_idx      on public.inventory_docs(organization_id, ref);

-- ── 5. Serial / IMEI register ───────────────────────────────────────────────
create table if not exists public.inventory_serials (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.auth_org_id() references public.organizations(id) on delete cascade,
  branch_id       uuid default public.auth_branch_id() references public.branches(id) on delete set null,
  item_id         text not null references public.inventory_items(id) on delete cascade,
  serial          text not null,
  status          text not null default 'in_stock'
                    check (status in ('in_stock','installed','sold','returned','rma','scrapped')),
  ticket_id       text,
  vendor          text,
  received_doc    text,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create unique index if not exists inventory_serials_org_serial_uq on public.inventory_serials(organization_id, lower(serial));
create index if not exists inventory_serials_item_idx on public.inventory_serials(item_id);

-- ── 6. RLS ──────────────────────────────────────────────────────────────────
alter table public.inventory_vendors enable row level security;
alter table public.inventory_docs    enable row level security;
alter table public.inventory_serials enable row level security;

drop policy if exists inventory_vendors_sel on public.inventory_vendors;
create policy inventory_vendors_sel on public.inventory_vendors for select using (
  public.auth_member_of_org(organization_id) and public.auth_branch_visible(branch_id)
  and public.inv_doc_allowed('purchase_order', false)
);
drop policy if exists inventory_vendors_ins on public.inventory_vendors;
create policy inventory_vendors_ins on public.inventory_vendors for insert with check (
  public.auth_member_of_org(organization_id) and public.auth_branch_visible(branch_id)
  and public.inv_doc_allowed('purchase_order', true)
);
drop policy if exists inventory_vendors_upd on public.inventory_vendors;
create policy inventory_vendors_upd on public.inventory_vendors for update using (
  public.auth_member_of_org(organization_id) and public.auth_branch_visible(branch_id)
  and public.inv_doc_allowed('purchase_order', true)
);
drop policy if exists inventory_vendors_del on public.inventory_vendors;
create policy inventory_vendors_del on public.inventory_vendors for delete using (
  public.auth_member_of_org(organization_id) and public.auth_branch_visible(branch_id)
  and public.auth_has_any(array['manage_vendors','manage_inventory'])
);

drop policy if exists inventory_docs_sel on public.inventory_docs;
create policy inventory_docs_sel on public.inventory_docs for select using (
  public.auth_member_of_org(organization_id) and public.auth_branch_visible(branch_id)
  and public.inv_doc_allowed(doc_type, false)
);
drop policy if exists inventory_docs_ins on public.inventory_docs;
create policy inventory_docs_ins on public.inventory_docs for insert with check (
  public.auth_member_of_org(organization_id) and public.auth_branch_visible(branch_id)
  and public.inv_doc_allowed(doc_type, true)
);
drop policy if exists inventory_docs_upd on public.inventory_docs;
create policy inventory_docs_upd on public.inventory_docs for update using (
  public.auth_member_of_org(organization_id) and public.auth_branch_visible(branch_id)
  and public.inv_doc_allowed(doc_type, true)
) with check (
  public.auth_member_of_org(organization_id) and public.inv_doc_allowed(doc_type, true)
);
drop policy if exists inventory_docs_del on public.inventory_docs;
create policy inventory_docs_del on public.inventory_docs for delete using (
  public.auth_member_of_org(organization_id) and public.auth_branch_visible(branch_id)
  and status = 'draft' and public.inv_doc_allowed(doc_type, true)
);

drop policy if exists inventory_serials_sel on public.inventory_serials;
create policy inventory_serials_sel on public.inventory_serials for select using (
  public.auth_member_of_org(organization_id) and public.auth_branch_visible(branch_id)
  and public.inv_doc_allowed('transfer', false)
);
drop policy if exists inventory_serials_ins on public.inventory_serials;
create policy inventory_serials_ins on public.inventory_serials for insert with check (
  public.auth_member_of_org(organization_id) and public.auth_branch_visible(branch_id)
  and public.inv_doc_allowed('transfer', true)
);
drop policy if exists inventory_serials_upd on public.inventory_serials;
create policy inventory_serials_upd on public.inventory_serials for update using (
  public.auth_member_of_org(organization_id) and public.auth_branch_visible(branch_id)
  and public.inv_doc_allowed('transfer', true)
);
drop policy if exists inventory_serials_del on public.inventory_serials;
create policy inventory_serials_del on public.inventory_serials for delete using (
  public.auth_member_of_org(organization_id) and public.auth_branch_visible(branch_id)
  and public.auth_has_any(array['manage_inventory'])
);

-- ── 7. Realtime ─────────────────────────────────────────────────────────────
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['inventory_vendors','inventory_docs','inventory_serials'] loop
      begin
        execute format('alter publication supabase_realtime add table public.%I', t);
      exception when duplicate_object then null;
      end;
    end loop;
  end if;
end $$;

-- ── 8. Atomic stock adjustment ──────────────────────────────────────────────
-- p_delta > 0  → stock in. A cost layer is opened at p_unit_cost, or at the
--                item's weighted-average cost when none is given.
-- p_delta < 0  → stock out. Cost layers are depleted FIFO; the balance can
--                never go below zero.
-- Always writes ONE stock_movements row (no cost on it) and moves the balance
-- in the same transaction. p_type ∈ Inward | Outward | Adjustment | Transfer | Return.
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
     or not public.auth_has_any(array['manage_inventory','adjust_stock','transfer_inventory','approve_inventory','manage_purchases']) then
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
