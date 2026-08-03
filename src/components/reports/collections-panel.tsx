"use client";

/* RepairOX — Reports V2 · Section 3: Collections
   Collected / Pending / Overdue as one elegant stacked progress visualization
   instead of three isolated numbers — the owner sees collected, outstanding,
   and risk in a single glance. */

import { useRouter } from "next/navigation";
import { StackedProgressBar } from "./mini-charts";
import { EmptyState } from "./empty-state";
import { TONE } from "./report-theme";
import type { CollectionsData } from "./selectors";

export function CollectionsPanel({
  data,
  title = "Collections",
  subtitle = "Collected, outstanding and at-risk revenue",
  segmentLabels = ["Collected", "Pending", "Overdue"],
  drillHref = "/shop/payments",
  drillLabel = "View payments →",
  emptyTitle = "No invoices exist for this period",
}: {
  data: CollectionsData;
  title?: string;
  subtitle?: string;
  segmentLabels?: [string, string, string];
  drillHref?: string;
  drillLabel?: string;
  emptyTitle?: string;
}) {
  const router = useRouter();
  const hasData = data.collected + data.pending + data.overdue > 0;

  return (
    <div className="rounded-[20px] border border-border bg-card p-5 shadow-card">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-[14px] font-semibold">{title}</h3>
          <p className="text-[11.5px] text-muted-foreground">{subtitle}</p>
        </div>
        <button onClick={() => router.push(drillHref)} className="text-[11.5px] font-medium text-[#4361EE] hover:underline">
          {drillLabel}
        </button>
      </div>

      {hasData ? (
        <StackedProgressBar
          total={data.total}
          segments={[
            { label: segmentLabels[0], value: data.collected, color: TONE.collection.solid },
            { label: segmentLabels[1], value: data.pending, color: TONE.pending.solid },
            { label: segmentLabels[2], value: data.overdue, color: TONE.overdue.solid },
          ]}
        />
      ) : (
        <EmptyState icon="inbox" title={emptyTitle} detail="Try selecting another date range." compact />
      )}
    </div>
  );
}
