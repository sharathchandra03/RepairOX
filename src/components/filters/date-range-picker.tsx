"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CalendarDays, Pencil, X } from "lucide-react";
import {
  DateRangePicker as CalendarRangePicker,
  type DateRange as CalendarDateRange,
} from "@/components/dashboard/date-range-picker";

/**
 * Shared custom Date Range picker used by the list surfaces (Tickets, Invoice,
 * Walk-In, Field, Leads/CRM) when the "Custom" quick-date option is selected.
 *
 * This is a thin adapter that keeps the long-standing string contract
 * (`from`/`to` as "YYYY-MM-DD", `onFromChange`/`onToChange`) BUT renders the
 * canonical calendar modal (`@/components/dashboard/date-range-picker`) — the
 * same beautiful "Custom Range" calendar shown on the Dashboard. Every call
 * site keeps working unchanged while gaining the consistent calendar UI.
 *
 * `allowFuture` defaults to true here so a future range can be selected on
 * these general-purpose filters (the Dashboard keeps its past-only default).
 */

/* ── String <-> Date helpers (local wall-clock, no TZ drift) ── */
function parseYMD(value: string): Date | null {
  if (!value) return null;
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return null;
  const date = new Date(y, m - 1, d);
  date.setHours(0, 0, 0, 0);
  return date;
}

function toYMD(date: Date | null): string {
  if (!date) return "";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function labelFor(date: Date | null): string {
  if (!date) return "—";
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export function DateRangePicker({
  open,
  from,
  to,
  onFromChange,
  onToChange,
  allowFuture = true,
}: {
  open: boolean;
  from: string;
  to: string;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
  allowFuture?: boolean;
}) {
  // The calendar is a modal, so track its own visibility. When the Custom
  // option first becomes active we auto-open the calendar; once the user
  // dismisses it (Cancel / backdrop) we don't force it back open — they can
  // reopen it from the inline summary's "Change" button.
  const [modalOpen, setModalOpen] = React.useState(false);
  const wasOpen = React.useRef(false);

  const start = parseYMD(from);
  const end = parseYMD(to);
  const hasRange = Boolean(start && end);

  React.useEffect(() => {
    if (open && !wasOpen.current) {
      // Custom was just selected — auto-open the calendar if no range yet.
      if (!hasRange) setModalOpen(true);
    }
    if (!open) {
      // Switched away from Custom — reset modal state.
      setModalOpen(false);
    }
    wasOpen.current = open;
  }, [open, hasRange]);

  if (!open) return null;

  const handleApply = (range: CalendarDateRange) => {
    onFromChange(toYMD(range.start));
    onToChange(toYMD(range.end));
    setModalOpen(false);
  };

  return (
    <>
      {/* Inline summary row — mirrors the previous inline picker's footprint so
          the strip layout/spacing stays identical. Shows the chosen range with
          Change + Clear affordances, or a prompt to pick a range. */}
      <AnimatePresence initial={false}>
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
          style={{ transformOrigin: "top" }}
          className="overflow-hidden"
        >
          <div className="flex items-end gap-4 pt-0.5">
            <div className="space-y-1.5">
              <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Date Range
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(true)}
                  className="group flex h-11 items-center gap-2.5 rounded-xl border border-input bg-card px-3.5 text-sm transition hover:border-[#4361EE] focus:outline-none focus-visible:border-[#4361EE] focus-visible:ring-2 focus-visible:ring-[#4361EE]/15"
                >
                  <span className="grid h-6 w-6 place-items-center rounded-md bg-[#4361EE]/10 text-[#4361EE]">
                    <CalendarDays className="h-3.5 w-3.5" />
                  </span>
                  {hasRange ? (
                    <span className="font-medium text-foreground">
                      {labelFor(start)} <span className="text-muted-foreground">—</span> {labelFor(end)}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">Pick a custom range</span>
                  )}
                  <Pencil className="h-3.5 w-3.5 text-muted-foreground group-hover:text-[#4361EE]" />
                </button>

                {hasRange && (
                  <button
                    type="button"
                    onClick={() => {
                      onFromChange("");
                      onToChange("");
                      setModalOpen(true);
                    }}
                    className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-input text-muted-foreground transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-600"
                    aria-label="Clear date range"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>

      {/* The canonical calendar modal (same as Dashboard). */}
      <CalendarRangePicker
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onApply={handleApply}
        initialRange={{ start, end }}
        allowFuture={allowFuture}
      />
    </>
  );
}
