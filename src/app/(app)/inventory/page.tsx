"use client";

/* Inventory → Stock Summary (default Inventory page).
   Real-time overview of stock across locations. Every number is derived from
   the canonical Inventory Master + movements + billed invoice lines
   (lib/inventory-analytics.ts) — nothing is stored or hard-coded. Cost figures
   only render for users holding CAP.inventory.viewCost; everyone else sees
   Selling-price values. */

import { useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import {
  AlertTriangle, Boxes, Clock, IndianRupee, LayoutDashboard, PackageX, PlusCircle, Upload, Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Can } from "@/components/common/can";
import { CAP } from "@/lib/capabilities";
import { useStore } from "@/lib/store";
import { formatNumber } from "@/lib/utils";
import {
  InvKpi, InvPageHeader, ItemCell, Panel, StockStatusPill, useInventoryScope,
} from "@/components/inventory/inv-ui";
import { ExportMenu } from "@/components/inventory/export-menu";
import {
  availableStock, buildForecast, effectiveSellingPrice, movementSeries, stockByLocation, stockStatus, stockTotals,
  suggestedReorderQty,
} from "@/lib/inventory-analytics";
import { compactINR, exportStock } from "@/lib/inventory-export";

const PALETTE = ["#4361EE", "#10B981", "#06B6D4", "#F59E0B", "#A78BFA", "#94A3B8"];

export default function StockSummaryPage() {
  const router = useRouter();
  const { invoices, stockMovements } = useStore();
  const { stockItems, canViewCost } = useInventoryScope();

  const totals = useMemo(() => stockTotals(stockItems), [stockItems]);
  const useCost = canViewCost && totals.costValue !== undefined;
  const valueOf = (it: (typeof stockItems)[number]) => (useCost ? it.costPrice ?? 0 : effectiveSellingPrice(it));
  const stockValue = useCost ? (totals.costValue as number) : totals.sellValue;

  const forecast = useMemo(() => buildForecast(stockItems, invoices), [stockItems, invoices]);
  const fast = forecast.filter((r) => r.speed === "fast").length;
  const slow = forecast.filter((r) => (r.speed === "slow" || r.speed === "dead") && r.item.currentStock > 0).length;
  const hasDemandData = forecast.some((r) => r.sold90 > 0);

  const byLocation = useMemo(() => {
    const rows = stockByLocation(stockItems, valueOf);
    if (rows.length <= 5) return rows;
    const rest = rows.slice(4).reduce((a, r) => ({ name: "Others", skus: a.skus + r.skus, units: a.units + r.units, value: a.value + r.value }), { name: "Others", skus: 0, units: 0, value: 0 });
    return [...rows.slice(0, 4), rest];
  }, [stockItems, useCost]); // eslint-disable-line react-hooks/exhaustive-deps
  const locTotal = byLocation.reduce((s, r) => s + r.value, 0);

  const series = useMemo(() => movementSeries(stockMovements, 30), [stockMovements]);
  const seriesHasData = series.some((d) => d.Inward + d.Outward + d.Return > 0);

  const attention = useMemo(
    () => stockItems.filter((i) => stockStatus(i) !== "in").sort((a, b) => availableStock(a) - availableStock(b)),
    [stockItems]
  );

  return (
    <div className="space-y-5">
      <InvPageHeader
        icon={LayoutDashboard}
        title="Stock Summary"
        subtitle={`Real-time inventory overview${useCost ? "" : " · values shown at selling price"}`}
        actions={
          <>
            <Can permission={CAP.inventory.create}>
              <Link href="/inventory/add-item"><Button className="gap-2"><PlusCircle className="h-4 w-4" />Add Item</Button></Link>
              <Link href="/inventory/import-export"><Button variant="outline" className="gap-2"><Upload className="h-4 w-4" />Import</Button></Link>
            </Can>
            <ExportMenu onExport={(f) => exportStock(stockItems, canViewCost, f)} />
          </>
        }
      />

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <InvKpi label="Total Items" value={formatNumber(totals.skus)} hint={`${formatNumber(totals.units)} units on hand`} icon={Boxes} href="/inventory/stock-details" />
        <InvKpi
          label={useCost ? "Stock Value (Cost)" : "Stock Value"}
          value={compactINR(stockValue)}
          hint={useCost ? `${compactINR(totals.sellValue)} at selling price` : "At selling price"}
          icon={IndianRupee}
          tone="emerald"
        />
        <InvKpi label="Low Stock Items" value={totals.low} hint={totals.low ? "Needs reorder" : "All healthy"} hintTone={totals.low ? "danger" : "success"} icon={AlertTriangle} tone="amber" href="/inventory/low-stock" />
        <InvKpi label="Out of Stock" value={totals.out} hint={totals.out ? "Unavailable to sell" : "None"} hintTone={totals.out ? "danger" : "success"} icon={PackageX} tone="rose" href="/inventory/low-stock?status=out" />
        <InvKpi label="Fast Moving" value={hasDemandData ? fast : "—"} hint={hasDemandData ? "Top third by 30-day demand" : "Needs billed invoices"} icon={Zap} tone="violet" href="/inventory/forecast" />
        <InvKpi label="Slow Moving" value={hasDemandData ? slow : "—"} hint={hasDemandData ? "In stock, little demand" : "Needs billed invoices"} icon={Clock} tone="sky" href="/inventory/forecast" />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <Panel title="Stock Value by Location" className="xl:col-span-4">
          {locTotal === 0 ? (
            <EmptyHint text="Add items with stock to see how value spreads across locations." />
          ) : (
            <div className="flex flex-col items-center gap-4 sm:flex-row xl:flex-col 2xl:flex-row">
              <div className="relative h-[170px] w-[170px] shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={byLocation} dataKey="value" innerRadius={56} outerRadius={80} paddingAngle={2} stroke="none">
                      {byLocation.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
                  <div>
                    <p className="font-display text-lg font-extrabold leading-none">{compactINR(locTotal)}</p>
                    <p className="mt-1 text-[10.5px] text-muted-foreground">Total value</p>
                  </div>
                </div>
              </div>
              <ul className="w-full min-w-0 space-y-2">
                {byLocation.map((r, i) => (
                  <li key={r.name} className="flex items-center gap-2 text-[12.5px]">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: PALETTE[i % PALETTE.length] }} />
                    <span className="min-w-0 flex-1 truncate font-medium" title={r.name}>{r.name}</span>
                    <span className="tabular-nums text-muted-foreground">{Math.round((r.value / locTotal) * 100)}%</span>
                    <span className="w-16 text-right font-semibold tabular-nums">{compactINR(r.value)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Panel>

        <Panel title="Stock Movement" action={<span className="text-[11.5px] text-muted-foreground">Last 30 days · units</span>} className="xl:col-span-5">
          {!seriesHasData ? (
            <EmptyHint text="Inward, outward and return movements will chart here as stock moves." />
          ) : (
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={series} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="#E5E7EB" />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={4} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip cursor={{ fill: "rgba(67,97,238,0.06)" }} />
                  <Legend iconType="square" wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="Inward" name="Purchase / In" stackId="a" fill="#4361EE" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="Outward" name="Sales / Out" stackId="a" fill="#10B981" />
                  <Bar dataKey="Return" name="Return" stackId="a" fill="#06B6D4" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>

        <Panel
          title="Low Stock Alerts"
          className="xl:col-span-3"
          action={<Link href="/inventory/low-stock" className="text-[12px] font-semibold text-[#4361EE] hover:underline">View all</Link>}
        >
          {attention.length === 0 ? (
            <EmptyHint text="Nothing is running low. 🎉" />
          ) : (
            <ul className="space-y-3">
              {attention.slice(0, 4).map((it) => (
                <li key={it.id} className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold" title={it.name}>{it.name}</p>
                    <p className="text-[11.5px] text-muted-foreground">Available: {availableStock(it)} · Min: {it.minStock}</p>
                  </div>
                  <span className="w-24 shrink-0"><StockStatusPill status={stockStatus(it)} /></span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {/* Needs attention table — the full list lives in Stock Details */}
      <Panel
        title="Needs Attention"
        action={<Link href="/inventory/stock-details" className="text-[12px] font-semibold text-[#4361EE] hover:underline">Open Stock Details</Link>}
        bodyClassName="-mx-1 overflow-x-auto"
      >
        {attention.length === 0 ? (
          <EmptyHint text="All tracked items are above their minimum level." />
        ) : (
          <table className="w-full min-w-[720px] table-fixed text-[13px]">
            <thead>
              <tr className="bg-[#EEF1FD] text-left text-[10px] font-semibold uppercase tracking-wider text-[#4361EE]">
                <th className="w-[34%] px-3 py-2.5">Item</th>
                <th className="w-[16%] px-3 py-2.5">Location</th>
                <th className="w-[10%] px-3 py-2.5 text-right">Available</th>
                <th className="w-[10%] px-3 py-2.5 text-right">Min</th>
                <th className="w-[12%] px-3 py-2.5 text-right">Reorder</th>
                <th className="w-[18%] px-3 py-2.5">Status</th>
              </tr>
            </thead>
            <tbody>
              {attention.slice(0, 8).map((it) => (
                <tr key={it.id} onClick={() => router.push("/inventory/item-master")} className="cursor-pointer border-t border-border hover:bg-muted/40">
                  <td className="px-3 py-2.5"><ItemCell name={it.name} code={it.itemCode ?? it.id} sub={it.category} /></td>
                  <td className="truncate px-3 py-2.5 text-muted-foreground">{it.store || "—"}</td>
                  <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{availableStock(it)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{it.minStock}</td>
                  <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{suggestedReorderQty(it)}</td>
                  <td className="px-3 py-2.5"><StockStatusPill status={stockStatus(it)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  );
}

function EmptyHint({ text }: { text: string }) {
  return <div className="grid h-full min-h-[120px] place-items-center px-4 text-center text-[13px] text-muted-foreground">{text}</div>;
}
