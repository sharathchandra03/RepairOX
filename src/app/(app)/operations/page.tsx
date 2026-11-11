"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Field Management Overview (the Field workspace's Dashboard).

   A live command centre built from REAL trips (no sample data):
     KPIs → 14-day trend + Needs attention → Today's schedule + Dashboards + Notepad
          → Engineer workload + Top performers → Insights + Recent activity.
   Stock & purchasing stays one click away as shortcuts. The dashboards live in
   a compact rail beside the schedule instead of a block of cards on top.
   ────────────────────────────────────────────────────────────────────────── */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Truck } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Can } from "@/components/common/can";
import { NotepadWidget } from "@/components/dashboard/notepad-widget";
import { usePermissions } from "@/lib/permissions-context";
import { CAP, allow } from "@/lib/capabilities";
import { useFieldOverview } from "@/components/field/overview/use-field-overview";
import { OverviewKpis } from "@/components/field/overview/overview-kpis";
import {
  AttentionPanel, TodayPanel, WorkloadPanel, TrendPanel, LeaderboardPanel, InsightsPanel,
  ActivityPanel, DashboardLinksPanel, StockShortcuts,
} from "@/components/field/overview/widgets";

export default function FieldOverviewPage() {
  const router = useRouter();
  const { can } = usePermissions();
  const o = useFieldOverview();
  const canView = allow(can, CAP.field.view);
  const canCreate = allow(can, CAP.field.create);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Field"
        title="Field Management Overview"
        subtitle="Live trips, engineers and business — what needs you right now."
        actions={
          <div className="flex items-center gap-2">
            {canView && (
              <Link href="/field"><Button size="sm" variant="outline" className="rounded-full gap-1.5"><Truck className="h-3.5 w-3.5" /> Pickup &amp; Drop</Button></Link>
            )}
            <Can permission={CAP.field.create}>
              <Button size="sm" className="rounded-full gap-1.5" onClick={() => router.push("/field?new=1")}><Plus className="h-3.5 w-3.5" /> New Field Assignment</Button>
            </Can>
          </div>
        }
      />

      {canView ? (
        <>
          <OverviewKpis o={o} />

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
            <div className="xl:col-span-2"><TrendPanel o={o} /></div>
            <AttentionPanel o={o} />
          </div>

          {/* Row: schedule + notepad. ONE card per cell (nothing stacked inside a
              cell) and capped heights, so no card can overflow into the next row. */}
          <div className="grid grid-cols-1 items-stretch gap-5 xl:grid-cols-3">
            <div className="xl:col-span-2"><TodayPanel o={o} canCreate={canCreate} /></div>
            <NotepadWidget maxHeight={220} />
          </div>

          <div className="grid grid-cols-1 items-stretch gap-5 xl:grid-cols-2">
            <WorkloadPanel o={o} />
            <LeaderboardPanel o={o} />
          </div>

          <div className="grid grid-cols-1 items-stretch gap-5 xl:grid-cols-3">
            <Can permission={CAP.field.dashboard}><DashboardLinksPanel /></Can>
            <InsightsPanel o={o} />
            <ActivityPanel o={o} />
          </div>
        </>
      ) : (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
          <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground shadow-card xl:col-span-2">
            Pickup &amp; Drop data isn't available for your role. Ask an administrator for field access.
          </div>
          <NotepadWidget maxHeight={340} />
        </div>
      )}

      <StockShortcuts />
    </div>
  );
}
