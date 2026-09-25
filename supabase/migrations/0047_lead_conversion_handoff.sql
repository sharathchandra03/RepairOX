-- ############################################################################
-- 0047_lead_conversion_handoff.sql
--
-- REPAIROX — LEAD → SERVICE HANDOFF → SHOP / PICKUP / ON-SITE (Phase 3)
--
-- Builds on 0045 (lead data foundation) + 0046 (ownership/follow-up). Additive
-- + idempotent. It makes the lead → operations handoff fully queryable so Sales
-- never loses visibility after a lead is handed to operations:
--
--   1. Confirms the leads handoff-link columns exist (linked_walk_in_id,
--      linked_field_job_id, linked_ticket_id, linked_invoice_id, fulfilment_route,
--      assigned_store_id) — a defensive re-assert in case 0045 was partial.
--   2. Adds display/actor convenience columns to lead_conversion_history
--      (target_label, actor_name) so the journey timeline renders without joins.
--   3. Documents the three SERVICE ROUTES (STORE_VISIT / PICKUP_DROP / ON_SITE)
--      that fulfilment_route now carries. Route stays TEXT (free of a rigid FK)
--      but is a fixed, validated vocabulary in the app.
--   4. Ensures downstream records can carry the originating lead id
--      (walk_ins.linked_lead_id / tickets.linked_lead_id) so attribution is
--      two-way at the DB layer (the app also stores it in the JSON envelope).
--
-- Revenue attribution stays DERIVED (finalized invoices via
-- Lead → linked_ticket_id → invoices.ticket_id) — no revenue is stored on the
-- lead. lead_conversion_history.value only records realized/attributed amounts
-- captured at an event, never a running total.
-- ############################################################################


-- ============================================================================
-- SECTION 1 — leads: re-assert handoff-link columns (idempotent)
-- ============================================================================
alter table public.leads add column if not exists fulfilment_route    text;
alter table public.leads add column if not exists assigned_store_id   uuid references public.branches(id) on delete set null;
alter table public.leads add column if not exists routed_at           timestamptz;
alter table public.leads add column if not exists linked_walk_in_id   text;
alter table public.leads add column if not exists linked_field_job_id text;
alter table public.leads add column if not exists linked_ticket_id    text;
alter table public.leads add column if not exists linked_invoice_id   text;
alter table public.leads add column if not exists converted_by        uuid references public.staff(id) on delete set null;
alter table public.leads add column if not exists conversion_source   text;

comment on column public.leads.fulfilment_route is
  'Lead SERVICE ROUTE: STORE_VISIT (Store / Walk-In) | PICKUP_DROP | ON_SITE. '
  'Structured vocabulary (not free text). STORE_VISIT is handled as a Walk-In; '
  'PICKUP_DROP and ON_SITE create a Field Job of the matching trip type.';

-- Reporting/lookup indexes for the handoff links.
create index if not exists leads_linked_walk_in_idx   on public.leads(linked_walk_in_id)   where linked_walk_in_id   is not null;
create index if not exists leads_linked_field_job_idx on public.leads(linked_field_job_id) where linked_field_job_id is not null;
create index if not exists leads_linked_ticket_idx    on public.leads(linked_ticket_id)    where linked_ticket_id    is not null;
create index if not exists leads_linked_invoice_idx   on public.leads(linked_invoice_id)   where linked_invoice_id   is not null;
create index if not exists leads_fulfilment_route_idx on public.leads(fulfilment_route)    where fulfilment_route    is not null;


-- ============================================================================
-- SECTION 2 — lead_conversion_history: display + actor convenience columns
-- ============================================================================
alter table public.lead_conversion_history add column if not exists target_label text;  -- cached ref (FJ-001 / T-074 / INV-…)
alter table public.lead_conversion_history add column if not exists actor_name   text;   -- cached actor display name


-- ============================================================================
-- SECTION 3 — downstream records carry the originating lead id (two-way link)
--   Walk-Ins and Tickets already store linkedLeadId in their JSON envelope; add
--   real nullable columns so attribution + reporting joins work at the DB layer
--   too. Guarded: only if the tables exist.
-- ============================================================================
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'walk_ins') then
    execute 'alter table public.walk_ins add column if not exists linked_lead_id text';
    execute 'create index if not exists walk_ins_linked_lead_idx on public.walk_ins(linked_lead_id) where linked_lead_id is not null';
  end if;
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'tickets') then
    execute 'alter table public.tickets add column if not exists linked_lead_id text';
    execute 'create index if not exists tickets_linked_lead_idx on public.tickets(linked_lead_id) where linked_lead_id is not null';
  end if;
end $$;


-- ============================================================================
-- SECTION 4 — reporting view: lead → operations → revenue (derived)
--   One row per lead exposing the route, the linked operational records, and
--   the FINALIZED (paid, non-proforma) revenue attributed via the linked
--   ticket. Never stores a total — always computed from live invoices.
-- ============================================================================
create or replace view public.lead_conversion_reporting_v as
select
  l.id,
  l.organization_id,
  l.branch_id,
  l.lead_no,
  l.assigned_user_id,
  l.fulfilment_route,
  l.assigned_store_id,
  l.linked_walk_in_id,
  l.linked_field_job_id,
  l.linked_ticket_id,
  l.linked_invoice_id,
  -- Route conversion booleans (real linked event, not just a chosen route).
  (l.fulfilment_route = 'STORE_VISIT' and l.linked_walk_in_id   is not null) as converted_walk_in,
  (l.fulfilment_route = 'PICKUP_DROP' and l.linked_field_job_id is not null) as converted_pickup,
  (l.fulfilment_route = 'ON_SITE'     and l.linked_field_job_id is not null) as converted_on_site,
  (l.linked_ticket_id is not null)                                           as ticket_won,
  coalesce(l.expected_value, l.estimate)                                     as pipeline_value,
  -- Revenue Won = Σ FINALIZED (paid) invoices for the linked ticket. Proforma
  -- documents are non-revenue but their type lives in the app JSON envelope, not
  -- a base column here — a proforma is never marked 'paid', so the paid filter
  -- already excludes them. The app-layer revenueWonForLead() remains the precise
  -- authority (it also honours the documentType discriminator).
  (
    select coalesce(sum(i.total), 0)
    from public.invoices i
    where i.ticket_id is not null
      and i.ticket_id = l.linked_ticket_id
      and coalesce(i.status, '') = 'paid'
  )                                                                          as revenue_won,
  l.converted_at,
  l.created_at
from public.leads l
where l.deleted_at is null;

grant select on public.lead_conversion_reporting_v to authenticated;

-- ============================================================================
-- Done. The Lead → Service Handoff trail is fully queryable: route + linked
-- Walk-In/Field Job/Ticket/Invoice on the lead, an append-only conversion
-- history, two-way lead ids on downstream records, and a derived reporting view
-- whose Revenue Won comes only from finalized invoices. No parallel systems.
-- ============================================================================
