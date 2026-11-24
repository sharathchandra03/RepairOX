-- ============================================================================
-- 0124 — Price List price-change tracking + stock-team audit
--
-- When a Price List part's price changes (from an Inventory selling-price edit,
-- the 0118 sync, or a direct Price List edit) the database remembers:
--   previous_price    the price immediately before the change (the "cut" price)
--   price_changed_at  when it changed
-- The Price List shows previous_price struck through next to the new price for
-- a few days (window is a client constant). A second change replaces
-- previous_price with the then-current price, so the latest price is always the
-- base for the next comparison.
--
-- price_change_log is the append-only audit. It is readable ONLY by the stock
-- team (inventory / purchasing keys) and has NO client write policy: rows are
-- written by the trigger below, so the trail cannot be forged. Sales users see
-- the strike-through on the Price List but never the audit, cost or margin.
-- Additive + idempotent.
-- ============================================================================
alter table public.price_list_parts add column if not exists previous_price   numeric;
alter table public.price_list_parts add column if not exists price_changed_at timestamptz;

create table if not exists public.price_change_log (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  part_id         text not null,
  part_name       text,
  part_number     text,
  model_id        text,
  old_price       numeric not null,
  new_price       numeric not null,
  changed_by      uuid references public.staff(id) on delete set null,
  changed_by_name text,
  source          text not null default 'price_list',  -- inventory | price_list | sync
  changed_at      timestamptz not null default now()
);
create index if not exists price_change_log_org_time_idx on public.price_change_log (organization_id, changed_at desc);
create index if not exists price_change_log_part_idx     on public.price_change_log (part_id, changed_at desc);

alter table public.price_change_log enable row level security;
drop policy if exists price_change_log_select on public.price_change_log;
create policy price_change_log_select on public.price_change_log
  for select to authenticated
  using (
    public.auth_member_of_org(organization_id)
    and coalesce(public.auth_has_any(array['manage_inventory','edit_item','manage_purchases','inventory_view_cost']), false)
  );
-- No insert / update / delete policy on purpose (append-only, trigger-written).

create or replace function public.price_list_parts_track_price()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff uuid := public.auth_staff_id();
  v_name  text;
begin
  if tg_op = 'UPDATE'
     and new.price is distinct from old.price
     and coalesce(old.price_known, true) = true
     and coalesce(old.price, 0) > 0
     and coalesce(new.price, 0) > 0 then
    new.previous_price   := old.price;
    new.price_changed_at := now();
    if v_staff is not null then
      select name into v_name from public.staff where id = v_staff;
    end if;
    insert into public.price_change_log
      (organization_id, part_id, part_name, part_number, model_id, old_price, new_price,
       changed_by, changed_by_name, source)
    values
      (new.organization_id, new.id, new.part_name, new.part_number, new.model_id, old.price, new.price,
       v_staff, v_name,
       coalesce(nullif(current_setting('app.price_source', true), ''), 'price_list'));
  end if;
  return new;
end $$;

drop trigger if exists price_list_parts_track_price_trg on public.price_list_parts;
create trigger price_list_parts_track_price_trg
  before update of price on public.price_list_parts
  for each row execute function public.price_list_parts_track_price();

revoke all on function public.price_list_parts_track_price() from public, anon, authenticated;

-- Tag price changes that originate from an Inventory item edit so the audit can
-- tell "Inventory" apart from a direct Price List edit (transaction-local flag).
create or replace function public.inventory_items_sync_price_list_trg()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('app.price_source', 'inventory', true);
  perform public.sync_price_list_for_item(new.id);
  perform set_config('app.price_source', '', true);
  return new;
end $$;
