"use client";
import { useRouter } from "next/navigation";
import { AlertTriangle, CalendarClock, CheckCircle2, Clock, IndianRupee, Truck } from "lucide-react";
import { FieldKpiCards } from "@/components/field/field-kpi-cards";
import { inr } from "@/components/field/dashboard/dashboard-table";
import type { FieldOverview } from "@/components/field/overview/use-field-overview";

const arrow = (d: number | null, unit = "%") => (d == null ? undefined : `${d > 0 ? "▲ +" : d < 0 ? "▼ " : "• "}${d}${unit} vs last month`);

/** Six live KPIs. Cards that map to a trip list are clickable. */
export function OverviewKpis({ o }: { o: FieldOverview }) {
  const router = useRouter();
  const c = o.compare;
  const total = o.jobs.filter((j) => j.status !== "cancelled").length;
  return (
    <FieldKpiCards total={total} columns="lg:grid-cols-6" items={[
      { key: "today", label: "Visits today", value: o.today.length, tone: "sky", Icon: CalendarClock, share: undefined, hint: "Scheduled for today",
        onClick: () => router.push(`/field?from=${o.now.toISOString().slice(0, 10)}&to=${o.now.toISOString().slice(0, 10)}&excl=cancelled`) },
      { key: "transit", label: "In transit", value: o.inTransit, tone: "violet", Icon: Truck, hint: "On the road now", onClick: () => router.push("/field?queue=in_transit") },
      { key: "waiting", label: "Waiting for engineer", value: o.workload.unassigned, tone: "slate", Icon: Clock, hint: "Needs assignment", onClick: () => router.push("/field?queue=pending_assignment") },
      { key: "attn", label: "Needs attention", value: o.attentionJobCount, tone: "rose", Icon: AlertTriangle, hint: o.attentionJobCount ? "See the list →" : "All clear", share: total ? Math.round((o.attentionJobCount / total) * 100) : 0 },
      { key: "biz", label: "Business · month", value: inr(c.current.business), tone: "amber", Icon: IndianRupee, hint: arrow(c.businessDelta) ?? "Finalized invoices", onClick: () => router.push("/field/dashboard") },
      { key: "rate", label: "Completion rate", value: c.current.completionRate == null ? "—" : `${c.current.completionRate}%`, tone: "emerald", Icon: CheckCircle2, hint: arrow(c.rateDeltaPts, " pts") ?? `${c.current.completed} of ${c.current.trips} trips`, share: c.current.completionRate ?? 0, onClick: () => router.push("/field/dashboard") },
    ]} />
  );
}
