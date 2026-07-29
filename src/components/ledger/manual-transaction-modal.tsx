"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea, Select } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  recordTransaction,
  type ManualTransactionType,
  type PaymentMode,
  type TransactionCategory,
  type TransactionDirection,
} from "@/lib/daily-ledger-service";

const TRANSACTION_TYPES: { label: string; value: ManualTransactionType }[] = [
  { label: "Cash In", value: "Cash In" },
  { label: "Cash Out", value: "Cash Out" },
  { label: "Transfer", value: "Transfer" },
  { label: "Adjustment", value: "Adjustment" },
];

const PAYMENT_MODES: { label: string; value: PaymentMode }[] = [
  { label: "Cash", value: "Cash" },
  { label: "Bank", value: "Bank" },
  { label: "UPI", value: "UPI" },
  { label: "Card", value: "Card" },
  { label: "Cheque", value: "Cheque" },
];

const CATEGORIES: { label: string; value: TransactionCategory }[] = [
  { label: "Service Revenue", value: "Service Revenue" },
  { label: "Parts Revenue", value: "Parts Revenue" },
  { label: "Salary Expense", value: "Salary Expense" },
  { label: "Rent Expense", value: "Rent Expense" },
  { label: "Utilities", value: "Utilities" },
  { label: "Office Supplies", value: "Office Supplies" },
  { label: "Marketing", value: "Marketing" },
  { label: "Fuel & Travel", value: "Fuel & Travel" },
  { label: "Courier & Shipping", value: "Courier & Shipping" },
  { label: "Transfer", value: "Transfer" },
  { label: "Adjustment", value: "Adjustment" },
  { label: "Miscellaneous", value: "Miscellaneous" },
];

interface ManualTransactionModalProps {
  open: boolean;
  onClose: () => void;
  date: string;
  onSuccess?: () => void;
}

export function ManualTransactionModal({ open, onClose, date, onSuccess }: ManualTransactionModalProps) {
  const [txType, setTxType] = useState<ManualTransactionType>("Cash In");
  const [paymentMode, setPaymentMode] = useState<PaymentMode>("Cash");
  const [category, setCategory] = useState<TransactionCategory>("Miscellaneous");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  function deriveDirection(): TransactionDirection {
    if (txType === "Cash In") return "inflow";
    if (txType === "Cash Out") return "outflow";
    if (txType === "Transfer") return "outflow";
    return "inflow"; // Adjustment defaults to inflow
  }

  function deriveCashOrBank(): "Cash" | "Bank" {
    if (paymentMode === "Cash") return "Cash";
    return "Bank";
  }

  function handleSave() {
    if (!amount || parseFloat(amount) <= 0 || !description.trim()) return;
    setSaving(true);

    recordTransaction({
      date,
      module: "Manual",
      referenceId: reference.trim() || `MAN-${Date.now().toString(36).toUpperCase().slice(-4)}`,
      description: description.trim(),
      category,
      paymentMode,
      cashOrBank: deriveCashOrBank(),
      direction: deriveDirection(),
      amount: parseFloat(amount),
      employee: "Current User",
      createdBy: "Current User",
    });

    // Reset form
    setTimeout(() => {
      setSaving(false);
      setTxType("Cash In");
      setPaymentMode("Cash");
      setCategory("Miscellaneous");
      setAmount("");
      setDescription("");
      setReference("");
      setNotes("");
      onSuccess?.();
      onClose();
    }, 300);
  }

  const isValid = amount && parseFloat(amount) > 0 && description.trim().length > 0;

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[9998] bg-foreground/40 backdrop-blur-[2px]"
          />
          {/* Modal */}
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
                  <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#EEF1FD] text-[#4361EE]">
                    <Plus className="h-4.5 w-4.5" />
                  </span>
                  <div>
                    <h2 className="font-display text-lg font-bold tracking-tight">Manual Transaction</h2>
                    <p className="text-[11px] text-muted-foreground">Record a manual entry for {new Date(date + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</p>
                  </div>
                </div>
                <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg border border-border text-muted-foreground hover:bg-muted hover:text-foreground transition">
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Body */}
              <div className="px-6 py-5 space-y-4 max-h-[65vh] overflow-y-auto">
                {/* Transaction Type */}
                <div className="space-y-1.5">
                  <Label>Transaction Type</Label>
                  <div className="flex gap-2">
                    {TRANSACTION_TYPES.map((t) => (
                      <button
                        key={t.value}
                        onClick={() => setTxType(t.value)}
                        className={cn(
                          "flex-1 rounded-xl border px-3 py-2.5 text-[12px] font-semibold transition-all",
                          txType === t.value
                            ? "border-[#4361EE] bg-[#EEF1FD] text-[#4361EE] shadow-sm"
                            : "border-border bg-card text-muted-foreground hover:border-[#4361EE]/40"
                        )}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Payment Mode */}
                <div className="space-y-1.5">
                  <Label>Payment Mode</Label>
                  <Select
                    value={paymentMode}
                    onChange={(e) => setPaymentMode(e.target.value as PaymentMode)}
                    options={PAYMENT_MODES}
                  />
                </div>

                {/* Category */}
                <div className="space-y-1.5">
                  <Label>Category</Label>
                  <Select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as TransactionCategory)}
                    options={CATEGORIES}
                  />
                </div>

                {/* Amount */}
                <div className="space-y-1.5">
                  <Label>Amount (₹)</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={amount}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAmount(e.target.value)}
                    placeholder="Enter amount"
                  />
                </div>

                {/* Description */}
                <div className="space-y-1.5">
                  <Label>Description</Label>
                  <Input
                    value={description}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDescription(e.target.value)}
                    placeholder="Brief description of this transaction"
                  />
                </div>

                {/* Reference */}
                <div className="space-y-1.5">
                  <Label>Reference (optional)</Label>
                  <Input
                    value={reference}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setReference(e.target.value)}
                    placeholder="e.g. receipt number, voucher ID"
                  />
                </div>

                {/* Internal Notes */}
                <div className="space-y-1.5">
                  <Label>Internal Notes (optional)</Label>
                  <Textarea
                    value={notes}
                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setNotes(e.target.value)}
                    placeholder="Any internal notes for this entry…"
                    className="min-h-[72px]"
                  />
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-3 border-t border-border px-6 py-4">
                <Button variant="ghost" size="md" onClick={onClose}>Cancel</Button>
                <Button
                  variant="primary"
                  size="md"
                  loading={saving}
                  disabled={!isValid}
                  onClick={handleSave}
                >
                  Save Transaction
                </Button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
