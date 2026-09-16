"use client";

/**
 * InlinePriorityDropdown — the CANONICAL inline ticket-priority control.
 *
 * A click-to-edit priority pill for list rows (the Dashboard "Critical Tasks"
 * card and, where wired, the Tickets module use this exact component). Mirrors
 * the InlineStatusDropdown interaction model: the pill is a button that opens a
 * portal-positioned menu of the valid ticket priorities.
 *
 * Priority values come from the SAME source the Tickets module uses
 * (TicketPriority / PRIORITY_LABEL in mock-data) — no dashboard-only set. The
 * mutation is owned by the caller via `onPriorityChange`, which should call the
 * store's `updateTicket(id, { priority })` so the change persists to the DB,
 * logs the "Priority Changed" activity, and reflects everywhere. This component
 * shows an optimistic value and rolls back if the caller's promise rejects.
 */

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { PRIORITY_LABEL, type TicketPriority } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

/** The selectable priorities, in the same order the Tickets module presents them. */
const PRIORITY_OPTIONS: TicketPriority[] = ["normal", "high", "critical"];

/** Pill tone per priority — matches the Critical Tasks table's existing look. */
const PILL_TONE: Record<TicketPriority, string> = {
  critical: "bg-rose-50 text-rose-700 ring-rose-200",
  high: "bg-amber-50 text-amber-700 ring-amber-200",
  normal: "bg-zinc-100 text-zinc-600 ring-zinc-200",
};

/** Dot colour per priority — matches the Tickets "Change Priority" dialog. */
const DOT_TONE: Record<TicketPriority, string> = {
  critical: "bg-rose-500",
  high: "bg-amber-500",
  normal: "bg-zinc-300",
};

/** Short pill label (the table shows "Critical" / "High" / "Normal", not "High Priority"). */
const SHORT_LABEL: Record<TicketPriority, string> = {
  critical: "Critical",
  high: "High",
  normal: "Normal",
};

export function InlinePriorityDropdown({
  ticket,
  onPriorityChange,
  disabled = false,
}: {
  ticket: { id: string; priority: TicketPriority };
  /** Persist the change. May return a promise; a rejection triggers rollback. */
  onPriorityChange: (ticketId: string, priority: TicketPriority) => void | Promise<void>;
  /** Render read-only (e.g. when the user lacks permission to edit priority). */
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; dropUp: boolean }>({ top: 0, left: 0, dropUp: false });
  // Optimistic value shown immediately; reverts on a failed persist.
  const [optimistic, setOptimistic] = useState<TicketPriority | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  // Clear any optimistic override once the real ticket prop catches up.
  useEffect(() => {
    if (optimistic !== null && ticket.priority === optimistic) setOptimistic(null);
  }, [ticket.priority, optimistic]);

  const shown = optimistic ?? ticket.priority;

  const handleOpen = () => {
    if (disabled) return;
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const dropUp = spaceBelow < 240;
      setPos({ top: dropUp ? rect.top : rect.bottom + 6, left: rect.left, dropUp });
    }
    setOpen(!open);
  };

  const choose = async (p: TicketPriority) => {
    setOpen(false);
    if (p === ticket.priority) return;
    const previous = ticket.priority;
    setOptimistic(p); // show the new value right away
    try {
      await onPriorityChange(ticket.id, p);
      // Success: leave `optimistic` — the effect above clears it when the prop
      // updates. If the store blocked the write (returned without changing the
      // record), the prop won't match and we roll back on the next tick.
    } catch {
      setOptimistic(previous); // rollback to the last known-good value
    }
  };

  // Non-interactive pill when disabled (unauthorized) — looks identical, no chevron.
  if (disabled) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset",
          PILL_TONE[shown]
        )}
      >
        {SHORT_LABEL[shown]}
      </span>
    );
  }

  return (
    <div className="relative flex justify-start" onClick={(e) => e.stopPropagation()}>
      <button
        ref={btnRef}
        onClick={handleOpen}
        className={cn(
          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset cursor-pointer transition hover:shadow-sm",
          PILL_TONE[shown]
        )}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {SHORT_LABEL[shown]}
        <ChevronDown className="h-3 w-3 opacity-60" />
      </button>
      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-[60]" onClick={() => setOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: pos.dropUp ? 4 : -4, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: pos.dropUp ? 4 : -4, scale: 0.96 }}
              transition={{ duration: 0.15 }}
              style={{
                position: "fixed",
                top: pos.dropUp ? undefined : pos.top,
                bottom: pos.dropUp ? window.innerHeight - pos.top + 6 : undefined,
                left: pos.left,
              }}
              className="z-[70] w-[180px] rounded-xl border border-border bg-card p-1.5 shadow-xl"
              role="listbox"
            >
              {PRIORITY_OPTIONS.map((p) => (
                <button
                  key={p}
                  onClick={() => choose(p)}
                  role="option"
                  aria-selected={ticket.priority === p}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[11px] font-medium transition",
                    ticket.priority === p ? "bg-indigo-50 text-[#4361EE]" : "hover:bg-zinc-50 text-foreground"
                  )}
                >
                  <span className={cn("h-2 w-2 rounded-full", DOT_TONE[p])} />
                  {PRIORITY_LABEL[p]}
                  {ticket.priority === p && <span className="ml-auto text-[9px] font-semibold text-[#4361EE]">✓</span>}
                </button>
              ))}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
