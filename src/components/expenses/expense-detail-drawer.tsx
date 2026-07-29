"use client";

import * as React from "react";
import { Receipt, Pencil, Trash2, ExternalLink, Calendar, Clock, Tag, CreditCard, User, Store, FileText, Paperclip, BookOpen } from "lucide-react";
import { cn, formatINR } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Drawer, DetailRow } from "@/components/ui/drawer";
import { type Expense, PAYMENT_MODE_LABELS } from "@/lib/expense-store";
import { useLedger } from "@/lib/accounting-service";

/* ─── Props ──────────────────────────────────────────────────────── */

interface ExpenseDetailDrawerProps {
  expense: Expense | null;
  open: boolean;
  onClose: () => void;
  onEdit: (expense: Expense) => void;
  onDelete: (expense: Expense) => void;
}

/* ─── Status Styling ─────────────────────────────────────────────── */

const STATUS_CONFIG: Record<string, { label: string; tone: string }> = {
  active: { label: "Active", tone: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  cancelled: { label: "Cancelled", tone: "bg-rose-50 text-rose-700 ring-rose-200" },
};

/* ─── Component ──────────────────────────────────────────────────── */

export function ExpenseDetailDrawer({ expense, open, onClose, onEdit, onDelete }: ExpenseDetailDrawerProps) {
  const { getEntriesByReference } = useLedger();

  if (!expense) return null;

  const status = STATUS_CONFIG[expense.status] ?? STATUS_CONFIG.active;
  const ledgerEntries = getEntriesByReference(expense.expenseId);
  const activeLedgerEntry = ledgerEntries.find((e) => e.status === "posted");
  const reversedEntry = ledgerEntries.find((e) => e.status === "reversed");

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={expense.expenseId}
      subtitle={expense.description}
      icon={Receipt}
      width="max-w-lg"
      footer={
        expense.status === "active" ? (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="md"
              className="flex-1"
              onClick={() => onEdit(expense)}
            >
              <Pencil className="h-4 w-4" /> Edit
            </Button>
            <Button
              variant="destructive"
              size="md"
              className="flex-1"
              onClick={() => onDelete(expense)}
            >
              <Trash2 className="h-4 w-4" /> Delete
            </Button>
          </div>
        ) : (
          <div className="rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-center">
            <p className="text-[12px] font-medium text-rose-700">This expense has been cancelled</p>
            {expense.cancellationReason && (
              <p className="text-[11px] text-rose-600 mt-0.5">Reason: {expense.cancellationReason}</p>
            )}
          </div>
        )
      }
    >
      <div className="space-y-5">
        {/* Status + Amount Hero */}
        <div className="flex items-center justify-between rounded-xl border border-border bg-muted/30 p-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Amount</p>
            <p className="text-2xl font-bold tabular-nums">{formatINR(expense.amount)}</p>
          </div>
          <Badge className={cn("text-[11px] px-2.5 py-1", status.tone)}>
            {status.label}
          </Badge>
        </div>

        {/* Core Details */}
        <div className="space-y-0.5 divide-y divide-border/50">
          <DetailRow label="Expense ID">
            <span className="font-mono text-[12px] text-[#4361EE]">{expense.expenseId}</span>
          </DetailRow>
          <DetailRow label="Category">
            <span className="inline-flex items-center gap-1.5">
              <Tag className="h-3 w-3 text-zinc-400" />
              {expense.category}
            </span>
          </DetailRow>
          <DetailRow label="Payment Mode">
            <span className="inline-flex items-center gap-1.5">
              <CreditCard className="h-3 w-3 text-zinc-400" />
              {PAYMENT_MODE_LABELS[expense.paymentMode]}
            </span>
          </DetailRow>
          <DetailRow label="Date & Time">
            <span className="inline-flex items-center gap-1.5">
              <Calendar className="h-3 w-3 text-zinc-400" />
              {new Date(expense.date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
              <span className="text-muted-foreground mx-0.5">·</span>
              <Clock className="h-3 w-3 text-zinc-400" />
              {expense.time}
            </span>
          </DetailRow>
          <DetailRow label="Description">
            <span className="text-right max-w-[240px]">{expense.description}</span>
          </DetailRow>
        </div>

        {/* Optional Fields */}
        {(expense.vendor || expense.employee) && (
          <div className="space-y-0.5 divide-y divide-border/50">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground pb-1.5 pt-2">People & Vendors</p>
            {expense.vendor && (
              <DetailRow label="Vendor">
                <span className="inline-flex items-center gap-1.5">
                  <Store className="h-3 w-3 text-zinc-400" />
                  {expense.vendor}
                </span>
              </DetailRow>
            )}
            {expense.employee && (
              <DetailRow label="Employee">
                <span className="inline-flex items-center gap-1.5">
                  <User className="h-3 w-3 text-zinc-400" />
                  {expense.employee}
                </span>
              </DetailRow>
            )}
          </div>
        )}

        {/* Attachment */}
        {expense.attachment && (
          <div className="space-y-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Attachment</p>
            <div className="rounded-xl border border-border overflow-hidden">
              {expense.attachment.startsWith("data:image") ? (
                <img src={expense.attachment} alt="Receipt" className="w-full max-h-48 object-contain bg-zinc-50" />
              ) : (
                <div className="flex items-center gap-3 px-4 py-3 bg-zinc-50">
                  <Paperclip className="h-4 w-4 text-zinc-400" />
                  <span className="text-sm font-medium text-zinc-600">Receipt attached</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Internal Notes */}
        {expense.internalNotes && (
          <div className="space-y-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Internal Notes</p>
            <div className="rounded-xl border border-border bg-muted/30 px-4 py-3">
              <p className="text-[13px] text-zinc-600 whitespace-pre-wrap">{expense.internalNotes}</p>
            </div>
          </div>
        )}

        {/* Ledger Reference */}
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <BookOpen className="h-3 w-3" /> Linked Ledger Entry
          </p>
          {activeLedgerEntry ? (
            <div className="rounded-xl border border-border bg-[#EEF1FD]/30 px-4 py-3 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-mono text-[#4361EE]">{activeLedgerEntry.id}</span>
                <Badge className="text-[9px] bg-emerald-50 text-emerald-700 ring-emerald-200">Posted</Badge>
              </div>
              <p className="text-[12px] text-zinc-600">
                Debit: {formatINR(expense.amount)} → Account: {expense.category}
              </p>
              <p className="text-[10px] text-muted-foreground">
                Created {new Date(activeLedgerEntry.createdAt ?? "").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
              </p>
            </div>
          ) : reversedEntry ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50/50 px-4 py-3 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-mono text-rose-600">{reversedEntry.id}</span>
                <Badge className="text-[9px] bg-rose-50 text-rose-700 ring-rose-200">Reversed</Badge>
              </div>
              <p className="text-[12px] text-zinc-600">
                Original debit of {formatINR(expense.amount)} has been reversed.
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-muted/30 px-4 py-3">
              <p className="text-[12px] text-muted-foreground">No ledger entry linked yet.</p>
            </div>
          )}
        </div>

        {/* Cancellation Info */}
        {expense.status === "cancelled" && (
          <div className="space-y-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-rose-600">Cancellation Details</p>
            <div className="rounded-xl border border-rose-200 bg-rose-50/50 px-4 py-3 space-y-1">
              {expense.cancellationReason && (
                <p className="text-[12px] text-zinc-700"><span className="font-medium">Reason:</span> {expense.cancellationReason}</p>
              )}
              {expense.cancelledBy && (
                <p className="text-[11px] text-muted-foreground">Cancelled by {expense.cancelledBy}</p>
              )}
              {expense.cancelledAt && (
                <p className="text-[11px] text-muted-foreground">
                  On {new Date(expense.cancelledAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Metadata */}
        <div className="space-y-0.5 divide-y divide-border/50 pt-2 border-t border-border">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground pb-1.5">Record Info</p>
          <DetailRow label="Created By">{expense.createdBy}</DetailRow>
          <DetailRow label="Created At">
            {new Date(expense.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
          </DetailRow>
          <DetailRow label="Last Updated">
            {new Date(expense.updatedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
          </DetailRow>
        </div>
      </div>
    </Drawer>
  );
}
