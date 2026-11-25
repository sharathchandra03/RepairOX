"use client";
/* Inventory → Stock Forecast: demand-based planning from billed invoice lines.
   Per part: average daily sales → forecast demand → days of cover → supplier lead
   time → expected stock-out date → suggested reorder → Urgent / Soon / Healthy.
   Maths lives in lib/inventory-analytics.ts (planForecast). */
import { useMemo, useState } from "react";
import { TrendingUp, PackageX, AlarmClock, ShieldCheck, ShoppingCart, Info, CalendarClock, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Can } from "@/components/common/can";
import { CAP } from "@/lib/capabilities";
import { RoxCenteredForm } from "@/components/ui/rox-centered-form";
import { TableSearch } from "@/components/common/table-utility-bar";
import { InvTable, type InvColumn } from "@/components/inventory/inv-table";
import { InvKpi, InvPageHeader, ItemCell, StatusTabs, useInventoryScope } from "@/components/inventory/inv-ui";
import { ExportMenu } from "@/components/inventory/export-menu";
import { LowStockPoDialog } from "@/components/inventory/low-stock-po-dialog";
import { ToneChip } from "@/components/inventory/doc-ui";
import { useStore } from "@/lib/store";
import { useInventoryOps } from "@/lib/inventory-ops-context";
import { availableStock, buildForecast, planForecast, type ForecastPlan, type ForecastStatus } from "@/lib/inventory-analytics";
import { downloadCSV, downloadXLSX, toCSV } from "@/lib/csv-utils";
import type { InventoryItem } from "@/lib/inventory-data";
import type { Tone } from "@/lib/inventory-ops";
import { cn } from "@/lib/utils";

