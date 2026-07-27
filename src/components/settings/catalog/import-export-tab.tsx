"use client";

import { useRef, useState } from "react";
import {
  Upload, Download, FileText, CheckCircle2, AlertTriangle, XCircle, X, RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useCatalog, type ImportResult } from "@/lib/catalog-context";
import {
  parseCatalogCSV, validateRows, downloadCSV, catalogTemplateCSV, catalogToCSV, toCSV,
  CATALOG_COLUMNS, type ValidatedRow, type ParsedCatalogCSV,
} from "@/lib/csv-utils";
import { readSheet, readSheetByName } from "@/lib/sheet-reader";
import { parseSmartSheet, type SmartImportResult } from "@/lib/smart-import";
import { SmartImportDialog } from "@/components/price-list/smart-import-dialog";

export function ImportExportTab() {
  const { categories, brands, models, parts, importRows, importSmartModels, clearSeedData, resetCatalog } = useCatalog();
  const sampleModelCount = models.filter((m) => m.seed).length;
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [parsed, setParsed] = useState<ParsedCatalogCSV | null>(null);
  const [validated, setValidated] = useState<ValidatedRow[]>([]);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  // Generic (wide-sheet) smart import
  const [smartOpen, setSmartOpen] = useState(false);
  const [smartResult, setSmartResult] = useState<SmartImportResult | null>(null);
  const [smartFile, setSmartFile] = useState<File | null>(null);
  const [smartSheetNames, setSmartSheetNames] = useState<string[]>([]);
  const [smartActiveSheet, setSmartActiveSheet] = useState<string>("");

  const errorCount = validated.filter((v) => v.issues.some((i) => i.level === "error")).length;
  const warnCount = validated.filter((v) => v.issues.some((i) => i.level === "warning")).length;
  const validCount = validated.length - errorCount;

  // Read any CSV/Excel file, auto-detect its shape, and route it:
  //  • canonical catalog template (Category/Brand/Model + Part Name + Price) →
  //    the validated preview below; • any other sheet → smart-import dialog.
  const handleFile = async (file?: File) => {
    if (!file) return;
    setFileName(file.name);
    setResult(null);
    try {
      const { matrix, sheetName, sheetNames } = await readSheet(file);
      if (matrix.length === 0) return;
      const headerSet = new Set(matrix[0].map((h) => h.trim().toLowerCase()));
      const isLongTemplate =
        headerSet.has("model") &&
        (headerSet.has("part name") || headerSet.has("part")) &&
        (headerSet.has("price") || headerSet.has("price (inr)"));

      if (isLongTemplate) {
        const p = parseCatalogCSV(toCSV(matrix[0], matrix.slice(1)));
        setParsed(p);
        setValidated(validateRows(p));
      } else {
        setSmartFile(file);
        setSmartSheetNames(sheetNames);
        setSmartActiveSheet(sheetName);
        setSmartResult(parseSmartSheet(matrix));
        setSmartOpen(true);
      }
    } catch {
      /* ignore unreadable files */
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const clearImport = () => {
    setParsed(null); setValidated([]); setFileName(""); setResult(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const commitImport = () => {
    if (!parsed) return;
    // Skip rows with blocking errors
    const goodRows = validated.filter((v) => !v.issues.some((i) => i.level === "error")).map((v) => v.row);
    const res = importRows(goodRows);
    setResult(res);
  };

  const handleSmartSheetChange = async (name: string) => {
    if (!smartFile) return;
    try {
      const matrix = await readSheetByName(smartFile, name);
      setSmartActiveSheet(name);
      setSmartResult(parseSmartSheet(matrix));
    } catch { /* ignore */ }
  };

  const handleSmartConfirm = (opts: { defaultCategory: string; defaultBrand: string }) => {
    if (!smartResult) return;
    setResult(importSmartModels(smartResult.models, opts));
    setSmartOpen(false);
    setSmartResult(null);
    setSmartFile(null);
  };

  const handleExport = () => {
    downloadCSV(
      `repairox-catalog-${new Date().toISOString().slice(0, 10)}`,
      catalogToCSV(categories, brands, models, parts),
    );
  };

  return (
    <div className="space-y-5">
      {/* Action cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <ActionCard
          icon={FileText}
          title="Download Template"
          description="Get the CSV format with all supported columns and an example row."
          actionLabel="Download Template"
          onClick={() => downloadCSV("repairox-catalog-template", catalogTemplateCSV())}
        />
        <ActionCard
          icon={Upload}
          title="Import CSV / Excel"
          description="Upload any .csv, .xlsx or .xls sheet. Catalog templates and vendor repair sheets are both auto-detected."
          actionLabel="Choose File"
          onClick={() => fileRef.current?.click()}
          primary
        />
        <ActionCard
          icon={Download}
          title="Export Catalog"
          description="Download the entire current catalog as a CSV for backup or bulk editing."
          actionLabel="Export CSV"
          onClick={handleExport}
        />
      </div>
      <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls,.xlsm,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" onChange={(e) => handleFile(e.target.files?.[0])} />

      {/* Expected format hint */}
      <div className="rounded-2xl border border-border bg-muted/20 p-4">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Expected columns</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {CATALOG_COLUMNS.map((c) => (
            <span key={c} className={cn(
              "rounded-full px-2.5 py-1 text-[11px] font-medium",
              ["Category", "Brand", "Model"].includes(c) ? "bg-[#EEF1FD] text-[#3347D6] ring-1 ring-inset ring-[#B3BFF6]/60" : "bg-card text-muted-foreground border border-border"
            )}>
              {c}{["Category", "Brand", "Model"].includes(c) && " *"}
            </span>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">* required. Headers are matched case-insensitively; common aliases (e.g. "Part Number", "Price (INR)") are recognized automatically.</p>
      </div>

      {/* Import committed result */}
      {result && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-600" />
            <div className="flex-1">
              <p className="font-semibold text-emerald-800">Import complete</p>
              <p className="mt-0.5 text-[13px] text-emerald-700">
                {result.categoriesAdded} categories, {result.brandsAdded} brands, {result.modelsAdded} models added
                {result.modelsUpdated ? `, ${result.modelsUpdated} models updated` : ""} ·
                {" "}{result.partsAdded} parts added, {result.partsUpdated} parts updated.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={clearImport}>Done</Button>
          </div>
        </div>
      )}

      {/* Preview & validation */}
      {parsed && !result && (
        <div className="rounded-2xl border border-border bg-card shadow-card overflow-hidden">
          {/* Preview header */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-semibold">{fileName}</span>
              <span className="text-[12px] text-muted-foreground">· {validated.length} rows</span>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={clearImport} className="grid h-8 w-8 place-items-center rounded-lg border border-border text-muted-foreground hover:bg-muted transition">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Missing / unknown columns */}
          {(parsed.missingRequired.length > 0 || parsed.unknownHeaders.length > 0) && (
            <div className="border-b border-border px-4 py-3 space-y-1.5">
              {parsed.missingRequired.length > 0 && (
                <p className="flex items-center gap-2 text-[12px] text-rose-600">
                  <XCircle className="h-3.5 w-3.5" /> Missing required columns: {parsed.missingRequired.join(", ")}
                </p>
              )}
              {parsed.unknownHeaders.length > 0 && (
                <p className="flex items-center gap-2 text-[12px] text-amber-600">
                  <AlertTriangle className="h-3.5 w-3.5" /> Unrecognized columns (ignored): {parsed.unknownHeaders.join(", ")}
                </p>
              )}
            </div>
          )}

          {/* Stat chips */}
          <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
            <StatChip icon={CheckCircle2} tone="success" label={`${validCount} valid`} />
            {warnCount > 0 && <StatChip icon={AlertTriangle} tone="warning" label={`${warnCount} warnings`} />}
            {errorCount > 0 && <StatChip icon={XCircle} tone="danger" label={`${errorCount} errors (skipped)`} />}
          </div>

          {/* Rows preview */}
          <div className="max-h-[360px] overflow-auto">
            <table className="w-full text-left text-[12px]">
              <thead className="sticky top-0 bg-muted/50 backdrop-blur">
                <tr className="border-b border-border">
                  <th className="py-2 pl-4 pr-2 font-semibold text-muted-foreground">#</th>
                  <th className="py-2 px-2 font-semibold text-muted-foreground">Category</th>
                  <th className="py-2 px-2 font-semibold text-muted-foreground">Brand</th>
                  <th className="py-2 px-2 font-semibold text-muted-foreground">Model</th>
                  <th className="py-2 px-2 font-semibold text-muted-foreground">Part</th>
                  <th className="py-2 px-2 font-semibold text-muted-foreground">Price</th>
                  <th className="py-2 px-2 font-semibold text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody>
                {validated.map((v) => {
                  const hasError = v.issues.some((i) => i.level === "error");
                  const hasWarn = v.issues.some((i) => i.level === "warning");
                  return (
                    <tr key={v.rowNumber} className={cn(
                      "border-b border-border/50",
                      hasError && "bg-rose-50/60",
                      !hasError && hasWarn && "bg-amber-50/40"
                    )}>
                      <td className="py-1.5 pl-4 pr-2 text-muted-foreground">{v.rowNumber}</td>
                      <td className="py-1.5 px-2">{v.row.category || <span className="text-rose-500">—</span>}</td>
                      <td className="py-1.5 px-2">{v.row.brand || <span className="text-rose-500">—</span>}</td>
                      <td className="py-1.5 px-2">{v.row.model || <span className="text-rose-500">—</span>}</td>
                      <td className="py-1.5 px-2 text-muted-foreground">{v.row.partName || "—"}</td>
                      <td className="py-1.5 px-2 text-muted-foreground">{v.row.price || "—"}</td>
                      <td className="py-1.5 px-2">
                        {hasError ? (
                          <span className="inline-flex items-center gap-1 text-rose-600" title={v.issues.map((i) => i.message).join("; ")}>
                            <XCircle className="h-3.5 w-3.5" /> Error
                          </span>
                        ) : hasWarn ? (
                          <span className="inline-flex items-center gap-1 text-amber-600" title={v.issues.map((i) => i.message).join("; ")}>
                            <AlertTriangle className="h-3.5 w-3.5" /> Warning
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-emerald-600">
                            <CheckCircle2 className="h-3.5 w-3.5" /> OK
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Commit footer */}
          <div className="flex items-center justify-between border-t border-border p-4">
            <p className="text-[12px] text-muted-foreground">
              {errorCount > 0 ? `${errorCount} rows with errors will be skipped. ` : ""}
              {validCount} rows will be imported.
            </p>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={clearImport}>Cancel</Button>
              <Button size="sm" disabled={validCount === 0} onClick={commitImport}>
                <Upload className="h-3.5 w-3.5" /> Import {validCount} Rows
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Sample data — present until the first real import (or manual clear) */}
      {sampleModelCount > 0 && (
        <div className="flex items-center justify-between rounded-2xl border border-amber-200 bg-amber-50/60 p-5">
          <div>
            <p className="text-sm font-medium text-amber-900">Sample data</p>
            <p className="text-[11px] text-amber-700">
              The catalog currently includes built-in demo devices. Importing any sheet removes them automatically, or clear them now.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={clearSeedData}>
            <X className="h-3.5 w-3.5" /> Clear sample data
          </Button>
        </div>
      )}

      {/* Danger zone: reset */}
      <div className="flex items-center justify-between rounded-2xl border border-border bg-card p-5 shadow-card">
        <div>
          <p className="text-sm font-medium">Reset Catalog</p>
          <p className="text-[11px] text-muted-foreground">Restore the catalog to the default sample data. This clears all custom changes.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setConfirmReset(true)}>
          <RotateCcw className="h-3.5 w-3.5" /> Reset to Defaults
        </Button>
      </div>

      <ConfirmDialog
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        onConfirm={() => { resetCatalog(); setConfirmReset(false); clearImport(); }}
        title="Reset the entire catalog?"
        description="All categories, brands, models, parts and uploaded images you've added or edited will be replaced with the defaults."
        confirmLabel="Reset Catalog"
      />

      {/* Generic vendor-sheet import (parts as columns) */}
      <SmartImportDialog
        open={smartOpen}
        fileName={fileName}
        result={smartResult}
        sheetNames={smartSheetNames}
        activeSheet={smartActiveSheet}
        onSheetChange={handleSmartSheetChange}
        onClose={() => { setSmartOpen(false); setSmartResult(null); setSmartFile(null); }}
        onConfirm={handleSmartConfirm}
      />
    </div>
  );
}

/* ─── Small pieces ───────────────────────────────────────────────── */
function ActionCard({
  icon: Icon, title, description, actionLabel, onClick, primary,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  actionLabel: string;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <div className="flex flex-col rounded-2xl border border-border bg-card p-5 shadow-card">
      <span className={cn(
        "grid h-10 w-10 place-items-center rounded-xl",
        primary ? "bg-[#4361EE] text-white" : "bg-[#EEF1FD] text-[#4361EE]"
      )}>
        <Icon className="h-5 w-5" />
      </span>
      <p className="mt-3 text-sm font-semibold">{title}</p>
      <p className="mt-1 flex-1 text-[12px] text-muted-foreground">{description}</p>
      <Button variant={primary ? "primary" : "outline"} size="sm" className="mt-4 w-full" onClick={onClick}>
        {actionLabel}
      </Button>
    </div>
  );
}

function StatChip({ icon: Icon, tone, label }: {
  icon: React.ComponentType<{ className?: string }>;
  tone: "success" | "warning" | "danger";
  label: string;
}) {
  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-medium ring-1 ring-inset",
      tone === "success" && "bg-emerald-50 text-emerald-700 ring-emerald-200",
      tone === "warning" && "bg-amber-50 text-amber-700 ring-amber-200",
      tone === "danger" && "bg-rose-50 text-rose-700 ring-rose-200",
    )}>
      <Icon className="h-3.5 w-3.5" /> {label}
    </span>
  );
}
