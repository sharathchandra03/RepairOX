"use client";

/* RepairOX — Reports V2 · Section 2: Business Performance
   One wide analytics panel: Revenue Trend (area) on the left, Revenue Split
   (donut: Service / Accessories / Tax / Other) on the right. This is the
   business overview at a glance. */

import { AreaChartView } from "./report-charts";
import { DonutSplit } from "./mini-charts";
import { EmptyState } from "./empty-state";
import { formatINR } from "@/lib/utils";
import type { SeriesPoint } from "@/lib/reports/types";

export function BusinessPerformance({
  trend,
  split,
  rangeLabel,
  trendTitle = "Revenue Trend",
  trendSubtitle = "Billed revenue over time",
  splitTitle = "Revenue Split",
  splitSubtitle = "Where this revenue came from",
  splitCenterLabel = "Total billed",
  trendEmptyTitle = "No revenue has been generated",
  splitEmptyTitle = "No invoices in this period",
  splitEmptyDetail = "Composition appears once invoices are billed.",
  currency = true,
}: {
  trend: SeriesPoint[];
  split: SeriesPoint[];
  rangeLabel: string;
  trendTitle?: string;
  trendSubtitle?: string;
  splitTitle?: string;
  splitSubtitle?: string;
  splitCenterLabel?: string;
  trendEmptyTitle?: string;
  splitEmptyTitle?: string;
  splitEmptyDetail?: string;
  currency?: boolean;
}) {
  const total = split.reduce((s, d) => s + d.value, 0);
  const hasTrend = trend.some((p) => p.value > 0);

  return (
    <div className="grid gap-0 overflow-hidden rounded-[20px] border border-border bg-card shadow-card lg:grid-cols-[1fr_360px]">
      <div className="border-b border-border p-5 lg:border-b-0 lg:border-r">
        <div className="mb-1 flex items-center justify-between">
          <h3 className="text-[14px] font-semibold">{trendTitle}</h3>
          <span className="text-[11.5px] text-muted-foreground">{rangeLabel}</span>
        </div>
        <p className="mb-3 text-[11.5px] text-muted-foreground">{trendSubtitle}</p>
        {hasTrend ? (
          <AreaChartView data={trend} currency={currency} height={280} />
        ) : (
          <EmptyState icon="calendar" title={trendEmptyTitle} detail="Try selecting another date range." compact />
        )}
      </div>
      <div className="p-5">
        <h3 className="mb-1 text-[14px] font-semibold">{splitTitle}</h3>
        <p className="mb-4 text-[11.5px] text-muted-foreground">{splitSubtitle}</p>
        {total > 0 ? (
          <DonutSplit
            data={split}
            currency={currency}
            height={200}
            centerLabel={{ value: currency ? formatINR(Math.round(total)) : String(Math.round(total)), label: splitCenterLabel }}
          />
        ) : (
          <EmptyState icon="inbox" title={splitEmptyTitle} detail={splitEmptyDetail} compact />
        )}
      </div>
    </div>
  );
}
