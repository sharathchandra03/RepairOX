"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Route Lead (Sales fulfilment decision) — CENTRED modal.

   "How will we serve the customer?"
     • Store / Walk-In → assign a Store, notify it; the store converts the Lead
                          into a Walk-In on arrival.            (logic UNCHANGED)
     • Pickup & Drop   → create a Field Trip (field_jobs) via the Field module.
     • On-Site         → create a Field Trip of the on-site type.

   Field routes add a second stage that captures the customer's service location
   (address / PIN / landmark / Google Maps link) and — mandatory — what the Sales
   Agent communicated to the customer. The note is stored append-only against the
   trip (field_job_events) and appears in the Lead Journey + trip timeline.

   Rules kept: Customer Master via resolveCustomer (no duplicates) · Sales owner
   never replaced by the Field Engineer · Lead Store ≠ Operational Store · no
   status/temperature/revenue side-effects on the Lead · confirm before creating
   · idempotent (clientRequestId) so retries/double-clicks make ONE trip.
   ────────────────────────────────────────────────────────────────────────── */

import { useMemo, useRef, useState } from "react";
import { Store, Truck, ArrowRight, Check, MapPin, Building2, AlertTriangle, ChevronLeft, Phone, Smartphone, MessageSquareText } from "lucide-react";
import { RoxCenteredForm } from "@/components/ui/rox-centered-form";
import { Button } from "@/components/ui/button";
import { RSelect } from "@/components/ui/rselect";
import { TimePicker } from "@/components/ui/time-picker";
import { InfoHint } from "@/components/ui/info-hint";
import { cn } from "@/lib/utils";
import { useLeads } from "@/lib/leads-context";
import { useField } from "@/lib/field-context";
import { useStore } from "@/lib/store";
import { useStoreContext } from "@/lib/store-context";
import { usePermissions } from "@/lib/permissions-context";
import { useSession } from "@/lib/use-session";
import { toast } from "@/components/ui/toaster";
import { BRANCHES } from "@/lib/auth";
import { CAP, allow } from "@/lib/capabilities";
import { resolveCustomer, staffByRole, activeJobCountFor } from "@/lib/field-linking";
import { normaliseRoute, FIELD_LEAD_TYPES, type FulfilmentRoute, type FieldLeadType, type FieldJob } from "@/lib/field-data";
import { notify } from "@/lib/notifications";
import { fullLeadLocation, getLeadDevices, type Lead } from "@/lib/leads-data";
import { devicesToJobFields, tripDevicesFromLead } from "@/lib/field-devices";
import { locationFromLead, validateLocation, hasLocationErrors, locationToJobFields, locationToLeadPatch, type ServiceLocation } from "@/lib/field-location";
import { ServiceLocationFields } from "@/components/field/service-location-fields";

type Stage = "choose" | "details" | "confirm";

const newRequestId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `req-${Date.now()}-${Math.random().toString(16).slice(2)}`;

export function RouteLeadDialog({ lead, open, onClose }: { lead: Lead | null; open: boolean; onClose: () => void }) {
  // Mounted only while open and keyed by lead → fresh state (+ a fresh
  // idempotency key) for every routing attempt, never stale from another lead.
  if (!open || !lead) return null;
  return <RouteInner key={lead.id} lead={lead} onClose={onClose} />;
}

