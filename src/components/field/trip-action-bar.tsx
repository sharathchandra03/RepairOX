"use client";
/* RepairOX — manager / store actions on ONE Ninja trip (field_trips).
   This is the single home of what used to live on the separate Dispatch Board:
   confirm store receipt, flag a handover mismatch, release a repaired device,
   re-plan an exception, reschedule and cancel. Rendered inside the Action of
   Trip live box (Pickup & Drop table) and on View Assignment. State changes are
   validated by the database (field_trip_transition_ok); this component only
   offers the steps the viewer is permitted to take. Assigning a Ninja stays in
   the shared AssignNinjaDialog. */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, CheckCircle2, PackageCheck, RotateCcw, Ticket as TicketIcon, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { RoxCenteredForm } from "@/components/ui/rox-centered-form";
import { DateTimeDialog } from "@/components/ui/date-time-picker";
import { toast } from "@/components/ui/toaster";
import { supabase } from "@/lib/supabase";
import { usePermissions } from "@/lib/permissions-context";
import { allow, CAP } from "@/lib/capabilities";
import { useField } from "@/lib/field-context";

import { tripActionsFor, type TripRef } from "@/components/field/trip-action-bar.logic";

export function TripActionBar({ trip, onChanged, className, showEmpty }: { trip: TripRef; onChanged?: () => void; className?: string; showEmpty?: boolean }) {
  const { can } = usePermissions();
  const router = useRouter();
  const { getJob } = useField();
  const [busy, setBusy] = useState(false);
  const [reasonFor, setReasonFor] = useState<null | "cancel" | "flag">(null);
  const [reason, setReason] = useState("");
  const [sched, setSched] = useState(false);
  const a = tripActionsFor(trip, { assign: allow(can, CAP.field.assignNinja), store: allow(can, CAP.field.storeHandoff) });
  if (!Object.values(a).some(Boolean)) {
    return showEmpty ? (
      <div className={className}>
        <p className="text-[12.5px] font-semibold text-foreground">Trip actions</p>
        <p className="mt-0.5 text-[12px] text-muted-foreground">
          {allow(can, CAP.field.assignNinja) || allow(can, CAP.field.storeHandoff)
            ? "Nothing to do at this stage. Store handover, release, re-plan, reschedule and cancel appear here when they apply."
            : "Your role doesn't include dispatch actions (assign Ninja or store handoff). Ask an administrator to enable them."}
        </p>
      </div>
    ) : null;
  }

  async function run(fn: () => PromiseLike<{ error: { message: string } | null }>, ok: string) {
    setBusy(true);
    const { error } = await fn();
    setBusy(false);
    if (error) {
      const m = error.message;
      toast.error(/invalid_transition/.test(m) ? "That step isn't allowed from the trip's current status. Refreshing."
        : /store_action_required/.test(m) ? "Only store staff can confirm handovers."
        : /manager_only|assign_forbidden|not_assignee/.test(m) ? "You don't have permission for that change."
        : m);
    } else toast.success(ok);
    onChanged?.();
  }
  const confirmReceipt = () => run(async () => {
    const r = await supabase!.from("field_trips").update({ status: "store_received" }).eq("id", trip.id);
    if (r.error) return r;
    await supabase!.from("field_handovers").update({ status: "accepted", ack_method: "store_confirm", ack_at: new Date().toISOString() }).eq("trip_id", trip.id).eq("kind", "ninja_to_store").eq("status", "pending");
    return r;
  }, "Device receipt confirmed. Create the ticket from this record.");
  const release = () => run(async () => supabase!.from("field_trips").update({ status: "store_dispatch_confirmed" }).eq("id", trip.id), "Repaired device released to the Ninja.");
  /** Exceptions back into the queue: retry legally per the DB state machine, or open a fresh leg. */
  const replan = () => run(async () => {
    const { data: t } = await supabase!.from("field_trips").select("*").eq("id", trip.id).maybeSingle();
    const x = t as Record<string, unknown> | null;
    if (!x) return { error: { message: "Trip not found." } };
    if (trip.status === "rescheduled") {
      return supabase!.from("field_trips").insert({
        organization_id: x.organization_id, branch_id: x.branch_id, job_id: x.job_id, trip_type: x.trip_type, lead_id: x.lead_id,
        dest_address: x.dest_address, dest_lat: x.dest_lat, dest_lng: x.dest_lng, dest_maps_url: x.dest_maps_url, instructions: x.instructions,
        client_request_id: `replan-${trip.id}-${Date.now()}`,
      });
    }
    if (trip.trip_type === "drop" && trip.status !== "return_to_store") {
      const r = await supabase!.from("field_trips").update({ status: "return_to_store" }).eq("id", trip.id);
      if (r.error) return r;
    }
    return supabase!.from("field_trips").update({ status: "awaiting_assignment" }).eq("id", trip.id);
  }, "Back in the assignment queue.");
  const cancel = (why: string) => run(async () => supabase!.from("field_trips").update({ status: "cancelled", failure_reason: why }).eq("id", trip.id), "Trip cancelled. The Ninja has been notified.");
  const flag = (why: string) => run(async () => {
    const { data: t } = await supabase!.from("field_trips").select("organization_id,branch_id").eq("id", trip.id).maybeSingle();
    const x = t as { organization_id: string; branch_id: string | null } | null;
    await supabase!.from("field_handovers").update({ status: "rejected", reject_reason: why }).eq("trip_id", trip.id).eq("kind", "ninja_to_store").eq("status", "pending");
    return supabase!.from("field_trip_events").insert({ organization_id: x?.organization_id, branch_id: x?.branch_id ?? null, job_id: trip.job_id, trip_id: trip.id, event_type: "problem_reported", note: `Store flagged handover: ${why}` });
  }, "Handover flagged for the Field Manager.");
  const reschedule = (iso: string) => run(async () => supabase!.from("field_trips").update({ scheduled_at: iso }).eq("id", trip.id), "Trip rescheduled.");
  const ticketId = getJob(trip.job_id)?.linkedTicketId;

  return (
    <div className={className}>
      {showEmpty ? <p className="mb-2 text-[12.5px] font-semibold text-foreground">Trip actions</p> : null}
      <div className="flex flex-wrap items-center gap-2">
        {a.confirm ? <Button size="sm" className="gap-1" loading={busy} onClick={() => void confirmReceipt()}><PackageCheck className="h-3.5 w-3.5" />Confirm received</Button> : null}
        {a.confirm ? <Button size="sm" variant="outline" onClick={() => { setReason(""); setReasonFor("flag"); }}>Flag mismatch</Button> : null}
        {a.release ? <Button size="sm" className="gap-1" loading={busy} onClick={() => void release()}><CheckCircle2 className="h-3.5 w-3.5" />Release device</Button> : null}
        {a.ticket ? <Button size="sm" variant="outline" className="gap-1" onClick={() => router.push(ticketId ? `/tickets/${ticketId}` : `/tickets/new?fromFieldJob=${trip.job_id}&from=field`)}><TicketIcon className="h-3.5 w-3.5" />{ticketId ? "View ticket" : "Create ticket"}</Button> : null}
        {a.replan ? <Button size="sm" className="gap-1" loading={busy} onClick={() => void replan()}><RotateCcw className="h-3.5 w-3.5" />Re-plan trip</Button> : null}
        {a.reschedule ? <Button size="sm" variant="outline" className="gap-1" disabled={busy} onClick={() => setSched(true)}><CalendarClock className="h-3.5 w-3.5" />Reschedule</Button> : null}
        {a.cancel ? <Button size="sm" variant="outline" className="gap-1 text-rose-600 hover:bg-rose-50" disabled={busy} onClick={() => { setReason(""); setReasonFor("cancel"); }}><XCircle className="h-3.5 w-3.5" />Cancel trip</Button> : null}
      </div>
      <RoxCenteredForm open={!!reasonFor} onClose={() => setReasonFor(null)} width="max-w-md"
        title={reasonFor === "cancel" ? `Cancel ${trip.trip_no ?? "trip"}` : `Flag handover · ${trip.trip_no ?? ""}`}
        subtitle={reasonFor === "cancel" ? "The Ninja is notified. History is kept." : "Use this when the device, IMEI or accessories don't match the pickup receipt."}
        footer={<div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setReasonFor(null)}>Back</Button>
          <Button variant={reasonFor === "cancel" ? "destructive" : "primary"} disabled={reason.trim().length < 3}
            onClick={() => { const k = reasonFor; setReasonFor(null); void (k === "cancel" ? cancel(reason.trim()) : flag(reason.trim())); }}>
            {reasonFor === "cancel" ? "Cancel trip" : "Flag mismatch"}</Button></div>}>
        <label className="mb-1.5 block text-[12px] font-medium text-zinc-700">Reason <span className="text-rose-500">*</span></label>
        <Textarea rows={4} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={reasonFor === "cancel" ? "Why is this trip being cancelled?" : "What doesn't match?"} />
      </RoxCenteredForm>
      {sched ? <DateTimeDialog title={`Reschedule ${trip.trip_no ?? "trip"}`} initialIso={trip.scheduled_at ?? undefined} onClose={() => setSched(false)}
        onSave={async (iso) => { setSched(false); await reschedule(iso); }} /> : null}
    </div>
  );
}
