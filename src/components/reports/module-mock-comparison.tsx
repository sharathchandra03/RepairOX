"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Reports V2 · Comparison Engine (preview shell)
   ──────────────────────────────────────────────────────────────────────────
   Same visual language and interaction model as the real `ComparisonEngine`
   (Shop): Period vs Period / Entity vs Entity, dual progress bars, delta
   column. Numbers here are mock-scaled (see module-mock-shared.tsx) rather
   than computed from a real dataset — there is no Sales/Field data source to
   query yet. Swap `baseMetrics`/`entityDimensions` for real computations once
   the module is wired (see the mock-data.ts wiring notes for each module).
   ────────────────────────────────────────────────────────────────────────── */

import { useMemo, useState } from "react";
import { ArrowRight } from "lucide-react";
import { SegmentedTabs } from "@/components/ui/tabs";
import { RSelect } from "@/components/ui/rselect";
import { cn, formatINR, formatNumber } from "@/lib/utils";
import { Panel } from "./report-ui";
import { DATE_PRESETS } from "@/lib/reports/date-ranges";
import { mockMetrics } from "./module-mock-shared";
import type { KpiFormat } from "@/lib/reports/types";

export interface MockMetricRow {
  key: string;
  label: string;
  format: KpiFormat;
}

export interface MockEntityDimension {
  key: string;
  label: string;
  options: { label: string; value: string }[];
}

export interface ModuleMockComparisonProps {
  moduleLabel: string;
  metricRows: MockMetricRow[];
  baseMetrics: Record<string, number>;
  entityDimensions: MockEntityDimension[];
}

function fmt(v: number, f: KpiFormat) {
  return f === "currency" ? formatINR(Math.round(v)) : formatNumber(Math.round(v));
}

export function ModuleMockComparison({ moduleLabel, metricRows, baseMetrics, entityDimensions }: ModuleMockComparisonProps) {
  const [mode, setMode] = useState<"period" | "entity">("period");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-[14px] font-semibold">Comparison Engine</h3>
          <p className="text-[12px] text-muted-foreground">Put any two periods or entities side by side. Preview — {moduleLabel} sample data.</p>
        </div>
        <SegmentedTabs
          size="sm"
          value={mode}
          onChange={(v) => setMode(v as "period" | "entity")}
          options={[{ label: "Period vs Period", value: "period" }, { label: "Entity vs Entity", value: "entity" }]}
        />
      </div>

      {mode === "period" ? (
        <MockPeriodComparison metricRows={metricRows} baseMetrics={baseMetrics} />
      ) : (
        <MockEntityComparison metricRows={metricRows} baseMetrics={baseMetrics} dimensions={entityDimensions} />
      )}
    </div>
  );
}

function MockPeriodComparison({ metricRows, baseMetrics }: { metricRows: MockMetricRow[]; baseMetrics: Record<string, number> }) {
  const [a, setA] = useState("this_month");
  const [b, setB] = useState("last_month");
  const presetOpts = DATE_PRESETS.filter((p) => p.id !== "custom").map((p) => ({ label: p.label, value: p.id }));

  const { mA, mB, labelA, labelB } = useMemo(() => {
    const pA = presetOpts.find((p) => p.value === a)?.label ?? a;
    const pB = presetOpts.find((p) => p.value === b)?.label ?? b;
    return { mA: mockMetrics(baseMetrics, a), mB: mockMetrics(baseMetrics, b), labelA: pA, labelB: pB };
  }, [a, b, baseMetrics]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Panel title="Period Comparison" subtitle="Metrics shown for each selected period (sample data)">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <RSelect value={a} onChange={setA} options={presetOpts} menuWidth="w-52" className="max-w-[200px]" />
        <ArrowRight className="h-4 w-4 text-muted-foreground" />
        <RSelect value={b} onChange={setB} options={presetOpts} menuWidth="w-52" className="max-w-[200px]" />
      </div>
      <ComparisonTable rows={metricRows} mA={mA} mB={mB} labelA={labelA} labelB={labelB} />
    </Panel>
  );
}

function MockEntityComparison({
  metricRows,
  baseMetrics,
  dimensions,
}: {
  metricRows: MockMetricRow[];
  baseMetrics: Record<string, number>;
  dimensions: MockEntityDimension[];
}) {
  const [dimKey, setDimKey] = useState(dimensions[0]?.key ?? "");
  const dim = dimensions.find((d) => d.key === dimKey) ?? dimensions[0];
  const [a, setA] = useState(dim?.options[0]?.value ?? "");
  const [b, setB] = useState(dim?.options[1]?.value ?? "");

  const { mA, mB } = useMemo(
    () => ({ mA: mockMetrics(baseMetrics, `${dimKey}-${a}`), mB: mockMetrics(baseMetrics, `${dimKey}-${b}`) }),
    [dimKey, a, b, baseMetrics]
  );

  return (
    <Panel title="Entity Comparison" subtitle="Sample data — swap in real computations once wired">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Compare by</span>
        <RSelect
          value={dimKey}
          onChange={(v) => {
            setDimKey(v);
            const d = dimensions.find((x) => x.key === v);
            setA(d?.options[0]?.value ?? "");
            setB(d?.options[1]?.value ?? "");
          }}
          options={dimensions.map((d) => ({ label: d.label, value: d.key }))}
          menuWidth="w-52"
          className="max-w-[190px]"
        />
        <RSelect value={a} onChange={setA} searchable options={dim?.options ?? []} menuWidth="w-56" className="max-w-[200px]" />
        <ArrowRight className="h-4 w-4 text-muted-foreground" />
        <RSelect value={b} onChange={setB} searchable options={dim?.options ?? []} menuWidth="w-56" className="max-w-[200px]" />
      </div>
      {(dim?.options.length ?? 0) < 2 ? (
        <p className="py-6 text-center text-[12px] text-muted-foreground">Not enough sample values to compare on this dimension.</p>
      ) : (
        <ComparisonTable
          rows={metricRows}
          mA={mA}
          mB={mB}
          labelA={dim?.options.find((o) => o.value === a)?.label ?? "A"}
          labelB={dim?.options.find((o) => o.value === b)?.label ?? "B"}
        />
      )}
    </Panel>
  );
}

function ComparisonTable({
  rows,
  mA,
  mB,
  labelA,
  labelB,
}: {
  rows: MockMetricRow[];
  mA: Record<string, number>;
  mB: Record<string, number>;
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
        const av = mA[r.key] ?? 0;
        const bv = mB[r.key] ?? 0;
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
            <span className={cn("text-right text-[12px] font-bold tabular-nums", delta == null ? "text-muted-foreground" : delta >= 0 ? "text-emerald-600" : "text-rose-600")}>
              {delta == null ? "—" : `${delta >= 0 ? "+" : ""}${delta.toFixed(0)}%`}
            </span>
          </div>
        );
      })}
    </div>
  );
}
