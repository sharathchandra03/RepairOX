"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Reporting · Comparison Engine
   Compare any two periods, or any two entities (technician, employee, branch,
   brand, device, payment mode, invoice type, service type). Every figure is
   computed live from the filtered dataset.
   ────────────────────────────────────────────────────────────────────────── */

import { useMemo, useState } from "react";
import { ArrowRight } from "lucide-react";
import { SegmentedTabs } from "@/components/ui/tabs";
import { RSelect } from "@/components/ui/rselect";
import { cn, formatINR, formatNumber } from "@/lib/utils";
import { Panel } from "./report-ui";
import { applyFilters, rangeFromFilters } from "@/lib/reports/filters";
import { resolveDateRange, DATE_PRESETS } from "@/lib/reports/date-ranges";
import type {
  ReportDataset, ReportFilters, FilterOptionSet, DatePresetId, KpiFormat,
} from "@/lib/reports/types";

const LIVE = (s: string) => s !== "cancelled" && s !== "draft";

interface SummaryMetrics {
  billed: number;
  collected: number;
  tickets: number;
  invoices: number;
  avgInvoice: number;
  gst: number;
  expenses: number;
}

function summarize(d: ReportDataset): SummaryMetrics {
  const live = d.invoices.filter((i) => LIVE(i.status));
  const billed = live.reduce((s, i) => s + (i.total || 0), 0);
  return {
    billed,
    collected: live.reduce((s, i) => s + (i.paidAmount || 0), 0),
    tickets: d.tickets.length,
    invoices: live.length,
    avgInvoice: live.length ? billed / live.length : 0,
    gst: live.reduce((s, i) => s + (i.tax || 0), 0),
    expenses: d.expenses.reduce((s, e) => s + (e.amount || 0), 0),
  };
}

const METRIC_ROWS: { key: keyof SummaryMetrics; label: string; format: KpiFormat }[] = [
  { key: "billed", label: "Revenue (Billed)", format: "currency" },
  { key: "collected", label: "Collected", format: "currency" },
  { key: "tickets", label: "Tickets", format: "number" },
  { key: "invoices", label: "Invoices", format: "number" },
  { key: "avgInvoice", label: "Avg Invoice Value", format: "currency" },
  { key: "gst", label: "GST", format: "currency" },
  { key: "expenses", label: "Expenses", format: "currency" },
];

const DIMENSIONS = [
  { key: "technician", label: "Technician" },
  { key: "employee", label: "Employee" },
  { key: "branch", label: "Branch" },
  { key: "brand", label: "Brand" },
  { key: "deviceCategory", label: "Device Category" },
  { key: "paymentMode", label: "Payment Mode" },
  { key: "invoiceType", label: "Invoice Type" },
  { key: "serviceType", label: "Service Type" },
] as const;

function optionsForDim(dim: string, o: FilterOptionSet) {
  switch (dim) {
    case "technician": return o.technicians;
    case "employee": return o.employees;
    case "branch": return o.branches;
    case "brand": return o.brands;
    case "deviceCategory": return o.deviceCategories;
    case "paymentMode": return o.paymentModes;
    case "invoiceType": return o.invoiceTypes;
    case "serviceType": return o.serviceTypes;
    default: return [];
  }
}

export function ComparisonEngine({
  data,
  filters,
  options,
}: {
  data: ReportDataset;
  filters: ReportFilters;
  options: FilterOptionSet;
}) {
  const [mode, setMode] = useState<"period" | "entity">("period");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-[14px] font-semibold">Comparison Engine</h3>
          <p className="text-[12px] text-muted-foreground">Put any two periods or entities side by side.</p>
        </div>
        <SegmentedTabs
          size="sm"
          value={mode}
          onChange={(v) => setMode(v as "period" | "entity")}
          options={[{ label: "Period vs Period", value: "period" }, { label: "Entity vs Entity", value: "entity" }]}
        />
      </div>

      {mode === "period" ? (
        <PeriodComparison data={data} filters={filters} />
      ) : (
        <EntityComparison data={data} filters={filters} options={options} />
      )}
    </div>
  );
}

/* ─── Period vs Period ──────────────────────────────────────────────────── */

