"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { STATUS_LABEL, STATUS_TONE, type TicketStatus } from "@/lib/mock-data";

/**
 * Editable status dropdown that renders each option as the SAME coloured status
 * pill used across Tickets. It reuses the shared `STATUS_LABEL` / `STATUS_TONE`
 * maps — there is intentionally NO second colour system here.
 *
 * The trigger shows the currently selected status as a coloured pill, and each
 * option in the menu is rendered as its corresponding coloured pill so users can
 * identify statuses at a glance.
 */

/** The canonical order of statuses shown in the dropdown. */
export const TICKET_STATUS_ORDER: TicketStatus[] = [
  "in_progress",
  "repaired",
  "repaired_collected",
  "return",
  "return_collected",
  "waiting_parts",
  "waiting_approval",
];

export function StatusPill({ status, className }: { status: TicketStatus; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ring-inset",
        STATUS_TONE[status],
        className
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {STATUS_LABEL[status]}
    </span>
  );
}

/**
 * Inline representation of a status for use inside an input-styled trigger:
 * a coloured dot + coloured label, WITHOUT the pill's background/ring so it
 * doesn't read as a box-inside-a-box. Colour is reused from STATUS_TONE (same
 * colour system) by pulling only its text-colour classes.
 */
export function StatusDot({ status }: { status: TicketStatus }) {
  const textTone = STATUS_TONE[status]
    .split(" ")
    .filter((c) => c.startsWith("text-"))
    .join(" ");
  return (
    <span className={cn("inline-flex items-center gap-2 text-sm font-medium", textTone)}>
      <span className="h-2 w-2 rounded-full bg-current" />
      {STATUS_LABEL[status]}
    </span>
  );
}

export function StatusPillSelect({
  value,
  onChange,
  disabled,
  className,
}: {
  value: TicketStatus;
  onChange: (value: TicketStatus) => void;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((o) => !o)}
        className={cn(
          "flex h-11 w-full items-center justify-between gap-2 rounded-xl border bg-card px-3.5 text-sm transition-all duration-150",
          open ? "border-[#4361EE] ring-2 ring-[#4361EE]/15" : "border-border hover:border-[#4361EE]/40",
          disabled && "cursor-not-allowed opacity-50 hover:border-border",
          className
        )}
      >
        <StatusDot status={value} />
        <span
          className={cn(
            "text-muted-foreground transition-transform duration-200",
            open && "rotate-180"
          )}
        >
          ▾
        </span>
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 max-h-72 w-full min-w-[220px] overflow-y-auto rounded-xl border border-border bg-card p-1 shadow-lg">
          {TICKET_STATUS_ORDER.map((s) => {
            const isSelected = s === value;
            return (
              <button
                key={s}
                type="button"
                onClick={() => {
                  onChange(s);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors",
                  isSelected ? "bg-[#EEF1FD]/70" : "hover:bg-[#EEF1FD]/60"
                )}
              >
                <span className={cn("text-[#4361EE]", isSelected ? "opacity-100" : "opacity-0")}>✓</span>
                <StatusPill status={s} />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
