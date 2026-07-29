"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X, Lock, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { cn, formatINR } from "@/lib/utils";
import { closeDay, type DailySummary } from "@/lib/daily-ledger-service";

interface CloseDayModalProps {
  open: boolean;
  onClose: () => void;
  summary: DailySummary;
  onSuccess?: () => void;
}

export function CloseDayModal({ open, onClose, summary, onSuccess }: CloseDayModalProps) {
  const [actualCash, setActualCash] = useState(String(summary.closingCash));
  const [actualBank, setActualBank] = useState(String(summary.closingBank));
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const expectedCash = summary.closingCash;
  const expectedBank = summary.closingBank;
  const actualCashNum = parseFloat(actualCash) || 0;
  const actualBankNum = parseFloat(actualBank) || 0;
  const cashDiff = actualCashNum - expectedCash;
  const bankDiff = actualBankNum - expectedBank;
  const isBalanced = cashDiff === 0 && bankDiff === 0;
  const hasSmallDiff = Math.abs(cashDiff) <= 500 && Math.abs(bankDiff) <= 500;

  function handleClose() {
    setSaving(true);
    closeDay(summary.date, actualCashNum, actualBankNum, "Current User", notes || undefined);
    setTimeout(() => {
      setSaving(false);
      onSuccess?.();
      onClose();
    }, 400);
  }

  const dateDisplay = new Date(summary.date + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[9998] bg-foreground/40 backdrop-blur-[2px]"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
          >
            <div className="w-full max-w-lg rounded-2xl border border-border bg-card shadow-2xl overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between border-b border-border px-6 py-4">
                <div className="flex items-center gap-3">
                  <span className="grid h-9 w-9 place-items-center rounded-xl bg-amber-50 text-amber-600 ring-1 ring-inset ring-amber-200">
                    <Lock className="h-4.5 w-4.5" />
                  </span>
                  <div>
                    <h2 className="font-display text-lg font-bold tracking-tight">Close & Lock Day</h2>
                    <p className="text-[11px] text-muted-foreground">Closing {dateDisplay} — verify balances before locking</p>
                  </div>
                </div>
                <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg border border-border text-muted-foreground hover:bg-muted hover:text-foreground transition">
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Body */}
              <div className="px-6 py-5 space-y-5 max-h-[65vh] overflow-y-auto">
                {/* Opening Balance Summary */}
                <div className="rounded-xl border border-border p-4 bg-muted/30">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">Opening Balance</p>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-[11px] text-muted-foreground">Cash</p>
                      <p className="text-[14px] font-bold tabular-nums">{formatINR(summary.openingCash)}</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-muted-foreground">Bank</p>
                      <p className="text-[14px] font-bold tabular-nums">{formatINR(summary.openingBank)}</p>
                    </div>
                  </div>
                </div>

                {/* Expected vs Actual */}
                <div className="rounded-xl border border-border p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">Expected Closing</p>
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <p className="text-[11px] text-muted-foreground">Expected Cash</p>
                      <p className="text-[14px] font-bold tabular-nums text-emerald-600">{formatINR(expectedCash)}</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-muted-foreground">Expected Bank</p>
                      <p className="text-[14px] font-bold tabular-nums text-blue-600">{formatINR(expectedBank)}</p>
                    </div>
                  </div>

                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">Actual Closing (count & verify)</p>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label>Actual Cash (₹)</Label>
                      <Input
                        type="number"
                        value={actualCash}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setActualCash(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Actual Bank (₹)</Label>
                      <Input
                        type="number"
                        value={actualBank}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setActualBank(e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                {/* Difference */}
                <div className={cn(
                  "rounded-xl border p-4",
                  isBalanced ? "border-emerald-200 bg-emerald-50/50" : hasSmallDiff ? "border-amber-200 bg-amber-50/50" : "border-rose-200 bg-rose-50/50"
                )}>
                  <div className="flex items-center gap-2 mb-2">
                    {isBalanced ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    ) : (
                      <AlertTriangle className={cn("h-4 w-4", hasSmallDiff ? "text-amber-600" : "text-rose-600")} />
                    )}
                    <p className={cn("text-[12px] font-semibold", isBalanced ? "text-emerald-700" : hasSmallDiff ? "text-amber-700" : "text-rose-700")}>
                      {isBalanced ? "Perfectly Balanced" : "Difference Detected"}
                    </p>
                  </div>

                  {!isBalanced && (
                    <div className="grid grid-cols-2 gap-4 mt-2">
                      <div>
                        <p className="text-[11px] text-muted-foreground">Cash Difference</p>
                        <p className={cn("text-[13px] font-bold tabular-nums", cashDiff === 0 ? "text-emerald-600" : cashDiff > 0 ? "text-amber-600" : "text-rose-600")}>
                          {cashDiff >= 0 ? "+" : ""}{formatINR(cashDiff)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] text-muted-foreground">Bank Difference</p>
                        <p className={cn("text-[13px] font-bold tabular-nums", bankDiff === 0 ? "text-emerald-600" : bankDiff > 0 ? "text-amber-600" : "text-rose-600")}>
                          {bankDiff >= 0 ? "+" : ""}{formatINR(bankDiff)}
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Notes */}
                <div className="space-y-1.5">
                  <Label>Notes (optional)</Label>
                  <Textarea
                    value={notes}
                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setNotes(e.target.value)}
                    placeholder="Any notes about today's closing…"
                    className="min-h-[64px]"
                  />
                </div>

                {/* Warning if day is not balanced */}
                {!isBalanced && !hasSmallDiff && (
                  <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3">
                    <AlertTriangle className="h-4 w-4 text-rose-600 mt-0.5 shrink-0" />
                    <p className="text-[11px] text-rose-700">
                      Large difference detected. Please recount or record an adjustment entry before closing. You can still close, but this will be flagged in the audit trail.
                    </p>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-3 border-t border-border px-6 py-4">
                <Button variant="ghost" size="md" onClick={onClose}>Cancel</Button>
                <Button
                  variant="primary"
                  size="md"
                  loading={saving}
                  onClick={handleClose}
                >
                  <Lock className="h-3.5 w-3.5" />
                  Close & Lock Day
                </Button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
