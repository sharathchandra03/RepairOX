"use client";

/* RepairOX — Reporting · Saved report library. Favourite, pin, run, export or
   edit any report the user has built. */

import { useMemo, useState } from "react";
import { Star, Pin, Trash2, Pencil, FileSpreadsheet, Printer, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Panel, DataTable, type Column } from "./report-ui";
import { ChartByType } from "./report-charts";
import { EmptyState } from "./empty-state";
import { CustomReportBuilder } from "./custom-report-builder";
import { useSavedReports, deleteReport, toggleFavorite, togglePinned } from "@/lib/reports/saved-reports";
import { runCustomReport } from "@/lib/reports/aggregations";
import { rangeFromFilters } from "@/lib/reports/filters";
import { DATA_SOURCES } from "@/lib/reports/registry";
import { exportSingleCSV, printReport, type CompanyInfo } from "@/lib/reports/export";
import type { ReportDataset, ReportFilters, CustomReportConfig } from "@/lib/reports/types";

export type SavedReportsFilterMode = "all" | "recent" | "pinned" | "favorite";

const FILTER_COPY: Record<SavedReportsFilterMode, { title: string; empty: string }> = {
  all: { title: "Report Library", empty: "No saved reports yet. Build one to start your library." },
  recent: { title: "Recently Used", empty: "Reports you open will show up here, most recent first." },
  pinned: { title: "Pinned Reports", empty: "Pin a report from its toolbar to keep it here for quick access." },
  favorite: { title: "Favourite Reports", empty: "Star a report from its toolbar to favourite it." },
};

