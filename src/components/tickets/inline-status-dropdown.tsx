"use client";

/**
 * InlineStatusDropdown — the CANONICAL inline ticket-status control.
 *
 * Single source of truth for changing a ticket's status directly from a list
 * row (the Tickets module table and the Dashboard "Critical Tasks" card both
 * use this exact component). It renders the status pill as a button and, on
 * click, a portal-positioned menu of the available statuses.
 *
 * The control is split into two layers:
 *   • `StatusPillDropdown` — the reusable, scope-agnostic pill + portal menu.
 *     It operates on a plain `status` value and an `onSelect(status)` callback,
 *     so it can drive EITHER a ticket status OR a single device's status inside
 *     a multi-device ticket. Colours, drop-up positioning, framer-motion
 *     animation, and the locked / blocked business rules all live here so every
 *     scope shares one visual language and one set of rules.
 *   • `InlineStatusDropdown` — a thin wrapper that binds the reusable control to
 *     a `Ticket` (reads `ticket.status`, dispatches `onStatusChange(ticket.id,
 *     …)`). Existing call sites keep their exact props.
 *
 * Business rules preserved here (not re-implemented per call site):
 *   • "Repaired & Collected" is unavailable until an invoice exists (also
 *     enforced in the store so it can't be bypassed).
 *   • The control stops click propagation so an inline status change never
 *     also triggers the row's navigation/onClick.
 *
 * The mutation itself (updateTicket / updateDeviceStatus + any parts deduction)
 * is owned by the caller via the select callback, keeping lifecycle logic in
 * one place.
 */

import { useState, useRef, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Ban, Search, Check } from "lucide-react";
import { type TicketStatus, type Ticket } from "@/lib/mock-data";
import { useStoreSettings } from "@/lib/store-settings";
import { resolveStatus, statusGroups } from "@/lib/ticket-status-config";
import { ModalPortal, Z } from "@/components/ui/modal-portal";
import { cn } from "@/lib/utils";

/** Compact size variant used inside device cards; `md` matches the list row. */
type PillSize = "sm" | "md";

const PILL_SIZE: Record<PillSize, string> = {
  sm: "px-2 py-0.5 text-[10px]",
  md: "px-2.5 py-1 text-[11px]",
};

/**
 * StatusPillDropdown — reusable, scope-agnostic status pill + menu.
 *
 * Shows the record's status (custom status label/colour when one is set) and,
 * on click, a searchable menu GROUPED BY CATEGORY (Settings → Tickets →
 * Statuses & Categories): system statuses + custom statuses. Picking a custom
 * status calls `onSelect(baseStatus, customId)` — the base keeps every
 * business rule working; picking a system status passes `statusId` undefined.
 */
