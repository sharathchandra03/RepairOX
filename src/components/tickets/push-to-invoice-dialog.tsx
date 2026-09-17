"use client";

/**
 * PushToInvoiceDialog — device-selection popup for "Push to Invoice".
 *
 * A multi-device ticket is ONE customer/job record whose devices can be billed
 * independently (selective / partial invoicing). Clicking "Push to Invoice" no
 * longer creates an invoice immediately: this centered RepairOX-styled popup
 * first asks WHICH devices to invoice.
 *
 *   • Each invoice-eligible device shows a checkbox (name · issue · ₹amount).
 *   • "Select all" toggles every eligible device.
 *   • Devices already billed on a finalized invoice are shown as
 *     "Already Invoiced" (with the invoice id/date) and are NOT selectable —
 *     this is the duplicate-billing guard at the UI layer.
 *   • Continue is disabled until at least one eligible device is selected, with
 *     a subtle validation message.
 *   • When a ticket is already partially invoiced the header communicates
 *     "Create another invoice for T-058" and only the remaining devices are
 *     selectable.
 *
 * It reuses the existing modal shell (same overlay / panel / motion as
 * ConfirmDialog) and the shared Checkbox + Button primitives — no new visual
 * language. On Continue it hands the selected Ticket DeviceRecord ids back to
 * the caller, which threads them through the existing invoice workflow.
 */

import { motion, AnimatePresence } from "framer-motion";
import { X, Receipt, CheckCircle2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn, formatINR } from "@/lib/utils";
import { parseIssueString } from "@/lib/issue-library";
import {
  getTicketDevices,
  getInvoicedTicketDeviceIds,
  findInvoiceForTicketDevice,
  type Ticket,
  type Invoice,
  type DeviceRecord,
} from "@/lib/mock-data";

/** The billable amount shown for a device: its estimate, else the parts total. */
function deviceAmount(dev: DeviceRecord): number {
  const partsTotal = (dev.parts ?? []).reduce((s, p) => s + (p.total ?? 0), 0);
  return dev.estimate && dev.estimate > 0 ? dev.estimate : partsTotal;
}

function deviceLabel(dev: DeviceRecord, idx: number): string {
  return dev.model || dev.brand || `Device ${idx + 1}`;
}

