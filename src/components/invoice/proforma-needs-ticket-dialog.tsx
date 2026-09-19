"use client";

/**
 * ProformaNeedsTicketDialog — "create a ticket first" warning.
 *
 * A Proforma cannot be turned into a final Invoice until it is linked to a
 * repair Ticket. When the user hits "Push to Invoice" on a proforma that has NO
 * linked ticket, this centered warning explains why and offers a direct
 * "Push to Ticket" action (which carries all the proforma's captured data into
 * the ticket wizard). Once a ticket exists, invoicing proceeds through the
 * normal invoice creation flow.
 *
 * Reuses the same modal shell/motion as the other RepairOX dialogs.
 */

import { motion, AnimatePresence } from "framer-motion";
import { X, AlertTriangle, TicketCheck } from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { formatINR } from "@/lib/utils";
import type { Invoice } from "@/lib/mock-data";

export function ProformaNeedsTicketDialog({
  proforma,
  deviceCount,
  canCreateTicket = true,
  onPushToTicket,
  onCancel,
}: {
  /** The proforma awaiting a ticket. Null = dialog closed. */
  proforma: Invoice | null;
  deviceCount: number;
  /** Gates the "Push to Ticket" button (UI half; the ticket path enforces too). */
  canCreateTicket?: boolean;
  onPushToTicket: () => void;
  onCancel: () => void;
}) {
  const open = !!proforma;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onCancel]);

  return (
    <AnimatePresence>
      {open && proforma && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 backdrop-blur-[2px] p-4"
          onClick={onCancel}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 10 }}
            transition={{ type: "spring", stiffness: 300, damping: 26 }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="proforma-needs-ticket-title"
            className="relative flex w-full max-w-md flex-col overflow-hidden rounded-2xl bg-card shadow-2xl ring-1 ring-border"
          >
            {/* Header */}
            <div className="flex items-start gap-3 border-b border-border p-5 pb-4">
              <span className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-50 text-amber-600 ring-1 ring-inset ring-amber-200">
                <AlertTriangle className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <h3 id="proforma-needs-ticket-title" className="font-display text-base font-bold tracking-tight">
                  Create a ticket first
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  This proforma isn&apos;t linked to a repair ticket yet, so it can&apos;t be invoiced directly. Push it to a ticket first — the invoice can then be created from that ticket.
                </p>
              </div>
              <button
                onClick={onCancel}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-border text-muted-foreground transition hover:bg-muted hover:text-foreground"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Body — proforma summary */}
            <div className="px-5 py-4">
              <dl className="space-y-2.5 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">Proforma</dt>
                  <dd className="font-semibold text-[#3347D6]">{proforma.id}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">Customer</dt>
                  <dd className="font-medium text-foreground truncate">{proforma.customer || "—"}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">Devices</dt>
                  <dd className="font-medium text-foreground">{deviceCount}</dd>
                </div>
                <div className="flex items-center justify-between gap-3 border-t border-border pt-2.5">
                  <dt className="text-muted-foreground">Amount</dt>
                  <dd className="font-bold tabular-nums text-foreground">{formatINR(proforma.total)}</dd>
                </div>
              </dl>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 border-t border-border p-4">
              <Button variant="secondary" size="sm" onClick={onCancel}>Cancel</Button>
              <Button size="sm" onClick={onPushToTicket} disabled={!canCreateTicket} title={canCreateTicket ? undefined : "You don't have permission to create tickets"}>
                <TicketCheck className="h-4 w-4" /> Push to Ticket
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
