"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — View Assignment (Field trip) — a dedicated FULL PAGE.

   Built to the same blueprint as View Lead / View Ticket (view-detail-pages):
   DetailHero → SummaryCard row → grid lg:grid-cols-3 with accented
   DetailSections (left) and the page-driven <PinnedRail> (right: Quick Actions →
   Timeline → Notes). Never a side drawer. Every action the old drawer had lives
   here (assign / reassign Ninja, confirm pickup / delivery, receive, ticket,
   cancel, edit location, notes) — gated by the same permissions, using the
   EXISTING status engine (guarded transitions; no new states).
   ────────────────────────────────────────────────────────────────────────── */

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  Truck, User, Phone, Mail, MapPin, Package, Wrench, CalendarClock, Ticket as TicketIcon, UserCheck, PackageCheck,
  Send, XCircle, ShieldCheck, FileText, GitBranch, Receipt, History, MessageSquareText, ExternalLink, Lock, Check,
  Building2, Link2, IndianRupee, Pencil, Smartphone, ShieldAlert,
} from "lucide-react";
import { BackPill } from "@/components/common/back-pill";
import { Can } from "@/components/common/can";
import { PinnedRail } from "@/components/common/pinned-rail";
import { Reveal } from "@/components/common/reveal";
import { FieldTripsPanel } from "@/components/field/field-trips-panel";
import { useJobTrips } from "@/hooks/use-job-trips";
import { STATUS_META as TRIP_STATUS, TYPE_LABEL as TRIP_TYPE } from "@/lib/ninja/model";
import { DetailHero, DetailSection, DetailField, SummaryCard, SectionEditButton } from "@/components/common/detail-page";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { TimePicker } from "@/components/ui/time-picker";
import { RoxCenteredForm } from "@/components/ui/rox-centered-form";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { StaffPicker } from "@/components/field/ninja-picker";
import { ServiceLocationFields } from "@/components/field/service-location-fields";
import { cn } from "@/lib/utils";
import { usePermissions } from "@/lib/permissions-context";
import { useSession } from "@/lib/use-session";
import { CAP, allow } from "@/lib/capabilities";
import { useField } from "@/lib/field-context";
import { useStore } from "@/lib/store";
import { useStoreContext } from "@/lib/store-context";
import { useActivityLog, formatWhen } from "@/lib/activity-log";
import {
  FIELD_STATUS_LABEL, FIELD_STATUS_TONE, FIELD_LEAD_TYPE_LABEL, FIELD_LEAD_TYPE_TONE, FIELD_SOURCE_LABEL, FIELD_EVENT_LABEL,
  classifySource, normaliseLeadType, isPickupLeg, isDropLeg, isDelayed, describeFieldEvent, type FieldProof,
} from "@/lib/field-data";
import { resolveFieldRow, formatInvoiceAmount } from "@/lib/field-resolve";
import { fieldTripAction, tripValue, TRIP_ACTION_TONE_CLASS } from "@/lib/field-table";
import { tripDevicesOf } from "@/lib/field-devices";
import { mapsOpenUrl } from "@/lib/maps-url";
import { locationFromJob, locationToJobFields, validateLocation, hasLocationErrors, type ServiceLocation } from "@/lib/field-location";

type Dlg = "none" | "assign_ninja" | "assign_drop" | "pickup_proof" | "drop_proof" | "location" | "cancel";

const fmtDay = (d?: string) => {
  if (!d) return "";
  const x = new Date(d.length <= 10 ? `${d}T00:00:00` : d);
  return Number.isNaN(x.getTime()) ? d : x.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
};
const fmtStamp = (iso?: string) => {
  if (!iso) return "";
  const x = new Date(iso);
  return Number.isNaN(x.getTime()) ? "" : x.toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
};

