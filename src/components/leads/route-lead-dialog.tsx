"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Route Lead dialog (Sales fulfilment decision).

   The single Sales action that answers "how will we serve this customer?":
     • Store-to-Store  → assign a Store, notify it, and (on arrival) the store
                          converts the Lead into a Walk-In.
     • Pickup & Drop   → create a Field Job and notify Field Managers.

   It reuses the SHARED master data — Customer Master (resolveCustomer, no
   duplicates), Branch/Store list, Employee/User master — and links everything
   back to the originating Lead. Nothing is routed silently: the user confirms
   the choice first (spec §57–59).
   ────────────────────────────────────────────────────────────────────────── */

import { useMemo, useState } from "react";
import { Store, Truck, ArrowRight, Check, MapPin, Building2, AlertTriangle } from "lucide-react";
import { Drawer } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { TimePicker } from "@/components/ui/time-picker";
import { cn } from "@/lib/utils";
import { useLeads } from "@/lib/leads-context";
import { useField } from "@/lib/field-context";
import { useStore } from "@/lib/store";
import { usePermissions } from "@/lib/permissions-context";
import { useSession } from "@/lib/use-session";
import { toast } from "@/components/ui/toaster";
import { BRANCHES } from "@/lib/auth";
import { allow } from "@/lib/capabilities";
import { resolveCustomer, staffByRole } from "@/lib/field-linking";
import { normaliseRoute, routeToFieldLeadType, FIELD_LEAD_TYPES, type FulfilmentRoute, type FieldLeadType } from "@/lib/field-data";
import { notify } from "@/lib/notifications";
import type { Lead } from "@/lib/leads-data";

