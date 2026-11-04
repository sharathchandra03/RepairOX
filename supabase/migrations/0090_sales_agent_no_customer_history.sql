-- 0090 — Sales Agents work Leads, Follow-ups and CRM Contacts; they do not get
-- Customer results / Customer history (Customer Master territory). Search still
-- finds other agents' leads read-only via leads_shared_reference. Admins can
-- re-grant leads_customer_history per role.
delete from public.role_permissions where role_id = 'sales_agent' and permission_key = 'leads_customer_history';
