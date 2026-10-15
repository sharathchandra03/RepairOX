-- ############################################################################
-- 0075 — INVENTORY MASTER + REPAIR SERVICE COSTING REDESIGN (data foundation)
--
-- Additive + idempotent. Re-runnable: every statement is guarded
-- (add column if not exists / create table if not exists / drop..if exists +
-- recreate / every backfill IS NULL- or = 0-guarded). No destructive drop of
-- an existing column; no bulk rewrite of a historical item_type / mode /
-- price / stock value.
--
-- Design: .agents/tasks/inventory-costing-redesign/inv-design.md §9 (Rev 4).
-- Key decisions encoded here:
--   • Item Type source of truth = new inventory_items.item_kind (item_type/mode
--     retained, kept in sync by the client, never dropped).                §9.1
--   • CP / Standard Labour Cost do NOT live on the broadly-readable
--     inventory_items row — they move to the cost-scoped inventory_item_costs
--     table whose RLS requires a COST capability (HIGH-1).                  §9.4
--   • Per-org PRT-/SRV- counter via next_inventory_code(org, kind), reusing
--     the next_lead_id(p_org_id) per-org precedent — NOT a global sequence
--     (HIGH-3).                                                             §9.2
--   • Ordered, guarded backfill that classifies item_kind, flags (never
--     discards) un-mappable / contradictory legacy rows, seeds codes and
--     PUBLIC prices only (never a cost).                                    §9.3
--   • inventory_item_costs read RLS excludes view_profit_margin (MEDIUM-1);
--     org-level default cost row written with branch_id NULL (MEDIUM-2).
-- ############################################################################


-- ############################################################################
-- SECTION 1 — inventory_items additive columns (NO cost columns here)   §9.1
--   cost_price / standard_labour_cost are DELIBERATELY NOT added here — they
--   live on inventory_item_costs (SECTION 4) so the row every operational role
--   can read carries no cost to leak (HIGH-1).
-- ############################################################################

alter table public.inventory_items add column if not exists item_kind      text;
alter table public.inventory_items add column if not exists item_code      text;
alter table public.inventory_items add column if not exists service_code   text;
alter table public.inventory_items add column if not exists barcode        text;
alter table public.inventory_items add column if not exists brand_model    text;
alter table public.inventory_items add column if not exists description    text;
alter table public.inventory_items add column if not exists selling_price  numeric not null default 0;
alter table public.inventory_items add column if not exists service_charge numeric not null default 0;
alter table public.inventory_items add column if not exists track_stock    boolean not null default true;
alter table public.inventory_items add column if not exists migration_flag text;


-- ############################################################################
-- SECTION 2 — Per-org code counter + stamp trigger (PRT-/SRV-)          §9.2
--   Reuses the race-safe per-org counter precedent public.next_lead_id(org)
--   from 0002_leads.sql — a per-org counter table + for-update increment, NOT
--   a global nextval sequence (HIGH-3). Each org starts at PRT-000001 /
--   SRV-000001; codes are per-org independent.
-- ############################################################################

create table if not exists public.inventory_code_sequences (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  kind            text not null check (kind in ('part', 'service')),
  next_number     integer not null default 1,
  primary key (organization_id, kind)
);

