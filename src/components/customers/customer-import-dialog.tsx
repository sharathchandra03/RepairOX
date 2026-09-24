"use client";

/* ──────────────────────────────────────────────────────────────────────────
   Customer Master — Import dialog.

   Upload a CSV (or download the template), preview parsed rows, then import.
   Every row is deduped via findOrCreateCustomer against the live master and
   only genuinely new people are added — stamped captureSource "import". Gated
   by the caller on CAP.customer.import.
   ────────────────────────────────────────────────────────────────────────── */

import { useState, useRef } from "react";
import { UploadCloud, Download, FileSpreadsheet, CheckCircle2, AlertCircle } from "lucide-react";
import { RoxCenteredForm } from "@/components/ui/rox-centered-form";
import { Button } from "@/components/ui/button";
import { readSpreadsheetFileToCSV, SPREADSHEET_ACCEPT } from "@/lib/csv-utils";
import {
  parseCustomerCSV, csvRowToInput, downloadCustomerTemplateXLSX,
  type ParsedCustomerCSV,
} from "@/lib/customer-csv";
import { findOrCreateCustomer } from "@/lib/customer-service";
import type { Customer } from "@/lib/customer-data";

export function CustomerImportDialog({
  open,
  onClose,
  customers,
  addCustomer,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  /** Live master used for dedup. */
  customers: Customer[];
  /** Persist a new customer. */
  addCustomer: (c: Customer) => Promise<void> | void;
  /** Called after a completed import with a summary. */
  onDone?: (summary: { added: number; skipped: number }) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<ParsedCustomerCSV | null>(null);
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ added: number; skipped: number } | null>(null);

  function reset() {
    setParsed(null); setFileName(""); setError(null); setResult(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function handleClose() { reset(); onClose(); }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null); setResult(null);
    setFileName(file.name);
    try {
      // Accept Excel (.xlsx/.xls/.xlsm) and CSV — the shared reader converts
      // either to CSV text so the same parser handles both.
      const text = await readSpreadsheetFileToCSV(file);
      const p = parseCustomerCSV(text);
      if (p.missingRequired.length > 0) {
        setError(`Missing required column(s): ${p.missingRequired.join(", ")}. Download the template for the exact format.`);
        setParsed(null);
        return;
      }
      if (p.rows.length === 0) { setError("No data rows found in the file."); setParsed(null); return; }
      setParsed(p);
    } catch {
      setError("Could not read the file. Please upload a valid Excel (.xlsx/.xls) or CSV file.");
    }
  }

  async function runImport() {
    if (!parsed) return;
    setBusy(true);
    let added = 0, skipped = 0;
    // Dedup against a growing working set so duplicates WITHIN the file are also
    // collapsed, not just against the existing master.
    const working = [...customers];
    try {
      for (const row of parsed.rows) {
        const input = csvRowToInput(row);
        if (!input) { skipped++; continue; }
        const res = findOrCreateCustomer(input, working);
        if (res.created) {
          await addCustomer(res.customer);
          working.unshift(res.customer);
          added++;
        } else {
          skipped++;
        }
      }
      const summary = { added, skipped };
      setResult(summary);
      onDone?.(summary);
    } finally {
      setBusy(false);
    }
  }

  return (
    <RoxCenteredForm
      open={open}
      onClose={handleClose}
      title="Import Customers"
      subtitle="Upload an Excel (.xlsx/.xls) or CSV file to add many customers at once. Duplicates (by phone/email) are skipped automatically."
      icon={UploadCloud}
      width="max-w-lg"
      footer={
        <>
          <Button variant="outline" onClick={handleClose}>Close</Button>
          <div className="flex items-center gap-2">
            <Button variant="soft" onClick={() => { void downloadCustomerTemplateXLSX(); }}>
              <Download className="h-4 w-4" /> Excel Template
            </Button>
            <Button onClick={runImport} loading={busy} disabled={!parsed || busy || !!result}>
              <UploadCloud className="h-4 w-4" /> Import {parsed ? `${parsed.rows.length}` : ""}
            </Button>
          </div>
        </>
      }
    >
      <div className="space-y-4">
        {/* Upload */}
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="flex w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-zinc-300 bg-muted/30 px-4 py-8 text-center transition hover:border-[#4361EE] hover:bg-[#EEF1FD]/40"
        >
          <FileSpreadsheet className="h-8 w-8 text-[#4361EE]" />
          <span className="text-[13px] font-semibold text-zinc-700">
            {fileName || "Click to choose an Excel or CSV file"}
          </span>
          <span className="text-[11px] text-muted-foreground">
            First Name + Mobile are required. Supported: .xlsx, .xls, .csv. Download the Excel template for the exact columns.
          </span>
          <input ref={fileRef} type="file" accept={SPREADSHEET_ACCEPT} className="hidden" onChange={onFile} />
        </button>

        {error && (
          <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-[12.5px] font-medium text-rose-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
          </div>
        )}

        {parsed && !result && (
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-[13px] font-semibold">{parsed.rows.length} row{parsed.rows.length === 1 ? "" : "s"} ready to import</p>
            <p className="mt-0.5 text-[11.5px] text-muted-foreground">
              Existing customers (matched by phone/email) will be skipped — only new people are added, tagged “Imported”.
            </p>
          </div>
        )}

        {result && (
          <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-[12.5px] font-medium text-emerald-700">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            Imported {result.added} new customer{result.added === 1 ? "" : "s"}. {result.skipped} skipped (duplicates or empty rows).
          </div>
        )}
      </div>
    </RoxCenteredForm>
  );
}
