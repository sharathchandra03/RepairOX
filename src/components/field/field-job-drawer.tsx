"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Field Job detail drawer.

   Role-aware operational cockpit for a single Pickup & Drop job. It shows the
   customer / device / addresses / linked Ticket, and offers the ACTION for the
   current lifecycle stage, gated by permission:
     • Field Manager: assign / reassign Ninja, schedule, mark ready-for-drop.
     • Ninja: start → arrived → picked up / delivered (with proof).
     • Store: receive device, create/link the repair Ticket.
   Field Job status is its OWN lifecycle — never a Ticket status.
   ────────────────────────────────────────────────────────────────────────── */

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Truck, User, Phone, MapPin, Package, Clock, Check, ExternalLink, Ticket as TicketIcon,
  UserCheck, PackageCheck, Send, XCircle, Wrench, CalendarClock, ShieldCheck,
} from "lucide-react";
import { Drawer } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { Can } from "@/components/common/can";
import { cn } from "@/lib/utils";
import { usePermissions } from "@/lib/permissions-context";
import { useSession } from "@/lib/use-session";
import { useField } from "@/lib/field-context";
import { useStore } from "@/lib/store";
import { StaffPicker } from "@/components/field/ninja-picker";
import {
  FIELD_STATUS_LABEL, FIELD_STATUS_TONE, isPickupLeg, isDropLeg,
  type FieldJob, type FieldProof,
} from "@/lib/field-data";

type PanelMode = "none" | "assign_ninja" | "assign_drop" | "pickup_proof" | "drop_proof";

