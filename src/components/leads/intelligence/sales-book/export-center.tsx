"use client";

import { useState } from "react";
import { ChevronDown, Download, FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import { Dropdown, MenuItem, MenuLabel } from "@/components/ui/dropdown";
import { downloadCSV, downloadXLSX, toCSV } from "@/lib/csv-utils";
import {
  buildSalesBookExportRows, resolveExportRows, EXPORT_PRESETS,
  SALES_BOOK_EXPORT_COLUMNS, type ExportPreset, type LeadLedgerRow,
} from "@/lib/lead-sales-book";

/* Export center — a first-class action. Excel (.xlsx) primary + CSV, driven by
   ONE shared row-builder so Excel and CSV are identical and a lead is never
   duplicated by its invoices/tickets. Presets filter the full permitted set;
   "Current view" exports exactly what is on screen. */

export function ExportCenter({
  currentRows,
  allRows,
  storeNames,
  filenameBase,
  scopeLabel,
}: {
  currentRows: LeadLedgerRow[];
  allRows: LeadLedgerRow[];
  storeNames: Record<string, string>;
  filenameBase: string;
  scopeLabel?: string;
}) {
  const [busy, setBusy] = useState<string | null>(null);

  const run = async (preset: ExportPreset, format: "xlsx" | "csv", close: () => void) => {
    close();
    const rows = resolveExportRows(preset, currentRows, allRows);
    if (rows.length === 0) return;
    const key = `${preset}-${format}`;
    setBusy(key);
    try {
      const headers = [...SALES_BOOK_EXPORT_COLUMNS];
      const data = buildSalesBookExportRows(rows, storeNames);
      const stamp = new Date().toISOString().slice(0, 10);
      const name = `${filenameBase}-${preset}-${stamp}`;
      if (format === "xlsx") await downloadXLSX(name, headers, data, "Leads");
      else downloadCSV(name, toCSV(headers, data));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dropdown
      width="w-72"
      trigger={({ toggle, open }) => (
        <button
          type="button"
          onClick={toggle}
          className="inline-flex h-[34px] items-center gap-1.5 rounded-xl border border-[#4361EE]/30 bg-card px-3 text-[12px] font-semibold text-[#3A4DBB] transition hover:bg-[#EEF1FD]"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
          Export
          <ChevronDown className={`h-3.5 w-3.5 transition ${open ? "rotate-180" : ""}`} />
        </button>
      )}
    >
      {(close) => (
        <div className="space-y-0.5">
          <MenuLabel>Export leads {scopeLabel ? `· ${scopeLabel}` : ""}</MenuLabel>
          {EXPORT_PRESETS.map((preset) => {
            const count = resolveExportRows(preset.key, currentRows, allRows).length;
            return (
              <div key={preset.key} className="flex items-center gap-1 rounded-lg px-2 py-1 hover:bg-[#F6F8FF]">
                <span className="flex-1 truncate text-[12px] font-medium text-foreground">
                  {preset.label}
                  <span className="ml-1 text-[10.5px] font-normal text-muted-foreground">({count})</span>
                </span>
                <button
                  type="button"
                  disabled={count === 0 || !!busy}
                  onClick={() => run(preset.key, "xlsx", close)}
                  title="Download Excel (.xlsx)"
                  className="grid h-7 w-7 place-items-center rounded-md text-emerald-700 transition hover:bg-emerald-50 disabled:opacity-30"
                >
                  <FileSpreadsheet className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  disabled={count === 0 || !!busy}
                  onClick={() => run(preset.key, "csv", close)}
                  title="Download CSV (.csv)"
                  className="grid h-7 w-7 place-items-center rounded-md text-zinc-600 transition hover:bg-muted disabled:opacity-30"
                >
                  <FileText className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
          <p className="px-2 pt-1.5 text-[10px] leading-relaxed text-muted-foreground">
            Excel (<FileSpreadsheet className="inline h-3 w-3 text-emerald-700" />) or CSV (<FileText className="inline h-3 w-3" />). One row per lead; invoice &amp; ticket are separate columns. Respects your current filters, store scope &amp; permissions.
          </p>
        </div>
      )}
    </Dropdown>
  );
}
