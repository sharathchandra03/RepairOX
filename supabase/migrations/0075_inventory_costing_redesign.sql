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

-- The sequence counter is internal state (SYS-7). Enable RLS and grant NO
-- end-user policies: `authenticated` can neither select nor mutate it directly,
-- so a caller cannot peek at or advance another org's counter. The only writer
-- is next_inventory_code(), which is SECURITY DEFINER and therefore runs as the
-- table owner (bypassing RLS). Revoke table privileges from authenticated for
-- defence in depth.
alter table public.inventory_code_sequences enable row level security;
revoke all on public.inventory_code_sequences from authenticated;

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
  -- Bind the allocator to the AUTHENTICATED organization (SYS-7): a logged-in
  -- caller may only advance their OWN org's counter, never another tenant's by
  -- passing a foreign p_org_id. Service-role / trigger context has no end-user
  -- JWT (auth_org_id() is null) and is trusted to pass the row's real org.
  if public.auth_org_id() is not null and p_org_id is distinct from public.auth_org_id() then
    raise exception 'next_inventory_code: cross-organization code allocation denied'
      using errcode = '42501';
  end if;

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

-- BEFORE INSERT stamp: the code is SERVER-AUTHORITATIVE (SYS-7). For an
-- end-user insert (auth_org_id() present) ANY client-supplied code is IGNORED
-- and OVERWRITTEN from the per-org counter, so a caller can never choose or
-- spoof a PRT-/SRV- identity. The opposite-kind code is cleared. A service-role
-- restore (no end-user JWT) that already carries a valid, correctly-prefixed
-- code is honoured so historical rows re-import unchanged.
create or replace function public.inventory_items_stamp_code()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_end_user boolean := public.auth_org_id() is not null;
begin
  if coalesce(new.item_kind, 'part') = 'service' then
    new.item_code := null;  -- a service never carries a part code
    if v_is_end_user
       or new.service_code is null
       or btrim(new.service_code) = ''
       or new.service_code !~ '^SRV-\d+$' then
      new.service_code := public.next_inventory_code(new.organization_id, 'service');
    end if;
  else
    new.service_code := null;  -- a part never carries a service code
    if v_is_end_user
       or new.item_code is null
       or btrim(new.item_code) = ''
       or new.item_code !~ '^PRT-\d+$' then
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

-- BEFORE UPDATE immutability guard: once stamped, item_code / service_code can
-- NEVER change (FR-24 / AC-4 / SYS-7). Any attempt to mutate a non-null code to
-- a different value is reverted to the stored value, so an authorized update can
-- never rename an assigned code.
create or replace function public.inventory_items_lock_code()
returns trigger
language plpgsql
as $$
begin
  if old.item_code is not null and new.item_code is distinct from old.item_code then
    new.item_code := old.item_code;
  end if;
  if old.service_code is not null and new.service_code is distinct from old.service_code then
    new.service_code := old.service_code;
  end if;
  return new;
end;
$$;

drop trigger if exists inventory_items_lock_code_trg on public.inventory_items;
create trigger inventory_items_lock_code_trg
  before update on public.inventory_items
  for each row execute function public.inventory_items_lock_code();

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
--
--     RERUN SAFETY (SYS-5): `coalesce(selling_price,0)=0` cannot tell the
--     column's initial default-0 apart from a LATER intentional ₹0 the new
--     model wrote, so replaying this file after normal use could overwrite an
--     intentional zero with the legacy regular_selling_price. We gate the
--     one-time price seed behind a persistent marker in schema_backfill_marks
--     so it runs EXACTLY ONCE per database and a rerun is a genuine no-op.
create table if not exists public.schema_backfill_marks (
  mark       text primary key,
  applied_at timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from public.schema_backfill_marks where mark = '0075_public_price_seed') then
    update public.inventory_items
       set selling_price = regular_selling_price
     where coalesce(selling_price, 0) = 0 and coalesce(regular_selling_price, 0) <> 0;

    update public.inventory_items
       set service_charge = regular_selling_price
     where item_kind = 'service'
       and coalesce(service_charge, 0) = 0
       and coalesce(regular_selling_price, 0) <> 0;

    insert into public.schema_backfill_marks (mark) values ('0075_public_price_seed');
  end if;
