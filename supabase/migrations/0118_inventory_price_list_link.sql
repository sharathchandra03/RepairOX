-- ============================================================================
-- 0118 — Inventory ↔ Price List link (SKU = Price List part number)
--
-- ONE RULE: a Price List part whose `part_number` equals an inventory SKU
-- (inventory_items.id, item_code or barcode, case-insensitive) is LINKED.
-- For a linked part the inventory item is the single source of truth for
--   • price         ← selling_price (when > 0) else regular_selling_price
--   • availability  ← derived from live stock (available = on hand − reserved):
--                       <= 0 → 'Out of Stock', <= min_stock → 'Limited', else 'In Stock'
--
-- Why a trigger and not a read-time join: Sales Agents may not hold inventory
-- view access (and must NEVER see cost). The Price List must still show them the
-- fresh selling price, so the value is pushed into price_list_parts by a
-- SECURITY DEFINER function. Only the SELLING price and an availability label
-- are copied — no cost, no stock quantities.
--
-- Additive + idempotent. Does not touch unlinked parts or any inventory column.
-- ============================================================================

create or replace function public.sync_price_list_for_item(p_item_id text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r        public.inventory_items%rowtype;
  v_price  numeric;
  v_avail  numeric;
  v_label  text;
  v_n      integer := 0;
begin
  select * into r from public.inventory_items where id = p_item_id;
  if not found or r.deleted_at is not null then
    return 0;
  end if;
  -- Services never carry a part price / stock label.
  if coalesce(r.item_kind, 'part') <> 'part' then
    return 0;
  end if;

  v_price := case when coalesce(r.selling_price, 0) > 0 then r.selling_price else coalesce(r.regular_selling_price, 0) end;
  v_avail := coalesce(r.current_stock, 0) - coalesce(r.reserved_stock, 0);
  v_label := case
    when coalesce(r.track_stock, true) = false then 'In Stock'
    when v_avail <= 0 then 'Out of Stock'
    when coalesce(r.min_stock, 0) > 0 and v_avail <= r.min_stock then 'Limited'
    else 'In Stock'
  end;

  update public.price_list_parts p
     set price        = case when v_price > 0 then v_price else p.price end,
         price_known  = case when v_price > 0 then true else p.price_known end,
         availability = v_label,
         updated_at   = now()
   where p.organization_id = r.organization_id
     and coalesce(p.part_number, '') <> ''
     and lower(p.part_number) in (lower(r.id), lower(coalesce(r.item_code, '')), lower(coalesce(r.barcode, '')))
     and (
          (v_price > 0 and (p.price is distinct from v_price or p.price_known is distinct from true))
          or p.availability is distinct from v_label
     );
  get diagnostics v_n = row_count;
  return v_n;
end $$;

create or replace function public.inventory_items_sync_price_list_trg()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.sync_price_list_for_item(new.id);
  return new;
end $$;

drop trigger if exists inventory_items_sync_price_list on public.inventory_items;
create trigger inventory_items_sync_price_list
  after insert or update of selling_price, regular_selling_price, current_stock, reserved_stock, min_stock, track_stock, item_code, barcode
  on public.inventory_items
  for each row execute function public.inventory_items_sync_price_list_trg();

-- Manual / backfill entry point used by Inventory → Price List Link → "Sync now".
-- Syncs every inventory item of the CALLER'S organization. Requires an inventory
-- or sales-pricing permission; never accepts an organization id from the client.
create or replace function public.sync_price_list_from_inventory()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := public.auth_org_id();
  v_n   integer := 0;
  v_id  text;
begin
  if v_org is null
     or not coalesce(public.auth_has_any(array['manage_inventory','edit_item','manage_sales','manage_settings']), false) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  for v_id in select id from public.inventory_items where organization_id = v_org and deleted_at is null loop
    v_n := v_n + public.sync_price_list_for_item(v_id);
  end loop;
  return v_n;
end $$;

revoke all on function public.sync_price_list_for_item(text) from public, anon, authenticated;
grant execute on function public.sync_price_list_from_inventory() to authenticated;
