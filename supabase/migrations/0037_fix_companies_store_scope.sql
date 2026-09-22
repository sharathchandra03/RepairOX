-- ############################################################################
-- 0037 — Close cross-store WRITE hole on public.companies
--
-- AUDIT FINDING (CRITICAL): companies_write was scoped by org membership +
-- permission, but NOT by store (`auth_branch_visible(branch_id)`). The browser
-- writes to `companies` directly (store.tsx updateCompany/deleteCompany), and
-- RLS is the only backstop — so a user with a companies/customers edit key in
-- Store A could UPDATE or DELETE a company row belonging to Store B by crafting
-- the request, even though they cannot SEE that store's data (the SELECT policy
-- IS branch-scoped). This closes the write side to match the read side.
--
-- The `contacts` table was already fixed by 0033 (its write policies include
-- auth_branch_visible), and `loyalty_accounts` is intentionally org-level
-- (Customer Master is org-scoped and has no branch_id) — neither is changed.
--
-- Idempotent + safe to re-run.
-- ############################################################################

drop policy if exists companies_write on public.companies;
create policy companies_write on public.companies
  for all to authenticated
  using (
    public.auth_member_of_org(organization_id)
    and public.auth_branch_visible(branch_id)
    and public.auth_has_any(array['companies_create','companies_edit','companies_delete','manage_sales','manage_customers'])
  )
  with check (
    public.auth_member_of_org(organization_id)
    and public.auth_branch_visible(branch_id)
    and public.auth_has_any(array['companies_create','companies_edit','companies_delete','manage_sales','manage_customers'])
  );
