"use client";

/* ─── Shared themed Date + Time picker ─────────────────────────────────────
   The RepairOX-branded (indigo #4361EE) calendar + inline time selector, shown
   as a CENTERED modal over a dimmed backdrop (never an anchored popover that
   collides with a busy form). This is the CANONICAL date/time control — every
   date+time field in the app must use it (never a raw <input type="date"> /
   "time").

   Exports:
     • <DateTimeDialog>  — the centered modal (calendar + time side by side +
       OK/Cancel). `DateTimePopover` is a backwards-compatible alias.
     • <DateTimeField>   — a labeled trigger button (looks like a form field)
       that opens the dialog; a drop-in for date+time form inputs.

   Value contract: ISO datetime string ("" when unset). Commit-on-OK — nothing
   applies until the user presses OK.
   ────────────────────────────────────────────────────────────────────────── */

import * as React from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, CalendarClock } from "lucide-react";
import { cn } from "@/lib/utils";

/* ─── ISO helpers (local wall-clock) ── */
function pad(n: number) { return String(n).padStart(2, "0"); }

export function isoToLocalTime(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function combineToIso(day: Date, time: string): string | undefined {
  const [hh, mm] = (time || "00:00").split(":").map((v) => parseInt(v, 10));
  const d = new Date(day.getFullYear(), day.getMonth(), day.getDate(), isNaN(hh) ? 0 : hh, isNaN(mm) ? 0 : mm, 0, 0);
  if (isNaN(d.getTime())) return undefined;
  return d.toISOString();
}

/* ─── Calendar math ── */
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
function getDaysInMonth(y: number, m: number) { return new Date(y, m + 1, 0).getDate(); }
function getFirstDayOfMonth(y: number, m: number) { return new Date(y, m, 1).getDay(); }
function isSameDay(a: Date | null, b: Date | null) {
  if (!a || !b) return false;
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/* ─── The centered dialog (calendar + time) ── */
export function DateTimeDialog({
  initialIso,
  defaultTime = "09:00",
  title = "Date & Time",
  onClose,
  onSave,
}: {
  initialIso?: string;
  defaultTime?: string;
  title?: string;
  onClose: () => void;
  onSave: (iso: string) => Promise<void> | void;
}) {
  const initialDate = React.useMemo(() => {
    const d = initialIso ? new Date(initialIso) : new Date();
    return isNaN(d.getTime()) ? new Date() : d;
  }, [initialIso]);

  const today = React.useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);

  const [selected, setSelected] = React.useState<Date>(() => { const d = new Date(initialDate); d.setHours(0, 0, 0, 0); return d; });
  const [time, setTime] = React.useState<string>(() => isoToLocalTime(initialIso) || defaultTime);
  const [year, setYear] = React.useState(initialDate.getFullYear());
  const [month, setMonth] = React.useState(initialDate.getMonth());
  const [saving, setSaving] = React.useState(false);

  /* Inline time parts derived from `time` ("HH:mm", 24h). */
  const [h24, minute] = React.useMemo(() => {
    const [hh, mm] = (time || "00:00").split(":").map((v) => parseInt(v, 10));
    return [isNaN(hh) ? 0 : hh, isNaN(mm) ? 0 : mm];
  }, [time]);
  const meridiem: "AM" | "PM" = h24 >= 12 ? "PM" : "AM";
  const hour12 = ((h24 + 11) % 12) + 1; // 1..12
  const setTimeParts = (nextH12: number, nextMin: number, nextMer: "AM" | "PM") => {
    let h = nextH12 % 12;
    if (nextMer === "PM") h += 12;
    setTime(`${pad(h)}:${pad(nextMin)}`);
  };
  const HOURS = Array.from({ length: 12 }, (_, i) => i + 1);
  const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5); // 00,05,…,55

  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);

  const prevMonth = () => { if (month === 0) { setMonth(11); setYear((y) => y - 1); } else setMonth((m) => m - 1); };
  const nextMonth = () => { if (month === 11) { setMonth(0); setYear((y) => y + 1); } else setMonth((m) => m + 1); };

  const handleSave = async () => {
    const iso = combineToIso(selected, time);
    if (!iso) return;
    setSaving(true);
    try { await onSave(iso); onClose(); } finally { setSaving(false); }
  };

  const previewIso = combineToIso(selected, time);

  return (
    <>
      {/* Dimmed backdrop — hides the busy form behind the picker. */}
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="fixed inset-0 z-[10050] bg-foreground/50 backdrop-blur-sm"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        aria-hidden
      />
      {/* Centered modal. */}
      <div
        className="fixed inset-0 z-[10051] flex items-center justify-center p-4"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); onClose(); }}
      >
        <motion.div
          data-lead-popover-open="true"
          initial={{ opacity: 0, scale: 0.96, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 8 }}
          transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
          className="w-full max-w-md overflow-hidden rounded-2xl border border-border bg-card shadow-[0_32px_80px_-20px_rgba(20,30,80,0.45)]"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-label={title}
        >
          {/* Header — title + live preview of the chosen date · time. */}
          <div className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-3">
            <p className="text-[14px] font-bold text-foreground">{title}</p>
            <p className="text-[12px] font-semibold text-[#4361EE]">
              {selected.toLocaleDateString("en-IN", { dateStyle: "medium" })}
              {previewIso ? ` · ${new Date(previewIso).toLocaleTimeString("en-IN", { timeStyle: "short" })}` : ""}
            </p>
          </div>

          {/* Body — calendar (left) + time (right), side by side. */}
          <div className="flex flex-col gap-4 p-4 sm:flex-row">
            {/* Calendar */}
            <div className="select-none sm:flex-1">
              <div className="mb-1.5 flex items-center justify-between">
                <button type="button" onClick={prevMonth} className="grid h-7 w-7 place-items-center rounded-lg text-muted-foreground transition hover:bg-[#EEF1FD] hover:text-[#4361EE]" aria-label="Previous month"><ChevronLeft className="h-4 w-4" /></button>
                <span className="px-3 py-1 text-[13px] font-bold text-foreground">{MONTHS[month]} {year}</span>
                <button type="button" onClick={nextMonth} className="grid h-7 w-7 place-items-center rounded-lg text-muted-foreground transition hover:bg-[#EEF1FD] hover:text-[#4361EE]" aria-label="Next month"><ChevronRight className="h-4 w-4" /></button>
              </div>

              <div className="grid grid-cols-7">
                {DAYS.map((d) => (
                  <div key={d} className="py-0.5 text-center text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">{d}</div>
                ))}
              </div>

              <div className="grid grid-cols-7">
                {Array.from({ length: firstDay }).map((_, i) => <div key={`e-${i}`} className="h-8" />)}
                {Array.from({ length: daysInMonth }).map((_, i) => {
                  const day = new Date(year, month, i + 1); day.setHours(0, 0, 0, 0);
                  const isSel = isSameDay(day, selected);
                  const isToday = isSameDay(day, today);
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setSelected(day)}
                      className={cn(
                        "relative h-8 w-full rounded-lg text-[13px] font-medium transition-all",
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

            {/* Time — Hour / Minute / AM-PM, beside the calendar. */}
            <div className="sm:w-[190px]">
              <p className="mb-1.5 text-[12px] font-semibold text-foreground">Time</p>
              <div className="grid grid-cols-3 gap-2">
                <div className="rox-rail-scroll h-[210px] overflow-y-auto rounded-lg border border-border bg-muted/20 p-1">
                  {HOURS.map((h) => (
                    <button
                      key={h}
                      type="button"
                      onClick={() => setTimeParts(h, minute, meridiem)}
                      className={cn(
                        "flex w-full items-center justify-center rounded-md py-1.5 text-[13px] font-medium transition-colors",
                        h === hour12 ? "bg-[#4361EE] text-white" : "text-foreground hover:bg-[#EEF1FD]",
                      )}
                    >
                      {pad(h)}
                    </button>
                  ))}
                </div>
                <div className="rox-rail-scroll h-[210px] overflow-y-auto rounded-lg border border-border bg-muted/20 p-1">
                  {MINUTES.map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setTimeParts(hour12, m, meridiem)}
                      className={cn(
                        "flex w-full items-center justify-center rounded-md py-1.5 text-[13px] font-medium transition-colors",
                        m === minute ? "bg-[#4361EE] text-white" : "text-foreground hover:bg-[#EEF1FD]",
                      )}
                    >
                      {pad(m)}
                    </button>
                  ))}
                </div>
                <div className="flex flex-col gap-2">
                  {(["AM", "PM"] as const).map((mer) => (
                    <button
                      key={mer}
                      type="button"
                      onClick={() => setTimeParts(hour12, minute, mer)}
                      className={cn(
                        "flex flex-1 items-center justify-center rounded-lg border text-[13px] font-semibold transition-colors",
                        mer === meridiem ? "border-[#4361EE] bg-[#4361EE] text-white" : "border-border text-foreground hover:bg-[#EEF1FD]",
                      )}
                    >
                      {mer}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 border-t border-border/60 px-4 py-3">
            <button type="button" onClick={onClose} disabled={saving} className="rounded-lg px-3 py-1.5 text-[13px] font-semibold text-muted-foreground transition hover:bg-muted disabled:opacity-50">Cancel</button>
            <button type="button" onClick={handleSave} disabled={saving} className="rounded-lg bg-[#4361EE] px-5 py-1.5 text-[13px] font-semibold text-white shadow-sm transition hover:bg-[#3651D4] disabled:opacity-60">{saving ? "Saving…" : "OK"}</button>
          </div>
        </motion.div>
      </div>
    </>
  );
}

/** Backwards-compatible alias — older call sites pass `anchorRect` (ignored now
 *  that the picker is centered). */
export function DateTimePopover(props: React.ComponentProps<typeof DateTimeDialog> & { anchorRect?: DOMRect }) {
  const { anchorRect: _ignored, ...rest } = props;
  return <DateTimeDialog {...rest} />;
}

/* ─── Labeled trigger field (drop-in for a date+time form input) ── */
export function DateTimeField({
  value,
  onChange,
  placeholder = "Pick date & time",
  title = "Date & Time",
  invalid,
  disabled,
  className,
}: {
  /** ISO datetime string ("" when unset). */
  value: string;
  onChange: (iso: string) => void;
  placeholder?: string;
  title?: string;
  invalid?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => { setMounted(true); }, []);

  const label = value
    ? `${new Date(value).toLocaleDateString("en-IN", { dateStyle: "medium" })} · ${new Date(value).toLocaleTimeString("en-IN", { timeStyle: "short" })}`
    : "";

  return (
    <>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); if (!disabled) setOpen(true); }}
        disabled={disabled}
        className={cn(
          "flex h-[38px] w-full items-center justify-between gap-2 rounded-xl border bg-card px-3 text-[13px] transition-all",
          open ? "border-[#4361EE] ring-2 ring-[#4361EE]/15" : invalid ? "border-rose-300" : "border-input hover:border-[#4361EE]/40",
          disabled && "cursor-not-allowed opacity-50",
          className,
        )}
      >
        <span className={cn("truncate text-left", !value && "text-muted-foreground")}>{label || placeholder}</span>
        <CalendarClock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      </button>

      {mounted && createPortal(
        <AnimatePresence>
          {open && (
            <DateTimeDialog
              initialIso={value || undefined}
              title={title}
              onClose={() => setOpen(false)}
              onSave={(iso) => { onChange(iso); }}
            />
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}