type Filter = "all" | ForecastStatus;
const HORIZONS = [{ value: "15", label: "15 days" }, { value: "30", label: "30 days" }, { value: "60", label: "60 days" }, { value: "90", label: "90 days" }];
const BASIS = [{ value: "30", label: "Sales: last 30d" }, { value: "90", label: "Sales: last 90d" }];
const STATUS_META: Record<ForecastStatus, { label: string; tone: Tone; rank: number }> = {
  urgent: { label: "Urgent", tone: "danger", rank: 0 },
  soon: { label: "Soon", tone: "warning", rank: 1 },
  healthy: { label: "Healthy", tone: "success", rank: 2 },
  none: { label: "No demand", tone: "neutral", rank: 3 },
};
const fmtDay = (d: Date | null) => (d ? d.toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "—");
const fmtFull = (d: Date | null) => (d ? d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—");
const rate = (n: number) => (n > 0 ? (n < 10 ? n.toFixed(1) : Math.round(n).toString()) : "—");
const days = (n: number | null) => (n === null ? "—" : `${Math.round(n)} d`);

function Tile({ label, value, sub, tone }: { label: string; value: React.ReactNode; sub?: string; tone?: "danger" | "warning" }) {
  return (
    <div className="rounded-xl border border-border bg-muted/20 p-3.5">
      <p className="text-[11.5px] font-semibold text-muted-foreground">{label}</p>
      <p className={cn("font-display mt-1 text-[1.35rem] font-extrabold leading-none tabular-nums", tone === "danger" && "text-rose-600", tone === "warning" && "text-amber-600")}>{value}</p>
      {sub && <p className="mt-1.5 text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

export default function ForecastPage() {
  const { invoices } = useStore();
  const { stockItems, canViewCost } = useInventoryScope();
  const { vendors } = useInventoryOps();
  const [horizon, setHorizon] = useState("30");
  const [basis, setBasis] = useState<"30" | "90">("30");
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [detail, setDetail] = useState<ForecastPlan | null>(null);
  const [orderItems, setOrderItems] = useState<InventoryItem[] | null>(null);

  const leadByVendor = useMemo(() => new Map(vendors.map((v) => [v.name, v.leadTimeDays])), [vendors]);
  const base = useMemo(() => buildForecast(stockItems, invoices, Number(horizon)), [stockItems, invoices, horizon]);
  const plans = useMemo(
    () => base.map((r) => planForecast(r, { horizon: Number(horizon), basis: Number(basis) as 30 | 90, leadDays: r.item.vendor ? leadByVendor.get(r.item.vendor) ?? undefined : undefined })),
    [base, horizon, basis, leadByVendor],
  );
  const qtyMap = useMemo(() => new Map(plans.map((p) => [p.row.item.id, p.suggested])), [plans]);
  const hasDemand = plans.some((p) => p.status !== "none");
  const count = (s: ForecastStatus) => plans.filter((p) => p.status === s).length;

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return plans
      .filter((p) => (filter === "all" || p.status === filter) && (!q || `${p.row.item.name} ${p.row.item.id} ${p.row.item.itemCode ?? ""} ${p.row.item.category} ${p.row.item.vendor ?? ""}`.toLowerCase().includes(q)))
      .sort((a, b) => STATUS_META[a.status].rank - STATUS_META[b.status].rank || (a.buffer ?? Infinity) - (b.buffer ?? Infinity));
  }, [plans, filter, query]);

  const reorderUnits = plans.filter((p) => p.status === "urgent" || p.status === "soon").reduce((n, p) => n + p.suggested, 0);
  const urgentItems = () => plans.filter((p) => (p.status === "urgent" || p.status === "soon") && p.suggested > 0).map((p) => p.row.item);

  async function exportForecast(format: "xlsx" | "csv") {
    const headers = ["SKU", "Part", "Category", "Available", "Avg daily sales", `Forecast demand (${horizon}d)`, "Days of cover", "Supplier lead time (d)", "Expected stock-out", "Order by", "Suggested reorder", "Status"];
    const data = rows.map((p) => [p.row.item.id, p.row.item.name, p.row.item.category, availableStock(p.row.item), Number(p.perDay.toFixed(2)), p.demand, p.cover === null ? "" : Math.round(p.cover), p.leadDays, fmtFull(p.stockOutDate), fmtFull(p.orderByDate), p.suggested, STATUS_META[p.status].label]);
    if (format === "xlsx") await downloadXLSX("repairox-stock-forecast", headers, data, "Forecast");
    else downloadCSV("repairox-stock-forecast.csv", toCSV(headers, data));
  }

  const columns: InvColumn<ForecastPlan>[] = [
    { key: "item", pct: 22, header: "Part / SKU", render: (p) => <ItemCell name={p.row.item.name} code={p.row.item.itemCode ?? p.row.item.id} sub={p.row.item.category} /> },
    { key: "avail", pct: 7, header: "Available", align: "right", render: (p) => <span className="font-bold tabular-nums">{availableStock(p.row.item)}</span> },
    { key: "daily", pct: 8, header: "Avg Daily Sales", align: "right", render: (p) => <span className="tabular-nums text-muted-foreground">{rate(p.perDay)}</span> },
    { key: "demand", pct: 9, header: `Demand (${horizon}d)`, align: "right", render: (p) => <span className="tabular-nums">{p.perDay > 0 ? `${p.demand} units` : "—"}</span> },
    {
      key: "cover", pct: 10, header: "Days of Cover", align: "right",
      render: (p) => p.cover === null
        ? <span className="text-muted-foreground">—</span>
        : <span className={cn("font-bold tabular-nums", p.status === "urgent" ? "text-rose-600" : p.status === "soon" ? "text-amber-600" : "text-foreground")}>{days(p.cover)}</span>,
    },
    {
      key: "lead", pct: 8, header: "Lead Time", align: "right",
      render: (p) => <span className="tabular-nums text-muted-foreground" title={p.leadAssumed ? "Assumed 7 days: set a lead time on the vendor" : "From vendor"}>{p.leadDays} d{p.leadAssumed && <span className="text-amber-500">*</span>}</span>,
    },
    {
      key: "out", pct: 12, header: "Expected Stock-out", align: "right",
      render: (p) => p.stockOutDate === null
        ? <span className="text-muted-foreground">—</span>
        : (
          <div className="leading-tight">
            <p className={cn("font-semibold tabular-nums", p.status === "urgent" && "text-rose-600")}>{(p.cover ?? 0) < 1 ? "Now" : fmtDay(p.stockOutDate)}</p>
            <p className="text-[11px] text-muted-foreground">{p.status === "urgent" ? "Order was due" : `Order by ${fmtDay(p.orderByDate)}`}</p>
          </div>
        ),
    },
    { key: "sugg", pct: 9, header: "Suggested Reorder", align: "right", render: (p) => <span className={cn("tabular-nums", p.suggested > 0 ? "font-bold" : "text-muted-foreground")}>{p.suggested || "—"}</span> },
    { key: "status", pct: 10, header: "Status", align: "center", render: (p) => <ToneChip tone={STATUS_META[p.status].tone} label={STATUS_META[p.status].label} /> },
    { key: "act", pct: 7, header: "Details", align: "center", render: (p) => <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); setDetail(p); }}>View</Button> },
  ];

  return (
    <div className="rox-lock-root space-y-4">
      <InvPageHeader
        icon={TrendingUp}
        title="Stock Forecast"
        subtitle="Demand prediction · stock cover · reorder planning from billed invoices"
        actions={
          <>
            <Can permission={CAP.inventory.purchase}>
              <Button className="gap-2" disabled={urgentItems().length === 0} onClick={() => setOrderItems(urgentItems())}>
                <ShoppingCart className="h-4 w-4" />Order urgent &amp; soon ({urgentItems().length})
              </Button>
            </Can>
            <ExportMenu onExport={exportForecast} />
          </>
        }
      />
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <InvKpi label="Urgent" value={hasDemand ? count("urgent") : "—"} icon={PackageX} tone="rose" hint={hasDemand ? "Stock ends before a new order can arrive" : "Needs billed invoices"} hintTone={count("urgent") ? "danger" : "muted"} />
        <InvKpi label="Reorder soon" value={hasDemand ? count("soon") : "—"} icon={AlarmClock} tone="amber" hint={`Within ${7} days of the order deadline`} />
        <InvKpi label="Healthy" value={hasDemand ? count("healthy") : "—"} icon={ShieldCheck} tone="emerald" hint="Enough cover beyond lead time" hintTone={count("healthy") ? "success" : "muted"} />
        <InvKpi label={`Units to reorder (${horizon}d)`} value={hasDemand ? reorderUnits : "—"} icon={ShoppingCart} tone="brand" hint="Urgent + soon items" />
      </div>
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <StatusTabs
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: `All (${plans.length})` },
              { value: "urgent", label: `Urgent (${count("urgent")})` },
              { value: "soon", label: `Soon (${count("soon")})` },
              { value: "healthy", label: `Healthy (${count("healthy")})` },
              { value: "none", label: `No demand (${count("none")})` },
            ]}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusTabs value={basis} onChange={(v) => setBasis(v === "90" ? "90" : "30")} options={BASIS} />
          <StatusTabs value={horizon} onChange={setHorizon} options={HORIZONS} />
          <TableSearch
            value={query}
            onChange={setQuery}
            placeholder="Search forecast by part, SKU, category or vendor…"
            animatedPrefix="Search by "
            animatedWords={["part name", "SKU", "category", "vendor"]}
            className="w-full sm:w-64"
          />
        </div>
      </div>
      <InvTable
        fill
        minWidth={1480}
        columns={columns}
        rows={rows}
        rowKey={(p) => p.row.item.id}
        onRowClick={(p) => setDetail(p)}
        resetKey={`${filter}|${horizon}|${basis}|${query}`}
        emptyTitle="No forecast rows"
        emptyHint="Forecast uses billed invoice lines that carry an inventory SKU."
        itemLabel="part"
      />

      {/* Forecast details */}
      <RoxCenteredForm
        open={detail !== null}
        onClose={() => setDetail(null)}
        title={detail ? `Forecast · ${detail.row.item.name}` : "Forecast"}
        subtitle={detail ? `${detail.row.item.itemCode ?? detail.row.item.id} · ${detail.row.item.category}` : undefined}
        icon={TrendingUp}
        width="max-w-2xl"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDetail(null)}>Close</Button>
            {detail && detail.suggested > 0 && (
              <Can permission={CAP.inventory.purchase}>
                <Button className="gap-2" onClick={() => { setOrderItems([detail.row.item]); setDetail(null); }}><ShoppingCart className="h-4 w-4" />Reorder {detail.suggested} units</Button>
              </Can>
            )}
          </div>
        }
      >
        {detail && (() => {
          const p = detail;
          const sold = basis === "30" ? p.row.sold30 : p.row.sold90;
          const avail = availableStock(p.row.item);
          return (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div className="w-32"><ToneChip tone={STATUS_META[p.status].tone} label={STATUS_META[p.status].label} /></div>
                <p className="text-[12.5px] text-muted-foreground">Vendor: <b className="text-foreground">{p.row.item.vendor || "Not set"}</b></p>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Tile label="Available stock" value={avail} />
                <Tile label="Avg daily sales" value={rate(p.perDay)} sub={`${sold} sold in ${basis} days`} />
                <Tile label="Days of cover" value={days(p.cover)} tone={p.status === "urgent" ? "danger" : p.status === "soon" ? "warning" : undefined} />
                <Tile label="Supplier lead time" value={`${p.leadDays} days`} sub={p.leadAssumed ? "Assumed. Set it on the vendor" : p.row.item.vendor} />
              </div>
              {p.cover !== null && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="flex items-start gap-3 rounded-xl border border-border p-3.5">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-rose-50 text-rose-600"><CalendarClock className="h-4 w-4" /></span>
                    <div><p className="text-[11.5px] font-semibold text-muted-foreground">Expected stock-out</p><p className="text-[15px] font-bold">{(p.cover ?? 0) < 1 ? "Now" : fmtFull(p.stockOutDate)}</p></div>
                  </div>
                  <div className="flex items-start gap-3 rounded-xl border border-border p-3.5">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#EEF1FD] text-[#4361EE]"><Truck className="h-4 w-4" /></span>
                    <div>
                      <p className="text-[11.5px] font-semibold text-muted-foreground">Order by</p>
                      <p className="text-[15px] font-bold">{p.status === "urgent" ? "Overdue, order today" : fmtFull(p.orderByDate)}</p>
                      <p className="text-[11.5px] text-muted-foreground">{p.buffer !== null && p.buffer > 0 ? `${Math.round(p.buffer)} days buffer before the reorder deadline` : "No buffer left"}</p>
                    </div>
                  </div>
                </div>
              )}
              <dl className="divide-y divide-border rounded-xl border border-border text-[13px]">
                <div className="flex justify-between px-4 py-2.5"><dt className="text-muted-foreground">Forecast demand · {horizon} days</dt><dd className="font-bold tabular-nums">{p.demand} units</dd></div>
                <div className="flex justify-between px-4 py-2.5"><dt className="text-muted-foreground">Forecast shortage</dt><dd className="font-bold tabular-nums">{Math.max(p.demand - avail, 0)} units</dd></div>
                <div className="flex justify-between px-4 py-2.5"><dt className="text-muted-foreground">Minimum stock buffer</dt><dd className="font-bold tabular-nums">{p.row.item.minStock ?? 0} units</dd></div>
                <div className="flex justify-between px-4 py-2.5"><dt className="text-muted-foreground">Suggested reorder</dt><dd className="font-bold tabular-nums">{p.suggested} units</dd></div>
              </dl>
              <div className="flex items-start gap-2 rounded-xl bg-[#EEF1FD] px-3.5 py-3 text-[12.5px] text-[#3B4FC4]">
                <Info className="mt-0.5 h-4 w-4 shrink-0" />
                <p>
                  {p.perDay > 0
                    ? <>Daily sales = {sold} ÷ {basis} = <b>{rate(p.perDay)}</b>. Cover = {avail} ÷ {rate(p.perDay)} = <b>{days(p.cover)}</b>. With a {p.leadDays}-day lead time you have about <b>{Math.max(Math.round(p.buffer ?? 0), 0)} days</b> before you must order. Suggested = demand {p.demand} + minimum {p.row.item.minStock ?? 0} − available {avail}.</>
                    : <>No units of this part were sold in the last {basis} days, so there is nothing to forecast.</>}
                </p>
              </div>
            </div>
          );
        })()}
      </RoxCenteredForm>

      <LowStockPoDialog
        open={orderItems !== null}
        items={orderItems ?? []}
        canViewCost={canViewCost}
        qtyFor={(i) => qtyMap.get(i.id) ?? 0}
        onClose={() => setOrderItems(null)}
      />
    </div>
  );
}
