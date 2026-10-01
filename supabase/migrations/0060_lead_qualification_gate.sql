-- ############################################################################
-- 0060_lead_qualification_gate.sql
--
-- REPAIROX — LEAD QUALIFICATION GATE (server-side enforcement).
-- Additive + idempotent. No new columns; reuses existing `leads` columns
-- (contact_status, qualification, final_remarks, linked_* handoff links).
--
-- The Lead Table + Lead Form gate downstream data capture on the lead's
-- contact / qualification state (progressive capture). Hiding UI is NOT
-- security — this trigger enforces the SAME rules in the database so a client
-- can never bypass them by posting a raw payload:
--
--   1. NOT-QUALIFIED requires a REASON. Marking a lead Not Qualified (the
--      configurable `qualification` value contains "not qualified" /
--      "unqualified" / "disqualified") requires a non-empty `final_remarks`
--      (the qualification decision reason). Rejected otherwise.
--
--   2. NOT-CONTACTED / NOT-QUALIFIED cannot hold an OPERATIONAL LINK. A lead
--      that is still Not-Contacted, or is Not-Qualified, must not carry a
--      linked Walk-In / Field Job / Ticket / Invoice — it never entered the
--      operational workflow (spec §100/§115). The write is rejected when it
--      would introduce such a contradictory state. (Requalifying/contacting
--      the lead in the same write lifts the gate.)
--
-- ACTION and RESULT are NOT stored columns — they are DERIVED at read time
-- from the linked records (see app/src/lib/lead-workflow.ts). There is nothing
-- to write, so they are inherently immutable / un-forgeable; this guard only
-- protects the STORED state that feeds the derivation.
--
-- Substring matching (case-insensitive) keeps the guard tolerant of
-- admin-configurable qualification / contact_status label values, mirroring
-- the client helpers isNotQualified() / isNotContactedStatus().
--
-- Service-role writes (no end-user JWT — migrations, back-office jobs) skip the
-- guard, matching the pattern in leads_ownership_guard (0049).
-- ############################################################################

create or replace function public.lead_qualification_guard()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_qual        text := lower(coalesce(new.qualification, ''));
  v_contact     text := lower(coalesce(new.contact_status, ''));
  v_not_qual    boolean;
  v_not_contact boolean;
  v_has_link    boolean;
  v_reason      text := btrim(coalesce(new.final_remarks, ''));
begin
  -- Skip service-role / non-end-user writes (no JWT).
  if auth.uid() is null then
    return new;
  end if;

  -- Not-Qualified: configurable label containing the negative form.
  v_not_qual := v_qual like 'not qualified%'
             or v_qual like 'not-qualified%'
             or v_qual = 'unqualified'
             or v_qual = 'disqualified';

  -- Not-Contacted: empty (brand-new, nobody touched it) or the negative form.
  v_not_contact := v_contact = ''
                or v_contact like 'not contacted%';

  -- Does the row carry any downstream operational link?
  v_has_link := coalesce(new.linked_walk_in_id, '') <> ''
             or coalesce(new.linked_field_job_id, '') <> ''
             or coalesce(new.linked_ticket_id, '') <> ''
             or coalesce(new.linked_invoice_id, '') <> '';

  -- RULE 1 — Not-Qualified requires a reason.
  if v_not_qual and v_reason = '' then
    raise exception 'lead_not_qualified_reason_required: a reason (final remarks) is required to mark a lead Not Qualified'
      using errcode = '23514';
  end if;

  -- RULE 2 — a gated (Not-Contacted / Not-Qualified) lead cannot hold an
  -- operational link. This blocks impossible states such as
  -- "Not Contacted + Ticket Created" or "Not Qualified + Invoice".
  if (v_not_contact or v_not_qual) and v_has_link then
    raise exception 'lead_gated_operational_link_forbidden: a % lead cannot be linked to a walk-in / field job / ticket / invoice — contact and qualify the lead first',
      case when v_not_qual then 'Not-Qualified' else 'Not-Contacted' end
      using errcode = '23514';
  end if;

  return new;
end;
$$;

comment on function public.lead_qualification_guard() is
  'Server-side Lead Qualification Gate: Not-Qualified requires a reason '
  '(final_remarks); a Not-Contacted/Not-Qualified lead cannot carry a linked '
  'walk-in/field/ticket/invoice. Mirrors the client gate (isNotQualified / '
  'isNotContactedStatus) so the UI, server and DB agree. Action/Result are '
  'derived, never stored, so they are un-forgeable by construction.';

drop trigger if exists lead_qualification_guard_trg on public.leads;
create trigger lead_qualification_guard_trg
  before insert or update on public.leads
  for each row execute function public.lead_qualification_guard();

-- ============================================================================
-- Done. The qualification gate is now enforced at the database layer, in
-- agreement with the Lead Form + Lead Table UI gates.
-- ============================================================================