create or replace function public.next_inventory_code(p_org_id uuid, p_kind text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_num    integer;
  v_prefix text;
begin
  v_prefix := case when p_kind = 'service' then 'SRV-' else 'PRT-' end;

  -- Seed the counter above any codes that already exist for this org+kind so
  -- re-running / importing never produces a duplicate.
  insert into public.inventory_code_sequences (organization_id, kind, next_number)
  values (
    p_org_id,
    p_kind,
    coalesce((
      select max((regexp_replace(
                    case when p_kind = 'service' then service_code else item_code end,
                    '\D', '', 'g'))::int)
      from public.inventory_items
      where organization_id = p_org_id
        and item_kind = p_kind
        and (case when p_kind = 'service' then service_code else item_code end) ~ '\d'
    ), 0) + 1
  )
  on conflict (organization_id, kind) do nothing;

  select next_number into v_num
  from public.inventory_code_sequences
  where organization_id = p_org_id and kind = p_kind
  for update;

  update public.inventory_code_sequences
  set next_number = v_num + 1
  where organization_id = p_org_id and kind = p_kind;

  return v_prefix || lpad(v_num::text, 6, '0');
end;
$$;

grant execute on function public.next_inventory_code(uuid, text) to authenticated;

-- BEFORE INSERT stamp: fill item_code (parts) / service_code (services) only
-- when blank, from the per-org counter. Codes are stamped once and never on
-- update (immutable, FR-24 / AC-4).
create or replace function public.inventory_items_stamp_code()
returns trigger
language plpgsql
as $$
begin
  if coalesce(new.item_kind, 'part') = 'service' then
    if new.service_code is null or btrim(new.service_code) = '' then
      new.service_code := public.next_inventory_code(new.organization_id, 'service');
    end if;
  else
    if new.item_code is null or btrim(new.item_code) = '' then
      new.item_code := public.next_inventory_code(new.organization_id, 'part');
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists inventory_items_stamp_code_trg on public.inventory_items;
create trigger inventory_items_stamp_code_trg
  before insert on public.inventory_items
  for each row execute function public.inventory_items_stamp_code();

-- Unique per-org, only where a code is set (nullable until stamped/backfilled).
create unique index if not exists inventory_items_org_item_code_unique
  on public.inventory_items(organization_id, item_code) where item_code is not null;
create unique index if not exists inventory_items_org_service_code_unique
  on public.inventory_items(organization_id, service_code) where service_code is not null;


-- ############################################################################
-- SECTION 3 — Ordered, guarded backfill (idempotent)                    §9.3
--   The stamp trigger is INSERT-only, so EXISTING rows are seeded here. Every
--   statement is IS NULL- / = 0-guarded for re-run safety. Nothing historical
--   (item_type / mode / regular_buying_price / stock) is overwritten; stray
--   stock on a service is PRESERVED and only flagged (AC-22, AC-23).
-- ############################################################################

-- (1) classify item_kind FIRST, from legacy item_type.
update public.inventory_items
   set item_kind = case when item_type = 'Service' then 'service' else 'part' end
 where item_kind is null;

-- (2) flag the un-mappable / contradictory rows (non-destructive).
update public.inventory_items
   set migration_flag = 'unrecognised_item_type'
 where migration_flag is null
   and item_type is not null
   and item_type not in ('Product', 'Service');

update public.inventory_items
   set migration_flag = 'service_with_stock'
 where migration_flag is null
   and item_kind = 'service'
   and (coalesce(current_stock, 0) <> 0
        or coalesce(min_stock, 0) <> 0
        or coalesce(max_stock, 0) <> 0);

-- (3) seed codes keyed on item_kind (one distinct value per row — the function
--     is volatile, so a set-based update allocates per row).
update public.inventory_items
   set item_code = public.next_inventory_code(organization_id, 'part')
 where item_kind = 'part' and item_code is null;

update public.inventory_items
   set service_code = public.next_inventory_code(organization_id, 'service')
 where item_kind = 'service' and service_code is null;

-- (4) seed PUBLIC prices only (never the cost — CP stays absent ⇒ "Cost not
--     configured", never the synthetic regular_buying_price).
update public.inventory_items
   set selling_price = regular_selling_price
 where coalesce(selling_price, 0) = 0 and coalesce(regular_selling_price, 0) <> 0;

update public.inventory_items
   set service_charge = regular_selling_price
 where item_kind = 'service'
   and coalesce(service_charge, 0) = 0
   and coalesce(regular_selling_price, 0) <> 0;


-- ############################################################################
-- SECTION 4 — Cost-scoped table inventory_item_costs                    §9.4
--   PK item_id only ⇒ exactly one org-level default cost row per item.
--   branch_id written NULL (org-level default) so auth_branch_visible(NULL) is
--   true for every cost-capable org member (MEDIUM-2). RLS read set is COST
--   keys ONLY — view_profit_margin deliberately excluded (MEDIUM-1).      §9.7
-- ############################################################################

create table if not exists public.inventory_item_costs (
  item_id              text primary key references public.inventory_items(id) on delete cascade,
  organization_id      uuid not null default public.auth_org_id() references public.organizations(id) on delete cascade,
  branch_id            uuid default null references public.branches(id) on delete set null,
  cost_price           numeric not null default 0,
  standard_labour_cost numeric not null default 0,
  cost_configured      boolean not null default false,
  updated_at           timestamptz not null default now(),
  updated_by           uuid default public.auth_staff_id() references public.staff(id) on delete set null
);


-- ############################################################################
-- SECTION 5 — Cost-carrying stock ledger inventory_stock_layers         §9.5
--   One row per cost-carrying receipt (opening | purchase). Branch-scoped on
--   the ACTUAL receiving store. Weighted-average valuation reads this first,
--   falling back to the org-level default CP.
-- ############################################################################

create table if not exists public.inventory_stock_layers (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null default public.auth_org_id() references public.organizations(id) on delete cascade,
  branch_id           uuid default public.auth_branch_id() references public.branches(id) on delete set null,
  item_id             text not null references public.inventory_items(id) on delete cascade,
  source              text not null default 'purchase',   -- opening | purchase
  qty_in              numeric not null default 0,
  unit_cost           numeric not null default 0,
  movement_doc_number text,                               -- optional link to stock_movements
  received_at         timestamptz not null default now(),
  created_by          uuid default public.auth_staff_id() references public.staff(id) on delete set null,
  created_at          timestamptz not null default now()
);

create index if not exists inventory_stock_layers_item_idx   on public.inventory_stock_layers(item_id);
create index if not exists inventory_stock_layers_branch_idx on public.inventory_stock_layers(branch_id);


-- ############################################################################
-- SECTION 6 — stock_movements additive cost columns (optional link)     §9.6
--   All nullable, so legacy movements stay valid.
-- ############################################################################

alter table public.stock_movements add column if not exists item_id     text;
alter table public.stock_movements add column if not exists unit_cost   numeric;
alter table public.stock_movements add column if not exists total_value numeric;


-- ############################################################################
-- SECTION 7 — RLS (cost-capability-gated — HIGH-1 / AC-21)              §9.7
--   Uses existing helpers (auth_member_of_org, auth_branch_visible,
--   auth_has_any) from 0001. No NEW permission KEYS — policy wiring only.
--   view_profit_margin is DELIBERATELY NOT in the cost read set (MEDIUM-1):
--   a profit-only viewer never reads a raw CP / labour / unit_cost row.
-- ############################################################################

alter table public.inventory_item_costs   enable row level security;
alter table public.inventory_stock_layers enable row level security;

-- ── inventory_item_costs ─────────────────────────────────────────────────────
drop policy if exists inventory_item_costs_select on public.inventory_item_costs;
create policy inventory_item_costs_select on public.inventory_item_costs
  for select to authenticated
  using (
    public.auth_member_of_org(organization_id)
    and public.auth_branch_visible(branch_id)
    and public.auth_has_any(array['inventory_view_cost','inventory_edit_cost','manage_inventory','manage_purchases'])
  );

drop policy if exists inventory_item_costs_insert on public.inventory_item_costs;
create policy inventory_item_costs_insert on public.inventory_item_costs
  for insert to authenticated
  with check (
    public.auth_member_of_org(organization_id)
    and public.auth_branch_visible(branch_id)
    and public.auth_has_any(array['inventory_edit_cost','manage_inventory','manage_purchases'])
  );

drop policy if exists inventory_item_costs_update on public.inventory_item_costs;
create policy inventory_item_costs_update on public.inventory_item_costs
  for update to authenticated
  using (
    public.auth_member_of_org(organization_id)
    and public.auth_branch_visible(branch_id)
    and public.auth_has_any(array['inventory_edit_cost','manage_inventory','manage_purchases'])
  )
  with check (
    public.auth_member_of_org(organization_id)
    and public.auth_branch_visible(branch_id)
    and public.auth_has_any(array['inventory_edit_cost','manage_inventory','manage_purchases'])
  );

drop policy if exists inventory_item_costs_delete on public.inventory_item_costs;
create policy inventory_item_costs_delete on public.inventory_item_costs
  for delete to authenticated
  using (
    public.auth_member_of_org(organization_id)
    and public.auth_branch_visible(branch_id)
    and public.auth_has_any(array['inventory_edit_cost','manage_inventory','manage_purchases'])
  );

-- ── inventory_stock_layers ───────────────────────────────────────────────────
drop policy if exists inventory_stock_layers_select on public.inventory_stock_layers;
create policy inventory_stock_layers_select on public.inventory_stock_layers
  for select to authenticated
  using (
    public.auth_member_of_org(organization_id)
    and public.auth_branch_visible(branch_id)
    and public.auth_has_any(array['inventory_view_cost','inventory_edit_cost','manage_inventory','manage_purchases'])
  );

drop policy if exists inventory_stock_layers_insert on public.inventory_stock_layers;
create policy inventory_stock_layers_insert on public.inventory_stock_layers
  for insert to authenticated
  with check (
    public.auth_member_of_org(organization_id)
    and public.auth_branch_visible(branch_id)
    and public.auth_has_any(array['manage_inventory','manage_purchases','adjust_stock'])
  );

drop policy if exists inventory_stock_layers_update on public.inventory_stock_layers;
create policy inventory_stock_layers_update on public.inventory_stock_layers
  for update to authenticated
  using (
    public.auth_member_of_org(organization_id)
    and public.auth_branch_visible(branch_id)
    and public.auth_has_any(array['manage_inventory','manage_purchases','adjust_stock'])
  )
  with check (
    public.auth_member_of_org(organization_id)
    and public.auth_branch_visible(branch_id)
    and public.auth_has_any(array['manage_inventory','manage_purchases','adjust_stock'])
  );

drop policy if exists inventory_stock_layers_delete on public.inventory_stock_layers;
create policy inventory_stock_layers_delete on public.inventory_stock_layers
  for delete to authenticated
  using (
    public.auth_member_of_org(organization_id)
    and public.auth_branch_visible(branch_id)
    and public.auth_has_any(array['manage_inventory','manage_purchases','adjust_stock'])
  );

-- ############################################################################
-- END 0075
-- ############################################################################
