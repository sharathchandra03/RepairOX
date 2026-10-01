/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Auto-create a Field Job when a Lead's STATUS becomes a field
   routing status ("Pickup Assigned" / "On site Assigned").

   This is the status-driven counterpart to the manual RouteLeadDialog. When a
   user changes a lead's STATUS (in the Lead Table dropdown or the bulk status
   action) to a value whose intent is `pickup` or `onsite`, the lead must ALSO
   appear in the Field module's Pickup & Drop workspace — carrying the lead's
   assigned agent name — so Sales and Field stay in sync.

   It REUSES the single field system end-to-end (never a fork), mirroring
   `route-lead-dialog.tsx`:
     resolveCustomer → createJob (pickup|onsite) → routeLead(PICKUP_DROP|ON_SITE)
       → updateLead({ linkedFieldJobId }) → recordConversionEvent
       → assignNinja (so the agent name shows on the job)

   Idempotent: `createJob` dedupes on `leadId` (one active job per lead) and
   `recordConversionEvent` dedupes on (event, target), so re-selecting the same
   status never creates a duplicate job.
   ────────────────────────────────────────────────────────────────────────── */

import { useCallback } from "react";
import { useLeads } from "@/lib/leads-context";
import { useField } from "@/lib/field-context";
import { useStore } from "@/lib/store";
import { useSession } from "@/lib/use-session";
import { resolveCustomer } from "@/lib/field-linking";
import { fullLeadLocation, type Lead } from "@/lib/leads-data";
import { leadStatusIntent, type LeadStatusIntent } from "@/lib/lead-workflow";
import type { FieldLeadType, FulfilmentRoute } from "@/lib/field-data";

/** Map the pickup/onsite status intent to the field trip type + lead route. */
function intentToField(intent: LeadStatusIntent): { leadType: FieldLeadType; route: FulfilmentRoute } | null {
  if (intent === "pickup") return { leadType: "pickup", route: "PICKUP_DROP" };
  if (intent === "onsite") return { leadType: "onsite", route: "ON_SITE" };
  return null; // "walkin" / "none" don't create a field job here
}

/**
 * Returns a function `(lead, status) => Promise<void>` that, AFTER the status
 * has been applied, creates (or reuses) the matching Field Job for a pickup /
 * on-site status and assigns the lead's agent. For any other status it is a
 * no-op. Call it right after `changeLeadStatus`.
 */
export function useLeadStatusFieldJob() {
  const { updateLead, recordConversionEvent } = useLeads();
  const { createJob, activeJobForLead, assignNinja } = useField();
  const { customers, addCustomer } = useStore();
  const { id: currentUserId, name: currentUserName } = useSession();

  return useCallback(
    async (lead: Lead, status: string): Promise<void> => {
      const map = intentToField(leadStatusIntent(status));
      if (!map) return; // not a field routing status

      // Already has an active (non-cancelled) field job → make sure the lead is
      // LINKED to it (so the derivation reflects its live service status) and
      // stop. Without this, a job created by an earlier Route action would stay
      // unlinked and the Action column would be frozen on "In Transit".
      const existing = activeJobForLead(lead.id);
      if (existing) {
        if (lead.linkedFieldJobId !== existing.id) {
          await updateLead(lead.id, { linkedFieldJobId: existing.id, fulfilmentRoute: map.route });
          await recordConversionEvent(lead.id, "field_job_created", {
            targetType: "field_job", targetId: existing.id, targetLabel: existing.jobNo,
          });
        }
        // Carry the agent if the job has none yet.
        if (!existing.ninjaId && lead.assignedTo && lead.assignedToName) {
          await assignNinja(existing.id, lead.assignedTo, lead.assignedToName);
        }
        return;
      }

      // Resolve the ONE Customer Master record (no duplicates).
      const { customerId, created } = resolveCustomer(customers, {
        name: lead.name,
        phone: lead.number,
        altPhone: lead.alternateNumber,
        email: lead.email,
        address: fullLeadLocation(lead),
        source: "sales",
        existingCustomerId: lead.customerId || undefined,
      });
      if (created) await addCustomer(created);

      // Create the Field Job (lands in the Field "Pickup & Drop" workspace,
      // in the Pending Assignment queue until an agent is set).
      const job = await createJob({
        leadId: lead.id,
        leadNo: lead.leadNo,
        customerId,
        customer: lead.name,
        phone: lead.number,
        email: lead.email,
        device: lead.device,
        issue: lead.issue,
        leadType: map.leadType, // "pickup" | "onsite"
        source: lead.source || "",
        branch: lead.branchId || lead.assignedStore || "",
        salesPersonId: currentUserId || "",
        salesPersonName: currentUserName || "",
        pickupAddress: fullLeadLocation(lead),
        status: "pending_assignment",
      });
      if (!job) return;

      // Record the route + two-way link + conversion trail (preserves the
      // Sales owner; never a silent status side-effect — the user chose it).
      // Note: routeLead is intentionally NOT called here (the user drove this
      // via the Status field, not the Route dialog) — we set the route + link
      // directly so the lead and field job reference each other both ways.
      await updateLead(lead.id, {
        customerId,
        linkedFieldJobId: job.id,
        fulfilmentRoute: map.route,
      });
      await recordConversionEvent(lead.id, "field_job_created", {
        targetType: "field_job",
        targetId: job.id,
        targetLabel: job.jobNo,
      });
      if (customerId) {
        await recordConversionEvent(lead.id, "customer_linked", {
          targetType: "customer",
          targetId: customerId,
        });
      }

      // Carry the lead's AGENT onto the field job so the agent name shows in
      // the Pickup & Drop section. The lead's assigned Sales Agent is the
      // accountable owner driving the job; only assign when one exists (an
      // unassigned lead leaves the job in Pending Assignment for a manager).
      if (job.leadId === lead.id && lead.assignedTo && lead.assignedToName) {
        await assignNinja(job.id, lead.assignedTo, lead.assignedToName);
      }
    },
    [customers, addCustomer, createJob, activeJobForLead, assignNinja, updateLead, recordConversionEvent, currentUserId, currentUserName],
  );
}
