-- ############################################################################
-- 0068_lead_options_global.sql
--
-- REPAIROX — Lead Form settings are ORG-WIDE / GLOBAL.
--
-- The Lead Form dropdowns (Region, Source, Status, Lead Category, Lead Nature,
-- Priority, …) are a single org-level configuration: whatever an admin
-- configures must be visible to EVERYONE in the organization — including a
-- newly created Sales Agent authorized for a different store — and any change
-- made by one user applies to all.
--
-- Previously `lead_options` was ALSO branch-scoped: rows were stamped with the
-- creating admin's `branch_id` (default `auth_branch_id()`), and both the read
-- and write RLS gated on `auth_branch_visible(branch_id)`. A Sales Agent on a
-- different store failed that gate and saw EMPTY dropdowns. This migration makes
-- the catalog genuinely global:
--
--   1. Backfill every existing row to branch_id = NULL (org-wide), so options
--      already configured become visible to all users immediately.
--   2. SELECT: org membership + a lead/sales/settings key — NO branch gate.
--   3. INSERT/UPDATE/DELETE: the existing write permission — NO branch gate,
--      and new rows are forced to branch_id = NULL (org-global) by a trigger so
--      the catalog can never drift back to being per-store.
--
-- Additive + idempotent. Multi-store data isolation for LEADS themselves is
-- unchanged — this only globalises the shared option CATALOG, which is
-- configuration, not customer data.
-- ############################################################################


-- ============================================================================
-- SECTION 1 — Backfill existing options to org-wide (branch_id = NULL)
-- ============================================================================
update public.lead_options set branch_id = null where branch_id is not null;


-- ============================================================================
-- SECTION 2 — New rows are always org-global (branch_id forced to NULL)
-- ============================================================================
create or replace function public.lead_options_force_global()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- The option catalog is organization-level configuration, never per-store.
  new.branch_id := null;
  return new;
end;
$$;

drop trigger if exists lead_options_force_global_trg on public.lead_options;
create trigger lead_options_force_global_trg
  before insert or update on public.lead_options
  for each row execute function public.lead_options_force_global();


-- ============================================================================
-- SECTION 3 — RLS: org-wide, NO branch gate
--   SELECT: any member of the org holding a lead/sales/settings read key.
--   WRITE : the existing settings/sales write keys (admin configures once,
--           it applies to everyone).
-- ============================================================================

-- READ — every lead worker in the org sees the full catalog.
drop policy if exists lead_options_sel on public.lead_options;
create policy lead_options_sel on public.lead_options for select to authenticated
using (
  public.auth_member_of_org(organization_id)
  and public.auth_has_any(array[
    'leads_view', 'leads_create', 'leads_edit',
    'manage_sales', 'view_sales_reports', 'manage_settings', 'view_only'
  ])
);

-- INSERT — org-scoped, settings/sales write authority (no branch gate).
drop policy if exists lead_options_ins on public.lead_options;
create policy lead_options_ins on public.lead_options for insert to authenticated
with check (
  organization_id = public.auth_org_id()
  and public.auth_has_any(array['manage_settings', 'manage_sales'])
);

-- UPDATE — org-scoped, settings/sales write authority (no branch gate).
drop policy if exists lead_options_upd on public.lead_options;
create policy lead_options_upd on public.lead_options for update to authenticated
using (
  public.auth_member_of_org(organization_id)
  and public.auth_has_any(array['manage_settings', 'manage_sales'])
)
with check (
  organization_id = public.auth_org_id()
  and public.auth_has_any(array['manage_settings', 'manage_sales'])
);

-- DELETE — org-scoped, settings/sales write authority (no branch gate).
drop policy if exists lead_options_del on public.lead_options;
create policy lead_options_del on public.lead_options for delete to authenticated
using (
  public.auth_member_of_org(organization_id)
  and public.auth_has_any(array['manage_settings', 'manage_sales'])
);
