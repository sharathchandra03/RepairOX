"use client";

/* ──────────────────────────────────────────────────────────────────────────
   TimePicker — shared time-selection control with an explicit OK button.

   Replaces the native `<input type="time">` (whose browser-rendered wheel has
   no in-app confirm) with a RepairOX-styled popover: scrollable Hour + Minute
   columns and stacked AM / PM buttons, committed by a clear "OK" button so the
   user explicitly confirms the selection (nothing applies until OK).

   Contract mirrors the native input so it can be dropped in place:
     • value    — "HH:mm" 24-hour string ("" when unset).
     • onChange — called with the new "HH:mm" 24-hour string when the user
                  presses OK (never on every scroll/click — commit-on-OK).
     • disabled — greys out and blocks opening.

   The picker is portalled to <body> and positioned under (or above) the
   trigger, matching the DueDate popover pattern (framer-motion + click-away).
   ────────────────────────────────────────────────────────────────────────── */

import * as React from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Clock, Check } from "lucide-react";
import { cn } from "@/lib/utils";

/* ── 24h "HH:mm" ⇄ {hour12, minute, ampm} helpers ── */
function parse(value?: string): { h12: number; minute: number; ampm: "AM" | "PM" } {
  if (value && /^\d{1,2}:\d{2}$/.test(value)) {
    const [hStr, mStr] = value.split(":");
    const h24 = Math.min(23, Math.max(0, Number(hStr)));
    const minute = Math.min(59, Math.max(0, Number(mStr)));
    const ampm: "AM" | "PM" = h24 >= 12 ? "PM" : "AM";
    const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
    return { h12, minute, ampm };
  }
  // Default: 9:00 AM (a sensible business-hours default).
  return { h12: 9, minute: 0, ampm: "AM" };
}

