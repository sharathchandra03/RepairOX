"use client";

/* Inventory → Stock Summary: the inventory command centre.
   Every figure is derived (lib/inventory-insights.ts) from the Item Master, billed invoices,
   movements and all inventory workflow documents. Nothing is stored or hard-coded.
   Cost figures render only for users with CAP.sensitive.viewCost. */

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import {
  AlertOctagon, AlertTriangle, ArrowRight, Boxes, CheckCircle2, Clock, HeartPulse, IndianRupee, Info, LayoutDashboard,
  PackageCheck, PlusCircle, Sparkles, Truck, Upload, Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { SegmentedTabs } from "@/components/ui/tabs";
import { Can } from "@/components/common/can";
import { CAP } from "@/lib/capabilities";
import { useStore } from "@/lib/store";
import { useInventoryOps } from "@/lib/inventory-ops-context";
import { cn, formatNumber } from "@/lib/utils";
import { InvKpi, InvPageHeader, ItemCell, Panel, StockStatusPill, useInventoryScope } from "@/components/inventory/inv-ui";
import { ExportMenu } from "@/components/inventory/export-menu";
import { availableStock, movementSeries, stockStatus } from "@/lib/inventory-analytics";
import { buildInventoryInsights, type Tone } from "@/lib/inventory-insights";
import { compactINR, exportStock } from "@/lib/inventory-export";

const PALETTE = ["#4361EE", "#10B981", "#06B6D4", "#F59E0B", "#A78BFA", "#94A3B8", "#F43F5E"];
const TONE_STYLE: Record<Tone, { bar: string; chip: string; Icon: typeof Info }> = {
  danger: { bar: "bg-rose-500", chip: "bg-rose-50 text-rose-600", Icon: AlertOctagon },
  warning: { bar: "bg-amber-500", chip: "bg-amber-50 text-amber-600", Icon: AlertTriangle },
  info: { bar: "bg-[#4361EE]", chip: "bg-[#EEF1FD] text-[#4361EE]", Icon: Info },
  success: { bar: "bg-emerald-500", chip: "bg-emerald-50 text-emerald-600", Icon: CheckCircle2 },
};

export default function StockSummaryPage() {
  const router = useRouter();
  const { invoices, stockMovements } = useStore();
  const { docs, serials, vendors } = useInventoryOps();
  const { stockItems, canViewCost } = useInventoryScope();
  const [movers, setMovers] = useState("fast");

  const d = useMemo(
    () => buildInventoryInsights({ items: stockItems, invoices, docs, serials, vendors, canCost: canViewCost }),
    [stockItems, invoices, docs, serials, vendors, canViewCost],
  );
  const series = useMemo(() => movementSeries(stockMovements, 30), [stockMovements]);
  const seriesHasData = series.some((x) => x.Inward + x.Outward + x.Return + x.Adjustment > 0);
  const locTotal = d.byLocation.reduce((n, r) => n + r.value, 0);
  const catMax = Math.max(...d.byCategory.map((r) => r.value), 1);
  const valueLabel = d.useCost ? "at cost" : "at selling price";
  const scoreTone = d.score >= 75 ? "emerald" : d.score >= 50 ? "amber" : "rose";
  const idlePct = d.stockValue > 0 ? Math.round((d.idleValue / d.stockValue) * 100) : 0;
  const abcTotal = d.abc.A.v + d.abc.B.v + d.abc.C.v || 1;
  const p = d.pipeline;

  return (
    <div className="space-y-5">
      <InvPageHeader
        icon={LayoutDashboard}
        title="Stock Summary"
        subtitle={`Inventory command centre${d.useCost ? "" : " · values at selling price"}`}
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

      {/* KPIs: value, items, then the signals that need decisions */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <InvKpi label={d.useCost ? "Stock Value (Cost)" : "Stock Value"} value={compactINR(d.stockValue)}
          hint={d.useCost ? `${compactINR(d.sellValue)} if sold at selling price` : "At selling price"} icon={IndianRupee} tone="emerald" />
        <InvKpi label="Items · SKUs" value={<>{formatNumber(d.itemCatalog.mainItems)}<span className="text-[15px] font-bold text-muted-foreground"> items</span></>}
          hint={`${formatNumber(d.itemCatalog.skus)} SKUs, ${formatNumber(d.units)} units on hand`} icon={Boxes} href="/inventory/item-master" />
        <InvKpi label="Inventory Health" value={stockItems.length ? `${d.score}%` : "—"}
          hint={stockItems.length ? `${d.healthy} of ${stockItems.length} SKUs are in stock, not overstocked and selling` : "No items yet"}
          hintTone={d.score >= 75 ? "success" : d.score < 50 ? "danger" : "muted"} icon={HeartPulse} tone={scoreTone} />
        <InvKpi label="Idle Capital" value={d.hasDemand ? compactINR(d.idleValue) : "—"}
          hint={d.hasDemand ? `${idlePct}% of stock value is in ${d.idle.length} SKUs with no sale in 90 days` : "Needs billed invoices"}
          hintTone={idlePct >= 20 ? "danger" : "muted"} icon={Clock} tone="sky" href="/inventory/forecast" />
        <InvKpi label="Stock-out Risk" value={d.hasDemand ? d.atRisk.length : "—"}
          hint={d.hasDemand ? (d.atRisk.length ? `${d.atRisk.length} SKUs will run out before a reorder arrives (${d.outWithDemand} already out)` : "Every selling SKU has enough cover") : "Needs billed invoices"}
          hintTone={d.atRisk.length ? "danger" : "success"} icon={AlertOctagon} tone="rose" href="/inventory/forecast" />
        <InvKpi label="On Order & In Transit" value={`${formatNumber(d.onOrderUnits + d.unitsInTransit)} units`}
          hint={`${d.openPOs} open PO${d.openPOs === 1 ? "" : "s"}${canViewCost && d.onOrderValue ? ` worth ${compactINR(d.onOrderValue)}` : ""}, ${p.transfersMoving} transfer${p.transfersMoving === 1 ? "" : "s"} moving`}
          icon={Truck} tone="violet" href="/inventory/purchase-orders" />
      </div>

      {/* Smart insights */}
      <Panel title="Smart Insights" action={<span className="inline-flex items-center gap-1 text-[11.5px] text-muted-foreground"><Sparkles className="h-3.5 w-3.5 text-[#4361EE]" />Auto-detected from your inventory</span>}>
        {d.insights.length === 0 ? (
          <div className="flex items-center gap-3 rounded-xl bg-emerald-50 px-4 py-3 text-[13px] font-medium text-emerald-700"><CheckCircle2 className="h-5 w-5" />Everything looks healthy. Nothing needs action right now.</div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {d.insights.slice(0, 6).map((i) => {
              const t = TONE_STYLE[i.tone];
              return (
                <Link key={i.id} href={i.href} className="group relative flex gap-3 overflow-hidden rounded-xl border border-border bg-background/60 p-3.5 pl-5 transition hover:border-[#4361EE]/40 hover:shadow-card">
                  <span className={cn("absolute inset-y-0 left-0 w-1", t.bar)} />
                  <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-lg", t.chip)}><t.Icon className="h-4 w-4" /></span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-semibold leading-snug">{i.title}</p>
                    <p className="mt-0.5 text-[12px] text-muted-foreground">{i.detail}</p>
                    <span className="mt-1.5 inline-flex items-center gap-1 text-[12px] font-semibold text-[#4361EE]">{i.cta}<ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" /></span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </Panel>

      {/* Main items and their SKUs */}
      <Panel title="Items & SKUs" action={<Link href="/inventory/part-grades" className="text-[12px] font-semibold text-[#4361EE] hover:underline">Manage variants</Link>}>
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
          <div className="grid grid-cols-2 gap-2.5 lg:col-span-5">
            <MiniStat label="Main items" value={formatNumber(d.itemCatalog.mainItems)} />
            <MiniStat label="Total SKUs" value={formatNumber(d.itemCatalog.skus)} />
            <MiniStat label="Items with variants" value={formatNumber(d.itemCatalog.families)} />
            <MiniStat label="SKUs not grouped" value={formatNumber(d.itemCatalog.ungrouped)} bad={d.itemCatalog.ungrouped > 0 && d.itemCatalog.families > 0} />
            <p className="col-span-2 text-[12px] leading-relaxed text-muted-foreground">A <b>main item</b> is one part (for example an iPhone 15 display). Each grade or quality of it (OEM, OLED, Incell…) is its own <b>SKU</b> with its own stock and price. SKUs that share a variant group count as one main item.</p>
          </div>
          <div className="lg:col-span-7">
            {d.itemCatalog.top.length === 0 ? (
              <EmptyHint text="No items have variants yet. Group SKUs that are the same part in different grades under Manage variants." />
            ) : (
              <table className="w-full table-fixed text-[13px]">
                <thead><tr className="bg-[#EEF1FD] text-left text-[10px] font-semibold uppercase tracking-wider text-[#4361EE]">
                  <th className="px-3 py-2.5">Main item</th><th className="w-[70px] px-3 py-2.5 text-right">SKUs</th><th className="w-[28%] px-3 py-2.5">Grades</th><th className="w-[70px] px-3 py-2.5 text-right">Units</th><th className="w-[90px] px-3 py-2.5 text-right">Value</th>
                </tr></thead>
                <tbody>
                  {d.itemCatalog.top.map((f) => (
                    <tr key={f.name} className="border-t border-border">
                      <td className="truncate px-3 py-2.5 font-medium" title={f.name}>{f.name}{f.out > 0 && <span className="ml-1.5 text-[10.5px] font-semibold text-rose-600">{f.out} out</span>}</td>
                      <td className="px-3 py-2.5 text-right font-bold tabular-nums">{f.skus}</td>
                      <td className="truncate px-3 py-2.5 text-muted-foreground" title={f.grades.join(", ")}>{f.grades.join(", ") || "—"}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{f.units}</td>
                      <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{compactINR(f.value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </Panel>

      {/* Where the money sits */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Panel title="Value by Location">
          {locTotal === 0 ? <EmptyHint text="Add items with stock to see how value spreads across stores." /> : (
            <div className="flex flex-col items-center gap-4 sm:flex-row xl:flex-col 2xl:flex-row">
              <div className="relative h-[160px] w-[160px] shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart><Pie data={d.byLocation} dataKey="value" innerRadius={52} outerRadius={76} paddingAngle={2} stroke="none">
                    {d.byLocation.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                  </Pie><Tooltip formatter={(v) => compactINR(Number(v))} /></PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 grid place-items-center text-center"><div>
                  <p className="font-display text-lg font-extrabold leading-none">{compactINR(locTotal)}</p>
                  <p className="mt-1 text-[10.5px] text-muted-foreground">{valueLabel}</p>
                </div></div>
              </div>
              <ul className="w-full min-w-0 space-y-2">
                {d.byLocation.map((r, i) => (
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

        <Panel title="Value by Category">
          {d.byCategory.length === 0 ? <EmptyHint text="Categories appear once items are added." /> : (
            <ul className="space-y-3">
              {d.byCategory.map((r, i) => (
                <li key={r.name}>
                  <div className="mb-1 flex items-center justify-between gap-2 text-[12.5px]">
                    <span className="truncate font-medium" title={r.name}>{r.name}</span>
                    <span className="shrink-0 tabular-nums"><b>{compactINR(r.value)}</b><span className="ml-1.5 text-muted-foreground">{r.skus} SKU{r.skus === 1 ? "" : "s"}</span></span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full transition-all" style={{ width: `${Math.max((r.value / catMax) * 100, 2)}%`, background: PALETTE[i % PALETTE.length] }} /></div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Stock Movement" action={<span className="text-[11.5px] text-muted-foreground">Last 30 days · units</span>}>
          {!seriesHasData ? <EmptyHint text="Inward, outward and transfer movements chart here as stock moves." /> : (
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={series} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="#E5E7EB" />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={4} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip cursor={{ fill: "rgba(67,97,238,0.06)" }} />
                  <Legend iconType="square" wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="Inward" name="In" stackId="a" fill="#4361EE" />
                  <Bar dataKey="Outward" name="Out" stackId="a" fill="#10B981" />
                  <Bar dataKey="Return" name="Return" stackId="a" fill="#06B6D4" />
                  <Bar dataKey="Adjustment" name="Adjust" stackId="a" fill="#F59E0B" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>
      </div>

      {/* Analysis */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Panel title="ABC Analysis" action={<span className="text-[11.5px] text-muted-foreground">By stock value</span>}>
          {stockItems.length === 0 || d.stockValue === 0 ? <EmptyHint text="Needs items with stock value." /> : (
            <div>
              <div className="flex h-3 overflow-hidden rounded-full">
                <div className="bg-[#4361EE]" style={{ width: `${(d.abc.A.v / abcTotal) * 100}%` }} />
                <div className="bg-[#06B6D4]" style={{ width: `${(d.abc.B.v / abcTotal) * 100}%` }} />
                <div className="bg-slate-300" style={{ width: `${(d.abc.C.v / abcTotal) * 100}%` }} />
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                {([["A", "bg-[#4361EE]", "Vital few"], ["B", "bg-[#06B6D4]", "Middle"], ["C", "bg-slate-300", "Long tail"]] as const).map(([k, c, hint]) => (
                  <div key={k} className="rounded-xl border border-border p-2.5">
                    <span className={cn("mx-auto grid h-6 w-6 place-items-center rounded-md text-[11px] font-bold text-white", c, k === "C" && "text-slate-700")}>{k}</span>
                    <p className="mt-1.5 text-[15px] font-extrabold tabular-nums">{d.abc[k].n}</p>
                    <p className="text-[10.5px] text-muted-foreground">{Math.round((d.abc[k].n / stockItems.length) * 100)}% of items</p>
                    <p className="text-[10.5px] font-semibold">{Math.round((d.abc[k].v / abcTotal) * 100)}% of value</p>
                    <p className="text-[10px] text-muted-foreground">{hint}</p>
                  </div>
                ))}
              </div>
              <p className="mb-1.5 mt-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Top A items, protect these</p>
              <ul className="space-y-1.5">
                {d.topA.map((r) => (
                  <li key={r.it.id} className="flex items-center justify-between gap-2 text-[12.5px]">
                    <span className="truncate" title={r.it.name}>{r.it.name}</span><span className="shrink-0 font-semibold tabular-nums">{compactINR(r.v)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Panel>

        <Panel title="Days of Cover" action={<span className="text-[11.5px] text-muted-foreground">SKUs by how long stock lasts</span>}>
          {!d.hasDemand ? <EmptyHint text="Cover is calculated from billed invoices. It appears once parts are sold." /> : (
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={d.coverBuckets} margin={{ top: 8, right: 4, left: -22, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="#E5E7EB" />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip cursor={{ fill: "rgba(67,97,238,0.06)" }} formatter={(v) => [`${v} SKUs`, "Items"]} />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]} onClick={() => router.push("/inventory/forecast")} className="cursor-pointer">
                    {d.coverBuckets.map((b) => <Cell key={b.key} fill={b.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>

        <Panel title="Movers" action={<SegmentedTabs size="sm" value={movers} onChange={setMovers} options={[{ label: `Fast (${d.fastCount})`, value: "fast" }, { label: `Slow (${d.slowCount})`, value: "slow" }]} />}>
          {!d.hasDemand ? <EmptyHint text="Fast and slow movers need billed invoices." /> : (movers === "fast" ? d.fastMovers : d.slowMovers).length === 0 ? <EmptyHint text="Nothing here." /> : (
            <ul className="space-y-3">
              {(movers === "fast" ? d.fastMovers : d.slowMovers).map((r) => (
                <li key={r.item.id} className="flex items-center gap-3">
                  <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-lg", movers === "fast" ? "bg-violet-50 text-violet-600" : "bg-sky-50 text-sky-600")}>{movers === "fast" ? <Zap className="h-4 w-4" /> : <Clock className="h-4 w-4" />}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold" title={r.item.name}>{r.item.name}</p>
                    <p className="text-[11.5px] text-muted-foreground">{movers === "fast" ? `${r.sold30} sold in 30 d · ${r.daysCover === null ? "no cover" : `${Math.round(r.daysCover)} d cover`}` : `${r.item.currentStock} on hand · ${r.sold90 === 0 ? "no sale in 90 d" : `${r.sold90} sold in 90 d`}`}</p>
                  </div>
                  {movers === "slow" && <span className="shrink-0 text-[12.5px] font-bold tabular-nums">{compactINR(Math.max(r.item.currentStock, 0) * d.valueOf(r.item))}</span>}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {/* Operations, losses, margin */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Panel title="Operations Pipeline" action={<span className="text-[11.5px] text-muted-foreground">Open work across inventory</span>}>
          <div className="grid grid-cols-2 gap-2.5">
            <Tile href="/inventory/purchase-orders" label="Open POs" value={p.openPOs} sub={p.latePOs ? `${p.latePOs} overdue` : "On schedule"} bad={p.latePOs > 0} />
            <Tile href="/inventory/receive-stock" label="GRN to post" value={p.grnDrafts} sub="Drafts" bad={p.grnDrafts > 0} />
            <Tile href="/inventory/stock-movement" label="Transfers" value={p.transfersRequested + p.transfersMoving} sub={`${p.transfersRequested} to send · ${p.transfersMoving} moving`} />
            <Tile href="/inventory/vendor-returns" label="Vendor returns" value={p.returnsOpen} sub="Awaiting credit" />
            <Tile href="/inventory/stock-count" label="Stock counts" value={p.countsPending + p.countsRunning} sub={`${p.countsPending} need approval`} bad={p.countsPending > 0} />
            <Tile href="/inventory/warranty-parts" label="Warranty claims" value={p.claimsOpen} sub="Open with vendor" />
            <Tile href="/inventory/old-parts" label="Old parts" value={p.oldPending} sub="Pending return" />
            <Tile href="/inventory/serials" label="At vendor (RMA)" value={p.serialsRma} sub="Serial units" />
          </div>
        </Panel>

        <Panel title="Loss & Damage" action={<span className="text-[11.5px] text-muted-foreground">Last 90 days</span>}>
          {d.losses.length === 0 ? <EmptyHint text="No write-offs in the last 90 days. 🎉" /> : (
            <div>
              <p className="mb-3 text-[13px]"><b className="text-[18px] font-extrabold tabular-nums">{d.lossUnits}</b> units written off{d.lossValue > 0 && <> · <b>{compactINR(d.lossValue)}</b> {valueLabel}</>}</p>
              <ul className="space-y-2.5">
                {d.losses.slice(0, 5).map((r) => (
                  <li key={r.reason}>
                    <div className="mb-1 flex items-center justify-between text-[12.5px]"><span className="truncate font-medium">{r.reason}</span><span className="tabular-nums text-muted-foreground">{r.units} units{d.lossValue > 0 ? ` · ${compactINR(r.value)}` : ""}</span></div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-rose-400" style={{ width: `${Math.max((r.units / (d.lossUnits || 1)) * 100, 4)}%` }} /></div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Panel>

        {d.margin ? (
          <Panel title="Price & Margin" action={<Link href="/inventory/price-control" className="text-[12px] font-semibold text-[#4361EE] hover:underline">Price list</Link>}>
            <div className="grid grid-cols-3 gap-2 text-center">
              <MiniStat label="Potential margin" value={compactINR(d.margin.potential)} />
              <MiniStat label="Avg margin" value={`${d.margin.avgPct.toFixed(0)}%`} />
              <MiniStat label="Thin / below cost" value={`${d.margin.thin} / ${d.margin.negative}`} bad={d.margin.negative > 0} />
            </div>
            <p className="mb-1.5 mt-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Lowest margins</p>
            <ul className="space-y-2">
              {d.margin.lowest.map((r) => (
                <li key={r.item.id} className="flex items-center justify-between gap-2 text-[12.5px]">
                  <span className="truncate" title={r.item.name}>{r.item.name}</span>
                  <span className={cn("shrink-0 font-bold tabular-nums", r.pct < 0 ? "text-rose-600" : r.pct < 15 ? "text-amber-600" : "text-emerald-600")}>{r.pct.toFixed(0)}%</span>
                </li>
              ))}
            </ul>
          </Panel>
        ) : (
          <Panel title="Top Vendors by Open Orders">
            {d.vendorSpend.length === 0 ? <EmptyHint text="Open purchase orders by vendor appear here." /> : (
              <ul className="space-y-3">{d.vendorSpend.map((v) => (
                <li key={v.name} className="flex items-center justify-between gap-2 text-[13px]"><span className="truncate font-medium">{v.name}</span><span className="shrink-0 text-muted-foreground">{v.pos} PO{v.pos === 1 ? "" : "s"}</span></li>
              ))}</ul>
            )}
          </Panel>
        )}
      </div>

      {/* Act now */}
      <Panel title="Reorder Now" action={<Link href="/inventory/forecast" className="text-[12px] font-semibold text-[#4361EE] hover:underline">Open forecast</Link>} bodyClassName="-mx-1 overflow-x-auto">
        {d.reorder.length === 0 ? <EmptyHint text="Every item has enough cover. Nothing to reorder." /> : (
          <table className="w-full min-w-[780px] table-fixed text-[13px]">
            <thead>
              <tr className="bg-[#EEF1FD] text-left text-[10px] font-semibold uppercase tracking-wider text-[#4361EE]">
                <th className="w-[32%] px-3 py-2.5">Item</th><th className="w-[16%] px-3 py-2.5">Location</th>
                <th className="w-[10%] px-3 py-2.5 text-right">Available</th><th className="w-[12%] px-3 py-2.5 text-right">Days of cover</th>
                <th className="w-[12%] px-3 py-2.5 text-right">Order qty</th><th className="w-[18%] px-3 py-2.5">Status</th>
              </tr>
            </thead>
            <tbody>
              {d.reorder.slice(0, 8).map(({ plan, qty }) => {
                const it = plan.row.item;
                return (
                  <tr key={it.id} onClick={() => router.push("/inventory/low-stock")} className="cursor-pointer border-t border-border hover:bg-muted/40">
                    <td className="px-3 py-2.5"><ItemCell name={it.name} code={it.itemCode ?? it.id} sub={it.category} /></td>
                    <td className="truncate px-3 py-2.5 text-muted-foreground">{it.store || "—"}</td>
                    <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{availableStock(it)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{plan.cover === null ? "—" : `${Math.round(plan.cover)} d`}</td>
                    <td className="px-3 py-2.5 text-right font-bold tabular-nums">{qty}</td>
                    <td className="px-3 py-2.5"><StockStatusPill status={stockStatus(it)} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Panel>
      <p className="flex items-center gap-1.5 pb-2 text-[11.5px] text-muted-foreground"><PackageCheck className="h-3.5 w-3.5" />Health = share of SKUs that are in stock, not above max level and not idle for 90 days. Cover uses 30-day sales and each vendor&apos;s lead time (7 days if unset).</p>
    </div>
  );
}

function Tile({ href, label, value, sub, bad }: { href: string; label: string; value: number; sub: string; bad?: boolean }) {
  return (
    <Link href={href} className="rounded-xl border border-border bg-background/60 p-3 transition hover:border-[#4361EE]/40 hover:shadow-card">
      <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
      <p className="font-display text-[22px] font-extrabold leading-tight tabular-nums">{value}</p>
      <p className={cn("truncate text-[11px]", bad ? "font-semibold text-rose-600" : "text-muted-foreground")}>{sub}</p>
    </Link>
  );
}
function MiniStat({ label, value, bad }: { label: string; value: ReactNode; bad?: boolean }) {
  return (
    <div className="rounded-xl border border-border p-2.5">
      <p className={cn("text-[16px] font-extrabold tabular-nums", bad && "text-rose-600")}>{value}</p>
      <p className="text-[10.5px] text-muted-foreground">{label}</p>
    </div>
  );
}
function EmptyHint({ text }: { text: string }) {
  return <div className="grid h-full min-h-[120px] place-items-center px-4 text-center text-[13px] text-muted-foreground">{text}</div>;
}