export function FieldJobDrawer({ job, open, onClose }: {
  job: FieldJob | null;
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const { can } = usePermissions();
  const { id: currentUserId } = useSession();
  const {
    assignNinja, assignDropNinja, transition, confirmPickup, receiveAtStore,
    markReadyForDrop, confirmDelivery, cancelJob,
  } = useField();
  const { tickets } = useStore();

  const [mode, setMode] = useState<PanelMode>("none");
  const [schedDate, setSchedDate] = useState("");
  const [schedTime, setSchedTime] = useState("");
  const [pickNinjaId, setPickNinjaId] = useState("");
  const [pickNinjaName, setPickNinjaName] = useState("");
  const [proofCondition, setProofCondition] = useState("");
  const [proofNotes, setProofNotes] = useState("");

  const { name: currentUserName } = useSession();
  const linkedTicket = useMemo(
    () => (job?.linkedTicketId ? tickets.find((t) => t.id === job.linkedTicketId) : undefined),
    [tickets, job],
  );

  if (!job) return null;

  const reset = () => { setMode("none"); setSchedDate(""); setSchedTime(""); setPickNinjaId(""); setPickNinjaName(""); setProofCondition(""); setProofNotes(""); };
  const close = () => { reset(); onClose(); };

  const makeProof = (): FieldProof => ({
    at: new Date().toISOString(), byId: currentUserId, byName: currentUserName,
    condition: proofCondition, notes: proofNotes,
  });

  async function doAssignNinja() {
    if (!pickNinjaId || !job) return;
    await assignNinja(job.id, pickNinjaId, pickNinjaName, schedDate || undefined, schedTime || undefined);
    reset();
  }
  async function doAssignDrop() {
    if (!pickNinjaId || !job) return;
    await assignDropNinja(job.id, pickNinjaId, pickNinjaName, schedDate || undefined, schedTime || undefined);
    reset();
  }

  // The single primary action for the current status, with its permission.
  function renderStageAction() {
    const s = job!.status;
    if (s === "cancelled" || s === "completed") return null;

    // Field Manager assigns pickup ninja
    if (s === "pending_assignment") {
      return (
        <Can permission="assign_ninja">
          <Button className="w-full gap-1.5" onClick={() => setMode("assign_ninja")}><UserCheck className="h-4 w-4" /> Assign Ninja for pickup</Button>
        </Can>
      );
    }
    // Ninja pickup leg progression
    if (s === "assigned" || s === "pickup_scheduled") {
      return <Can permission="update_pickup"><Button className="w-full gap-1.5" onClick={() => transition(job!.id, "out_for_pickup")}><Send className="h-4 w-4" /> Start pickup</Button></Can>;
    }
    if (s === "out_for_pickup") {
      return <Can permission="update_pickup"><Button className="w-full gap-1.5" onClick={() => setMode("pickup_proof")}><PackageCheck className="h-4 w-4" /> Confirm pickup</Button></Can>;
    }
    if (s === "picked_up") {
      return <Can permission="receive_store_handoff"><Button className="w-full gap-1.5" onClick={() => receiveAtStore(job!.id)}><Package className="h-4 w-4" /> Receive device at store</Button></Can>;
    }
    if (s === "at_store") {
      return (
        <div className="space-y-2">
          <Can permission={["manage_field_jobs", "manage_repair_jobs"]}>
            <Button className="w-full gap-1.5" onClick={() => router.push(`/tickets/new?fromFieldJob=${job!.id}&from=field`)}>
              <TicketIcon className="h-4 w-4" /> {job!.linkedTicketId ? "Open Ticket" : "Create repair Ticket"}
            </Button>
          </Can>
        </div>
      );
    }
    if (s === "in_repair") {
      return (
        <Can permission="manage_field_jobs">
          <Button className="w-full gap-1.5" onClick={() => markReadyForDrop(job!.id)}><Wrench className="h-4 w-4" /> Mark repair complete · Ready for drop</Button>
        </Can>
      );
    }
    if (s === "ready_for_drop") {
      return <Can permission="assign_ninja"><Button className="w-full gap-1.5" onClick={() => setMode("assign_drop")}><UserCheck className="h-4 w-4" /> Assign Ninja for drop</Button></Can>;
    }
    if (s === "drop_scheduled") {
      return <Can permission="update_drop"><Button className="w-full gap-1.5" onClick={() => transition(job!.id, "out_for_drop")}><Send className="h-4 w-4" /> Start drop</Button></Can>;
    }
    if (s === "out_for_drop") {
      return <Can permission="update_drop"><Button className="w-full gap-1.5" onClick={() => setMode("drop_proof")}><ShieldCheck className="h-4 w-4" /> Confirm delivery</Button></Can>;
    }
    return null;
  }

  return (
    <Drawer
      open={open}
      onClose={close}
      title={job.jobNo}
      subtitle={`${job.customer || "Customer"}${job.device ? ` · ${job.device}` : ""}`}
      icon={Truck}
      width="max-w-lg"
    >
      <div className="space-y-4">
        {/* Status + links header */}
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-muted/30 p-4">
          <div className="flex items-center gap-3">
            <Avatar name={job.customer || job.jobNo} size={42} />
            <div className="min-w-0">
              <p className="font-display text-base font-bold">{job.customer || "—"}</p>
              <p className="text-[12px] text-muted-foreground">{job.leadNo ? `From ${job.leadNo}` : "Field Job"}{job.branch ? ` · ${job.branch}` : ""}</p>
            </div>
          </div>
          <span className={cn("inline-flex shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset", FIELD_STATUS_TONE[job.status])}>
            {FIELD_STATUS_LABEL[job.status]}
          </span>
        </div>

        {/* Quick contact */}
        <div className="flex items-center gap-2">
          {job.phone && <a href={`tel:${job.phone}`} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-border bg-card py-2 text-[12px] font-medium text-zinc-700 transition hover:bg-emerald-50 hover:text-emerald-700"><Phone className="h-3.5 w-3.5" /> Call</a>}
          {linkedTicket && <button onClick={() => router.push(`/tickets/${linkedTicket.id}`)} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-border bg-card py-2 text-[12px] font-medium text-zinc-700 transition hover:bg-[#EEF1FD] hover:text-[#4361EE]"><TicketIcon className="h-3.5 w-3.5" /> Ticket {linkedTicket.ticketNo || ""}</button>}
        </div>

        {/* Details grid */}
        <section className="rounded-2xl border border-border bg-card p-4">
          <div className="grid grid-cols-2 gap-x-4 gap-y-3">
            <Cell icon={Package} label="Device">{job.device || "—"}</Cell>
            <Cell icon={Wrench} label="Issue">{job.issue || "—"}</Cell>
            <Cell icon={User} label="Sales">{job.salesPersonName || "—"}</Cell>
            <Cell icon={UserCheck} label="Field Manager">{job.fieldManagerName || "—"}</Cell>
            <Cell icon={Truck} label="Pickup Ninja">{job.ninjaName || "—"}</Cell>
            <Cell icon={Truck} label="Drop Ninja">{job.dropNinjaName || "—"}</Cell>
          </div>
        </section>

        {/* Pickup leg */}
        <section className="rounded-2xl border border-border bg-card p-4">
          <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500"><MapPin className="h-3.5 w-3.5" /> Pickup</p>
          <p className="text-[13px] text-zinc-700">{job.pickupAddress || "Address on file"}</p>
          {(job.pickupDate || job.pickupTime) && <p className="mt-1 inline-flex items-center gap-1 text-[12px] text-zinc-500"><CalendarClock className="h-3 w-3" /> {job.pickupDate} {job.pickupTime}</p>}
          {job.pickupProof && <p className="mt-1.5 text-[11px] text-emerald-600">Picked up{job.pickupProof.byName ? ` by ${job.pickupProof.byName}` : ""}{job.pickupProof.condition ? ` · ${job.pickupProof.condition}` : ""}</p>}
        </section>

        {/* Drop leg (shown once relevant) */}
        {(isDropLeg(job.status) || job.status === "in_repair" || job.status === "completed" || job.dropAddress) && (
          <section className="rounded-2xl border border-border bg-card p-4">
            <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500"><MapPin className="h-3.5 w-3.5" /> Drop</p>
            <p className="text-[13px] text-zinc-700">{job.dropAddress || job.pickupAddress || "Same as pickup"}</p>
            {(job.dropDate || job.dropTime) && <p className="mt-1 inline-flex items-center gap-1 text-[12px] text-zinc-500"><CalendarClock className="h-3 w-3" /> {job.dropDate} {job.dropTime}</p>}
            {job.dropProof && <p className="mt-1.5 text-[11px] text-emerald-600">Delivered{job.dropProof.byName ? ` by ${job.dropProof.byName}` : ""}</p>}
          </section>
        )}

        {/* Inline action panels */}
        {mode === "assign_ninja" && (
          <AssignPanel title="Assign pickup Ninja" onCancel={() => setMode("none")} onConfirm={doAssignNinja} confirmDisabled={!pickNinjaId}
            date={schedDate} time={schedTime} setDate={setSchedDate} setTime={setSchedTime}>
            <StaffPicker roleIds={["ninja"]} valueId={pickNinjaId} showLoad onPick={(id, name) => { setPickNinjaId(id); setPickNinjaName(name); }} placeholder="Search ninjas…" />
          </AssignPanel>
        )}
        {mode === "assign_drop" && (
          <AssignPanel title="Assign drop Ninja" onCancel={() => setMode("none")} onConfirm={doAssignDrop} confirmDisabled={!pickNinjaId}
            date={schedDate} time={schedTime} setDate={setSchedDate} setTime={setSchedTime}>
            <StaffPicker roleIds={["ninja"]} valueId={pickNinjaId} showLoad onPick={(id, name) => { setPickNinjaId(id); setPickNinjaName(name); }} placeholder="Search ninjas…" />
          </AssignPanel>
        )}
        {(mode === "pickup_proof" || mode === "drop_proof") && (
          <ProofPanel
            title={mode === "pickup_proof" ? "Confirm pickup" : "Confirm delivery"}
            condition={proofCondition} notes={proofNotes} setCondition={setProofCondition} setNotes={setProofNotes}
            onCancel={() => setMode("none")}
            onConfirm={async () => {
              if (mode === "pickup_proof") await confirmPickup(job!.id, makeProof());
              else await confirmDelivery(job!.id, makeProof());
              reset();
            }}
          />
        )}

        {/* Stage action (hidden while a panel is open) */}
        {mode === "none" && <div>{renderStageAction()}</div>}

        {/* Reassign / reschedule for a field manager mid-flight */}
        {mode === "none" && isPickupLeg(job.status) && job.status !== "pending_assignment" && (
          <Can permission="assign_ninja">
            <button onClick={() => setMode("assign_ninja")} className="text-[12px] font-medium text-[#4361EE] hover:underline">Reassign / reschedule pickup</button>
          </Can>
        )}

        {/* Cancel */}
        {mode === "none" && job.status !== "cancelled" && job.status !== "completed" && (
          <Can permission="manage_field_jobs">
            <button onClick={() => cancelJob(job!.id)} className="inline-flex items-center gap-1 text-[12px] font-medium text-rose-600 hover:underline">
              <XCircle className="h-3.5 w-3.5" /> Cancel job
            </button>
          </Can>
        )}
      </div>
    </Drawer>
  );
}

function Cell({ icon: Icon, label, children }: { icon: React.ComponentType<{ className?: string }>; label: string; children: React.ReactNode }) {
  const empty = children === "" || children == null || children === "—";
  return (
    <div>
      <p className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground"><Icon className="h-3 w-3" /> {label}</p>
      <p className={cn("mt-0.5 text-[13px] font-medium", empty ? "text-zinc-300" : "text-zinc-800")}>{empty ? "—" : children}</p>
    </div>
  );
}

function AssignPanel({ title, children, date, time, setDate, setTime, onCancel, onConfirm, confirmDisabled }: {
  title: string; children: React.ReactNode;
  date: string; time: string; setDate: (v: string) => void; setTime: (v: string) => void;
  onCancel: () => void; onConfirm: () => void; confirmDisabled?: boolean;
}) {
  return (
    <section className="rounded-2xl border border-[#4361EE]/30 bg-[#EEF1FD]/40 p-4">
      <p className="mb-2 text-[12px] font-semibold text-[#4361EE]">{title}</p>
      {children}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full rounded-lg border border-border bg-card px-2 py-1.5 text-[12px]" />
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Time</label>
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="w-full rounded-lg border border-border bg-card px-2 py-1.5 text-[12px]" />
        </div>
      </div>
      <div className="mt-3 flex items-center justify-end gap-2">
        <Button size="sm" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button size="sm" className="gap-1.5" disabled={confirmDisabled} onClick={onConfirm}><Check className="h-3.5 w-3.5" /> Assign &amp; notify</Button>
      </div>
    </section>
  );
}

function ProofPanel({ title, condition, notes, setCondition, setNotes, onCancel, onConfirm }: {
  title: string; condition: string; notes: string;
  setCondition: (v: string) => void; setNotes: (v: string) => void;
  onCancel: () => void; onConfirm: () => void;
}) {
  return (
    <section className="rounded-2xl border border-emerald-300 bg-emerald-50/50 p-4">
      <p className="mb-2 text-[12px] font-semibold text-emerald-700">{title}</p>
      <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Device condition</label>
      <input value={condition} onChange={(e) => setCondition(e.target.value)} placeholder="e.g. Screen cracked, powers on" className="mb-2 w-full rounded-lg border border-border bg-card px-2.5 py-1.5 text-[12px]" />
      <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Notes (optional)</label>
      <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="w-full rounded-lg border border-border bg-card px-2.5 py-1.5 text-[12px]" />
      <div className="mt-3 flex items-center justify-end gap-2">
        <Button size="sm" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button size="sm" className="gap-1.5" onClick={onConfirm}><Check className="h-3.5 w-3.5" /> Confirm</Button>
      </div>
    </section>
  );
}
