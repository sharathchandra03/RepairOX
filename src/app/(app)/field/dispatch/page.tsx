"use client";
/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Field Dispatch Board (manager + store reception).
   Works on the SAME field_trips the Ninja app writes. State transitions are
   validated by the database (field_trip_transition_ok); this page only offers
   the manager/store steps: assign / reassign, confirm store receipt, release a
   repaired device to a Ninja, and create the Drop trip.
   ────────────────────────────────────────────────────────────────────────── */
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle2, ClipboardList, Eye, PackageCheck, PackageOpen, RefreshCw, Store, Truck, UserPlus } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { RequireCapability } from "@/components/common/require-capability";
import { SegmentedTabs } from "@/components/ui/tabs";
import { Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";
import { toast } from "@/components/ui/toaster";
import { TableSearch } from "@/components/common/table-utility-bar";
import { supabase } from "@/lib/supabase";
import { usePermissions } from "@/lib/permissions-context";
import { allow, CAP } from "@/lib/capabilities";
import { STATUS_META, TYPE_LABEL, TRIP_SELECT, ago, whenLabel, type NinjaTrip } from "@/lib/ninja/model";
import { cn } from "@/lib/utils";
import { LiveOpsMap } from "@/components/field/live-ops-map";
import { RoxCenteredForm } from "@/components/ui/rox-centered-form";
import { DateTimeDialog } from "@/components/ui/date-time-picker";
import { Textarea } from "@/components/ui/input";
import { useRouter } from "next/navigation";
import { CalendarClock, RotateCcw, Ticket as TicketIcon, XCircle } from "lucide-react";
import { Map as MapIcon, List } from "lucide-react";

interface NinjaOpt { id: string; name: string; status: string | null; branch_id: string | null }
interface ReadyJob { id: string; job_no: string | null; customer: string | null; device: string | null; drop_address: string | null; pickup_address: string | null; organization_id: string; branch_id: string | null }
interface Live { trip_id: string; last_point_at: string | null; last_lat: number | null; last_lng: number | null }

const TONE: Record<string, string> = {
  blue: "bg-[#EEF1FD] text-[#3450D8] ring-[#4361EE]/20", amber: "bg-amber-50 text-amber-800 ring-amber-300/60", green: "bg-emerald-50 text-emerald-800 ring-emerald-300/60",
  rose: "bg-rose-50 text-rose-800 ring-rose-300/60", slate: "bg-slate-100 text-slate-700 ring-slate-300/70", violet: "bg-violet-50 text-violet-800 ring-violet-300/60", sky: "bg-sky-50 text-sky-800 ring-sky-300/60",
};

const TABS = [
  { value: "queue", label: "Unassigned", test: (t: NinjaTrip) => t.status === "awaiting_assignment" },
  { value: "awaiting", label: "Awaiting acceptance", test: (t: NinjaTrip) => t.status === "assigned" },
  { value: "active", label: "Active", test: (t: NinjaTrip) => ["accepted", "en_route_customer", "arrived_customer", "pickup_in_progress", "device_collected", "en_route_store", "arrived_store", "store_dispatch_confirmed", "device_received_by_ninja", "delivery_in_progress", "service_in_progress", "service_completed", "service_not_completed", "delivered"].includes(t.status) },
  { value: "store", label: "Store handover", test: (t: NinjaTrip) => t.status === "handover_pending" || (t.trip_type === "drop" && t.status === "arrived_store") },
  { value: "exceptions", label: "Exceptions", test: (t: NinjaTrip) => ["failed_attempt", "customer_unavailable", "rescheduled", "return_to_store"].includes(t.status) },
  { value: "done", label: "Completed", test: (t: NinjaTrip) => ["completed", "store_received", "cancelled"].includes(t.status) },
  { value: "drop", label: "Ready for drop", test: () => false },
];

function Pill({ status }: { status: NinjaTrip["status"] }) {
  const m = STATUS_META[status];
  return <span className={cn("inline-flex h-7 w-full min-w-0 items-center gap-1.5 rounded-full px-2.5 text-[11px] font-semibold ring-1 ring-inset", TONE[m.tone])}><span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-70" /><span className="truncate" title={m.label}>{m.label}</span></span>;
}

function Dispatch() {
  const { can, team } = usePermissions();
  const [trips, setTrips] = useState<NinjaTrip[]>([]);
  const [ninjas, setNinjas] = useState<NinjaOpt[]>([]);
  const [ready, setReady] = useState<ReadyJob[]>([]);
  const [live, setLive] = useState<Record<string, Live>>({});
  const [tab, setTab] = useState("queue");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(20);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [view, setView] = useState<"list" | "map">("list");
  const [duty, setDuty] = useState<Record<string, string>>({});
  const [reasonFor, setReasonFor] = useState<null | { kind: "cancel" | "flag"; trip: NinjaTrip }>(null);
  const [reason, setReason] = useState("");
  const [schedFor, setSchedFor] = useState<NinjaTrip | null>(null);
  const router = useRouter();
  const canAssign = allow(can, CAP.field.assignNinja);
  const canStore = allow(can, CAP.field.storeHandoff);

  const load = useCallback(async () => {
    if (!supabase) return;
    const [t, n, r, s] = await Promise.all([
      supabase.from("field_trips").select(TRIP_SELECT).order("created_at", { ascending: false }).limit(500),
      supabase.from("staff").select("id,name,status,branch_id").eq("role_id", "ninja").eq("status", "active").order("name"),
      supabase.from("field_jobs").select("id,job_no,customer,device,drop_address,pickup_address,organization_id,branch_id").eq("status", "ready_for_drop").limit(100),
      supabase.from("field_tracking_sessions").select("trip_id,last_point_at,last_lat,last_lng").is("ended_at", null),
    ]);
    setTrips((t.data ?? []) as unknown as NinjaTrip[]);
    setNinjas((n.data ?? []) as NinjaOpt[]);
    const openDrop = new Set(((t.data ?? []) as unknown as NinjaTrip[]).filter((x) => x.trip_type === "drop" && !["completed", "cancelled"].includes(x.status)).map((x) => x.job_id));
    setReady(((r.data ?? []) as ReadyJob[]).filter((j) => !openDrop.has(j.id)));
    setLive(Object.fromEntries(((s.data ?? []) as Live[]).map((x) => [x.trip_id, x])));
    const ids = ((n.data ?? []) as NinjaOpt[]).map((x) => x.id);
    if (ids.length) {
      const { data: ws } = await supabase.from("work_sessions").select("staff_id,ended_at,last_seen_at,work_session_breaks(ended_at)").in("staff_id", ids).is("ended_at", null);
      const d: Record<string, string> = {};
      for (const w of (ws ?? []) as { staff_id: string; work_session_breaks?: { ended_at: string | null }[] }[]) d[w.staff_id] = (w.work_session_breaks ?? []).some((b) => !b.ended_at) ? "On break" : "On duty";
      setDuty(d);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
    if (!supabase) return;
    const ch = supabase.channel("dispatch-board")
      .on("postgres_changes", { event: "*", schema: "public", table: "field_trips" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "field_tracking_sessions" }, () => void load())
      .subscribe();
    const poll = setInterval(() => { if (document.visibilityState === "visible") void load(); }, 30000);
    return () => { supabase?.removeChannel(ch); clearInterval(poll); };
  }, [load]);

  const counts = useMemo(() => Object.fromEntries(TABS.map((x) => [x.value, x.value === "drop" ? ready.length : trips.filter(x.test).length])), [trips, ready]);
  const rows = useMemo(() => {
    const def = TABS.find((x) => x.value === tab)!;
    const needle = q.trim().toLowerCase();
    return trips.filter(def.test).filter((t) => !needle || [t.trip_no, t.job?.customer, t.job?.device, t.job?.phone, t.dest_address].some((v) => v?.toLowerCase().includes(needle)));
  }, [trips, tab, q]);
  useEffect(() => setPage(1), [tab, q, size]);
  const paged = rows.slice((page - 1) * size, page * size);
  const totalPages = Math.max(1, Math.ceil(rows.length / size));

  async function run(key: string, fn: () => Promise<{ error: { message: string } | null }>, ok: string) {
    setBusy(key);
    const { error } = await fn();
    setBusy(null);
    if (error) {
      const m = error.message;
      const nice = /not_eligible/.test(m) ? "That Ninja isn't authorised for this trip's store."
        : /invalid_transition/.test(m) ? "That step isn't allowed from the trip's current status. Refreshing."
        : /store_action_required/.test(m) ? "Only store staff can confirm handovers."
        : /manager_only|assign_forbidden|not_assignee/.test(m) ? "You don't have permission for that change."
        : m;
      toast.error(nice);
      void load();
    }
    else { toast.success(ok); await load(); }
  }

  async function assign(t: NinjaTrip, ninjaId: string) {
    if (!supabase || !ninjaId) return;
    await run(t.id, async () => {
      // Reassignment goes through the queue so the history shows who was replaced.
      if (t.ninja_id && t.ninja_id !== ninjaId) {
        const back = await supabase!.from("field_trips").update({ status: "awaiting_assignment" }).eq("id", t.id);
        if (back.error) return back;
      }
      return supabase!.from("field_trips").update({ status: "assigned", ninja_id: ninjaId }).eq("id", t.id);
    }, "Ninja assigned. They've been notified in the app.");
  }

  async function confirmReceipt(t: NinjaTrip) {
    if (!supabase) return;
    await run(t.id, async () => {
      const r = await supabase!.from("field_trips").update({ status: "store_received" }).eq("id", t.id);
      if (r.error) return r;
      await supabase!.from("field_handovers").update({ status: "accepted", ack_method: "store_confirm", ack_at: new Date().toISOString() }).eq("trip_id", t.id).eq("kind", "ninja_to_store").eq("status", "pending");
      return r;
    }, "Device receipt confirmed. Create the ticket from the Pickup & Drop record.");
  }

  async function flagMismatch(t: NinjaTrip, why: string) {
    if (!supabase) return;
    await run(t.id, async () => {
      await supabase!.from("field_handovers").update({ status: "rejected", reject_reason: why }).eq("trip_id", t.id).eq("kind", "ninja_to_store").eq("status", "pending");
      return supabase!.from("field_trip_events").insert({ organization_id: t.organization_id, branch_id: t.branch_id, job_id: t.job_id, trip_id: t.id, event_type: "problem_reported", note: `Store flagged handover: ${why}` });
    }, "Handover flagged for the Field Manager.");
  }

  async function cancelTrip(t: NinjaTrip, why: string) {
    if (!supabase) return;
    await run(t.id, async () => supabase!.from("field_trips").update({ status: "cancelled", failure_reason: why }).eq("id", t.id), "Trip cancelled. The Ninja has been notified.");
  }

  async function reschedule(t: NinjaTrip, iso: string) {
    if (!supabase) return;
    await run(t.id, async () => supabase!.from("field_trips").update({ scheduled_at: iso }).eq("id", t.id), "Trip rescheduled.");
  }

  /** Exceptions back into the queue: retry legally per the DB state machine, or open a fresh leg. */
  async function requeue(t: NinjaTrip) {
    if (!supabase) return;
    await run(t.id, async () => {
      if (t.status === "rescheduled") {
        return supabase!.from("field_trips").insert({
          organization_id: t.organization_id, branch_id: t.branch_id, job_id: t.job_id, trip_type: t.trip_type, lead_id: t.lead_id,
          dest_address: t.dest_address, dest_lat: t.dest_lat, dest_lng: t.dest_lng, dest_maps_url: t.dest_maps_url, instructions: t.instructions,
          client_request_id: `replan-${t.id}-${Date.now()}`,
        });
      }
      if (t.trip_type === "drop" && t.status !== "return_to_store") {
        const r = await supabase!.from("field_trips").update({ status: "return_to_store" }).eq("id", t.id);
        if (r.error) return r;
      }
      return supabase!.from("field_trips").update({ status: "awaiting_assignment" }).eq("id", t.id);
    }, "Back in the assignment queue.");
  }

  async function release(t: NinjaTrip) {
    if (!supabase) return;
    await run(t.id, async () => supabase!.from("field_trips").update({ status: "store_dispatch_confirmed" }).eq("id", t.id), "Repaired device released to the Ninja.");
  }

  async function createDrop(j: ReadyJob) {
    if (!supabase) return;
    await run(j.id, async () => supabase!.from("field_trips").insert({
      organization_id: j.organization_id, branch_id: j.branch_id, job_id: j.id, trip_type: "drop",
      dest_address: j.drop_address || j.pickup_address, client_request_id: `drop-${j.id}-${Date.now()}`,
    }), "Drop trip created. Assign a Ninja.");
    setTab("queue");
  }

  const k = (n: number, label: string, icon: React.ReactNode, to: string, tone: string) => (
    <button key={label} onClick={() => setTab(to)} className="rounded-xl border-2 border-zinc-200 bg-card p-4 text-left shadow-card transition hover:border-[#4361EE]/30">
      <span className={cn("grid h-9 w-9 place-items-center rounded-lg", tone)}>{icon}</span>
      <p className="mt-3 text-[26px] font-extrabold leading-none tabular-nums">{n}</p>
      <p className="mt-1 text-[12px] font-semibold text-muted-foreground">{label}</p>
    </button>
  );

  return (
    <div className="space-y-5">
      <PageHeader title="Dispatch Board" subtitle="Assign Ninjas, confirm store handovers and release repaired devices. Everything here is the same data the Ninja app updates."
        actions={<Button variant="outline" size="sm" className="gap-1.5" onClick={() => void load()}><RefreshCw className="h-3.5 w-3.5" />Refresh</Button>} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {k(counts.queue, "Unassigned", <ClipboardList className="h-4 w-4" />, "queue", "bg-slate-100 text-slate-600")}
        {k(counts.awaiting, "Awaiting acceptance", <UserPlus className="h-4 w-4" />, "awaiting", "bg-amber-50 text-amber-600")}
        {k(counts.active, "Active trips", <Truck className="h-4 w-4" />, "active", "bg-[#EEF1FD] text-[#4361EE]")}
        {k(counts.store, "Store handovers", <Store className="h-4 w-4" />, "store", "bg-violet-50 text-violet-600")}
        {k(counts.drop, "Ready for drop", <PackageOpen className="h-4 w-4" />, "drop", "bg-emerald-50 text-emerald-600")}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="max-w-full overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <SegmentedTabs size="sm" value={tab} onChange={setTab} options={TABS.map((x) => ({ value: x.value, label: `${x.label} (${counts[x.value] ?? 0})` }))} />
        </div>
        <div className="flex items-center gap-2">
          {allow(can, CAP.field.liveLocation) ? <SegmentedTabs size="sm" value={view} onChange={(v) => setView(v as "list" | "map")} options={[{ value: "list", label: <span className="flex items-center gap-1"><List className="h-3.5 w-3.5" />List</span> }, { value: "map", label: <span className="flex items-center gap-1"><MapIcon className="h-3.5 w-3.5" />Live map</span> }]} /> : null}
          <TableSearch value={q} onChange={setQ} placeholder="Search trips by trip no, customer, device, phone or area…" />
        </div>
      </div>

      {view === "map" ? (
        <div className="border-2 border-zinc-300 bg-card p-3 shadow-card">
          <LiveOpsMap trips={trips.filter((t) => !["completed", "cancelled", "awaiting_assignment"].includes(t.status))} live={live}
            ninjaName={(id) => (id ? ninjas.find((n) => n.id === id)?.name ?? "Ninja" : "—")} />
          <p className="mt-2 px-1 text-[12px] text-muted-foreground">Coloured pins = last real Ninja location (Live / Recently updated / Delayed / Stale). White circles = destinations. Location is shared only while a trip is travelling.</p>
        </div>
      ) : tab === "drop" ? (
        <div className="border-2 border-zinc-300 bg-card shadow-card">
          {ready.length === 0 ? <p className="p-8 text-center text-sm text-muted-foreground">No repaired devices are waiting for a drop trip.</p> : ready.map((j) => (
            <div key={j.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-500 px-5 py-4 first:border-t-0">
              <div><p className="text-sm font-bold">{j.job_no} · {j.customer}</p><p className="text-xs text-muted-foreground">{j.device} → {j.drop_address || j.pickup_address || "No address"}</p></div>
              {canAssign ? <Button size="sm" loading={busy === j.id} onClick={() => void createDrop(j)}>Create drop trip</Button> : null}
            </div>
          ))}
        </div>
      ) : (
        <div className="border-2 border-zinc-300 bg-card shadow-card">
          <div className="[overflow-x:auto]">
            <table className="w-full min-w-[1040px] table-fixed text-[14px]">
              <colgroup><col style={{ width: 130 }} /><col style={{ width: 96 }} /><col style={{ width: "20%" }} /><col style={{ width: "22%" }} /><col style={{ width: 150 }} /><col style={{ width: 190 }} /><col style={{ width: 210 }} /><col style={{ width: 200 }} /></colgroup>
              <thead className="sticky top-0 z-[5] border-b-2 border-white/35 bg-[#5368D4]">
                <tr className="text-left text-[12px] font-bold uppercase tracking-wider text-white">
                  {["Trip ID", "Type", "Contact & device", "Location", "Scheduled", "Status", "Ninja", "Action"].map((h) => <th key={h} className="px-4 py-4">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {loading ? <tr><td colSpan={8} className="p-10 text-center text-sm text-muted-foreground">Loading trips…</td></tr>
                  : paged.length === 0 ? <tr><td colSpan={8} className="p-10 text-center text-sm text-muted-foreground">Nothing in this list.</td></tr>
                  : paged.map((t) => {
                    const lv = live[t.id];
                    return (
                      <tr key={t.id} className="h-[68px] border-t border-zinc-500 align-middle hover:bg-muted/40">
                        <td className="px-4 py-4"><Link href={`/field/${t.job_id}`} className="font-bold text-[#4361EE] hover:underline">{t.trip_no}</Link><p className="text-[11px] text-muted-foreground">{t.job?.job_no}</p></td>
                        <td className="px-4 py-4 text-[13px] font-semibold">{TYPE_LABEL[t.trip_type]}</td>
                        <td className="px-4 py-4"><p className="truncate font-semibold">{t.job?.customer || "—"}</p><p className="truncate text-[12px] text-muted-foreground">{t.job?.device} · {t.job?.phone}</p></td>
                        <td className="px-4 py-4"><p className="line-clamp-2 text-[13px]">{t.dest_address || "—"}</p><p className="text-[11px] text-muted-foreground">{t.job?.pincode}</p></td>
                        <td className="px-4 py-4 text-[13px] font-medium">{whenLabel(t.scheduled_at, t.scheduled_window)}</td>
                        <td className="px-4 py-4"><Pill status={t.status} />{lv ? <p className="mt-1 text-[11px] font-semibold text-emerald-700">● Live · {ago(lv.last_point_at)}</p> : null}</td>
                        <td className="px-4 py-4">
                          {canAssign && ["awaiting_assignment", "assigned", "accepted"].includes(t.status) ? (
                            <Select className="h-[36px]" value={t.ninja_id ?? ""} placeholder="Assign Ninja" disabled={busy === t.id}
                              options={ninjas.filter((n) => !t.branch_id || !n.branch_id || n.branch_id === t.branch_id || n.id === t.ninja_id).map((n) => { const busyN = trips.filter((x) => x.ninja_id === n.id && !['completed','cancelled','awaiting_assignment','rescheduled','failed_attempt','customer_unavailable'].includes(x.status)).length; return { label: `${n.name} · ${duty[n.id] ?? 'Off duty'}${busyN ? ` · ${busyN} open` : ''}`, value: n.id }; })} onChange={(e) => void assign(t, e.target.value)} />
                          ) : <span className="text-[13px] font-medium">{t.ninja_id ? (ninjas.find((n) => n.id === t.ninja_id)?.name ?? team.find((m) => m.id === t.ninja_id)?.name ?? "Assigned") : "—"}</span>}
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex flex-wrap items-center gap-2">
                            {canStore && t.status === "handover_pending" ? (<>
                              <Button size="sm" className="gap-1" loading={busy === t.id} onClick={() => void confirmReceipt(t)}><PackageCheck className="h-3.5 w-3.5" />Confirm received</Button>
                              <Button size="sm" variant="outline" onClick={() => { setReason(""); setReasonFor({ kind: "flag", trip: t }); }}>Flag</Button>
                            </>) : null}
                            {canStore && t.trip_type === "drop" && t.status === "arrived_store" ? <Button size="sm" className="gap-1" loading={busy === t.id} onClick={() => void release(t)}><CheckCircle2 className="h-3.5 w-3.5" />Release device</Button> : null}
                            {canStore && t.status === "store_received" ? <Button size="sm" variant="outline" className="gap-1" onClick={() => router.push(t.job?.linked_ticket_id ? `/tickets/${t.job.linked_ticket_id}` : `/tickets/new?fromFieldJob=${t.job_id}&from=field`)}><TicketIcon className="h-3.5 w-3.5" />{t.job?.linked_ticket_id ? "Ticket" : "Create ticket"}</Button> : null}
                            {canAssign && ["failed_attempt", "customer_unavailable", "rescheduled", "return_to_store"].includes(t.status) ? <Button size="sm" className="gap-1" loading={busy === t.id} onClick={() => void requeue(t)}><RotateCcw className="h-3.5 w-3.5" />Re-plan</Button> : null}
                            {canAssign && ["awaiting_assignment", "assigned", "accepted"].includes(t.status) ? <button title="Reschedule" aria-label="Reschedule" onClick={() => setSchedFor(t)} className="grid h-8 w-8 place-items-center rounded-lg text-zinc-500 hover:bg-[#EEF1FD] hover:text-[#4361EE]"><CalendarClock className="h-4 w-4" /></button> : null}
                            {canAssign && (["awaiting_assignment", "assigned", "accepted", "en_route_customer", "arrived_customer", "pickup_in_progress", "failed_attempt", "customer_unavailable", "rescheduled", "return_to_store", "service_in_progress"].includes(t.status) || (t.trip_type === "drop" && t.status === "arrived_store")) ? <button title="Cancel trip" aria-label="Cancel trip" onClick={() => { setReason(""); setReasonFor({ kind: "cancel", trip: t }); }} className="grid h-8 w-8 place-items-center rounded-lg text-zinc-500 hover:bg-rose-50 hover:text-rose-600"><XCircle className="h-4 w-4" /></button> : null}
                            <Link href={`/field/${t.job_id}`} className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-[#4361EE] hover:bg-[#EEF1FD]"><Eye className="h-3.5 w-3.5" />View</Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {view === "list" && tab !== "drop" ? <Pagination page={page} totalPages={totalPages} onPageChange={setPage} totalItems={rows.length} pageSize={size} onPageSizeChange={setSize} itemLabel="trip" /> : null}

      <RoxCenteredForm open={!!reasonFor} onClose={() => setReasonFor(null)} width="max-w-md"
        title={reasonFor?.kind === "cancel" ? `Cancel ${reasonFor.trip.trip_no}` : `Flag handover · ${reasonFor?.trip.trip_no ?? ""}`}
        subtitle={reasonFor?.kind === "cancel" ? "The Ninja is notified. History is kept." : "Use this when the device, IMEI or accessories don't match the pickup receipt."}
        footer={<div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setReasonFor(null)}>Back</Button>
          <Button variant={reasonFor?.kind === "cancel" ? "destructive" : "primary"} disabled={reason.trim().length < 3}
            onClick={() => { const r = reasonFor!; setReasonFor(null); void (r.kind === "cancel" ? cancelTrip(r.trip, reason.trim()) : flagMismatch(r.trip, reason.trim())); }}>
            {reasonFor?.kind === "cancel" ? "Cancel trip" : "Flag mismatch"}</Button></div>}>
        <label className="mb-1.5 block text-[12px] font-medium text-zinc-700">Reason <span className="text-rose-500">*</span></label>
        <Textarea rows={4} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={reasonFor?.kind === "cancel" ? "Why is this trip being cancelled?" : "What doesn't match?"} />
      </RoxCenteredForm>
      {schedFor ? <DateTimeDialog title={`Reschedule ${schedFor.trip_no}`} initialIso={schedFor.scheduled_at ?? undefined} onClose={() => setSchedFor(null)}
        onSave={async (iso) => { const t = schedFor; setSchedFor(null); await reschedule(t, iso); }} /> : null}
    </div>
  );
}

export default function DispatchPage() {
  return <RequireCapability anyOf={["manage_field_jobs", "assign_ninja", "receive_store_handoff", "field_view_all", "full_access"]}><Dispatch /></RequireCapability>;
}
