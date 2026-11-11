"use client";

/* Field dashboards hub — live snapshot + the five dashboards (each with its own
   purpose). Replaces the old near-empty card page. */
import { useMemo } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { BackPill } from "@/components/common/back-pill";
import { RequireCapability } from "@/components/common/require-capability";
import { CAP } from "@/lib/capabilities";
import { FieldDashboardCards } from "@/components/field/dashboard/dashboard-cards";
import { inr } from "@/components/field/dashboard/dashboard-table";
import { useFieldOverview } from "@/components/field/overview/use-field-overview";
import { OverviewKpis } from "@/components/field/overview/overview-kpis";
import { TrendPanel, InsightsPanel, LeaderboardPanel, Panel } from "@/components/field/overview/widgets";
import { LayoutGrid } from "lucide-react";

export default function FieldDashboardsHub() {
  return (
    <RequireCapability anyOf={CAP.field.dashboard}>
      <Hub />
    </RequireCapability>
  );
}

function Hub() {
  const o = useFieldOverview();
  const preview = useMemo(() => {
    const c = o.compare.current;
    const year = String(o.now.getFullYear());
    const yearTrips = o.jobs.filter((j) => j.status !== "cancelled" && (j.pickupDate || j.dropDate || j.createdAt).startsWith(year)).length;
    const month = `${c.trips} trips · ${inr(c.business)} this month`;
    const busy = o.workload.rows.filter((r) => !r.free).length;
    return {
      "multi-store": month,
      "single-store": month,
      "fe-team": `${o.workload.rows.length} engineers · ${busy} with open trips`,
      "store-master": `${year}: ${yearTrips} trips`,
      "fe-master": `${year}: ${yearTrips} trips`,
    } as Record<string, string>;
  }, [o]);

  return (
    <div className="space-y-5">
      <div><BackPill href="/field" label="Back to Pickup & Drop" /></div>
      <PageHeader eyebrow="Field Management" title="Field Dashboards" subtitle="A live snapshot, then the view you need. Business always counts finalized invoices only." />
      <OverviewKpis o={o} />
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3 xl:items-stretch">
        <div className="flex flex-col gap-5 xl:col-span-2">
          <Panel title="Choose a dashboard" icon={LayoutGrid} className="h-auto">
            <FieldDashboardCards preview={preview} />
          </Panel>
          <div className="flex flex-1 flex-col"><TrendPanel o={o} /></div>
        </div>
        {/* Right column follows the left column's height (absolute on xl) and splits it 50/50; each panel scrolls inside. */}
        <div className="relative min-h-[560px] xl:min-h-0">
          <div className="flex h-[560px] flex-col gap-5 xl:absolute xl:inset-0 xl:h-auto">
            <div className="min-h-0 flex-1"><InsightsPanel o={o} /></div>
            <div className="min-h-0 flex-1"><LeaderboardPanel o={o} /></div>
          </div>
        </div>
      </div>
    </div>
  );
}
