"use client";

/* ─── Inline Due Date Cell ────────────────────────────────────────────────
   Renders the ticket table's DUE DATE value AND, on click, opens an inline
   popover with the RepairOX-branded calendar (indigo #4361EE theme, matching
   src/components/dashboard/date-range-picker.tsx) plus a time field.

   The user changes BOTH date and time, and the new due date/time is saved
   immediately via the store's updateTicket. The table re-renders on its own
   because updateTicket writes back into store state.

   Constraints honored:
   - Does NOT open the Edit Ticket flow and does NOT navigate away.
   - Does NOT change the existing table cell design (same text/markup as before
     for the trigger).
   - Reuses the existing branded calendar look; no new global calendar UI.
   - Preserves the existing LOCAL-time ISO round-trip + resolutionMinutes logic.
   - Save errors are handled safely: updateTicket only mutates state on success
     (and toasts on failure), so a failed save keeps the old value shown. */

import * as React from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { useStore } from "@/lib/store";
import { DateTimePopover } from "@/components/ui/date-time-picker";
import type { Ticket } from "@/lib/mock-data";

/* ─── The cell (trigger + popover) ─────────────────────────────────────── */

export function DueDateCell({ ticket, overdue }: { ticket: Ticket; overdue: boolean }) {
  const { updateTicket } = useStore();
  const [open, setOpen] = React.useState(false);
  const [anchorRect, setAnchorRect] = React.useState<DOMRect | null>(null);
  const [mounted, setMounted] = React.useState(false);
  const btnRef = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => { setMounted(true); }, []);

  const openPopover = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (btnRef.current) setAnchorRect(btnRef.current.getBoundingClientRect());
    setOpen(true);
  };

  const handleSave = async (iso: string) => {
    // Recompute resolutionMinutes from dueDate − createdAt so the
    // "Expected Resolution" display and overdue logic stay consistent —
    // same rule the Edit Job Details flow uses.
    const createdMs = new Date(ticket.createdAt).getTime();
    const recalcMins = Math.max(1, Math.round((new Date(iso).getTime() - createdMs) / 60_000));
    // updateTicket only mutates state on success and toasts on failure, so a
    // failed save keeps the previously shown value.
    await updateTicket(ticket.id, { dueDate: iso, resolutionMinutes: recalcMins });
  };

  if (!ticket.dueDate) {
    return <span className="text-[12px] text-muted-foreground">—</span>;
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={openPopover}
        title="Change due date & time"
        className={cn(
          "-mx-1 rounded-md px-1 py-0.5 text-left text-[12px] transition hover:bg-[#EEF1FD]",
          overdue ? "text-[#922B21] font-semibold" : "text-[#922B21]/70",
        )}
      >
        <p>{new Date(ticket.dueDate).toLocaleDateString("en-IN", { dateStyle: "medium" })}</p>
        <p className="text-[11px]">{new Date(ticket.dueDate).toLocaleTimeString("en-IN", { timeStyle: "short" })}</p>
      </button>

      {mounted && anchorRect && createPortal(
        <AnimatePresence>
          {open && (
            <DateTimePopover
              anchorRect={anchorRect}
              initialIso={ticket.dueDate}
              title="Due Date & Time"
              onClose={() => setOpen(false)}
              onSave={handleSave}
            />
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}