function deviceIssue(dev: DeviceRecord): string {
  const parsed = parseIssueString(dev.issue).join(", ");
  return parsed || dev.description || "";
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

/**
 * A device that has been COLLECTED ("Repaired & Collected" / "Returned &
 * Collected") has already been billed — collection happens against an invoice.
 * These devices must be treated as already-invoiced (ineligible) even if the
 * older data has no explicit `ticketDeviceId` link on the invoice, so the popup
 * never offers to re-bill them.
 */
function isCollected(dev: DeviceRecord): boolean {
  return dev.status === "repaired_collected" || dev.status === "return_collected";
}

export function PushToInvoiceDialog({
  open,
  ticket,
  invoices,
  onClose,
  onContinue,
}: {
  open: boolean;
  ticket: Ticket | null;
  invoices: Invoice[];
  onClose: () => void;
  /** Called with the SELECTED Ticket DeviceRecord ids to invoice. */
  onContinue: (selectedDeviceIds: string[]) => void;
}) {
  const devices = useMemo(() => (ticket ? getTicketDevices(ticket) : []), [ticket]);
  // Devices already billed. A device counts as invoiced when it is linked to an
  // invoice OR it has already been collected (collection implies an invoice
  // exists), so collected devices are never offered for re-billing.
  const invoicedIds = useMemo(() => {
    if (!ticket) return new Set<string>();
    const set = new Set(getInvoicedTicketDeviceIds(ticket, invoices));
    for (const d of devices) if (isCollected(d)) set.add(d.id);
    return set;
  }, [ticket, invoices, devices]);

  // Eligible = not already invoiced and not yet collected.
  const eligible = useMemo(() => devices.filter((d) => !invoicedIds.has(d.id)), [devices, invoicedIds]);
  const hasAlreadyInvoiced = devices.length > eligible.length;

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showValidation, setShowValidation] = useState(false);

  // Reset selection each time the popup opens for a ticket. Default: preselect
  // all eligible devices when there's more than one (fast "invoice everything
  // remaining"); a single eligible device is auto-checked too.
  useEffect(() => {
    if (open) {
      setSelected(new Set(eligible.map((d) => d.id)));
      setShowValidation(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, ticket?.id]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  const allEligibleSelected = eligible.length > 0 && eligible.every((d) => selected.has(d.id));

  const toggleDevice = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setShowValidation(false);
  };

  const toggleAll = () => {
    setSelected((prev) => {
      if (eligible.length > 0 && eligible.every((d) => prev.has(d.id))) return new Set();
      return new Set(eligible.map((d) => d.id));
    });
    setShowValidation(false);
  };

  const handleContinue = () => {
    const ids = eligible.filter((d) => selected.has(d.id)).map((d) => d.id);
    if (ids.length === 0) {
      setShowValidation(true);
      return;
    }
    onContinue(ids);
  };

  const isPartial = hasAlreadyInvoiced && eligible.length > 0;
  const ticketLabel = ticket?.ticketNo ?? ticket?.id ?? "";

  return (
    <AnimatePresence>
      {open && ticket && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 backdrop-blur-[2px] p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 10 }}
            transition={{ type: "spring", stiffness: 300, damping: 26 }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="push-invoice-title"
            className="relative flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-card shadow-2xl ring-1 ring-border"
          >
            {/* Header */}
            <div className="flex items-start gap-3 border-b border-border p-5 pb-4">
              <span className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-indigo-50 text-[#4361EE] ring-1 ring-inset ring-indigo-200">
                <Receipt className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <h3 id="push-invoice-title" className="font-display text-base font-bold tracking-tight">
                  {isPartial ? `Create another invoice for ${ticketLabel}` : "Create Invoice"}
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Select the devices you want to invoice.
                </p>
              </div>
              <button
                onClick={onClose}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-border text-muted-foreground transition hover:bg-muted hover:text-foreground"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Body — device list */}
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {/* Select all — only when more than one eligible device exists. */}
              {eligible.length > 1 && (
                <button
                  type="button"
                  onClick={toggleAll}
                  className="mb-3 flex w-full items-center gap-2.5 rounded-lg px-1 py-1 text-left"
                >
                  <Checkbox
                    checked={allEligibleSelected}
                    indeterminate={!allEligibleSelected && eligible.some((d) => selected.has(d.id))}
                    onChange={toggleAll}
                    aria-label="Select all devices"
                  />
                  <span className="text-[13px] font-semibold text-foreground">Select all devices</span>
                  <span className="ml-auto text-[11px] text-muted-foreground">{eligible.length} eligible</span>
                </button>
              )}

              <ul className="space-y-2">
                {devices.map((dev, idx) => {
                  const already = invoicedIds.has(dev.id);
                  const inv = already ? findInvoiceForTicketDevice(ticket, dev.id, invoices) : undefined;
                  const checked = selected.has(dev.id);
                  const issue = deviceIssue(dev);
                  return (
                    <li key={dev.id}>
                      <button
                        type="button"
                        disabled={already}
                        onClick={() => !already && toggleDevice(dev.id)}
                        className={cn(
                          "flex w-full items-start gap-3 rounded-xl border px-3.5 py-3 text-left transition",
                          already
                            ? "cursor-not-allowed border-border bg-muted/40"
                            : checked
                              ? "border-[#4361EE] bg-indigo-50/50"
                              : "border-border hover:border-[#8DA0F2] hover:bg-indigo-50/30",
                        )}
                      >
                        {already ? (
                          <span className="mt-0.5 grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full bg-emerald-100 text-emerald-600">
                            <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2.5} />
                          </span>
                        ) : (
                          <span className="mt-0.5">
                            <Checkbox
                              checked={checked}
                              onChange={() => toggleDevice(dev.id)}
                              aria-label={`Select ${deviceLabel(dev, idx)}`}
                            />
                          </span>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className={cn("truncate text-sm font-semibold", already && "text-muted-foreground")}>
                              {deviceLabel(dev, idx)}
                            </p>
                            {already && (
                              <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200">
                                Already Invoiced
                              </span>
                            )}
                          </div>
                          {issue && (
                            <p className="mt-0.5 truncate text-xs text-muted-foreground">{issue}</p>
                          )}
                          {already && inv && (
                            <p className="mt-0.5 text-[11px] text-muted-foreground">
                              <span className="font-medium text-[#4361EE]">{inv.id}</span>
                              {inv.createdAt && <> · {fmtDate(inv.createdAt)}</>}
                            </p>
                          )}
                        </div>
                        <span className={cn("shrink-0 text-sm font-semibold tabular-nums", already ? "text-muted-foreground" : "text-foreground")}>
                          {formatINR(deviceAmount(dev))}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>

              {showValidation && (
                <p className="mt-3 text-xs font-medium text-rose-600">
                  Select at least one device to invoice.
                </p>
              )}
              {eligible.length === 0 && (
                <p className="mt-3 text-xs text-muted-foreground">
                  All devices on this ticket have already been invoiced.
                </p>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-4">
              <Button variant="secondary" size="sm" onClick={onClose}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleContinue}
                disabled={eligible.length === 0}
              >
                Continue
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
