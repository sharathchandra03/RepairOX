-- ============================================================================
-- 0089 — Make Lead Intelligence Search GLOBAL by default (read-only).
--
-- Product decision: every user who works leads can SEARCH and READ other
-- agents' leads (never edit). Grants the two read-only keys to every role that
-- already holds `leads_view` (Sales Agent included). Edit/reassign/delete are
-- untouched — leads_upd RLS + leads_ownership_guard still block them.
-- Administrators can still revoke per role in Roles & Permissions; new custom
-- roles start OFF as before. Idempotent.
-- ============================================================================
insert into public.role_permissions (role_id, permission_key)
select distinct rp.role_id, k.key
from public.role_permissions rp
cross join (values ('leads_search'), ('leads_shared_reference'), ('leads_customer_history')) as k(key)
where rp.permission_key = 'leads_view'
on conflict (role_id, permission_key) do nothing;

insert into public.role_permissions (role_id, permission_key)
select 'sales_agent', k.key
from (values ('leads_search'), ('leads_shared_reference'), ('leads_customer_history')) as k(key)
where exists (select 1 from public.roles r where r.id = 'sales_agent')
on conflict (role_id, permission_key) do nothing;
