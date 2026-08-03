"use client";

/**
 * Bulk Download Dialog — lets users choose between Individual PDFs or ZIP.
 * Shows progress during generation. Handles errors gracefully.
 */

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, FileDown, Archive, Download, CheckCircle2, AlertTriangle, RotateCcw, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BulkDownloadFormat, BulkDownloadProgress } from "@/lib/pdf-generator";

/* ─── Types ──────────────────────────────────────────────────────────── */

interface BulkDownloadDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  count: number;
  onDownload: (format: BulkDownloadFormat) => void;
  progress: BulkDownloadProgress | null;
  onRetryFailed?: () => void;
}

/* ─── Component ──────────────────────────────────────────────────────── */

export function BulkDownloadDialog({
  open,
  onClose,
  title,
  count,
  onDownload,
  progress,
  onRetryFailed,
}: BulkDownloadDialogProps) {
  const [format, setFormat] = useState<BulkDownloadFormat>("individual");

  const isProcessing = progress !== null && progress.phase !== "complete" && progress.phase !== "error";
  const isComplete = progress?.phase === "complete";
  const hasErrors = progress?.phase === "error";

  const handleDownload = useCallback(() => {
    onDownload(format);
  }, [format, onDownload]);

  if (!open) return null;

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
            onClick={!isProcessing ? onClose : undefined}
          />

          {/* Dialog */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ type: "spring", duration: 0.3 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
          >
            <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl border border-border overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between border-b border-border px-6 py-4">
                <div className="flex items-center gap-3">
                  <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#EEF1FD] text-[#4361EE]">
                    <Download className="h-4.5 w-4.5" />
                  </span>
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">{title}</h3>
                    <p className="text-[11px] text-muted-foreground">{count} document{count !== 1 ? "s" : ""} selected</p>
                  </div>
                </div>
                {!isProcessing && (
                  <button
                    onClick={onClose}
                    className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              {/* Body */}
              <div className="px-6 py-5">
                {/* Format Selection (only show if not processing) */}
                {!progress && (
                  <>
                    <p className="text-xs font-medium text-muted-foreground mb-3">Choose Format</p>
                    <div className="space-y-2.5">
                      {/* Individual PDFs */}
                      <label
                        className={cn(
                          "flex items-center gap-3.5 rounded-xl border p-4 cursor-pointer transition-all",
                          format === "individual"
                            ? "border-[#4361EE] bg-[#EEF1FD]/50 ring-1 ring-[#4361EE]/20"
                            : "border-border hover:border-[#4361EE]/40 hover:bg-muted/30"
                        )}
                      >
                        <input
                          type="radio"
                          name="download-format"
                          value="individual"
                          checked={format === "individual"}
                          onChange={() => setFormat("individual")}
                          className="h-4 w-4 border-gray-300 text-[#4361EE] focus:ring-[#4361EE]/30"
                        />
                        <span className="grid h-9 w-9 place-items-center rounded-lg bg-white border border-border shadow-sm">
                          <FileDown className="h-4 w-4 text-[#4361EE]" />
                        </span>
                        <div className="flex-1">
                          <p className="text-[13px] font-semibold text-foreground">Individual PDFs</p>
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            Downloads every document separately
                          </p>
                        </div>
                        <span className="rounded-md bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                          Default
                        </span>
                      </label>

                      {/* ZIP Package */}
                      <label
                        className={cn(
                          "flex items-center gap-3.5 rounded-xl border p-4 cursor-pointer transition-all",
                          format === "zip"
                            ? "border-[#4361EE] bg-[#EEF1FD]/50 ring-1 ring-[#4361EE]/20"
                            : "border-border hover:border-[#4361EE]/40 hover:bg-muted/30"
                        )}
                      >
                        <input
                          type="radio"
                          name="download-format"
                          value="zip"
                          checked={format === "zip"}
                          onChange={() => setFormat("zip")}
                          className="h-4 w-4 border-gray-300 text-[#4361EE] focus:ring-[#4361EE]/30"
                        />
                        <span className="grid h-9 w-9 place-items-center rounded-lg bg-white border border-border shadow-sm">
                          <Archive className="h-4 w-4 text-violet-600" />
                        </span>
                        <div className="flex-1">
                          <p className="text-[13px] font-semibold text-foreground">ZIP Package</p>
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            All documents in a single .zip file
                          </p>
                        </div>
                      </label>
                    </div>
                  </>
                )}

                {/* Progress */}
                {progress && (
                  <div className="space-y-4">
                    {/* Progress Bar */}
                    {isProcessing && (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin text-[#4361EE]" />
                          <p className="text-[13px] font-medium text-foreground">{progress.message}</p>
                        </div>
                        <div className="relative h-2 overflow-hidden rounded-full bg-muted">
                          <motion.div
                            className="absolute inset-y-0 left-0 rounded-full bg-[#4361EE]"
                            initial={{ width: 0 }}
                            animate={{ width: `${(progress.current / progress.total) * 100}%` }}
                            transition={{ duration: 0.3 }}
                          />
                        </div>
                        <p className="text-[11px] text-muted-foreground text-center">
                          {progress.current} of {progress.total}
                        </p>
                      </div>
                    )}

                    {/* Success */}
                    {isComplete && (
                      <div className="flex flex-col items-center gap-3 py-4">
                        <span className="grid h-12 w-12 place-items-center rounded-full bg-emerald-50 text-emerald-600">
                          <CheckCircle2 className="h-6 w-6" />
                        </span>
                        <div className="text-center">
                          <p className="text-sm font-semibold text-foreground">Download Complete</p>
                          <p className="text-[12px] text-muted-foreground mt-1">
                            {progress.successes.length} document{progress.successes.length !== 1 ? "s" : ""} downloaded successfully
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Errors */}
                    {hasErrors && (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50/60 p-3">
                          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                          <div>
                            <p className="text-[12px] font-medium text-amber-800">
                              {progress.successes.length} downloaded successfully, {progress.failures.length} failed
                            </p>
                          </div>
                        </div>
                        {progress.failures.length > 0 && (
                          <div className="max-h-24 overflow-y-auto rounded-lg border border-border bg-muted/30 p-2.5">
                            {progress.failures.map((f, i) => (
                              <p key={i} className="text-[11px] text-muted-foreground">
                                <span className="font-medium text-foreground">{f.id}</span>: {f.error}
                              </p>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-2.5 border-t border-border px-6 py-4">
                {!progress && (
                  <>
                    <button
                      onClick={onClose}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-white px-4 py-2 text-[13px] font-medium text-foreground transition hover:bg-muted"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleDownload}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-[#4361EE] px-4 py-2 text-[13px] font-medium text-white shadow-sm transition hover:bg-[#3651DE]"
                    >
                      <Download className="h-3.5 w-3.5" />
                      Download {count} PDF{count !== 1 ? "s" : ""}
                    </button>
                  </>
                )}

                {(isComplete || hasErrors) && (
                  <>
                    {hasErrors && onRetryFailed && (
                      <button
                        onClick={onRetryFailed}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-[13px] font-medium text-amber-800 transition hover:bg-amber-100"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        Retry Failed
                      </button>
                    )}
                    <button
                      onClick={onClose}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-[#4361EE] px-4 py-2 text-[13px] font-medium text-white shadow-sm transition hover:bg-[#3651DE]"
                    >
                      Done
                    </button>
                  </>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
