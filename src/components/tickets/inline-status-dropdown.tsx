"use client";

/**
 * InlineStatusDropdown — the CANONICAL inline ticket-status control.
 *
 * Single source of truth for changing a ticket's status directly from a list
 * row (the Tickets module table and the Dashboard "Critical Tasks" card both
 * use this exact component). It renders the status pill as a button and, on
 * click, a portal-positioned menu of the available statuses.
 *
 * Business rules preserved here (not re-implemented per call site):
 *   • "Repaired & Collected" is unavailable until an invoice exists for the
 *     ticket (also enforced in the store so it can't be bypassed).
 *   • The control stops click propagation so an inline status change never
 *     also triggers the row's navigation/onClick.
 *
 * The mutation itself (updateTicket + parts deduction on "repaired") is owned
 * by the caller via `onStatusChange`, keeping ticket lifecycle logic in one
 * place.
 */

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Ban, Lock } from "lucide-react";
import { STATUS_LABEL, type TicketStatus, type Ticket } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

/**
 * A ticket's status is LOCKED (read-only) once it has reached a collected /
 * billing-completed state AND an invoice exists for it. This mirrors the real
 * business state — a ticket that has been collected and invoiced must not have
 * its status arbitrarily walked backwards. The "has invoice" check is the same
 * linked-invoice rule the store enforces (invoices.some(inv.ticketId === id)),
 * surfaced here via the `hasInvoice` prop.
 */
export function isStatusLocked(status: TicketStatus, hasInvoice: boolean): boolean {
  return hasInvoice && (status === "repaired_collected" || status === "return_collected");
}

/** The selectable statuses, in the same order the Tickets module presents them. */
const STATUS_OPTIONS: { label: string; value: TicketStatus }[] = [
  { label: "In Progress", value: "in_progress" },
  { label: "Repaired", value: "repaired" },
  { label: "Repaired & Collected", value: "repaired_collected" },
  { label: "Waiting for Approval", value: "waiting_approval" },
  { label: "Waiting for Parts", value: "waiting_parts" },
  { label: "Returned", value: "return" },
  { label: "Returned & Collected", value: "return_collected" },
];