export function StatusPillDropdown({
  status,
  statusId,
  onSelect,
  statusColors,
  hasInvoice,
  size = "md",
  ariaLabel,
  fill = false,
}: {
  /** Table mode: the pill fills its column (stable width, label truncates,
   *  chevron pinned right) — the RepairOX table-pill standard. */
  fill?: boolean;
  status: TicketStatus;
  statusId?: string;
  onSelect: (status: TicketStatus, statusId?: string) => void;
  statusColors: Record<string, string>;
  hasInvoice: boolean;
  size?: PillSize;
  /** Optional accessible label prefix, e.g. a device name, for screen readers. */
  ariaLabel?: string;
}) {
  const { settings } = useStoreSettings();
  const config = settings.ticketStatusConfig;
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [pos, setPos] = useState<{ top: number; left: number; dropUp: boolean }>({ top: 0, left: 0, dropUp: false });
  const [hoveredBlocked, setHoveredBlocked] = useState<string | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const tooltipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showTooltip = (k: string) => {
    if (tooltipTimer.current) clearTimeout(tooltipTimer.current);
    tooltipTimer.current = setTimeout(() => setHoveredBlocked(k), 300);
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
      const dropUp = spaceBelow < 360 && rect.top > spaceBelow;
      setPos({ top: dropUp ? rect.top : rect.bottom + 6, left: Math.min(rect.left, window.innerWidth - 248), dropUp });
      setQ("");
    }
    setOpen(!open);
  };

  const current = resolveStatus(status, statusId, config, statusColors);
  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return statusGroups(config, statusColors)
      .map((g) => ({ ...g, options: needle ? g.options.filter((o) => o.label.toLowerCase().includes(needle) || g.category.name.toLowerCase().includes(needle)) : g.options }))
      .filter((g) => g.options.length > 0);
  }, [config, statusColors, q]);
  const isCurrent = (o: { status: TicketStatus; statusId?: string }) => o.status === status && (o.statusId ?? undefined) === (current.statusId ?? undefined);
  const labelPrefix = ariaLabel ? `${ariaLabel} — ` : "";

  // NOTE: the status is intentionally NOT locked after invoice creation. The
  // only guard: anything that behaves as "Repaired & Collected" needs an
  // invoice first (also enforced in the store, so it can't be bypassed).

  return (
    <div className={cn("relative flex justify-start", fill && "w-full")} onClick={(e) => e.stopPropagation()}>
      <button
        ref={btnRef}
        onClick={handleOpen}
        aria-label={`${labelPrefix}status: ${current.label}`}
        title={current.categoryName ? `${current.categoryName} · ${current.label}` : current.label}
        className={cn(
          "max-w-full items-center gap-1.5 rounded-full font-medium ring-1 ring-inset whitespace-nowrap cursor-pointer transition hover:shadow-sm",
          fill ? "flex w-full min-w-0" : "inline-flex",
          PILL_SIZE[size]
        )}
        style={{
          backgroundColor: `${current.color}15`,
          color: current.color,
          boxShadow: `inset 0 0 0 1px ${current.color}30`,
        }}
      >
        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: current.color }} />
        <span className={cn("truncate", fill && "min-w-0 flex-1 text-left")}>{current.label}</span>
        <ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
      </button>
      <ModalPortal>
      <AnimatePresence>
        {open && (
          <>
            <div className={`fixed inset-0 ${Z.overlay}`} onClick={() => setOpen(false)} />
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
              onClick={(e) => e.stopPropagation()}
              className={`${Z.overlayPanel} w-[240px] overflow-hidden rounded-xl border border-border bg-card shadow-xl`}
            >
              {/* Search */}
              <div className="flex items-center gap-2 border-b border-border px-3 py-2">
                <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search statuses…"
                  className="min-w-0 flex-1 bg-transparent text-[12px] outline-none placeholder:text-muted-foreground" />
              </div>
              <div className="max-h-[300px] overflow-y-auto p-1.5 rox-rail-scroll">
                {groups.length === 0 && <p className="px-3 py-4 text-center text-[11.5px] text-muted-foreground">No matching status</p>}
                {groups.map((g) => (
                  <div key={g.category.id}>
                    {/* Category divider — "──── Open ────" */}
                    <div className="flex items-center gap-2 px-2 pb-1 pt-2">
                      <span className="h-px flex-1 bg-border" />
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{g.category.name}</span>
                      <span className="h-px flex-1 bg-border" />
                    </div>
                    {g.options.map((o) => {
                      const isBlocked = o.status === "repaired_collected" && !hasInvoice && status !== "repaired_collected";
                      const active = isCurrent(o);
                      return (
                        <div key={o.key} className="relative"
                          onMouseEnter={() => isBlocked && showTooltip(o.key)}
                          onMouseLeave={() => isBlocked && hideTooltip()}>
                          <button
                            disabled={isBlocked}
                            onClick={() => { if (isBlocked) return; onSelect(o.status, o.statusId); setOpen(false); }}
                            className={cn(
                              "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[12px] font-medium transition",
                              isBlocked ? "cursor-not-allowed opacity-45" : active ? "bg-indigo-50 text-[#4361EE]" : "text-foreground hover:bg-zinc-50",
                            )}
                          >
                            {/* Ring-dot, like the reference: colour ring + filled centre */}
                            <span className="grid h-3.5 w-3.5 shrink-0 place-items-center rounded-full" style={{ boxShadow: `inset 0 0 0 2px ${o.color}` }}>
                              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: o.color }} />
                            </span>
                            <span className="min-w-0 flex-1 truncate">{o.label}</span>
                            {isBlocked ? <Ban className="h-3.5 w-3.5 shrink-0 text-rose-400" aria-label="Unavailable — needs invoice" />
                              : active ? <Check className="h-3.5 w-3.5 shrink-0 text-[#4361EE]" /> : null}
                          </button>
                          {isBlocked && hoveredBlocked === o.key && (
                            <div role="tooltip" className="pointer-events-none absolute right-full top-1/2 z-[80] mr-2 w-max max-w-[210px] -translate-y-1/2">
                              <div className="flex items-center gap-2 rounded-xl border border-[#4361EE]/20 bg-card px-3 py-2 text-[11px] font-medium leading-snug text-foreground shadow-lg">
                                <Ban className="h-3.5 w-3.5 shrink-0 text-rose-500" />
                                <span>Create an invoice before selecting {o.label}</span>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
      </ModalPortal>
    </div>
  );
}

/**
 * InlineStatusDropdown — ticket-scoped wrapper around StatusPillDropdown.
 * Keeps the original props/behaviour for all existing call sites (Tickets
 * table, Dashboard Critical Tasks).
 */
export function InlineStatusDropdown({
  ticket,
  onStatusChange,
  statusColors,
  hasInvoice,
  fill,
}: {
  fill?: boolean;
  ticket: Ticket;
  onStatusChange: (ticketId: string, status: TicketStatus, statusId?: string) => void;
  statusColors: Record<string, string>;
  hasInvoice: boolean;
}) {
  return (
    <StatusPillDropdown
      status={ticket.status}
      statusId={ticket.statusId}
      onSelect={(s, id) => onStatusChange(ticket.id, s, id)}
      statusColors={statusColors}
      hasInvoice={hasInvoice}
      size="md"
      fill={fill}
    />
  );
}
