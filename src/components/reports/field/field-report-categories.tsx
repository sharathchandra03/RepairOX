"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Reports V2 · Field Management · Reports tab (UI flow only)
   ──────────────────────────────────────────────────────────────────────────
   Mirrors `report-categories.tsx` (Shop) exactly: a sticky category sidebar
   on the left, panels with charts/tables on the right. Sample data only —
   see mock-data.ts for the wiring notes.
   ────────────────────────────────────────────────────────────────────────── */

import { useState } from "react";
import { MapPinned, UsersRound, Route, Package, Landmark } from "lucide-react";
import { cn } from "@/lib/utils";
import { Panel, DataTable, DownloadBtn, type Column } from "../report-ui";
import { AreaChartView, BarChartView, PieChartView, Leaderboard } from "../report-charts";
import { ModulePreviewBanner } from "../module-preview-banner";
import {
  fieldCategoryTrend, fieldVisitsByStatus, fieldPerformerDimensions, fieldTopPartsUsed,
  fieldRouteTable, fieldVendorPayoutTable,
} from "./mock-data";

type CategoryId = "visits" | "technicians" | "routes" | "parts" | "financial";

const CATEGORIES: { id: CategoryId; label: string; icon: any }[] = [
  { id: "visits", label: "Visits", icon: MapPinned },
  { id: "technicians", label: "Technicians", icon: UsersRound },
  { id: "routes", label: "Routes", icon: Route },
  { id: "parts", label: "Parts Used", icon: Package },
  { id: "financial", label: "Financial", icon: Landmark },
];

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-4 xl:grid-cols-2">{children}</div>;
}

export function FieldReportCategories() {
  const [active, setActive] = useState<CategoryId>("visits");
  const technicianData = fieldPerformerDimensions.find((d) => d.id === "technicians")?.data ?? [];
  const routeData = fieldPerformerDimensions.find((d) => d.id === "routes")?.data ?? [];

  return (
    <div className="space-y-4">
      <ModulePreviewBanner moduleLabel="Field Management" />

      <div className="grid gap-5 lg:grid-cols-[248px_1fr]">
        <div className="lg:sticky lg:top-20 lg:self-start">
          <div className="flex gap-1.5 overflow-x-auto rounded-2xl border border-border bg-card p-2.5 shadow-card lg:flex-col lg:gap-1.5 lg:overflow-visible">
            {CATEGORIES.map((c) => {
              const Icon = c.icon;
              const on = active === c.id;
              return (
                <button
                  key={c.id}
                  onClick={() => setActive(c.id)}
                  className={cn(
                    "inline-flex shrink-0 items-center gap-3 rounded-xl px-4 py-3 text-[14px] font-medium transition-all duration-200 lg:w-full",
                    on ? "bg-[#4361EE] text-white shadow-[0_8px_20px_-8px_rgba(67,97,238,0.6)]" : "text-zinc-600 hover:bg-muted hover:text-foreground"
                  )}
                >
                  <Icon className={cn("h-[18px] w-[18px] shrink-0", on ? "text-white" : "text-muted-foreground")} />
                  {c.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="min-w-0">
          {active === "visits" && (
            <div className="space-y-4">
              <Panel title="On-Site Revenue Trend" subtitle="Billed revenue from field visits over time" actions={<DownloadBtn onClick={() => {}} />}>
                <AreaChartView data={fieldCategoryTrend} currency />
              </Panel>
              <Grid>
                <Panel title="Visits by Status">
                  <PieChartView data={fieldVisitsByStatus} height={240} />
                </Panel>
                <Panel title="Visits by Service Type">
                  <BarChartView data={fieldTopPartsUsed} height={240} />
                </Panel>
              </Grid>
            </div>
          )}

          {active === "technicians" && (
            <div className="space-y-4">
              <Panel title="Field Technician Leaderboard" subtitle="Revenue generated on-site" actions={<DownloadBtn onClick={() => {}} />}>
                <Leaderboard data={technicianData} currency />
              </Panel>
              <Panel title="Avg Visit Time by Technician">
                <DataTable
                  columns={[{ key: "t", label: "Technician" }, { key: "m", label: "Avg Minutes", numeric: true }] as Column[]}
                  rows={[
                    ["Suresh K.", 41],
                    ["Manoj R.", 47],
                    ["Farhan A.", 52],
                    ["Deepak V.", 45],
                  ]}
                />
              </Panel>
            </div>
          )}

          {active === "routes" && (
            <div className="space-y-4">
              <Panel title="Route Performance">
                <DataTable
                  columns={[
                    { key: "r", label: "Route" },
                    { key: "v", label: "Visits", numeric: true },
                    { key: "d", label: "Distance" },
                    { key: "o", label: "On-Time %" },
                  ] as Column[]}
                  rows={fieldRouteTable}
                />
              </Panel>
              <Panel title="Visits by Route">
                <Leaderboard data={routeData} />
              </Panel>
            </div>
          )}

          {active === "parts" && (
            <div className="space-y-4">
              <Panel title="Top Parts Used On-Site" actions={<DownloadBtn onClick={() => {}} />}>
                <Leaderboard data={fieldTopPartsUsed} />
              </Panel>
              <Panel title="Parts Usage Trend">
                <AreaChartView data={fieldCategoryTrend.map((p) => ({ ...p, value: Math.round(p.value / 900) }))} />
              </Panel>
            </div>
          )}

          {active === "financial" && (
            <div className="space-y-4">
              <Panel title="Vendor Payouts">
                <DataTable
                  columns={[
                    { key: "v", label: "Vendor" },
                    { key: "a", label: "Amount", format: "currency" },
                    { key: "s", label: "Status" },
                  ] as Column[]}
                  rows={fieldVendorPayoutTable}
                />
              </Panel>
              <Panel title="Cash vs Digital Collected On-Site">
                <BarChartView
                  data={[
                    { key: "cash", label: "Cash", value: 168000 },
                    { key: "digital", label: "Digital", value: 128000 },
                  ]}
                  currency
                  height={240}
                />
              </Panel>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