export default function ViewFieldAssignmentPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = decodeURIComponent(String(params?.id ?? ""));
  const { executing: ninjaTrip } = useJobTrips(id);
  const { can, role } = usePermissions();
  const { id: meId, name: meName } = useSession();
  const {
    jobs, hydrated, jobsForLead, assignNinja, assignDropNinja, transition, confirmPickup, receiveAtStore,
    markReadyForDrop, confirmDelivery, cancelJob, updateJob, addJobNote, eventsForJob,
  } = useField();
  const { tickets, invoices, customers } = useStore();
  const { stores } = useStoreContext();
  const activity = useActivityLog();

  const job = useMemo(() => jobs.find((j) => j.id === id), [jobs, id]);
  const resolved = useMemo(() => (job ? resolveFieldRow(job, { tickets, invoices, customers }) : null), [job, tickets, invoices, customers]);
  const events = useMemo(() => (job ? eventsForJob(job.id) : []), [job, eventsForJob]);
  const fallbackTimeline = useMemo(() => (job ? activity.filter((e) => e.module === "Field" && e.reference === job.jobNo) : []), [activity, job]);

  const [dlg, setDlg] = useState<Dlg>("none");
  const [schedDate, setSchedDate] = useState("");
  const [schedTime, setSchedTime] = useState("");
  const [pickId, setPickId] = useState("");
  const [pickName, setPickName] = useState("");
  const [condition, setCondition] = useState("");
  const [proofNotes, setProofNotes] = useState("");
  const [editLoc, setEditLoc] = useState<ServiceLocation | null>(null);
  const [locTouched, setLocTouched] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [noteBusy, setNoteBusy] = useState(false);
  const [busy, setBusy] = useState(false);

  const canViewLoc = allow(can, CAP.field.viewLocation);
  const canEditLoc = allow(can, CAP.field.editLocation);
  const canViewTicket = allow(can, CAP.ticket.view);
  const canViewInvoice = allow(can, CAP.invoice.view);
  const canViewCustomer = allow(can, CAP.customer.view);
  const canView = allow(can, CAP.field.view);

  /* ── guards ── */
  if (!canView) return <Notice back title="No access" text="You don't have permission to view Pickup & Drop trips." />;
  if (!hydrated) return <Notice back title="Loading trip…" text="" />;
  const isNinja = role?.id === "ninja";
  if (!job || !resolved || (isNinja && meId && job.ninjaId !== meId && job.dropNinjaId !== meId))
    return <Notice back title="Trip not found" text="It may have been removed, or it isn't assigned to you." />;

  const j = job; // narrowed
  const r = resolved;
  const lt = normaliseLeadType(j.leadType);
  const onSite = lt === "onsite" || lt === "warranty_onsite";
  const action = fieldTripAction(j);
  const value = tripValue(r);
  const delayed = isDelayed(j);
  const closed = j.status === "cancelled" || j.status === "completed";
  const store = stores.find((s) => s.id === j.branchId) ?? stores.find((s) => s.name === j.branch);
  const leadStore = j.leadBranchId ? stores.find((s) => s.id === j.leadBranchId) : undefined;
  const devices = tripDevicesOf(j);
  const siblings = j.leadId ? jobsForLead(j.leadId).filter((x) => x.id !== j.id) : [];
  const mapsHref = mapsOpenUrl({ mapsUrl: j.locationMapsUrl, lat: j.locationLat, lng: j.locationLng, address: j.pickupAddress, pincode: j.pincode });
  const assignmentHistory = events.filter((e) => e.kind === "ninja_assigned" || e.kind === "ninja_reassigned" || e.kind === "drop_ninja_assigned");
  const noteEvents = [...events].filter((e) => e.kind === "communication" || e.kind === "comment").reverse();
  const showDrop = isDropLeg(j.status) || j.status === "in_repair" || j.status === "completed" || !!j.dropAddress || !!j.dropProof;
  const customerHref = j.customerId && canViewCustomer ? `/customers/${j.customerId}` : "";

  /* ── dialog helpers ── */
  const closeDlg = () => {
    setDlg("none"); setSchedDate(""); setSchedTime(""); setPickId(""); setPickName(""); setCondition(""); setProofNotes("");
    setEditLoc(null); setLocTouched(false); setBusy(false);
  };
  const makeProof = (): FieldProof => ({ at: new Date().toISOString(), byId: meId, byName: meName, condition, notes: proofNotes });
  const doAssign = async (leg: "pickup" | "drop") => {
    if (!pickId) return;
    setBusy(true);
    try {
      if (leg === "pickup") await assignNinja(j.id, pickId, pickName, schedDate || undefined, schedTime || undefined);
      else await assignDropNinja(j.id, pickId, pickName, schedDate || undefined, schedTime || undefined);
      closeDlg();
    } finally { setBusy(false); }
  };
  const doProof = async () => {
    setBusy(true);
    try {
      if (dlg === "pickup_proof") await confirmPickup(j.id, makeProof()); else await confirmDelivery(j.id, makeProof());
      closeDlg();
    } finally { setBusy(false); }
  };
  const saveLocation = async () => {
    if (!editLoc) return;
    setLocTouched(true);
    if (hasLocationErrors(validateLocation(editLoc, { pinOptional: true }))) return;
    setBusy(true);
    try { await updateJob(j.id, locationToJobFields(editLoc)); closeDlg(); } finally { setBusy(false); }
  };

  /* ── the single primary action for the current status (same rules as before) ── */
  const ticketBtn = (
    <Can permission={["manage_field_jobs", "manage_repair_jobs"]}>
      <Button className="w-full gap-1.5" onClick={() => router.push(`/tickets/new?fromFieldJob=${j.id}&from=field`)}>
        <TicketIcon className="h-4 w-4" /> {j.linkedTicketId ? "Open Ticket" : "Create repair Ticket"}
      </Button>
    </Can>
  );
  function stageAction() {
    const s = j.status;
    if (closed) return null;
    // A Ninja is executing this job in the Ninja app: the trip state machine (DB) owns
    // pickup / drop / on-site steps, so the legacy step buttons are not offered here.
    if (ninjaTrip && ["assigned", "pickup_scheduled", "out_for_pickup", "picked_up", "drop_scheduled", "out_for_drop", "ready_for_drop"].concat(onSite ? ["in_repair"] : []).includes(s))
      return (
        <div className="space-y-2 rounded-xl border border-[#4361EE]/25 bg-[#EEF1FD]/50 p-3.5 text-[12.5px]">
          <p className="font-semibold text-[#3450D8]">{TRIP_TYPE[ninjaTrip.trip_type]} {ninjaTrip.trip_no} · {TRIP_STATUS[ninjaTrip.status].label}</p>
          <p className="text-muted-foreground">The Ninja updates this trip from the Ninja app. Store handovers and reassignment are on the Dispatch Board.</p>
          <Button variant="outline" className="w-full gap-1.5" onClick={() => router.push("/field/dispatch")}><Send className="h-4 w-4" /> Open Dispatch Board</Button>
          {s === "picked_up" || ninjaTrip.status === "store_received" ? ticketBtn : null}
        </div>
      );
    if (s === "pending_assignment")
      return <Can permission="assign_ninja"><Button className="w-full gap-1.5" onClick={() => setDlg("assign_ninja")}><UserCheck className="h-4 w-4" /> {onSite ? "Assign Ninja for on-site visit" : "Assign Ninja for pickup"}</Button></Can>;
    if (s === "assigned" || s === "pickup_scheduled")
      return <Can permission="update_pickup"><Button className="w-full gap-1.5" onClick={() => transition(j.id, "out_for_pickup")}><Send className="h-4 w-4" /> {onSite ? "Start on-site visit" : "Start pickup"}</Button></Can>;
    if (onSite) {
      if (s === "out_for_pickup")
        return (<div className="space-y-2">{ticketBtn}
          <Can permission="update_pickup"><Button variant="outline" className="w-full gap-1.5" onClick={() => transition(j.id, "in_repair")}><Wrench className="h-4 w-4" /> Mark repair started (on site)</Button></Can></div>);
      if (s === "in_repair")
        return (<div className="space-y-2">{!j.linkedTicketId && ticketBtn}
          <Can permission="update_drop"><Button className="w-full gap-1.5" onClick={() => setDlg("drop_proof")}><ShieldCheck className="h-4 w-4" /> Complete on-site job</Button></Can></div>);
    }
    if (s === "out_for_pickup")
      return <Can permission="update_pickup"><Button className="w-full gap-1.5" onClick={() => setDlg("pickup_proof")}><PackageCheck className="h-4 w-4" /> Confirm pickup</Button></Can>;
    if (s === "picked_up")
      return <Can permission="receive_store_handoff"><Button className="w-full gap-1.5" onClick={() => receiveAtStore(j.id)}><Package className="h-4 w-4" /> Receive device at store</Button></Can>;
    if (s === "at_store") return <div className="space-y-2">{ticketBtn}</div>;
    if (s === "in_repair")
      return (<div className="space-y-2">{!j.linkedTicketId && ticketBtn}
        <Can permission="manage_field_jobs"><Button className="w-full gap-1.5" onClick={() => markReadyForDrop(j.id)}><Wrench className="h-4 w-4" /> Mark repair complete · Ready for drop</Button></Can></div>);
    if (s === "ready_for_drop")
      return <Can permission="assign_ninja"><Button className="w-full gap-1.5" onClick={() => setDlg("assign_drop")}><UserCheck className="h-4 w-4" /> Assign Ninja for drop</Button></Can>;
    if (s === "drop_scheduled")
      return <Can permission="update_drop"><Button className="w-full gap-1.5" onClick={() => transition(j.id, "out_for_drop")}><Send className="h-4 w-4" /> Start drop</Button></Can>;
    if (s === "out_for_drop")
      return <Can permission="update_drop"><Button className="w-full gap-1.5" onClick={() => setDlg("drop_proof")}><ShieldCheck className="h-4 w-4" /> Confirm delivery</Button></Can>;
    return null;
  }
  const stage = stageAction();

  const Pill = ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset", className)}>{children}</span>
  );
  const Chip = ({ href, icon: I, children, muted }: { href?: string; icon: React.ComponentType<{ className?: string }>; children: React.ReactNode; muted?: boolean }) => {
    const cls = "inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-[12px] font-medium transition";
    return href && !muted
      ? <Link href={href} className={cn(cls, "text-[#4361EE] hover:border-[#4361EE]/40 hover:bg-muted")}><I className="h-3.5 w-3.5" /> {children}</Link>
      : <span className={cn(cls, "text-zinc-400")}><I className="h-3.5 w-3.5" /> {children}</span>;
  };

  return (
    <div className="space-y-6">
      <div><BackPill href="/field" label="Back to Pickup & Drop" /></div>

      {/* HERO */}
      <DetailHero>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <span className="relative shrink-0">
              <span aria-hidden className="absolute -inset-1 rounded-full bg-[#4361EE]/20 blur-md" />
              <span className="relative block rounded-full ring-2 ring-white"><Avatar name={r.customerName || j.customer || j.jobNo} size={56} /></span>
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-[#4361EE]">Trip {j.jobNo}{j.leadNo ? ` · from ${j.leadNo}` : ""}</p>
              <h1 className="font-display text-2xl font-bold tracking-tight">{r.customerName || j.customer || "Customer"}</h1>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted-foreground">
                {r.contact && <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" /> {r.contact}</span>}
                {r.email && <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" /> {r.email}</span>}
              </p>
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                <Pill className={FIELD_LEAD_TYPE_TONE[lt]}>{FIELD_LEAD_TYPE_LABEL[lt]}</Pill>
                <Pill className={FIELD_STATUS_TONE[j.status]}>{FIELD_STATUS_LABEL[j.status]}</Pill>
                <span title={`${action.label} — ${action.reason} (system-derived, read-only)`}>
                  <Pill className={cn("cursor-default select-none", TRIP_ACTION_TONE_CLASS[action.tone])}>{action.label}<Lock className="h-3 w-3 opacity-50" aria-hidden /></Pill>
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-[11px] font-semibold text-zinc-700"><UserCheck className="h-3 w-3 text-[#4361EE]" /> {j.ninjaName || "Unassigned"}</span>
                {store && <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-[11px] font-semibold text-zinc-700"><Building2 className="h-3 w-3 text-[#4361EE]" /> {store.name}</span>}
                {delayed && <Pill className="bg-rose-50 text-rose-700 ring-rose-200"><ShieldAlert className="h-3 w-3" /> Delayed</Pill>}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {(r.contact || j.phone) && <a href={`tel:${r.contact || j.phone}`}><Button size="sm" variant="outline" className="gap-1.5"><Phone className="h-3.5 w-3.5" /> Call</Button></a>}
            {j.leadId && <Link href={`/leads/${j.leadId}`}><Button size="sm" variant="outline" className="gap-1.5"><Link2 className="h-3.5 w-3.5" /> Open Lead</Button></Link>}
            {r.ticket && canViewTicket && <Link href={`/tickets/${r.ticket.id}`}><Button size="sm" className="gap-1.5"><TicketIcon className="h-3.5 w-3.5" /> Ticket {r.ticketNo}</Button></Link>}
          </div>
        </div>
        <div className="relative mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <SummaryCard label="Scheduled" value={j.pickupDate || j.dropDate ? `${fmtDay(j.pickupDate || j.dropDate)}${j.pickupTime || j.dropTime ? ` · ${j.pickupTime || j.dropTime}` : ""}` : "Not scheduled"} tone={delayed ? "text-rose-600" : undefined} />
          <SummaryCard label="Customer window" value={j.preferredWindow || "—"} />
          <SummaryCard label="Ninja" value={j.ninjaName || "Unassigned"} />
          <SummaryCard label="Devices" value={devices.length || 1} />
          <SummaryCard label="Ticket" value={r.ticketNo || "—"} />
          <SummaryCard label="Invoice value" value={value.finalized != null ? formatInvoiceAmount(value.finalized) : value.pendingAmount != null ? `${formatInvoiceAmount(value.pendingAmount)} · ${value.pendingLabel}` : "—"} tone={value.finalized != null ? "text-emerald-700" : undefined} />
        </div>
      </DetailHero>

      {/* MAIN GRID */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* LEFT */}
        <div className="space-y-6 lg:col-span-2">
          {(j.leadId || j.customerId || j.linkedTicketId || r.invoice || siblings.length > 0) && (
            <DetailSection icon={GitBranch} title="Linked Records" accent="blue">
              <div className="flex flex-wrap gap-2">
                {j.leadId && <Chip href={`/leads/${j.leadId}`} icon={Link2}>{j.leadNo || "Lead"}</Chip>}
                {j.customerId && <Chip href={customerHref} icon={User} muted={!customerHref}>{r.customerName || "Customer"}</Chip>}
                {r.ticket && <Chip href={`/tickets/${r.ticket.id}`} icon={TicketIcon} muted={!canViewTicket}>{r.ticketNo}</Chip>}
                {r.invoice && <Chip href={`/invoice/${r.invoice.id}`} icon={Receipt} muted={!canViewInvoice}>{r.invoiceId}</Chip>}
                {siblings.map((s) => <Chip key={s.id} href={`/field/${s.id}`} icon={Truck}>{s.jobNo} · {FIELD_STATUS_LABEL[s.status]}</Chip>)}
              </div>
            </DetailSection>
          )}

          <DetailSection icon={User} title="Customer & Contact" accent="green"
            action={customerHref ? <Link href={customerHref} className="inline-flex items-center gap-1 text-[11px] font-medium text-[#4361EE] hover:underline"><ExternalLink className="h-3 w-3" /> View Customer</Link> : undefined}>
            <div className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
              <DetailField label="Name" value={r.customerName || j.customer} highlight />
              <DetailField label="Mobile" value={r.contact || j.phone} />
              <DetailField label="Alternate number" value={j.altPhone} />
              <DetailField label="Email" value={r.email || j.email} />
            </div>
            <div className="mt-4 border-t border-border/70 pt-3">
              {j.customerId
                ? <p className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-[12px] font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200"><Check className="h-4 w-4" /> Linked to Customer Master</p>
                : <p className="text-[12px] text-muted-foreground">Not linked to the Customer Master.</p>}
            </div>
          </DetailSection>

          <DetailSection icon={Smartphone} accent="indigo" title={devices.length > 1 ? `Devices · ${devices.length}` : "Device & Issue"}>
            {devices.length === 0 ? <p className="text-[13px] text-muted-foreground">No device captured.</p> : (
              <div className="space-y-3">
                {devices.map((dv, i) => (
                  <div key={dv.id} className="rounded-xl border border-border bg-muted/20 p-4">
                    {devices.length > 1 && (
                      <div className="mb-3 flex items-center gap-2">
                        <span className="grid h-6 w-6 place-items-center rounded-md bg-indigo-100 text-[10px] font-bold text-indigo-700">{i + 1}</span>
                        <span className="text-sm font-semibold">{dv.label || `Device ${i + 1}`}</span>
                      </div>
                    )}
                    <div className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
                      {devices.length === 1 && <DetailField label="Device" value={r.model || dv.label} highlight />}
                      <DetailField label="Issue" value={dv.issue} />
                      <DetailField label="IMEI / Serial" value={dv.imei} />
                      <DetailField label="Accessories handed over" value={dv.accessories} />
                      <DetailField label="Condition at collection" value={dv.condition} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </DetailSection>

          <DetailSection icon={MapPin} accent="violet" title={onSite ? "Service Location" : "Pickup From"}
            action={canViewLoc && canEditLoc && !closed ? <SectionEditButton onClick={() => { setEditLoc(locationFromJob(j)); setLocTouched(false); setDlg("location"); }} /> : undefined}>
            {!canViewLoc ? (
              <p className="inline-flex items-center gap-1.5 text-[13px] text-zinc-400"><Lock className="h-4 w-4" /> Location is restricted for your role.</p>
            ) : (
              <>
                <div className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
                  <div className="sm:col-span-2"><DetailField label="Address" value={j.pickupAddress || "Address on file"} highlight /></div>
                  <DetailField label="PIN code" value={j.pincode} />
                  <DetailField label="Landmark" value={j.landmark} />
                  <div className="sm:col-span-2"><DetailField label="Access / pickup instructions" value={j.locationInstructions} /></div>
                  {j.locationLat != null && j.locationLng != null && <DetailField label="Coordinates" value={<span className="tabular-nums">{j.locationLat.toFixed(5)}, {j.locationLng.toFixed(5)}</span>} />}
                </div>
                {mapsHref && (
                  <a href={mapsHref} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-[12.5px] font-medium text-[#4361EE] hover:underline">
                    <ExternalLink className="h-3.5 w-3.5" /> Directions / open map
                  </a>
                )}
              </>
            )}
          </DetailSection>

          {showDrop && (
            <DetailSection icon={MapPin} accent="teal" title="Drop (return to customer)">
              <div className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
                <div className="sm:col-span-2"><DetailField label="Address" value={j.dropAddress || j.pickupAddress || "Same as pickup"} highlight /></div>
                <DetailField label="Scheduled" value={j.dropDate ? `${fmtDay(j.dropDate)}${j.dropTime ? ` · ${j.dropTime}` : ""}` : ""} />
                <DetailField label="Drop Ninja" value={j.dropNinjaName} />
              </div>
            </DetailSection>
          )}

          <DetailSection icon={UserCheck} accent="violet" title="Schedule & Assignment">
            <div className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
              <DetailField label="Type of trip" value={FIELD_LEAD_TYPE_LABEL[lt]} />
              <DetailField label="Source" value={j.source || FIELD_SOURCE_LABEL[classifySource(j.source)]} />
              <DetailField label="Scheduled" value={j.pickupDate ? `${fmtDay(j.pickupDate)}${j.pickupTime ? ` · ${j.pickupTime}` : ""}` : ""} />
              <DetailField label="Customer's preferred window" value={j.preferredWindow} />
              <DetailField label={onSite ? "Ninja (on-site)" : "Pickup Ninja"} value={j.ninjaName} />
              <DetailField label="Field Manager" value={j.fieldManagerName} />
              <DetailField label="Sales Agent (Lead owner)" value={j.salesPersonName} />
              <DetailField label="Assigned by" value={j.createdByName} />
              <DetailField label="Assigned at" value={fmtStamp(j.assignedAt)} />
              <DetailField label="Created" value={fmtStamp(j.createdAt)} />
              <DetailField label="Operational store" value={store?.name || j.branch} />
              <DetailField label="Lead store" value={leadStore?.name} />
            </div>
            {assignmentHistory.length > 0 && (
              <div className="mt-4 border-t border-border/70 pt-3">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Assignment history</p>
                <ul className="space-y-1.5">
                  {assignmentHistory.map((e) => (
                    <li key={e.id} className="flex flex-wrap items-baseline justify-between gap-2 text-[12.5px]">
                      <span><strong className="font-semibold">{FIELD_EVENT_LABEL[e.kind]}</strong> · {describeFieldEvent(e)}</span>
                      <span className="text-[11px] text-muted-foreground">{fmtStamp(e.occurredAt)}{e.actorName ? ` · ${e.actorName}` : ""}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </DetailSection>

          <FieldTripsPanel jobId={j.id} />
          {(j.pickupProof || j.dropProof) && (
            <DetailSection icon={ShieldCheck} accent="emerald" title="Handover Proof">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {j.pickupProof && (
                  <div className="rounded-xl border border-border bg-muted/20 p-3.5 text-[12.5px]">
                    <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Pickup</p>
                    <p>Collected{j.pickupProof.byName ? ` by ${j.pickupProof.byName}` : ""} · {fmtStamp(j.pickupProof.at)}</p>
                    {j.pickupProof.condition && <p className="text-zinc-600">Condition: {j.pickupProof.condition}</p>}
                    {j.pickupProof.notes && <p className="text-zinc-600">{j.pickupProof.notes}</p>}
                  </div>
                )}
                {j.dropProof && (
                  <div className="rounded-xl border border-border bg-muted/20 p-3.5 text-[12.5px]">
                    <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Delivery</p>
                    <p>Delivered{j.dropProof.byName ? ` by ${j.dropProof.byName}` : ""} · {fmtStamp(j.dropProof.at)}</p>
                    {j.dropProof.condition && <p className="text-zinc-600">Condition: {j.dropProof.condition}</p>}
                    {j.dropProof.notes && <p className="text-zinc-600">{j.dropProof.notes}</p>}
                  </div>
                )}
              </div>
            </DetailSection>
          )}
        </div>

        {/* RIGHT — page-driven pinned rail */}
        <PinnedRail>
          <Reveal delay={0.04}>
            <section className="rounded-2xl border border-border bg-card p-5 shadow-card">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Quick Actions</h3>
              <div className="space-y-2.5">
                {stage}
                {!stage && !closed && <p className="text-[12px] text-muted-foreground">No action needed at this stage.</p>}
                {closed && <p className="text-[12px] text-muted-foreground">This trip is {j.status === "cancelled" ? "cancelled" : "completed"}.</p>}
                {isPickupLeg(j.status) && j.status !== "pending_assignment" && !closed && (
                  <Can permission="assign_ninja"><Button variant="outline" className="w-full gap-1.5" onClick={() => setDlg("assign_ninja")}><UserCheck className="h-4 w-4" /> Reassign / reschedule pickup</Button></Can>
                )}
                {canViewLoc && canEditLoc && !closed && (
                  <Button variant="outline" className="w-full gap-1.5" onClick={() => { setEditLoc(locationFromJob(j)); setLocTouched(false); setDlg("location"); }}><Pencil className="h-4 w-4" /> Edit location</Button>
                )}
                {!closed && (
                  <Can permission="manage_field_jobs"><Button variant="outline" className="w-full gap-1.5 text-rose-600 hover:bg-rose-50" onClick={() => setDlg("cancel")}><XCircle className="h-4 w-4" /> Cancel trip</Button></Can>
                )}
              </div>
            </section>
          </Reveal>

          <Reveal delay={0.06}>
            <section className="rounded-2xl border border-border bg-card p-5 shadow-card">
              <h3 className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground"><History className="h-3.5 w-3.5" /> Timeline</h3>
              {events.length === 0 && fallbackTimeline.length === 0 ? (
                <p className="text-[12px] text-muted-foreground">No history recorded yet.</p>
              ) : (
                <ol className="relative space-y-3.5 border-l border-border pl-4">
                  {events.length > 0
                    ? [...events].reverse().map((e) => {
                        const note = e.kind === "communication" || e.kind === "comment";
                        return (
                          <li key={e.id} className="relative">
                            <span className={cn("absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full ring-2 ring-white", note ? "bg-sky-500" : "bg-teal-500")} />
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-[12.5px] font-medium text-zinc-800">{FIELD_EVENT_LABEL[e.kind]}</p>
                              <span className="shrink-0 text-[10px] text-zinc-400">{formatWhen(new Date(e.occurredAt).getTime())}</span>
                            </div>
                            {describeFieldEvent(e) && <p className={cn("whitespace-pre-line text-[11.5px]", note ? "text-zinc-700" : "text-zinc-500")}>{describeFieldEvent(e)}</p>}
                            {e.actorName && <p className="text-[10.5px] text-zinc-400">{e.actorName}</p>}
                          </li>
                        );
                      })
                    : fallbackTimeline.map((e) => (
                        <li key={e.id} className="relative">
                          <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-[#4361EE] ring-2 ring-white" />
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-[12.5px] font-medium text-zinc-800">{e.action}</p>
                            <span className="shrink-0 text-[10px] text-zinc-400">{formatWhen(e.ts)}</span>
                          </div>
                          {e.description && <p className="text-[11.5px] text-zinc-500">{e.description}</p>}
                        </li>
                      ))}
                </ol>
              )}
            </section>
          </Reveal>

          <Reveal delay={0.08}>
            <section className="rounded-2xl border border-border bg-card p-5 shadow-card">
              <h3 className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground"><MessageSquareText className="h-3.5 w-3.5" /> Notes</h3>
              {noteEvents.length === 0 && !j.notes?.trim() ? (
                <p className="mb-3 rounded-xl border border-dashed border-border px-3 py-3 text-[12px] text-muted-foreground">No notes yet. Notes are internal and append-only.</p>
              ) : (
                <ul className="mb-3 space-y-2">
                  {j.notes?.trim() && <li className="rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-2 text-[12.5px] whitespace-pre-line">{j.notes.trim()}</li>}
                  {noteEvents.slice(0, 6).map((e) => (
                    <li key={e.id} className={cn("rounded-xl border px-3 py-2", e.kind === "communication" ? "border-sky-200 bg-sky-50/70" : "border-amber-200 bg-amber-50/70")}>
                      <p className="whitespace-pre-line text-[12.5px] text-zinc-800">{e.note}</p>
                      <p className="mt-1 text-[10.5px] text-zinc-500">{e.kind === "communication" ? "Customer communication" : "Comment"}{e.actorName ? ` · ${e.actorName}` : ""} · {formatWhen(new Date(e.occurredAt).getTime())}</p>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex items-start gap-2">
                <textarea rows={2} value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="Add a note…"
                  className="min-h-[38px] flex-1 rounded-xl border border-input bg-card px-3 py-2 text-[13px] outline-none placeholder:text-muted-foreground focus:border-[#4361EE] focus:ring-2 focus:ring-[#4361EE]/15" />
                <Button size="sm" disabled={!noteText.trim() || noteBusy} loading={noteBusy} onClick={async () => {
                  setNoteBusy(true);
                  try { if (await addJobNote(j.id, noteText, "comment", "field_app")) setNoteText(""); } finally { setNoteBusy(false); }
                }}>Add</Button>
              </div>
            </section>
          </Reveal>
        </PinnedRail>
      </div>

      {/* ── Centred dialogs (full forms are centred, never drawers) ── */}
      <RoxCenteredForm open={dlg === "assign_ninja" || dlg === "assign_drop"} onClose={closeDlg} width="max-w-md" icon={UserCheck}
        title={dlg === "assign_drop" ? "Assign drop Ninja" : j.ninjaId ? "Reassign / reschedule pickup" : onSite ? "Assign Ninja for on-site visit" : "Assign Ninja for pickup"}
        subtitle={`${j.jobNo} · ${r.customerName || j.customer}`}
        footer={<div className="flex w-full justify-end gap-2"><Button variant="outline" onClick={closeDlg}>Cancel</Button>
          <Button className="gap-1.5" disabled={!pickId || busy} loading={busy} onClick={() => doAssign(dlg === "assign_drop" ? "drop" : "pickup")}><Check className="h-4 w-4" /> Assign &amp; notify</Button></div>}>
        <div className="space-y-4">
          <StaffPicker roleIds={["ninja"]} valueId={pickId} showLoad onPick={(sid, name) => { setPickId(sid); setPickName(name); }} placeholder="Search ninjas…" />
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="flex h-5 items-center text-[12px] font-medium text-zinc-700">Date</label>
              <input type="date" value={schedDate} onChange={(e) => setSchedDate(e.target.value)} className="h-[38px] w-full rounded-xl border border-input bg-card px-3 text-[13px] outline-none focus:border-[#4361EE] focus:ring-2 focus:ring-[#4361EE]/15" />
            </div>
            <div className="space-y-1.5"><label className="flex h-5 items-center text-[12px] font-medium text-zinc-700">Time</label><TimePicker className="h-[38px]" value={schedTime} onChange={setSchedTime} /></div>
          </div>
        </div>
      </RoxCenteredForm>

      <RoxCenteredForm open={dlg === "pickup_proof" || dlg === "drop_proof"} onClose={closeDlg} width="max-w-md" icon={PackageCheck}
        title={dlg === "pickup_proof" ? "Confirm pickup" : onSite ? "Complete on-site job" : "Confirm delivery"} subtitle={`${j.jobNo} · ${r.customerName || j.customer}`}
        footer={<div className="flex w-full justify-end gap-2"><Button variant="outline" onClick={closeDlg}>Cancel</Button>
          <Button className="gap-1.5" disabled={busy} loading={busy} onClick={doProof}><Check className="h-4 w-4" /> Confirm</Button></div>}>
        <div className="space-y-4">
          <div className="space-y-1.5"><label className="flex h-5 items-center text-[12px] font-medium text-zinc-700">Device condition</label>
            <input value={condition} onChange={(e) => setCondition(e.target.value)} placeholder="e.g. Screen cracked, powers on" className="h-[38px] w-full rounded-xl border border-input bg-card px-3 text-[13px] outline-none focus:border-[#4361EE] focus:ring-2 focus:ring-[#4361EE]/15" /></div>
          <div className="space-y-1.5"><label className="flex h-5 items-center text-[12px] font-medium text-zinc-700">Notes (optional)</label>
            <textarea value={proofNotes} onChange={(e) => setProofNotes(e.target.value)} rows={3} className="w-full rounded-xl border border-input bg-card px-3 py-2 text-[13px] outline-none focus:border-[#4361EE] focus:ring-2 focus:ring-[#4361EE]/15" /></div>
        </div>
      </RoxCenteredForm>

      <RoxCenteredForm open={dlg === "location" && !!editLoc} onClose={closeDlg} width="max-w-xl" icon={MapPin} title="Edit trip location" subtitle={`${j.jobNo} · updates this trip only`}
        footer={<div className="flex w-full justify-end gap-2"><Button variant="outline" onClick={closeDlg}>Cancel</Button>
          <Button disabled={busy} loading={busy} onClick={saveLocation}>Save location</Button></div>}>
        {editLoc && (
          <>
            <ServiceLocationFields value={editLoc} onChange={setEditLoc} errors={validateLocation(editLoc, { pinOptional: true })} touched={locTouched} pinOptional />
            <p className="mt-3 text-[11px] text-muted-foreground">The previous location is kept in the trip history. The Customer Master and the Lead are not changed.</p>
          </>
        )}
      </RoxCenteredForm>

      <ConfirmDialog open={dlg === "cancel"} onClose={closeDlg} danger confirmLabel="Cancel trip" cancelLabel="Keep trip"
        title={`Cancel ${j.jobNo}?`} description="The trip stays in history and the Ninja is notified. This can't be undone."
        onConfirm={() => { void cancelJob(j.id); closeDlg(); }} />
    </div>
  );
}

function Notice({ title, text, back }: { title: string; text: string; back?: boolean }) {
  return (
    <div className="space-y-5">
      {back && <div><BackPill href="/field" label="Back to Pickup & Drop" /></div>}
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-card p-12 text-center shadow-card">
        <p className="font-semibold">{title}</p>
        {text && <p className="max-w-md text-sm text-muted-foreground">{text}</p>}
      </div>
    </div>
  );
}
