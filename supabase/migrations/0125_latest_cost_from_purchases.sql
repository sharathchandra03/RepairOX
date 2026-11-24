-- ============================================================================
-- 0125 — Latest cost = Cost price, kept current by purchases + cost audit
--
-- Business rules (agreed with the owner):
--   • LATEST COST is the item's Cost price (inventory_item_costs.cost_price).
--     It changes when someone edits the cost price, AND automatically whenever
--     stock is received at a real buying price (GRN / purchase / opening stock):
--     the received unit cost becomes the new cost price.
--   • Gross profit and margin use the latest cost.
--   • AVERAGE COST is the simple average of the buying prices of purchases
--     received in the last 3 months. It is computed in the app
--     (lib/inventory-costing.ts) from inventory_stock_layers; adjustment /
--     transfer layers are not purchases and are excluded.
--
-- cost_change_log is the append-only audit of every cost price change (manual
-- or from a receipt). Readable only by cost keys; no client write policy.
-- Additive + idempotent.
-- ============================================================================

create table if not exists public.cost_change_log (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  item_id         text not null,
  old_cost        numeric,
  new_cost        numeric not null,
  source          text not null default 'manual',   -- manual | purchase | opening
  changed_by      uuid references public.staff(id) on delete set null,
  changed_by_name text,
  changed_at      timestamptz not null default now()
);
create index if not exists cost_change_log_item_idx on public.cost_change_log (item_id, changed_at desc);
create index if not exists cost_change_log_org_idx  on public.cost_change_log (organization_id, changed_at desc);

alter table public.cost_change_log enable row level security;
drop policy if exists cost_change_log_select on public.cost_change_log;
create policy cost_change_log_select on public.cost_change_log
  for select to authenticated
  using (
    public.auth_member_of_org(organization_id)
    and coalesce(public.auth_has_any(array['inventory_view_cost','inventory_edit_cost','manage_inventory','manage_purchases']), false)
  );

-- Log every cost price change.
create or replace function public.inventory_item_costs_log_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff uuid := public.auth_staff_id();
  v_name  text;
begin
  if tg_op = 'UPDATE' and new.cost_price is not distinct from old.cost_price then
    return new;
  end if;
  if coalesce(new.cost_configured, false) = false then
    return new;
  end if;
  if v_staff is not null then
    select name into v_name from public.staff where id = v_staff;
  end if;
  insert into public.cost_change_log (organization_id, item_id, old_cost, new_cost, source, changed_by, changed_by_name)
  values (
    new.organization_id, new.item_id,
    case when tg_op = 'UPDATE' and coalesce(old.cost_configured, false) then old.cost_price end,
    new.cost_price,
    coalesce(nullif(current_setting('app.cost_source', true), ''), 'manual'),
    v_staff, v_name
  );
  return new;
end $$;

drop trigger if exists inventory_item_costs_log_change_trg on public.inventory_item_costs;
create trigger inventory_item_costs_log_change_trg
  after insert or update of cost_price, cost_configured on public.inventory_item_costs
  for each row execute function public.inventory_item_costs_log_change();

-- A real buying-price receipt becomes the item's latest cost.
create or replace function public.inventory_layer_sets_latest_cost()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
begin
  if new.source not in ('purchase', 'opening') or coalesce(new.unit_cost, 0) <= 0 then
    return new;
  end if;
  select organization_id into v_org from public.inventory_items where id = new.item_id;
  if v_org is null then
    return new;
  end if;
  perform set_config('app.cost_source', new.source, true);
  insert into public.inventory_item_costs (item_id, organization_id, branch_id, cost_price, standard_labour_cost, cost_configured, updated_at, updated_by)
  values (new.item_id, v_org, null, new.unit_cost, 0, true, now(), public.auth_staff_id())
  on conflict (item_id) do update
     set cost_price      = excluded.cost_price,
         cost_configured = true,
         updated_at      = now(),
         updated_by      = excluded.updated_by;
  perform set_config('app.cost_source', '', true);
  return new;
end $$;

drop trigger if exists inventory_layer_sets_latest_cost_trg on public.inventory_stock_layers;
create trigger inventory_layer_sets_latest_cost_trg
  after insert on public.inventory_stock_layers
  for each row execute function public.inventory_layer_sets_latest_cost();

revoke all on function public.inventory_item_costs_log_change()  from public, anon, authenticated;
revoke all on function public.inventory_layer_sets_latest_cost() from public, anon, authenticated;
