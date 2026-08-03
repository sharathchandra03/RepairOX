"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Reporting · Custom Report Builder
   Step-driven builder: Module → Data Source → Fields → Grouping → Metric →
   Visualization → Save. Everything previews live against the real dataset and
   saves to the user's report library. Driven entirely by the module registry,
   so future modules/sources appear here automatically.
   ────────────────────────────────────────────────────────────────────────── */

import { useMemo, useState } from "react";
import { Check, Save, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RSelect } from "@/components/ui/rselect";
import { cn } from "@/lib/utils";
import { Panel, DataTable, type Column } from "./report-ui";
import { ChartByType } from "./report-charts";
import { availableModules, sourcesForModule, DATA_SOURCES, VISUALIZATIONS } from "@/lib/reports/registry";
import { runCustomReport } from "@/lib/reports/aggregations";
import { rangeFromFilters } from "@/lib/reports/filters";
import { DATE_PRESETS } from "@/lib/reports/date-ranges";
import { saveReport } from "@/lib/reports/saved-reports";
import type {
  ReportDataset, ReportFilters, ReportModuleId, DataSourceId,
  AggregationOp, VisualizationId, CustomReportConfig,
} from "@/lib/reports/types";

const AGG_OPS: { label: string; value: AggregationOp }[] = [
  { label: "Sum", value: "sum" },
  { label: "Count", value: "count" },
  { label: "Average", value: "avg" },
  { label: "Min", value: "min" },
  { label: "Max", value: "max" },
];