function to24(h12: number, minute: number, ampm: "AM" | "PM"): string {
  let h = h12 % 12;
  if (ampm === "PM") h += 12;
  return `${String(h).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/** Display label for the trigger, e.g. "04:54 PM". Empty → placeholder. */
function label(value?: string): string {
  if (!value || !/^\d{1,2}:\d{2}$/.test(value)) return "";
  const { h12, minute, ampm } = parse(value);
  return `${String(h12).padStart(2, "0")}:${String(minute).padStart(2, "0")} ${ampm}`;
}

const HOURS = Array.from({ length: 12 }, (_, i) => i + 1); // 1..12
const MINUTES = Array.from({ length: 60 }, (_, i) => i); // 0..59

function Popover({
  anchorRect,
  value,
  onClose,
  onCommit,
}: {
  anchorRect: DOMRect;
  value?: string;
  onClose: () => void;
  onCommit: (next: string) => void;
}) {
  const init = parse(value);
  const [h12, setH12] = React.useState(init.h12);
  const [minute, setMinute] = React.useState(init.minute);
  const [ampm, setAmPm] = React.useState<"AM" | "PM">(init.ampm);

  const hourRef = React.useRef<HTMLDivElement>(null);
  const minRef = React.useRef<HTMLDivElement>(null);

  // Scroll the selected hour/minute into view when the popover mounts.
  React.useEffect(() => {
    hourRef.current?.querySelector<HTMLElement>('[data-selected="true"]')?.scrollIntoView({ block: "center" });
    minRef.current?.querySelector<HTMLElement>('[data-selected="true"]')?.scrollIntoView({ block: "center" });
  }, []);

  // Position under the trigger, flipping above when there isn't room. Clamp to viewport.
  const POPOVER_W = 236;
  const EST_H = 300;
  const spaceBelow = window.innerHeight - anchorRect.bottom;
  const openUp = spaceBelow < EST_H && anchorRect.top > EST_H;
  const top = openUp ? Math.max(8, anchorRect.top - EST_H - 6) : anchorRect.bottom + 6;
  let left = anchorRect.left;
  if (left + POPOVER_W > window.innerWidth - 8) left = window.innerWidth - POPOVER_W - 8;
  if (left < 8) left = 8;

  const colBtn = "w-full rounded-lg px-2 py-1.5 text-center text-[13px] font-medium transition select-none";

  return (
    <>
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
        aria-label="Select time"
      >
        {/* Three columns: Hour | Minute | AM-PM */}
        <div className="flex gap-1 p-2">
          <div ref={hourRef} className="max-h-[220px] flex-1 overflow-y-auto [scrollbar-width:thin]">
            {HOURS.map((h) => {
              const sel = h === h12;
              return (
                <button
                  key={h}
                  type="button"
                  data-selected={sel}
                  onClick={() => setH12(h)}
                  className={cn(colBtn, sel ? "bg-[#4361EE] text-white" : "text-foreground hover:bg-[#EEF1FD]")}
                >
                  {String(h).padStart(2, "0")}
                </button>
              );
            })}
          </div>
          <div ref={minRef} className="max-h-[220px] flex-1 overflow-y-auto [scrollbar-width:thin]">
            {MINUTES.map((m) => {
              const sel = m === minute;
              return (
                <button
                  key={m}
                  type="button"
                  data-selected={sel}
                  onClick={() => setMinute(m)}
                  className={cn(colBtn, sel ? "bg-[#4361EE] text-white" : "text-foreground hover:bg-[#EEF1FD]")}
                >
                  {String(m).padStart(2, "0")}
                </button>
              );
            })}
          </div>
          <div className="flex w-14 shrink-0 flex-col gap-1">
            {(["AM", "PM"] as const).map((ap) => {
              const sel = ap === ampm;
              return (
                <button
                  key={ap}
                  type="button"
                  onClick={() => setAmPm(ap)}
                  className={cn(
                    "rounded-lg py-1.5 text-[13px] font-bold transition",
                    sel ? "bg-[#4361EE] text-white" : "text-foreground hover:bg-[#EEF1FD]"
                  )}
                >
                  {ap}
                </button>
              );
            })}
          </div>
        </div>

        {/* OK footer — nothing is committed until the user confirms here. */}
        <div className="flex items-center justify-end gap-2 border-t border-border/60 px-3 py-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-[12px] font-semibold text-muted-foreground transition hover:bg-muted"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => { onCommit(to24(h12, minute, ampm)); onClose(); }}
            className="inline-flex items-center gap-1 rounded-lg bg-[#4361EE] px-4 py-1.5 text-[12px] font-semibold text-white shadow-sm transition hover:bg-[#3651D4]"
          >
            <Check className="h-3.5 w-3.5" /> OK
          </button>
        </div>
      </motion.div>
    </>
  );
}

export function TimePicker({
  value,
  onChange,
  disabled,
  placeholder = "Select time",
  className,
}: {
  /** 24-hour "HH:mm" string; "" when unset. */
  value?: string;
  /** Called with the new "HH:mm" string when the user presses OK. */
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [anchorRect, setAnchorRect] = React.useState<DOMRect | null>(null);
  const [mounted, setMounted] = React.useState(false);
  const btnRef = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => { setMounted(true); }, []);

  const openPopover = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (disabled) return;
    if (btnRef.current) setAnchorRect(btnRef.current.getBoundingClientRect());
    setOpen(true);
  };

  const shown = label(value);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        disabled={disabled}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={openPopover}
        className={cn(
          "flex h-[34px] w-full items-center justify-between gap-2 rounded-xl border border-input bg-card px-3 text-[13px] transition-all duration-150",
          "hover:border-[#4361EE]/40 focus:border-[#4361EE] focus:outline-none focus:ring-2 focus:ring-[#4361EE]/15",
          disabled && "cursor-not-allowed opacity-50 hover:border-input",
          className
        )}
        aria-label="Select time"
      >
        <span className={cn(shown ? "text-foreground" : "text-muted-foreground")}>{shown || placeholder}</span>
        <Clock className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>

      {mounted && anchorRect && createPortal(
        <AnimatePresence>
          {open && (
            <Popover
              anchorRect={anchorRect}
              value={value}
              onClose={() => setOpen(false)}
              onCommit={onChange}
            />
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}
