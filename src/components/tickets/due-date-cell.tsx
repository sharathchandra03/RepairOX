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
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useStore } from "@/lib/store";
import { TimePicker } from "@/components/ui/time-picker";
import type { Ticket } from "@/lib/mock-data";

/* ─── Local-time ISO helpers ──────────────────────────────────────────────
   Mirrors the helpers on the ticket detail page so the picker shows and stores
   the same wall-clock time we display in the table. */

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/** ISO → "HH:mm" (local) for a <input type="time">. */
function isoToLocalTime(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Combine a selected local Date (day) + "HH:mm" time → ISO string. */
function combineToIso(day: Date, time: string): string | undefined {
  const [hh, mm] = (time || "00:00").split(":").map((v) => parseInt(v, 10));
  const d = new Date(day.getFullYear(), day.getMonth(), day.getDate(), isNaN(hh) ? 0 : hh, isNaN(mm) ? 0 : mm, 0, 0);
  if (isNaN(d.getTime())) return undefined;
  return d.toISOString();
}

/* ─── Calendar helpers (same math as the branded date-range picker) ── */

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}
function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}
function isSameDay(a: Date | null, b: Date | null) {
  if (!a || !b) return false;
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/* ─── The popover contents ────────────────────────────────────────────── */

function DueDatePopover({
  anchorRect,
  initialIso,
  onClose,
  onSave,
}: {
  anchorRect: DOMRect;
  initialIso?: string;
  onClose: () => void;
  onSave: (iso: string) => Promise<void> | void;
}) {
  const initialDate = React.useMemo(() => {
    const d = initialIso ? new Date(initialIso) : new Date();
    return isNaN(d.getTime()) ? new Date() : d;
  }, [initialIso]);

  const today = React.useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const [selected, setSelected] = React.useState<Date>(() => {
    const d = new Date(initialDate);
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [time, setTime] = React.useState<string>(() => isoToLocalTime(initialIso) || "09:00");
  const [year, setYear] = React.useState(initialDate.getFullYear());
  const [month, setMonth] = React.useState(initialDate.getMonth());
  const [saving, setSaving] = React.useState(false);

  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);

  const handlePrevMonth = () => {
    if (month === 0) { setMonth(11); setYear((y) => y - 1); }
    else setMonth((m) => m - 1);
  };
  const handleNextMonth = () => {
    if (month === 11) { setMonth(0); setYear((y) => y + 1); }
    else setMonth((m) => m + 1);
  };

  const handleSave = async () => {
    const iso = combineToIso(selected, time);
    if (!iso) return;
    setSaving(true);
    try {
      await onSave(iso);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  // Position: below the cell when possible, else above. Clamp to viewport.
  const POPOVER_W = 288; // w-72
  const EST_H = 340;
  const spaceBelow = window.innerHeight - anchorRect.bottom;
  const openUp = spaceBelow < EST_H && anchorRect.top > EST_H;
  const top = openUp ? Math.max(8, anchorRect.top - EST_H - 6) : anchorRect.bottom + 6;
  let left = anchorRect.left;
  if (left + POPOVER_W > window.innerWidth - 8) left = window.innerWidth - POPOVER_W - 8;
  if (left < 8) left = 8;

  return (
    <>
      {/* Click-away backdrop (transparent).
          NOTE: this is portaled to document.body, but React portal events still
          bubble through the REACT tree — i.e. up to the table row's onClick
          (which routes to the ticket detail / view page). We must stop
          propagation here so closing the calendar never opens the ticket. */}
      <div
        className="fixed inset-0 z-[9998]"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        aria-hidden
      />

      <motion.div
        initial={{ opacity: 0, y: openUp ? 6 : -6, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: openUp ? 6 : -6, scale: 0.98 }}
        transition={{ duration: 0.14, ease: "easeOut" }}
        style={{ position: "fixed", top, left, width: POPOVER_W }}
        className="z-[9999] overflow-hidden rounded-2xl border border-border bg-card shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Set due date and time"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/60 px-4 py-2">
          <p className="text-[13px] font-bold text-foreground">Due Date &amp; Time</p>
          <p className="text-[11px] font-medium text-[#4361EE]">
            {selected.toLocaleDateString("en-IN", { dateStyle: "medium" })}
            {" · "}
            {(() => {
              const iso = combineToIso(selected, time);
              return iso ? new Date(iso).toLocaleTimeString("en-IN", { timeStyle: "short" }) : "";
            })()}
          </p>
        </div>

        {/* Calendar */}
        <div className="select-none px-4 py-2">
          <div className="mb-1.5 flex items-center justify-between">
            <button
              type="button"
              onClick={handlePrevMonth}
              className="grid h-7 w-7 place-items-center rounded-lg text-muted-foreground transition hover:bg-[#EEF1FD] hover:text-[#4361EE]"
              aria-label="Previous month"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="px-3 py-1 text-[13px] font-bold text-foreground">
              {MONTHS[month]} {year}
            </span>
            <button
              type="button"
              onClick={handleNextMonth}
              className="grid h-7 w-7 place-items-center rounded-lg text-muted-foreground transition hover:bg-[#EEF1FD] hover:text-[#4361EE]"
              aria-label="Next month"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-7">
            {DAYS.map((d) => (
              <div key={d} className="py-0.5 text-center text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">
                {d}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7">
            {Array.from({ length: firstDay }).map((_, i) => (
              <div key={`empty-${i}`} className="h-7" />
            ))}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = new Date(year, month, i + 1);
              day.setHours(0, 0, 0, 0);
              const isSel = isSameDay(day, selected);
              const isToday = isSameDay(day, today);
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => setSelected(day)}
                  className={cn(
                    "relative h-7 w-full rounded-lg text-[13px] font-medium transition-all",
                    !isSel && "text-foreground hover:bg-[#EEF1FD] hover:text-[#4361EE]",
                    isSel && "bg-[#4361EE] font-bold text-white shadow-sm",
                    isToday && !isSel && "font-bold ring-2 ring-inset ring-[#4361EE]/30",
                  )}
                >
                  {i + 1}
                </button>
              );
            })}
          </div>
        </div>

        {/* Time */}
        <div className="flex items-center gap-2 border-t border-border/60 px-4 py-2">
          <label className="text-[12px] font-semibold text-foreground">Time</label>
          <div className="ml-auto w-[140px]">
            <TimePicker value={time} onChange={setTime} />
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 border-t border-border/60 px-4 py-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg px-3 py-1.5 text-[12px] font-semibold text-muted-foreground transition hover:bg-muted disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-[#4361EE] px-4 py-1.5 text-[12px] font-semibold text-white shadow-sm transition hover:bg-[#3651D4] disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </motion.div>
    </>
  );
}

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
            <DueDatePopover
              anchorRect={anchorRect}
              initialIso={ticket.dueDate}
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