function PeriodComparison({ data, filters }: { data: ReportDataset; filters: ReportFilters }) {
  const [a, setA] = useState<DatePresetId>("this_month");
  const [b, setB] = useState<DatePresetId>("last_month");

  const presetOpts = DATE_PRESETS.filter((p) => p.id !== "custom").map((p) => ({ label: p.label, value: p.id }));

  const { mA, mB, labelA, labelB } = useMemo(() => {
    const rA = resolveDateRange(a);
    const rB = resolveDateRange(b);
    const dA = applyFilters(data, { ...filters, preset: a }, rA);
    const dB = applyFilters(data, { ...filters, preset: b }, rB);
    return { mA: summarize(dA), mB: summarize(dB), labelA: rA.label, labelB: rB.label };
  }, [a, b, data, filters]);

  return (
    <Panel title="Period Comparison" subtitle="Metrics computed for each selected period">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <RSelect value={a} onChange={(v) => setA(v as DatePresetId)} options={presetOpts} menuWidth="w-52" className="max-w-[200px]" />
        <ArrowRight className="h-4 w-4 text-muted-foreground" />
        <RSelect value={b} onChange={(v) => setB(v as DatePresetId)} options={presetOpts} menuWidth="w-52" className="max-w-[200px]" />
      </div>
      <ComparisonTable rows={METRIC_ROWS} mA={mA} mB={mB} labelA={labelA} labelB={labelB} />
    </Panel>
  );
}

/* ─── Entity vs Entity ──────────────────────────────────────────────────── */

function EntityComparison({
  data,
  filters,
  options,
}: {
  data: ReportDataset;
  filters: ReportFilters;
  options: FilterOptionSet;
}) {
  const [dim, setDim] = useState<string>("technician");
  const opts = optionsForDim(dim, options);
  const [a, setA] = useState<string>(opts[0]?.value ?? "");
  const [b, setB] = useState<string>(opts[1]?.value ?? "");

  const range = rangeFromFilters(filters);

  const { mA, mB } = useMemo(() => {
    const dA = applyFilters(data, { ...filters, [dim]: a } as ReportFilters, range);
    const dB = applyFilters(data, { ...filters, [dim]: b } as ReportFilters, range);
    return { mA: summarize(dA), mB: summarize(dB) };
  }, [dim, a, b, data, filters, range]);

  const dimOpts = DIMENSIONS.map((d) => ({ label: d.label, value: d.key }));

  return (
    <Panel title="Entity Comparison" subtitle={`Within ${range.label.toLowerCase()}`}>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Compare by</span>
        <RSelect
          value={dim}
          onChange={(v) => {
            setDim(v);
            const o = optionsForDim(v, options);
            setA(o[0]?.value ?? "");
            setB(o[1]?.value ?? "");
          }}
          options={dimOpts}
          menuWidth="w-52"
          className="max-w-[190px]"
        />
        <RSelect value={a} onChange={setA} searchable options={opts} menuWidth="w-56" className="max-w-[200px]" />
        <ArrowRight className="h-4 w-4 text-muted-foreground" />
        <RSelect value={b} onChange={setB} searchable options={opts} menuWidth="w-56" className="max-w-[200px]" />
      </div>
      {opts.length < 2 ? (
        <p className="py-6 text-center text-[12px] text-muted-foreground">Not enough distinct values to compare on this dimension.</p>
      ) : (
        <ComparisonTable rows={METRIC_ROWS} mA={mA} mB={mB} labelA={a || "A"} labelB={b || "B"} />
      )}
    </Panel>
  );
}

/* ─── Comparison table with dual bars ───────────────────────────────────── */

function fmt(v: number, f: KpiFormat) {
  return f === "currency" ? formatINR(Math.round(v)) : formatNumber(Math.round(v));
}

function ComparisonTable({
  rows,
  mA,
  mB,
  labelA,
  labelB,
}: {
  rows: { key: keyof SummaryMetrics; label: string; format: KpiFormat }[];
  mA: SummaryMetrics;
  mB: SummaryMetrics;
  labelA: string;
  labelB: string;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end gap-6 pr-1 text-[11px] font-semibold">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[#4361EE]" /> {labelA}</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-violet-400" /> {labelB}</span>
      </div>
      {rows.map((r) => {
        const av = mA[r.key];
        const bv = mB[r.key];
        const max = Math.max(1, av, bv);
        const delta = bv === 0 ? (av === 0 ? 0 : null) : ((av - bv) / Math.abs(bv)) * 100;
        return (
          <div key={r.key} className="grid grid-cols-[150px_1fr_90px] items-center gap-3">
            <span className="text-[12px] font-medium text-foreground">{r.label}</span>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-[#4361EE]" style={{ width: `${(av / max) * 100}%` }} />
                </div>
                <span className="w-24 shrink-0 text-right text-[11px] font-semibold tabular-nums">{fmt(av, r.format)}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-violet-400" style={{ width: `${(bv / max) * 100}%` }} />
                </div>
                <span className="w-24 shrink-0 text-right text-[11px] font-semibold tabular-nums">{fmt(bv, r.format)}</span>
              </div>
            </div>
            <span
              className={cn(
                "text-right text-[12px] font-bold tabular-nums",
                delta == null ? "text-muted-foreground" : delta >= 0 ? "text-emerald-600" : "text-rose-600"
              )}
            >
              {delta == null ? "—" : `${delta >= 0 ? "+" : ""}${delta.toFixed(0)}%`}
            </span>
          </div>
        );
      })}
    </div>
  );
}
