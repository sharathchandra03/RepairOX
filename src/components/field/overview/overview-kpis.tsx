"use client";
/* RepairOX — Field overview KPIs: a time strip + five large cards.
   • Pickup / On-Site are trip TYPES (warranty variants fold into their group).
   • Drops are a STATUS: trips whose device has to be delivered back to the
     customer (ready for drop / drop scheduled / out for drop) plus pure-Drop trips.
   • Business = finalized (paid, non-proforma) invoices of the trips in range.
   • Need to assign = live backlog of trips with no engineer yet (not date-scoped,
     so an old unassigned trip never hides behind "Today"). */
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Clock, Home, IndianRupee, PackageCheck, Truck } from "lucide-react";
import { FieldKpiCards } from "@/components/field/field-kpi-cards";
import { SegmentedTabs } from "@/components/ui/tabs";
import { DateRangePicker } from "@/components/filters/date-range-picker";
import { inr } from "@/components/field/dashboard/dashboard-table";
import { boundsForPreset, inBounds, tripDateOf, tripGroupOf, isCompleted, isAssigned, buildSummaryRows, sumRows, DASH_PRESETS, type DashPreset } from "@/lib/field-dashboard";
import type { FieldOverview } from "@/components/field/overview/use-field-overview";

const PERIODS = DASH_PRESETS;
const DROP_STATUSES = new Set(["ready_for_drop", "drop_scheduled", "out_for_drop"]);

export function OverviewKpis({ o }: { o: FieldOverview }) {
  const router = useRouter();
  const [period, setPeriod] = useState<DashPreset>("today");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const bounds = useMemo(() => boundsForPreset(period, customFrom, customTo, o.now), [period, customFrom, customTo, o.now]);

  const k = useMemo(() => {
    const live = o.jobs.filter((j) => j.status !== "cancelled");
    const inRange = live.filter((j) => inBounds(tripDateOf(j), bounds) || (!bounds.from && !bounds.to));
    const type = (g: "pickup" | "onsite") => {
      const rows = inRange.filter((j) => tripGroupOf(j) === g);
      return { total: rows.length, done: rows.filter(isCompleted).length };
    };
    const drops = live.filter((j) => {
      if (!(tripGroupOf(j) === "drop" || DROP_STATUSES.has(j.status))) return false;
      return !bounds.from && !bounds.to ? true : inBounds(j.dropDate || tripDateOf(j), bounds);
    });
    const dropsOut = drops.filter((j) => j.status === "out_for_drop").length;
    const dropsDone = drops.filter((j) => j.status === "delivered" || isCompleted(j)).length;
    const sum = sumRows(buildSummaryRows(o.jobs, "store", bounds, o.ctx));
    const toAssign = live.filter((j) => j.status === "pending_assignment" && !isAssigned(j)).length;
    return { pickup: type("pickup"), onsite: type("onsite"), drops: drops.length, dropsOut, dropsDone, business: sum.business, invoiced: sum.invoiced, toAssign };
  }, [o.jobs, o.ctx, bounds]);

  const drill = (group: "pickup" | "onsite" | "drop") => {
    const q = new URLSearchParams({ group, excl: "cancelled" });
    if (bounds.from) q.set("from", bounds.from);
    if (bounds.to) q.set("to", bounds.to);
    router.push(`/field?${q.toString()}`);
  };
  const pct = (d: number, t: number) => (t ? `${Math.round((d / t) * 100)}%` : "—");
  const total = o.jobs.filter((j) => j.status !== "cancelled").length;

  return (
    <div className="space-y-3">
      <div className="max-w-full overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        <SegmentedTabs size="sm" value={period} onChange={(v) => setPeriod(v as DashPreset)} options={PERIODS} />
      </div>
      <DateRangePicker open={period === "custom"} from={customFrom} to={customTo} onFromChange={setCustomFrom} onToChange={setCustomTo} />
      <FieldKpiCards total={total} large columns="lg:grid-cols-5" items={[
        { key: "pickup", label: "Pickup", value: k.pickup.total, tone: "sky", Icon: Truck, hint: `${pct(k.pickup.done, k.pickup.total)} completed · ${k.pickup.done} of ${k.pickup.total}`,
          share: k.pickup.total ? Math.round((k.pickup.done / k.pickup.total) * 100) : 0, onClick: () => drill("pickup") },
        { key: "onsite", label: "On-Site", value: k.onsite.total, tone: "violet", Icon: Home, hint: `${pct(k.onsite.done, k.onsite.total)} completed · ${k.onsite.done} of ${k.onsite.total}`,
          share: k.onsite.total ? Math.round((k.onsite.done / k.onsite.total) * 100) : 0, onClick: () => drill("onsite") },
        { key: "drops", label: "Drops", value: k.drops, tone: "teal", Icon: PackageCheck, hint: k.drops ? `${pct(k.dropsDone, k.drops)} delivered · ${k.dropsOut} on the way` : "Back to customer",
          share: k.drops ? Math.round((k.dropsDone / k.drops) * 100) : 0, onClick: () => drill("drop") },
        { key: "biz", label: "Business value", value: inr(k.business), tone: "amber", Icon: IndianRupee,
          hint: k.invoiced ? `${k.invoiced} finalized invoice${k.invoiced > 1 ? "s" : ""}` : "No finalized invoices", share: k.business ? 100 : 0, onClick: () => router.push("/field/insights") },
        { key: "assign", label: "Need to assign", value: k.toAssign, tone: "rose", Icon: Clock, hint: k.toAssign ? "No engineer yet · see the list →" : "Everything is assigned",
          share: total ? Math.round((k.toAssign / total) * 100) : 0, onClick: () => router.push("/field?queue=pending_assignment") },
      ]} />
    </div>
  );
}
