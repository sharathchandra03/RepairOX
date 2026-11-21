"use client";

/* Inventory → Stock Forecast: demand-based projection from billed invoice lines
   (last 30 / 90 days). Shows how many days each SKU's available stock lasts at
   the current pace, speed bands (relative to this shop's own demand) and how
   many units to order to cover the chosen horizon + minimum buffer. */

import { useMemo, useState } from "react";
import { TrendingUp } from "lucide-react";
import { TableSearch } from "@/components/common/table-utility-bar";
import { InvTable, type InvColumn } from "@/components/inventory/inv-table";
import { InvKpi, InvPageHeader, ItemCell, StatusTabs, useInventoryScope } from "@/components/inventory/inv-ui";
import { ExportMenu } from "@/components/inventory/export-menu";
import { useStore } from "@/lib/store";
import { availableStock, buildForecast, type ForecastRow } from "@/lib/inventory-analytics";
import { downloadCSV, downloadXLSX, toCSV } from "@/lib/csv-utils";
import { cn } from "@/lib/utils";
import { Zap, Clock, AlertTriangle, PackageX } from "lucide-react";

type Speed = "all" | ForecastRow["speed"];
const HORIZONS = [{ value: "15", label: "15 days" }, { value: "30", label: "30 days" }, { value: "60", label: "60 days" }];

const SPEED_STYLE: Record<ForecastRow["speed"], string> = {
  fast: "bg-violet-50 text-violet-700 ring-violet-200",
  medium: "bg-sky-50 text-sky-700 ring-sky-200",
  slow: "bg-amber-50 text-amber-700 ring-amber-200",
  dead: "bg-zinc-100 text-zinc-600 ring-zinc-200",
};
const SPEED_LABEL: Record<ForecastRow["speed"], string> = { fast: "Fast", medium: "Medium", slow: "Slow", dead: "No demand" };

export default function ForecastPage() {
  const { invoices } = useStore();
  const { stockItems } = useInventoryScope();
  const [horizon, setHorizon] = useState("30");
  const [speed, setSpeed] = useState<Speed>("all");
  const [query, setQuery] = useState("");

  const all = useMemo(() => buildForecast(stockItems, invoices, Number(horizon)), [stockItems, invoices, horizon]);
  const hasDemand = all.some((r) => r.sold90 > 0);
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all
      .filter((r) => (speed === "all" || r.speed === speed) && (!q || `${r.item.name} ${r.item.id} ${r.item.itemCode ?? ""} ${r.item.category}`.toLowerCase().includes(q)))
      .sort((a, b) => (a.daysCover ?? Infinity) - (b.daysCover ?? Infinity));
  }, [all, speed, query]);

  const runOut = all.filter((r) => r.daysCover !== null && r.daysCover <= 7).length;
  const toOrder = all.filter((r) => r.orderQty > 0).length;
  const dead = all.filter((r) => r.speed === "dead" && r.item.currentStock > 0).length;

  async function exportForecast(format: "xlsx" | "csv") {
    const headers = ["SKU", "Item", "Category", "Available", "Sold (30d)", "Sold (90d)", "Per day", "Days of cover", `Order for ${horizon}d`, "Speed"];
    const data = rows.map((r) => [r.item.id, r.item.name, r.item.category, availableStock(r.item), r.sold30, r.sold90, Number(r.perDay.toFixed(2)), r.daysCover === null ? "" : Math.round(r.daysCover), r.orderQty, SPEED_LABEL[r.speed]]);
    if (format === "xlsx") await downloadXLSX("repairox-stock-forecast", headers, data, "Forecast");
    else downloadCSV("repairox-stock-forecast.csv", toCSV(headers, data));
  }

  const columns: InvColumn<ForecastRow>[] = [
    { key: "item", grow: true, header: "Item", render: (r) => <ItemCell name={r.item.name} code={r.item.itemCode ?? r.item.id} sub={r.item.category} /> },
    { key: "avail", header: "Available", align: "right", render: (r) => <span className="font-semibold tabular-nums">{availableStock(r.item)}</span> },
    { key: "s30", header: "Sold 30d", align: "right", render: (r) => <span className="tabular-nums">{r.sold30}</span> },
    { key: "s90", header: "Sold 90d", align: "right", render: (r) => <span className="tabular-nums text-muted-foreground">{r.sold90}</span> },
    { key: "pd", header: "Per Day", align: "right", render: (r) => <span className="tabular-nums text-muted-foreground">{r.perDay ? r.perDay.toFixed(1) : "—"}</span> },
    {
      key: "cover", header: "Days of Cover", align: "right",
      render: (r) => r.daysCover === null
        ? <span className="text-muted-foreground">—</span>
        : <span className={cn("font-bold tabular-nums", r.daysCover <= 7 ? "text-rose-600" : r.daysCover <= 15 ? "text-amber-600" : "text-foreground")}>{Math.round(r.daysCover)} d</span>,
    },
    { key: "order", header: `Order (${horizon}d)`, align: "right", render: (r) => <span className={cn("tabular-nums", r.orderQty > 0 ? "font-bold" : "text-muted-foreground")}>{r.orderQty || "—"}</span> },
    {
      key: "speed", min: 110, header: "Movement", render: (r) => <span className={cn("flex h-7 w-full items-center justify-center rounded-full px-2.5 text-[11px] font-semibold ring-1 ring-inset", SPEED_STYLE[r.speed])}>{SPEED_LABEL[r.speed]}</span>,
    },
  ];

  return (
    <div className="rox-lock-root space-y-4">
      <InvPageHeader
        icon={TrendingUp}
        title="Stock Forecast"
        subtitle="Projected from billed invoice lines — how long stock lasts and what to reorder"
        actions={<ExportMenu onExport={exportForecast} />}
      />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <InvKpi label="Run out within 7 days" value={hasDemand ? runOut : "—"} icon={PackageX} tone="rose" hint={hasDemand ? "At the current pace" : "Needs billed invoices"} hintTone={runOut ? "danger" : "muted"} />
        <InvKpi label="Need reorder" value={hasDemand ? toOrder : "—"} icon={AlertTriangle} tone="amber" hint={`To cover ${horizon} days + min buffer`} />
        <InvKpi label="Fast movers" value={hasDemand ? all.filter((r) => r.speed === "fast").length : "—"} icon={Zap} tone="violet" hint="Top third by demand" />
        <InvKpi label="Stuck stock" value={hasDemand ? dead : "—"} icon={Clock} tone="sky" hint="In stock, no sale in 90 days" />
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <StatusTabs
            value={speed}
            onChange={setSpeed}
            options={[{ value: "all", label: "All" }, { value: "fast", label: "Fast" }, { value: "medium", label: "Medium" }, { value: "slow", label: "Slow" }, { value: "dead", label: "No demand" }]}
          />
          <StatusTabs value={horizon} onChange={setHorizon} options={HORIZONS} />
        </div>
        <TableSearch
          value={query}
          onChange={setQuery}
          placeholder="Search forecast by item, SKU or category…"
          animatedPrefix="Search by "
          animatedWords={["item name", "SKU", "category"]}
          className="w-full sm:w-64"
        />
      </div>

      <InvTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.item.id}
        resetKey={`${speed}|${horizon}|${query}`}
        emptyTitle="No forecast rows"
        emptyHint="Forecast uses billed invoice lines that carry an inventory SKU."
        itemLabel="item"
      />
    </div>
  );
}