end;
$$;


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
-- SECTION 5b — Cost-scoped invoice line-cost snapshot (SYS-1)
--   The per-line resolved cost snapshot used to live inline in the broadly-
--   readable invoices.items / devices.records JSON, so roles WITHOUT a cost key
--   (manage_invoices / manage_payments / view_financial_reports / manage_sales)
--   received raw cost over PostgREST / the client store. It is RELOCATED here to
--   a cost-scoped table whose RLS requires a COST key, so a non-cost reader can
--   never pull a raw per-unit cost. The snapshot stays IMMUTABLE historical data
--   (editing catalogue CP/SP never rewrites a finalized invoice's stored cost) —
--   only WHERE it lives changed. One row per (invoice_id, line_id).
-- ############################################################################

create table if not exists public.invoice_line_costs (
  invoice_id      text not null references public.invoices(id) on delete cascade,
  line_id         text not null,
  organization_id uuid not null default public.auth_org_id() references public.organizations(id) on delete cascade,
  branch_id       uuid default public.auth_branch_id() references public.branches(id) on delete set null,
  kind            text,                                   -- part | service (non-sensitive, mirrors the public line)
  qty             numeric not null default 0,
  cost            numeric,                                -- resolved per-unit cost snapshot; null ⇒ not configured
  cost_state      text,                                   -- resolved | cp | not_configured
  updated_at      timestamptz not null default now(),
  updated_by      uuid default public.auth_staff_id() references public.staff(id) on delete set null,
  primary key (invoice_id, line_id)
);

create index if not exists invoice_line_costs_invoice_idx on public.invoice_line_costs(invoice_id);


-- ############################################################################
-- SECTION 6 — stock_movements additive cost columns (optional link)     §9.6
--   All nullable, so legacy movements stay valid.
-- ############################################################################

alter table public.stock_movements add column if not exists item_id     text;
alter table public.stock_movements add column if not exists unit_cost   numeric;
alter table public.stock_movements add column if not exists total_value numeric;


-- ############################################################################
-- SECTION 6b — Parent-scope guard on child cost / layer rows (SYS-8)
--   inventory_item_costs and inventory_stock_layers each carry their OWN
--   organization_id/branch_id plus a plain FK to inventory_items(id). RLS only
--   validates the CHILD fields, so a crafted write could bind an authorized
--   child row to an item in ANOTHER org/store whose text id is known. These
--   BEFORE INSERT/UPDATE triggers STAMP the child's organization_id from the
--   parent item authoritatively and REJECT any mismatch — the child can never
--   be attached to an item outside its organization.
-- ############################################################################

create or replace function public.inventory_item_costs_scope_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item_org uuid;
begin
  select organization_id into v_item_org
  from public.inventory_items where id = new.item_id;

  if v_item_org is null then
    raise exception 'inventory_item_costs: parent item % not found', new.item_id
      using errcode = '23503';
  end if;

  -- Authoritatively stamp org from the parent; a mismatch supplied by the
  -- caller is a hard error, never silently accepted.
  if new.organization_id is null then
    new.organization_id := v_item_org;
  elsif new.organization_id is distinct from v_item_org then
    raise exception 'inventory_item_costs: organization_id % does not match parent item org %',
      new.organization_id, v_item_org using errcode = '42501';
  end if;

  -- The org-level default cost row is branch-agnostic (branch_id NULL, §9.4).
  new.branch_id := null;
  return new;
end;
$$;

drop trigger if exists inventory_item_costs_scope_guard_trg on public.inventory_item_costs;
create trigger inventory_item_costs_scope_guard_trg
  before insert or update on public.inventory_item_costs
  for each row execute function public.inventory_item_costs_scope_guard();

create or replace function public.inventory_stock_layers_scope_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item_org    uuid;
  v_item_branch uuid;
begin
  select organization_id, branch_id into v_item_org, v_item_branch
  from public.inventory_items where id = new.item_id;

  if v_item_org is null then
    raise exception 'inventory_stock_layers: parent item % not found', new.item_id
      using errcode = '23503';
  end if;

  if new.organization_id is null then
    new.organization_id := v_item_org;
  elsif new.organization_id is distinct from v_item_org then
    raise exception 'inventory_stock_layers: organization_id % does not match parent item org %',
      new.organization_id, v_item_org using errcode = '42501';
  end if;

  -- A stock layer is a per-store physical receipt. Default the layer branch to
  -- the item's own stock branch when the caller leaves it blank; a non-null
  -- branch that contradicts the item's branch is rejected (a layer can only be
  -- received into the item's store). When the item itself is branchless
  -- (org-wide), any authorized branch is allowed through RLS.
  if new.branch_id is null then
    new.branch_id := v_item_branch;
  elsif v_item_branch is not null and new.branch_id is distinct from v_item_branch then
    raise exception 'inventory_stock_layers: branch_id % does not match parent item branch %',
      new.branch_id, v_item_branch using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists inventory_stock_layers_scope_guard_trg on public.inventory_stock_layers;
create trigger inventory_stock_layers_scope_guard_trg
  before insert or update on public.inventory_stock_layers
  for each row execute function public.inventory_stock_layers_scope_guard();


-- ############################################################################
-- SECTION 6c — Atomic opening-stock receipt RPC (SYS-9)
--   Opening stock used to be posted as THREE independent client requests (layer
--   insert, movement insert, current_stock update); a mid-sequence failure left
--   master quantity, layer and movement diverged. This RPC performs all three
--   as ONE fail-closed transaction (a function body is a single transaction), so
--   either every row is written or none is. Scope (org/branch) is stamped
--   authoritatively from the item + caller, never trusted from the client.
-- ############################################################################

create or replace function public.post_opening_stock(
  p_item_id   text,
  p_qty       numeric,
  p_unit_cost numeric
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org    uuid;
  v_branch uuid;
  v_store  text;
  v_doc    text;
begin
  if p_qty is null or p_qty <= 0 then
    raise exception 'post_opening_stock: opening quantity must be > 0' using errcode = '22023';
  end if;

  select organization_id, branch_id, store into v_org, v_branch, v_store
  from public.inventory_items where id = p_item_id;
  if v_org is null then
    raise exception 'post_opening_stock: item % not found', p_item_id using errcode = '23503';
  end if;

  -- Authorize: the caller must be an org member able to add stock (same key set
  -- as the inventory_stock_layers write policy). A non-authorized caller is
  -- rejected before anything is written.
  if public.auth_org_id() is not null then
    if not public.auth_member_of_org(v_org)
       or not public.auth_has_any(array['manage_inventory','manage_purchases','adjust_stock']) then
      raise exception 'post_opening_stock: not authorized' using errcode = '42501';
    end if;
  end if;

  v_doc := 'MOV-OPEN-' || replace(gen_random_uuid()::text, '-', '');

  -- (1) cost-carrying ledger layer (scope stamped by the layer guard trigger)
  insert into public.inventory_stock_layers (organization_id, branch_id, item_id, source, qty_in, unit_cost, movement_doc_number)
  values (v_org, v_branch, p_item_id, 'opening', p_qty, coalesce(p_unit_cost, 0), v_doc);

  -- (2) the Inward quantity movement (quantity still flows through the existing
  --     stock-movement engine). unit_cost/total_value are DELIBERATELY NOT
  --     written here (SYS-1) — the cost dimension lives only on the cost-gated
  --     ledger layer, never on the broadly-readable movement row.
  insert into public.stock_movements (doc_number, organization_id, branch_id, from_store, to_store, items, movement_date, movement_user, movement_type, status, item_id)
  values (v_doc, v_org, v_branch, 'Opening Balance', v_store, p_qty, to_char(now(), 'DD/MM/YYYY'), '', 'Inward', 'completed', p_item_id);

  -- (3) set the opening balance on the master
  update public.inventory_items set current_stock = p_qty, updated_at = now() where id = p_item_id;
end;
$$;

grant execute on function public.post_opening_stock(text, numeric, numeric) to authenticated;


-- ############################################################################
-- SECTION 6d — Branch-scoped weighted-average cost read (LEDGER-DISCONNECT)
--   The valuation engine must READ the real stock-layer cost, not fall back to
--   org CP for every line. This cost-gated reader returns the branch-scoped
--   weighted-average unit cost for an item (Σ qty_in·unit_cost / Σ qty_in) over
--   the layers visible to the caller, or NULL when there are no layers (caller
--   then falls back to org CP). It is SECURITY INVOKER so RLS on
--   inventory_stock_layers still applies — a non-cost caller gets NULL, never a
--   cost. Used server-side (service role) by the profit route and on the
--   cost-authorized client save to snapshot line.cost.
-- ############################################################################

create or replace function public.inventory_weighted_avg_cost(p_item_id text)
returns numeric
language sql
stable
security invoker
set search_path = public
as $$
  select case when sum(qty_in) > 0 then sum(qty_in * unit_cost) / sum(qty_in) else null end
  from public.inventory_stock_layers
  where item_id = p_item_id;
$$;

grant execute on function public.inventory_weighted_avg_cost(text) to authenticated;


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

-- WRITE set = CAP.sensitive.editCost EXACTLY (inventory_edit_cost /
-- manage_inventory) — manage_purchases is DELIBERATELY NOT here (SYS-2). The
-- org-level item-master CP (this table) is edited only by cost editors; a
-- purchase manager's receipt-cost capture lives on inventory_stock_layers (the
-- branch stock layer), whose write set DOES include manage_purchases. Keeping
-- these two write sets distinct is the CAP↔RLS lockstep the matrix requires.
drop policy if exists inventory_item_costs_insert on public.inventory_item_costs;
create policy inventory_item_costs_insert on public.inventory_item_costs
  for insert to authenticated
  with check (
    public.auth_member_of_org(organization_id)
    and public.auth_branch_visible(branch_id)
    and public.auth_has_any(array['inventory_edit_cost','manage_inventory'])
  );

drop policy if exists inventory_item_costs_update on public.inventory_item_costs;
create policy inventory_item_costs_update on public.inventory_item_costs
  for update to authenticated
  using (
    public.auth_member_of_org(organization_id)
    and public.auth_branch_visible(branch_id)
    and public.auth_has_any(array['inventory_edit_cost','manage_inventory'])
  )
  with check (
    public.auth_member_of_org(organization_id)
    and public.auth_branch_visible(branch_id)
    and public.auth_has_any(array['inventory_edit_cost','manage_inventory'])
  );

drop policy if exists inventory_item_costs_delete on public.inventory_item_costs;
create policy inventory_item_costs_delete on public.inventory_item_costs
  for delete to authenticated
  using (
    public.auth_member_of_org(organization_id)
    and public.auth_branch_visible(branch_id)
    and public.auth_has_any(array['inventory_edit_cost','manage_inventory'])
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

-- ── invoice_line_costs (SYS-1) ───────────────────────────────────────────────
--   Read requires a COST key (view_profit_margin DELIBERATELY excluded, same as
--   the other cost tables) so a non-cost invoice reader never pulls raw cost.
--   Write requires an edit-cost key (the snapshot is stamped by a cost-authorized
--   save). The parent-scope guard below stamps org/branch from the parent invoice
--   so a child row can never be bound to another org's invoice (SYS-8 shape).
alter table public.invoice_line_costs enable row level security;

create or replace function public.invoice_line_costs_scope_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv_org    uuid;
  v_inv_branch uuid;
begin
  select organization_id, branch_id into v_inv_org, v_inv_branch
  from public.invoices where id = new.invoice_id;
  if v_inv_org is null then
    raise exception 'invoice_line_costs: parent invoice % not found', new.invoice_id
      using errcode = '23503';
  end if;
  if new.organization_id is null then
    new.organization_id := v_inv_org;
  elsif new.organization_id is distinct from v_inv_org then
    raise exception 'invoice_line_costs: organization_id % does not match parent invoice org %',
      new.organization_id, v_inv_org using errcode = '42501';
  end if;
  if new.branch_id is null then
    new.branch_id := v_inv_branch;
  end if;
  return new;
end;
$$;

drop trigger if exists invoice_line_costs_scope_guard_trg on public.invoice_line_costs;
create trigger invoice_line_costs_scope_guard_trg
  before insert or update on public.invoice_line_costs
  for each row execute function public.invoice_line_costs_scope_guard();

drop policy if exists invoice_line_costs_select on public.invoice_line_costs;
create policy invoice_line_costs_select on public.invoice_line_costs
  for select to authenticated
  using (
    public.auth_member_of_org(organization_id)
    and public.auth_branch_visible(branch_id)
    and public.auth_has_any(array['inventory_view_cost','inventory_edit_cost','manage_inventory','manage_purchases'])
  );

drop policy if exists invoice_line_costs_insert on public.invoice_line_costs;
create policy invoice_line_costs_insert on public.invoice_line_costs
  for insert to authenticated
  with check (
    public.auth_member_of_org(organization_id)
    and public.auth_branch_visible(branch_id)
    and public.auth_has_any(array['inventory_view_cost','inventory_edit_cost','manage_inventory','manage_purchases'])
  );

drop policy if exists invoice_line_costs_update on public.invoice_line_costs;
create policy invoice_line_costs_update on public.invoice_line_costs
  for update to authenticated
  using (
    public.auth_member_of_org(organization_id)
    and public.auth_branch_visible(branch_id)
    and public.auth_has_any(array['inventory_view_cost','inventory_edit_cost','manage_inventory','manage_purchases'])
  )
  with check (
    public.auth_member_of_org(organization_id)
    and public.auth_branch_visible(branch_id)
    and public.auth_has_any(array['inventory_view_cost','inventory_edit_cost','manage_inventory','manage_purchases'])
  );

drop policy if exists invoice_line_costs_delete on public.invoice_line_costs;
create policy invoice_line_costs_delete on public.invoice_line_costs
  for delete to authenticated
  using (
    public.auth_member_of_org(organization_id)
    and public.auth_branch_visible(branch_id)
    and public.auth_has_any(array['inventory_view_cost','inventory_edit_cost','manage_inventory','manage_purchases'])
  );

-- ############################################################################
-- END 0075
-- ############################################################################
