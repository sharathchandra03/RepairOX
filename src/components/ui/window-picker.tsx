"use client";
/* ──────────────────────────────────────────────────────────────────────────
   WindowPickerField — the customer's preferred visit window, picked from a
   calendar + a From / To time (instead of free text). One pill opens a centred
   dialog (same RepairOX calendar language as DateTimeDialog). The value stays a
   readable string so existing storage (field_jobs.preferred_window) and every
   display keep working:  "16 Nov 2026 · 11:00 AM – 1:00 PM".
   Opens on the trip date/time when given, else today + the current time.
   Nothing is committed until Save.
   ────────────────────────────────────────────────────────────────────────── */
import * as React from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { CalendarDays, ChevronLeft, ChevronRight, Clock, X } from "lucide-react";
import { TimePicker } from "@/components/ui/time-picker";
import { cn } from "@/lib/utils";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const pad = (n: number) => String(n).padStart(2, "0");
const same = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

function to12(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  return `${h % 12 === 0 ? 12 : h % 12}:${pad(m)} ${h >= 12 ? "PM" : "AM"}`;
}
function from12(t: string): string | null {
  const m = t.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i);
  if (!m) return null;
  let h = Number(m[1]) % 12; if (m[3].toUpperCase() === "PM") h += 12;
  return `${pad(h)}:${m[2] ?? "00"}`;
}
const addMin = (hhmm: string, mins: number) => {
  const [h, m] = hhmm.split(":").map(Number);
  const t = Math.min(23 * 60 + 59, h * 60 + m + mins);
  return `${pad(Math.floor(t / 60))}:${pad(t % 60)}`;
};
export function formatWindow(day: Date, from: string, to: string): string {
  return `${day.getDate()} ${MON[day.getMonth()]} ${day.getFullYear()} · ${to12(from)} – ${to12(to)}`;
}
/** Parse a value written by formatWindow (older free-text values return null). */
function parseWindow(v: string): { day: Date; from: string; to: string } | null {
  const m = v.match(/^(\d{1,2}) ([A-Za-z]{3}) (\d{4}) · (.+?) [–-] (.+)$/);
  if (!m) return null;
  const mi = MON.findIndex((x) => x.toLowerCase() === m[2].toLowerCase());
  const f = from12(m[4]), t = from12(m[5]);
  if (mi < 0 || !f || !t) return null;
  return { day: new Date(Number(m[3]), mi, Number(m[1])), from: f, to: t };
}