export function CustomReportBuilder({
  data,
  baseFilters,
  onSaved,
  initial,
}: {
  data: ReportDataset;
  baseFilters: ReportFilters;
  onSaved?: (r: CustomReportConfig) => void;
  initial?: CustomReportConfig;
}) {
  const modules = availableModules();
  const [module, setModule] = useState<ReportModuleId>(initial?.module === "combined" ? "shop" : (initial?.module as ReportModuleId) ?? "shop");
  const sources = sourcesForModule(module);
  const [source, setSource] = useState<DataSourceId>(initial?.dataSource ?? sources[0]?.id ?? "invoices");
  const def = DATA_SOURCES[source];

  const [fields, setFields] = useState<string[]>(initial?.fields ?? def.fields.slice(0, 5).map((f) => f.key));
  const [groupByKey, setGroupByKey] = useState<string>(initial?.groupBy ?? "");
  const [metric, setMetric] = useState<string>(initial?.metric ?? def.metrics[0]?.key ?? "__count");
  const [agg, setAgg] = useState<AggregationOp>(initial?.aggregation ?? "sum");
  const [viz, setViz] = useState<VisualizationId>(initial?.visualization ?? "bar");
  const [preset, setPreset] = useState(initial?.filters.preset ?? baseFilters.preset);
  const [name, setName] = useState(initial?.name ?? "");
  const [saved, setSaved] = useState(false);

  // When the source changes, reset dependent selections to valid defaults.
  const onSourceChange = (s: DataSourceId) => {
    const d = DATA_SOURCES[s];
    setSource(s);
    setFields(d.fields.slice(0, 5).map((f) => f.key));
    setGroupByKey("");
    setMetric(d.metrics[0]?.key ?? "__count");
  };

  const config: CustomReportConfig = useMemo(
    () => ({
      id: initial?.id ?? "draft",
      name: name || "Untitled report",
      module,
      dataSource: source,
      fields,
      groupBy: groupByKey || undefined,
      metric,
      aggregation: agg,
      visualization: viz,
      filters: { ...baseFilters, preset },
      createdAt: initial?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
    [initial, name, module, source, fields, groupByKey, metric, agg, viz, baseFilters, preset]
  );

  const result = useMemo(() => runCustomReport(config, data), [config, data]);
  const range = rangeFromFilters(config.filters);

  const toggleField = (key: string) =>
    setFields((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));

  const doSave = () => {
    const rec = saveReport({ ...config, id: initial?.id, name: name || `${def.label} report` });
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
    onSaved?.(rec);
  };

  const showChart = viz !== "table" && Boolean(groupByKey);

  return (
    <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
      {/* Builder controls */}
      <div className="space-y-3">
        <Panel title="Build a Report" subtitle="Compose from any data source">
          <div className="space-y-3.5">
            <Step n={1} label="Module">
              <RSelect value={module} onChange={(v) => { setModule(v as ReportModuleId); const s = sourcesForModule(v as ReportModuleId)[0]?.id; if (s) onSourceChange(s); }} options={modules.map((m) => ({ label: m.label, value: m.id }))} />
            </Step>

            <Step n={2} label="Data Source">
              <RSelect value={source} onChange={(v) => onSourceChange(v as DataSourceId)} options={sources.map((s) => ({ label: s.label, value: s.id }))} />
            </Step>

            <Step n={3} label="Fields (table columns)">
              <div className="flex flex-wrap gap-1.5">
                {def.fields.map((f) => {
                  const on = fields.includes(f.key);
                  return (
                    <button
                      key={f.key}
                      onClick={() => toggleField(f.key)}
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition",
                        on ? "border-[#4361EE] bg-[#EEF1FD] text-[#3347D6]" : "border-border bg-card text-zinc-600 hover:bg-muted"
                      )}
                    >
                      {on && <Check className="h-3 w-3" />}
                      {f.label}
                    </button>
                  );
                })}
              </div>
            </Step>

            <Step n={4} label="Group By (optional)">
              <RSelect
                value={groupByKey}
                onChange={setGroupByKey}
                options={[{ label: "No grouping (detail rows)", value: "" }, ...def.groupBy.map((g) => ({ label: g.label, value: g.key }))]}
              />
            </Step>

            {groupByKey && (
              <div className="grid grid-cols-2 gap-2">
                <Step n={5} label="Metric">
                  <RSelect value={metric} onChange={setMetric} options={def.metrics.map((m) => ({ label: m.label, value: m.key }))} menuWidth="w-52" />
                </Step>
                <Step n={5} label="Aggregation">
                  <RSelect value={agg} onChange={(v) => setAgg(v as AggregationOp)} options={AGG_OPS} menuWidth="w-40" />
                </Step>
              </div>
            )}

            <Step n={6} label="Visualization">
              <div className="flex flex-wrap gap-1.5">
                {VISUALIZATIONS.map((v) => {
                  const on = viz === v.id;
                  const disabled = v.id !== "table" && !groupByKey && v.id !== "kpi";
                  return (
                    <button
                      key={v.id}
                      disabled={disabled}
                      onClick={() => setViz(v.id)}
                      className={cn(
                        "rounded-lg border px-2.5 py-1 text-[11px] font-medium transition",
                        on ? "border-[#4361EE] bg-[#4361EE] text-white" : "border-border bg-card text-zinc-600 hover:bg-muted",
                        disabled && "cursor-not-allowed opacity-40"
                      )}
                    >
                      {v.label}
                    </button>
                  );
                })}
              </div>
              {!groupByKey && <p className="mt-1 text-[10.5px] text-muted-foreground">Pick a Group By to unlock charts.</p>}
            </Step>

            <Step n={7} label="Period">
              <RSelect value={preset} onChange={(v) => setPreset(v as any)} options={DATE_PRESETS.filter((p) => p.id !== "custom").map((p) => ({ label: p.label, value: p.id }))} />
            </Step>
          </div>
        </Panel>

        <div className="flex items-center gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name this report…"
            className="h-10 flex-1 rounded-xl border border-border bg-card px-3 text-[13px] focus:border-[#4361EE] focus:outline-none focus:ring-2 focus:ring-[#4361EE]/15"
          />
          <Button onClick={doSave} size="md">
            {saved ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
            {saved ? "Saved" : "Save"}
          </Button>
        </div>
      </div>

      {/* Live preview */}
      <Panel
        title={name || "Report Preview"}
        subtitle={`${def.label} · ${range.label}${groupByKey ? ` · grouped by ${def.groupBy.find((g) => g.key === groupByKey)?.label}` : ""}`}
        actions={<span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"><Wand2 className="h-3.5 w-3.5" /> Live</span>}
      >
        {showChart ? (
          <ChartByType type={viz} data={result.series} currency={isCurrencyMetric(metric)} />
        ) : (
          <DataTable
            columns={result.columns.map((c) => ({ key: c.key, label: c.label, numeric: c.numeric } as Column))}
            rows={result.rows}
          />
        )}
      </Panel>
    </div>
  );
}

function isCurrencyMetric(metric: string): boolean {
  return ["amount", "total", "paidAmount", "tax", "subtotal", "lifetimeValue", "salaryAmount", "businessValue", "invoiceValue", "__stockValue", "regularBuyingPrice", "regularSellingPrice"].includes(metric);
}

function Step({ n, label, children }: { n: number; label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold text-foreground">
        <span className="grid h-4 w-4 place-items-center rounded-full bg-[#EEF1FD] text-[9px] font-bold text-[#4361EE]">{n}</span>
        {label}
      </label>
      {children}
    </div>
  );
}