export function SavedReportsPanel({
  data,
  baseFilters,
  company,
  generatedBy,
  filterMode = "all",
}: {
  data: ReportDataset;
  baseFilters: ReportFilters;
  company: CompanyInfo;
  generatedBy: string;
  /** Presentational-only view filter for the new nav tabs (Saved / Recent / Pinned).
   *  Purely sorts/filters the already-fetched saved-reports list — no store changes. */
  filterMode?: SavedReportsFilterMode;
}) {
  const reports = useSavedReports();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<CustomReportConfig | null>(null);
  const [creating, setCreating] = useState(false);

  const sorted = useMemo(() => {
    const base = [...reports].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    if (filterMode === "pinned") return base.filter((r) => r.pinned);
    if (filterMode === "favorite") return base.filter((r) => r.favorite);
    if (filterMode === "recent") return base.slice(0, 10);
    return [...base].sort((a, b) => Number(b.pinned) - Number(a.pinned) || Number(b.favorite) - Number(a.favorite) || b.updatedAt.localeCompare(a.updatedAt));
  }, [reports, filterMode]);
  const selected = sorted.find((r) => r.id === selectedId) ?? sorted[0] ?? null;
  const copy = FILTER_COPY[filterMode];

  if (creating || editing) {
    return (
      <div className="space-y-3">
        <button onClick={() => { setCreating(false); setEditing(null); }} className="text-[12px] font-medium text-[#4361EE] hover:underline">
          ← Back to library
        </button>
        <CustomReportBuilder
          data={data}
          baseFilters={baseFilters}
          initial={editing ?? undefined}
          onSaved={() => { setCreating(false); setEditing(null); }}
        />
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
      <div className="space-y-2">
        <p className="px-1 text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground">{copy.title}</p>
        <Button onClick={() => setCreating(true)} className="w-full" size="md">
          <Plus className="h-4 w-4" /> New Report
        </Button>
        {sorted.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border bg-card">
            <EmptyState icon="inbox" title="Nothing here yet" detail={copy.empty} compact />
          </div>
        )}
        {sorted.map((r) => (
          <button
            key={r.id}
            onClick={() => setSelectedId(r.id)}
            className={cn(
              "w-full rounded-xl border p-3 text-left transition",
              selected?.id === r.id ? "border-[#4361EE]/50 bg-[#EEF1FD]/50" : "border-border bg-card hover:bg-muted"
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-[13px] font-semibold">{r.name}</span>
              <div className="flex shrink-0 items-center gap-1">
                {r.pinned && <Pin className="h-3.5 w-3.5 text-[#4361EE]" />}
                {r.favorite && <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />}
              </div>
            </div>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {DATA_SOURCES[r.dataSource]?.label} · {r.visualization}
            </p>
          </button>
        ))}
      </div>

      <div>
        {selected ? (
          <SavedReportView
            key={selected.id}
            config={selected}
            data={data}
            company={company}
            generatedBy={generatedBy}
            onEdit={() => setEditing(selected)}
            onDelete={() => { deleteReport(selected.id); setSelectedId(null); }}
            onFav={() => toggleFavorite(selected.id)}
            onPin={() => togglePinned(selected.id)}
          />
        ) : (
          <Panel title="No report selected" subtitle="Create or select a report from the library">
            <p className="py-8 text-center text-[12px] text-muted-foreground">Your saved reports will appear here.</p>
          </Panel>
        )}
      </div>
    </div>
  );
}

function SavedReportView({
  config,
  data,
  company,
  generatedBy,
  onEdit,
  onDelete,
  onFav,
  onPin,
}: {
  config: CustomReportConfig;
  data: ReportDataset;
  company: CompanyInfo;
  generatedBy: string;
  onEdit: () => void;
  onDelete: () => void;
  onFav: () => void;
  onPin: () => void;
}) {
  const result = useMemo(() => runCustomReport(config, data), [config, data]);
  const range = rangeFromFilters(config.filters);
  const showChart = config.visualization !== "table" && Boolean(config.groupBy);

  const doCSV = () =>
    exportSingleCSV(config.name.replace(/\s+/g, "-").toLowerCase(), result.columns.map((c) => c.label), result.rows);

  const doPrint = () =>
    printReport(company, {
      reportName: config.name,
      dateRangeLabel: range.label,
      filtersUsed: [],
      generatedBy,
      tables: [{ title: config.name, columns: result.columns.map((c) => c.label), rows: result.rows }],
    });

  return (
    <Panel
      title={config.name}
      subtitle={`${DATA_SOURCES[config.dataSource]?.label} · ${range.label}`}
      actions={
        <>
          <IconBtn onClick={onFav} title="Favourite"><Star className={cn("h-4 w-4", config.favorite && "fill-amber-400 text-amber-400")} /></IconBtn>
          <IconBtn onClick={onPin} title="Pin"><Pin className={cn("h-4 w-4", config.pinned && "text-[#4361EE]")} /></IconBtn>
          <IconBtn onClick={onEdit} title="Edit"><Pencil className="h-4 w-4" /></IconBtn>
          <IconBtn onClick={doCSV} title="Export CSV"><FileSpreadsheet className="h-4 w-4" /></IconBtn>
          <IconBtn onClick={doPrint} title="Print / PDF"><Printer className="h-4 w-4" /></IconBtn>
          <IconBtn onClick={onDelete} title="Delete"><Trash2 className="h-4 w-4 text-rose-500" /></IconBtn>
        </>
      }
    >
      {showChart ? (
        <ChartByType type={config.visualization} data={result.series} currency={isCurrencyMetric(config.metric)} />
      ) : (
        <DataTable columns={result.columns.map((c) => ({ key: c.key, label: c.label, numeric: c.numeric } as Column))} rows={result.rows} />
      )}
    </Panel>
  );
}

function isCurrencyMetric(metric?: string): boolean {
  if (!metric) return false;
  return ["amount", "total", "paidAmount", "tax", "subtotal", "lifetimeValue", "salaryAmount", "businessValue", "invoiceValue", "__stockValue"].includes(metric);
}

function IconBtn({ onClick, title, children }: { onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button onClick={onClick} title={title} className="grid h-8 w-8 place-items-center rounded-lg border border-border bg-card text-zinc-600 transition hover:bg-muted">
      {children}
    </button>
  );
}