export function InlineStatusDropdown({
  ticket,
  onStatusChange,
  statusColors,
  hasInvoice,
}: {
  ticket: Ticket;
  onStatusChange: (ticketId: string, status: TicketStatus) => void;
  statusColors: Record<string, string>;
  hasInvoice: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; dropUp: boolean }>({ top: 0, left: 0, dropUp: false });
  const [hoveredBlocked, setHoveredBlocked] = useState<TicketStatus | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const tooltipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Themed tooltip appears quickly (0.3s) instead of the native ~1.5s browser delay.
  const showTooltip = (s: TicketStatus) => {
    if (tooltipTimer.current) clearTimeout(tooltipTimer.current);
    tooltipTimer.current = setTimeout(() => setHoveredBlocked(s), 300);
  };
  const hideTooltip = () => {
    if (tooltipTimer.current) clearTimeout(tooltipTimer.current);
    setHoveredBlocked(null);
  };
  useEffect(() => () => { if (tooltipTimer.current) clearTimeout(tooltipTimer.current); }, []);

  const handleOpen = () => {
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const dropUp = spaceBelow < 300;
      setPos({
        top: dropUp ? rect.top : rect.bottom + 6,
        left: rect.left,
        dropUp,
      });
    }
    setOpen(!open);
  };

  const activeColor = statusColors[ticket.status] || "#71717A";

  // Locked after invoicing a collected ticket — the pill stays visible (using
  // the same visual language) but is read-only, with a subtle lock affordance
  // and an explanatory tooltip. No status change is possible from here.
  const locked = isStatusLocked(ticket.status, hasInvoice);
  const [lockTip, setLockTip] = useState(false);

  if (locked) {
    return (
      <div
        className="relative flex justify-start"
        onClick={(e) => e.stopPropagation()}
        onMouseEnter={() => setLockTip(true)}
        onMouseLeave={() => setLockTip(false)}
      >
        <span
          role="status"
          aria-label={`${STATUS_LABEL[ticket.status]} — status locked after invoice creation`}
          tabIndex={0}
          onFocus={() => setLockTip(true)}
          onBlur={() => setLockTip(false)}
          className="inline-flex cursor-default items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ring-inset whitespace-nowrap"
          style={{
            backgroundColor: `${activeColor}15`,
            color: activeColor,
            boxShadow: `inset 0 0 0 1px ${activeColor}30`,
          }}
        >
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: activeColor }} />
          {STATUS_LABEL[ticket.status]}
          <Lock className="h-3 w-3 opacity-60" aria-hidden />
        </span>
        {lockTip && (
          <div
            role="tooltip"
            className="pointer-events-none absolute left-0 top-full z-[80] mt-1.5 w-max max-w-[220px] animate-in fade-in-0 zoom-in-95 duration-150"
          >
            <div className="flex items-center gap-2 rounded-xl border border-[#4361EE]/20 bg-card px-3 py-2 text-[11px] font-medium leading-snug text-foreground shadow-lg ring-1 ring-black/[0.02]">
              <Lock className="h-3.5 w-3.5 shrink-0 text-[#4361EE]" />
              <span>Status is locked after invoice creation.</span>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative flex justify-start" onClick={(e) => e.stopPropagation()}>
      <button
        ref={btnRef}
        onClick={handleOpen}
        className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ring-inset whitespace-nowrap cursor-pointer transition hover:shadow-sm"
        style={{
          backgroundColor: `${activeColor}15`,
          color: activeColor,
          boxShadow: `inset 0 0 0 1px ${activeColor}30`,
        }}
      >
        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: activeColor }} />
        {STATUS_LABEL[ticket.status]}
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
                bottom: pos.dropUp ? (window.innerHeight - pos.top + 6) : undefined,
                left: pos.left,
              }}
              className="z-[70] w-[200px] rounded-xl border border-border bg-card p-1.5 shadow-xl"
            >
              {STATUS_OPTIONS.map((s) => {
                const sColor = statusColors[s.value] || "#71717A";
                // "Repaired & Collected" stays visible but is unavailable until
                // an invoice exists for this ticket. The rule is also enforced in
                // the store so it can't be bypassed from any other path.
                const isBlocked = s.value === "repaired_collected" && !hasInvoice && ticket.status !== "repaired_collected";
                return (
                  <div
                    key={s.value}
                    className="relative"
                    onMouseEnter={() => isBlocked && showTooltip(s.value)}
                    onMouseLeave={() => isBlocked && hideTooltip()}
                  >
                    <button
                      disabled={isBlocked}
                      onClick={() => { if (isBlocked) return; onStatusChange(ticket.id, s.value); setOpen(false); }}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[11px] font-medium transition",
                        isBlocked
                          ? "cursor-not-allowed opacity-45"
                          : ticket.status === s.value ? "bg-indigo-50 text-[#4361EE]" : "hover:bg-zinc-50 text-foreground"
                      )}
                    >
                      <span className="h-2 w-2 rounded-full ring-1 ring-inset ring-black/10" style={{ backgroundColor: sColor }} />
                      {s.label}
                      {isBlocked ? (
                        <Ban className="ml-auto h-3.5 w-3.5 text-rose-400" aria-label="Unavailable — needs invoice" />
                      ) : ticket.status === s.value ? (
                        <span className="ml-auto text-[9px] font-semibold text-[#4361EE]">✓</span>
                      ) : null}
                    </button>
                    {isBlocked && hoveredBlocked === s.value && (
                      <div
                        role="tooltip"
                        className="pointer-events-none absolute left-full top-1/2 z-[80] ml-2 w-max max-w-[210px] -translate-y-1/2 animate-in fade-in-0 zoom-in-95 duration-150"
                      >
                        <div className="relative flex items-center gap-2 rounded-xl border border-[#4361EE]/20 bg-card px-3 py-2 text-[11px] font-medium leading-snug text-foreground shadow-lg ring-1 ring-black/[0.02]">
                          <Ban className="h-3.5 w-3.5 shrink-0 text-rose-500" />
                          <span>Create an invoice before selecting Repaired &amp; Collected</span>
                          <span className="absolute -left-1 top-1/2 h-2 w-2 -translate-y-1/2 rotate-45 border-b border-l border-[#4361EE]/20 bg-card" />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
