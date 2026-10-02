"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — SHARED EMPTY-CELL DASH
   ────────────────────────────────────────────────────────────────────────
   The canonical "this cell has no value" placeholder for any table / detail
   cell. An empty cell shows a single em-dash (—) that is CENTERED within the
   cell, so columns of empty values read as a tidy vertical run of dashes
   rather than dashes hugging the left edge.

   Use this anywhere a bare `—` placeholder was previously inlined (e.g.
   `<span className="text-zinc-400">—</span>` or `{value || "—"}`), so the
   empty state looks the same across the whole app.

   NOTE: a muted zero (0 / ₹0) is VALID data and must NOT use this — only an
   actually-absent value shows the dash (per the design-system "zero values are
   valid" rule).
   ────────────────────────────────────────────────────────────────────────── */

import { cn } from "@/lib/utils";

export function EmptyDash({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("block w-full text-center text-[13px] text-zinc-400", className)}
    >
      —
    </span>
  );
}
