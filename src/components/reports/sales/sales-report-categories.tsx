"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Reports V2 · Sales Management · Reports tab (UI flow only)
   ──────────────────────────────────────────────────────────────────────────
   Mirrors `report-categories.tsx` (Shop) exactly: a sticky category sidebar
   on the left, panels with charts/tables on the right. Sample data only —
   see mock-data.ts for the wiring notes.
   ────────────────────────────────────────────────────────────────────────── */

import { useState } from "react";
import {
  Filter as FilterIcon, Handshake, FileText, Megaphone, Landmark,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Panel, DataTable, DownloadBtn, type Column } from "../report-ui";
import { AreaChartView, BarChartView, PieChartView, Leaderboard } from "../report-charts";
import { ModulePreviewBanner } from "../module-preview-banner";
import {
  salesCategoryTrend, salesByStage, salesByOwner, salesTopCampaigns,
  salesTopChannels, salesLeadSourceTable,
} from "./mock-data";

type CategoryId = "pipeline" | "leads" | "deals" | "campaigns" | "financial";

const CATEGORIES: { id: CategoryId; label: string; icon: any }[] = [
  { id: "pipeline", label: "Pipeline", icon: FilterIcon },
  { id: "leads", label: "Leads", icon: Megaphone },
  { id: "deals", label: "Deals & Quotations", icon: Handshake },
  { id: "campaigns", label: "Campaigns", icon: FileText },
  { id: "financial", label: "Financial", icon: Landmark },
];

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-4 xl:grid-cols-2">{children}</div>;
}

export function SalesReportCategories() {
  const [active, setActive] = useState<CategoryId>("pipeline");

  return (
    <div className="space-y-4">
      <ModulePreviewBanner moduleLabel="Sales Management" />

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
          {active === "pipeline" && (
            <div className="space-y-4">
              <Panel title="Pipeline Trend" subtitle="New pipeline value created over time" actions={<DownloadBtn onClick={() => {}} />}>
                <AreaChartView data={salesCategoryTrend} currency />
              </Panel>
              <Grid>
                <Panel title="Deals by Stage">
                  <BarChartView data={salesByStage} height={240} />
                </Panel>
                <Panel title="Pipeline by Owner" actions={<DownloadBtn onClick={() => {}} />}>
                  <Leaderboard data={salesByOwner} currency />
                </Panel>
              </Grid>
            </div>
          )}

          {active === "leads" && (
            <div className="space-y-4">
              <Panel title="Lead Source Performance">
                <DataTable
                  columns={[
                    { key: "source", label: "Source" },
                    { key: "count", label: "Leads", numeric: true },
                    { key: "revenue", label: "Revenue", format: "currency" },
                    { key: "conv", label: "Conversion" },
                  ] as Column[]}
                  rows={salesLeadSourceTable}
                />
              </Panel>
              <Grid>
                <Panel title="Leads by Source">
                  <PieChartView data={salesTopChannels} currency height={240} />
                </Panel>
                <Panel title="Top Referral Partners">
                  <Leaderboard data={[
                    { key: "p1", label: "Anand Traders", value: 9 },
                    { key: "p2", label: "Sunrise Mobiles", value: 6 },
                    { key: "p3", label: "Existing Customers", value: 14 },
                  ]} />
                </Panel>
              </Grid>
            </div>
          )}

          {active === "deals" && (
            <div className="space-y-4">
              <Panel title="Deals by Stage">
                <BarChartView data={salesByStage} height={260} />
              </Panel>
              <Panel title="Recent Quotations">
                <DataTable
                  columns={[
                    { key: "q", label: "Quotation #" },
                    { key: "c", label: "Customer" },
                    { key: "v", label: "Value", format: "currency" },
                    { key: "s", label: "Status" },
                  ] as Column[]}
                  rows={[
                    ["QTN-2041", "Rangan Enterprises", 124000, "Sent"],
                    ["QTN-2039", "Priya Retail Chain", 86000, "Viewed"],
                    ["QTN-2036", "Kumar & Sons", 54000, "Accepted"],
                  ]}
                />
              </Panel>
            </div>
          )}

          {active === "campaigns" && (
            <div className="space-y-4">
              <Panel title="Top Campaigns" actions={<DownloadBtn onClick={() => {}} />}>
                <Leaderboard data={salesTopCampaigns} />
              </Panel>
              <Panel title="Revenue by Channel">
                <BarChartView data={salesTopChannels} currency height={240} />
              </Panel>
            </div>
          )}

          {active === "financial" && (
            <div className="space-y-4">
              <Panel title="Commission Payable by Rep">
                <DataTable
                  columns={[
                    { key: "rep", label: "Sales Rep" },
                    { key: "closed", label: "Closed Revenue", format: "currency" },
                    { key: "commission", label: "Commission", format: "currency" },
                  ] as Column[]}
                  rows={[
                    ["Ananya Rao", 214000, 10700],
                    ["Vikram Shetty", 178500, 8925],
                    ["Divya Menon", 142200, 7110],
                  ]}
                />
              </Panel>
              <Panel title="Customer Acquisition Cost Trend">
                <AreaChartView data={salesCategoryTrend.map((p) => ({ ...p, value: Math.round(p.value / 70) }))} currency />
              </Panel>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
