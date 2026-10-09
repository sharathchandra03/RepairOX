-- ############################################################################
-- 0071_own_scope_contacts_quotations.sql
--
-- REPAIROX — Own-vs-all scope for Contacts + Quotations (close the RLS gaps).
--
-- PROBLEM this fixes:
--   • contacts_sel (0031) and quotations_sel (0064) granted SELECT to ANYONE in
--     the org/store who held a coarse view key (contacts_view / quotations_view
--     / manage_sales / …) — with NO per-owner filter. So a Sales Agent (Ullas)
--     could see every other agent's contacts and quotations. Hiding this in the
--     UI is not security; the DB was the leak.
--
-- RULE (matches the Lead own-vs-all model, mirrors auth_lead_see_all):
--   • A user sees ONLY the contacts / quotations they created or own, UNLESS
--     they hold a true SEE-ALL key (owner / manager). See-all is the SAME
--     predicate the leads use — auth_lead_see_all() — so an individual Sales
--     Agent is own-scoped everywhere and an owner sees everyone's.
--   • Store scope + org isolation are ALWAYS still enforced
--     (auth_member_of_org + auth_branch_visible). The write policies are
--     UNCHANGED (create/send/manage keys still gate inserts/updates).
--
-- Additive + idempotent (drop policy if exists + create). auth_has_any()/
-- auth_lead_see_all() already honour is_admin(), full_access and '*'.
-- ############################################################################

-- ── Shared helper: does the caller have a cross-agent SEE-ALL grant? ─────────
-- Reuses the lead see-all predicate so Contacts / Quotations / Leads all agree
-- on who is an "owner" (sees everyone) vs an individual (sees only their own).
-- Keeping it as its own function lets a future surface reuse the exact rule.
create or replace function public.auth_sales_see_all()
returns boolean
language sql stable security definer set search_path = public as $$
  select public.auth_lead_see_all();
$$;
grant execute on function public.auth_sales_see_all() to authenticated;


-- ── CONTACTS: own-or-see-all SELECT ──────────────────────────────────────────
-- A contact is visible when:
--   • org + store scope match, AND the caller holds a contact-view key, AND
--   • they created it (created_by = me)  OR  they hold a see-all key.
-- created_by is defaulted to auth_staff_id() on insert (0031), so a Sales
-- Agent's own captured contacts stay visible to them; others do not.
drop policy if exists contacts_select on public.contacts;
create policy contacts_select on public.contacts
  for select to authenticated
  using (
    public.auth_member_of_org(organization_id)
    and public.auth_branch_visible(branch_id)
    and public.auth_has_any(array['contacts_view', 'contacts_manage', 'manage_customers'])
    and (
      public.auth_sales_see_all()
      or created_by = public.auth_staff_id()
    )
  );


-- ── QUOTATIONS: own-or-see-all SELECT ────────────────────────────────────────
-- A quotation is visible when:
--   • org + store scope match, AND the caller holds a quotation-view key, AND
--   • they created it (created_by = me) OR own it (sales_agent_id = me)
--     OR they hold a see-all key.
-- created_by defaults to auth_staff_id() (0003); sales_agent_id is the Lead
-- owner attribution (0064). Mirrors the Deal visibility model.
drop policy if exists quotations_sel on public.quotations;
create policy quotations_sel on public.quotations
  for select to authenticated
  using (
    public.auth_member_of_org(organization_id)
    and public.auth_branch_visible(branch_id)
    and public.auth_has_any(array[
      'quotations_view','quotations_create','quotations_send',
      'manage_sales','manage_invoices','view_financial_reports','manage_customers','manage_reports'
    ])
    and (
      public.auth_sales_see_all()
      or created_by = public.auth_staff_id()
      or sales_agent_id = public.auth_staff_id()
    )
  );
