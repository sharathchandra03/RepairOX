-- ============================================================================
-- 0023 — Store-ownership hardening + performance indexes.
--
-- Addresses two audit findings:
--
--  (HIGH) leads.assigned_store is a PLAIN TEXT store label — the exact
--         "store as text, trust the frontend" anti-pattern. We add a real
--         relational column assigned_store_id -> branches(id), backfill it from
--         the text label by matching branch name, and keep the text column for
--         backward compatibility (display / legacy rows). New code should read
--         assigned_store_id.
--
--  (MEDIUM/perf) The hottest app query pattern is "rows for the active store,
--         newest first / by status" on the store-scoped transactional tables.
--         Add composite (branch_id, created_at desc) and (branch_id, status)
--         indexes so store-scoped lists stay fast as volume grows.
--
-- Additive and backfill-safe. No column is dropped, no row is deleted.
-- ============================================================================

-- 1) leads: relational store ownership ---------------------------------------
alter table public.leads
  add column if not exists assigned_store_id uuid references public.branches(id) on delete set null;

-- Backfill from the legacy text label by matching the branch name within the
-- same organization. Rows whose label doesn't match a branch stay NULL.
update public.leads l
set assigned_store_id = b.id
from public.branches b
where l.assigned_store_id is null
  and l.assigned_store is not null
  and b.organization_id = l.organization_id
  and lower(b.name) = lower(l.assigned_store);

create index if not exists leads_assigned_store_idx on public.leads(assigned_store_id);

-- 2) Composite performance indexes on store-scoped transactional tables -------
create index if not exists tickets_branch_created_idx  on public.tickets(branch_id, created_at desc);
create index if not exists tickets_branch_status_idx   on public.tickets(branch_id, status);
create index if not exists invoices_branch_created_idx on public.invoices(branch_id, created_at desc);
create index if not exists invoices_branch_status_idx  on public.invoices(branch_id, status);
create index if not exists walk_ins_branch_created_idx on public.walk_ins(branch_id, created_at desc);
create index if not exists walk_ins_branch_status_idx  on public.walk_ins(branch_id, status);
create index if not exists inventory_branch_idx        on public.inventory_items(branch_id);
create index if not exists stock_movements_branch_idx  on public.stock_movements(branch_id);
create index if not exists expenses_branch_date_idx    on public.expenses(branch_id, expense_date);

-- ============================================================================
-- Done.
-- ============================================================================
