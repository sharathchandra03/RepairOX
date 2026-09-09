"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Lead Operations panel (inside the Lead detail drawer).

   Surfaces the fulfilment route + the operational hand-off actions:
     • Unrouted        → "Route / Assign" (opens the routing dialog).
     • Store-to-Store  → shows the assigned store + "Convert to Walk-In"
                          (store hand-off) — prefills the Walk-In from the Lead,
                          links linkedLeadId, and dedupes.
     • Pickup & Drop   → shows the linked Field Job + a link to open it in Field.

   This is where Store team members RECEIVE a routed lead without re-typing the
   customer's details, and where progress is visible to Sales.
   ────────────────────────────────────────────────────────────────────────── */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Store, Truck, ArrowRight, ExternalLink, Route as RouteIcon, Building2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Can } from "@/components/common/can";
import { cn } from "@/lib/utils";
import { useLeads } from "@/lib/leads-context";
import { useField } from "@/lib/field-context";
import { useStore } from "@/lib/store";
import { toast } from "@/components/ui/toaster";
import { logActivity } from "@/lib/activity-log";
import { resolveCustomer } from "@/lib/field-linking";
import { normaliseRoute, FIELD_STATUS_LABEL, FIELD_STATUS_TONE } from "@/lib/field-data";
import { genWalkInId, nextWalkInNumber, walkInTypeToCustomerSource } from "@/lib/walk-in-data";
import { RouteLeadDialog } from "@/components/leads/route-lead-dialog";
import type { Lead } from "@/lib/leads-data";
import type { WalkIn } from "@/lib/mock-data";

