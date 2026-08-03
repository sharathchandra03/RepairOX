"use client";

/* RepairOX — Reports V2 · Section 8: Top Performers
   Ranked, tabbed leaderboards. Originally built for Shop (Employees,
   Technicians, Customers, Services, Brands, Models, Accessories); generalized
   into `PerformersLeaderboardPanel` so Sales/Field can reuse the exact same
   layout with their own dimension tabs and data. `TopPerformers` below is a
   thin wrapper that preserves the original Shop-specific API. */

import { useState } from "react";
import { Leaderboard } from "./report-charts";
import { EmptyState } from "./empty-state";
import { cn } from "@/lib/utils";
import type { TopPerformers as TopPerformersData } from "./selectors";
import type { SeriesPoint } from "@/lib/reports/types";
import type { EmptyStateIcon } from "./empty-state";

export interface PerformerDimension {
  id: string;
  label: string;
  currency?: boolean;
  data: SeriesPoint[];
}

export function PerformersLeaderboardPanel({
  title = "Top Performers",
  subtitle = "Who and what is driving results this period",
  dimensions,
  emptyIcon = "customers",
}: {
  title?: string;
  subtitle?: string;
  dimensions: PerformerDimension[];
  emptyIcon?: EmptyStateIcon;
}) {
  const [activeId, setActiveId] = useState(dimensions[0]?.id ?? "");
  const active = dimensions.find((d) => d.id === activeId) ?? dimensions[0];

  return (
    <div className="rounded-[20px] border border-border bg-card p-5 shadow-card">
      <div className="mb-4">
        <h3 className="text-[14px] font-semibold">{title}</h3>
        <p className="text-[11.5px] text-muted-foreground">{subtitle}</p>
      </div>

      <div className="mb-4 flex flex-wrap gap-1.5">
        {dimensions.map((d) => (
          <button
            key={d.id}
            onClick={() => setActiveId(d.id)}
            className={cn(
              "rounded-full px-3 py-1.5 text-[12px] font-medium transition",
              activeId === d.id
                ? "bg-[#4361EE] text-white shadow-[0_6px_16px_-8px_rgba(67,97,238,0.55)]"
                : "border border-border bg-card text-zinc-600 hover:bg-muted"
            )}
          >
            {d.label}
          </button>
        ))}
      </div>

      {active && active.data.length > 0 ? (
        <Leaderboard data={active.data} currency={active.currency} />
      ) : (
        <EmptyState icon={emptyIcon} title={`No ${(active?.label ?? "").toLowerCase()} data yet`} detail="Try selecting another date range or clearing filters." compact />
      )}
    </div>
  );
}

/* ─── Shop-specific wrapper (original API, unchanged behavior) ──────────── */

const SHOP_DIMENSIONS: { id: keyof TopPerformersData; label: string; currency: boolean }[] = [
  { id: "employees", label: "Employees", currency: true },
  { id: "technicians", label: "Technicians", currency: false },
  { id: "customers", label: "Customers", currency: true },
  { id: "services", label: "Services", currency: true },
  { id: "brands", label: "Brands", currency: true },
  { id: "models", label: "Models", currency: true },
  { id: "accessories", label: "Accessories", currency: true },
];

export function TopPerformers({ data }: { data: TopPerformersData }) {
  return (
    <PerformersLeaderboardPanel
      dimensions={SHOP_DIMENSIONS.map((d) => ({ id: d.id, label: d.label, currency: d.currency, data: data[d.id] }))}
      emptyIcon="customers"
    />
  );
}
