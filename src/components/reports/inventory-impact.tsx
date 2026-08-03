"use client";

/* RepairOX — Reports V2 · Section 6: Impact panel
   Graph + table, not five isolated numbers. Originally built for Inventory
   Impact (Shop); generalized into `ImpactPanel` so Sales/Field can reuse the
   exact same layout (stat row + two leaderboards + a watchlist) with their
   own copy and data shape. `InventoryImpact` below is a thin wrapper that
   preserves the original Shop-specific API. */

import { useRouter } from "next/navigation";
import { formatINR, formatNumber, cn } from "@/lib/utils";
import { Leaderboard } from "./report-charts";
import { EmptyState } from "./empty-state";
import { TONE, type MetricTone } from "./report-theme";
import type { InventoryImpactData } from "./selectors";
import type { SeriesPoint } from "@/lib/reports/types";

export interface ImpactStat {
  label: string;
  value: string;
  tone?: string;
}

export interface ImpactWatchItem {
  label: string;
  detail: string;
}

export interface ImpactPanelProps {
  title: string;
  subtitle: string;
  tone?: MetricTone;
  drillHref?: string;
  drillLabel?: string;
  stats: ImpactStat[];
  primaryLeaderboardTitle: string;
  primaryLeaderboard: SeriesPoint[];
  primaryEmptyTitle: string;
  primaryEmptyDetail: string;
  secondaryLeaderboardTitle: string;
  secondaryLeaderboard: SeriesPoint[];
  secondaryEmptyTitle: string;
  secondaryEmptyDetail: string;
  secondaryCurrency?: boolean;
  watchlistLabel?: string;
  watchlist?: ImpactWatchItem[];
  watchlistTone?: "amber" | "rose";
}

export function ImpactPanel({
  title,
  subtitle,
  tone = "inventory",
  drillHref,
  drillLabel = "View details →",
  stats,
  primaryLeaderboardTitle,
  primaryLeaderboard,
  primaryEmptyTitle,
  primaryEmptyDetail,
  secondaryLeaderboardTitle,
  secondaryLeaderboard,
  secondaryEmptyTitle,
  secondaryEmptyDetail,
  secondaryCurrency,
  watchlistLabel,
  watchlist = [],
  watchlistTone = "amber",
}: ImpactPanelProps) {
  const router = useRouter();
  const toneStyle = TONE[tone];
  const watchToneClasses =
    watchlistTone === "rose"
      ? { wrap: "border-rose-200 bg-rose-50/60", dot: "bg-rose-500", text: "text-rose-800", chip: "border-rose-200 text-rose-700", chipDim: "text-rose-500" }
      : { wrap: "border-amber-200 bg-amber-50/60", dot: "bg-amber-500", text: "text-amber-800", chip: "border-amber-200 text-amber-700", chipDim: "text-amber-500" };

  return (
    <div className="rounded-[20px] border border-border bg-card p-5 shadow-card">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-[14px] font-semibold">{title}</h3>
          <p className="text-[11.5px] text-muted-foreground">{subtitle}</p>
        </div>
        {drillHref && (
          <button onClick={() => router.push(drillHref)} className="text-[11.5px] font-medium text-[#4361EE] hover:underline">
            {drillLabel}
          </button>
        )}
      </div>

      {stats.length > 0 && (
        <div className="mb-4 grid gap-3" style={{ gridTemplateColumns: `repeat(${stats.length}, minmax(0, 1fr))` }}>
          {stats.map((s, i) => (
            <Stat key={i} label={s.label} value={s.value} tone={s.tone ?? toneStyle.text} />
          ))}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <p className="mb-2 text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground">{primaryLeaderboardTitle}</p>
          {primaryLeaderboard.length > 0 ? (
            <Leaderboard data={primaryLeaderboard} />
          ) : (
            <EmptyState icon="tickets" title={primaryEmptyTitle} detail={primaryEmptyDetail} compact />
          )}
        </div>
        <div>
          <p className="mb-2 text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground">{secondaryLeaderboardTitle}</p>
          {secondaryLeaderboard.length > 0 ? (
            <Leaderboard data={secondaryLeaderboard} currency={secondaryCurrency} />
          ) : (
            <EmptyState icon="inventory" title={secondaryEmptyTitle} detail={secondaryEmptyDetail} compact />
          )}
        </div>
      </div>

      {watchlist.length > 0 && (
        <div className={cn("mt-5 rounded-xl border p-3.5", watchToneClasses.wrap)}>
          <p className={cn("mb-2 flex items-center gap-1.5 text-[11.5px] font-semibold", watchToneClasses.text)}>
            <span className={cn("h-1.5 w-1.5 rounded-full", watchToneClasses.dot)} /> {watchlistLabel}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {watchlist.map((i, idx) => (
              <span key={idx} className={cn("rounded-full border bg-white px-2.5 py-1 text-[11px] font-medium", watchToneClasses.chip)}>
                {i.label} <span className={watchToneClasses.chipDim}>· {i.detail}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="rounded-xl bg-muted/40 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-[16px] font-bold tabular-nums", tone)}>{value}</p>
    </div>
  );
}

/* ─── Shop-specific wrapper (original API, unchanged behavior) ──────────── */

export function InventoryImpact({ data }: { data: InventoryImpactData }) {
  return (
    <ImpactPanel
      title="Inventory Impact"
      subtitle="Parts consumption behind this period's repairs"
      tone="inventory"
      drillHref="/inventory"
      drillLabel="View inventory →"
      stats={[
        { label: "Units Used", value: formatNumber(data.usedUnits) },
        { label: "Value Consumed", value: formatINR(Math.round(data.usedValue)) },
        { label: "Stock Value", value: formatINR(Math.round(data.inventoryValue)), tone: "text-slate-700" },
      ]}
      primaryLeaderboardTitle="Top Consumed Parts"
      primaryLeaderboard={data.topConsumed}
      primaryEmptyTitle="No parts consumed"
      primaryEmptyDetail="Parts marked as used on tickets will appear here."
      secondaryLeaderboardTitle="Fast-Moving Inventory"
      secondaryLeaderboard={data.fastMoving}
      secondaryEmptyTitle="No sales velocity data"
      secondaryEmptyDetail="Units sold will populate this leaderboard."
      watchlistLabel={data.lowStock.length > 0 ? `Low Stock — ${data.lowStock.length} item${data.lowStock.length > 1 ? "s" : ""} need reordering` : undefined}
      watchlist={data.lowStock.map((i) => ({ label: i.name, detail: `${i.stock}/${i.min}` }))}
      watchlistTone="amber"
    />
  );
}