function RouteInner({ lead, onClose }: { lead: Lead; onClose: () => void }) {
  const { routeLead, updateLead, recordConversionEvent } = useLeads();
  const { createJob, jobsForLead, assignNinja, addJobNote, jobs } = useField();
  const { customers, addCustomer } = useStore();
  const { stores } = useStoreContext();
  const { team, can } = usePermissions();
  const { id: currentUserId, name: currentUserName } = useSession();

  const canAssignNinja = allow(can, CAP.field.assignNinja);
  const canCreateTrip = allow(can, CAP.field.create);

  const existingRoute = normaliseRoute(lead.fulfilmentRoute);
  const requestId = useRef(newRequestId());
  const submitting = useRef(false);

  const [stage, setStage] = useState<Stage>("choose");
  const [route, setRoute] = useState<FulfilmentRoute | "">(existingRoute);
  const [store, setStore] = useState<string>(lead.assignedStore || "");
  const [tripType, setTripType] = useState<FieldLeadType>("pickup");
  const [opStoreId, setOpStoreId] = useState<string>(lead.branchId || stores[0]?.id || "");
  const [loc, setLoc] = useState<ServiceLocation>(() => locationFromLead(lead));
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [window_, setWindow] = useState("");
  const [engineerId, setEngineerId] = useState("");
  const [comm, setComm] = useState("");
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);

  const isFieldRoute = route === "PICKUP_DROP" || route === "ON_SITE";
  const engineers = useMemo(() => {
    const all = staffByRole(team, ["ninja", "field_manager", "technician", "senior_technician"]);
    const name = stores.find((s) => s.id === opStoreId)?.name;
    const inStore = name ? all.filter((m) => !m.branch || m.branch === name) : all;
    return inStore.length ? inStore : all;
  }, [team, stores, opStoreId]);

  const openTrip: FieldJob | undefined = jobsForLead(lead.id).find((j) => j.status !== "cancelled" && j.status !== "completed");
  const leadDevices = getLeadDevices(lead);
  const dev = leadDevices[0];

  const locErrors = useMemo(() => validateLocation(loc), [loc]);
  const commError = comm.trim().length < 5 ? "Record what you communicated to the customer." : "";
  const detailsValid = !hasLocationErrors(locErrors) && !commError;

  const routeLabel = route === "STORE_VISIT" ? "Store / Walk-In" : route === "ON_SITE" ? "On-Site" : "Pickup & Drop";
  const jobType: FieldLeadType = route === "ON_SITE" ? "onsite" : tripType;
  const close = () => { if (!busy) onClose(); };

  const canContinueChoose = route === "STORE_VISIT" ? !!store : isFieldRoute && canCreateTrip;

  function next() {
    if (stage === "choose") {
      if (route === "STORE_VISIT") setStage("confirm");
      else if (isFieldRoute) setStage("details");
    } else if (stage === "details") {
      setTouched(true);
      if (detailsValid) setStage("confirm");
    }
  }
  function back() {
    if (stage === "confirm") setStage(isFieldRoute ? "details" : "choose");
    else if (stage === "details") setStage("choose");
  }

  async function performRoute() {
    if (!route || submitting.current) return;
    submitting.current = true; setBusy(true);
    try {
      const { customerId, created } = resolveCustomer(customers, {
        name: lead.name, phone: lead.number, altPhone: lead.alternateNumber, email: lead.email,
        address: fullLeadLocation(lead), source: "sales", existingCustomerId: lead.customerId || undefined,
      });
      if (created) await addCustomer(created);

      if (route === "STORE_VISIT") {
        await routeLead(lead.id, "STORE_VISIT", { assignedStore: store });
        await updateLead(lead.id, { customerId });
        notify({
          kind: "lead_routed", recipientRole: "reception", title: "Store / Walk-In lead assigned",
          body: `${lead.leadNo} · ${lead.name || "Customer"} — ${lead.device || "device"} heading to ${store || "your store"}.`,
          href: `/leads/list?lead=${lead.id}`, reference: lead.leadNo,
        });
        toast.success("Routed to Store / Walk-In", { description: `${lead.leadNo} → ${store || "store"} · store will receive as Walk-In.` });
        onClose();
        return;
      }

      if (openTrip) {
        toast.info("Field trip exists", { description: `${openTrip.jobNo} already handles this lead.` });
        onClose();
        return;
      }

      const opStore = stores.find((s) => s.id === opStoreId);
      const eng = engineers.find((m) => m.id === engineerId);
      const job = await createJob(
        {
          leadId: lead.id, leadNo: lead.leadNo, customerId,
          customer: lead.name, phone: lead.number, altPhone: lead.alternateNumber, email: lead.email,
          // Every device on the lead goes onto the trip (device #1 mirrored flat).
          ...(leadDevices.length > 0 ? devicesToJobFields(tripDevicesFromLead(leadDevices)) : {
            device: lead.device, modelId: lead.deviceModelId, category: lead.deviceCategoryId,
            deviceCategoryId: lead.deviceCategoryId, deviceBrandId: lead.deviceBrandId, issue: lead.issue,
          }),
          leadType: jobType, source: lead.source || "",
          branch: opStore?.name || "", leadBranchId: lead.branchId || "",
          // Sales attribution = the LEAD owner; the routing user never overwrites it.
          salesPersonId: lead.assignedTo || currentUserId || "", salesPersonName: lead.assignedToName || currentUserName || "",
          pickupDate: date, pickupTime: time, preferredWindow: window_.trim(),
          ...locationToJobFields(loc),
          status: "pending_assignment", clientRequestId: requestId.current,
        },
        opStoreId || lead.branchId || null,
      );
      if (!job) { toast.error("Couldn't create the Field assignment", { description: "Your entries are kept — try again." }); return; }

      await routeLead(lead.id, route);
      // Explicit rule: Route is the flow that updates the Lead's CURRENT service location.
      await updateLead(lead.id, { customerId, linkedFieldJobId: job.id, ...locationToLeadPatch(loc), locationUnit: "" });
      await recordConversionEvent(lead.id, "field_job_created", { targetType: "field_job", targetId: job.id, targetLabel: job.jobNo });
      if (customerId) await recordConversionEvent(lead.id, "customer_linked", { targetType: "customer", targetId: customerId });
      // Append-only customer-communication note (Lead Journey + trip timeline).
      await addJobNote(job.id, comm, "communication", "lead_routing");

      if (eng && canAssignNinja) {
        await assignNinja(job.id, eng.id, eng.name, date || undefined, time || undefined);
      } else {
        const mgrs = staffByRole(team, ["field_manager"]);
        mgrs.forEach((m) => notify({
          kind: "field_new_job", recipientId: m.id, title: `New ${routeLabel} assignment`,
          body: `${job.jobNo} · ${lead.name || "Customer"} — assign a Field Engineer.`, href: `/field/${job.id}`, reference: job.jobNo,
        }));
      }
      toast.success("Field assignment created", { description: `Trip ${job.jobNo} · ${lead.leadNo}` });
      onClose();
    } finally {
      submitting.current = false; setBusy(false);
    }
  }

  const footer = (
    <div className="flex w-full items-center justify-between gap-2">
      <div>{stage !== "choose" && <Button variant="ghost" size="sm" className="gap-1" onClick={back} disabled={busy}><ChevronLeft className="h-4 w-4" /> Back</Button>}</div>
      <div className="flex items-center gap-2">
        <Button variant="outline" onClick={close} disabled={busy}>Cancel</Button>
        {stage !== "confirm" ? (
          <Button disabled={stage === "choose" ? !canContinueChoose : false} onClick={next} className="gap-1.5">Continue <ArrowRight className="h-3.5 w-3.5" /></Button>
        ) : (
          <Button disabled={busy || (isFieldRoute && !!openTrip)} loading={busy} onClick={performRoute} className="gap-1.5">
            <Check className="h-3.5 w-3.5" /> {busy ? "Creating…" : isFieldRoute ? "Create Field Assignment" : "Confirm route"}
          </Button>
        )}
      </div>
    </div>
  );

  return (
    <RoxCenteredForm
      open onClose={close} title="Route Lead" subtitle={`${lead.leadNo} · ${lead.name || "Unnamed"}`} icon={ArrowRight}
      width={stage === "choose" ? "max-w-3xl" : "max-w-2xl"} closeOnBackdrop={!busy} footer={footer}
    >
      {/* Lead context strip */}
      <div className="relative mb-5 grid grid-cols-2 gap-x-6 gap-y-3 overflow-hidden rounded-xl border border-[#4361EE]/20 bg-gradient-to-r from-[#E6EBFF] via-[#F1F4FF] to-white py-3.5 pl-5 pr-4 text-[12.5px] shadow-[0_1px_2px_rgba(67,97,238,0.08)] sm:grid-cols-4">
        <span aria-hidden className="absolute inset-y-0 left-0 w-1.5 bg-gradient-to-b from-[#4361EE] to-[#7C8CF5]" />
        <div><p className="text-[10px] font-semibold uppercase tracking-wider text-[#4361EE]/80">Lead</p><p className="font-bold tnum text-[#2B3FB8]">{lead.leadNo}</p></div>
        <div className="min-w-0"><p className="text-[10px] font-semibold uppercase tracking-wider text-[#4361EE]/80">Customer</p><p className="truncate font-semibold">{lead.name || "—"}</p></div>
        <div className="min-w-0"><p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-[#4361EE]/80"><Phone className="h-3 w-3" /> Mobile</p><p className="truncate font-medium tnum">{lead.number || "—"}</p></div>
        <div className="min-w-0"><p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-[#4361EE]/80"><Smartphone className="h-3 w-3" /> Device</p><p className="truncate font-medium" title={leadDevices.map((x) => x.label).filter(Boolean).join(", ")}>{dev?.label || lead.device || "—"}{leadDevices.length > 1 ? <span className="ml-1 rounded-full bg-[#4361EE]/10 px-1.5 py-0.5 text-[10px] font-bold text-[#4361EE]">+{leadDevices.length - 1}</span> : null}</p>
          {(dev?.issue || lead.issue) && <p className="truncate text-[11px] text-muted-foreground">{dev?.issue || lead.issue}</p>}</div>
      </div>

      {existingRoute && stage === "choose" && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[12px] text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            This lead is already routed to <strong>{existingRoute === "STORE_VISIT" ? "Store / Walk-In" : existingRoute === "ON_SITE" ? "On-Site" : "Pickup & Drop"}</strong>.
            {openTrip && ` Trip ${openTrip.jobNo} is still open and will not be duplicated.`}
            {lead.linkedWalkInId && " A Walk-In already exists for it."}
          </span>
        </div>
      )}

      {/* ── Stage 1: choose ── */}
      {stage === "choose" && (
        <div className="space-y-5">
          <div>
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">How will we serve the customer?</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <RouteCard active={route === "STORE_VISIT"} onClick={() => setRoute("STORE_VISIT")} icon={Store} title="Store / Walk-In" desc="Customer visits a store. Handled as a Walk-In, then Ticket." />
              <RouteCard active={route === "PICKUP_DROP"} onClick={() => setRoute("PICKUP_DROP")} icon={Truck} title="Pickup & Drop" desc="Device is collected from the customer by a field Ninja." />
              <RouteCard active={route === "ON_SITE"} onClick={() => setRoute("ON_SITE")} icon={MapPin} title="On-Site" desc="A field agent/technician services the customer at their location." />
            </div>
            {isFieldRoute && !canCreateTrip && <p className="mt-2 text-[12px] text-rose-600">You don't have permission to create Field assignments.</p>}
          </div>

          {route === "STORE_VISIT" && (
            <div>
              <label className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500"><Building2 className="h-3.5 w-3.5" /> Assigned Store</label>
              <RSelect className="h-[38px]" value={store} onChange={setStore} searchable placeholder="Select store…"
                options={[{ label: "Select store…", value: "" }, ...BRANCHES.map((b) => ({ label: b, value: b }))]} />
              <p className="mt-1.5 text-[11px] text-zinc-500">The store is notified and can receive the customer as a Walk-In without re-entering details.</p>
            </div>
          )}
        </div>
      )}

      {/* ── Stage 2: field details ── */}
      {stage === "details" && isFieldRoute && (
        <div className="space-y-5">
          <h3 className="text-[13px] font-bold uppercase tracking-wider text-foreground">{routeLabel} Assignment</h3>

          {route === "PICKUP_DROP" && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="flex h-5 items-center gap-1 text-[12px] font-medium text-zinc-700">Trip type</label>
                <RSelect className="h-[38px]" value={tripType} onChange={(v) => setTripType(v as FieldLeadType)}
                  options={FIELD_LEAD_TYPES.filter((t) => t.value !== "onsite" && t.value !== "warranty_onsite").map((t) => ({ label: t.label, value: t.value }))} />
              </div>
              <div className="space-y-1.5">
                <label className="flex h-5 items-center gap-1 text-[12px] font-medium text-zinc-700">Drop to <InfoHint>Defaults to the operational store below. A different drop address can be set later from the trip.</InfoHint></label>
                <div className="flex h-[38px] items-center rounded-xl border border-input bg-muted/40 px-3 text-[13px] text-foreground">{stores.find((s) => s.id === opStoreId)?.name || "Operational store"}</div>
              </div>
            </div>
          )}

          <ServiceLocationFields value={loc} onChange={setLoc} errors={locErrors} touched={touched}
            addressLabel={route === "ON_SITE" ? "Service location" : "Pickup from (customer location)"} />

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <label className="flex h-5 items-center gap-1 text-[12px] font-medium text-zinc-700">Date <InfoHint>Optional — the agreed trip date. Separate from the lead follow-up date.</InfoHint></label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-[38px] w-full rounded-xl border border-input bg-card px-3 text-[13px] outline-none focus:border-[#4361EE] focus:ring-2 focus:ring-[#4361EE]/15" />
            </div>
            <div className="space-y-1.5"><label className="flex h-5 items-center gap-1 text-[12px] font-medium text-zinc-700">Time</label><TimePicker className="h-[38px]" value={time} onChange={setTime} /></div>
            <div className="space-y-1.5"><label className="flex h-5 items-center gap-1 text-[12px] font-medium text-zinc-700">Customer's window</label>
              <input value={window_} onChange={(e) => setWindow(e.target.value)} placeholder="11 AM – 1 PM" className="h-[38px] w-full rounded-xl border border-input bg-card px-3 text-[13px] outline-none focus:border-[#4361EE] focus:ring-2 focus:ring-[#4361EE]/15" /></div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="flex h-5 items-center gap-1 text-[12px] font-medium text-zinc-700">Operational store <InfoHint>The store that handles this trip. The Lead's own store ({stores.find((s) => s.id === lead.branchId)?.name || "—"}) is never changed.</InfoHint></label>
              <RSelect className="h-[38px]" value={opStoreId} onChange={(v) => { setOpStoreId(v); setEngineerId(""); }} options={stores.map((s) => ({ label: s.name, value: s.id }))} placeholder="Select store" />
            </div>
            {canAssignNinja && (
              <div className="space-y-1.5">
                <label className="flex h-5 items-center gap-1 text-[12px] font-medium text-zinc-700">Field Engineer (optional) <InfoHint>Leave empty and Field Managers are notified to assign one. The Sales Agent is never used as the engineer.</InfoHint></label>
                <RSelect className="h-[38px]" value={engineerId} onChange={setEngineerId} searchable
                  options={[{ label: "Not yet — Field Manager will assign", value: "" }, ...engineers.map((m) => ({ label: `${m.name} · ${activeJobCountFor(m.id, jobs)} open`, value: m.id }))]} />
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="flex h-5 items-center gap-1 text-[12px] font-medium text-zinc-700"><MessageSquareText className="h-3.5 w-3.5 text-[#4361EE]" /> What did you communicate with the customer? <span className="text-rose-500">*</span></label>
            <textarea rows={3} value={comm} onChange={(e) => setComm(e.target.value)}
              placeholder="e.g. Customer confirmed pickup tomorrow 11 AM–1 PM and agreed to the visit charge; call 10 min before arriving."
              className={cn("w-full rounded-xl border bg-card px-3 py-2 text-[13px] outline-none transition-all placeholder:text-muted-foreground",
                touched && commError ? "border-rose-300 focus:ring-2 focus:ring-rose-200/40" : "border-input hover:border-[#4361EE]/40 focus:border-[#4361EE] focus:ring-2 focus:ring-[#4361EE]/15")} />
            {touched && commError && <p className="text-[11px] font-medium text-rose-600">{commError}</p>}
            <p className="text-[11px] text-muted-foreground">Saved as an internal note on the Lead timeline and the trip. It is never sent to the customer.</p>
          </div>
        </div>
      )}

      {/* ── Stage 3: confirm ── */}
      {stage === "confirm" && route && (
        <div className="rounded-xl border border-[#4361EE]/30 bg-[#EEF1FD] p-4 text-sm">
          <p className="font-semibold text-[#4361EE]">Route {lead.leadNo} to {routeLabel}?</p>
          {route === "STORE_VISIT" ? (
            <p className="mt-1 text-[12.5px] text-zinc-600">{store} will be notified and can receive {lead.name || "the customer"} as a Walk-In.</p>
          ) : (
            <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 text-[12.5px] sm:grid-cols-2">
              <Row k="Customer" v={`${lead.name || "—"} · ${lead.number || ""}`} />
              <Row k="Route" v={`${routeLabel}${route === "PICKUP_DROP" ? ` · ${FIELD_LEAD_TYPES.find((t) => t.value === tripType)?.label}` : ""}`} />
              <Row k={route === "ON_SITE" ? "Service location" : "Pickup from"} v={`${loc.address}${loc.pincode ? ` – ${loc.pincode}` : ""}`} wide />
              <Row k="Map" v={loc.lat != null ? `Pinned (${loc.lat.toFixed(4)}, ${loc.lng!.toFixed(4)})` : loc.mapsUrl ? "Link saved (no coordinates)" : "Not provided"} />
              <Row k="Scheduled" v={date ? `${date}${time ? ` ${time}` : ""}${window_ ? ` · ${window_}` : ""}` : "To be scheduled"} />
              <Row k="Operational store" v={stores.find((s) => s.id === opStoreId)?.name || "—"} />
              <Row k="Field Engineer" v={engineers.find((m) => m.id === engineerId)?.name || "Field Manager will assign"} />
              <Row k="Communication note" v={comm} wide />
            </dl>
          )}
          {isFieldRoute && openTrip && <p className="mt-3 text-[12px] font-semibold text-amber-700">Trip {openTrip.jobNo} is already open for this lead — a second trip can't be created until it is completed or cancelled.</p>}
        </div>
      )}
    </RoxCenteredForm>
  );
}

function Row({ k, v, wide }: { k: string; v: string; wide?: boolean }) {
  return (
    <div className={cn("min-w-0", wide && "sm:col-span-2")}>
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{k}</dt>
      <dd className="whitespace-pre-line break-words text-foreground">{v || "—"}</dd>
    </div>
  );
}

function RouteCard({ active, onClick, icon: Icon, title, desc }: {
  active: boolean; onClick: () => void; icon: React.ComponentType<{ className?: string }>; title: string; desc: string;
}) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active}
      className={cn("flex h-full flex-col items-start gap-3 rounded-2xl border p-4 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4361EE]/40",
        active ? "border-[#4361EE] bg-[#EEF1FD] ring-1 ring-[#4361EE]/30" : "border-border bg-card hover:-translate-y-0.5 hover:border-[#4361EE]/40 hover:shadow-card")}>
      <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl", active ? "bg-[#4361EE] text-white" : "bg-muted text-zinc-500")}><Icon className="h-5 w-5" /></span>
      <span className="min-w-0">
        <span className="flex items-center gap-1.5 text-[15px] font-semibold text-zinc-900">{title}{active && <Check className="h-4 w-4 text-[#4361EE]" />}</span>
        <span className="mt-1 block text-[12px] leading-snug text-zinc-500">{desc}</span>
      </span>
    </button>
  );
}