function Dialog({ initial, onClose, onSave }: { initial: { day: Date; from: string; to: string }; onClose: () => void; onSave: (v: string) => void }) {
  const today = React.useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);
  const [day, setDay] = React.useState<Date>(initial.day);
  const [from, setFrom] = React.useState(initial.from);
  const [to, setTo] = React.useState(initial.to);
  const [year, setYear] = React.useState(initial.day.getFullYear());
  const [month, setMonth] = React.useState(initial.day.getMonth());
  React.useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    document.addEventListener("keydown", k, true);
    return () => document.removeEventListener("keydown", k, true);
  }, [onClose]);
  const invalid = to <= from;
  const first = new Date(year, month, 1).getDay();
  const dim = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(first).fill(null), ...Array.from({ length: dim }, (_, i) => i + 1)];
  const step = (d: number) => { const n = new Date(year, month + d, 1); setYear(n.getFullYear()); setMonth(n.getMonth()); };
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[10050] grid place-items-center bg-foreground/40 p-4 backdrop-blur-[2px]" onClick={onClose}>
      <motion.div initial={{ opacity: 0, scale: 0.96, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 8 }}
        transition={{ duration: 0.16 }} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Customer's window"
        className="w-full max-w-[560px] overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
          <p className="text-[14px] font-bold">Customer&apos;s window</p>
          <button type="button" onClick={onClose} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-lg border border-border text-muted-foreground hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>
        <div className="flex flex-col sm:flex-row">
          {/* Calendar */}
          <div className="p-4 sm:w-[300px]">
            <div className="mb-2 flex items-center justify-between">
              <p className="flex items-center gap-1.5 text-[13px] font-bold"><CalendarDays className="h-3.5 w-3.5 text-[#4361EE]" />{MONTHS[month]} {year}</p>
              <div className="flex gap-1">
                <button type="button" aria-label="Previous month" onClick={() => step(-1)} className="grid h-7 w-7 place-items-center rounded-lg hover:bg-[#EEF1FD]"><ChevronLeft className="h-4 w-4" /></button>
                <button type="button" aria-label="Next month" onClick={() => step(1)} className="grid h-7 w-7 place-items-center rounded-lg hover:bg-[#EEF1FD]"><ChevronRight className="h-4 w-4" /></button>
              </div>
            </div>
            <div className="grid grid-cols-7 gap-y-0.5 text-center">
              {DAYS.map((d) => <span key={d} className="py-1 text-[10px] font-bold uppercase text-muted-foreground">{d}</span>)}
              {cells.map((n, i) => {
                if (n == null) return <span key={`e${i}`} />;
                const dt = new Date(year, month, n);
                const sel = same(dt, day), isToday = same(dt, today), past = dt < today;
                return (
                  <button key={n} type="button" disabled={past} onClick={() => setDay(dt)}
                    className={cn("mx-auto grid h-9 w-9 place-items-center rounded-full text-[13px] font-medium transition",
                      sel ? "bg-[#4361EE] font-bold text-white" : isToday ? "bg-[#EEF1FD] font-bold text-[#4361EE] ring-1 ring-[#4361EE]/40" : "hover:bg-[#EEF1FD]",
                      past && "cursor-not-allowed opacity-30 hover:bg-transparent")}>{n}</button>
                );
              })}
            </div>
          </div>
          <span aria-hidden className="h-px w-full bg-border sm:h-auto sm:w-px" />
          {/* From / To */}
          <div className="flex-1 space-y-3 p-4">
            <p className="flex items-center gap-1.5 text-[13px] font-bold"><Clock className="h-3.5 w-3.5 text-[#4361EE]" />Time window</p>
            <div className="space-y-1">
              <label className="text-[11.5px] font-medium text-muted-foreground">From</label>
              <TimePicker className="h-[38px]" value={from} onChange={(v) => { setFrom(v); if (to <= v) setTo(addMin(v, 120)); }} />
            </div>
            <div className="space-y-1">
              <label className="text-[11.5px] font-medium text-muted-foreground">To</label>
              <TimePicker className="h-[38px]" value={to} onChange={setTo} />
            </div>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {[60, 120, 180].map((m) => (
                <button key={m} type="button" onClick={() => setTo(addMin(from, m))}
                  className="rounded-full border border-input px-2.5 py-1 text-[11.5px] font-semibold hover:border-[#4361EE]/50">{m / 60} hr</button>
              ))}
            </div>
            {invalid ? <p className="text-[11.5px] font-medium text-rose-600">&ldquo;To&rdquo; must be after &ldquo;From&rdquo;.</p> : null}
            <p className="rounded-lg bg-[#EEF1FD]/60 px-2.5 py-2 text-[12px] font-semibold text-[#3450D8]">{formatWindow(day, from, to)}</p>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
          <button type="button" onClick={onClose} className="rounded-lg px-3 py-1.5 text-[12.5px] font-semibold text-muted-foreground hover:bg-muted">Cancel</button>
          <button type="button" disabled={invalid} onClick={() => { onSave(formatWindow(day, from, to)); onClose(); }}
            className="rounded-lg bg-[#4361EE] px-4 py-1.5 text-[12.5px] font-semibold text-white shadow-sm hover:bg-[#3651D4] disabled:opacity-50">Save</button>
        </div>
      </motion.div>
    </motion.div>
  );
}

export function WindowPickerField({ value, onChange, defaultDate, defaultTime, placeholder = "Pick date & time window", className, disabled }: {
  /** Stored window text ("" when unset). */
  value: string; onChange: (v: string) => void;
  /** Trip date "YYYY-MM-DD" / time "HH:mm" to open on (falls back to today / now). */
  defaultDate?: string; defaultTime?: string;
  placeholder?: string; className?: string; disabled?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => { setMounted(true); }, []);
  const initial = React.useMemo(() => {
    const parsed = value ? parseWindow(value) : null;
    if (parsed) return parsed;
    let day = new Date(); day.setHours(0, 0, 0, 0);
    if (defaultDate && /^\d{4}-\d{2}-\d{2}$/.test(defaultDate)) { const [y, m, d] = defaultDate.split("-").map(Number); day = new Date(y, m - 1, d); }
    const now = new Date();
    const from = defaultTime && /^\d{2}:\d{2}$/.test(defaultTime) ? defaultTime : `${pad(now.getHours())}:${pad(now.getMinutes())}`;
    return { day, from, to: addMin(from, 120) };
  }, [value, defaultDate, defaultTime, open]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <button type="button" disabled={disabled} onClick={(e) => { e.stopPropagation(); if (!disabled) setOpen(true); }}
        className={cn("flex h-[38px] w-full items-center justify-between gap-2 rounded-xl border bg-card px-3 text-[13px] transition-all",
          open ? "border-[#4361EE] ring-2 ring-[#4361EE]/15" : "border-input hover:border-[#4361EE]/40", disabled && "cursor-not-allowed opacity-50", className)}>
        <span className={cn("truncate text-left", !value && "text-muted-foreground")}>{value || placeholder}</span>
        <span className="flex shrink-0 items-center gap-1">
          {value && !disabled ? <span role="button" tabIndex={0} aria-label="Clear window" onClick={(e) => { e.stopPropagation(); onChange(""); }}
            className="grid h-5 w-5 place-items-center rounded-full text-muted-foreground hover:bg-muted"><X className="h-3 w-3" /></span> : null}
          <Clock className="h-3.5 w-3.5 text-muted-foreground" />
        </span>
      </button>
      {mounted && createPortal(
        <AnimatePresence>{open && <Dialog initial={initial} onClose={() => setOpen(false)} onSave={onChange} />}</AnimatePresence>,
        document.body)}
    </>
  );
}
