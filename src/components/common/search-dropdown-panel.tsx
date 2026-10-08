"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — shared Search-Dropdown panel (close-× by default).

   The canonical wrapper for a BIG, open-floating searchable combobox / tag
   picker dropdown — the kind that lists many scrollable options under a
   search input (Issue / Service picker, and any future type-to-search +
   long-list dropdown). It renders the standard floating panel frame AND a
   mandatory, always-visible close (×) control so the user has an obvious
   manual way to dismiss the list — not only an outside-click.

   This is the DEFAULT for RepairOX searchable dropdowns. Reuse it rather than
   hand-rolling an `absolute … bg-card … overflow-y-auto` panel without a ×.

   Rules it encodes (see docs/REPAIROX-DESIGN-SYSTEM.md §3j):
   • A compact header row pinned at the top of the panel with an optional label
     and a REQUIRED close (×) button (aria-label, keyboard reachable).
   • The option list scrolls below the header (the header stays visible).
   • `onClose` dismisses the dropdown; the caller still keeps outside-click /
     Escape handling for parity.
   ────────────────────────────────────────────────────────────────────────── */

import { forwardRef } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export const SearchDropdownPanel = forwardRef<HTMLDivElement, {
  /** Dismiss the dropdown. Rendered as the mandatory close (×). */
  onClose: () => void;
  /** Optional small header label (e.g. "Issues", "Results"). */
  label?: React.ReactNode;
  children: React.ReactNode;
  /** Extra classes on the panel frame. */
  className?: string;
  /** Extra classes on the scrollable list region. */
  listClassName?: string;
  /** Max height of the scrollable list region (CSS length). */
  maxListHeight?: string;
}>(function SearchDropdownPanel({
  onClose,
  label,
  children,
  className,
  listClassName,
  maxListHeight = "15rem",
}, ref) {
  return (
    <div
      ref={ref}
      className={cn(
        "absolute left-0 top-full z-50 mt-1.5 w-full overflow-hidden rounded-xl border border-border bg-card shadow-xl ring-1 ring-black/[0.03]",
        className,
      )}
    >
      {/* Close header — always visible, pinned above the scrollable list */}
      <div className="flex items-center justify-between gap-2 border-b border-border/70 bg-muted/30 px-2.5 py-1.5">
        <span className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={onClose}
          className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground"
          aria-label="Close dropdown"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div
        className={cn("overflow-y-auto p-1.5", listClassName)}
        style={{ maxHeight: maxListHeight }}
      >
        {children}
      </div>
    </div>
  );
});
