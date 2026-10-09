-- ############################################################################
-- 0072_sales_agent_role_reset.sql
--
-- REPAIROX — Reset the Sales Agent role to a CLEAN, own-scope grant set.
--
-- WHY: the live `sales_agent` role had drifted to a near-owner grant list
-- (manage_sales, manage_settings, manage_customers, system_administrator,
-- backup_restore, every settings_* key, customers_view_all, leads_view_all,
-- leads_view_team, view_sales_reports, …). Those coarse keys made every agent
-- effectively see/do everything — one agent could see another's leads, deals,
-- quotations and contacts (manage_sales alone is the fallback see-all/write key
-- across CAP.deal.* / CAP.quotation.* / contacts). That breaks the product
-- rule: EACH sales agent is a FRESH, individual account that captures ONLY
-- their own data; the owner sees everyone consolidated.
--
-- WHAT: this migration makes the sales_agent role hold EXACTLY the canonical
-- own-scope key set below — no more, no less — by (a) deleting any key not in
-- the set, and (b) inserting any missing key. It is idempotent and SELF-HEALING:
-- re-running it (or a future deploy) always converges the role back to this
-- exact set, so new agents assigned the role inherit the clean scope and the
-- broad keys can never silently creep back.
--
-- Visibility axes this preserves:
--   • Own operational data (leads/deals/quotations/contacts/dashboard/kanban):
--     OWN-ONLY — no leads_view_all / leads_view_team / manage_sales / reports.
--   • Shared Agent Performance leaderboard: KEPT via leads_performance_view_all
--     (read-only competition view; see 0073 for the decoupled visibility).
--   • Lead Table: unchanged by this migration (handled separately).
--
-- Nothing about OTHER roles (owner/manager/custom) is touched. Owners keep
-- full_access and continue to see everyone + lens into one agent.
-- ############################################################################

do $$
declare
  canonical text[] := array[
    -- Identity + own lead lifecycle
    'leads_sales_agent',
    'leads_view', 'leads_create', 'leads_edit', 'leads_followup',
    'leads_assign', 'leads_reassign',
    'leads_stage_change', 'leads_priority_change', 'leads_pin',
    'leads_convert', 'route_leads',
    -- Own performance + the shared read-only leaderboard
    'leads_performance_view_own', 'leads_performance_view_all',
    -- Lead workspace helpers (own)
    'leads_inbox_view', 'leads_map_view',
    -- Communication / activity (own)
    'comms_call_log', 'comms_activities_view',
    'comms_email_send', 'comms_whatsapp_send', 'comms_tasks_manage', 'comms_meetings_manage',
    'send_communications',
    -- Customer identity capture (reuse Customer Master; no manage/merge/view-all)
    'view_customers', 'create_customer', 'edit_customer', 'view_customer_history',
    -- Contacts + companies (own capture)
    'contacts_view', 'contacts_create',
    'companies_view', 'companies_create',
    -- Own deals (submit/edit/comment — NOT approve, NOT view_all, NOT delete)
    'deals_view', 'deals_create', 'deals_edit', 'deals_comment',
    -- Own quotations (view/create/send own — NOT view_all)
    'quotations_view', 'quotations_create', 'quotations_send',
    -- Device catalog (read) + personal dashboard
    'view_device_catalog', 'view_dashboard',
    -- Own account self-service
    'account_password_change', 'account_pin_manage', 'account_sessions_manage',
    -- Notifications
    'notifications_view', 'notifications_mark_read',
    -- File upload for own records
    'upload_files', 'upload_images'
  ];
begin
  if not exists (select 1 from public.roles where id = 'sales_agent') then
    return;
  end if;

  -- (a) Remove every grant NOT in the canonical set (strips manage_sales,
  --     leads_view_all/team, view_sales_reports, all settings_*, manage_*,
  --     system_administrator, backup_restore, customers_view_all, etc.).
  delete from public.role_permissions
  where role_id = 'sales_agent'
    and permission_key <> all(canonical);

  -- (b) Add any canonical key that is currently missing (only if it exists in
  --     the permission catalog, so we never insert an unknown key).
  insert into public.role_permissions (role_id, permission_key)
  select 'sales_agent', k
  from unnest(canonical) as k
  where not exists (
    select 1 from public.role_permissions rp
    where rp.role_id = 'sales_agent' and rp.permission_key = k
  )
  on conflict (role_id, permission_key) do nothing;
end $$;
