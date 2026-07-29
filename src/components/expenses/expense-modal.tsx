"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { X, Plus, Upload, Receipt, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea, NumericInput } from "@/components/ui/input";
import { RSelect } from "@/components/ui/rselect";
import {
  type Expense,
  type NewExpense,
  type PaymentMode,
  PAYMENT_MODE_OPTIONS,
  useExpenseCategories,
  addCategory,
  addExpense,
  updateExpense,
} from "@/lib/expense-store";
import { useLedger } from "@/lib/accounting-service";
import { emitExpenseCreated, emitExpenseUpdated } from "@/lib/expense-accounting-emitter";
import { CURRENT_USER } from "@/lib/permissions";

/* ─── Props ──────────────────────────────────────────────────────── */

interface ExpenseModalProps {
  open: boolean;
  onClose: () => void;
  editExpense?: Expense | null;
  onSuccess?: (expense: Expense) => void;
}

/* ─── Component ──────────────────────────────────────────────────── */

export function ExpenseModal({ open, onClose, editExpense, onSuccess }: ExpenseModalProps) {
  const categories = useExpenseCategories();
  const accounting = useLedger();
  const [mounted, setMounted] = React.useState(false);

  // Form state
  const [category, setCategory] = React.useState("");
  const [amount, setAmount] = React.useState(0);
  const [paymentMode, setPaymentMode] = React.useState<string>("cash");
  const [description, setDescription] = React.useState("");
  const [vendor, setVendor] = React.useState("");
  const [employee, setEmployee] = React.useState("");
  const [attachment, setAttachment] = React.useState<string | null>(null);
  const [attachmentName, setAttachmentName] = React.useState("");
  const [date, setDate] = React.useState("");
  const [time, setTime] = React.useState("");
  const [internalNotes, setInternalNotes] = React.useState("");

  // Inline new-category creation
  const [showNewCategory, setShowNewCategory] = React.useState(false);
  const [newCategoryLabel, setNewCategoryLabel] = React.useState("");
  const newCatRef = React.useRef<HTMLInputElement>(null);

  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const isEdit = !!editExpense;

  React.useEffect(() => { setMounted(true); }, []);

  // Populate form when editing
  React.useEffect(() => {
    if (open && editExpense) {
      setCategory(editExpense.category);
      setAmount(editExpense.amount);
      setPaymentMode(editExpense.paymentMode);
      setDescription(editExpense.description);
      setVendor(editExpense.vendor);
      setEmployee(editExpense.employee);
      setAttachment(editExpense.attachment);
      setAttachmentName(editExpense.attachment ? "receipt.file" : "");
      setDate(editExpense.date);
      setTime(editExpense.time);
      setInternalNotes(editExpense.internalNotes);
    } else if (open && !editExpense) {
      // Defaults for new expense
      const now = new Date();
      setCategory("");
      setAmount(0);
      setPaymentMode("cash");
      setDescription("");
      setVendor("");
      setEmployee("");
      setAttachment(null);
      setAttachmentName("");
      setDate(now.toISOString().slice(0, 10));
      setTime(now.toTimeString().slice(0, 5));
      setInternalNotes("");
    }
    setShowNewCategory(false);
    setNewCategoryLabel("");
  }, [open, editExpense]);

  // Focus new-category input when revealed
  React.useEffect(() => {
    if (showNewCategory) newCatRef.current?.focus();
  }, [showNewCategory]);

  const categoryOptions = React.useMemo(
    () => categories.map((c) => ({ label: c.label, value: c.label })),
    [categories]
  );

  const handleAddCategory = () => {
    const label = newCategoryLabel.trim();
    if (!label) return;
    if (categories.some((c) => c.label.toLowerCase() === label.toLowerCase())) {
      // Already exists — just select it
      setCategory(label);
    } else {
      addCategory(label);
      setCategory(label);
    }
    setNewCategoryLabel("");
    setShowNewCategory(false);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAttachmentName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      setAttachment(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const removeAttachment = () => {
    setAttachment(null);
    setAttachmentName("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const canSubmit = category && amount > 0 && description.trim() && date && time;

  const handleSubmit = () => {
    if (!canSubmit) return;

    const actor = CURRENT_USER.name;

    if (isEdit && editExpense) {
      // Save previous state for diff
      const previous = { ...editExpense };

      const updated = updateExpense(editExpense.id, {
        category,
        amount,
        paymentMode: paymentMode as PaymentMode,
        description: description.trim(),
        vendor: vendor.trim(),
        employee: employee.trim(),
        attachment,
        date,
        time,
        internalNotes: internalNotes.trim(),
        createdBy: editExpense.createdBy,
      });

      if (updated) {
        // Emit accounting event (handles ledger update + activity log)
        emitExpenseUpdated(updated, previous, accounting, actor);
        onSuccess?.(updated);
      }
    } else {
      // Create new expense
      const newExp: NewExpense = {
        category,
        amount,
        paymentMode: paymentMode as PaymentMode,
        description: description.trim(),
        vendor: vendor.trim(),
        employee: employee.trim(),
        attachment,
        date,
        time,
        internalNotes: internalNotes.trim(),
        createdBy: actor,
      };

      const created = addExpense(newExp);

      // Emit accounting event (handles ledger posting + activity log)
      emitExpenseCreated(created, accounting, actor);
      onSuccess?.(created);
    }

    onClose();
  };

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
            <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-border bg-card shadow-2xl">
              {/* Header */}
              <div className="flex items-center justify-between border-b border-border p-5">
                <div className="flex items-center gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#EEF1FD] text-[#4361EE] ring-1 ring-inset ring-[#B3BFF6]/60">
                    <Receipt className="h-5 w-5" />
                  </span>
                  <div>
                    <h2 className="font-display text-lg font-bold tracking-tight">
                      {isEdit ? "Edit Expense" : "Add Expense"}
                    </h2>
                    <p className="text-[12px] text-muted-foreground">
                      {isEdit ? `Editing ${editExpense.expenseId}` : "Record a new business expense"}
                    </p>
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

              {/* Form Body */}
              <div className="p-5 space-y-5">
                {/* Row: Category + Amount */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {/* Category with inline creation */}
                  <div className="space-y-1.5">
                    <Label>Category *</Label>
                    <RSelect
                      value={category}
                      onChange={setCategory}
                      options={categoryOptions}
                      placeholder="Select category…"
                      searchable
                      menuWidth="w-72"
                    />
                    {/* + Add Category inline */}
                    {!showNewCategory ? (
                      <button
                        type="button"
                        onClick={() => setShowNewCategory(true)}
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-[#4361EE] hover:text-[#3347D6] transition mt-1"
                      >
                        <Plus className="h-3 w-3" /> Add New Category
                      </button>
                    ) : (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        className="flex items-center gap-2 mt-1.5"
                      >
                        <input
                          ref={newCatRef}
                          value={newCategoryLabel}
                          onChange={(e) => setNewCategoryLabel(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") handleAddCategory(); if (e.key === "Escape") setShowNewCategory(false); }}
                          placeholder="Category name…"
                          className="h-8 flex-1 rounded-lg border border-border bg-card px-2.5 text-[12px] focus:border-[#4361EE] focus:outline-none focus:ring-2 focus:ring-[#4361EE]/15"
                        />
                        <Button size="sm" onClick={handleAddCategory} disabled={!newCategoryLabel.trim()}>
                          Add
                        </Button>
                        <button
                          type="button"
                          onClick={() => setShowNewCategory(false)}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </motion.div>
                    )}
                  </div>

                  {/* Amount */}
                  <div className="space-y-1.5">
                    <Label>Amount (INR) *</Label>
                    <NumericInput
                      value={amount}
                      onChange={setAmount}
                      min={0}
                      placeholder="0"
                    />
                  </div>
                </div>

                {/* Row: Payment Mode + Date/Time */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label>Payment Mode *</Label>
                    <RSelect
                      value={paymentMode}
                      onChange={setPaymentMode}
                      options={PAYMENT_MODE_OPTIONS}
                      placeholder="Select mode…"
                      searchable
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Date *</Label>
                    <input
                      type="date"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      className="flex h-11 w-full rounded-xl border border-border bg-card px-3.5 text-sm transition-all duration-150 hover:border-[#4361EE]/40 focus:border-[#4361EE] focus:ring-2 focus:ring-[#4361EE]/15 focus:outline-none"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Time *</Label>
                    <input
                      type="time"
                      value={time}
                      onChange={(e) => setTime(e.target.value)}
                      className="flex h-11 w-full rounded-xl border border-border bg-card px-3.5 text-sm transition-all duration-150 hover:border-[#4361EE]/40 focus:border-[#4361EE] focus:ring-2 focus:ring-[#4361EE]/15 focus:outline-none"
                    />
                  </div>
                </div>

                {/* Description */}
                <div className="space-y-1.5">
                  <Label>Description *</Label>
                  <Input
                    value={description}
                    onChange={(e: any) => setDescription(e.target.value)}
                    placeholder="Brief description of the expense…"
                  />
                </div>

                {/* Row: Vendor + Employee */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Vendor <span className="text-muted-foreground">(optional)</span></Label>
                    <Input
                      value={vendor}
                      onChange={(e: any) => setVendor(e.target.value)}
                      placeholder="e.g. Priya Stationery Store"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Employee <span className="text-muted-foreground">(optional)</span></Label>
                    <Input
                      value={employee}
                      onChange={(e: any) => setEmployee(e.target.value)}
                      placeholder="e.g. Radha Iyer"
                    />
                  </div>
                </div>

                {/* Attachment / Receipt Upload */}
                <div className="space-y-1.5">
                  <Label>Attachment / Receipt <span className="text-muted-foreground">(optional)</span></Label>
                  {!attachment ? (
                    <label className="flex cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed border-zinc-200 bg-zinc-50/50 px-4 py-4 transition hover:border-[#4361EE]/40 hover:bg-indigo-50/30">
                      <Upload className="h-5 w-5 text-zinc-400" />
                      <div>
                        <p className="text-sm font-medium text-zinc-600">Click to upload receipt</p>
                        <p className="text-[11px] text-muted-foreground">PNG, JPG, PDF up to 5MB</p>
                      </div>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*,.pdf"
                        className="hidden"
                        onChange={handleFileUpload}
                      />
                    </label>
                  ) : (
                    <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
                      <span className="grid h-9 w-9 place-items-center rounded-lg bg-emerald-50 text-emerald-600">
                        <Receipt className="h-4 w-4" />
                      </span>
                      <span className="flex-1 truncate text-sm font-medium">{attachmentName}</span>
                      <button
                        type="button"
                        onClick={removeAttachment}
                        className="grid h-7 w-7 place-items-center rounded-md text-zinc-400 hover:text-rose-500 hover:bg-rose-50 transition"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Internal Notes */}
                <div className="space-y-1.5">
                  <Label>Internal Notes <span className="text-muted-foreground">(optional)</span></Label>
                  <Textarea
                    value={internalNotes}
                    onChange={(e: any) => setInternalNotes(e.target.value)}
                    placeholder="Any internal remarks or context for this expense…"
                    className="min-h-[72px]"
                  />
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-3 border-t border-border p-5">
                <Button variant="outline" size="md" onClick={onClose}>
                  Cancel
                </Button>
                <Button size="md" onClick={handleSubmit} disabled={!canSubmit}>
                  {isEdit ? "Update Expense" : "Add Expense"}
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
