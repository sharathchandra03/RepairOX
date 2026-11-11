"use client";
/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — NEW FIELD ASSIGNMENT (3 steps, same form language as the Lead form).

   1 Initial Information · 2 Contact Information · 3 Device Information
   • Optional "Link existing Lead" lookup auto-fills customer / devices / source /
     location. It searches ONLY leads the caller can already see (RLS-scoped
     useLeads().leads) — an inaccessible lead is reported as "not found", never
     exposed.
   • MULTI-DEVICE like the Add Lead form: repeatable device cards ("Add another
     device"). Device #1 is mirrored into the single-device fields so every
     existing reader keeps working.
   • REVIEW pill (top of the last step) opens a read-only summary of everything
     entered; each group has an Edit link back to its step. Never a flow step.
   • Customer Master is reused (CustomerPicker / resolveCustomer) — no duplicates.
   • Editing trip fields NEVER rewrites the Customer Master or the Lead.
   • Idempotent: one clientRequestId per form-open, so a double click / retry
     resolves to the same trip. Trip ID is allocated server-side by createJob.
   ────────────────────────────────────────────────────────────────────────── */
import { Fragment, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Truck, Check, ChevronLeft, ChevronRight, ChevronDown, Link2, X, AlertCircle, CheckCircle2, Search, Lock, Plus, ClipboardList,
} from "lucide-react";
import { RoxCenteredForm } from "@/components/ui/rox-centered-form";
import { Button } from "@/components/ui/button";
import { RSelect } from "@/components/ui/rselect";
import { TimePicker } from "@/components/ui/time-picker";
import { InfoHint } from "@/components/ui/info-hint";
import { toast } from "@/components/ui/toaster";
import { CustomerPicker } from "@/components/common/customer-picker";
import { DeviceCatalogPicker } from "@/components/leads/lead-form-fields";
import { ServiceLocationFields } from "@/components/field/service-location-fields";
import { cn } from "@/lib/utils";
import { useLeads } from "@/lib/leads-context";
import { useField } from "@/lib/field-context";
import { useStore } from "@/lib/store";
import { useStoreContext } from "@/lib/store-context";
import { usePermissions } from "@/lib/permissions-context";
import { useSession } from "@/lib/use-session";
import { CAP, allow } from "@/lib/capabilities";
import { resolveCustomer, staffByRole, activeJobCountFor } from "@/lib/field-linking";
import { FIELD_LEAD_TYPES, type FieldJob, type FieldLeadType, type FieldJobDraft, type FieldTripDevice } from "@/lib/field-data";
import { EMPTY_LOCATION, locationFromLead, validateLocation, hasLocationErrors, locationToJobFields, type ServiceLocation } from "@/lib/field-location";
import {
  emptyTripDevice, devicesToJobFields, tripDeviceHasData, validateTripDevices,
} from "@/lib/field-devices";
import { getLeadDevices, type Lead } from "@/lib/leads-data";
import { leadToTripPrefill, prefillSummary, leadGapPatch } from "@/lib/lead-to-trip";
import { reverseGeocodeFull } from "@/lib/geo/reverse-geocode";
import { searchLeads, pickBestLead } from "@/lib/lead-picker-search";

const STEPS = [
  { id: 1, label: "Initial Information" },
  { id: 2, label: "Contact Information" },
  { id: 3, label: "Device Information" },
];

const inputCls = (invalid?: boolean) =>
  cn("h-[38px] w-full rounded-xl border bg-card px-3 text-[13px] outline-none transition-all placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:bg-muted/50",
    invalid ? "border-rose-300 focus:border-rose-400 focus:ring-2 focus:ring-rose-200/40"
      : "border-input hover:border-[#4361EE]/40 focus:border-[#4361EE] focus:ring-2 focus:ring-[#4361EE]/15");

function Field({ label, required, error, hint, children, className }: { label: React.ReactNode; required?: boolean; error?: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label className="flex h-5 items-center gap-1 text-[12px] font-medium text-zinc-700">
        {label}{required && <span className="text-rose-500">*</span>}{hint && <InfoHint>{hint}</InfoHint>}
      </label>
      {children}
      {error && <p className="flex items-center gap-1 text-[11px] font-medium text-rose-600"><AlertCircle className="h-3 w-3" /> {error}</p>}
    </div>
  );
}

const newRequestId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `req-${Date.now()}-${Math.random().toString(16).slice(2)}`;

interface Draft {
  date: string; time: string; window: string; type: FieldLeadType; source: string; storeId: string; engineerId: string;
  customerId: string; name: string; phone: string; altPhone: string; email: string;
  devices: FieldTripDevice[]; comment: string;
}

export function FieldAssignmentForm({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated?: (job: FieldJob) => void }) {
  if (!open) return null;
  return <Inner onClose={onClose} onCreated={onCreated} />;
}

/* ─── One device card (repeatable in Step 3) — mirrors the Add Lead DeviceCard ── */
function DeviceCard({
  index, total, device, expanded, fromLead, errors, touched, onToggle, onChange, onRemove,
}: {
  index: number; total: number; device: FieldTripDevice; expanded: boolean; fromLead: boolean;
  errors?: { device?: string; issue?: string }; touched: boolean;
  onToggle: () => void; onChange: (patch: Partial<FieldTripDevice>) => void; onRemove: () => void;
}) {
  const collapsible = total > 1;
  const showBody = expanded || !collapsible;
  const bad = touched && !!errors && (errors.device || errors.issue);
  return (
    <div className={cn("overflow-hidden rounded-xl border bg-muted/20 transition-colors", bad ? "border-rose-300" : showBody ? "border-[#4361EE]/30" : "border-border")}>
      <div
        className={cn("flex items-center justify-between gap-2 px-4 py-3", collapsible && "cursor-pointer select-none", collapsible && !showBody && "hover:bg-muted/40")}
        onClick={collapsible ? onToggle : undefined}
        role={collapsible ? "button" : undefined}
        aria-expanded={collapsible ? showBody : undefined}
      >
        <span className="flex min-w-0 flex-1 items-center gap-2">
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-indigo-100 text-[10px] font-bold text-indigo-700">{index + 1}</span>
          {collapsible && !showBody ? (
            <span className="flex min-w-0 flex-1 flex-col leading-tight">
              <span className="truncate text-[13px] font-semibold text-zinc-800">{device.label || "New device"}</span>
              <span className="truncate text-[11.5px] text-muted-foreground">{device.issue || "Issue not set"}{device.imei ? ` · ${device.imei}` : ""}</span>
            </span>
          ) : (
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{total > 1 ? `Device ${index + 1}` : "Device"}</span>
          )}
          {fromLead && <span className="shrink-0 rounded bg-sky-50 px-1 text-[9px] font-bold uppercase text-sky-700 ring-1 ring-inset ring-sky-200">from lead</span>}
          {bad && !showBody && <span className="shrink-0 text-[11px] font-semibold text-rose-600">Needs attention</span>}
        </span>
        <span className="flex shrink-0 items-center gap-1">
          {total > 1 && (
            <button type="button" onClick={(e) => { e.stopPropagation(); onRemove(); }}
              className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-rose-600 transition hover:bg-rose-50">
              <X className="h-3.5 w-3.5" /> Remove
            </button>
          )}
          {collapsible && (
            <span className="grid h-6 w-6 place-items-center text-muted-foreground">
              <ChevronDown className={cn("h-4 w-4 transition-transform duration-200", showBody && "rotate-180")} />
            </span>
          )}
        </span>
      </div>
      <AnimatePresence initial={false}>
        {showBody && (
          <motion.div key="body" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }} style={{ overflow: "hidden" }}>
            <div className="space-y-4 px-4 pb-4">
              <Field label="Device" required error={touched ? errors?.device : undefined} hint="Category → Brand → Model from the shared Device Catalog.">
                <DeviceCatalogPicker
                  value={{ categoryId: device.categoryId, brandId: device.brandId, modelId: device.modelId, label: device.label }}
                  onChange={(s) => onChange({ categoryId: s.categoryId, brandId: s.brandId, modelId: s.modelId, label: s.label })}
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="IMEI / Serial Number"><input className={inputCls()} value={device.imei} onChange={(e) => onChange({ imei: e.target.value })} placeholder="Optional" /></Field>
                <Field label="Accessories handed over" hint="Charger, cable, box, SIM tray key…"><input className={inputCls()} value={device.accessories} onChange={(e) => onChange({ accessories: e.target.value })} placeholder="e.g. Charger, box" /></Field>
              </div>
              <Field label="Issue" required error={touched ? errors?.issue : undefined}>
                <input className={inputCls(touched && !!errors?.issue)} value={device.issue} onChange={(e) => onChange({ issue: e.target.value })} placeholder="Customer-reported problem" />
              </Field>
              <Field label="Device condition at collection" hint="Visible damage, water marks, passcode status — keep it short.">
                <input className={inputCls()} value={device.condition} onChange={(e) => onChange({ condition: e.target.value })} placeholder="Optional" />
              </Field>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─── Review group (read-only reflection of the draft; Edit jumps to the step) ── */
function ReviewGroup({ title, rows, onEdit }: { title: string; rows: [string, string | null | undefined][]; onEdit: () => void }) {
  const filled = rows.filter(([, v]) => v != null && String(v).trim() !== "" && v !== "—");
  return (
    <div className="rounded-xl border border-border bg-card p-3.5">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{title}</h4>
        <button type="button" onClick={onEdit} className="text-[11px] font-medium text-[#4361EE] hover:underline">Edit</button>
      </div>
      {filled.length === 0 ? (
        <p className="text-[12px] text-muted-foreground">Nothing entered.</p>
      ) : (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5">
          {filled.map(([k, v]) => (
            <div key={k} className="min-w-0">
              <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{k}</dt>
              <dd className="break-words text-[13px] text-foreground">{v}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

function Inner({ onClose, onCreated }: { onClose: () => void; onCreated?: (job: FieldJob) => void }) {
  const { leads, optionsFor, updateLead, routeLead, recordConversionEvent } = useLeads();
  const { jobs, createJob, assignNinja, addJobNote, jobsForLead } = useField();
  const { customers, addCustomer } = useStore();
  const { activeStoreId, stores } = useStoreContext();
  const { team, can, currentUser, role } = usePermissions();
  const { name: meName } = useSession();
  const canCreate = allow(can, CAP.field.create);
  const canAssign = allow(can, CAP.field.assignNinja);

  const requestId = useRef(newRequestId());
  const submitting = useRef(false);
  const [step, setStep] = useState(1);
  // Review is NOT a step: a view-only overlay opened from the Review pill.
  const [reviewOpen, setReviewOpen] = useState(false);
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);

  const [leadQuery, setLeadQuery] = useState("");
  const [linked, setLinked] = useState<Lead | null>(null);
  const [leadError, setLeadError] = useState("");
  const [leadOpen, setLeadOpen] = useState(false);
  const [prefillNote, setPrefillNote] = useState("");

  const defaultStore = activeStoreId || stores[0]?.id || "";
  const firstDevice = useMemo(() => emptyTripDevice(), []);
  const [d, setD] = useState<Draft>({
    date: "", time: "", window: "", type: "pickup", source: "", storeId: defaultStore, engineerId: "",
    customerId: "", name: "", phone: "", altPhone: "", email: "",
    devices: [firstDevice], comment: "",
  });
  const [expandedId, setExpandedId] = useState<string>(firstDevice.id);
  const [loc, setLoc] = useState<ServiceLocation>(EMPTY_LOCATION);
  const [fromLead, setFromLead] = useState<Set<string>>(new Set());
  const [leadDeviceIds, setLeadDeviceIds] = useState<Set<string>>(new Set());
  const set = (patch: Partial<Draft>) => setD((p) => ({ ...p, ...patch }));

  /* ── Devices (multi-device, like the Add Lead form) ── */
  const updateDevice = (i: number, patch: Partial<FieldTripDevice>) =>
    setD((p) => ({ ...p, devices: p.devices.map((x, idx) => (idx === i ? { ...x, ...patch } : x)) }));
  const addDevice = () => {
    const fresh = emptyTripDevice();
    setD((p) => ({ ...p, devices: [...p.devices, fresh] }));
    setExpandedId(fresh.id); // open the new card, collapse the rest
  };
  const removeDevice = (i: number) => {
    const removed = d.devices[i]?.id;
    const next = d.devices.filter((_, idx) => idx !== i);
    const list = next.length > 0 ? next : [emptyTripDevice()];
    setD((p) => ({ ...p, devices: list }));
    if (removed && removed === expandedId) setExpandedId(list[list.length - 1].id);
  };

  /* ── Lead lookup (RLS-scoped list; inaccessible leads are simply not found) ── */
  const matches = useMemo(() => searchLeads(leads, leadQuery, 8), [leads, leadQuery]);

  /* Linking a Lead fills EVERYTHING the trip needs from ONE field map
     (lib/lead-to-trip.ts): customer, contact, source, ALL devices, comment, trip
     type, service location (pin + maps link) and the store. Nothing on the Lead
     is changed here. If the Lead has a pin but no PIN code, the PIN is looked up. */
  const pickLead = (l: Lead) => {
    const pre = leadToTripPrefill(l);
    const hasDevices = pre.devices.length > 0;
    setLinked(l); setLeadError(""); setLeadOpen(false); setLeadQuery(l.leadNo);
    setD((p) => ({
      ...p,
      customerId: pre.customerId || p.customerId, name: pre.name, phone: pre.phone,
      altPhone: pre.altPhone, email: pre.email, source: pre.source || p.source,
      type: pre.type,
      // Multi-store users working in All Shops start from the Lead's store; a user
      // working inside one store keeps that store. Either can be changed below.
      storeId: activeStoreId ? p.storeId : (pre.storeId && stores.some((x) => x.id === pre.storeId) ? pre.storeId : p.storeId),
      devices: hasDevices ? pre.devices : p.devices,
      comment: pre.comment || p.comment,
    }));
    if (hasDevices) { setLeadDeviceIds(new Set(pre.devices.map((x) => x.id))); setExpandedId(pre.devices[0].id); }
    setLoc(pre.location);
    setFromLead(new Set<string>([
      ...(pre.filled.includes("customer") ? ["name"] : []), ...(pre.filled.includes("contact") ? ["phone", "email", "altPhone"] : []),
      ...(pre.filled.includes("source") ? ["source"] : []), ...(pre.filled.includes("location") ? ["location"] : []),
      ...(pre.filled.includes("comment") ? ["comment"] : []), "type",
    ]));
    setPrefillNote(prefillSummary(pre));
    // PIN code: the Lead form has no PIN field — take it from the address text, else look it up from the pin.
    if (!pre.location.pincode && pre.location.lat != null && pre.location.lng != null) {
      const { lat, lng } = pre.location;
      void reverseGeocodeFull(lat as number, lng as number).then((r) => {
        if (!r.pincode) return;
        setLoc((cur) => (cur.lat === lat && cur.lng === lng && !cur.pincode.trim() ? { ...cur, pincode: r.pincode } : cur));
      });
    }
  };
  /* Find / Enter: an unambiguous hit (exact lead no., bare number like 009, or a
     full mobile) links straight away; otherwise the ranked list stays open. */
  const submitLeadId = () => {
    if (!leadQuery.trim()) return;
    const best = pickBestLead(leads, leadQuery);
    if (best) pickLead(best);
    else if (matches.length > 0) { setLeadOpen(true); setLeadError(""); }
    else setLeadError("No Lead matches that. Try the Lead number (e.g. 031), mobile, email, name or device — or you may not have access to it.");
  };
  const unlink = () => { setLinked(null); setFromLead(new Set()); setLeadDeviceIds(new Set()); setPrefillNote(""); setLeadQuery(""); setLeadError(""); };

  const existingOpenTrip = linked ? jobsForLead(linked.id).find((j) => j.status !== "cancelled" && j.status !== "completed") : undefined;

  /* ── Eligible Field Engineers, scoped to the operational store when known ── */
  const storeName = stores.find((s) => s.id === d.storeId)?.name || "";
  const engineers = useMemo(() => {
    const all = staffByRole(team, ["ninja", "field_manager", "technician", "senior_technician"]);
    const inStore = storeName ? all.filter((m) => !m.branch || m.branch === storeName) : all;
    return inStore.length > 0 ? inStore : all;
  }, [team, storeName]);

  const sourceOptions = useMemo(() => optionsFor("source").map((o) => o.value).filter(Boolean), [optionsFor]);

  /* ── Validation ── */
  const deviceErrors = useMemo(() => validateTripDevices(d.devices), [d.devices]);
  const errors = useMemo(() => {
    const e: Record<string, string> = {};
    if (!d.date) e.date = "Pick the scheduled trip date.";
    if (!d.storeId) e.storeId = "Select the operational store.";
    if (!d.name.trim()) e.name = "Customer name is required.";
    if (d.phone.replace(/\D/g, "").length < 10) e.phone = "Enter a valid 10-digit mobile number.";
    if (d.email.trim() && !/^\S+@\S+\.\S+$/.test(d.email.trim())) e.email = "Enter a valid email.";
    const bad = Object.values(deviceErrors);
    if (bad.some((x) => x.device)) e.device = d.devices.length > 1 ? "Select the device on every device card." : "Select the device.";
    if (bad.some((x) => x.issue)) e.issue = d.devices.length > 1 ? "Describe the issue on every device card." : "Describe the reported issue.";
    return e;
  }, [d, deviceErrors]);
  const locErrors = useMemo(() => validateLocation(loc), [loc]);
  const stepOf = (): number =>
    errors.date || errors.storeId ? 1
    : errors.name || errors.phone || errors.email || hasLocationErrors(locErrors) ? 2
    : 3;
  const valid = Object.keys(errors).length === 0 && !hasLocationErrors(locErrors);

  /** Navigate to a step (leaves the review overlay). */
  const go = (n: number) => { setReviewOpen(false); setStep(Math.max(1, Math.min(3, n))); };

  async function save() {
    setTouched(true);
    if (!valid) {
      const n = stepOf();
      go(n);
      if (n === 3) { const firstBad = d.devices.find((x) => deviceErrors[x.id]); if (firstBad) setExpandedId(firstBad.id); }
      return;
    }
    if (!canCreate || saving || submitting.current) return;
    submitting.current = true; setSaving(true);
    try {
      // Customer Master: reuse the linked/picked customer, else resolve (dedupe on phone/email).
      const { customerId, created } = resolveCustomer(customers, {
        name: d.name, phone: d.phone, altPhone: d.altPhone, email: d.email, address: loc.address, source: "sales",
        existingCustomerId: d.customerId || undefined,
      });
      if (created) await addCustomer(created);

      const store = stores.find((s) => s.id === d.storeId);
      const eng = engineers.find((m) => m.id === d.engineerId);
      const devs = d.devices.filter(tripDeviceHasData);
      const draft: FieldJobDraft = {
        leadId: linked?.id ?? "", leadNo: linked?.leadNo ?? "", customerId,
        leadType: d.type, source: d.source || linked?.source || "",
        customer: d.name.trim(), phone: d.phone.trim(), altPhone: d.altPhone.trim(), email: d.email.trim(),
        // Device #1 is mirrored into the flat fields; the full list is stored in `devices`.
        ...devicesToJobFields(devs),
        branch: store?.name ?? "", leadBranchId: linked?.branchId || "",
        // Sales attribution stays with the LEAD owner; a direct trip has none.
        salesPersonId: linked?.assignedTo ?? "", salesPersonName: linked?.assignedToName ?? "",
        pickupDate: d.date, pickupTime: d.time, preferredWindow: d.window.trim(),
        ...locationToJobFields(loc),
        notes: "", status: "pending_assignment", clientRequestId: requestId.current,
      };
      const job = await createJob(draft, d.storeId || null);
      if (!job) { toast.error("Couldn't create the assignment", { description: "Your entries are kept — try again." }); return; }

      if (eng && canAssign && !job.ninjaId) await assignNinja(job.id, eng.id, eng.name, d.date, d.time || undefined);
      if (d.comment.trim()) await addJobNote(job.id, d.comment, "comment", "field_form");

      if (linked) {
        // Keep the Lead and the trip in sync: FILL EMPTY Lead fields only (service
        // location / pin / alt number / email) — never overwrite what Sales entered.
        if (allow(can, CAP.lead.edit)) {
          const gaps = leadGapPatch(linked, { loc, altPhone: d.altPhone, email: d.email });
          if (Object.keys(gaps).length > 0) await updateLead(linked.id, gaps);
        }
        // Link back to the Lead WITHOUT touching its status / temperature / owner.
        if (!linked.linkedFieldJobId) {
          await updateLead(linked.id, { customerId, linkedFieldJobId: job.id });
          await recordConversionEvent(linked.id, "field_job_created", { targetType: "field_job", targetId: job.id, targetLabel: job.jobNo });
        }
        if (!linked.fulfilmentRoute) await routeLead(linked.id, d.type === "onsite" || d.type === "warranty_onsite" ? "ON_SITE" : "PICKUP_DROP");
      }
      toast.success("Field assignment created", { description: `${job.jobNo}${linked ? ` · ${linked.leadNo}` : ""}${devs.length > 1 ? ` · ${devs.length} devices` : ""}` });
      onCreated?.(job);
      onClose();
    } finally {
      submitting.current = false; setSaving(false);
    }
  }

  const tag = (k: string) => fromLead.has(k) ? <span className="ml-1 rounded bg-sky-50 px-1 text-[9px] font-bold uppercase text-sky-700 ring-1 ring-inset ring-sky-200">from lead</span> : null;
  const engineerName = engineers.find((m) => m.id === d.engineerId)?.name;
  // What the user must still supply after linking (the Lead does not carry these).
  const stillNeeded = [
    errors.date && "Date", errors.storeId && "Store", errors.name && "Customer name", errors.phone && "Mobile",
    (locErrors.address) && "Address", (locErrors.pincode) && "PIN code", errors.device && "Device", errors.issue && "Issue",
  ].filter(Boolean) as string[];
  const hasPin = loc.lat != null && loc.lng != null;
  const filledDevices = d.devices.filter(tripDeviceHasData);

  return (
    <RoxCenteredForm
      open onClose={onClose} title="NEW FIELD ASSIGNMENT" subtitle="Pickup & Drop · On-Site — three quick steps." icon={Truck}
      width="max-w-2xl" canEdit={canCreate} readOnlyNote="You don't have permission to create field assignments."
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          <div>
            {reviewOpen
              ? <Button variant="ghost" size="sm" className="gap-1" onClick={() => setReviewOpen(false)}><ChevronLeft className="h-4 w-4" /> Back to form</Button>
              : step > 1 && <Button variant="ghost" size="sm" className="gap-1" onClick={() => go(step - 1)}><ChevronLeft className="h-4 w-4" /> Previous</Button>}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
            {!reviewOpen && step < 3
              ? <Button size="sm" className="gap-1" onClick={() => go(step + 1)}>Next <ChevronRight className="h-4 w-4" /></Button>
              : <Button size="sm" className="gap-1.5" loading={saving} disabled={saving || !canCreate} onClick={save}><Check className="h-4 w-4" /> Save Assignment</Button>}
          </div>
        </div>
      }
    >
      {/* Stepper — steps hug their content and the connectors take ALL the space
          between them, so the last step ends flush right (no gap) and the gaps
          between steps are equal. */}
      <div className="-mt-1 mb-4 flex items-center border-b border-border pb-3">
        {STEPS.map((s, i) => {
          const done = !reviewOpen && step > s.id, active = !reviewOpen && step === s.id;
          return (
            <Fragment key={s.id}>
              <button type="button" onClick={() => go(s.id)} className="flex shrink-0 items-center gap-2 text-left" title={s.label}>
                <span className={cn("grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-bold", done ? "bg-emerald-500 text-white" : active ? "bg-[#4361EE] text-white" : "bg-muted text-muted-foreground")}>
                  {done ? <Check className="h-3.5 w-3.5" /> : s.id}
                </span>
                <span className={cn("hidden whitespace-nowrap text-[12px] font-semibold md:block", active ? "text-foreground" : "text-muted-foreground")}>{s.label}</span>
              </button>
              {i < STEPS.length - 1 && <span aria-hidden className={cn("mx-3 h-px min-w-4 flex-1 transition-colors", done ? "bg-emerald-300" : "bg-border")} />}
            </Fragment>
          );
        })}
      </div>

      {/* ── STEP 1 ── */}
      {!reviewOpen && step === 1 && (
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-muted/20 p-3.5">
            <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"><Link2 className="h-3.5 w-3.5" /> Link existing Lead (optional)</p>
            {linked ? (
              <div className="flex items-start justify-between gap-3 rounded-lg bg-emerald-50 p-3 ring-1 ring-inset ring-emerald-200">
                <div className="min-w-0 text-[12.5px] text-emerald-900">
                  <p className="flex items-center gap-1.5 font-semibold"><CheckCircle2 className="h-4 w-4" /> Linked Lead: {linked.leadNo}</p>
                  <p>Customer: {linked.name || "—"}</p>
                  <p className="truncate">Device{getLeadDevices(linked).length > 1 ? `s (${getLeadDevices(linked).length})` : ""}: {getLeadDevices(linked).map((x) => x.label).filter(Boolean).join(", ") || linked.device || "—"}</p>
                  {prefillNote && <p className="mt-1.5 text-[11.5px] text-emerald-800/90"><strong>Filled from the Lead:</strong> {prefillNote}</p>}
                  {stillNeeded.length > 0
                    ? <p className="text-[11.5px] font-medium text-amber-700">Still needed: {stillNeeded.join(" · ")}</p>
                    : <p className="text-[11.5px] font-medium text-emerald-800">All required details are filled.</p>}
                  {existingOpenTrip && <p className="mt-1 font-semibold text-amber-700">An open trip ({existingOpenTrip.jobNo}) already exists for this Lead — saving will reuse it.</p>}
                </div>
                <button type="button" onClick={unlink} aria-label="Unlink lead" className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-emerald-800 hover:bg-emerald-100"><X className="h-4 w-4" /></button>
              </div>
            ) : (
              <div className="relative">
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <input className={cn(inputCls(!!leadError), "pl-9")} value={leadQuery} placeholder="Lead no. (031), mobile, email, name or device…"
                      onChange={(e) => { setLeadQuery(e.target.value); setLeadError(""); setLeadOpen(true); }}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submitLeadId(); } }} onFocus={() => setLeadOpen(true)} />
                  </div>
                  <Button variant="outline" size="sm" onClick={submitLeadId}>Find</Button>
                </div>
                {leadError && <p className="mt-1.5 flex items-center gap-1 text-[11px] font-medium text-rose-600"><AlertCircle className="h-3 w-3" /> {leadError}</p>}
                {leadOpen && matches.length > 0 && !leadError && (
                  <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-border bg-card shadow-xl">
                    {matches.map((l) => (
                      <li key={l.id}>
                        <button type="button" onClick={() => pickLead(l)} className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-[12.5px] hover:bg-muted">
                          <span className="w-[72px] shrink-0 font-bold tnum text-[#4361EE]">{l.leadNo}</span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium text-zinc-800">{l.name || "Unnamed"}{l.number ? <span className="font-normal text-zinc-500"> · {l.number}</span> : null}</span>
                            <span className="block truncate text-[11px] text-zinc-500">{[l.device, l.email, l.status].filter(Boolean).join(" · ") || "—"}</span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Trip ID" hint="Generated by the server when you save. It is unique and never reused.">
              <div className={cn(inputCls(), "flex items-center gap-1.5 bg-muted/40 text-muted-foreground")}><Lock className="h-3 w-3" /> Auto-generated</div>
            </Field>
            <Field label="Assign By">
              <div className={cn(inputCls(), "flex items-center bg-muted/40 text-foreground")}>{(role as { name?: string } | null)?.name ? `${(role as { name?: string }).name} – ` : ""}{meName || currentUser?.name || "You"}</div>
            </Field>
            <Field label="Date" required error={touched ? errors.date : undefined} hint="The scheduled trip date — separate from when the record was created.">
              <input type="date" className={inputCls(touched && !!errors.date)} value={d.date} onChange={(e) => set({ date: e.target.value })} />
            </Field>
            <Field label="Preferred Time" hint="Exact slot, plus the customer's preferred window if different.">
              <div className="flex gap-2">
                <div className="w-[130px] shrink-0"><TimePicker className="h-[38px]" value={d.time} onChange={(v) => set({ time: v })} /></div>
                <input className={inputCls()} value={d.window} onChange={(e) => set({ window: e.target.value })} placeholder="e.g. 11 AM – 1 PM" />
              </div>
            </Field>
            <Field label={<>Type of Trip{tag("type")}</>} required>
              <RSelect className="h-[38px]" value={d.type} onChange={(v) => set({ type: v as FieldLeadType })} options={FIELD_LEAD_TYPES.map((t) => ({ label: t.label, value: t.value }))} />
            </Field>
            <Field label={<>Source{tag("source")}</>}>
              <div className={cn(linked && "pointer-events-none opacity-60")}>
                <RSelect className="h-[38px]" value={d.source} onChange={(v) => set({ source: v })}
                  options={[{ label: "Select source", value: "" }, ...sourceOptions.map((s) => ({ label: s, value: s })), ...(d.source && !sourceOptions.includes(d.source) ? [{ label: d.source, value: d.source }] : [])]} />
              </div>
            </Field>
            <Field label="Store" required error={touched ? errors.storeId : undefined} hint="The OPERATIONAL store handling this trip. The Lead's own store is never overwritten.">
              <RSelect className="h-[38px]" value={d.storeId} onChange={(v) => set({ storeId: v, engineerId: "" })} options={stores.map((s) => ({ label: s.name, value: s.id }))} placeholder="Select store" />
            </Field>
            <Field label="Ninja" hint="Optional now — can be assigned later. Workload = open trips.">
              <div className={cn(!canAssign && "pointer-events-none opacity-60")}>
                <RSelect className="h-[38px]" value={d.engineerId} onChange={(v) => set({ engineerId: v })} searchable
                  options={[{ label: canAssign ? "Assign later" : "No permission to assign", value: "" }, ...engineers.map((m) => ({ label: `${m.name} · ${activeJobCountFor(m.id, jobs)} open`, value: m.id }))]} />
              </div>
            </Field>
          </div>
        </div>
      )}

      {/* ── STEP 2 ── */}
      {!reviewOpen && step === 2 && (
        <div className="space-y-4">
          <Field label="Find existing customer">
            <CustomerPicker className="[&>div:first-of-type]:min-h-[38px] [&>div:first-of-type]:rounded-xl [&>div:first-of-type]:py-1.5" customers={customers} value={d.customerId} placeholder="Search name / phone / email…"
              onChange={() => {}} onCustomerSelected={(c) => { setD((p) => ({ ...p, customerId: c.id, name: c.fullName, phone: c.mobile, altPhone: c.altMobile ?? "", email: c.email })); if (!loc.address.trim()) setLoc((l) => ({ ...l, address: [c.address, c.city].filter(Boolean).join(", "), pincode: c.postalCode || l.pincode })); }} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={<>Customer Name{tag("name")}</>} required error={touched ? errors.name : undefined}><input className={inputCls(touched && !!errors.name)} value={d.name} onChange={(e) => set({ name: e.target.value })} placeholder="Full name" /></Field>
            <Field label={<>Mobile Number{tag("phone")}</>} required error={touched ? errors.phone : undefined}><input className={inputCls(touched && !!errors.phone)} inputMode="tel" value={d.phone} onChange={(e) => set({ phone: e.target.value })} placeholder="98765 43210" /></Field>
            <Field label="Alternate Number"><input className={inputCls()} inputMode="tel" value={d.altPhone} onChange={(e) => set({ altPhone: e.target.value })} /></Field>
            <Field label={<>Email{tag("email")}</>} error={touched ? errors.email : undefined}><input className={inputCls(touched && !!errors.email)} value={d.email} onChange={(e) => set({ email: e.target.value })} placeholder="name@email.com" /></Field>
          </div>
          <p className="text-[11px] text-muted-foreground">Trip-only changes: the Customer Master and the Lead are not modified by edits here.</p>
          <ServiceLocationFields value={loc} onChange={setLoc} errors={locErrors} touched={touched}
            addressLabel={d.type === "onsite" || d.type === "warranty_onsite" ? "Service location" : "Pickup from (customer location)"} />
        </div>
      )}

      {/* ── STEP 3 · devices (multi-device) ── */}
      {!reviewOpen && step === 3 && (
        <div className="space-y-4">
          {/* Review pill — a view-only summary toggle, never a flow step. */}
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Device Information{d.devices.length > 1 ? ` · ${d.devices.length} devices` : ""}</p>
            <button type="button" onClick={() => setReviewOpen(true)} title="Review all details before saving"
              className="flex shrink-0 items-center gap-1.5 rounded-full bg-[#EEF1FD] px-3 py-1.5 text-[12px] font-semibold text-[#4361EE] ring-1 ring-inset ring-[#B3BFF6]/60 transition hover:bg-[#E2E8FF]">
              <ClipboardList className="h-3.5 w-3.5" /> Review
            </button>
          </div>

          {/* One card per device. A single card shows by default; "Add another
              device" repeats the exact same fields. */}
          <div className="space-y-3">
            {d.devices.map((dev, i) => (
              <DeviceCard
                key={dev.id}
                index={i} total={d.devices.length} device={dev}
                expanded={d.devices.length === 1 || expandedId === dev.id}
                fromLead={leadDeviceIds.has(dev.id)}
                errors={deviceErrors[dev.id]} touched={touched}
                onToggle={() => setExpandedId((cur) => (cur === dev.id ? "" : dev.id))}
                onChange={(patch) => updateDevice(i, patch)}
                onRemove={() => removeDevice(i)}
              />
            ))}
          </div>
          <div className="flex items-center justify-between gap-3">
            <button type="button" onClick={addDevice}
              className="flex items-center gap-1.5 rounded-xl border border-dashed border-[#4361EE]/40 bg-[#EEF1FD]/40 px-3 py-2 text-[12.5px] font-semibold text-[#4361EE] transition hover:bg-[#EEF1FD]">
              <Plus className="h-4 w-4" /> Add another device
            </button>
            {d.devices.length > 1 && <span className="text-[12px] text-muted-foreground">{d.devices.length} devices on this trip</span>}
          </div>

          <Field label={<>Comment{tag("comment")}</>}><textarea rows={3} className={cn(inputCls(), "h-auto py-2")} value={d.comment} onChange={(e) => set({ comment: e.target.value })} placeholder="Notes for the Ninja / store" /></Field>
        </div>
      )}

      {/* ── REVIEW (view-only) ── reflects the form state; no inputs. */}
      {reviewOpen && (
        <div className="space-y-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Review</p>
          {!valid && (
            <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[12px] text-amber-800">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Some required fields need attention: {[...Object.values(errors), ...Object.values(locErrors)].filter(Boolean).join(" ")}{" "}
                <button type="button" className="font-semibold underline" onClick={() => { setTouched(true); go(stepOf()); }}>Fix</button>
              </span>
            </div>
          )}
          <ReviewGroup title="Initial Information" onEdit={() => go(1)} rows={[
            ["Linked Lead", linked ? `${linked.leadNo} · ${linked.name || "Unnamed"}` : "None"],
            ["Type of Trip", FIELD_LEAD_TYPES.find((t) => t.value === d.type)?.label],
            ["Date", d.date], ["Preferred Time", [d.time, d.window].filter(Boolean).join(" · ")],
            ["Source", d.source], ["Store", storeName],
            ["Ninja", engineerName || "Assign later"],
            ["Assign By", meName || currentUser?.name],
          ]} />
          <ReviewGroup title="Contact Information" onEdit={() => go(2)} rows={[
            ["Customer", d.name], ["Mobile", d.phone], ["Alternate Number", d.altPhone], ["Email", d.email],
            ["Address", [loc.address, loc.pincode].filter(Boolean).join(" – ")], ["Landmark", loc.landmark],
            ["Map", hasPin ? `Pinned (${loc.lat!.toFixed(5)}, ${loc.lng!.toFixed(5)})` : loc.mapsUrl ? "Link saved (no coordinates)" : ""],
            ["Instructions", loc.instructions],
            ["Customer Master", d.customerId ? "Linked" : "New / unlinked"],
          ]} />
          {(filledDevices.length > 0 ? filledDevices : d.devices).map((dev, i, arr) => (
            <ReviewGroup key={dev.id} title={arr.length > 1 ? `Device ${i + 1} of ${arr.length}` : "Device Information"}
              onEdit={() => { setExpandedId(dev.id); go(3); }} rows={[
                ["Device", dev.label], ["Issue", dev.issue], ["IMEI / Serial", dev.imei],
                ["Accessories", dev.accessories], ["Condition", dev.condition],
              ]} />
          ))}
          {d.comment.trim() && (
            <div className="rounded-xl border border-border bg-card p-3.5">
              <div className="mb-1 flex items-center justify-between">
                <h4 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Comment</h4>
                <button type="button" onClick={() => go(3)} className="text-[11px] font-medium text-[#4361EE] hover:underline">Edit</button>
              </div>
              <p className="whitespace-pre-line text-[13px] text-foreground">{d.comment}</p>
            </div>
          )}
        </div>
      )}
    </RoxCenteredForm>
  );
}
