"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, X, CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";

/* ── Types ── */
export type DateRange = { start: Date | null; end: Date | null };

type DateRangePickerProps = {
  open: boolean;
  onClose: () => void;
  onApply: (range: DateRange) => void;
  initialRange?: DateRange;
};

/* ── Helpers ── */
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

function isInRange(day: Date, start: Date | null, end: Date | null) {
  if (!start || !end) return false;
  const t = day.getTime();
  const s = Math.min(start.getTime(), end.getTime());
  const e = Math.max(start.getTime(), end.getTime());
  return t > s && t < e;
}

function formatDate(d: Date | null): string {
  if (!d) return "—";
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

/* ── Month/Year Selector ── */
function MonthYearSelector({
  year, month, onSelect, onClose,
}: {
  year: number;
  month: number;
  onSelect: (y: number, m: number) => void;
  onClose: () => void;
}) {
  const [selYear, setSelYear] = React.useState(year);
  const currentYear = new Date().getFullYear();
  const yearRange = Array.from({ length: 21 }, (_, i) => currentYear - 10 + i);
  const centerIdx = yearRange.indexOf(selYear);
  const startIdx = Math.max(0, centerIdx - 3);

  return (
    <div className="flex flex-col h-full">
      {/* Year nav */}
      <div className="flex items-center justify-between px-2 py-2.5 border-b border-border/60">
        <button onClick={() => setSelYear((y) => y - 1)} className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-[#EEF1FD] hover:text-[#4361EE] transition" aria-label="Previous year">
          <ChevronsLeft className="h-4 w-4" />
        </button>
        <span className="text-[14px] font-bold text-foreground">{selYear}</span>
        <button onClick={() => setSelYear((y) => y + 1)} className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-[#EEF1FD] hover:text-[#4361EE] transition" aria-label="Next year">
          <ChevronsRight className="h-4 w-4" />
        </button>
      </div>

      {/* Year quick jump row */}
      <div className="flex items-center justify-center gap-1 px-2 py-2 border-b border-border/40">
        {yearRange.slice(startIdx, startIdx + 7).map((y) => (
          <button
            key={y}
            onClick={() => setSelYear(y)}
            className={cn(
              "rounded-md px-2 py-1 text-[11px] font-semibold transition",
              y === selYear ? "bg-[#4361EE] text-white shadow-sm" : "text-muted-foreground hover:bg-[#EEF1FD] hover:text-[#4361EE]"
            )}
          >
            {y}
          </button>
        ))}
      </div>

      {/* Month grid */}
      <div className="grid grid-cols-3 gap-2.5 p-4 flex-1 content-center">
        {MONTHS.map((m, i) => (
          <button
            key={m}
            onClick={() => { onSelect(selYear, i); onClose(); }}
            className={cn(
              "rounded-xl py-3 text-[13px] font-semibold transition",
              i === month && selYear === year
                ? "bg-[#4361EE] text-white shadow-sm"
                : "text-foreground hover:bg-[#EEF1FD] hover:text-[#4361EE] border border-transparent hover:border-[#B3BFF6]/50"
            )}
          >
            {m.slice(0, 3)}
          </button>
        ))}
      </div>

      {/* Back button */}
      <div className="border-t border-border/60 px-4 py-3">
        <button
          onClick={onClose}
          className="w-full rounded-lg py-2 text-[12px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition"
        >
          ← Back to calendar
        </button>
      </div>
    </div>
  );
}

/* ── Calendar Grid ── */
function CalendarGrid({
  year, month, range, hoverDate, onDayClick, onDayHover, onMonthYearClick,
  onPrevMonth, onNextMonth,
}: {
  year: number;
  month: number;
  range: DateRange;
  hoverDate: Date | null;
  onDayClick: (d: Date) => void;
  onDayHover: (d: Date | null) => void;
  onMonthYearClick: () => void;
  onPrevMonth: () => void;
  onNextMonth: () => void;
}) {
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const effectiveEnd = range.end || hoverDate;

  return (
    <div className="select-none px-5 py-4">
      {/* Navigation */}
      <div className="flex items-center justify-between mb-4">
        <button onClick={onPrevMonth} className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-[#EEF1FD] hover:text-[#4361EE] transition" aria-label="Previous month">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          onClick={onMonthYearClick}
          className="text-[14px] font-bold text-foreground hover:text-[#4361EE] transition px-3 py-1.5 rounded-lg hover:bg-[#EEF1FD]"
        >
          {MONTHS[month]} {year}
        </button>
        <button onClick={onNextMonth} className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-[#EEF1FD] hover:text-[#4361EE] transition" aria-label="Next month">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 mb-2">
        {DAYS.map((d) => (
          <div key={d} className="text-center text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 py-1.5">
            {d}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 gap-y-1">
        {/* Empty cells for offset */}
        {Array.from({ length: firstDay }).map((_, i) => (
          <div key={`empty-${i}`} className="h-9" />
        ))}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = new Date(year, month, i + 1);
          day.setHours(0, 0, 0, 0);

          const isStart = isSameDay(day, range.start);
          const isEnd = isSameDay(day, range.end || hoverDate);
          const isSelected = isStart || isEnd;
          const inRange = range.start && effectiveEnd && isInRange(day, range.start, effectiveEnd);
          const isToday = isSameDay(day, today);
          const isFuture = day.getTime() > today.getTime();

          return (
            <button
              key={i}
              onClick={() => !isFuture && onDayClick(day)}
              onMouseEnter={() => onDayHover(day)}
              onMouseLeave={() => onDayHover(null)}
              disabled={isFuture}
              className={cn(
                "relative h-9 w-full text-[13px] font-medium transition-all rounded-lg",
                isFuture && "text-muted-foreground/25 cursor-not-allowed",
                !isFuture && !isSelected && !inRange && "text-foreground hover:bg-[#EEF1FD] hover:text-[#4361EE]",
                inRange && !isSelected && "bg-[#EEF1FD] text-[#4361EE]",
                isSelected && "bg-[#4361EE] text-white shadow-sm font-bold",
                isToday && !isSelected && "ring-2 ring-inset ring-[#4361EE]/30 font-bold"
              )}
            >
              {i + 1}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ── Main DateRangePicker ── */
export function DateRangePicker({ open, onClose, onApply, initialRange }: DateRangePickerProps) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [range, setRange] = React.useState<DateRange>(initialRange || { start: null, end: null });
  const [year, setYear] = React.useState(today.getFullYear());
  const [month, setMonth] = React.useState(today.getMonth());
  const [hoverDate, setHoverDate] = React.useState<Date | null>(null);
  const [showSelector, setShowSelector] = React.useState(false);
  const [selectingStart, setSelectingStart] = React.useState(true);
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => { setMounted(true); }, []);

  // Sync with initialRange when opening
  React.useEffect(() => {
    if (open) {
      setRange(initialRange || { start: null, end: null });
      setYear(initialRange?.start?.getFullYear() ?? today.getFullYear());
      setMonth(initialRange?.start?.getMonth() ?? today.getMonth());
      setShowSelector(false);
      setSelectingStart(true);
    }
  }, [open]);

  const handleDayClick = (day: Date) => {
    if (selectingStart) {
      setRange({ start: day, end: null });
      setSelectingStart(false);
    } else {
      if (range.start && day.getTime() < range.start.getTime()) {
        setRange({ start: day, end: null });
        setSelectingStart(false);
      } else {
        setRange({ start: range.start, end: day });
        setSelectingStart(true);
      }
    }
  };

  const handlePrevMonth = () => {
    if (month === 0) { setMonth(11); setYear((y) => y - 1); }
    else setMonth((m) => m - 1);
  };

  const handleNextMonth = () => {
    if (month === 11) { setMonth(0); setYear((y) => y + 1); }
    else setMonth((m) => m + 1);
  };

  const handleApply = () => {
    if (range.start && range.end) {
      onApply(range);
      onClose();
    }
  };

  const handleReset = () => {
    setRange({ start: null, end: null });
    setSelectingStart(true);
    setYear(today.getFullYear());
    setMonth(today.getMonth());
  };

  if (!open || !mounted) return null;

  const content = (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/30 backdrop-blur-[3px]"
            onClick={onClose}
          />

          {/* Modal panel */}
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 350 }}
            className="relative z-10 w-[360px] max-w-[92vw] overflow-hidden rounded-2xl border border-border bg-white shadow-[0_24px_80px_-12px_rgba(67,97,238,0.3),0_12px_36px_-8px_rgba(0,0,0,0.15)] dark:bg-zinc-900"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border bg-[#FAFBFF] px-5 py-4 dark:bg-zinc-800/50">
              <div className="flex items-center gap-3">
                <div className="grid h-9 w-9 place-items-center rounded-xl bg-[#4361EE]/10 text-[#4361EE]">
                  <CalendarDays className="h-4.5 w-4.5" />
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Custom Range</p>
                  <p className="mt-0.5 text-[13px] font-bold text-foreground">
                    {formatDate(range.start)} — {formatDate(range.end)}
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-rose-50 hover:text-rose-600 transition"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Selection hint */}
            <div className="px-5 pt-3 flex items-center gap-2">
              <span className={cn(
                "inline-block h-2 w-2 rounded-full",
                selectingStart ? "bg-[#4361EE] animate-pulse" : "bg-emerald-500 animate-pulse"
              )} />
              <p className="text-[12px] font-medium text-muted-foreground">
                {selectingStart ? "Pick a start date" : "Now pick an end date"}
              </p>
            </div>

            {/* Calendar body */}
            <div className="min-h-[320px]">
              {showSelector ? (
                <MonthYearSelector
                  year={year}
                  month={month}
                  onSelect={(y, m) => { setYear(y); setMonth(m); }}
                  onClose={() => setShowSelector(false)}
                />
              ) : (
                <CalendarGrid
                  year={year}
                  month={month}
                  range={range}
                  hoverDate={!selectingStart ? hoverDate : null}
                  onDayClick={handleDayClick}
                  onDayHover={setHoverDate}
                  onMonthYearClick={() => setShowSelector(true)}
                  onPrevMonth={handlePrevMonth}
                  onNextMonth={handleNextMonth}
                />
              )}
            </div>

            {/* Footer buttons */}
            <div className="flex items-center justify-between border-t border-border bg-[#FAFBFF] px-5 py-4 dark:bg-zinc-800/50">
              <button
                onClick={handleReset}
                className="rounded-lg px-3 py-2 text-[12px] font-medium text-rose-600 hover:bg-rose-50 transition"
              >
                Reset
              </button>
              <div className="flex items-center gap-2.5">
                <button
                  onClick={onClose}
                  className="rounded-lg border border-border px-4 py-2 text-[12px] font-medium text-muted-foreground hover:bg-muted transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleApply}
                  disabled={!range.start || !range.end}
                  className={cn(
                    "rounded-lg px-5 py-2 text-[12px] font-semibold shadow-sm transition",
                    range.start && range.end
                      ? "bg-[#4361EE] text-white hover:bg-[#3A56D4] shadow-[0_2px_8px_-2px_rgba(67,97,238,0.4)]"
                      : "bg-zinc-100 text-zinc-400 cursor-not-allowed dark:bg-zinc-800 dark:text-zinc-600"
                  )}
                >
                  Apply
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );

  // Render via portal to ensure it's above everything and not affected by parent transforms/overflow
  return createPortal(content, document.body);
}
