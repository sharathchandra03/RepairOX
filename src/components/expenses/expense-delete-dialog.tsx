"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea, Label } from "@/components/ui/input";
import { formatINR } from "@/lib/utils";
import { type Expense, cancelExpense } from "@/lib/expense-store";
import { useLedger } from "@/lib/accounting-service";
import { emitExpenseCancelled } from "@/lib/expense-accounting-emitter";
import { CURRENT_USER } from "@/lib/permissions";

/* ─── Props ──────────────────────────────────────────────────────── */

interface ExpenseDeleteDialogProps {
  expense: Expense | null;
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

/* ─── Component ──────────────────────────────────────────────────── */

export function ExpenseDeleteDialog({ expense, open, onClose, onSuccess }: ExpenseDeleteDialogProps) {
  const [reason, setReason] = React.useState("");
  const [mounted, setMounted] = React.useState(false);
  const accounting = useLedger();

  React.useEffect(() => { setMounted(true); }, []);
  React.useEffect(() => { if (open) setReason(""); }, [open]);

  const canConfirm = reason.trim().length >= 3;

  const handleConfirm = () => {
    if (!expense || !canConfirm) return;

    const actor = CURRENT_USER.name;

    // 1. Soft-delete (mark as cancelled in the store)
    cancelExpense(expense.id, reason.trim(), actor);

    // 2. Emit accounting event (reverses ledger entry + logs activity)
    emitExpenseCancelled(expense, reason.trim(), accounting, actor);

    // 3. Notify parent
    onSuccess?.();
    onClose();
  };

  if (!expense) return null;

  const content = (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[9999] bg-foreground/40 backdrop-blur-[2px]"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 20 }}
            transition={{ type: "spring", stiffness: 320, damping: 34 }}
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
          >
            <div className="w-full max-w-md rounded-2xl border border-border bg-card shadow-2xl">
              {/* Header */}
              <div className="flex items-center justify-between border-b border-border p-5">
                <div className="flex items-center gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-rose-50 text-rose-600 ring-1 ring-inset ring-rose-200">
                    <AlertTriangle className="h-5 w-5" />
                  </span>
                  <div>
                    <h2 className="font-display text-lg font-bold tracking-tight text-rose-700">Delete Expense</h2>
                    <p className="text-[12px] text-muted-foreground">This action cannot be undone</p>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-border text-muted-foreground transition hover:bg-muted hover:text-foreground"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Body */}
              <div className="p-5 space-y-4">
                {/* Expense Summary */}
                <div className="rounded-xl border border-rose-100 bg-rose-50/50 p-4 space-y-1">
                  <p className="text-sm font-medium">{expense.description}</p>
                  <div className="flex items-center gap-3 text-[12px] text-muted-foreground">
                    <span className="font-mono text-rose-600">{expense.expenseId}</span>
                    <span className="h-3 w-px bg-border" />
                    <span className="font-semibold text-foreground">{formatINR(expense.amount)}</span>
                    <span className="h-3 w-px bg-border" />
                    <span>{expense.category}</span>
                  </div>
                </div>

                {/* Warning */}
                <div className="text-[13px] text-zinc-600 space-y-1.5">
                  <p>Deleting this expense will:</p>
                  <ul className="list-disc list-inside space-y-0.5 text-[12px] text-muted-foreground ml-1">
                    <li>Mark the expense as <span className="font-medium text-rose-600">cancelled</span> (soft-delete)</li>
                    <li>Reverse the linked ledger entry</li>
                    <li>Record the action in the Activity Log</li>
                  </ul>
                </div>

                {/* Reason (required) */}
                <div className="space-y-1.5">
                  <Label>Reason for deletion *</Label>
                  <Textarea
                    value={reason}
                    onChange={(e: any) => setReason(e.target.value)}
                    placeholder="Why is this expense being deleted? (min 3 characters)"
                    className="min-h-[80px]"
                  />
                  {reason.length > 0 && reason.trim().length < 3 && (
                    <p className="text-[11px] text-rose-500">Please provide at least 3 characters.</p>
                  )}
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-3 border-t border-border p-5">
                <Button variant="outline" size="md" onClick={onClose}>
                  Cancel
                </Button>
                <Button variant="destructive" size="md" onClick={handleConfirm} disabled={!canConfirm}>
                  Confirm Deletion
                </Button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );

  if (!mounted) return null;
  return createPortal(content, document.body);
}
