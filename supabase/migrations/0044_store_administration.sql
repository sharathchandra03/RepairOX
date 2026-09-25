-- ============================================================================
-- 0044 — Store Administration Center (SAFE, additive)
--
-- Supports the "View Store" administration experience:
--   • a store can name a PRIMARY MANAGER (branches.manager_staff_id → staff)
--   • an authorized admin can read a concise DATA SUMMARY for a store
--     (tickets / invoices / walk-ins / field jobs / customers / inventory /
--     payments counts), scoped to org + that branch, via a SECURITY DEFINER
--     helper that RESPECTS the caller's store visibility.
--
-- Everything is additive and nullable — existing stores keep working, no data
-- is moved or deleted, and store lifecycle stays soft (deactivate/archive, no
-- casual hard delete).
-- ============================================================================

-- ── 1. Primary store manager pointer ────────────────────────────────────────
-- A store MAY nominate one primary manager. This does NOT grant permissions by
-- itself (permissions still come from the staff member's ROLE); it is a
-- relationship marker so the owner can see "who runs this store" and change it
-- cleanly without orphaning the previous manager's history. ON DELETE SET NULL
-- so removing a staff member never deletes the store.
alter table public.branches
  add column if not exists manager_staff_id uuid references public.staff(id) on delete set null;

create index if not exists branches_manager_idx on public.branches(manager_staff_id);


-- ── 2. Per-store data summary (counts only) ──────────────────────────────────
-- Returns a single-row JSON of the store's operational data volume. SECURITY
-- DEFINER so it can count across the module tables, but it FIRST checks the
-- caller may actually see this branch (auth_member_of_org + auth_branch_visible)
-- and returns NULL otherwise — hiding the UI is never the only guard.
--
-- Counts are cheap COUNT(*) queries filtered by organization_id + branch_id,
-- matching the existing store-isolation columns. Tables that may not exist on
-- every install are wrapped so a missing table yields 0 rather than an error.
create or replace function public.store_data_summary(p_branch_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_org        uuid;
  v_tickets    bigint := 0;
  v_invoices   bigint := 0;
  v_walkins    bigint := 0;
  v_field      bigint := 0;
  v_customers  bigint := 0;
  v_inventory  bigint := 0;
  v_payments   bigint := 0;
begin
  -- Resolve the branch's org and authorize the caller against it.
  select organization_id into v_org from public.branches where id = p_branch_id;
  if v_org is null then
    return null;
  end if;
  if not (public.auth_member_of_org(v_org) and public.auth_branch_visible(p_branch_id)) then
    return null;
  end if;

  begin select count(*) into v_tickets  from public.tickets   where organization_id = v_org and branch_id = p_branch_id and deleted_at is null; exception when others then v_tickets  := 0; end;
  begin select count(*) into v_invoices from public.invoices  where organization_id = v_org and branch_id = p_branch_id and deleted_at is null; exception when others then v_invoices := 0; end;
  begin select count(*) into v_walkins  from public.walk_ins  where organization_id = v_org and branch_id = p_branch_id and deleted_at is null; exception when others then v_walkins  := 0; end;
  begin select count(*) into v_field    from public.field_jobs where organization_id = v_org and branch_id = p_branch_id and deleted_at is null; exception when others then v_field    := 0; end;
  begin select count(*) into v_customers from public.customers where organization_id = v_org and branch_id = p_branch_id; exception when others then v_customers := 0; end;
  begin select count(*) into v_inventory from public.inventory_items where organization_id = v_org and branch_id = p_branch_id and deleted_at is null; exception when others then v_inventory := 0; end;
  begin select count(*) into v_payments from public.ledger_transactions where organization_id = v_org and branch_id = p_branch_id; exception when others then v_payments := 0; end;

  return jsonb_build_object(
    'tickets',   v_tickets,
    'invoices',  v_invoices,
    'walkins',   v_walkins,
    'field',     v_field,
    'customers', v_customers,
    'inventory', v_inventory,
    'payments',  v_payments
  );
end;
$$;

grant execute on function public.store_data_summary(uuid) to authenticated;


-- ── 3. Realtime: publish branches so manager changes stream to sessions ──────
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  begin execute 'alter table public.branches replica identity full'; exception when others then null; end;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'branches'
  ) then
    begin execute 'alter publication supabase_realtime add table public.branches'; exception when others then null; end;
  end if;
end $$;

-- ============================================================================
-- Done.
-- ============================================================================