export function RouteLeadDialog({ lead, open, onClose }: {
  lead: Lead | null;
  open: boolean;
  onClose: () => void;
}) {
  const { routeLead, updateLead, recordConversionEvent } = useLeads();
  const { createJob, activeJobForLead, assignNinja } = useField();
  const { customers, addCustomer } = useStore();
  const { team, can } = usePermissions();
  const { id: currentUserId, name: currentUserName } = useSession();

  // A salesperson with ninja-assignment authority can pick the field agent
  // directly here — the Field Manager is NOT a mandatory intermediary (§6/§9/§12).
  const canAssignNinja = allow(can, ["assign_ninja", "manage_field_jobs"]);

  const existingRoute = normaliseRoute(lead?.fulfilmentRoute);
  const [route, setRoute] = useState<FulfilmentRoute | "">(existingRoute);
  const [store, setStore] = useState<string>(lead?.assignedStore || "");
  const [fieldManagerId, setFieldManagerId] = useState<string>("");
  const [ninjaId, setNinjaId] = useState<string>("");
  const [leadType, setLeadType] = useState<FieldLeadType>("pickup");
  const [pickupAddress, setPickupAddress] = useState<string>(lead?.location || "");
  const [pickupDate, setPickupDate] = useState<string>("");
  const [pickupTime, setPickupTime] = useState<string>("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const managers = useMemo(() => staffByRole(team, ["field_manager", "shop_owner_branch_manager", "master_shop_owner"]), [team]);
  // Authorized field agents the salesperson may assign directly (Ninja + techs).
  const fieldAgents = useMemo(() => staffByRole(team, ["ninja", "field_manager", "technician", "senior_technician"]), [team]);
  const isFieldRoute = route === "PICKUP_DROP" || route === "ON_SITE";

  // Guardrails for a route CHANGE on an already-progressed lead (spec §59).
  const existingFieldJob = lead ? activeJobForLead(lead.id) : undefined;
  const existingWalkInId = lead?.linkedWalkInId;

  if (!lead) return null;

  const reset = () => {
    setConfirming(false); setBusy(false);
  };
  const close = () => { reset(); onClose(); };

  /* Perform the routing once confirmed. */
  async function performRoute() {
    if (!route || !lead) return;
    setBusy(true);
    try {
      // Resolve (or create) the ONE Customer Master record for this lead.
      const { customerId, created } = resolveCustomer(customers, {
        name: lead.name, phone: lead.number, email: lead.email,
        address: lead.location, source: "sales",
        existingCustomerId: lead.customerId || undefined,
      });
      if (created) await addCustomer(created);

      if (route === "STORE_VISIT") {
        await routeLead(lead.id, "STORE_VISIT", { assignedStore: store });
        await updateLead(lead.id, { customerId });
        // Notify the assigned store (branch-scoped reception role).
        notify({
          kind: "lead_routed", recipientRole: "reception",
          title: "Store / Walk-In lead assigned",
          body: `${lead.leadNo} · ${lead.name || "Customer"} — ${lead.device || "device"} heading to ${store || "your store"}.`,
          href: `/leads/list?lead=${lead.id}`, reference: lead.leadNo,
        });
        toast.success("Routed to Store / Walk-In", { description: `${lead.leadNo} → ${store || "store"} · store will receive as Walk-In.` });
      } else {
        // Pickup & Drop OR On-Site → create a Field Job (dedupe inside createJob).
        const routeLabel = route === "ON_SITE" ? "On-Site" : "Pickup & Drop";
        // On-Site jobs always run the on-site trip type; Pickup & Drop uses the
        // chosen trip type (pickup / warranty variants).
        const jobLeadType: FieldLeadType = route === "ON_SITE" ? "onsite" : leadType;
        if (existingFieldJob) {
          toast.info("Field Job exists", { description: `${existingFieldJob.jobNo} already handles this lead.` });
        } else {
          const manager = managers.find((m) => m.id === fieldManagerId);
          const agent = canAssignNinja ? fieldAgents.find((a) => a.id === ninjaId) : undefined;
          const job = await createJob({
            leadId: lead.id, leadNo: lead.leadNo, customerId,
            customer: lead.name, phone: lead.number, email: lead.email,
            device: lead.device, issue: lead.issue,
            // Field-specific operational classification. Source is MAPPED from
            // the lead (never re-entered); leadType is the trip nature.
            leadType: jobLeadType,
            source: lead.source || "",
            branch: manager?.branch || agent?.branch || store || "",
            salesPersonId: currentUserId || "", salesPersonName: currentUserName || "",
            fieldManagerId: manager?.id || "", fieldManagerName: manager?.name || "",
            pickupAddress, pickupDate, pickupTime,
            status: "pending_assignment",
          });
          if (job) {
            await routeLead(lead.id, route);
            await updateLead(lead.id, { customerId, linkedFieldJobId: job.id });
            // Sales keeps visibility: record the field job on the lead's trail.
            await recordConversionEvent(lead.id, "field_job_created", { targetType: "field_job", targetId: job.id, targetLabel: job.jobNo });
            if (customerId) await recordConversionEvent(lead.id, "customer_linked", { targetType: "customer", targetId: customerId });
            // Direct Ninja assignment when the salesperson is authorized — no
            // mandatory Field Manager step (§6/§9). Otherwise notify managers.
            if (agent) {
              await assignNinja(job.id, agent.id, agent.name, pickupDate || undefined, pickupTime || undefined);
            } else if (manager) {
              notify({
                kind: "field_new_job", recipientId: manager.id,
                title: `New ${routeLabel} assignment`,
                body: `${job.jobNo} · ${lead.name || "Customer"} — assign a field agent.`,
                href: `/field?job=${job.id}`, reference: job.jobNo,
              });
            }
          }
        }
      }
      close();
    } finally {
      setBusy(false);
    }
  }

  const canConfirm = route === "STORE_VISIT" ? !!store : route === "PICKUP_DROP" || route === "ON_SITE";

  return (
    <Drawer
      open={open}
      onClose={close}
      title="Route Lead"
      subtitle={`${lead.leadNo} · ${lead.name || "Unnamed"}`}
      icon={ArrowRight}
      width="max-w-md"
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" onClick={close}>Cancel</Button>
          {!confirming ? (
            <Button disabled={!canConfirm} onClick={() => setConfirming(true)} className="gap-1.5">
              Continue <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          ) : (
            <Button disabled={busy} onClick={performRoute} className="gap-1.5">
              <Check className="h-3.5 w-3.5" /> {busy ? "Routing…" : "Confirm route"}
            </Button>
          )}
        </div>
      }
    >
      <div className="space-y-5">
        {existingRoute && (
          <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[12px] text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              This lead is already routed to <strong>{existingRoute === "STORE_VISIT" ? "Store / Walk-In" : existingRoute === "ON_SITE" ? "On-Site" : "Pickup & Drop"}</strong>.
              {existingFieldJob && " An active Field Job exists and will not be duplicated."}
              {existingWalkInId && " A Walk-In already exists for it."}
            </span>
          </div>
        )}

        {/* Route choice */}
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">How will we serve the customer?</p>
          <div className="grid grid-cols-1 gap-2.5">
            <RouteCard
              active={route === "STORE_VISIT"}
              onClick={() => { setRoute("STORE_VISIT"); setConfirming(false); }}
              icon={Store} title="Store / Walk-In"
              desc="Customer visits a store. Handled as a Walk-In, then Ticket."
            />
            <RouteCard
              active={route === "PICKUP_DROP"}
              onClick={() => { setRoute("PICKUP_DROP"); setConfirming(false); }}
              icon={Truck} title="Pickup & Drop"
              desc="Device is collected from the customer by a field Ninja."
            />
            <RouteCard
              active={route === "ON_SITE"}
              onClick={() => { setRoute("ON_SITE"); setConfirming(false); }}
              icon={MapPin} title="On-Site"
              desc="A field agent/technician services the customer at their location."
            />
          </div>
        </div>

        {/* Store-to-Store: pick the store */}
        {route === "STORE_VISIT" && (
          <div>
            <label className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              <Building2 className="h-3.5 w-3.5" /> Assigned Store
            </label>
            <select
              value={store}
              onChange={(e) => setStore(e.target.value)}
              className="w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm focus:border-[#4361EE] focus:outline-none"
            >
              <option value="">Select store…</option>
              {BRANCHES.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
            <p className="mt-1.5 text-[11px] text-zinc-500">The store is notified and can receive the customer as a Walk-In without re-entering details.</p>
          </div>
        )}

        {/* Pickup & Drop / On-Site: trip type + field agent + logistics */}
        {isFieldRoute && (
          <div className="space-y-3">
            {route === "PICKUP_DROP" && (
              <div>
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Trip Type</label>
                <select
                  value={leadType}
                  onChange={(e) => setLeadType(e.target.value as FieldLeadType)}
                  className="w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm focus:border-[#4361EE] focus:outline-none"
                >
                  {FIELD_LEAD_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
                <p className="mt-1.5 text-[11px] text-zinc-500">
                  Source is taken from the lead ({lead.source || "unspecified"}) — no need to re-enter it.
                </p>
              </div>
            )}
            {route === "ON_SITE" && (
              <p className="rounded-xl bg-violet-50 px-3 py-2 text-[11px] text-violet-800 ring-1 ring-inset ring-violet-200">
                On-Site: a field agent/technician will service the customer at their location. Source is taken from the lead ({lead.source || "unspecified"}).
              </p>
            )}

            {/* Direct field-agent (Ninja) assignment — only when authorized.
                The Field Manager is not a mandatory intermediary. */}
            {canAssignNinja && (
              <div>
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                  Assign Field Agent {route === "ON_SITE" ? "" : "/ Ninja"} (optional)
                </label>
                <select
                  value={ninjaId}
                  onChange={(e) => setNinjaId(e.target.value)}
                  className="w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm focus:border-[#4361EE] focus:outline-none"
                >
                  <option value="">Not yet — Field Manager will assign</option>
                  {fieldAgents.map((a) => <option key={a.id} value={a.id}>{a.name} · {a.branch}</option>)}
                </select>
                <p className="mt-1.5 text-[11px] text-zinc-500">Pick a field agent directly, or leave it for a Field Manager to assign.</p>
              </div>
            )}
            <div>
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Field Manager (optional)</label>
              <select
                value={fieldManagerId}
                onChange={(e) => setFieldManagerId(e.target.value)}
                className="w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm focus:border-[#4361EE] focus:outline-none"
              >
                <option value="">Auto — notify all Field Managers</option>
                {managers.map((m) => <option key={m.id} value={m.id}>{m.name} · {m.branch}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                <MapPin className="h-3.5 w-3.5" /> Pickup Address
              </label>
              <textarea
                value={pickupAddress}
                onChange={(e) => setPickupAddress(e.target.value)}
                rows={2}
                placeholder="Where the Ninja will collect the device"
                className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm focus:border-[#4361EE] focus:outline-none"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Preferred Date</label>
                <input type="date" value={pickupDate} onChange={(e) => setPickupDate(e.target.value)}
                  className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm focus:border-[#4361EE] focus:outline-none" />
              </div>
              <div>
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Preferred Time</label>
                <TimePicker value={pickupTime} onChange={setPickupTime} />
              </div>
            </div>
            <p className="text-[11px] text-zinc-500">Pickup date is a logistics schedule — separate from the Lead follow-up date.</p>
          </div>
        )}

        {/* Confirmation summary */}
        {confirming && route && (
          <div className="rounded-xl border border-[#4361EE]/30 bg-[#EEF1FD] p-3.5 text-sm">
            <p className="font-semibold text-[#4361EE]">
              Route {lead.leadNo} to {route === "STORE_VISIT" ? "Store / Walk-In" : route === "ON_SITE" ? "On-Site" : "Pickup & Drop"}?
            </p>
            <p className="mt-1 text-[12px] text-zinc-600">
              {route === "STORE_VISIT"
                ? `${store} will be notified and can receive ${lead.name || "the customer"} as a Walk-In.`
                : canAssignNinja && ninjaId
                  ? `A Field Job will be created and assigned directly to ${fieldAgents.find((a) => a.id === ninjaId)?.name || "the selected agent"}.`
                  : `A Field Job will be created and ${fieldManagerId ? "the selected Field Manager" : "all Field Managers"} will be notified to assign a field agent.`}
            </p>
          </div>
        )}
      </div>
    </Drawer>
  );
}

function RouteCard({ active, onClick, icon: Icon, title, desc }: {
  active: boolean; onClick: () => void;
  icon: React.ComponentType<{ className?: string }>; title: string; desc: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-start gap-3 rounded-2xl border p-3.5 text-left transition",
        active ? "border-[#4361EE] bg-[#EEF1FD] ring-1 ring-[#4361EE]/30" : "border-border bg-card hover:border-[#4361EE]/40 hover:bg-muted/40",
      )}
    >
      <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-xl", active ? "bg-[#4361EE] text-white" : "bg-muted text-zinc-500")}>
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0">
        <span className="flex items-center gap-1.5 font-semibold text-zinc-900">
          {title}
          {active && <Check className="h-3.5 w-3.5 text-[#4361EE]" />}
        </span>
        <span className="mt-0.5 block text-[12px] text-zinc-500">{desc}</span>
      </span>
    </button>
  );
}
