"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Reports V2 · Sales Management · Custom Report Builder (preview)
   ──────────────────────────────────────────────────────────────────────────
   Same step-driven UX as the live Shop builder: Module → Source → Fields →
   Grouping → Metric → Visualization → Save. Uses mock data sources from
   mock-data.ts — swap with real Sales engine later (no UI changes needed).
   ────────────────────────────────────────────────────────────────────────── */

import { useMemo, useState } from "react";
import { Check, Save, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RSelect } from "@/components/ui/rselect";
import { cn } from "@/lib/utils";
import { Panel, DataTable, type Column } from "../report-ui";
import { ChartByType } from "../report-charts";
import { ModulePreviewBanner } from "../module-preview-banner";
import { generateMockRows, type MockDataSourceDef, type SeriesPoint } from "../module-mock-shared";
import { salesBuilderSources } from "./mock-data";

const VISUALIZATIONS = [
  { id: "table", label: "Table" },
  { id: "bar", label: "Bar" },
  { id: "line", label: "Line" },
  { id: "area", label: "Area" },
  { id: "pie", label: "Pie" },
];

const AGG_OPS = [
  { label: "Sum", value: "sum" },
  { label: "Count", value: "count" },
  { label: "Average", value: "avg" },
];

export function SalesMockBuilder() {
  const [sourceId, setSourceId] = useState(salesBuilderSources[0].id);
  const source = salesBuilderSources.find((s) => s.id === sourceId) ?? salesBuilderSources[0];

  const [fields, setFields] = useState<string[]>(source.fields.slice(0, 4).map((f) => f.key));
  const [groupByKey, setGroupByKey] = useState("");
  const [metric, setMetric] = useState(source.metrics[0]?.key ?? "__count");
  const [agg, setAgg] = useState("sum");
  const [viz, setViz] = useState("bar");
  const [name, setName] = useState("");
  const [saved, setSaved] = useState(false);

  const onSourceChange = (id: string) => {
    const s = salesBuilderSources.find((x) => x.id === id) ?? salesBuilderSources[0];
    setSourceId(id);
    setFields(s.fields.slice(0, 4).map((f) => f.key));
    setGroupByKey("");
    setMetric(s.metrics[0]?.key ?? "__count");
  };

  const toggleField = (key: string) =>
    setFields((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));

  const showChart = viz !== "table" && Boolean(groupByKey);

  const chartData: SeriesPoint[] = useMemo(() => {
    if (!groupByKey) return [];
    return source.groupSamples[groupByKey] ?? [];
  }, [source, groupByKey]);

  const tableRows = useMemo(() => {
    if (showChart) return [];
    const selectedFields = source.fields.filter((f) => fields.includes(f.key));
    return generateMockRows(selectedFields, 6);
  }, [source, fields, showChart]);

  const doSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  };

  return (
    <div className="space-y-4">
      <ModulePreviewBanner moduleLabel="Sales Management" />

      <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
        {/* Builder controls */}
        <div className="space-y-3">
          <Panel title="Build a Report" subtitle="Compose from Sales data sources (preview)">
            <div className="space-y-3.5">
              <Step n={1} label="Data Source">
                <RSelect
                  value={sourceId}
                  onChange={onSourceChange}
                  options={salesBuilderSources.map((s) => ({ label: s.label, value: s.id }))}
                />
              </Step>

              <Step n={2} label="Fields (table columns)">
                <div className="flex flex-wrap gap-1.5">
                  {source.fields.map((f) => {
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

              <Step n={3} label="Group By (optional)">
                <RSelect
                  value={groupByKey}
                  onChange={setGroupByKey}
                  options={[
                    { label: "No grouping (detail rows)", value: "" },
                    ...source.groupBy.map((g) => ({ label: g.label, value: g.key })),
                  ]}
                />
              </Step>

              {groupByKey && (
                <div className="grid grid-cols-2 gap-2">
                  <Step n={4} label="Metric">
                    <RSelect
                      value={metric}
                      onChange={setMetric}
                      options={source.metrics.map((m) => ({ label: m.label, value: m.key }))}
                      menuWidth="w-52"
                    />
                  </Step>
                  <Step n={4} label="Aggregation">
                    <RSelect value={agg} onChange={setAgg} options={AGG_OPS} menuWidth="w-40" />
                  </Step>
                </div>
              )}

              <Step n={5} label="Visualization">
                <div className="flex flex-wrap gap-1.5">
                  {VISUALIZATIONS.map((v) => {
                    const on = viz === v.id;
                    const disabled = v.id !== "table" && !groupByKey;
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
                {!groupByKey && (
                  <p className="mt-1 text-[10.5px] text-muted-foreground">Pick a Group By to unlock charts.</p>
                )}
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
          subtitle={`${source.label}${groupByKey ? ` · grouped by ${source.groupBy.find((g) => g.key === groupByKey)?.label}` : ""}`}
          actions={
            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
              <Wand2 className="h-3.5 w-3.5" /> Preview
            </span>
          }
        >
          {showChart ? (
            <ChartByType
              type={viz as any}
              data={chartData}
              currency={metric !== "__count"}
            />
          ) : (
            <DataTable
              columns={source.fields
                .filter((f) => fields.includes(f.key))
                .map((f) => ({
                  key: f.key,
                  label: f.label,
                  numeric: f.kind === "number" || f.kind === "currency",
                  format: f.kind === "currency" ? "currency" : undefined,
                } as Column))}
              rows={tableRows}
            />
          )}
        </Panel>
      </div>
    </div>
  );
}

function Step({ n, label, children }: { n: number; label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold text-foreground">
        <span className="grid h-4 w-4 place-items-center rounded-full bg-[#EEF1FD] text-[9px] font-bold text-[#4361EE]">
          {n}
        </span>
        {label}
      </label>
      {children}
    </div>
  );
}
