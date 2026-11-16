"use client";
/* Quick ticket for the field. One screen, prefilled from the job (customer, phone, device, issue),
   the Ninja only confirms what they see in front of them. Goes through the SAME addTicket choke point
   as the website, so numbering, store stamping and audit are identical. The ticket is then attached to
   the trip + job through the ninja_link_trip_docs RPC (the only legal write path for trip documents). */
import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, FilePlus2, ShieldAlert, Ticket as TicketIcon } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { usePermissions } from "@/lib/permissions-context";
import { allow, CAP } from "@/lib/capabilities";
import { useStore } from "@/lib/store";
import { useStoreSettings } from "@/lib/store-settings";
import { useSession } from "@/lib/use-session";
import { createDeviceRecord, type Ticket, type TicketPriority, type TicketStatus } from "@/lib/mock-data";
import { resolveIdentifierType } from "@/lib/identifier-detection";
import { toast } from "@/components/ui/toaster";
import { useNinja } from "@/lib/ninja/ninja-context";
import { TYPE_LABEL } from "@/lib/ninja/model";
import { Btn, Card, ChipGroup, Empty, FormLabel, Skeleton, inputCls } from "@/components/ninja/ui";
import { JobPicker } from "@/components/ninja/job-picker";

function Form() {
  const params = useSearchParams();
  const router = useRouter();
  const tripId = params.get("trip");
  const { trips, loading, track, refresh } = useNinja();
  const { can } = usePermissions();
  const { addTicket, tickets } = useStore();
  const { settings } = useStoreSettings();
  const { name } = useSession();
  const trip = trips.find((t) => t.id === tripId);
  const job = trip?.job;

  const [device, setDevice] = useState(job?.device ?? "");
  const [issue, setIssue] = useState(job?.issue ?? "");
  const [imei, setImei] = useState(job?.imei ?? "");
  const [acc, setAcc] = useState(job?.accessories ?? "");
  const [priority, setPriority] = useState<TicketPriority>("normal");
  const [estimate, setEstimate] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ id: string; no: string } | null>(null);
  const [filled, setFilled] = useState(false);
  // The trip can arrive after first render (cold start): copy its details in once.
  if (trip && job && !filled) {
    setFilled(true);
    setDevice(job.device ?? ""); setIssue(job.issue ?? ""); setImei(job.imei ?? ""); setAcc(job.accessories ?? "");
  }

  if (!allow(can, CAP.ticket.create)) return <Empty icon={<ShieldAlert className="h-7 w-7" />} title="Ticket access is off" body="Ask your manager to enable ticket creation for your role." />;
  if (!tripId) return <JobPicker base="/ninja/new/ticket" title="New ticket" />;
  if (loading && !trip) return <Skeleton className="h-64" />;
  if (!trip) return <Empty icon={<ShieldAlert className="h-7 w-7" />} title="Job not found" body="This job isn't assigned to you." action={<Link href="/ninja/new/ticket"><Btn>Pick a job</Btn></Link>} />;

  const existing = trip.ticket_id ? tickets.find((t) => t.id === trip.ticket_id) : undefined;
  if (done || trip.ticket_id) {
    const no = done?.no ?? existing?.ticketNo ?? trip.ticket_id ?? "";
    return (
      <div className="space-y-4">
        <Card className="flex flex-col items-center px-6 py-8 text-center">
          <span className="grid h-16 w-16 place-items-center rounded-full bg-emerald-50 text-emerald-600"><CheckCircle2 className="h-9 w-9" /></span>
          <p className="mt-4 text-[20px] font-extrabold">{done ? "Ticket created" : "Ticket already raised"}</p>
          <p className="mt-1 text-[14px] font-semibold text-slate-500">{no} · {job?.customer}</p>
        </Card>
        <Link href={`/ninja/new/invoice?trip=${trip.id}`} className="block"><Btn className="w-full"><FilePlus2 className="h-5 w-5" />Create invoice</Btn></Link>
        <Link href={`/ninja/trip/${trip.id}`} className="block"><Btn tone="ghost" className="w-full">Back to job</Btn></Link>
      </div>
    );
  }

  const valid = device.trim().length > 1 && issue.trim().length > 1;
  async function submit() {
    if (!trip || !valid || busy) return;
    setBusy(true);
    try {
      const first = device.trim().split(/\s+/)[0] ?? "";
      const status = (settings.ticketDefaultStatus || "in_progress") as TicketStatus;
      const amount = Math.max(0, Number(estimate) || 0);
      const dev = createDeviceRecord({
        brand: first, model: device.trim(), imei: imei.trim(), imeiType: imei.trim() ? resolveIdentifierType(imei.trim()) : "imei",
        type: trip.trip_type === "onsite" ? "onsite" : "pickup", assignedBy: name || "", issue: issue.trim(), description: issue.trim(),
        priority, accessories: acc.trim(), notes: notes.trim(), estimate: amount, status,
      });
      const t: Ticket = {
        id: `T-${Date.now()}`, customer: job?.customer || "Customer", phone: job?.phone || "", email: undefined,
        address: [trip.dest_address, job?.pincode].filter(Boolean).join(", ") || undefined,
        device: first || "others", model: device.trim(), issue: issue.trim(), status, priority, technician: "Unassigned",
        createdAt: new Date().toISOString(), amount, service: issue.trim(), internalNotes: notes.trim() || undefined,
        imeiType: imei.trim() ? resolveIdentifierType(imei.trim()) : undefined, customerId: trip.customer_id || undefined,
        devices: [dev], linkedFieldJobId: trip.job_id, linkedLeadId: trip.lead_id || undefined, recordType: "ticket",
        items: imei.trim() ? [{ device: first, model: device.trim(), serial: imei.trim(), issue: issue.trim(), service: issue.trim() }] : undefined,
      };
      const newId = await addTicket(t);
      // addTicket keeps a local copy even when the DB rejected it, so confirm the row really exists.
      const check = supabase ? await supabase.from("tickets").select("id,ticket_no").eq("id", newId).maybeSingle() : { data: null };
      if (!check.data) { track({ kind: "doc_failed", tripId: trip.id, jobId: trip.job_id, payload: { doc: "ticket" } }); toast.error("Ticket was not saved. Check your connection and try again."); return; }
      const link = await supabase!.rpc("ninja_link_trip_docs", { p_trip: trip.id, p_ticket: newId, p_invoice: null });
      if (link.error) toast.error("Ticket saved, but it could not be attached to the job. Tell your manager.");
      track({ kind: "doc_ticket_created", tripId: trip.id, jobId: trip.job_id, screen: "new-ticket", payload: { ticket: newId, ticket_no: check.data.ticket_no, amount, priority, linked: !link.error } });
      setDone({ id: newId, no: (check.data.ticket_no as string) || newId });
      void refresh();
      try { navigator.vibrate?.(30); } catch { /* ignore */ }
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-[26px] font-extrabold leading-none tracking-tight">New ticket</h1>
        <p className="mt-1.5 text-[13px] font-medium text-slate-500">{TYPE_LABEL[trip.trip_type]} · {trip.trip_no}</p>
      </div>
      <Card className="flex items-center gap-3 p-3.5">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#EEF1FD] text-[#4361EE]"><TicketIcon className="h-5 w-5" /></span>
        <div className="min-w-0"><p className="truncate text-[16px] font-extrabold">{job?.customer || "Customer"}</p><p className="truncate text-[12.5px] font-medium text-slate-500">{job?.phone || "No phone"}{trip.job?.pincode ? ` · ${trip.job.pincode}` : ""}</p></div>
      </Card>

      <div className="space-y-4">
        <div><FormLabel>Device</FormLabel><input className={inputCls} value={device} onChange={(e) => setDevice(e.target.value)} placeholder="Brand and model" /></div>
        <div><FormLabel>What's wrong?</FormLabel><textarea className={`${inputCls} py-3`} rows={3} value={issue} onChange={(e) => setIssue(e.target.value)} placeholder="Describe the problem" /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><FormLabel>IMEI / Serial</FormLabel><input className={inputCls} value={imei} onChange={(e) => setImei(e.target.value)} placeholder="Optional" autoCapitalize="characters" /></div>
          <div><FormLabel>Estimate (₹)</FormLabel><input className={inputCls} inputMode="numeric" value={estimate} onChange={(e) => setEstimate(e.target.value.replace(/[^\d.]/g, ""))} placeholder="0" /></div>
        </div>
        <div><FormLabel>Accessories received</FormLabel><input className={inputCls} value={acc} onChange={(e) => setAcc(e.target.value)} placeholder="Charger, case, SIM tray…" /></div>
        <div><FormLabel>Priority</FormLabel>
          <ChipGroup<TicketPriority> value={priority} onChange={setPriority} options={[{ id: "normal", label: "Normal" }, { id: "high", label: "High" }, { id: "critical", label: "Critical" }]} /></div>
        <div><FormLabel>Notes</FormLabel><textarea className={`${inputCls} py-3`} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Visible damage, customer remarks…" /></div>
      </div>
      <Btn className="w-full" disabled={!valid} loading={busy} onClick={submit}>Create ticket</Btn>
      <button onClick={() => router.back()} className="block w-full py-2 text-center text-[13.5px] font-bold text-slate-500 active:text-slate-700">Cancel</button>
    </div>
  );
}

export default function NewTicketPage() { return <Suspense fallback={null}><Form /></Suspense>; }