export function LeadOperationsPanel({ lead }: { lead: Lead }) {
  const router = useRouter();
  const { updateLead } = useLeads();
  const { getJob } = useField();
  const { customers, addCustomer, walkIns, addWalkIn } = useStore();
  const [routeOpen, setRouteOpen] = useState(false);
  const [converting, setConverting] = useState(false);

  const route = normaliseRoute(lead.fulfilmentRoute);
  const linkedJob = lead.linkedFieldJobId ? getJob(lead.linkedFieldJobId) : undefined;
  const existingWalkIn = lead.linkedWalkInId ? walkIns.find((w) => w.id === lead.linkedWalkInId) : undefined;

  /* Store hand-off: create a Walk-In prefilled from this Lead (no retyping),
     linked back by customerId + originating lead. Dedupe: if a Walk-In already
     exists for this lead, open it instead. */
  async function convertToWalkIn() {
    // Duplicate protection (spec §70): one Walk-In per lead.
    if (existingWalkIn) {
      if (existingWalkIn.linkedTicketId) { router.push(`/tickets/${existingWalkIn.linkedTicketId}`); return; }
      router.push(`/walk-in?walkIn=${existingWalkIn.id}`);
      return;
    }
    setConverting(true);
    try {
      const { customerId, created } = resolveCustomer(customers, {
        name: lead.name, phone: lead.number, email: lead.email,
        address: lead.location, source: "sales",
        existingCustomerId: lead.customerId || undefined,
      });
      if (created) await addCustomer(created);

      const record: WalkIn = {
        id: genWalkInId(),
        walkInNumber: nextWalkInNumber(walkIns),
        date: new Date().toISOString().slice(0, 10),
        time: new Date().toTimeString().slice(0, 5),
        type: "sales",
        customer: lead.name || "",
        phone: lead.number || "",
        email: lead.email || "",
        source: lead.source || "",
        category: "",
        model: lead.device || "",
        issue: lead.issue || "",
        reasons: [],
        status: "visitor",
        customerId,
        // Link back to the originating lead (stored in the walk-in notes envelope).
        linkedLeadId: lead.id,
        invoiceValue: 0,
        businessValue: 0,
        notes: lead.comments || "",
      };
      await addWalkIn(record);
      await updateLead(lead.id, { linkedWalkInId: record.id, customerId, status: "Converted" });

      logActivity({
        module: "Lead", action: "Converted to Walk-In", severity: "success", entity: "Lead",
        reference: lead.leadNo,
        description: `${lead.leadNo} received at store as Walk-In ${record.walkInNumber}.`,
      });
      toast.success("Walk-In created", { description: `${record.walkInNumber} · ${lead.name || "Customer"} — complete it in Walk-In.` });
      router.push(`/walk-in?walkIn=${record.id}`);
    } finally {
      setConverting(false);
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-[#EEF1FD] text-[#4361EE]"><RouteIcon className="h-3.5 w-3.5" /></span>
        <h3 className="text-[12px] font-semibold uppercase tracking-wider text-zinc-600">Fulfilment &amp; Operations</h3>
      </div>

      {/* Unrouted */}
      {!route && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-[13px] text-zinc-500">Not routed yet. Decide how this customer will be served.</p>
          <Can permission="route_leads">
            <Button size="sm" className="shrink-0 gap-1.5" onClick={() => setRouteOpen(true)}>
              <RouteIcon className="h-3.5 w-3.5" /> Route / Assign
            </Button>
          </Can>
        </div>
      )}

      {/* Store-to-Store */}
      {route === "STORE_VISIT" && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 rounded-xl bg-sky-50 px-3 py-2 text-[12px] font-medium text-sky-800 ring-1 ring-inset ring-sky-200">
            <Store className="h-3.5 w-3.5" /> Store-to-Store
            {lead.assignedStore && <span className="ml-1 inline-flex items-center gap-1 text-sky-700"><Building2 className="h-3 w-3" /> {lead.assignedStore}</span>}
          </div>
          {existingWalkIn ? (
            <div className="flex items-center justify-between gap-2">
              <p className="inline-flex items-center gap-1.5 text-[13px] text-emerald-700"><CheckCircle2 className="h-4 w-4" /> Received as Walk-In {existingWalkIn.walkInNumber}</p>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => router.push(`/walk-in?walkIn=${existingWalkIn.id}`)}>
                Open Walk-In <ExternalLink className="h-3.5 w-3.5" />
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <p className="text-[12px] text-zinc-500">When the customer arrives, receive them without re-entering details.</p>
              <Can permission={["receive_store_handoff", "use_pos"]}>
                <Button size="sm" className="shrink-0 gap-1.5" loading={converting} onClick={convertToWalkIn}>
                  <ArrowRight className="h-3.5 w-3.5" /> Convert to Walk-In
                </Button>
              </Can>
            </div>
          )}
          <Can permission="route_leads">
            <button onClick={() => setRouteOpen(true)} className="text-[11px] font-medium text-[#4361EE] hover:underline">Change route</button>
          </Can>
        </div>
      )}

      {/* Pickup & Drop */}
      {route === "PICKUP_DROP" && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 rounded-xl bg-violet-50 px-3 py-2 text-[12px] font-medium text-violet-800 ring-1 ring-inset ring-violet-200">
            <Truck className="h-3.5 w-3.5" /> Pickup &amp; Drop
          </div>
          {linkedJob ? (
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-[13px] font-medium text-zinc-800">{linkedJob.jobNo}</p>
                <span className={cn("mt-0.5 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset", FIELD_STATUS_TONE[linkedJob.status])}>
                  {FIELD_STATUS_LABEL[linkedJob.status]}
                </span>
              </div>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => router.push(`/field?job=${linkedJob.id}`)}>
                Open Field Job <ExternalLink className="h-3.5 w-3.5" />
              </Button>
            </div>
          ) : (
            <p className="text-[12px] text-zinc-500">A Field Job is being set up. Track pickup and drop progress in Field.</p>
          )}
          <Can permission="route_leads">
            <button onClick={() => setRouteOpen(true)} className="text-[11px] font-medium text-[#4361EE] hover:underline">Change route</button>
          </Can>
        </div>
      )}

      <RouteLeadDialog lead={routeOpen ? lead : null} open={routeOpen} onClose={() => setRouteOpen(false)} />
    </section>
  );
}
