"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Field & Route reporting (operational, no revenue).

   Two lenses over the same linked records:
     • Field ops metrics: pickup/drop volumes, failures, delays, avg times.
     • Route performance: Store-to-Store vs Pickup & Drop funnel (spec §55),
       computed from actual linked Lead / Walk-In / Field Job / Ticket records.
   ────────────────────────────────────────────────────────────────────────── */

import { useMemo } from "react";
import Link from "next/link";
import { ArrowLeft, Truck, Store, CheckCircle2, XCircle, Clock, Timer } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Can } from "@/components/common/can";
import { cn } from "@/lib/utils";
import { useField } from "@/lib/field-context";
import { useLeads } from "@/lib/leads-context";
import { usePermissions } from "@/lib/permissions-context";
import { staffByRole } from "@/lib/field-linking";
import { isDelayed, normaliseRoute, type FieldJob } from "@/lib/field-data";

export default function FieldReportsPage() {
  const { jobs } = useField();
  const { leads } = useLeads();
  const { team } = usePermissions();

  /* Field operational metrics — pickups, drops, failures, delays, avg times. */
  const ops = useMemo(() => {
    const pickedUp = jobs.filter((j) => j.pickupProof);
    const delivered = jobs.filter((j) => j.dropProof);
    const failedPickup = jobs.filter((j) => j.status === "failed_pickup");
    const failedDrop = jobs.filter((j) => j.status === "failed_drop");
    const delayed = jobs.filter((j) => isDelayed(j));

    const avgHours = (list: FieldJob[], from: (j: FieldJob) => string | undefined, to: (j: FieldJob) => string | undefined) => {
      const spans = list
        .map((j) => { const a = from(j); const b = to(j); return a && b ? (new Date(b).getTime() - new Date(a).getTime()) : NaN; })
        .filter((n) => !isNaN(n) && n >= 0);
      if (spans.length === 0) return null;
      return (spans.reduce((s, n) => s + n, 0) / spans.length) / 3600000;
    };
    const avgPickup = avgHours(pickedUp, (j) => j.createdAt, (j) => j.pickupProof?.at);

    return {
      totalJobs: jobs.length,
      pickedUp: pickedUp.length,
      delivered: delivered.length,
      failedPickup: failedPickup.length,
      failedDrop: failedDrop.length,
      delayed: delayed.length,
      completed: jobs.filter((j) => j.status === "completed").length,
      avgPickupHours: avgPickup,
    };
  }, [jobs]);

  /* Route performance funnel from real linked records (spec §55, §73). */
  const routes = useMemo(() => {
    const store = leads.filter((l) => normaliseRoute(l.fulfilmentRoute) === "STORE_VISIT");
    const pickup = leads.filter((l) => normaliseRoute(l.fulfilmentRoute) === "PICKUP_DROP");
    return {
      store: {
        total: store.length,
        walkIns: store.filter((l) => l.linkedWalkInId).length,
        converted: store.filter((l) => l.linkedTicketId).length,
      },
      pickup: {
        total: pickup.length,
        fieldJobs: pickup.filter((l) => l.linkedFieldJobId).length,
        pickedUp: jobs.filter((j) => j.pickupProof && pickup.some((l) => l.id === j.leadId)).length,
        converted: pickup.filter((l) => l.linkedTicketId).length,
        delivered: jobs.filter((j) => j.dropProof && pickup.some((l) => l.id === j.leadId)).length,
        completed: jobs.filter((j) => j.status === "completed" && pickup.some((l) => l.id === j.leadId)).length,
      },
      total: store.length + pickup.length,
    };
  }, [leads, jobs]);

  /* Jobs by ninja + by store (operational breakdown). */
  const byNinja = useMemo(() => {
    const ninjas = staffByRole(team, ["ninja"]);
    return ninjas.map((n) => ({
      name: n.name,
      jobs: jobs.filter((j) => j.ninjaId === n.id || j.dropNinjaId === n.id).length,
      completed: jobs.filter((j) => (j.ninjaId === n.id || j.dropNinjaId === n.id) && j.status === "completed").length,
    })).filter((r) => r.jobs > 0).sort((a, b) => b.jobs - a.jobs);
  }, [team, jobs]);

  return (
    <Can permission="view_field_reports" fallback={<div className="p-12 text-center text-sm text-muted-foreground">You don't have access to field reports.</div>}>
      <div className="space-y-5">
        <PageHeader
          eyebrow="Field · Reports"
          title="Field Reporting"
          subtitle="Pickup & drop operations and route performance — from real linked records."
          actions={<Link href="/field" className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-[12px] font-medium text-zinc-700 hover:bg-muted"><ArrowLeft className="h-3.5 w-3.5" /> Back to Field</Link>}
        />

        {/* Operational metrics */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Metric label="Total Jobs" value={ops.totalJobs} Icon={Truck} tone="sky" />
          <Metric label="Completed Pickups" value={ops.pickedUp} Icon={CheckCircle2} tone="emerald" />
          <Metric label="Completed Drops" value={ops.delivered} Icon={CheckCircle2} tone="emerald" />
          <Metric label="Completed Jobs" value={ops.completed} Icon={CheckCircle2} tone="emerald" />
          <Metric label="Failed Pickups" value={ops.failedPickup} Icon={XCircle} tone="rose" />
          <Metric label="Failed Drops" value={ops.failedDrop} Icon={XCircle} tone="rose" />
          <Metric label="Delayed" value={ops.delayed} Icon={Clock} tone="amber" />
          <Metric label="Avg Pickup (hrs)" value={ops.avgPickupHours == null ? "—" : ops.avgPickupHours.toFixed(1)} Icon={Timer} tone="violet" />
        </div>

        {/* Route performance */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
            <div className="mb-3 flex items-center gap-2"><span className="grid h-8 w-8 place-items-center rounded-lg bg-sky-50 text-sky-700"><Store className="h-4 w-4" /></span><h3 className="font-display text-base font-bold">Store-to-Store</h3></div>
            <FunnelRow label="Total leads routed" value={routes.store.total} />
            <FunnelRow label="Received as Walk-In" value={routes.store.walkIns} of={routes.store.total} />
            <FunnelRow label="Converted to Ticket" value={routes.store.converted} of={routes.store.total} last />
          </div>
          <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
            <div className="mb-3 flex items-center gap-2"><span className="grid h-8 w-8 place-items-center rounded-lg bg-violet-50 text-violet-700"><Truck className="h-4 w-4" /></span><h3 className="font-display text-base font-bold">Pickup &amp; Drop</h3></div>
            <FunnelRow label="Total leads routed" value={routes.pickup.total} />
            <FunnelRow label="Field Jobs created" value={routes.pickup.fieldJobs} of={routes.pickup.total} />
            <FunnelRow label="Picked up" value={routes.pickup.pickedUp} of={routes.pickup.total} />
            <FunnelRow label="Converted to Ticket" value={routes.pickup.converted} of={routes.pickup.total} />
            <FunnelRow label="Delivered" value={routes.pickup.delivered} of={routes.pickup.total} />
            <FunnelRow label="Completed" value={routes.pickup.completed} of={routes.pickup.total} last />
          </div>
        </div>

        {/* Jobs by ninja */}
        <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
          <h3 className="mb-3 font-display text-base font-bold">Jobs by Ninja</h3>
          {byNinja.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">No ninja activity yet.</p>
          ) : (
            <div className="space-y-2">
              {byNinja.map((r) => (
                <div key={r.name} className="flex items-center justify-between rounded-xl border border-border px-3 py-2 text-[13px]">
                  <span className="font-medium text-zinc-800">{r.name}</span>
                  <span className="text-zinc-500">{r.jobs} jobs · {r.completed} completed</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Can>
  );
}

function Metric({ label, value, Icon, tone }: { label: string; value: number | string; Icon: React.ComponentType<{ className?: string }>; tone: string }) {
  const toneCls = {
    sky: "bg-sky-50 text-sky-700 ring-sky-200", emerald: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    rose: "bg-rose-50 text-rose-600 ring-rose-200", amber: "bg-amber-50 text-amber-700 ring-amber-200",
    violet: "bg-violet-50 text-violet-700 ring-violet-200",
  }[tone] || "bg-zinc-100 text-zinc-600 ring-zinc-200";
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
      <span className={cn("grid h-8 w-8 place-items-center rounded-lg ring-1", toneCls)}><Icon className="h-4 w-4" /></span>
      <p className="font-display mt-2.5 text-2xl font-extrabold tnum">{value}</p>
      <p className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</p>
    </div>
  );
}

function FunnelRow({ label, value, of, last }: { label: string; value: number; of?: number; last?: boolean }) {
  const pct = of && of > 0 ? Math.round((value / of) * 100) : null;
  return (
    <div className={cn("flex items-center justify-between py-2", !last && "border-b border-border")}>
      <span className="text-[13px] text-zinc-600">{label}</span>
      <span className="inline-flex items-center gap-2 text-[13px] font-semibold text-zinc-900">
        {value}
        {pct != null && <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-zinc-500">{pct}%</span>}
      </span>
    </div>
  );
}
