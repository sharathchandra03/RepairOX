"use client";

/* ──────────────────────────────────────────────────────────────────────────
   Walk-In CSV / Excel import — the sales team's spreadsheet is the source of
   truth, so this importer must understand it faithfully.

   Flow: File select → Column recognition + mapping → Preview → Validation
   (unknown Type/Source, invalid date/contact, duplicates) → Confirm → Summary.

   Historical safety:
     • Existing WK ids in the file are preserved when present; blank ids get a
       freshly generated WK number.
     • Historical dates are preserved (never replaced with today's date).
     • Unknown sources/types/statuses are surfaced, never silently dropped.
   ────────────────────────────────────────────────────────────────────────── */

import { useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { Upload, FileText, FileSpreadsheet, CheckCircle2, AlertTriangle, X, Copy, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useStore } from "@/lib/store";
import {
  parseWalkInCsv,
  readSpreadsheetToCsvText,
  isRowValid,
  nextWalkInNumber,
  formatWalkInNumber,
  walkInSeq,
  genWalkInId,
  getWalkInSources,
  WALKIN_COLUMN_LABELS,
  WALKIN_IMPORT_ACCEPT,
  type ParsedWalkInRow,
  type WalkInColumnKey,
} from "@/lib/walk-in-data";
import { createCustomer } from "@/lib/customer-data";
import { walkInTypeToCustomerSource } from "@/lib/walk-in-data";
import {
  type WalkIn,
  WALKIN_TYPE_LABEL,
  WALKIN_STATUS_LABEL,
} from "@/lib/mock-data";

type Stage = "select" | "review" | "done";

export function WalkInImportModal({
  open,
  onClose,
  onImported,
}: {
  open: boolean;
  onClose: () => void;
  onImported: (count: number) => void;
}) {
  const { walkIns, addWalkIn, customers, addCustomer } = useStore();
  const [stage, setStage] = useState<Stage>("select");
  const [fileName, setFileName] = useState("");
  const [parsed, setParsed] = useState<ReturnType<typeof parseWalkInCsv> | null>(null);
  const [skipInvalid, setSkipInvalid] = useState(true);
  const [importing, setImporting] = useState(false);
  const [reading, setReading] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [summary, setSummary] = useState<{ imported: number; skipped: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function reset() {
    setStage("select");
    setFileName("");
    setParsed(null);
    setSummary(null);
    setSkipInvalid(true);
    setImporting(false);
    setReading(false);
    setParseError(null);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleFile(file: File) {
    setParseError(null);
    setReading(true);
    setFileName(file.name);
    try {
      const text = await readSpreadsheetToCsvText(file);
      if (!text.trim()) {
        setParseError("That file appears to be empty. Check the first sheet has a header row and data.");
        setReading(false);
        return;
      }
      const result = parseWalkInCsv(text, getWalkInSources());
      if (result.rows.length === 0) {
        setParseError("No data rows were found. Make sure the sheet has a header row followed by walk-in rows.");
        setReading(false);
        return;
      }
      setParsed(result);
      setStage("review");
    } catch (err) {
      console.error("[walk-in import] failed to read file:", err);
      setParseError("We couldn't read that file. Please upload a valid CSV or Excel (.xlsx/.xls) file.");
    } finally {
      setReading(false);
    }
  }

  /* ── Duplicate detection (against existing walk-ins) ── */
  const dupFlags = useMemo(() => {
    if (!parsed) return [];
    const existingKeys = new Set(
      walkIns.map((w) => `${(w.phone || "").replace(/\D/g, "")}|${(w.model || "").toLowerCase()}`),
    );
    const seen = new Set<string>();
    return parsed.rows.map((r) => {
      const key = `${(r.data.phone || "").replace(/\D/g, "")}|${(r.data.model || "").toLowerCase()}`;
      const isDup = key !== "|" && (existingKeys.has(key) || seen.has(key));
      seen.add(key);
      return isDup;
    });
  }, [parsed, walkIns]);

  const stats = useMemo(() => {
    if (!parsed) return null;
    const rows = parsed.rows;
    const willImport = rows.filter((r, i) => {
      if (dupFlags[i]) return false;
      if (!isRowValid(r) && skipInvalid) return false;
      return true;
    }).length;
    return {
      total: rows.length,
      valid: rows.filter((r) => isRowValid(r)).length,
      needsFix: rows.filter((r) => !isRowValid(r)).length,
      duplicates: dupFlags.filter(Boolean).length,
      unknownType: rows.filter((r) => r.unknownType).length,
      unknownSource: rows.filter((r) => r.unknownSource).length,
      invalidDate: rows.filter((r) => r.invalidDate).length,
      invalidContact: rows.filter((r) => r.invalidContact).length,
      willImport,
    };
  }, [parsed, dupFlags, skipInvalid]);

  async function runImport() {
    if (!parsed) return;
    setImporting(true);

    // Decide which rows to import.
    const toImport = parsed.rows.filter((r, i) => {
      if (dupFlags[i]) return false; // never import detected duplicates
      if (!isRowValid(r) && skipInvalid) return false;
      return true;
    });

    // Seed the WK counter from the highest existing/imported number so we never
    // reuse a number and historical ids are preserved when present.
    let maxSeq = walkIns.reduce((m, w) => Math.max(m, walkInSeq(w.walkInNumber), walkInSeq(w.id)), 0);
    // Also honour any WK-shaped ids already in the file.
    for (const r of parsed.rows) maxSeq = Math.max(maxSeq, walkInSeq(r.sourceId));

    let imported = 0;
    for (const r of toImport) {
      // Preserve a historical WK id when the file carries one; else generate.
      let walkInNumber: string;
      const fileSeq = walkInSeq(r.sourceId);
      if (fileSeq > 0) {
        walkInNumber = formatWalkInNumber(fileSeq);
      } else {
        maxSeq += 1;
        walkInNumber = formatWalkInNumber(maxSeq);
      }

      // Link/create the customer without duplicating the master.
      let customerId: string | undefined;
      const phoneDigits = (r.data.phone || "").replace(/\D/g, "");
      const existingCust = phoneDigits
        ? customers.find((c) => c.mobile.replace(/\D/g, "") === phoneDigits)
        : undefined;
      if (existingCust) {
        customerId = existingCust.id;
      } else if (r.data.customer && r.data.customer !== "Unknown" && phoneDigits) {
        const [first, ...rest] = r.data.customer.split(" ");
        // Tag the new customer's ORIGIN from the walk-in Type so it carries the
        // correct badge in the Customer Master (Direct → Direct Walk-In, Sales → Sales).
        const created = createCustomer({
          firstName: first,
          lastName: rest.join(" "),
          mobile: r.data.phone || "",
          email: r.data.email || "",
          source: walkInTypeToCustomerSource(r.data.type),
        });
        addCustomer(created);
        customerId = created.id;
      }

      const record: WalkIn = {
        id: genWalkInId(),
        walkInNumber,
        date: r.data.date || new Date().toISOString().slice(0, 10),
        time: "",
        type: r.data.type,
        customer: r.data.customer || "Unknown",
        phone: r.data.phone || "",
        email: r.data.email || "",
        source: r.data.source || "",
        category: "",
        model: r.data.model || "",
        issue: r.data.issue || "",
        reasons: [],
        status: r.data.status || "visitor",
        customerId,
        // NOTE (spec §47): historical rows marked "Converted Ticket" but with no
        // ticket in the file keep that status WITHOUT inventing a linked ticket.
        linkedTicketId: undefined,
        invoiceValue: 0,
        businessValue: 0,
      };
      // eslint-disable-next-line no-await-in-loop
      await addWalkIn(record);
      imported += 1;
    }

    setSummary({ imported, skipped: parsed.rows.length - imported });
    setImporting(false);
    setStage("done");
    onImported(imported);
  }

  if (!open || typeof document === "undefined") return null;

  const mappedCols = parsed
    ? (Object.keys(parsed.mapping) as WalkInColumnKey[])
    : [];

  return createPortal(
    <div className="fixed inset-0 z-[9999] grid place-items-center bg-black/60 p-4 backdrop-blur-sm" onClick={handleClose}>
      <motion.div
        initial={{ scale: 0.96, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-card shadow-2xl ring-1 ring-border"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-50 text-[#4361EE] ring-1 ring-inset ring-indigo-200">
              <Upload className="h-5 w-5" />
            </span>
            <div>
              <h3 className="font-display text-base font-bold">Import Walk-Ins</h3>
              <p className="text-xs text-muted-foreground">Upload your Excel (.xlsx/.xls) or CSV sales sheet directly.</p>
            </div>
          </div>
          <button onClick={handleClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {/* ── Stage: select ── */}
          {stage === "select" && (
            <div className="space-y-4">
              <button
                onClick={() => !reading && fileRef.current?.click()}
                disabled={reading}
                className="flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-border bg-muted/40 px-6 py-10 text-center transition hover:border-[#4361EE]/40 hover:bg-[#EEF1FD]/50 disabled:cursor-wait disabled:opacity-70"
              >
                {reading ? (
                  <>
                    <Loader2 className="h-8 w-8 animate-spin text-[#4361EE]" />
                    <p className="text-sm font-semibold">Reading {fileName}…</p>
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-2 text-[#4361EE]">
                      <FileSpreadsheet className="h-8 w-8" />
                      <FileText className="h-8 w-8" />
                    </div>
                    <p className="text-sm font-semibold">Choose a CSV or Excel file</p>
                    <p className="text-xs text-muted-foreground">Recognised columns: Date, ID, Type, Source, Name, Contact, Email, Model, Issue, Final Status</p>
                  </>
                )}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept={WALKIN_IMPORT_ACCEPT}
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.currentTarget.value = ""; }}
              />
              {parseError ? (
                <div className="flex items-start gap-2 rounded-xl bg-rose-50 px-3 py-2 text-[12px] text-rose-700 ring-1 ring-inset ring-rose-200">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>{parseError}</span>
                </div>
              ) : (
                <p className="text-[11px] text-muted-foreground">
                  Supported formats: <span className="font-medium text-foreground">.csv, .xlsx, .xls</span>. The first sheet of an Excel workbook is imported.
                </p>
              )}
            </div>
          )}

          {/* ── Stage: review ── */}
          {stage === "review" && parsed && stats && (
            <div className="space-y-5">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <FileText className="h-3.5 w-3.5" /> {fileName}
              </div>

              {/* Column recognition */}
              <div>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Recognised Columns</p>
                <div className="flex flex-wrap gap-1.5">
                  {mappedCols.map((k) => (
                    <span key={k} className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200">
                      <CheckCircle2 className="h-3 w-3" /> {WALKIN_COLUMN_LABELS[k]}
                    </span>
                  ))}
                  {parsed.unmapped.map((h) => (
                    <span key={h} className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-700 ring-1 ring-inset ring-amber-200" title="Not mapped — will be ignored">
                      <AlertTriangle className="h-3 w-3" /> {h}
                    </span>
                  ))}
                </div>
              </div>

              {/* Validation summary */}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <StatCard label="Rows detected" value={stats.total} />
                <StatCard label="Valid rows" value={stats.valid} tone="emerald" />
                <StatCard label="Needs correction" value={stats.needsFix} tone={stats.needsFix ? "amber" : undefined} />
                <StatCard label="Duplicates" value={stats.duplicates} tone={stats.duplicates ? "rose" : undefined} />
              </div>
              {(stats.unknownType > 0 || stats.unknownSource > 0 || stats.invalidDate > 0 || stats.invalidContact > 0) && (
                <div className="flex flex-wrap gap-2 text-[11px]">
                  {stats.unknownType > 0 && <Flag>{stats.unknownType} unknown Type</Flag>}
                  {stats.unknownSource > 0 && <Flag>{stats.unknownSource} unknown Source</Flag>}
                  {stats.invalidDate > 0 && <Flag>{stats.invalidDate} invalid date</Flag>}
                  {stats.invalidContact > 0 && <Flag>{stats.invalidContact} invalid contact</Flag>}
                </div>
              )}

              {/* Preview */}
              <div>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Preview (first 8 rows)</p>
                <div className="overflow-x-auto rounded-xl border border-border">
                  <table className="w-full text-[12px]">
                    <thead className="bg-muted/60 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      <tr>
                        <th className="px-2 py-2">Date</th>
                        <th className="px-2 py-2">Type</th>
                        <th className="px-2 py-2">Source</th>
                        <th className="px-2 py-2">Name</th>
                        <th className="px-2 py-2">Contact</th>
                        <th className="px-2 py-2">Model</th>
                        <th className="px-2 py-2">Status</th>
                        <th className="px-2 py-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {parsed.rows.slice(0, 8).map((r, i) => (
                        <PreviewRow key={i} row={r} dup={dupFlags[i]} />
                      ))}
                    </tbody>
                  </table>
                </div>
                {parsed.rows.length > 8 && (
                  <p className="mt-1 text-[11px] text-muted-foreground">and {parsed.rows.length - 8} more…</p>
                )}
              </div>

              {stats.needsFix > 0 && (
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <input type="checkbox" checked={skipInvalid} onChange={(e) => setSkipInvalid(e.target.checked)} className="h-4 w-4 rounded border-zinc-300 text-[#4361EE]" />
                  Skip {stats.needsFix} row{stats.needsFix !== 1 ? "s" : ""} that need correction (uncheck to import them anyway)
                </label>
              )}
            </div>
          )}

          {/* ── Stage: done ── */}
          {stage === "done" && summary && (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <CheckCircle2 className="h-12 w-12 text-emerald-500" />
              <p className="text-lg font-bold">Import complete</p>
              <p className="text-sm text-muted-foreground">
                Imported <span className="font-semibold text-foreground">{summary.imported}</span> walk-in{summary.imported !== 1 ? "s" : ""}
                {summary.skipped > 0 && <> · skipped {summary.skipped}</>}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-4">
          {stage === "review" && (
            <>
              <Button variant="secondary" size="sm" onClick={reset}>Back</Button>
              <Button
                size="sm"
                loading={importing}
                disabled={!stats || stats.willImport === 0}
                onClick={runImport}
              >
                <Upload className="h-3.5 w-3.5" /> Import{stats ? ` ${stats.willImport}` : ""} Record{stats && stats.willImport !== 1 ? "s" : ""}
              </Button>
            </>
          )}
          {stage === "done" && <Button size="sm" onClick={handleClose}>Done</Button>}
          {stage === "select" && <Button variant="secondary" size="sm" onClick={handleClose}>Cancel</Button>}
        </div>
      </motion.div>
    </div>,
    document.body,
  );
}

function StatCard({ label, value, tone }: { label: string; value: number; tone?: "emerald" | "amber" | "rose" }) {
  const toneCls =
    tone === "emerald" ? "text-emerald-600" :
    tone === "amber" ? "text-amber-600" :
    tone === "rose" ? "text-rose-600" : "text-foreground";
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`font-display text-xl font-bold ${toneCls}`}>{value}</p>
    </div>
  );
}

function Flag({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 font-medium text-amber-700 ring-1 ring-inset ring-amber-200">
      <AlertTriangle className="h-3 w-3" /> {children}
    </span>
  );
}

function PreviewRow({ row, dup }: { row: ParsedWalkInRow; dup: boolean }) {
  const invalid = !isRowValid(row);
  return (
    <tr className={`border-t border-border ${invalid ? "bg-amber-50/40" : dup ? "bg-rose-50/40" : ""}`}>
      <td className="px-2 py-1.5 whitespace-nowrap">{row.data.date}</td>
      <td className="px-2 py-1.5">{row.data.type ? WALKIN_TYPE_LABEL[row.data.type] : "—"}</td>
      <td className="px-2 py-1.5">{row.data.source || "—"}</td>
      <td className="px-2 py-1.5">{row.data.customer}</td>
      <td className="px-2 py-1.5 whitespace-nowrap">{row.data.phone || "—"}</td>
      <td className="px-2 py-1.5">{row.data.model || "—"}</td>
      <td className="px-2 py-1.5">{row.data.status ? WALKIN_STATUS_LABEL[row.data.status] : "—"}</td>
      <td className="px-2 py-1.5">
        {dup ? (
          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-rose-600" title="Duplicate — will be skipped"><Copy className="h-3 w-3" /> Dup</span>
        ) : invalid ? (
          <span className="text-[10px] font-medium text-amber-600" title={row.issues.join(", ")}>Check</span>
        ) : (
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
        )}
      </td>
    </tr>
  );
}
